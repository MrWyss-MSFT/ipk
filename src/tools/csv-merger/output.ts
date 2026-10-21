import { LIMITS } from "./csv";

export interface OutputSink {
  write(chunk: Uint8Array): Promise<void>;
  close(): Promise<void>;
  abort(): Promise<void>;
}

interface SaveHandle {
  createWritable(): Promise<OutputSink>;
}
type SavePicker = (options: {
  suggestedName: string;
  types: { description: string; accept: Record<string, string[]> }[];
}) => Promise<SaveHandle>;

export function savePicker(): SavePicker | undefined {
  return (window as Window & { showSaveFilePicker?: SavePicker }).showSaveFilePicker?.bind(window);
}

export function memorySink(download: (blob: Blob) => void, maxBytes: number = LIMITS.fallbackBytes): OutputSink {
  let chunks: Blob[] = [];
  let bytes = 0;
  let aborted = false;
  return {
    async write(chunk) {
      if (aborted) throw new Error("Download cancelled.");
      if (bytes + chunk.byteLength > maxBytes) {
        aborted = true;
        chunks = [];
        throw new Error("Output exceeds the 50 MiB in-memory download limit. Use a browser supporting direct-to-file downloads, or merge fewer/smaller files.");
      }
      chunks.push(new Blob([new Uint8Array(chunk)]));
      bytes += chunk.byteLength;
    },
    async close() {
      if (aborted) throw new Error("Download cancelled.");
      const blob = new Blob(chunks, { type: "text/csv;charset=utf-8" });
      chunks = [];
      download(blob);
    },
    async abort() { aborted = true; chunks = []; },
  };
}
