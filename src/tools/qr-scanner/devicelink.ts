/**
 * Decoder/exporter for Windows Autopilot Device Preparation "DeviceLink" QR
 * codes - the `deviceLink:/1/?sn=...&data=...` codes shown during device
 * provisioning (scanned with a second device to link it to the enrolling
 * account).
 *
 * This format isn't publicly documented by Microsoft. It was reverse
 * engineered from real scanned QR payloads and real `.devicelink.csv`
 * bulk-import files (compared byte-for-byte), so field names/behavior here
 * are best-effort, not sourced from official docs.
 *
 * `data` is URL-encoded, base64, gzip-compressed JSON using abbreviated
 * keys. The CSV bulk-import files Windows itself writes embed a different,
 * *expanded* JSON schema (full key names, dashed GUIDs, ISO 8601 timestamps)
 * as plain base64 (no gzip) - `buildDeviceLinkCsvText()` reproduces that
 * schema and byte format so the output can be re-imported the same way.
 */

export interface DeviceLinkKey {
  keyName: string;
  keyId: string;
  keyType: number;
  keyPub?: string;
}

export interface DeviceLinkInfo {
  version: string;
  deviceLinkCreationTimeUtc: string;
  serialNumber: string;
  manufacturer: string;
  modelName: string;
  smbiosUuid: string;
  linkId: string;
  linkIdCreationTimeUtc: string;
  keys: DeviceLinkKey[];
  signingAlgorithm: string;
  signingKeyName: string;
  signature: string;
  signaturePssHashAlgorithm: string;
  signaturePssSaltLength: number;
  /** The decoded compact JSON payload, pretty-printed, for reference/copy. */
  rawJson: string;
}

interface CompactDeviceLinkKey {
  kn: string;
  id: string;
  kt: number;
  kp?: string;
}

interface CompactDeviceLink {
  ver: string;
  dlict: string;
  di: {
    kl: CompactDeviceLinkKey[];
    man: string;
    mod: string;
    sn: string;
    sbu: string;
    li: string;
    lict: string;
  };
  dlkd: {
    sa: string;
    skn: string;
    sig: string;
    pssAlg: string;
    pssSaltCb: number;
  };
}

/** Matches the `deviceLink:/<version>/?...` scheme used by Autopilot Device Preparation. */
export function isDeviceLinkPayload(raw: string): boolean {
  return /^devicelink:\/\d+\/\?/i.test(raw.trim());
}

/** Extracts the `sn` (serial number) and `data` query parameters from a DeviceLink payload. */
export function parseDeviceLinkUrl(raw: string): { serialNumber: string; data: string } | null {
  try {
    const url = new URL(raw.trim());
    const data = url.searchParams.get("data");
    if (!data) return null;
    return { serialNumber: url.searchParams.get("sn") ?? "", data };
  } catch {
    return null;
  }
}

/** Inserts dashes into a 32-hex-char GUID to match the standard 8-4-4-4-12 format. */
function addDashes(hex: string): string {
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Converts Unix epoch seconds (as used in the compact schema) to an ISO 8601 UTC string without milliseconds. */
function epochSecondsToIso(seconds: string): string {
  const date = new Date(Number(seconds) * 1000);
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

async function gunzipBase64(base64: string): Promise<string> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const decompressed = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  const buffer = await new Response(decompressed).arrayBuffer();
  return new TextDecoder("utf-8").decode(buffer);
}

/**
 * Decodes a DeviceLink `data` query parameter value (URL-encoded, base64,
 * gzip-compressed JSON) into a structured, human-readable record.
 *
 * Requires `DecompressionStream` (supported in modern Chrome/Edge/Firefox/Safari).
 */
export async function decodeDeviceLinkData(dataParam: string): Promise<DeviceLinkInfo> {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("This browser doesn't support decompressing gzip data (DecompressionStream is unavailable).");
  }
  const decoded = decodeURIComponent(dataParam);
  const json = await gunzipBase64(decoded);
  const compact = JSON.parse(json) as CompactDeviceLink;

  return {
    version: compact.ver,
    deviceLinkCreationTimeUtc: epochSecondsToIso(compact.dlict),
    serialNumber: compact.di.sn,
    manufacturer: compact.di.man,
    modelName: compact.di.mod,
    smbiosUuid: addDashes(compact.di.sbu),
    linkId: addDashes(compact.di.li),
    linkIdCreationTimeUtc: epochSecondsToIso(compact.di.lict),
    keys: compact.di.kl.map((k) => ({
      keyName: k.kn,
      keyId: addDashes(k.id),
      keyType: k.kt,
      keyPub: k.kp,
    })),
    signingAlgorithm: compact.dlkd.sa,
    signingKeyName: compact.dlkd.skn,
    signature: compact.dlkd.sig,
    signaturePssHashAlgorithm: compact.dlkd.pssAlg,
    signaturePssSaltLength: compact.dlkd.pssSaltCb,
    rawJson: JSON.stringify(compact, null, 2),
  };
}

function csvEscape(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * Rebuilds the full/expanded JSON schema Windows embeds in its own
 * `.devicelink.csv` bulk-import files and base64-encodes it the same way
 * (plain base64 of the UTF-8 JSON text, no gzip).
 *
 * Note: the QR code doesn't include the endorsement key's public key
 * (`EK_*`'s `KeyPub`) to save space, so it's omitted here too rather than
 * fabricated - Windows' own export includes it because it already has the
 * full attestation data locally when it writes the CSV.
 */
function buildFullSchemaBase64(info: DeviceLinkInfo): string {
  const full = {
    Version: info.version,
    DeviceLinkCreationTimeUtc: info.deviceLinkCreationTimeUtc,
    DeviceInfo: {
      DeviceIdKeyList: info.keys.map((k) => {
        const entry: Record<string, unknown> = { KeyName: k.keyName, KeyId: k.keyId, KeyType: k.keyType };
        if (k.keyPub) entry.KeyPub = k.keyPub;
        return entry;
      }),
      Manufacturer: info.manufacturer,
      ModelName: info.modelName,
      SerialNumber: info.serialNumber,
      SmbiosUuid: info.smbiosUuid,
      LinkId: info.linkId,
      LinkIdCreationTimeUtc: info.linkIdCreationTimeUtc,
    },
    DeviceLinkKeyData: {
      DeviceInfoSigningAlgorithm: info.signingAlgorithm,
      DeviceInfoSigningKeyName: info.signingKeyName,
      DeviceInfoSignature: info.signature,
      DeviceInfoSignaturePssHashSchemeAlgorithm: info.signaturePssHashAlgorithm,
      DeviceInfoSignaturePssSaltLength: info.signaturePssSaltLength,
    },
  };
  const bytes = new TextEncoder().encode(JSON.stringify(full));
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

/** Builds the CSV text matching Windows' `SerialNumber,Manufacturer,Model,Data` bulk-import format (one row, no trailing newline). */
export function buildDeviceLinkCsvText(info: DeviceLinkInfo): string {
  const data = buildFullSchemaBase64(info);
  const row = [info.serialNumber, info.manufacturer, info.modelName, data].map(csvEscape).join(",");
  return `SerialNumber,Manufacturer,Model,Data\r\n${row}`;
}

/** Encodes text as UTF-16LE with a byte-order mark, matching the exact byte format of Windows' own `.devicelink.csv` exports. */
export function encodeUtf16LeWithBom(text: string) {
  const bytes = new Uint8Array(2 + text.length * 2);
  bytes[0] = 0xff;
  bytes[1] = 0xfe;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    bytes[2 + i * 2] = code & 0xff;
    bytes[2 + i * 2 + 1] = (code >> 8) & 0xff;
  }
  return bytes;
}

export function deviceLinkCsvFilename(info: DeviceLinkInfo): string {
  return `${info.serialNumber || "device"}.devicelink.csv`;
}
