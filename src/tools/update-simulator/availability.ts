import { DAY, HOUR, nextOutsideActive, startOfDay } from "./calendar";
import type { Settings } from "./settings";

export interface OnlineWindow {
  start: number;
  end: number;
}

/** Overnight periods belong to the weekday on which they start. */
export function onlineWindows(s: Settings, start: number, end: number): OnlineWindow[] {
  if (s.onlineAlways) return [{ start, end }];
  if (s.weeklySchedule) {
    if (!s.weeklySchedule.length) throw new RangeError("Add at least one online period.");
    const windows: OnlineWindow[] = [];
    for (let day = startOfDay(start) - DAY; day < end; day += DAY) {
      const weekday = (new Date(day).getUTCDay() + 6) % 7;
      for (const period of s.weeklySchedule.filter((p) => p.day === weekday)) {
        const a = Math.max(start, day + period.start * 60_000);
        const b = Math.min(end, day + period.end * 60_000);
        if (b > a) windows.push({ start: a, end: b });
      }
    }
    const merged: OnlineWindow[] = [];
    for (const window of windows.sort((a, b) => a.start - b.start)) {
      const last = merged[merged.length - 1];
      if (last && window.start <= last.end) last.end = Math.max(last.end, window.end);
      else merged.push({ ...window });
    }
    return merged;
  }
  if (!s.onlineDays.some(Boolean)) throw new RangeError("Select at least one online day.");
  const windows: OnlineWindow[] = [];
  for (let day = startOfDay(start) - DAY; day < end; day += DAY) {
    if (!s.onlineDays[(new Date(day).getUTCDay() + 6) % 7]) continue;
    const fullDay = s.onlineStart === s.onlineEnd;
    const a = day + (fullDay ? 0 : s.onlineStart) * HOUR;
    const b = day + (fullDay ? 24 : s.onlineEnd + (s.onlineEnd < s.onlineStart ? 24 : 0)) * HOUR;
    const clippedStart = Math.max(a, start), clippedEnd = Math.min(b, end);
    if (clippedEnd > clippedStart) windows.push({ start: clippedStart, end: clippedEnd });
  }
  return windows;
}

export function toOnline(s: Settings, at: number): number {
  if (s.onlineAlways) return at;
  const next = onlineWindows(s, at, startOfDay(at) + 8 * DAY)[0];
  if (!next) throw new RangeError("No online period found in the weekly device schedule.");
  return next.start;
}

/** Find a simultaneous online / outside-active-hours opportunity, not two independent shifts. */
export function nextRestartOpportunity(s: Settings, at: number, latest: number | null, windows?: OnlineWindow[]): number | null {
  const allowed = windows ?? [{ start: at, end: at + 8 * DAY }];
  for (const window of allowed) {
    const start = Math.max(at, window.start);
    const end = Math.min(window.end, latest ?? Infinity);
    if (end <= start) continue;
    for (const online of onlineWindows(s, start, end)) {
      const candidate = nextOutsideActive(online.start, s.activeStart, s.activeEnd);
      if (candidate < online.end) return candidate;
    }
  }
  return null;
}
