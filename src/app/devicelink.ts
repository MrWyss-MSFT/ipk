/**
 * Decoder/exporter for Windows Autopilot Device Preparation "DeviceLink" QR
 * codes and `.devicelink.csv` bulk-import files - the `deviceLink:/1/?sn=...
 * &data=...` codes shown during device provisioning (scanned with a second
 * device to link it to the enrolling account), and the CSV file Windows
 * itself writes for bulk-importing those links elsewhere.
 *
 * Shared between the QR Code Scanner tool (scans the QR code directly) and
 * the Autopilot DeviceLink Decoder tool (pastes/uploads the QR text or CSV
 * content instead) - the format is identical either way.
 *
 * This format isn't publicly documented by Microsoft. It was reverse
 * engineered from real scanned QR payloads and real `.devicelink.csv`
 * bulk-import files (compared byte-for-byte), so field names/behavior here
 * are best-effort, not sourced from official docs.
 *
 * The QR code's `data` param is URL-encoded, base64, gzip-compressed JSON
 * using abbreviated keys. The CSV bulk-import files Windows itself writes
 * embed a different, *expanded* JSON schema (full key names, dashed GUIDs,
 * ISO 8601 timestamps) as plain base64 (no gzip) in a `Data` column -
 * `buildDeviceLinkCsvText()` reproduces that schema and byte format so the
 * output can be re-imported the same way.
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
  /** The decoded JSON payload (whichever schema it came from), pretty-printed, for reference/copy. */
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

interface FullSchemaDeviceLinkKey {
  KeyName: string;
  KeyId: string;
  KeyType: number;
  KeyPub?: string;
}

interface FullSchemaDeviceLink {
  Version: string;
  DeviceLinkCreationTimeUtc: string;
  DeviceInfo: {
    DeviceIdKeyList: FullSchemaDeviceLinkKey[];
    Manufacturer: string;
    ModelName: string;
    SerialNumber: string;
    SmbiosUuid: string;
    LinkId: string;
    LinkIdCreationTimeUtc: string;
  };
  DeviceLinkKeyData: {
    DeviceInfoSigningAlgorithm: string;
    DeviceInfoSigningKeyName: string;
    DeviceInfoSignature: string;
    DeviceInfoSignaturePssHashSchemeAlgorithm: string;
    DeviceInfoSignaturePssSaltLength: number;
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

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function gunzipBase64(base64: string): Promise<string> {
  const bytes = base64ToBytes(base64);
  const decompressed = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  const buffer = await new Response(decompressed).arrayBuffer();
  return new TextDecoder("utf-8").decode(buffer);
}

function fromCompactSchema(compact: CompactDeviceLink): DeviceLinkInfo {
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
  return fromCompactSchema(JSON.parse(json) as CompactDeviceLink);
}

function fromFullSchema(full: FullSchemaDeviceLink): DeviceLinkInfo {
  return {
    version: full.Version,
    deviceLinkCreationTimeUtc: full.DeviceLinkCreationTimeUtc,
    serialNumber: full.DeviceInfo.SerialNumber,
    manufacturer: full.DeviceInfo.Manufacturer,
    modelName: full.DeviceInfo.ModelName,
    smbiosUuid: full.DeviceInfo.SmbiosUuid,
    linkId: full.DeviceInfo.LinkId,
    linkIdCreationTimeUtc: full.DeviceInfo.LinkIdCreationTimeUtc,
    keys: full.DeviceInfo.DeviceIdKeyList.map((k) => ({
      keyName: k.KeyName,
      keyId: k.KeyId,
      keyType: k.KeyType,
      keyPub: k.KeyPub,
    })),
    signingAlgorithm: full.DeviceLinkKeyData.DeviceInfoSigningAlgorithm,
    signingKeyName: full.DeviceLinkKeyData.DeviceInfoSigningKeyName,
    signature: full.DeviceLinkKeyData.DeviceInfoSignature,
    signaturePssHashAlgorithm: full.DeviceLinkKeyData.DeviceInfoSignaturePssHashSchemeAlgorithm,
    signaturePssSaltLength: full.DeviceLinkKeyData.DeviceInfoSignaturePssSaltLength,
    rawJson: JSON.stringify(full, null, 2),
  };
}

/** Decodes a `.devicelink.csv` `Data` column value (plain base64, no gzip, full/expanded JSON schema). */
export function decodeDeviceLinkCsvDataColumn(base64: string): DeviceLinkInfo {
  const json = new TextDecoder("utf-8").decode(base64ToBytes(base64));
  return fromFullSchema(JSON.parse(json) as FullSchemaDeviceLink);
}

/** Splits one CSV line into fields, honoring RFC 4180 double-quote escaping (`""` -> `"`). */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      fields.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
}

export interface DeviceLinkCsvRowError {
  line: number;
  message: string;
}

export interface DeviceLinkCsvParseResult {
  records: DeviceLinkInfo[];
  errors: DeviceLinkCsvRowError[];
}

/**
 * Parses the text content of a `.devicelink.csv` bulk-import file (one or
 * more `SerialNumber,Manufacturer,Model,Data` rows, with or without the
 * header row) into decoded records. Rows that fail to decode are reported
 * as errors rather than thrown, so the rest of the file can still be shown.
 */
export function parseDeviceLinkCsvText(text: string): DeviceLinkCsvParseResult {
  const cleaned = text.replace(/^\uFEFF/, "").trim();
  const lines = cleaned.split(/\r\n|\n/).filter((line) => line.length > 0);
  const records: DeviceLinkInfo[] = [];
  const errors: DeviceLinkCsvRowError[] = [];
  if (lines.length === 0) {
    errors.push({ line: 0, message: "No CSV content found." });
    return { records, errors };
  }

  const startIndex = /^SerialNumber,Manufacturer,Model,Data/i.test(lines[0]) ? 1 : 0;
  for (let i = startIndex; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);
    const data = fields[3];
    if (fields.length < 4 || !data) {
      errors.push({ line: i + 1, message: "Expected 4 columns: SerialNumber,Manufacturer,Model,Data." });
      continue;
    }
    try {
      records.push(decodeDeviceLinkCsvDataColumn(data));
    } catch (err) {
      errors.push({ line: i + 1, message: `Could not decode Data column: ${err instanceof Error ? err.message : String(err)}` });
    }
  }
  return { records, errors };
}

/**
 * Decodes raw file bytes to text, sniffing a UTF-16LE/BE or UTF-8 byte-order
 * mark first (Windows writes `.devicelink.csv` as UTF-16LE with BOM) and
 * falling back to plain UTF-8 if no BOM is present.
 */
export function decodeTextFileBytes(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(buffer.slice(2));
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(buffer.slice(2));
  }
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder("utf-8").decode(buffer.slice(3));
  }
  return new TextDecoder("utf-8").decode(buffer);
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
  return bytesToBase64(new TextEncoder().encode(JSON.stringify(full)));
}

/** Builds one CSV data row (`SerialNumber,Manufacturer,Model,Data`) for a decoded record, without a header. */
function buildDeviceLinkCsvRow(info: DeviceLinkInfo): string {
  const data = buildFullSchemaBase64(info);
  return [info.serialNumber, info.manufacturer, info.modelName, data].map(csvEscape).join(",");
}

/** Builds the CSV text matching Windows' `SerialNumber,Manufacturer,Model,Data` bulk-import format (one row, no trailing newline). */
export function buildDeviceLinkCsvText(info: DeviceLinkInfo): string {
  return `SerialNumber,Manufacturer,Model,Data\r\n${buildDeviceLinkCsvRow(info)}`;
}

/** Builds a multi-row CSV (one header, one row per record) for bulk re-export, matching Windows' format. */
export function buildDeviceLinkCsvTextMulti(infos: DeviceLinkInfo[]): string {
  return `SerialNumber,Manufacturer,Model,Data\r\n${infos.map(buildDeviceLinkCsvRow).join("\r\n")}`;
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
