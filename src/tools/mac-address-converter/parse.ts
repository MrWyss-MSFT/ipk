export type MacCase = "lower" | "upper";

export interface MacFormat {
  id: string;
  label: string;
  /** Returns the separator/grouping for this format, in canonical (uppercase) hex. Case is applied afterwards. */
  toHex: (hex: string) => string;
  /** Literal prefix not affected by the case toggle, e.g. "0x". */
  prefix?: string;
  /** Forces lowercase output regardless of the case toggle — used for IPv6, which is conventionally lowercase. */
  fixedCase?: "lower";
}

/**
 * Strips common separators (`:`, `-`, `.`, spaces) and an optional `0x`
 * prefix, then validates that exactly 12 hex digits (6 bytes) remain.
 * Works regardless of how those separators are grouped (pairs, Cisco-style
 * groups of 4, etc.) since they're all stripped before counting.
 */
export function normalizeMac(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  const withoutPrefix = trimmed.replace(/^0x/i, "");
  const stripped = withoutPrefix.replace(/[\s:.-]/g, "");
  if (!/^[0-9a-fA-F]+$/.test(stripped)) {
    throw new Error("Input contains characters that aren't hex digits or common separators (: - . space).");
  }
  if (stripped.length !== 12) {
    throw new Error(`Expected 12 hex digits (6 bytes) once separators are removed — found ${stripped.length}.`);
  }
  return stripped.toUpperCase();
}

function bytePairs(hex: string): string[] {
  return hex.match(/.{2}/g) ?? [];
}

export const MAC_FORMATS: MacFormat[] = [
  { id: "colon", label: "Colon-separated", toHex: (h) => bytePairs(h).join(":") },
  { id: "hyphen", label: "Hyphen-separated (Windows)", toHex: (h) => bytePairs(h).join("-") },
  { id: "cisco", label: "Cisco dot-grouped", toHex: (h) => (h.match(/.{4}/g) ?? []).join(".") },
  { id: "space", label: "Space-separated", toHex: (h) => bytePairs(h).join(" ") },
  { id: "plain", label: "Plain hex, no separator", toHex: (h) => h },
  { id: "0x-prefixed", label: "0x-prefixed", toHex: (h) => h, prefix: "0x" },
];

/** The 8-byte Modified EUI-64 (U/L bit flipped, FF:FE inserted mid-way), as a 16-char hex string. */
function modifiedEui64Hex(hex: string): string {
  const bytes = bytePairs(hex);
  const flippedFirst = (parseInt(bytes[0], 16) ^ 0x02)
    .toString(16)
    .padStart(2, "0")
    .toUpperCase();
  return [flippedFirst, bytes[1], bytes[2], "FF", "FE", bytes[3], bytes[4], bytes[5]].join("");
}

/** Splits a 16-char hex string into four 16-bit groups, e.g. "0211:22FF:FE33:4455". */
function groupHex16(hex16: string): string {
  return (hex16.match(/.{4}/g) ?? []).join(":");
}

/** Strips leading zeros within each colon-separated hex group (RFC 5952 canonical form), e.g. "0211" -> "211". */
function compressGroups(groups: string): string {
  return groups
    .split(":")
    .map((g) => g.replace(/^0+(?=.)/, ""))
    .join(":");
}

export const MAC_DERIVED_FORMATS: MacFormat[] = [
  {
    id: "eui64-interface-id",
    label: "IPv6 interface ID (Modified EUI-64)",
    toHex: (h) => groupHex16(modifiedEui64Hex(h)),
    fixedCase: "lower",
  },
  {
    id: "eui64-link-local",
    label: "IPv6 link-local address (SLAAC)",
    toHex: (h) => `fe80::${compressGroups(groupHex16(modifiedEui64Hex(h)))}`,
    fixedCase: "lower",
  },
];

/** Applies a MacFormat's separator/prefix and case to a canonical (uppercase) hex string. */
export function formatMac(format: MacFormat, hex: string, caseMode: MacCase): string {
  const raw = format.toHex(hex);
  const cased = (format.fixedCase ?? caseMode) === "lower" ? raw.toLowerCase() : raw.toUpperCase();
  return (format.prefix ?? "") + cased;
}

/**
 * Splits bulk pasted input into individual candidate MAC strings — one per
 * line, additionally splitting on commas/semicolons so a single-line CSV
 * paste also works. Blank entries are dropped.
 */
export function splitMacList(input: string): string[] {
  return input
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
