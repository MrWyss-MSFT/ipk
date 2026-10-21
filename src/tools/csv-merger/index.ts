import "./style.css";
import type { ToolDefinition } from "@/types/tool";
import { wireFilesDrop } from "@/app/file-drop";
import { LIMITS, type DelimiterChoice } from "./csv";
import type { Analysis, InputFile } from "./engine";
import { memorySink, savePicker, type OutputSink } from "./output";
import type { DuplicateResult, Request, Response } from "./worker";

const MIB = 1024 * 1024;
function escape(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}
const delimiterNames = { auto: "Auto", ",": "Comma", ";": "Semicolon", "\t": "Tab" } as const;
const size = (bytes: number) => bytes < 1024 ? `${bytes} B`
  : bytes < MIB ? `${(bytes / 1024).toFixed(1)} KiB` : `${(bytes / MIB).toFixed(2)} MiB`;
const count = (value: number, noun: string) => `${value.toLocaleString()} ${noun}${value === 1 ? "" : "s"}`;

const tool: ToolDefinition = {
  id: "csv-merger",
  name: "CSV Merger",
  description: "Append multiple CSV files by matching column headers, with streaming downloads and optional duplicate checking by selected columns.",
  category: "Utilities",
  icon: "🧮",
  keywords: ["csv", "merge", "append", "combine", "duplicate", "deduplicate", "tsv", "semicolon", "spreadsheet"],
  mount(container) {
    container.innerHTML = `
      <div class="csvm-tool">
        <p class="ipk-hint">Files stay in your browser. Columns match by trimmed, case-sensitive header names; missing cells are empty. Rows and columns follow first appearance. UTF-8 and BOM-marked UTF-16 are supported. Values are preserved exactly: opening CSVs containing formulas in a spreadsheet can execute those formulas.</p>
        <div class="csvm-drop" id="csvm-drop">
          <strong>Drop CSV files here</strong>
          <span>Add multiple files or more batches to the same queue.</span>
          <button type="button" class="btn" id="csvm-browse">Choose files</button>
          <input type="file" id="csvm-files" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values" multiple hidden />
        </div>
        <div class="csvm-toolbar">
          <label for="csvm-limit">Total input limit (MiB)</label>
          <input id="csvm-limit" type="number" min="1" max="1024" step="1" value="100" />
          <button type="button" class="btn" id="csvm-clear">Clear files</button>
          <span id="csvm-size" class="csvm-muted"></span>
        </div>
        <p class="csvm-muted">Up to 100 files, 2,048 combined columns, and 1 MiB of decoded text per record or combined headers (UTF-16 accounting). Automatic delimiter detection may need an override, especially for single-column files.</p>
        <div class="csvm-table-wrap ipk-table-scroll">
          <table class="ipk-table ipk-table-hover"><thead><tr><th>File / order</th><th>Size</th><th>Delimiter</th><th>Rows / status</th><th>Actions</th></tr></thead><tbody id="csvm-queue"></tbody></table>
        </div>
        <div class="csvm-toolbar">
          <button type="button" class="btn btn-primary" id="csvm-analyze">Analyze files</button>
          <button type="button" class="btn" id="csvm-cancel" disabled>Cancel</button>
          <span id="csvm-progress" role="status" aria-live="polite"></span>
        </div>
        <p id="csvm-error" class="ipk-error" role="alert"></p>
        <section id="csvm-analysis" hidden>
          <h3>Combined columns &amp; preview</h3>
          <p id="csvm-summary" class="csvm-muted"></p>
          <p class="csvm-muted">First 20 rows; preview cells are truncated to 200 characters. Downloads retain full values.</p>
          <div class="csvm-table-wrap ipk-table-scroll" id="csvm-preview"></div>
          <details class="csvm-duplicates">
            <summary>Duplicate checker</summary>
            <p class="csvm-muted">Defaults to all columns. Select key columns to match by fields such as serial number. Comparisons include case and whitespace; missing and empty cells match. With selected keys, differing non-key values do not prevent removal.</p>
            <div class="csvm-toolbar">
              <button type="button" class="btn" id="csvm-all">Select all columns</button>
              <button type="button" class="btn" id="csvm-none">Clear column selection</button>
            </div>
            <div id="csvm-keys" class="csvm-keys"></div>
            <button type="button" class="btn" id="csvm-check">Check duplicates</button>
            <p class="csvm-muted">Memory-only index: up to 100,000 distinct keys or 32 MiB of key text (object overhead is additional). Exceeding either limit stops the check; ordinary merging remains available.</p>
            <div id="csvm-duplicate-results" role="status"></div>
          </details>
          <label class="csvm-check"><input type="checkbox" id="csvm-remove" disabled /> Remove duplicates, keeping the first matching row (requires a completed check)</label>
          <div class="csvm-toolbar">
            <button type="button" class="btn btn-primary" id="csvm-merge">Merge &amp; download CSV</button>
            <span id="csvm-output-note" class="csvm-muted"></span>
          </div>
        </section>
      </div>`;
    const get = <T extends HTMLElement>(id: string) => container.querySelector<T>(`#csvm-${id}`)!;
    const input = get<HTMLInputElement>("files");
    const limit = get<HTMLInputElement>("limit");
    const errorEl = get<HTMLParagraphElement>("error");
    const progress = get<HTMLElement>("progress");
    const queue = get<HTMLElement>("queue");
    const panel = get<HTMLElement>("analysis");
    const keyPanel = get<HTMLElement>("keys");
    const duplicatePanel = get<HTMLElement>("duplicate-results");
    const remove = get<HTMLInputElement>("remove");
    const cancel = get<HTMLButtonElement>("cancel");
    const analyzeButton = get<HTMLButtonElement>("analyze");
    const mergeButton = get<HTMLButtonElement>("merge");
    const checkButton = get<HTMLButtonElement>("check");
    const picker = savePicker();
    get("output-note").textContent = picker
      ? "Streams directly to your selected file. Output: UTF-8 BOM, comma-separated, CRLF."
      : "This browser uses an in-memory download, limited to 50 MiB of encoded output. Output: UTF-8 BOM, comma-separated, CRLF.";

    let inputs: InputFile[] = [];
    let analysis: Analysis | null = null;
    let duplicates: DuplicateResult | null = null;
    let worker: Worker | null = null;
    let sink: OutputSink | null = null;
    let busy = false;
    let stopping = false;
    let disposed = false;
    let generation = 0;
    let objectUrl: string | null = null;
    let urlTimer: ReturnType<typeof setTimeout> | undefined;
    const totalSize = () => inputs.reduce((sum, item) => sum + item.file.size, 0);
    const keys = () => [...keyPanel.querySelectorAll<HTMLInputElement>("input:checked")].map((box) => Number(box.value));
    const showError = (error: unknown) => { errorEl.textContent = error instanceof Error ? error.message : String(error); };

    function validateSize() {
      const value = Number(limit.value);
      if (!Number.isInteger(value) || value < 1 || value > 1024) throw new Error("Input limit must be a whole number from 1 to 1,024 MiB.");
      if (totalSize() > value * MIB) throw new Error("Queued files exceed the configured input limit. Remove files or increase the limit.");
      if (!inputs.length) throw new Error("Add at least one CSV file.");
    }

    function refreshControls() {
      container.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement>("input, button, select").forEach((control) => {
        control.disabled = busy;
      });
      cancel.disabled = !busy;
      analyzeButton.disabled = busy || !inputs.length;
      mergeButton.disabled = busy || !analysis?.valid;
      checkButton.disabled = busy || !analysis?.valid || keys().length === 0;
      remove.disabled = busy || !duplicates;
    }

    function invalidateDuplicates() {
      duplicates = null;
      remove.checked = false;
      duplicatePanel.replaceChildren();
      refreshControls();
    }

    function invalidate() {
      analysis = null;
      panel.hidden = true;
      keyPanel.replaceChildren();
      invalidateDuplicates();
      errorEl.textContent = "";
      progress.textContent = "";
      renderQueue();
    }

    function renderQueue() {
      get("size").textContent = `${inputs.length} / ${LIMITS.files} files · ${size(totalSize())} / ${limit.value} MiB`;
      queue.innerHTML = inputs.length ? inputs.map((item, index) => {
        const metadata = analysis?.files[index];
        return `<tr>
          <td>${index + 1}. ${escape(item.file.name)}</td><td>${size(item.file.size)}</td>
          <td><select data-delimiter="${index}" aria-label="Delimiter for ${escape(item.file.name)}">${(Object.keys(delimiterNames) as DelimiterChoice[]).map((value) => `<option value="${escape(value)}"${item.delimiter === value ? " selected" : ""}>${delimiterNames[value]}</option>`).join("")}</select></td>
          <td${metadata?.error ? ' class="ipk-error"' : ""}>${metadata ? metadata.error ? escape(metadata.error) : `${count(metadata.rows, "row")} · ${delimiterNames[metadata.delimiter]}` : "Not analyzed"}</td>
          <td class="csvm-actions"><button type="button" class="btn" data-move="${index}" data-offset="-1" aria-label="Move ${escape(item.file.name)} up">↑</button><button type="button" class="btn" data-move="${index}" data-offset="1" aria-label="Move ${escape(item.file.name)} down">↓</button><button type="button" class="btn" data-remove="${index}" aria-label="Remove ${escape(item.file.name)}">Remove</button></td>
        </tr>`;
      }).join("") : '<tr><td colspan="5">No files added yet.</td></tr>';
      refreshControls();
    }

    function addFiles(files: File[]) {
      if (disposed) return;
      if (busy) { showError("Wait for processing to finish, or cancel before adding files."); return; }
      try {
        const value = Number(limit.value);
        if (!Number.isInteger(value) || value < 1 || value > 1024) throw new Error("Choose an input limit between 1 and 1,024 MiB first.");
        if (inputs.length + files.length > LIMITS.files) throw new Error("At most 100 files can be queued. No files from this batch were added.");
        if (totalSize() + files.reduce((sum, file) => sum + file.size, 0) > value * MIB) throw new Error("This batch exceeds the total input limit. No files from this batch were added.");
        inputs.push(...files.map((file): InputFile => ({ file, delimiter: "auto" })));
        invalidate();
      } catch (error) { showError(error); }
    }

    function renderAnalysis() {
      if (!analysis) return;
      panel.hidden = !analysis.valid;
      get("summary").textContent = `${analysis.headers.length} columns · ${analysis.rows.toLocaleString()} rows · ${inputs.length} files`;
      get("preview").innerHTML = `<table class="ipk-table ipk-table-hover"><thead><tr>${analysis.headers.map((name) => `<th>${escape(name)}</th>`).join("")}</tr></thead><tbody>${analysis.preview.map((row) => `<tr>${row.map((cell) => `<td>${escape(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
      keyPanel.innerHTML = analysis.headers.map((name, index) => `<label class="csvm-check"><input type="checkbox" value="${index}" checked /> ${escape(name)}</label>`).join("");
      invalidateDuplicates();
      renderQueue();
    }

    function revokeDownload() {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = null;
      clearTimeout(urlTimer);
    }

    function download(blob: Blob) {
      revokeDownload();
      objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = "merged.csv";
      link.click();
      urlTimer = setTimeout(revokeDownload, 60000);
    }

    async function stop(message: string, error?: unknown) {
      if (stopping) return;
      stopping = true;
      generation++;
      cancel.disabled = true;
      worker?.terminate();
      worker = null;
      const pending = sink;
      sink = null;
      // Keep controls locked until abort finishes.
      try { await pending?.abort(); }
      catch (abortError) { if (!disposed) showError(`Could not abort the output file: ${String(abortError)}`); }
      stopping = false;
      if (disposed) return;
      busy = false;
      progress.textContent = message;
      if (error) showError(error);
      refreshControls();
    }

    function showDuplicates(result: DuplicateResult) {
      duplicates = result;
      const source = (file: number, record: number) => `${inputs[file].file.name} (#${file + 1}), record ${record}`;
      duplicatePanel.innerHTML = `<p>${count(result.checked, "row")} checked · ${count(result.groups, "duplicate group")} · ${count(result.duplicates, "extra matching row")}</p>
        ${result.samples.length ? `<p class="csvm-muted">First ${result.samples.length} matching occurrences (key values truncated to 200 characters).</p><div class="csvm-table-wrap ipk-table-scroll"><table class="ipk-table"><thead><tr><th>First occurrence</th><th>Duplicate occurrence</th><th>Key values</th></tr></thead><tbody>${result.samples.map((sample) => `<tr><td>${escape(source(sample.first.file, sample.first.record))}</td><td>${escape(source(sample.duplicate.file, sample.duplicate.record))}</td><td>${escape(JSON.stringify(sample.values))}</td></tr>`).join("")}</tbody></table></div>` : ""}`;
    }

    async function start(action: "analyze" | "duplicates" | "export") {
      if (busy || disposed) return;
      try { validateSize(); }
      catch (error) { showError(error); return; }
      if (action !== "analyze" && !analysis?.valid) return;
      if (action === "duplicates" && !keys().length) { showError("Select at least one duplicate key column."); return; }
      if (action === "analyze") invalidate();
      if (action === "duplicates") invalidateDuplicates();
      busy = true;
      errorEl.textContent = "";
      progress.textContent = action === "export" ? "Preparing download…" : "Processing…";
      refreshControls();
      const run = ++generation;
      const current = () => !disposed && generation === run;
      try {
        if (action === "export") {
          const handle = picker ? await picker({ suggestedName: "merged.csv", types: [{ description: "CSV file", accept: { "text/csv": [".csv"] } }] }) : null;
          if (!current()) return;
          const output = handle ? await handle.createWritable() : memorySink(download);
          if (!current()) { await output.abort(); return; }
          sink = output;
        }
        worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
        const activeWorker = worker;
        worker.onerror = (event) => { if (current()) void stop("Processing failed.", new Error(event.message)); };
        worker.onmessage = async (event: MessageEvent<Response>) => {
          if (!current()) return;
          const message = event.data;
          try {
            if (message.type === "progress") {
              const before = inputs.slice(0, message.file).reduce((sum, item) => sum + item.file.size, 0);
              const percent = totalSize() ? Math.min(100, Math.floor((before + message.bytes) / totalSize() * 100)) : 0;
              progress.textContent = `${action === "export" ? "Writing" : "Reading"} file ${message.file + 1}/${inputs.length} · ${percent}%`;
            } else if (message.type === "chunk") {
              if (!sink) throw new Error("No output destination.");
              await sink.write(message.chunk);
              if (current()) activeWorker.postMessage({ action: "ack" } satisfies Request);
            } else if (message.type === "error") {
              if (action === "duplicates") invalidateDuplicates();
              await stop("Processing failed; no completed output.", new Error(message.message));
            } else {
              if (message.type === "analysis") {
                analysis = message.result;
                renderAnalysis();
                if (!analysis.valid) showError("Some files could not be analyzed. Fix their delimiter or remove them, then analyze again.");
                progress.textContent = analysis.valid ? "Analysis complete." : "Analysis incomplete.";
              } else if (message.type === "duplicates") {
                showDuplicates(message.result);
                progress.textContent = "Duplicate check complete.";
              } else {
                await sink!.close();
                if (!current()) return;
                sink = null;
                progress.textContent = `Download complete: ${message.written.toLocaleString()} rows, ${message.removed.toLocaleString()} duplicates removed.`;
              }
              activeWorker.terminate();
              worker = null;
              busy = false;
              refreshControls();
            }
          } catch (error) { if (current()) await stop("Processing failed; no completed output.", error); }
        };
        const request: Request = action === "analyze" ? { action, inputs }
          : action === "duplicates" ? { action, inputs, analysis: analysis!, keys: keys() }
          : { action, inputs, analysis: analysis!, keys: remove.checked && duplicates ? keys() : null };
        worker.postMessage(request);
      } catch (error) {
        if (current()) await stop("Processing stopped.", error instanceof DOMException && error.name === "AbortError" ? new Error("File selection was cancelled.") : error);
      }
    }

    get("browse").addEventListener("click", () => input.click());
    input.addEventListener("change", () => { addFiles(Array.from(input.files ?? [])); input.value = ""; });
    get("clear").addEventListener("click", () => { inputs = []; invalidate(); });
    limit.addEventListener("input", () => {
      invalidate();
      if (inputs.length) { try { validateSize(); } catch (error) { showError(error); } }
    });
    queue.addEventListener("change", (event) => {
      const select = event.target;
      if (!(select instanceof HTMLSelectElement)) return;
      inputs[Number(select.dataset.delimiter)].delimiter = select.value as DelimiterChoice;
      invalidate();
    });
    queue.addEventListener("click", (event) => {
      if (!(event.target instanceof Element)) return;
      const button = event.target.closest<HTMLButtonElement>("button");
      if (!button) return;
      if (button.dataset.remove !== undefined) inputs.splice(Number(button.dataset.remove), 1);
      else if (button.dataset.move !== undefined) {
        const from = Number(button.dataset.move);
        const to = from + Number(button.dataset.offset);
        if (to < 0 || to >= inputs.length) return;
        [inputs[from], inputs[to]] = [inputs[to], inputs[from]];
      }
      invalidate();
    });
    keyPanel.addEventListener("change", invalidateDuplicates);
    for (const [id, checked] of [["all", true], ["none", false]] as const) get(id).addEventListener("click", () => {
      keyPanel.querySelectorAll<HTMLInputElement>("input").forEach((box) => { box.checked = checked; });
      invalidateDuplicates();
    });
    analyzeButton.addEventListener("click", () => void start("analyze"));
    checkButton.addEventListener("click", () => void start("duplicates"));
    mergeButton.addEventListener("click", () => void start("export"));
    cancel.addEventListener("click", () => void stop("Cancelled; no completed output."));
    const unwireDrop = wireFilesDrop(get("drop"), addFiles);
    renderQueue();
    return () => {
      disposed = true;
      void stop("");
      revokeDownload();
      inputs = [];
      analysis = null;
      duplicates = null;
      unwireDrop();
    };
  },
};
export default tool;
