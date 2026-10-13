import { DHCP_MESSAGE_TYPES, DHCP_OPTIONS, DHCP_VENDOR_SPECIFIC_OPTIONS, type DhcpOptionMeta } from "./data";

export interface ParsedDhcpOption {
  code: number;
  vendorSpecific: boolean;
  meta: DhcpOptionMeta;
  bytes: number[];
  decoded: string;
  hex: string;
}

/**
 * Normalizes pasted hex (PowerShell `ToString("X2")` output, `Format-Hex`
 * dumps, comma/space separated bytes, "0x" prefixes, ...) down to a plain
 * byte array.
 */
export function hexToBytes(input: string): number[] {
  // Strip "--- Adapter Name ---" header lines (from the PowerShell snippet's multi-adapter
  // output) before stripping non-hex characters - otherwise letters like the "a"/"d"/"e" in
  // an adapter's description would get swallowed in as bogus hex digits.
  const withoutHeaders = input.replace(/^\s*-{2,}.*-{2,}\s*$/gm, "");
  const cleaned = withoutHeaders.replace(/0x/gi, "").replace(/[^0-9a-f]/gi, "");
  if (cleaned.length === 0) return [];
  const bytes: number[] = [];
  const len = cleaned.length - (cleaned.length % 2);
  for (let i = 0; i < len; i += 2) {
    bytes.push(parseInt(cleaned.slice(i, i + 2), 16));
  }
  return bytes;
}

function formatHex(bytes: number[]): string {
  return bytes.map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join(" ");
}

/**
 * Decodes option 81 (Client FQDN, RFC 4702): 1 flags byte, 2 deprecated
 * RCODE bytes, then the domain name - either plain ASCII with dots, or (if
 * the flags' "E" bit is set) canonical DNS wire format (length-prefixed
 * labels), which this also unpacks into dotted form.
 */
function decodeFqdn(bytes: number[]): string {
  if (bytes.length < 3) return formatHex(bytes);
  const flags = bytes[0];
  const nameBytes = bytes.slice(3);
  const isBinaryEncoded = (flags & 0x04) !== 0;

  let name: string;
  if (isBinaryEncoded) {
    const labels: string[] = [];
    let i = 0;
    while (i < nameBytes.length) {
      const labelLength = nameBytes[i];
      if (labelLength === 0) break;
      i += 1;
      labels.push(new TextDecoder("utf-8", { fatal: false }).decode(new Uint8Array(nameBytes.slice(i, i + labelLength))));
      i += labelLength;
    }
    name = labels.join(".");
  } else {
    name = new TextDecoder("utf-8", { fatal: false }).decode(new Uint8Array(nameBytes)).replace(/\0/g, "");
  }

  return name || formatHex(bytes);
}

/**
 * Formats a seconds count (e.g. lease/T1/T2 time) as a compact human-readable
 * duration ("1d 3h" ...). Returns "" for under a minute, since "30 seconds
 * (30s)" wouldn't add anything over the raw value already shown.
 */
function humanizeSeconds(totalSeconds: number): string {
  if (totalSeconds < 60) return "";
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts: string[] = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (seconds) parts.push(`${seconds}s`);
  return parts.join(" ");
}

function decodeValue(bytes: number[], meta: DhcpOptionMeta): string {
  if (bytes.length === 0) return "";
  switch (meta.type) {
    case "ip": {
      if (bytes.length < 4) return formatHex(bytes);
      const ips: string[] = [];
      for (let i = 0; i + 4 <= bytes.length; i += 4) {
        ips.push(bytes.slice(i, i + 4).join("."));
      }
      return ips.join(", ");
    }
    case "string":
      return new TextDecoder("utf-8", { fatal: false }).decode(new Uint8Array(bytes)).replace(/\0/g, "");
    case "time": {
      if (bytes.length < 4) return formatHex(bytes);
      const seconds = ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;
      const readable = humanizeSeconds(seconds);
      return readable ? `${seconds} seconds (${readable})` : `${seconds} seconds`;
    }
    case "dhcpmsgtype":
      return `${bytes[0]} (${DHCP_MESSAGE_TYPES[bytes[0]] ?? "unknown"})`;
    case "fqdn":
      return decodeFqdn(bytes);
    default:
      return formatHex(bytes);
  }
}

/**
 * Parses the raw bytes of the Windows `DhcpInterfaceOptions` registry value
 * (HKLM\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters\Interfaces\<GUID>)
 * into a flat list of decoded DHCP options.
 *
 * Binary layout per entry (all fields little-endian, see Ingmar Verheij's
 * ReadDhcpOptions.ps1): OptionId (byte 0 of an 8-byte slot), DataLength
 * (4-byte slot), IsVendorSpecific flag (4-byte slot), unknown (4-byte slot),
 * then the value padded up to a multiple of 4 bytes.
 */
export function parseDhcpInterfaceOptions(bytes: number[]): ParsedDhcpOption[] {
  const results: ParsedDhcpOption[] = [];
  let pos = 0;
  const HEADER_SIZE = 20; // 8 (code) + 4 (length) + 4 (vendor flag) + 4 (unknown)

  while (pos + HEADER_SIZE <= bytes.length) {
    const code = bytes[pos] ?? 0;
    pos += 8;

    const length = bytes[pos] ?? 0;
    pos += 4;

    const isVendorSpecific = (bytes[pos] ?? 0) !== 0;
    pos += 4;

    pos += 4; // unknown/reserved field

    const paddedLength = length % 4 === 0 ? length : length + (4 - (length % 4));
    if (pos + paddedLength > bytes.length) break;

    const value = bytes.slice(pos, pos + length);
    pos += paddedLength;

    if (code === 0 && length === 0) continue; // padding entry

    const meta = isVendorSpecific
      ? (DHCP_VENDOR_SPECIFIC_OPTIONS[code] ?? { name: `Vendor option ${code}` })
      : (DHCP_OPTIONS[code] ?? { name: "Unknown option" });

    results.push({
      code,
      vendorSpecific: isVendorSpecific,
      meta,
      bytes: value,
      decoded: decodeValue(value, meta),
      hex: formatHex(value),
    });
  }

  return results;
}
