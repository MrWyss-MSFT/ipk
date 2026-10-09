/**
 * Conversion between an Entra ID (Azure AD) object GUID and its equivalent
 * Windows-style SID, as used for local group membership policies in Intune.
 *
 * The algorithm mirrors Microsoft's documented PowerShell snippet: a GUID's
 * 16 bytes (in .NET's on-disk byte order) are split into four 4-byte groups,
 * each read as a little-endian uint32, and joined onto a "S-1-12-<n>" prefix.
 * n is 1 for commercial/global cloud tenants, 8 for GCC-High.
 */

export type SidCloud = "commercial" | "gcc-high";

const CLOUD_PREFIX: Record<SidCloud, string> = {
  commercial: "S-1-12-1",
  "gcc-high": "S-1-12-8",
};

const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function reverseHexPairs(hex: string): string[] {
  const pairs = hex.match(/.{2}/g) ?? [];
  return pairs.reverse();
}

function hexPairs(hex: string): string[] {
  return hex.match(/.{2}/g) ?? [];
}

/** Converts a GUID string into .NET's Guid.ToByteArray() byte order. */
function guidToBytes(guid: string): Uint8Array {
  const hex = guid.trim().replace(/[{}]/g, "");
  if (!GUID_PATTERN.test(hex)) {
    throw new Error("Not a valid GUID (expected 8-4-4-4-12 hex format).");
  }
  const clean = hex.replace(/-/g, "").toLowerCase();

  const data1 = reverseHexPairs(clean.slice(0, 8));
  const data2 = reverseHexPairs(clean.slice(8, 12));
  const data3 = reverseHexPairs(clean.slice(12, 16));
  const data4 = hexPairs(clean.slice(16, 32));

  const bytes = new Uint8Array(16);
  [...data1, ...data2, ...data3, ...data4].forEach((byteHex, i) => {
    bytes[i] = parseInt(byteHex, 16);
  });
  return bytes;
}

function bytesToGuid(bytes: Uint8Array): string {
  if (bytes.length !== 16) {
    throw new Error("Expected exactly 16 bytes to build a GUID.");
  }
  const toHex = (b: number) => b.toString(16).padStart(2, "0");

  const data1 = Array.from(bytes.slice(0, 4)).reverse().map(toHex).join("");
  const data2 = Array.from(bytes.slice(4, 6)).reverse().map(toHex).join("");
  const data3 = Array.from(bytes.slice(6, 8)).reverse().map(toHex).join("");
  const data4a = Array.from(bytes.slice(8, 10)).map(toHex).join("");
  const data4b = Array.from(bytes.slice(10, 16)).map(toHex).join("");

  return `${data1}-${data2}-${data3}-${data4a}-${data4b}`;
}

function readUInt32LE(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0
  );
}

function writeUInt32LE(value: number): Uint8Array {
  const bytes = new Uint8Array(4);
  bytes[0] = value & 0xff;
  bytes[1] = (value >>> 8) & 0xff;
  bytes[2] = (value >>> 16) & 0xff;
  bytes[3] = (value >>> 24) & 0xff;
  return bytes;
}

/** Converts an Entra ID object GUID (ObjectId) into its equivalent SID. */
export function objectIdToSid(objectId: string, cloud: SidCloud): string {
  const bytes = guidToBytes(objectId);
  const parts = [0, 1, 2, 3].map((i) => readUInt32LE(bytes, i * 4));
  return `${CLOUD_PREFIX[cloud]}-${parts.join("-")}`;
}

/** Converts a SID (S-1-12-1-... or S-1-12-8-...) back into an Entra ID object GUID. */
export function sidToObjectId(sid: string): string {
  const clean = sid.trim();
  const match = clean.match(/^S-1-12-(1|8)-(\d+)-(\d+)-(\d+)-(\d+)$/i);
  if (!match) {
    throw new Error("Not a valid Entra ID SID (expected S-1-12-1-... or S-1-12-8-... with 4 numbers).");
  }

  const numbers = match.slice(2, 6).map(Number);
  for (const n of numbers) {
    if (!Number.isFinite(n) || n < 0 || n > 0xffffffff) {
      throw new Error("SID segments must each fit in an unsigned 32-bit integer.");
    }
  }

  const bytes = new Uint8Array(16);
  numbers.forEach((n, i) => bytes.set(writeUInt32LE(n), i * 4));
  return bytesToGuid(bytes);
}

/** Detects which cloud prefix a SID uses, if any. */
export function detectSidCloud(sid: string): SidCloud | undefined {
  const match = sid.trim().match(/^S-1-12-(1|8)-/i);
  if (!match) return undefined;
  return match[1] === "8" ? "gcc-high" : "commercial";
}
