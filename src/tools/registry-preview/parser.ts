/**
 * Parser for Windows .reg files (REGEDIT4 / "Windows Registry Editor Version 5.00"),
 * producing a navigable key tree - a client-side take on PowerToys' Registry Preview.
 * https://learn.microsoft.com/en-us/windows/powertoys/registry-preview
 */

export type RegValueType =
  | "REG_NONE"
  | "REG_SZ"
  | "REG_EXPAND_SZ"
  | "REG_BINARY"
  | "REG_DWORD"
  | "REG_DWORD_BIG_ENDIAN"
  | "REG_LINK"
  | "REG_MULTI_SZ"
  | "REG_RESOURCE_LIST"
  | "REG_QWORD";

export interface RegValue {
  name: string; // "@" denotes the key's default value
  type: RegValueType;
  display: string;
  deleted?: boolean;
}

export interface RegKeyNode {
  name: string;
  path: string;
  children: Map<string, RegKeyNode>;
  values: RegValue[];
  deleted?: boolean;
}

export interface ParsedRegFile {
  root: RegKeyNode;
  keyCount: number;
  errors: string[];
}

const HEX_TYPE_MAP: Record<string, RegValueType> = {
  "0": "REG_NONE",
  "1": "REG_SZ",
  "2": "REG_EXPAND_SZ",
  "3": "REG_BINARY",
  "4": "REG_DWORD",
  "5": "REG_DWORD_BIG_ENDIAN",
  "6": "REG_LINK",
  "7": "REG_MULTI_SZ",
  "8": "REG_RESOURCE_LIST",
  b: "REG_QWORD",
};

function createNode(name: string, path: string): RegKeyNode {
  return { name, path, children: new Map(), values: [] };
}

/** Joins hex: continuation lines (trailing "\") into single logical lines. */
function toLogicalLines(text: string): string[] {
  const rawLines = text.split(/\r\n|\n|\r/);
  const logical: string[] = [];
  let buffer = "";
  let continuing = false;

  for (const rawLine of rawLines) {
    const line = continuing ? rawLine.replace(/^[ \t]+/, "") : rawLine;
    if (/\\\s*$/.test(line)) {
      buffer += line.replace(/\\\s*$/, "");
      continuing = true;
    } else {
      buffer += line;
      logical.push(buffer);
      buffer = "";
      continuing = false;
    }
  }
  if (buffer) logical.push(buffer);
  return logical;
}

function unescapeRegString(raw: string): string {
  return raw.replace(/\\(.)/g, (_, ch: string) => (ch === "n" ? "\n" : ch));
}

function parseHexBytes(data: string): number[] {
  return data
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map((p) => parseInt(p, 16))
    .filter((n) => !Number.isNaN(n));
}

function bytesToHexDisplay(bytes: number[]): string {
  return bytes.map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join(" ");
}

function decodeUtf16(bytes: number[]): string {
  const units: number[] = [];
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    units.push(bytes[i] | (bytes[i + 1] << 8));
  }
  return String.fromCharCode(...units).replace(/\0+$/, "");
}

function decodeMultiSz(bytes: number[]): string {
  const full = decodeUtf16(bytes);
  return full
    .split("\0")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .join("\n");
}

function decodeDwordHex(hex: string): string {
  const value = parseInt(hex, 16) >>> 0;
  return `${value} (0x${value.toString(16).toUpperCase()})`;
}

function decodeHexValue(typeCode: string, bytes: number[]): { type: RegValueType; display: string } {
  const type = HEX_TYPE_MAP[typeCode.toLowerCase()] ?? "REG_BINARY";
  switch (type) {
    case "REG_SZ":
    case "REG_EXPAND_SZ":
      return { type, display: decodeUtf16(bytes) };
    case "REG_MULTI_SZ":
      return { type, display: decodeMultiSz(bytes) };
    case "REG_DWORD": {
      const v = (bytes[0] ?? 0) | ((bytes[1] ?? 0) << 8) | ((bytes[2] ?? 0) << 16) | ((bytes[3] ?? 0) << 24);
      return { type, display: `${v >>> 0} (0x${(v >>> 0).toString(16).toUpperCase()})` };
    }
    case "REG_DWORD_BIG_ENDIAN": {
      const v = ((bytes[0] ?? 0) << 24) | ((bytes[1] ?? 0) << 16) | ((bytes[2] ?? 0) << 8) | (bytes[3] ?? 0);
      return { type, display: `${v >>> 0} (0x${(v >>> 0).toString(16).toUpperCase()})` };
    }
    case "REG_QWORD": {
      let v = 0n;
      for (let i = Math.min(bytes.length, 8) - 1; i >= 0; i--) {
        v = (v << 8n) | BigInt(bytes[i]);
      }
      return { type, display: `${v} (0x${v.toString(16).toUpperCase()})` };
    }
    default:
      return { type, display: bytesToHexDisplay(bytes) };
  }
}

function getOrCreateChild(parent: RegKeyNode, name: string): RegKeyNode {
  const existing = parent.children.get(name);
  if (existing) return existing;
  const path = parent.path ? `${parent.path}\\${name}` : name;
  const node = createNode(name, path);
  parent.children.set(name, node);
  return node;
}

function getOrCreateKey(root: RegKeyNode, fullPath: string): RegKeyNode {
  const segments = fullPath.split("\\").filter((s) => s.length > 0);
  let node = root;
  for (const segment of segments) {
    node = getOrCreateChild(node, segment);
  }
  return node;
}

/**
 * Returns true if `data` (the raw text right after a `"name"=`) contains a fully
 * closed quoted string - i.e. it starts with `"` and ends with an unescaped `"`
 * with nothing trailing it. Used to detect REG_SZ values that embed a literal,
 * unescaped newline (some tools - and even regedit itself in rare cases - export
 * these without the usual `hex:`-style `\` line continuation).
 */
function isQuotedStringClosed(data: string): boolean {
  const trimmed = data.trim();
  if (!trimmed.startsWith('"')) return true; // not a quoted string (dword:/hex:/etc.) - nothing to merge
  let i = 1;
  while (i < trimmed.length) {
    if (trimmed[i] === "\\") {
      i += 2;
      continue;
    }
    if (trimmed[i] === '"') return i === trimmed.length - 1;
    i++;
  }
  return false;
}

/**
 * Joins a `"name"="...` line with following logical lines when its quoted string
 * value wasn't closed on the same line (a literal embedded newline in the data),
 * using "\n" as the join separator to preserve the original line breaks.
 */
function mergeMultilineQuotedValues(lines: string[]): string[] {
  const merged: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    i++;
    const match = line.trim().match(/^(?:"(?:[^"\\]|\\.)*"|@)=([\s\S]*)$/);
    if (!match) {
      merged.push(line);
      continue;
    }
    let data = match[1];
    let combined = line;
    while (!isQuotedStringClosed(data) && i < lines.length) {
      data += `\n${lines[i]}`;
      combined += `\n${lines[i]}`;
      i++;
    }
    merged.push(combined);
  }
  return merged;
}

export function parseRegFile(text: string): ParsedRegFile {
  const root = createNode("", "");
  const errors: string[] = [];
  let currentKey: RegKeyNode | null = null;
  let keyCount = 0;

  const lines = mergeMultilineQuotedValues(toLogicalLines(text.replace(/^\uFEFF/, "")));

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.length === 0) continue;
    if (line.startsWith(";")) continue;
    if (/^windows registry editor version/i.test(line)) continue;
    if (/^regedit4$/i.test(line)) continue;

    const keyDeleteMatch = line.match(/^\[-(.+)\]$/);
    const keyMatch = line.match(/^\[(.+)\]$/);

    if (keyDeleteMatch) {
      const node = getOrCreateKey(root, keyDeleteMatch[1]);
      node.deleted = true;
      currentKey = node;
      continue;
    }

    if (keyMatch) {
      currentKey = getOrCreateKey(root, keyMatch[1]);
      keyCount += 1;
      continue;
    }

    if (!currentKey) {
      errors.push(`Ignored line outside of any key: ${line}`);
      continue;
    }

    const valueMatch = line.match(/^(?:"((?:[^"\\]|\\.)*)"|(@))=([\s\S]*)$/);
    if (!valueMatch) {
      errors.push(`Unrecognized line: ${line}`);
      continue;
    }

    const name = valueMatch[2] === "@" ? "@" : unescapeRegString(valueMatch[1] ?? "");
    const data = valueMatch[3].trim();

    if (data === "-") {
      currentKey.values.push({ name, type: "REG_SZ", display: "", deleted: true });
      continue;
    }

    if (data.startsWith('"') && data.endsWith('"')) {
      currentKey.values.push({ name, type: "REG_SZ", display: unescapeRegString(data.slice(1, -1)) });
      continue;
    }

    const dwordMatch = data.match(/^dword:([0-9a-f]+)$/i);
    if (dwordMatch) {
      currentKey.values.push({ name, type: "REG_DWORD", display: decodeDwordHex(dwordMatch[1]) });
      continue;
    }

    const hexTypedMatch = data.match(/^hex\(([0-9a-f]+)\):(.*)$/i);
    if (hexTypedMatch) {
      const bytes = parseHexBytes(hexTypedMatch[2]);
      const { type, display } = decodeHexValue(hexTypedMatch[1], bytes);
      currentKey.values.push({ name, type, display });
      continue;
    }

    const hexMatch = data.match(/^hex:(.*)$/i);
    if (hexMatch) {
      const bytes = parseHexBytes(hexMatch[1]);
      currentKey.values.push({ name, type: "REG_BINARY", display: bytesToHexDisplay(bytes) });
      continue;
    }

    errors.push(`Unrecognized value data for "${name}": ${data}`);
  }

  return { root, keyCount, errors };
}
