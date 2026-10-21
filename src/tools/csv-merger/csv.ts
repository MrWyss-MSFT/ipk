export const LIMITS = {
  files: 100,
  columns: 2048,
  recordUnits: 524288,
  headerUnits: 524288,
  uniqueKeys: 100000,
  keyBytes: 32 * 1024 * 1024,
  fallbackBytes: 50 * 1024 * 1024,
  previewRows: 20,
  previewCellUnits: 200,
  sampleRows: 20,
} as const;

export type Delimiter = "," | ";" | "\t";
export type DelimiterChoice = Delimiter | "auto";
export interface CsvRecord { cells: string[]; record: number }

/** Retains only the current logical record; quotes and CRLF can span chunks. */
export class CsvParser {
  private state: "start" | "plain" | "quoted" | "closed" = "start";
  private cells: string[] = [];
  private field = "";
  private units = 0;
  private touched = false;
  private skipLf = false;
  private record = 1;

  constructor(private delimiter: Delimiter, private maxUnits: number = LIMITS.recordUnits) {}

  private endField() {
    this.cells.push(this.field);
    this.field = "";
    this.state = "start";
    if (this.cells.length > LIMITS.columns) throw new Error(`Record ${this.record}: more than ${LIMITS.columns} columns.`);
  }

  private endRecord(): CsvRecord | null {
    const touched = this.touched;
    this.endField();
    const row = { cells: this.cells, record: this.record++ };
    this.cells = [];
    this.units = 0;
    this.touched = false;
    return touched ? row : null;
  }

  *feed(text: string, final = false): Generator<CsvRecord> {
    for (const char of text) {
      if (this.skipLf) {
        this.skipLf = false;
        if (char === "\n") continue;
      }
      this.units += char.length;
      if (this.units > this.maxUnits) throw new Error(`Record ${this.record}: exceeds the 1 MiB decoded record budget.`);
      if (this.state === "quoted") {
        if (char === '"') this.state = "closed";
        else this.field += char;
        continue;
      }
      if (char === "\r" || char === "\n") {
        const row = this.endRecord();
        this.skipLf = char === "\r";
        if (row) yield row;
      } else if (char === this.delimiter) {
        this.touched = true;
        this.endField();
      } else if (char === '"') {
        this.touched = true;
        if (this.state === "start") this.state = "quoted";
        else if (this.state === "closed") {
          this.field += '"';
          this.state = "quoted";
        } else throw new Error(`Record ${this.record}: unexpected quote in an unquoted field.`);
      } else {
        if (this.state === "closed") throw new Error(`Record ${this.record}: unexpected text after a closing quote.`);
        this.touched = true;
        this.field += char;
        this.state = "plain";
      }
    }
    if (final) {
      if (this.state === "quoted") throw new Error(`Record ${this.record}: unterminated quoted field.`);
      if (this.touched) {
        const row = this.endRecord();
        if (row) yield row;
      }
    }
  }
}

export function normalizeHeaders(cells: string[]): string[] {
  const headers = cells.map((cell) => cell.trim());
  if (!headers.length || headers.some((header) => !header)) throw new Error("Column headers must not be empty.");
  if (new Set(headers).size !== headers.length) throw new Error("Duplicate column headers after trimming whitespace.");
  return headers;
}

export function csvLine(cells: readonly string[]): string {
  return cells.map((cell) => /[",\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell).join(",") + "\r\n";
}

export function detectDelimiter(sample: string, complete: boolean): Delimiter {
  const candidates: Delimiter[] = [];
  for (const delimiter of [",", ";", "\t"] as const) {
    try {
      const parser = new CsvParser(delimiter);
      const rows: CsvRecord[] = [];
      for (const row of parser.feed(sample, complete)) {
        rows.push(row);
        if (rows.length === 8) break;
      }
      if (rows.length && rows[0].cells.length > 1 && rows.every((row) => row.cells.length <= rows[0].cells.length)) {
        normalizeHeaders(rows[0].cells);
        candidates.push(delimiter);
      }
    } catch {
      // A candidate failing CSV validation is not a viable delimiter.
    }
  }
  if (candidates.length !== 1) throw new Error("Delimiter is ambiguous. Choose comma, semicolon, or tab explicitly (also for single-column files).");
  return candidates[0];
}

export interface Source { file: number; record: number }
export interface DuplicateSample { first: Source; duplicate: Source; values: string[] }

export class DuplicateIndex {
  private seen = new Map<string, { first: Source; repeated: boolean }>();
  private bytes = 0;
  groups = 0;
  duplicates = 0;
  checked = 0;
  samples: DuplicateSample[] = [];

  constructor(private maxKeys: number = LIMITS.uniqueKeys, private maxBytes: number = LIMITS.keyBytes) {}

  add(values: string[], source: Source): boolean {
    const key = JSON.stringify(values);
    const found = this.seen.get(key);
    this.checked++;
    if (found) {
      if (!found.repeated) { found.repeated = true; this.groups++; }
      this.duplicates++;
      if (this.samples.length < LIMITS.sampleRows) {
        this.samples.push({ first: found.first, duplicate: source, values: values.map((v) => v.slice(0, LIMITS.previewCellUnits)) });
      }
      return true;
    }
    const bytes = key.length * 2;
    if (this.seen.size >= this.maxKeys || this.bytes + bytes > this.maxBytes) {
      throw new Error("Duplicate check incomplete: index limit reached (100,000 distinct keys / 32 MiB key text). Ordinary merging is still available.");
    }
    this.seen.set(key, { first: source, repeated: false });
    this.bytes += bytes;
    return false;
  }
}
