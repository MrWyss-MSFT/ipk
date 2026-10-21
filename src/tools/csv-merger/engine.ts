import { CsvParser, csvLine, detectDelimiter, DuplicateIndex, LIMITS, normalizeHeaders, type Delimiter, type DelimiterChoice } from "./csv";

export interface InputFile { file: File; delimiter: DelimiterChoice }
export interface FileAnalysis { headers: string[]; delimiter: Delimiter; rows: number; error?: string }
export interface Analysis { files: FileAnalysis[]; headers: string[]; rows: number; preview: string[][]; valid: boolean }
export type Progress = (file: number, bytes: number) => void;

async function encoding(file: File): Promise<{ name: string; skip: number }> {
  const bytes = new Uint8Array(await file.slice(0, 3).arrayBuffer());
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return { name: "utf-16le", skip: 2 };
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return { name: "utf-16be", skip: 2 };
  return { name: "utf-8", skip: bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0 };
}

async function chooseDelimiter(input: InputFile): Promise<Delimiter> {
  if (input.delimiter !== "auto") return input.delimiter;
  const { name, skip } = await encoding(input.file);
  const end = Math.min(input.file.size, skip + 256 * 1024);
  const decoder = new TextDecoder(name, { fatal: true });
  const sample = decoder.decode(await input.file.slice(skip, end).arrayBuffer(), { stream: end < input.file.size });
  return detectDelimiter(sample, end === input.file.size);
}

export async function* records(file: File, delimiter: Delimiter, progress: (bytes: number) => void) {
  const { name, skip } = await encoding(file);
  const decoder = new TextDecoder(name, { fatal: true });
  const parser = new CsvParser(delimiter);
  const reader = file.slice(skip).stream().getReader();
  let bytes = skip;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      // Bound decoding/parser batches even if a browser supplies a large stream chunk.
      for (let offset = 0; offset < chunk.value.length; offset += 32768) {
        const part = chunk.value.subarray(offset, offset + 32768);
        yield* parser.feed(decoder.decode(part, { stream: true }));
        bytes += part.length;
        progress(bytes);
      }
    }
    yield* parser.feed(decoder.decode(), true);
    progress(file.size);
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
}

export async function analyze(inputs: InputFile[], progress: Progress): Promise<Analysis> {
  const result: Analysis = { files: [], headers: [], rows: 0, preview: [], valid: true };
  const union = new Set<string>();
  const previews: { headers: string[]; cells: string[] }[] = [];
  let headerUnits = 0;
  for (const [index, input] of inputs.entries()) {
    const file: FileAnalysis = { headers: [], delimiter: ",", rows: 0 };
    result.files.push(file);
    try {
      file.delimiter = await chooseDelimiter(input);
      let header = false;
      for await (const row of records(input.file, file.delimiter, (bytes) => progress(index, bytes))) {
        if (!header) {
          file.headers = normalizeHeaders(row.cells);
          for (const name of file.headers) {
            if (!union.has(name)) {
              headerUnits += name.length;
              union.add(name);
              if (union.size > LIMITS.columns || headerUnits > LIMITS.headerUnits) throw new Error("Combined headers exceed 2,048 columns or the 1 MiB header-text budget.");
            }
          }
          header = true;
        } else {
          if (row.cells.length > file.headers.length) throw new Error(`Record ${row.record}: more values than headers.`);
          file.rows++;
          if (previews.length < LIMITS.previewRows) {
            previews.push({ headers: file.headers, cells: row.cells.map((cell) => cell.slice(0, LIMITS.previewCellUnits)) });
          }
        }
      }
      if (!header) throw new Error("File is empty or has no header.");
      result.rows += file.rows;
    } catch (error) {
      file.error = error instanceof Error ? error.message : String(error);
      result.valid = false;
    }
  }
  result.headers = [...union];
  result.preview = previews.map(({ headers, cells }) => {
    const positions = new Map(headers.map((header, i) => [header, i]));
    return result.headers.map((header) => cells[positions.get(header) ?? -1] ?? "");
  });
  return result;
}

export async function* alignedRows(inputs: InputFile[], analysis: Analysis, progress: Progress) {
  for (const [index, input] of inputs.entries()) {
    const metadata = analysis.files[index];
    const positions = new Map(metadata.headers.map((header, i) => [header, i]));
    const projection = analysis.headers.map((header) => positions.get(header) ?? -1);
    let first = true;
    try {
      for await (const row of records(input.file, metadata.delimiter, (bytes) => progress(index, bytes))) {
        if (first) {
          if (JSON.stringify(normalizeHeaders(row.cells)) !== JSON.stringify(metadata.headers)) throw new Error("File headers changed; analyze again.");
          first = false;
          continue;
        }
        if (row.cells.length > metadata.headers.length) throw new Error(`Record ${row.record}: more values than headers.`);
        yield { values: projection.map((i) => row.cells[i] ?? ""), source: { file: index, record: row.record } };
      }
    } catch (error) {
      throw new Error(`${input.file.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

export async function checkDuplicates(inputs: InputFile[], analysis: Analysis, keys: number[], progress: Progress) {
  const index = new DuplicateIndex();
  for await (const row of alignedRows(inputs, analysis, progress)) index.add(keys.map((key) => row.values[key]), row.source);
  return { checked: index.checked, groups: index.groups, duplicates: index.duplicates, samples: index.samples };
}

export async function writeMerged(
  inputs: InputFile[], analysis: Analysis, keys: number[] | null, progress: Progress,
  write: (chunk: Uint8Array) => Promise<void>,
) {
  const encoder = new TextEncoder();
  const duplicates = keys ? new DuplicateIndex() : null;
  let buffer = "\uFEFF" + csvLine(analysis.headers);
  let written = 0;
  for await (const row of alignedRows(inputs, analysis, progress)) {
    if (duplicates?.add(keys!.map((key) => row.values[key]), row.source)) continue;
    buffer += csvLine(row.values);
    written++;
    if (buffer.length >= 65536) {
      await write(encoder.encode(buffer));
      buffer = "";
    }
  }
  if (buffer) await write(encoder.encode(buffer));
  return { written, removed: duplicates?.duplicates ?? 0 };
}
