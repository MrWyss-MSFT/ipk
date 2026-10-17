// All times are "device local" wall-clock values stored as UTC-based epoch ms
// so that day arithmetic never shifts with the browser's own DST rules.
export const MIN = 60_000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;

export const BROWSER_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

const fmtCache = new Map<string, Intl.DateTimeFormat>();

/** Offset (wall clock minus UTC) of `tz` at the given instant. */
function tzOffsetMs(instant: number, tz: string): number {
  let fmt = fmtCache.get(tz);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric" });
    fmtCache.set(tz, fmt);
  }
  const p = Object.fromEntries(fmt.formatToParts(new Date(instant)).map((x) => [x.type, +x.value]));
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - Math.floor(instant / MIN) * MIN;
}

export function timeZones(): string[] {
  const list = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
  return list.includes(BROWSER_TZ) ? list : [BROWSER_TZ, ...list];
}

/** Release time (10:00 Pacific on `date`) as a wall-clock value in `tz`, in the same encoding as the rest of the engine. */
export function releaseAt(date: number, tz: string): number {
  const wall = date + 10 * HOUR;
  let instant = wall - tzOffsetMs(wall + 8 * HOUR, "America/Los_Angeles");
  instant = wall - tzOffsetMs(instant, "America/Los_Angeles");
  return instant + tzOffsetMs(instant, tz);
}
export function parseDate(s: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : null;
}

export function fmtDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function fmtDateTime(ms: number): string {
  return new Date(ms).toISOString().slice(0, 16).replace("T", " ");
}

export function startOfDay(ms: number): number {
  return Math.floor(ms / DAY) * DAY;
}

/** 0 = Sunday .. 6 = Saturday */
export function weekday(ms: number): number {
  return new Date(ms).getUTCDay();
}

export function hourOfDay(ms: number): number {
  return (ms - startOfDay(ms)) / HOUR;
}

/** nth (1-based) given weekday (0=Sun) of a month; n=5 means the last one. */
export function nthWeekday(year: number, month: number, wd: number, n: number): number {
  if (n >= 5) {
    const last = Date.UTC(year, month + 1, 0);
    return last - ((weekday(last) - wd + 7) % 7) * DAY;
  }
  const first = Date.UTC(year, month, 1);
  const offset = (wd - weekday(first) + 7) % 7;
  return first + (offset + (n - 1) * 7) * DAY;
}

export function patchTuesday(year: number, month: number): number {
  return nthWeekday(year, month, 2, 2);
}

export function previewTuesday(year: number, month: number): number {
  return nthWeekday(year, month, 2, 4);
}

export function lastDayOfMonth(year: number, month: number): number {
  return Date.UTC(year, month + 1, 0);
}

export function isActiveHour(ms: number, start: number, end: number): boolean {
  const h = hourOfDay(ms);
  return start <= end ? h >= start && h < end : h >= start || h < end;
}

/** First instant >= ms that is outside active hours. */
export function nextOutsideActive(ms: number, start: number, end: number): number {
  if (start === end || !isActiveHour(ms, start, end)) return ms;
  const endMs = startOfDay(ms) + end * HOUR;
  if (start <= end) return endMs;
  return hourOfDay(ms) >= start ? endMs + DAY : endMs;
}

/** First instant >= ms at the given hour of day, optionally on a given weekday (0=Sun; null = any day). */
export function nextSlot(ms: number, hour: number, wd: number | null): number {
  for (let d = 0; d < 9; d++) {
    const t = startOfDay(ms) + d * DAY + hour * HOUR;
    if (t >= ms && (wd === null || weekday(t) === wd)) return t;
  }
  return ms;
}
