import "./style.css";
import { wireGlobalPaste } from "@/app/global-paste";
import { wireExampleButton } from "@/app/example-button";
import { makePsCommandVariants, psCommandTabsHtml, wirePsCommandTabs } from "@/app/ps-command";
import type { ToolDefinition } from "@/types/tool";
import { parseUpdateHistoryExport, type UpdateHistoryEntry, type UpdateHistoryParseError } from "./parse";
import { PREDEFINED_FILTERS, applyFilters, type FilterState, type PredefinedFilterMode } from "./filters";

// Queries the full, unfiltered Windows Update history via the
// Microsoft.Update.Session COM API and copies it as JSON — all filtering
// happens in the tool UI, not in this command. `Date` is explicitly
// formatted as an ISO-8601 string (`.ToString('o')`) before `ConvertTo-Json`
// so the JSON payload is identical regardless of PowerShell version (avoids
// Windows PowerShell 5.1 vs. 7+ [datetime] serialization differences).
// `@(...)` forces a real PowerShell array so ConvertTo-Json always emits
// `[...]`, even when history has just one entry.
const PS_VARIANTS = makePsCommandVariants("$History | ConvertTo-Json -Compress", {
  setup:
    "$Searcher = (New-Object -ComObject Microsoft.Update.Session).CreateUpdateSearcher(); " +
    "$History = @($Searcher.QueryHistory(0, $Searcher.GetTotalHistoryCount()) | Select-Object Title, " +
    "@{Name='Date';Expression={$_.Date.ToString('o')}}, " +
    "@{Name='Categories';Expression={($_.Categories | ForEach-Object Name) -join ', '}}, " +
    "@{Name='UpdateID';Expression={$_.UpdateIdentity.UpdateID}}, " +
    "@{Name='RevisionNumber';Expression={$_.UpdateIdentity.RevisionNumber}}); ",
});

const EXAMPLE_UHE_JSON = JSON.stringify([
  {
    Title: "2026-09 Cumulative Update for Windows 11 Version 24H2 (KB5012345)",
    Date: "2026-09-10T15:44:16.000Z",
    Categories: "",
    UpdateID: "11111111-2222-3333-4444-555555555555",
    RevisionNumber: 201,
  },
  {
    Title: "Security Intelligence Update for Microsoft Defender Antivirus - KB2267602",
    Date: "2026-10-12T08:12:03.000Z",
    Categories: "Microsoft Defender Antivirus",
    UpdateID: "22222222-3333-4444-5555-666666666666",
    RevisionNumber: 1234,
  },
  {
    Title: "2026-10 Security Update for Windows 11 Version 24H2 (KB5054321)",
    Date: "2026-10-14T20:03:41.000Z",
    Categories: "",
    UpdateID: "33333333-4444-5555-6666-777777777777",
    RevisionNumber: 1,
  },
]);

function escapeHtml(value: string): string {
  const div = document.createElement("div");
  div.textContent = value;
  // textContent -> innerHTML escapes &/</> but not quotes, so also escape
  // those explicitly — this value is also used inside HTML attributes
  // (e.g. the filter chips' `title` tooltip) where an unescaped `"` would
  // terminate the attribute early.
  return div.innerHTML.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function formatDate(entry: UpdateHistoryEntry): string {
  if (entry.dateMs === null) return entry.dateRaw || "—";
  return new Date(entry.dateMs).toLocaleString();
}

function formatDay(entry: UpdateHistoryEntry): string {
  if (entry.dateMs === null) return entry.dateRaw || "Unknown date";
  return new Date(entry.dateMs).toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatTime(entry: UpdateHistoryEntry): string {
  if (entry.dateMs === null) return "—";
  return new Date(entry.dateMs).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

/**
 * Quotes a delimited-table field only when needed, doubling any embedded
 * quotes (RFC 4180-style). The delimiter itself is passed in so the same
 * builder can produce both real CSV (comma) and a tab-separated table that
 * pastes directly into Excel columns (comma-separated plain text just
 * lands the whole line in column A when pasted).
 */
function delimitedField(value: string, delimiter: string): string {
  return value.includes('"') || value.includes(delimiter) || /[\r\n]/.test(value)
    ? `"${value.replace(/"/g, '""')}"`
    : value;
}

/** Builds a delimited table (CRLF line endings) from the filtered entries. */
function entriesToTable(entries: UpdateHistoryEntry[], delimiter: string): string {
  const header = ["Title", "Date", "Categories", "Update ID", "Revision Number"];
  const rows = entries.map((e) => [
    e.title,
    e.dateMs === null ? e.dateRaw : new Date(e.dateMs).toISOString(),
    e.categories,
    e.updateId,
    e.revisionNumber === null ? "" : String(e.revisionNumber),
  ]);
  return [header, ...rows].map((row) => row.map((f) => delimitedField(f, delimiter)).join(delimiter)).join("\r\n");
}

/**
 * Wires a text-labeled button (as opposed to copy-button.ts's icon-only
 * `.ipk-copy-btn`) to copy whatever `getValue()` returns, briefly swapping
 * its label to "Copied!" for confirmation. Returns an unwire function.
 */
function wireLabeledCopyButton(button: HTMLButtonElement, getValue: () => string): () => void {
  const originalLabel = button.textContent ?? "Copy";
  const handler = () => {
    const value = getValue();
    if (!value) return;
    void navigator.clipboard.writeText(value).then(() => {
      button.textContent = "Copied!";
      button.classList.add("is-copied");
      setTimeout(() => {
        button.textContent = originalLabel;
        button.classList.remove("is-copied");
      }, 1200);
    });
  };
  button.addEventListener("click", handler);
  return () => button.removeEventListener("click", handler);
}

function errorsHtml(errors: UpdateHistoryParseError[]): string {
  if (errors.length === 0) return "";
  return `<p class="uhe-warn">${errors.map((e) => escapeHtml(e.message)).join("<br/>")}</p>`;
}

function filtersHtml(): string {
  const chips = PREDEFINED_FILTERS.map(
    (f) => `
      <button
        type="button"
        class="uhe-chip"
        data-filter-id="${f.id}"
        data-mode=""
        aria-label="${escapeHtml(f.label)}"
        title="${escapeHtml(f.description)}"
      >
        <span class="uhe-chip-mark"></span>
        <span>${f.label}</span>
      </button>
    `,
  ).join("");

  return `
    <div class="uhe-filters">
      <div class="uhe-filter-group">
        <p class="uhe-filter-label">
          Predefined filters
          <span class="uhe-filter-hint">(click to include only, click again to exclude, click again to clear)</span>
        </p>
        <div class="uhe-chips">${chips}</div>
      </div>

      <div class="uhe-filter-group">
        <p class="uhe-filter-label">Custom column filters <span class="uhe-filter-hint">(comma-separated, case-insensitive)</span></p>
        <div class="uhe-column-filters">
          <div class="uhe-column-filter">
            <label for="uhe-title-include">Title include</label>
            <input type="text" id="uhe-title-include" placeholder="e.g. security, cumulative" />
            <label for="uhe-title-exclude">Title exclude</label>
            <input type="text" id="uhe-title-exclude" placeholder="e.g. defender" />
          </div>
          <div class="uhe-column-filter">
            <label for="uhe-categories-include">Categories include</label>
            <input type="text" id="uhe-categories-include" placeholder="e.g. definition" />
            <label for="uhe-categories-exclude">Categories exclude</label>
            <input type="text" id="uhe-categories-exclude" placeholder="" />
          </div>
        </div>
      </div>

      <div class="uhe-filter-group">
        <p class="uhe-filter-label">Date range</p>
        <div class="uhe-date-range">
          <label for="uhe-date-from">From</label>
          <input type="date" id="uhe-date-from" />
          <label for="uhe-date-to">To</label>
          <input type="date" id="uhe-date-to" />
        </div>
      </div>
    </div>
  `;
}

function tableHtml(entries: UpdateHistoryEntry[]): string {
  if (entries.length === 0) {
    return `<p class="uhe-empty">No entries match the current filters.</p>`;
  }
  const rows = entries
    .map(
      (e) => `
        <tr>
          <td>${escapeHtml(e.title)}</td>
          <td class="uhe-nowrap">${escapeHtml(formatDate(e))}</td>
          <td>${escapeHtml(e.categories) || `<span class="uhe-muted">—</span>`}</td>
          <td class="mono uhe-nowrap">${escapeHtml(e.updateId)}</td>
          <td class="uhe-nowrap">${e.revisionNumber ?? "—"}</td>
        </tr>
      `,
    )
    .join("");
  return `
    <table class="uhe-table">
      <thead>
        <tr>
          <th>Title</th>
          <th>Date</th>
          <th>Categories</th>
          <th>Update ID</th>
          <th>Rev</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

/** Groups entries by calendar day (newest day first, newest entry first within a day). */
function groupEntriesByDay(entries: UpdateHistoryEntry[]): { day: string; entries: UpdateHistoryEntry[] }[] {
  const sorted = [...entries].sort((a, b) => (b.dateMs ?? -Infinity) - (a.dateMs ?? -Infinity));
  const groups: { day: string; entries: UpdateHistoryEntry[] }[] = [];
  for (const entry of sorted) {
    const day = formatDay(entry);
    const last = groups[groups.length - 1];
    if (last && last.day === day) {
      last.entries.push(entry);
    } else {
      groups.push({ day, entries: [entry] });
    }
  }
  return groups;
}

function timelineHtml(entries: UpdateHistoryEntry[]): string {
  if (entries.length === 0) {
    return `<p class="uhe-empty">No entries match the current filters.</p>`;
  }
  const days = groupEntriesByDay(entries)
    .map((group) => {
      const items = group.entries
        .map(
          (e) => `
            <li class="uhe-timeline-entry">
              <div class="uhe-timeline-dot"></div>
              <div class="uhe-timeline-body">
                <div class="uhe-timeline-header">
                  <span class="uhe-timeline-time">${escapeHtml(formatTime(e))}</span>
                  <span class="uhe-timeline-title">${escapeHtml(e.title)}</span>
                </div>
                ${e.categories ? `<p class="uhe-timeline-categories">${escapeHtml(e.categories)}</p>` : ""}
                <p class="uhe-timeline-meta mono">
                  ${escapeHtml(e.updateId) || `<span class="uhe-muted">—</span>`}${
                    e.revisionNumber !== null ? ` · rev ${e.revisionNumber}` : ""
                  }
                </p>
              </div>
            </li>
          `,
        )
        .join("");
      return `
        <li class="uhe-timeline-day">
          <div class="uhe-timeline-day-dot"></div>
          <div class="uhe-timeline-day-body">
            <p class="uhe-timeline-day-header">
              ${escapeHtml(group.day)}
              <span class="uhe-timeline-day-count">(${group.entries.length})</span>
            </p>
            <ol class="uhe-timeline-entries">${items}</ol>
          </div>
        </li>
      `;
    })
    .join("");
  return `<ol class="uhe-timeline">${days}</ol>`;
}

const tool: ToolDefinition = {
  id: "update-history-explorer",
  name: "Update History Explorer",
  description:
    "Paste a device's Windows Update history and filter it by predefined categories (Cumulative, Defender, Driver, .NET, Preview) or custom per-column include/exclude rules.",
  category: "Converters",
  keywords: [
    "windows update",
    "update history",
    "wu history",
    "microsoft.update.session",
    "querysearcher",
    "queryhistory",
    "patch",
    "kb",
    "cumulative update",
    "defender",
  ],
  icon: "🔄",
  mount(container) {
    container.innerHTML = `
      <div class="uhe-tool">
        <p class="ipk-hint">
          <code class="mono">Categories</code> is frequently empty for real Windows Update history entries
          (confirmed from real device data) — mostly only Microsoft Defender Antivirus updates populate it. The
          predefined filters below are best-effort <code class="mono">Title</code>-pattern matches, not an
          authoritative Microsoft classification.
        </p>

        <p class="uhe-step-label">1. Get the update history <span class="ipk-step-note">(copies to clipboard)</span></p>
        ${psCommandTabsHtml("uhe-cmd", { requiresAdmin: true })}

        <p class="uhe-step-label">2. Paste anywhere on the page</p>
        <div class="ipk-field-header">
          <label class="uhe-field-label" for="uhe-input">Update history (JSON)</label>
          <button type="button" id="uhe-example" class="ipk-example-btn">Load example</button>
        </div>
        <textarea
          id="uhe-input"
          class="mono"
          rows="6"
          placeholder='[{"Title":"...","Date":"2026-10-12T15:44:16.000Z","Categories":"","UpdateID":"...","RevisionNumber":1},...]'
        ></textarea>
        <div id="uhe-status" class="uhe-status" role="alert"></div>

        ${filtersHtml()}

        <div class="uhe-results-header">
          <p class="uhe-count" id="uhe-count"></p>
          <div class="uhe-results-actions">
            <div class="uhe-view-toggle" role="radiogroup" aria-label="Results view">
              <button type="button" class="btn btn-primary" data-view="table">Table</button>
              <button type="button" class="btn" data-view="timeline">Timeline</button>
            </div>
            <div class="uhe-copy-actions">
              <button type="button" class="btn uhe-copy-btn" id="uhe-copy-csv">Copy CSV</button>
              <button type="button" class="btn uhe-copy-btn" id="uhe-copy-excel">Copy TSV</button>
            </div>
          </div>
        </div>
        <div id="uhe-results"></div>
      </div>
    `;

    const unwirePsTabs = wirePsCommandTabs(container, "uhe-cmd", PS_VARIANTS);

    const input = container.querySelector<HTMLTextAreaElement>("#uhe-input")!;
    const statusEl = container.querySelector<HTMLDivElement>("#uhe-status")!;
    const countEl = container.querySelector<HTMLParagraphElement>("#uhe-count")!;
    const resultsEl = container.querySelector<HTMLDivElement>("#uhe-results")!;
    const copyCsvBtn = container.querySelector<HTMLButtonElement>("#uhe-copy-csv")!;
    const copyExcelBtn = container.querySelector<HTMLButtonElement>("#uhe-copy-excel")!;

    const chipButtons = Array.from(container.querySelectorAll<HTMLButtonElement>(".uhe-chip"));
    const titleIncludeInput = container.querySelector<HTMLInputElement>("#uhe-title-include")!;
    const titleExcludeInput = container.querySelector<HTMLInputElement>("#uhe-title-exclude")!;
    const categoriesIncludeInput = container.querySelector<HTMLInputElement>("#uhe-categories-include")!;
    const categoriesExcludeInput = container.querySelector<HTMLInputElement>("#uhe-categories-exclude")!;
    const dateFromInput = container.querySelector<HTMLInputElement>("#uhe-date-from")!;
    const dateToInput = container.querySelector<HTMLInputElement>("#uhe-date-to")!;

    let allEntries: UpdateHistoryEntry[] = [];
    let filtered: UpdateHistoryEntry[] = [];
    let viewMode: "table" | "timeline" = "table";

    const viewButtons = Array.from(container.querySelectorAll<HTMLButtonElement>("[data-view]"));
    const setViewMode = (mode: "table" | "timeline") => {
      viewMode = mode;
      for (const btn of viewButtons) btn.classList.toggle("btn-primary", btn.dataset.view === mode);
      renderResults();
    };

    // Cycles each predefined-filter chip through "" -> include -> exclude -> "".
    const nextMode = (mode: string): PredefinedFilterMode | "" =>
      mode === "" ? "include" : mode === "include" ? "exclude" : "";

    const cycleChip = (chip: HTMLButtonElement) => {
      const mode = nextMode(chip.dataset.mode ?? "");
      chip.dataset.mode = mode;
      renderResults();
    };

    const currentFilterState = (): FilterState => {
      const predefinedModes = new Map<string, PredefinedFilterMode>();
      for (const chip of chipButtons) {
        const mode = chip.dataset.mode as PredefinedFilterMode | "" | undefined;
        if (mode === "include" || mode === "exclude") predefinedModes.set(chip.dataset.filterId!, mode);
      }
      return {
        predefinedModes,
        title: { include: titleIncludeInput.value, exclude: titleExcludeInput.value },
        categories: { include: categoriesIncludeInput.value, exclude: categoriesExcludeInput.value },
        dateFrom: dateFromInput.value,
        dateTo: dateToInput.value,
      };
    };

    const renderResults = () => {
      filtered = allEntries.length > 0 ? applyFilters(allEntries, currentFilterState()) : [];
      countEl.textContent =
        allEntries.length > 0 ? `Showing ${filtered.length} of ${allEntries.length} entries` : "";
      resultsEl.innerHTML =
        allEntries.length > 0 ? (viewMode === "timeline" ? timelineHtml(filtered) : tableHtml(filtered)) : "";
    };

    const parseInput = () => {
      const raw = input.value.trim();
      if (!raw) {
        statusEl.textContent = "";
        allEntries = [];
        renderResults();
        return;
      }
      try {
        const { entries, errors } = parseUpdateHistoryExport(raw);
        statusEl.innerHTML = errorsHtml(errors);
        allEntries = entries;
      } catch (err) {
        statusEl.textContent = err instanceof Error ? err.message : "Couldn't parse that input.";
        allEntries = [];
      }
      renderResults();
    };

    const chipClickHandlers = chipButtons.map((chip) => () => cycleChip(chip));
    const viewClickHandlers = viewButtons.map((btn) => () => setViewMode(btn.dataset.view as "table" | "timeline"));

    input.addEventListener("input", parseInput);
    chipButtons.forEach((chip, i) => chip.addEventListener("click", chipClickHandlers[i]));
    viewButtons.forEach((btn, i) => btn.addEventListener("click", viewClickHandlers[i]));
    for (const el of [titleIncludeInput, titleExcludeInput, categoriesIncludeInput, categoriesExcludeInput]) {
      el.addEventListener("input", renderResults);
    }
    for (const el of [dateFromInput, dateToInput]) {
      el.addEventListener("change", renderResults);
    }

    const unwireCopyCsv = wireLabeledCopyButton(copyCsvBtn, () => (filtered.length > 0 ? entriesToTable(filtered, ",") : ""));
    const unwireCopyExcel = wireLabeledCopyButton(copyExcelBtn, () =>
      filtered.length > 0 ? entriesToTable(filtered, "\t") : "",
    );
    const unwireGlobalPaste = wireGlobalPaste(input);

    const exampleBtn = container.querySelector<HTMLButtonElement>("#uhe-example")!;
    const unwireExample = wireExampleButton(exampleBtn, input, () => EXAMPLE_UHE_JSON);

    return () => {
      input.removeEventListener("input", parseInput);
      chipButtons.forEach((chip, i) => chip.removeEventListener("click", chipClickHandlers[i]));
      viewButtons.forEach((btn, i) => btn.removeEventListener("click", viewClickHandlers[i]));
      for (const el of [titleIncludeInput, titleExcludeInput, categoriesIncludeInput, categoriesExcludeInput]) {
        el.removeEventListener("input", renderResults);
      }
      for (const el of [dateFromInput, dateToInput]) {
        el.removeEventListener("change", renderResults);
      }
      unwireCopyCsv();
      unwireCopyExcel();
      unwireGlobalPaste();
      unwirePsTabs();
      unwireExample();
    };
  },
};

export default tool;
