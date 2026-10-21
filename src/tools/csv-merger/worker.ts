import { analyze, checkDuplicates, writeMerged, type Analysis, type InputFile } from "./engine";

export type Request =
  | { action: "analyze"; inputs: InputFile[] }
  | { action: "duplicates"; inputs: InputFile[]; analysis: Analysis; keys: number[] }
  | { action: "export"; inputs: InputFile[]; analysis: Analysis; keys: number[] | null }
  | { action: "ack" };
export type DuplicateResult = Awaited<ReturnType<typeof checkDuplicates>>;
export type Response =
  | { type: "progress"; file: number; bytes: number }
  | { type: "analysis"; result: Analysis }
  | { type: "duplicates"; result: DuplicateResult }
  | { type: "chunk"; chunk: Uint8Array }
  | { type: "done"; written: number; removed: number }
  | { type: "error"; message: string };

const send = (response: Response) => postMessage(response);
let acknowledge: (() => void) | null = null;
let busy = false;

onmessage = async (event: MessageEvent<Request>) => {
  const request = event.data;
  if (request.action === "ack") { acknowledge?.(); acknowledge = null; return; }
  if (busy) return;
  busy = true;
  let lastProgress = 0;
  const progress = (file: number, bytes: number) => {
    if (performance.now() - lastProgress > 100) {
      send({ type: "progress", file, bytes });
      lastProgress = performance.now();
    }
  };
  try {
    if (request.action === "analyze") send({ type: "analysis", result: await analyze(request.inputs, progress) });
    else if (request.action === "duplicates") {
      send({ type: "duplicates", result: await checkDuplicates(request.inputs, request.analysis, request.keys, progress) });
    } else {
      const result = await writeMerged(request.inputs, request.analysis, request.keys, progress, async (chunk) => {
        await new Promise<void>((resolve) => {
          acknowledge = resolve;
          send({ type: "chunk", chunk });
        });
      });
      send({ type: "done", ...result });
    }
  } catch (error) {
    send({ type: "error", message: error instanceof Error ? error.message : String(error) });
  } finally {
    busy = false;
  }
};
