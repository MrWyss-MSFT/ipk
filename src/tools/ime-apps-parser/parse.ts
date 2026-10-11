/**
 * Parses "Get policies" JSON blobs captured from the Intune Management
 * Extension's AppWorkload.log into timestamped snapshots, then diffs
 * consecutive snapshots per-app so a timeline UI can highlight what changed.
 *
 * Field decoding confidence:
 * - `Intent` is confirmed against the community `AppWorkloadJsonDecoder`
 *   script (github.com/thejimoneil/AppWorkloadJsonDecoder) and matches
 *   Microsoft's documented Win32 app assignment intents.
 * - `TargetType` has no official documentation found; the 1=User/2=Device
 *   labels below are best-effort (community-reported, unconfirmed) and are
 *   always shown alongside the raw number rather than replacing it.
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

/** Best-effort / unconfirmed — see file header. Shown with the raw number, never instead of it. */
export const TARGET_TYPE_LABELS: Record<number, string> = {
  1: "User",
  2: "Device",
};

export function intentLabel(intent: number | null): string {
  if (intent === null) return "—";
  return INTENT_LABELS[intent] ? `${INTENT_LABELS[intent]} (${intent})` : String(intent);
}

export function targetTypeLabel(targetType: number | null): string {
  if (targetType === null) return "—";
  return TARGET_TYPE_LABELS[targetType] ? `${TARGET_TYPE_LABELS[targetType]}? (${targetType})` : String(targetType);
}

/**
 * CMTrace log lines carry `time="HH:mm:ss.fff+NNN"` (sub-second digit count
 * and UTC-bias format both vary) and `date="MM-dd-yyyy"`. Only relative
 * ordering within one device's own logs matters here, so the fractional
 * seconds and bias suffix are simply dropped rather than fully parsed.
 */
function parseCmTraceDateTime(dateStr: string, timeStr: string): number | null {
  const dateMatch = /^(\d{2})-(\d{2})-(\d{4})$/.exec(dateStr.trim());
  const timeMatch = /^(\d{2}):(\d{2}):(\d{2})/.exec(timeStr.trim());
  if (!dateMatch || !timeMatch) return null;
  const [, mm, dd, yyyy] = dateMatch;
  const [, HH, MI, SS] = timeMatch;
  const ms = new Date(`${yyyy}-${mm}-${dd}T${HH}:${MI}:${SS}`).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Parses the JSON array produced by this tool's export command: a list of
 * `{Date, Time, Apps}` snapshots. PowerShell's `ConvertTo-Json` silently
 * unwraps single-element arrays into a bare object (both for the outer
 * snapshot list and each snapshot's `Apps` list) — both cases are normalized
 * back into arrays here so a single "Get policies" line, or a snapshot with
 * only one app, doesn't break parsing.
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
  const outerArray = Array.isArray(outer) ? outer : [outer];

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
    const appsRaw = obj.Apps;
    const appsArray = Array.isArray(appsRaw) ? appsRaw : appsRaw ? [appsRaw] : [];

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

    snapshots.push({ timestampMs: parseCmTraceDateTime(dateRaw, timeRaw), dateRaw, timeRaw, apps });
  });

  snapshots.sort((a, b) => (a.timestampMs ?? 0) - (b.timestampMs ?? 0));

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
