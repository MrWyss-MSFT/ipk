/**
 * Parses the JSON exported by this tool's PowerShell command — a list of
 * Windows Update history entries queried via the `Microsoft.Update.Session`
 * COM API (`CreateUpdateSearcher().QueryHistory(...)`).
 *
 * The export command formats `Date` as an ISO-8601 string
 * (`$_.Date.ToString('o')`) before `ConvertTo-Json`, specifically so this
 * parser never has to deal with PowerShell's version-dependent `[datetime]`
 * JSON serialization (Windows PowerShell 5.1's `/Date(...)/ ` vs.
 * PowerShell 7+'s near-ISO format) — it only ever sees a plain string.
 */

export interface UpdateHistoryEntry {
  title: string;
  /** Epoch ms parsed from the ISO date string, or null if missing/unparseable. */
  dateMs: number | null;
  dateRaw: string;
  /**
   * Joined category names (e.g. "Microsoft Defender Antivirus"). Frequently
   * empty in real-world QueryHistory() results — confirmed from a real
   * device's export — so predefined filters mostly match on `title`
   * instead of relying on this field.
   */
  categories: string;
  updateId: string;
  revisionNumber: number | null;
  /** Full original object, kept for the raw-JSON copy/debug view. */
  raw: Record<string, unknown>;
}

export interface UpdateHistoryParseError {
  message: string;
}

/** True for PowerShell 5.1's `{"value": [...], "Count": n}` array serialization quirk. */
function isCountWrapper(value: unknown): value is { value: unknown; Count: unknown } {
  return (
    !!value &&
    typeof value === "object" &&
    "value" in (value as Record<string, unknown>) &&
    "Count" in (value as Record<string, unknown>)
  );
}

/**
 * Normalizes a value that should be a JSON array. Handles PowerShell
 * `ConvertTo-Json` quirks: a single-element array collapses into a bare
 * object (so a device with just one update in its history isn't an array
 * at all), and Windows PowerShell 5.1 can serialize an array as
 * `{"value": [...], "Count": n}` instead of a plain array. Same pattern
 * used by the IME Apps Parser tool — see its `parse.ts` for more detail.
 */
function normalizeArray(value: unknown): unknown[] {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) {
    if (value.length === 1 && isCountWrapper(value[0])) {
      return normalizeArray(value[0]);
    }
    return value;
  }
  if (isCountWrapper(value)) {
    return normalizeArray(value.value);
  }
  return [value];
}

function parseDateMs(raw: string): number | null {
  if (!raw) return null;
  const ms = Date.parse(raw);
  return Number.isNaN(ms) ? null : ms;
}

export function parseUpdateHistoryExport(raw: string): {
  entries: UpdateHistoryEntry[];
  errors: UpdateHistoryParseError[];
} {
  let outer: unknown;
  try {
    outer = JSON.parse(raw);
  } catch {
    throw new Error("Couldn't parse that as JSON — paste the full output of the command above.");
  }
  if (outer === null || typeof outer !== "object") {
    throw new Error("Expected a JSON array (or object) of update history entries.");
  }

  const errors: UpdateHistoryParseError[] = [];
  const entries: UpdateHistoryEntry[] = [];

  normalizeArray(outer).forEach((item, i) => {
    if (!item || typeof item !== "object") {
      errors.push({ message: `Entry ${i + 1}: not an object, skipped.` });
      return;
    }
    const obj = item as Record<string, unknown>;
    const dateRaw = String(obj.Date ?? "");
    entries.push({
      title: String(obj.Title ?? "(no title)"),
      dateMs: parseDateMs(dateRaw),
      dateRaw,
      categories: String(obj.Categories ?? ""),
      updateId: String(obj.UpdateID ?? ""),
      revisionNumber: typeof obj.RevisionNumber === "number" ? obj.RevisionNumber : null,
      raw: obj,
    });
  });

  return { entries, errors };
}
