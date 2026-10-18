import type { AssumptionId } from "./assumptions";
import { nextRestartOpportunity, onlineWindows, toOnline } from "./availability";
import {
  DAY,
  HOUR,
  MIN,
  lastDayOfMonth,
  nextSlot,
  nthWeekday,
  parseDate,
  releaseAt,
  fmtDateTime,
  patchTuesday,
  startOfDay,
  weekday,
} from "./calendar";
import type { Settings } from "./settings";

export type UpdateKind = "cu" | "preview" | "oob" | "oobns" | "driver" | "software";

export interface Release {
  id: string;
  kind: UpdateKind;
  date: number;
  label: string;
  restart: boolean;
  /** Explicit restart requirement for a release, overriding its automatic behavior. */
  restartOverride?: boolean;
  auto: boolean;
}

export type Tone = "info" | "ok" | "warn" | "danger" | "muted";
export type Lane = "update" | "notify";

export interface SimEvent {
  lane: Lane;
  at: number;
  releaseId: string;
  label: string;
  text: string;
  tone: Tone;
  assumptions: AssumptionId[];
  /** Start of a duration that ends at `at`. */
  from?: number;
  /** End of a duration that starts at `at`. */
  until?: number;
  /** Pending indefinitely; its drawn end follows the displayed range. */
  ongoing?: boolean;
}

export interface TimeWindow {
  start: number;
  end: number;
}

export interface SimResult {
  end: number;
  events: SimEvent[];
  windows: TimeWindow[];
  availability: TimeWindow[];
}

const PAUSE_MAX_DAYS = 35;
// Hotpatch baseline months (Jan, Apr, Jul, Oct) need a restart; the other months are hotpatch months.
const HOTPATCH_BASELINE_MONTHS = new Set([0, 3, 6, 9]);

export const KIND_LABEL: Record<UpdateKind, string> = {
  cu: "Monthly CU",
  preview: "Preview CU",
  oob: "OOB security update",
  oobns: "OOB non-security update",
  driver: "Driver",
  software: "Microsoft product update",
};

/** Predictable Patch Tuesday releases around the selected month. */
export function autoReleases(startMs: number): Release[] {
  const d = new Date(startMs);
  const out: Release[] = [];
  for (let m = -2; m <= 1; m++) {
    const y = d.getUTCFullYear();
    const mo = d.getUTCMonth() + m;
    const pt = patchTuesday(y, mo);
    const date = new Date(pt);
    const name = `${date.getUTCFullYear()}.${String(date.getUTCMonth() + 1).padStart(2, "0")} B`;
    out.push({ id: `cu-${pt}`, kind: "cu", date: pt, label: name, restart: true, auto: true });
  }
  return out;
}

export function maintenanceWindows(s: Settings, from: number, to: number): TimeWindow[] {
  if (!s.mwEnabled) return [];
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.mwStart);
  if (!m) return [];
  const startOffset = +m[1] * HOUR + +m[2] * MIN;
  const dur = Math.min(24, Math.max(2, s.mwDuration || 2)) * HOUR;
  const out: TimeWindow[] = [];
  const once = parseDate(s.mwStartDate);
  for (let day = startOfDay(from) - 2 * DAY; day <= to; day += DAY) {
    let hit = false;
    const dt = new Date(day);
    switch (s.mwRepeat) {
      case 1:
        hit = once === day;
        break;
      case 2:
        hit = true;
        break;
      case 3:
        hit = !!s.mwWeekly[(weekday(day) + 6) % 7];
        break;
      case 4: {
        const y = dt.getUTCFullYear();
        const mo = dt.getUTCMonth();
        if (s.mwMonthlySchedule === 1) hit = dt.getUTCDate() === s.mwDayOfMonth;
        else if (s.mwMonthlySchedule === 3) hit = day === lastDayOfMonth(y, mo);
        else hit = day === nthWeekday(y, mo, s.mwWeekDay - 1, s.mwWeekOccurrence);
        break;
      }
    }
    if (hit) out.push({ start: day + startOffset, end: day + startOffset + dur });
  }
  return out;
}

/** Scheduled install slot; schedFreq 0 = every week, 1-4 = only in that week of the month. */
export function schedSlot(s: Settings, t: number, wd: number | null): number {
  let cur = nextSlot(t, s.schedTime, wd);
  for (let i = 0; i < 70 && s.schedFreq > 0; i++) {
    if (Math.floor((new Date(cur).getUTCDate() - 1) / 7) + 1 === s.schedFreq) break;
    cur = nextSlot(cur + HOUR, s.schedTime, wd);
  }
  return cur;
}

function nextWindowSlot(windows: TimeWindow[], t: number, tailGuard: number): number | null {
  for (const w of windows) {
    const cand = Math.max(t, w.start);
    if (cand < w.end - tailGuard) return cand;
  }
  return null;
}

export function simulate(s: Settings, startMs: number, releases: Release[]): SimResult {
  if (s.autoUpdate === 6) s = { ...s, autoUpdate: 2 };
  const date = new Date(startMs);
  const monthEnd = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
  const windows = maintenanceWindows(s, startMs, monthEnd + 90 * DAY);
  const all: SimEvent[] = [];
  const formatHour = (hour: number) => `${String(Math.floor(hour)).padStart(2, "0")}:${String(Math.round(hour % 1 * 60)).padStart(2, "0")}`;
  const activeHours = s.activeStart === s.activeEnd ? "none" : `${formatHour(s.activeStart)}-${formatHour(s.activeEnd)}`;

  for (const r of releases.filter((r) => r.date < monthEnd).sort((a, b) => a.date - b.date)) {
    const add = (lane: Lane, at: number, text: string, tone: Tone, assumptions: AssumptionId[] = [], from?: number, until?: number) =>
      all.push({ lane, at, releaseId: r.id, label: r.label, text, tone, assumptions, from, until });

    const baseAss: AssumptionId[] = [];
    if (r.auto) baseAss.push("releaseTime");
    if (r.kind === "preview") baseAss.push("previewDate");
    if (r.kind === "oob" || r.kind === "oobns" || r.kind === "driver") baseAss.push("userEvents");
    if (r.kind === "driver") baseAss.push("driverDeferral");
    const release = releaseAt(r.date, s.tz);
    add("update", release, "Update released", "info", baseAss);

    if (r.kind === "software") {
      const assumptions: AssumptionId[] = ["softwareUpdates", "discoveryImmediate", "installDuration"];
      if (!s.allowMUUpdateService) {
        add("update", release, "Not offered in this model: Microsoft product updates are not enabled (AllowMUUpdateService = 0)", "muted", assumptions);
        continue;
      }
      const discovery = toOnline(s, release);
      if (!s.onlineAlways) assumptions.push("onlineHours");
      add("update", discovery, "Discovered / offered through Microsoft Update", "info", assumptions);
      const downloadStart = discovery;
      const ready = downloadStart + s.downloadMin * MIN;
      let install = s.autoUpdate === 0 || s.autoUpdate === 5 ? null
        : s.autoUpdate === 3 ? schedSlot(s, ready, s.schedDay === 0 ? null : s.schedDay - 1)
        : nextSlot(ready, 3, null);
      if (install === null) {
        add("update", discovery, "Waiting for the user; nothing installs automatically", "warn", assumptions);
        continue;
      }
      install = toOnline(s, install);
      add("update", ready, "Downloaded", "info", assumptions, downloadStart);
      add("update", install + s.installMin * MIN, "Installed (product restart behavior not modeled)", "ok", assumptions, install);
      continue;
    }

    if (r.kind === "driver" && s.excludeDrivers) {
      add("update", release, "Not offered: drivers excluded from quality updates", "muted", [...baseAss, "excludeDriversName"]);
      continue;
    }

    const cp = s.cloudEnabled && r.kind !== "driver" ? s.cloud[r.kind] : null;
    const offerAss = [...baseAss];
    if (cp) offerAss.push("cloudOverridesClient");
    const hotpatchOn = !!cp && s.hotpatch;
    if (hotpatchOn && (r.kind === "preview" || r.kind === "oobns")) {
      add("update", release, "Not offered: hotpatch is enabled, non-security updates would take the device off the hotpatch path", "muted", [...offerAss, "hotpatchNonSecurity"]);
      continue;
    }
    let deferDays = s.deferDays;
    let offer: number;
    if (cp && !cp.auto) {
      offerAss.push("manualApproval");
      if (cp.approveAfter === null) {
        add("update", release, "Not offered: manual approval is required and no approval is given", "muted", offerAss);
        continue;
      }
      offer = release + cp.approveAfter * DAY;
    } else {
      if (cp) deferDays = cp.defer;
      offer = release + deferDays * DAY;
      if (deferDays > 0)
        add("update", release, `Deferral period (${deferDays} days from release)`, "muted", offerAss.slice(), undefined, offer);
    }
    const ps = s.pauseEnabled ? parseDate(s.pauseStart) : null;
    if (ps !== null && offer >= ps && offer < ps + PAUSE_MAX_DAYS * DAY) {
      if (cp) offerAss.push("cloudClientPause");
      add("update", offer, "Offer held back by quality update pause", "warn", [...offerAss, "pauseModel"]);
      offer = ps + PAUSE_MAX_DAYS * DAY;
      offerAss.push("pauseModel");
    }

    if (r.kind === "preview") offerAss.push("cloudOptionalContent");

    offer = toOnline(s, offer);
    if (!s.onlineAlways) offerAss.push("onlineHours");
    add("update", offer, cp && !cp.auto ? "Discovered / offered (manually approved)" : "Discovered / offered", "info", [...offerAss, "discoveryImmediate"]);

    const ready = offer + s.downloadMin * MIN;
    const ass: AssumptionId[] = ["discoveryImmediate", "installDuration"];
    const mwOn = s.mwEnabled;
    const deadlineAt = s.deadlineEnabled ? offer + s.deadlineDays * DAY : null;
    if (deadlineAt !== null)
      add("update", offer, `Deadline period (${s.deadlineDays} days from scan discovery)`, "warn", ["deadlineClock", ...(s.deadlineDays === 0 ? ["deadlineZero" as const] : [])], undefined, deadlineAt);
    if (deadlineAt !== null) ass.push("deadlineClock", "deadlineImmediate");
    if (deadlineAt !== null && s.deadlineDays === 0) ass.push("deadlineZero");

    // ---- installation
    let inst: number | null;
    let forcedInstall = false;
    const schedWd = s.schedDay === 0 ? null : s.schedDay - 1;

    if (mwOn && s.mwActions <= 2) {
      ass.push("mwWindow");
      inst = nextWindowSlot(windows, ready, 0);
    } else if (deadlineAt !== null) {
      ass.push("autoUpdateVsDeadline");
      if (s.autoUpdate === 3) {
        inst = schedSlot(s, ready, schedWd);
      } else if (s.autoUpdate === 0 || s.autoUpdate === 5) {
        inst = null;
      } else {
        inst = ready;
      }
    } else if (s.autoUpdate === 0 || s.autoUpdate === 5) {
      inst = null;
    } else if (s.autoUpdate === 3) {
      inst = schedSlot(s, ready, schedWd);
    } else {
      ass.push("maintenanceAt3");
      if (s.autoUpdate === 4) ass.push("mode4");
      inst = nextSlot(ready, 3, null);
    }

    if (deadlineAt !== null && (inst === null || inst > deadlineAt)) {
      if (inst !== null && mwOn) ass.push("mwWindow");
      inst = Math.max(deadlineAt, ready);
      forcedInstall = true;
    }

    if (inst !== null) inst = toOnline(s, inst);
    if (inst === null) {
      add("update", offer, `Waiting for the user (AllowAutoUpdate = ${s.autoUpdate}); nothing installs automatically`, "warn", ass);
      if (s.autoUpdate === 0 && s.notifLevel === 0)
        add("notify", offer, "Notification: updates are available to download", "info", ["noReminders"]);
      continue;
    }

    add("update", ready, mwOn && s.mwActions === 2 ? "Downloaded (install waits for the maintenance window)" : "Downloaded", "info", ["installDuration"], toOnline(s, offer));
    const instDone = inst + s.installMin * MIN;
    const scheduledHotpatch = hotpatchOn && r.kind === "cu" && !HOTPATCH_BASELINE_MONTHS.has(new Date(r.date).getUTCMonth());
    const hasRestartOverride = r.restartOverride !== undefined;
    const restartRequired = hasRestartOverride
      ? r.restartOverride
      : r.kind === "oob" || r.kind === "oobns" || (!scheduledHotpatch && r.restart);
    const hotpatched = hotpatchOn && r.kind === "cu" && !restartRequired;
    const noRestartOverride = hasRestartOverride && !restartRequired && !hotpatched;
    if (hasRestartOverride) ass.push("restartOverride");
    const base = forcedInstall ? "Installed (forced by the deadline)" : "Installed";
    add("update", instDone, hotpatched ? `${base} as hotpatch, no restart needed` : noRestartOverride ? `${base} (release override: no restart required)` : base, forcedInstall ? "danger" : "ok", [...ass, ...(hotpatched ? (["hotpatchEligible", "hotpatchCalendar"] as AssumptionId[]) : [])], inst);
    if (hotpatched) continue;
    if (!restartRequired) continue;

    // ---- restart
    const pending = instDone;
    const grace = s.deadlineEnabled ? s.graceDays * DAY : 0;
    const effDeadline = deadlineAt !== null ? Math.max(deadlineAt, pending + grace) : null;
    const rAss: AssumptionId[] = s.autoUpdate === 3 && !mwOn ? ["mode3Countdown"] : ["activeHours"];
    if (hasRestartOverride) rAss.push("restartOverride");
    if (!s.onlineAlways) rAss.push("onlineHours");
    let earliest = pending + 15 * MIN;
    const blockEarlyRestart = effDeadline !== null && s.noAutoReboot;
    if (blockEarlyRestart) {
      rAss.push("noAutoReboot");
    }
    const userOptIn = s.userRestartNotify;
    const windowRestart = mwOn;
    const autoRestartMode = windowRestart || s.autoUpdate === 2 || s.autoUpdate === 4 || (deadlineAt !== null && s.autoUpdate !== 3 && s.autoUpdate !== 1 && s.autoUpdate !== 0 && s.autoUpdate !== 5);

    let cand: number | null = null;
    if (windowRestart) {
      rAss.push("mwWindow");
      if (userOptIn) earliest = Math.max(earliest, pending + 24 * HOUR);
      if (!blockEarlyRestart)
        cand = nextRestartOpportunity(s, earliest, effDeadline, windows.map((w) => ({ start: w.start, end: w.end - 30 * MIN })));
    } else if (s.autoUpdate === 3 && !blockEarlyRestart) {
      const online = toOnline(s, earliest);
      cand = effDeadline === null || online < effDeadline ? online : null;
    } else if (autoRestartMode && !blockEarlyRestart) {
      if (userOptIn) earliest = Math.max(earliest, pending + 24 * HOUR);
      cand = nextRestartOpportunity(s, earliest, effDeadline);
    }

    let restartAt: number | null = cand;
    let forced = false;
    if (effDeadline !== null && (cand === null || cand >= effDeadline)) {
      restartAt = effDeadline;
      forced = true;
      rAss.push("deadlineForcedRestart");
    }

    // ---- notifications
    const lvl = s.notifLevel;
    const notify = (at: number, text: string, kind: "toast" | "warning" | "deadline", extra: AssumptionId[]) => {
      const shown = kind === "deadline" || (kind === "warning" ? lvl <= 1 : lvl === 0);
      if (!shown) return;
      let when = at;
      const a: AssumptionId[] = [...extra];
      if (lvl === 1 || lvl === 2) a.push("notifLevelMeaning");
      all.push({
        lane: "notify",
        at: when,
        releaseId: r.id,
        label: r.label,
        text: s.userSignedIn ? text : `${text} (no user signed in)`,
        tone: s.userSignedIn ? (kind === "deadline" ? "danger" : "info") : "muted",
        assumptions: a,
      });
    };

    if (restartAt === null) {
      all.push({
        lane: "update",
        at: pending,
        releaseId: r.id,
        label: r.label,
        text: "Restart pending: no eligible automatic restart opportunity or automatic restart is disabled; user can restart manually, no deadline set (continues beyond the calendar)",
        tone: "warn",
        assumptions: rAss,
        until: monthEnd,
        ongoing: true,
      });
      notify(pending, "Restart required: user must schedule the restart", "toast", ["notifyDefaultOff"]);
      continue;
    }

    restartAt = toOnline(s, restartAt);
    all.push({
      lane: "update",
      at: pending,
      releaseId: r.id,
      label: r.label,
      text:
        effDeadline !== null && s.noAutoReboot
          ? `Restart pending: user can schedule it; no automatic restart until both the deadline and grace period expire (${fmtDateTime(effDeadline)})`
          : forced && cand === null && effDeadline !== null
            ? `Restart pending: no eligible online automatic restart opportunity before the effective deadline (${fmtDateTime(effDeadline)}); user can restart manually`
            : windowRestart
              ? "Restart pending: user can schedule it; otherwise it happens in the maintenance window"
              : s.autoUpdate === 3
                ? "Restart pending: scheduled-install countdown; local active hours are ignored (unverified simulator assumption)"
              : `Restart pending: user can schedule it; Windows can restart outside active hours (${activeHours})${effDeadline !== null ? `, until the effective deadline (${fmtDateTime(effDeadline)})` : ""}`,
      tone: "info",
      assumptions: ["restartPending", ...rAss],
      until: restartAt,
    });

    const toastAt = userOptIn ? pending : pending + 24 * HOUR;
    if (s.autoUpdate === 1 && !windowRestart) {
      notify(pending, "Updates installed: restart required, user schedules it", "toast", ["notifyDefaultOff"]);
    } else if (toastAt < restartAt - 15 * MIN) {
      notify(
        toastAt,
        userOptIn
          ? "Restart required toast (opt-in is On; automatic restarts blocked for 24 hours)"
          : "Restart required toast (24 hours after restart became pending)",
        "toast",
        ["notifyDefaultOff"],
      );
    }
    if (forced) {
      const warningAt = Math.max(pending, restartAt - 15 * MIN);
      const onlineWarningAt = toOnline(s, warningAt);
      if (onlineWarningAt < restartAt) {
        notify(onlineWarningAt, onlineWarningAt === restartAt - 15 * MIN
          ? "Restart in 15 minutes (effective deadline)"
          : "Restart required shortly (effective deadline)", "deadline", ["deadlineForcedRestart"]);
      }
    } else notify(restartAt - 15 * MIN, "Restart in 15 minutes", "warning", []);
    all.push({
      lane: "update",
      at: restartAt,
      releaseId: r.id,
      label: r.label,
      text: forced && effDeadline !== null
        ? restartAt > effDeadline
          ? "Forced restart (device back online after the effective deadline, active hours ignored)"
          : "Forced restart (effective deadline reached, active hours ignored)"
        : windowRestart
          ? "Restart (inside the maintenance window)"
          : s.autoUpdate === 3
            ? "Restart (scheduled install, after countdown)"
            : `Restart (active hours ${activeHours} respected)`,
      tone: forced ? "danger" : "ok",
      assumptions: rAss,
    });
  }

  const events = all.filter((e) => e.at >= startMs || e.ongoing || (e.until ?? e.at) > startMs).sort((a, b) => a.at - b.at);
  const lastEvent = events.reduce((latest, e) => Math.max(latest, e.at, e.ongoing ? e.at : e.until ?? e.at), startMs);
  const end = Math.max(monthEnd, startOfDay(lastEvent) + DAY);
  for (const e of events) if (e.ongoing) e.until = end;
  return { end, events, windows: windows.filter((w) => w.end > startMs && w.start < end), availability: onlineWindows(s, startMs, end) };
}
