/**
 * Predefined "hide these" category filters plus custom per-column
 * include/exclude text filters and a date range, combined by `applyFilters`.
 *
 * The predefined filters are best-effort `title`/`categories` pattern
 * matches, not an authoritative Microsoft classification — Windows
 * Update's `Categories` COM property is frequently empty in real
 * `QueryHistory()` results (confirmed from a real device export), so most
 * rules key off `title` wording/shape instead. Treat these as a reasonable
 * starting point, not ground truth; nothing here is documented by
 * Microsoft as a stable title format.
 */
import type { UpdateHistoryEntry } from "./parse";

export interface PredefinedFilter {
  id: string;
  label: string;
  /** Plain-language explanation of the match rule, shown as a hover tooltip. */
  description: string;
  /** True when `entry` belongs to this category. */
  test(entry: UpdateHistoryEntry): boolean;
}

export const PREDEFINED_FILTERS: PredefinedFilter[] = [
  {
    id: "cumulative",
    label: "Cumulative / Feature Updates",
    description:
      'Title starts with "YYYY-MM ... (KBxxxxx) (build.number)" (e.g. "2026-02 Update (KB5077868) ' +
      '(28000.1575)"), or contains "Cumulative Update" — excluding anything titled "Preview Update".',
    // e.g. "2026-02 Update (KB5077868) (28000.1575)" or an explicit
    // "Cumulative Update for Windows ..." title — two parenthesized groups
    // (KB + build number) is the most reliable shape seen in real data.
    // Excludes "Preview Update" titles, which share that same shape but are
    // their own predefined filter below.
    test: (e) =>
      !/preview update/i.test(e.title) &&
      (/^\d{4}-\d{2}\s.+\(KB\d+\)\s*\(\d[\d.]*\)/i.test(e.title) || /cumulative update/i.test(e.title)),
  },
  {
    id: "preview",
    label: "Preview Updates",
    description: 'Title contains "Preview Update".',
    test: (e) => /preview update/i.test(e.title),
  },
  {
    id: "defender",
    label: "Defender Updates",
    description: 'Title or Categories contains "Defender" (e.g. Security Intelligence / platform updates).',
    test: (e) => /defender/i.test(e.title) || /defender/i.test(e.categories),
  },
  {
    id: "dotnet",
    label: ".NET Updates",
    description: 'Title contains ".NET" as a whole word.',
    test: (e) => /\.net\b/i.test(e.title),
  },
  {
    id: "driver",
    label: "Driver Updates",
    description: 'Title contains "Driver".',
    test: (e) => /driver/i.test(e.title),
  },
  {
    id: "hardware",
    label: "Hardware Updates",
    description: 'Title contains "Hardware Update" (e.g. "<Vendor> System Hardware Update").',
    test: (e) => /hardware update/i.test(e.title),
  },
  {
    id: "store",
    label: "Store Apps",
    description:
      "Title starts with a 10-14 character alphanumeric Microsoft Store product ID followed by a hyphen " +
      '(e.g. "9NRZT3Q9R3DL-Microsoft.WindowsAppRuntime.2").',
    // Microsoft Store app updates delivered through QueryHistory() use the
    // Store product ID as the title prefix, e.g.
    // "9NRZT3Q9R3DL-Microsoft.WindowsAppRuntime.2" — a 10-14 char
    // alphanumeric Store product ID followed by a hyphen and the package
    // name. Not documented by Microsoft as a stable format, but consistent
    // across every Store-delivered entry seen in real data.
    test: (e) => /^[A-Z0-9]{10,14}-/.test(e.title.trim()),
  },
];

export type PredefinedFilterMode = "include" | "exclude";

export interface ColumnTextFilter {
  /** Comma-separated, case-insensitive substrings; empty means "no filter". */
  include: string;
  exclude: string;
}

export interface FilterState {
  /**
   * Per-predefined-filter mode: "include" means only entries matching that
   * filter (or any other "include" filter — OR'd together) pass; "exclude"
   * means entries matching that filter are hidden. A filter with no entry
   * here doesn't affect results.
   */
  predefinedModes: Map<string, PredefinedFilterMode>;
  title: ColumnTextFilter;
  categories: ColumnTextFilter;
  /** ISO yyyy-mm-dd strings from <input type="date">, or "" for no bound. */
  dateFrom: string;
  dateTo: string;
}

export function createDefaultFilterState(): FilterState {
  return {
    predefinedModes: new Map(),
    title: { include: "", exclude: "" },
    categories: { include: "", exclude: "" },
    dateFrom: "",
    dateTo: "",
  };
}

function splitTerms(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function matchesColumnFilter(value: string, filter: ColumnTextFilter): boolean {
  const haystack = value.toLowerCase();
  const includeTerms = splitTerms(filter.include);
  if (includeTerms.length > 0 && !includeTerms.some((t) => haystack.includes(t))) return false;
  const excludeTerms = splitTerms(filter.exclude);
  if (excludeTerms.length > 0 && excludeTerms.some((t) => haystack.includes(t))) return false;
  return true;
}

/**
 * Pure filter pass — combines predefined include/exclude toggles, per-column
 * include/exclude, and a date range. Excludes are AND'd (any match hides the
 * entry); includes are OR'd (an entry must match at least one "include"
 * filter, if any are active, to pass).
 */
export function applyFilters(entries: UpdateHistoryEntry[], state: FilterState): UpdateHistoryEntry[] {
  const excludeFilters = PREDEFINED_FILTERS.filter((f) => state.predefinedModes.get(f.id) === "exclude");
  const includeFilters = PREDEFINED_FILTERS.filter((f) => state.predefinedModes.get(f.id) === "include");
  const fromMs = state.dateFrom ? Date.parse(`${state.dateFrom}T00:00:00Z`) : null;
  // Add a day so the "to" bound is inclusive of the whole selected day.
  const toMs = state.dateTo ? Date.parse(`${state.dateTo}T00:00:00Z`) + 24 * 60 * 60 * 1000 : null;

  return entries.filter((entry) => {
    if (excludeFilters.some((f) => f.test(entry))) return false;
    if (includeFilters.length > 0 && !includeFilters.some((f) => f.test(entry))) return false;
    if (!matchesColumnFilter(entry.title, state.title)) return false;
    if (!matchesColumnFilter(entry.categories, state.categories)) return false;
    if (entry.dateMs !== null) {
      if (fromMs !== null && entry.dateMs < fromMs) return false;
      if (toMs !== null && entry.dateMs >= toMs) return false;
    }
    return true;
  });
}
