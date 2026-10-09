/**
 * Conversion between the Entra ID / Azure AD device "g:" physical ID
 * (as seen in `physicalIds`, Graph, Log Analytics, e.g. `[GID]:g:1234567891234567`)
 * and the raw hex `LID` value it is derived from:
 *
 *   HKEY_USERS\.DEFAULT\Software\Microsoft\IdentityCRL\ExtendedProperties, LID (REG_SZ)
 *
 * The documented conversion (see ittips.ch "Tip #10") is a single PowerShell
 * cast: `"g:{0}" -f [Int64]"0x$LID"` — i.e. the hex LID is read as the bit
 * pattern of a 64-bit integer (two's complement when the top bit is set).
 */

const TWO_POW_64 = 1n << 64n;
const TWO_POW_63 = 1n << 63n;
const HEX_PATTERN = /^[0-9a-f]+$/i;

/** Strips an optional "0x" prefix and surrounding whitespace from a hex string. */
function normalizeHex(input: string): string {
  return input.trim().replace(/^0x/i, "");
}

/** Converts a hex `LID` value into its decimal `g:` device physical ID form. */
export function lidToGid(lidHex: string): string {
  const hex = normalizeHex(lidHex);
  if (!hex) {
    throw new Error("Enter a hex LID value.");
  }
  if (!HEX_PATTERN.test(hex)) {
    throw new Error("Not a valid hex value (0-9, a-f only).");
  }
  if (hex.length > 16) {
    throw new Error("Too long for a 64-bit value (max 16 hex digits).");
  }

  let value = BigInt("0x" + hex);
  // Only a full 16-digit (64-bit) value can have its sign bit set.
  if (hex.length === 16 && value >= TWO_POW_63) {
    value -= TWO_POW_64;
  }
  return `g:${value.toString()}`;
}

/** Converts a decimal `g:` device physical ID back into its hex `LID` value. */
export function gidToLid(gid: string): string {
  const clean = gid.trim().replace(/^g:/i, "");
  if (!clean) {
    throw new Error("Enter a g: device physical ID.");
  }
  if (!/^-?\d+$/.test(clean)) {
    throw new Error("Not a valid decimal number.");
  }

  let value = BigInt(clean);
  if (value < -TWO_POW_63 || value >= TWO_POW_64) {
    throw new Error("Value does not fit in a 64-bit integer.");
  }
  if (value < 0n) {
    value += TWO_POW_64;
  }
  return value.toString(16).padStart(16, "0");
}
