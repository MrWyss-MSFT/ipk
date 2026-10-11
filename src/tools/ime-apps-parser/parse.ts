/**
 * Parses "Get policies" JSON blobs captured from the Intune Management
 * Extension's AppWorkload.log into timestamped snapshots, then diffs
 * consecutive snapshots per-app so a timeline UI can highlight what changed.
 *
 * Field decoding confidence:
 * - `Intent` is confirmed against the community `AppWorkloadJsonDecoder`
 *   script (github.com/thejimoneil/AppWorkloadJsonDecoder) and matches
 *   Microsoft's documented Win32 app assignment intents.
 * - `TargetType` has no official Microsoft docs, but is confirmed via
 *   decompiled IME source (community writeup: msendpointmgr.com's
 *   "Win32 app State Messages Demystified") as 0=None, 1=User, 2=Device,
 *   3=Both Device and User. Still shown alongside the raw number.
 * - Every other field is left as-is (raw) rather than guessing — the
 *   timeline/diff view surfaces raw field-level changes regardless, so
 *   nothing is lost by not decoding every nested enum.
 */

export interface ImeAppPolicy {
  id: string;
  name: string;
  version: number | null;
  intent: number | null;
  targetType: number | null;
  /** Full original app object, kept for the raw JSON view and field diffing. */
  raw: Record<string, unknown>;
}

export interface ImeSnapshot {
  /** Epoch ms parsed from the log line's CMTrace `date`/`time` attributes, or null if unparseable. */
  timestampMs: number | null;
  /**
   * True when `timeRaw` carried an explicit `±bias` suffix, meaning
   * `timestampMs` is a real UTC instant safe to convert to the viewer's own
   * local timezone for display. Some devices' AppWorkload.log entries omit
   * the bias entirely (just `HH:mm:ss.fffffff`, no sign) — in that case
   * `timestampMs` only preserves relative ordering and must be displayed
   * back out verbatim (as UTC) rather than converted, since we have no way
   * to know which timezone the device's clock was actually in.
   */
  hasBias: boolean;
  dateRaw: string;
  timeRaw: string;
  apps: ImeAppPolicy[];
}

export interface ImeParseError {
  message: string;
}

export const INTENT_LABELS: Record<number, string> = {
  0: "Not Applicable",
  1: "Available",
  3: "Required",
  4: "Uninstall",
  5: "Available Without Enrollment",
};

/** Confirmed via decompiled IME source — see file header. Shown with the raw number regardless. */
export const TARGET_TYPE_LABELS: Record<number, string> = {
  0: "None",
  1: "User",
  2: "Device",
  3: "Both Device and User",
};

export function intentLabel(intent: number | null): string {
  if (intent === null) return "—";
  return INTENT_LABELS[intent] ? `${INTENT_LABELS[intent]} (${intent})` : String(intent);
}

export function targetTypeLabel(targetType: number | null): string {
  if (targetType === null) return "—";
  return TARGET_TYPE_LABELS[targetType] ? `${TARGET_TYPE_LABELS[targetType]} (${targetType})` : String(targetType);
}

/**
 * CMTrace log lines carry `time="HH:mm:ss.fff±BBB"` (sub-second digit count
 * varies) and `date="M-d-yyyy"` — note the month/day are *not* zero-padded
 * (e.g. `10-5-2026`), so both can be 1 or 2 digits.
 *
 * `±BBB`, when present, is the device's UTC bias in minutes, with `+`
 * meaning the device's local clock is *ahead of* UTC (e.g. `+120` = UTC+2)
 * and `-` meaning it's behind UTC (e.g. `-420` = UTC-7). That's the opposite
 * sign convention from the raw Win32 `TIME_ZONE_INFORMATION.Bias` field. To
 * get a true UTC instant: `UTC = local_wallclock − bias`.
 *
 * Some AppWorkload.log builds omit the bias entirely (just
 * `HH:mm:ss.fffffff`, no sign) — there's then no way to know the device's
 * timezone at all, so `hasBias` is reported back to the caller, which must
 * display the value back out as-is (not convert it) in that case.
 *
 * We always parse the wall-clock part as if it were UTC (so the browser's
 * own timezone never leaks into the numeric value), then subtract the bias
 * — when there is one — to land on the real UTC instant.
 */
function parseCmTraceDateTime(dateStr: string, timeStr: string): { ms: number; hasBias: boolean } | null {
  const dateMatch = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(dateStr.trim());
  const timeMatch = /^(\d{1,2}):(\d{1,2}):(\d{1,2})(?:\.\d+)?([+-]\d{1,4})?/.exec(timeStr.trim());
  if (!dateMatch || !timeMatch) return null;
  const [, mm, dd, yyyy] = dateMatch;
  const [, HH, MI, SS, biasStr] = timeMatch;
  const pad = (s: string) => s.padStart(2, "0");
  const ms = Date.parse(`${yyyy}-${pad(mm)}-${pad(dd)}T${pad(HH)}:${pad(MI)}:${pad(SS)}Z`);
  if (Number.isNaN(ms)) return null;
  if (!biasStr) return { ms, hasBias: false };
  const biasMinutes = Number.parseInt(biasStr, 10);
  return { ms: ms - biasMinutes * 60_000, hasBias: true };
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
 * `ConvertTo-Json` quirks seen in real exports: it silently unwraps a
 * single-element array into a bare object (so a snapshot with just one app
 * isn't an array at all), and on Windows PowerShell 5.1 it can serialize a
 * `System.Object[]` of `PSCustomObject`s (e.g. from `ConvertFrom-Json`) as
 * `{"value": [...], "Count": n}` instead of a plain array — at any nesting
 * depth, regardless of element count, and sometimes with an extra
 * PowerShell-array wrapper around it (e.g. forcing the source expression
 * with `@(...)` can leave the `{value, Count}` object as the sole element
 * of a one-item array rather than serializing it directly). All of these
 * are unwrapped back into a real array here.
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

/**
 * Parses the JSON array produced by this tool's export command: a list of
 * `{Date, Time, Apps}` snapshots. Both the outer snapshot list and each
 * snapshot's `Apps` list go through `normalizeArray()` so a single
 * "Get policies" line, a snapshot with only one app, or Windows PowerShell
 * 5.1's `{"value": [...], "Count": n}` serialization quirk all parse the
 * same as a plain array.
 *
 * Snapshots are returned in input order, not re-sorted by their parsed
 * timestamp: `Select-String -Path 'AppWorkload*.log'` already yields
 * matches in true chronological order (log lines are appended in order
 * within each file, and rotated backups are named
 * `AppWorkload-yyyyMMdd-HHmmss.log` so the current `AppWorkload.log` sorts
 * last). Re-sorting by the embedded CMTrace timestamp would actually be
 * *less* reliable — devices without a `±bias` in their timestamp (see
 * `hasBias`) have no real UTC instant to sort by, so a timezone change
 * partway through the log would throw a timestamp-based sort off right at
 * that point, whereas the physical log order is unaffected by the device's
 * clock/timezone settings.
 */
export function parseImeAppsExport(raw: string): { snapshots: ImeSnapshot[]; errors: ImeParseError[] } {
  let outer: unknown;
  try {
    outer = JSON.parse(raw);
  } catch {
    throw new Error("Couldn't parse that as JSON — paste the full output of the export command above.");
  }
  if (!outer || typeof outer !== "object") {
    throw new Error("Expected a JSON array (or object) of {Date, Time, Apps} snapshots.");
  }
  const outerArray = normalizeArray(outer);

  const errors: ImeParseError[] = [];
  const snapshots: ImeSnapshot[] = [];

  outerArray.forEach((entry, i) => {
    if (!entry || typeof entry !== "object") {
      errors.push({ message: `Entry ${i + 1}: not an object, skipped.` });
      return;
    }
    const obj = entry as Record<string, unknown>;
    const dateRaw = String(obj.Date ?? "");
    const timeRaw = String(obj.Time ?? "");
    const appsArray = normalizeArray(obj.Apps);

    const apps: ImeAppPolicy[] = [];
    for (const a of appsArray) {
      if (!a || typeof a !== "object") continue;
      const app = a as Record<string, unknown>;
      apps.push({
        id: String(app.Id ?? ""),
        name: String(app.Name ?? "(unnamed)"),
        version: typeof app.Version === "number" ? app.Version : null,
        intent: typeof app.Intent === "number" ? app.Intent : null,
        targetType: typeof app.TargetType === "number" ? app.TargetType : null,
        raw: app,
      });
    }

    const parsed = parseCmTraceDateTime(dateRaw, timeRaw);
    snapshots.push({
      timestampMs: parsed ? parsed.ms : null,
      hasBias: parsed ? parsed.hasBias : false,
      dateRaw,
      timeRaw,
      apps,
    });
  });

  return { snapshots, errors };
}

export type ImeAppStatus = "added" | "removed" | "changed" | "unchanged";

export interface ImeFieldDiff {
  key: string;
  from: string;
  to: string;
}

export interface ImeAppDiff {
  id: string;
  name: string;
  status: ImeAppStatus;
  /** The later ("to") version of the app; for "removed", the last-known version. */
  app: ImeAppPolicy;
  fieldDiffs: ImeFieldDiff[];
}

/** Deterministic stringify so key-order differences alone don't register as a change. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`)
    .join(",")}}`;
}

function formatFieldValue(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (typeof v === "string") return v.length > 160 ? `${v.slice(0, 160)}…` : v;
  return JSON.stringify(v);
}

/**
 * Compares one snapshot's apps against the previous snapshot's (by `Id`),
 * flagging additions, removals, and per-field changes. Pass `prevApps: null`
 * for the very first snapshot — everything in it is the baseline, not a
 * "change", so it's reported as "unchanged" rather than "added".
 */
export function diffApps(prevApps: ImeAppPolicy[] | null, currApps: ImeAppPolicy[]): ImeAppDiff[] {
  const prevById = new Map((prevApps ?? []).map((a) => [a.id, a]));
  const currIds = new Set(currApps.map((a) => a.id));
  const diffs: ImeAppDiff[] = [];

  for (const curr of currApps) {
    const prev = prevById.get(curr.id);
    if (!prev) {
      diffs.push({ id: curr.id, name: curr.name, status: prevApps === null ? "unchanged" : "added", app: curr, fieldDiffs: [] });
      continue;
    }
    const fieldDiffs: ImeFieldDiff[] = [];
    const keys = new Set([...Object.keys(prev.raw), ...Object.keys(curr.raw)]);
    for (const key of keys) {
      const a = stableStringify(prev.raw[key]);
      const b = stableStringify(curr.raw[key]);
      if (a !== b) {
        fieldDiffs.push({
          key,
          from: prev.raw[key] === undefined ? "—" : formatFieldValue(prev.raw[key]),
          to: curr.raw[key] === undefined ? "—" : formatFieldValue(curr.raw[key]),
        });
      }
    }
    diffs.push({ id: curr.id, name: curr.name, status: fieldDiffs.length > 0 ? "changed" : "unchanged", app: curr, fieldDiffs });
  }

  for (const prev of prevApps ?? []) {
    if (!currIds.has(prev.id)) {
      diffs.push({ id: prev.id, name: prev.name, status: "removed", app: prev, fieldDiffs: [] });
    }
  }

  const order: Record<ImeAppStatus, number> = { added: 0, removed: 1, changed: 2, unchanged: 3 };
  diffs.sort((x, y) => order[x.status] - order[y.status] || x.name.localeCompare(y.name));
  return diffs;
}
