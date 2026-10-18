import { DAY, HOUR, fmtDate, fmtDateTime, patchTuesday, releaseAt, timeZones } from "./calendar";
import { schedSlot, type Release, type SimResult, type SimEvent } from "./simulate";
import { ASSUMPTIONS, assumptionPlain } from "./assumptions";
import { onlineWindows } from "./availability";
import { LOCAL_ACTIVE_HOURS_HELP, type Settings } from "./settings";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const daysInMonth = (start: number) => {
  const d = new Date(start);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
};
export type EventGroup = "offer" | "deploy" | "notify";
export const eventGroup = (e: SimEvent): EventGroup =>
  e.lane === "notify" ? "notify" : /^(Update released|Deferral period|Discovered \/ offered)/.test(e.text) ? "offer"
    : e.from !== undefined || e.until !== undefined || /^(Downloaded|Installed|Restart|Forced restart|Deadline period)/.test(e.text) ? "deploy" : "offer";

function activityName(e: SimEvent): string {
  if (e.lane === "notify") {
    if (/15 minutes|Restart required shortly/.test(e.text)) return "Restart countdown";
    if (e.text.startsWith("Notification: updates")) return "Updates available";
    return "Restart notification";
  }
  if (e.text.startsWith("Update released")) return "Update released";
  if (e.text.startsWith("Deferral period")) return "Deferral period";
  if (e.text.startsWith("Discovered / offered")) return "Discovery / Offering";
  if (e.text.startsWith("Deadline period")) return "Deadline period";
  if (e.text.startsWith("Downloaded")) return "Downloading";
  if (e.text.startsWith("Installed")) return "Installing";
  if (e.text.startsWith("Restart pending")) return "Restart pending";
  if (e.text.startsWith("Forced restart")) return "Forced restart";
  if (e.text.startsWith("Restart")) return "Device restart";
  return e.text;
}

export function durationText(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor(minutes % 1440 / 60);
  const mins = minutes % 60;
  return [days ? `${days}d` : "", hours ? `${hours}h` : "", mins || !minutes ? `${mins}m` : ""].filter(Boolean).join(" ");
}

export function setTimelineZoom(root: HTMLElement, level: number, anchor?: { clientX: number; previousClientX?: number }): void {
  const viewport = root.querySelector<HTMLElement>(".wus-timeline-viewport");
  const plot = root.querySelector<HTMLElement>(".wus-timeline-plot");
  if (!viewport || !plot) return;
  level = Math.round(Math.min(8, Math.max(0, level)) * 100) / 100;
  const left = viewport.getBoundingClientRect().left + viewport.clientLeft;
  const offset = (clientX: number) => Math.min(viewport.clientWidth, Math.max(0, clientX - left));
  const nextX = anchor ? offset(anchor.clientX) : viewport.clientWidth / 2;
  const previousX = anchor ? offset(anchor.previousClientX ?? anchor.clientX) : nextX;
  const center = (viewport.scrollLeft + previousX) / plot.clientWidth;
  const zoom = 2 ** level;
  const start = Number(plot.dataset.start), days = Number(plot.dataset.days);
  plot.style.width = `${zoom * days / daysInMonth(start) * 100}%`;
  viewport.scrollLeft = Math.max(0, center * plot.clientWidth - nextX);
  const slider = root.querySelector<HTMLInputElement>("#wus-zoom");
  const zoomLabel = level === 0 ? "Full month" : `${Number(zoom.toFixed(2))}×`;
  if (slider) {
    slider.value = String(level);
    slider.setAttribute("aria-valuetext", zoomLabel);
  }
  const output = root.querySelector<HTMLOutputElement>("#wus-zoom-value");
  if (output) output.value = zoomLabel;
  const step = zoom >= 64 ? HOUR : zoom >= 8 ? 6 * HOUR : DAY;
  if (plot.dataset.tickStep === String(step)) return;
  plot.dataset.tickStep = String(step);
  const monthLabel = new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" });
  const ticks: string[] = [];
  for (let at = start; at < start + days * DAY; at += step) {
    const midnight = (at - start) % DAY === 0;
    const date = new Date(at);
    const monthStart = midnight && date.getUTCDate() === 1;
    const weekday = WEEKDAYS[date.getUTCDay()];
    const dayLabel = monthStart ? monthLabel.format(at) : `<span class="wus-weekday-initial" aria-hidden="true">${weekday[0]}</span><span class="wus-weekday-short" aria-hidden="true">${weekday.slice(0, 2)}</span><span class="wus-weekday-full" aria-hidden="true">${weekday}</span>`;
    ticks.push(`<span class="wus-timeline-tick${midnight ? " is-day" : ""}${monthStart ? " is-month" : ""}" style="left:${(at - start) / (days * DAY) * 100}%" title="${fmtDateTime(at)}">${midnight ? `<small${monthStart ? "" : ` aria-label="${weekday}"`}>${dayLabel}</small>${date.getUTCDate()}` : fmtDateTime(at).slice(11)}</span>`);
  }
  plot.querySelector<HTMLElement>(".wus-timeline-axis")!.innerHTML = ticks.join("");
}

export function wireTimelineInteractions(root: HTMLElement): () => void {
  let pinch: { viewport: HTMLElement; distance: number; clientX: number } | null = null;
  let activeTarget: HTMLElement | null = null;
  let keyboardFocusTarget: HTMLElement | null = null;
  let describedTarget: HTMLElement | null = null;
  let previousDescription: string | null = null;
  let activeTitle: string | null = null;
  let keyboardNavigation = false;
  const tooltip = document.createElement("div");
  tooltip.className = "wus-tooltip";
  tooltip.id = "wus-tooltip";
  tooltip.setAttribute("role", "tooltip");
  tooltip.hidden = true;
  document.body.append(tooltip);
  const hideTooltip = () => {
    if (activeTarget) {
      describedTarget?.removeAttribute("aria-describedby");
      if (describedTarget && previousDescription !== null)
        describedTarget.setAttribute("aria-describedby", previousDescription);
      if (activeTitle !== null) activeTarget.setAttribute("title", activeTitle);
    }
    activeTarget = null;
    describedTarget = null;
    previousDescription = null;
    activeTitle = null;
    tooltip.hidden = true;
  };
  const showTooltip = (target: HTMLElement, descriptionTarget = target) => {
    const text = target.dataset.tooltip ?? target.getAttribute("title");
    if (!text) return;
    if (activeTarget !== target) {
      hideTooltip();
      activeTarget = target;
      activeTitle = target.getAttribute("title");
      if (activeTitle !== null) target.removeAttribute("title");
      tooltip.textContent = text;
    }
    if (describedTarget !== descriptionTarget) {
      describedTarget?.removeAttribute("aria-describedby");
      if (describedTarget && previousDescription !== null)
        describedTarget.setAttribute("aria-describedby", previousDescription);
      describedTarget = descriptionTarget;
      previousDescription = descriptionTarget.getAttribute("aria-describedby");
      descriptionTarget.setAttribute("aria-describedby", [previousDescription, tooltip.id].filter(Boolean).join(" "));
    }
    tooltip.hidden = false;
    const rect = target.getBoundingClientRect();
    const gap = 8, margin = 8;
    const width = tooltip.offsetWidth, height = tooltip.offsetHeight;
    const left = rect.right + gap + width <= window.innerWidth - margin
      ? rect.right + gap
      : Math.max(margin, rect.left - gap - width);
    const top = Math.min(Math.max(margin, rect.top + rect.height / 2 - height / 2), window.innerHeight - height - margin);
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  };
  const viewportAt = (target: EventTarget | null) =>
    target instanceof Element ? target.closest<HTMLElement>(".wus-timeline-viewport") : null;
  const tooltipTargetAt = (target: EventTarget | null) =>
    target instanceof Element ? target.closest<HTMLElement>("[title], [data-tooltip]") : null;
  const hideTooltipIfInactive = (target: HTMLElement) => {
    if (activeTarget === target && !target.matches(":hover") && keyboardFocusTarget !== target) hideTooltip();
  };
  const level = () => Number(root.querySelector<HTMLInputElement>("#wus-zoom")!.value);
  const zoomTo = (nextLevel: number, anchor: { clientX: number; previousClientX?: number }) => {
    setTimelineZoom(root, nextLevel, anchor);
    root.querySelector<HTMLInputElement>("#wus-zoom")!.dispatchEvent(new Event("input", { bubbles: true }));
  };
  const touchSpan = (touches: TouchList) => ({
    distance: Math.hypot(touches[1].clientX - touches[0].clientX, touches[1].clientY - touches[0].clientY),
    clientX: (touches[0].clientX + touches[1].clientX) / 2,
  });
  const onWheel = (event: WheelEvent) => {
    const viewport = viewportAt(event.target);
    if (!event.ctrlKey || !viewport) return;
    event.preventDefault();
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.clientWidth : 1;
    zoomTo(level() - event.deltaY * unit / 100, { clientX: event.clientX });
  };
  const onTouchStart = (event: TouchEvent) => {
    const viewport = viewportAt(event.target);
    pinch = event.touches.length === 2 && viewport ? { viewport, ...touchSpan(event.touches) } : null;
    if (pinch) event.preventDefault();
  };
  const onTouchMove = (event: TouchEvent) => {
    if (event.touches.length !== 2 || !pinch?.viewport.isConnected) {
      pinch = null;
      return;
    }
    event.preventDefault();
    const span = touchSpan(event.touches);
    if (span.distance > 0 && pinch.distance > 0)
      zoomTo(level() + Math.log2(span.distance / pinch.distance), { clientX: span.clientX, previousClientX: pinch.clientX });
    pinch = { viewport: pinch.viewport, ...span };
  };
  const onTouchEnd = () => { pinch = null; };
  const onPointerOver = (event: PointerEvent) => {
    const target = tooltipTargetAt(event.target);
    if (target && !target.contains(event.relatedTarget as Node | null)) showTooltip(target);
  };
  const onPointerOut = (event: PointerEvent) => {
    const target = tooltipTargetAt(event.target)
      ?? (event.target instanceof Node && activeTarget?.contains(event.target) ? activeTarget : null);
    if (target && !target.contains(event.relatedTarget as Node | null)) hideTooltipIfInactive(target);
  };
  const onFocusIn = (event: FocusEvent) => {
    const target = tooltipTargetAt(event.target);
    if (target && keyboardNavigation) {
      keyboardFocusTarget = target;
      showTooltip(target, event.target instanceof HTMLElement ? event.target : target);
    }
  };
  const onFocusOut = (event: FocusEvent) => {
    const target = tooltipTargetAt(event.target)
      ?? (event.target instanceof Node && activeTarget?.contains(event.target) ? activeTarget : null);
    if (target && keyboardFocusTarget === target) {
      keyboardFocusTarget = null;
      hideTooltipIfInactive(target);
    }
  };
  const onPointerDown = () => {
    keyboardNavigation = false;
    keyboardFocusTarget = null;
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (["Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter", " "].includes(event.key))
      keyboardNavigation = true;
  };
  root.addEventListener("wheel", onWheel, { passive: false });
  root.addEventListener("touchstart", onTouchStart, { passive: false });
  root.addEventListener("touchmove", onTouchMove, { passive: false });
  root.addEventListener("touchend", onTouchEnd);
  root.addEventListener("touchcancel", onTouchEnd);
  root.addEventListener("pointerover", onPointerOver);
  root.addEventListener("pointerout", onPointerOut);
  root.addEventListener("focusin", onFocusIn);
  root.addEventListener("focusout", onFocusOut);
  document.addEventListener("pointerdown", onPointerDown);
  document.addEventListener("keydown", onKeyDown);
  return () => {
    hideTooltip();
    tooltip.remove();
    root.removeEventListener("wheel", onWheel);
    root.removeEventListener("touchstart", onTouchStart);
    root.removeEventListener("touchmove", onTouchMove);
    root.removeEventListener("touchend", onTouchEnd);
    root.removeEventListener("touchcancel", onTouchEnd);
    root.removeEventListener("pointerover", onPointerOver);
    root.removeEventListener("pointerout", onPointerOut);
    root.removeEventListener("focusin", onFocusIn);
    root.removeEventListener("focusout", onFocusOut);
    document.removeEventListener("pointerdown", onPointerDown);
    document.removeEventListener("keydown", onKeyDown);
    pinch = null;
  };
}

export function renderTimeline(start: number, result: SimResult, releases: Release[], tz: string, settings: Settings, hiddenGroups: ReadonlySet<EventGroup> = new Set()): string {
  const end = result.end, days = (end - start) / DAY;
  const pct = (at: number) => (at - start) / (end - start) * 100;
  const numbered = result.events.map((e, i) => ({ e, n: i + 1 }));
  const shown = numbered.filter(({ e }) => !hiddenGroups.has(eventGroup(e)));
  const onlineTotal = result.availability.reduce((total, w) => total + w.end - w.start, 0);
  const alwaysOnline = onlineTotal === end - start;
  let labels = `<div class="wus-timeline-group"><a class="wus-config-link" href="#wus-device-availability">Device availability</a></div><div class="wus-timeline-label"><strong>Online<em>${durationText(onlineTotal)}</em></strong><small>${alwaysOnline ? "Always on & connected" : `${result.availability.length} online periods · gaps are offline`}</small></div>`;
  const availabilityBars = result.availability.map((w) => {
    const title = esc(`Device online: ${fmtDateTime(w.start)} to ${fmtDateTime(w.end)}`);
    return `<span class="wus-timeline-availability" role="img" aria-label="${title}" title="${title}" style="left:${pct(w.start)}%;width:${pct(w.end) - pct(w.start)}%"></span>`;
  }).join("");
  let tracks = `<div class="wus-timeline-group-track"></div><div class="wus-timeline-track">${availabilityBars}</div>`;
  const scheduledInstall = settings.installMode === "scheduled" && settings.schedSub === "scheduled";
  const policyActiveHours = settings.installMode === "scheduled" && settings.schedSub === "active";
  const mode = scheduledInstall ? "si" : policyActiveHours ? "ah" : "lah";
  const modeName = scheduledInstall ? "Scheduled Install" : policyActiveHours ? "Active Hours" : "Local Active Hours";
  const modeHelp = scheduledInstall
    ? "Configured install schedule, not guaranteed install events. Device availability and deadlines can affect execution."
    : policyActiveHours ? "Policy-defined active hours. ActiveHoursStart and ActiveHoursEnd take precedence over locally configured active hours."
    : LOCAL_ACTIVE_HOURS_HELP;
  const activePeriods = scheduledInstall || settings.activeStart === settings.activeEnd ? [] : onlineWindows({
    ...settings,
    onlineAlways: false,
    onlineDays: [true, true, true, true, true, true, true],
    onlineStart: settings.activeStart,
    onlineEnd: settings.activeEnd,
  }, start, end).flatMap((active) => result.availability.flatMap((online) => {
    const start = Math.max(active.start, online.start), end = Math.min(active.end, online.end);
    return end > start ? [{ start, end }] : [];
  }));
  const activeTotal = activePeriods.reduce((total, w) => total + w.end - w.start, 0);
  const activeBars = activePeriods.map((w) => {
    const title = esc(`${modeName} while device online: ${fmtDateTime(w.start)} to ${fmtDateTime(w.end)} (${tz}). Automatic restarts are blocked during active hours before the effective deadline.`);
    return `<span class="wus-timeline-availability wus-timeline-active-hours" role="img" aria-label="${title}" title="${title}" style="left:${pct(w.start)}%;width:${pct(w.end) - pct(w.start)}%"></span>`;
  }).join("");
  const installTimes: number[] = [];
  if (scheduledInstall) {
    const weekday = settings.schedDay === 0 ? null : settings.schedDay - 1;
    for (let at = schedSlot(settings, start, weekday); at < end; at = schedSlot(settings, at + HOUR, weekday)) {
      installTimes.push(at);
    }
  }
  const scheduleBars = installTimes.map((at) => {
    const title = esc(`Configured scheduled install: ${fmtDateTime(at)} (${tz}). This is a schedule, not an actual install event; device availability and deadlines can affect execution.`);
    return `<span class="wus-timeline-install-slot" role="img" aria-label="${title}" title="${title}" style="left:${pct(at)}%"></span>`;
  }).join("");
  labels += `<div class="wus-timeline-group"><a class="wus-config-link" href="#wus-user-behavior">User behavior</a></div><div class="wus-timeline-label wus-behavior-label" title="${esc(modeHelp)}" tabindex="0"><strong><span class="wus-behavior-name wus-behavior-${mode}" aria-label="${modeName}"><span class="wus-behavior-full" aria-hidden="true">${modeName}</span><span class="wus-behavior-short" aria-hidden="true">${mode.toUpperCase()}</span></span><em>${scheduledInstall ? `${installTimes.length} slots` : durationText(activeTotal)}</em></strong><small>User ${settings.userSignedIn ? "signed in" : "not signed in"} · Restart notification ${settings.userRestartNotify ? "On" : "Off"}</small></div>`;
  tracks += `<div class="wus-timeline-group-track"></div><div class="wus-timeline-track">${scheduledInstall ? scheduleBars : activeBars}</div>`;
  const dateLabel = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  const shortDate = (at: number) => `${dateLabel.format(at)} · ${fmtDateTime(at).slice(11)}`;
  for (const release of releases) {
    const activities = shown.filter(({ e }) => e.releaseId === release.id);
    if (!activities.length) continue;
    const download = activities.find(({ e }) => e.text.startsWith("Downloaded"));
    const installation = activities.find(({ e }) => e.text.startsWith("Installed"));
    labels += `<div class="wus-timeline-group" title="${esc(release.label)}">${esc(release.label)}</div>`;
    tracks += '<div class="wus-timeline-group-track"></div>';
    for (const { e, n } of activities) {
      if (installation && e === download?.e) continue;
      if (download && e === installation?.e && download.e.from !== undefined && e.from !== undefined) {
        const downloadMinutes = Math.round((download.e.at - download.e.from) / 60_000);
        const installMinutes = Math.round((e.at - e.from) / 60_000);
        const total = `${downloadMinutes + installMinutes}m`;
        const equation = `${downloadMinutes}m + ${installMinutes}m = ${total}`;
        const name = "Downloading + Installing";
        const title = esc(`${release.label}: ${name}\n${equation} (processing time; excludes waiting)\nDownload: ${fmtDateTime(download.e.from)} to ${fmtDateTime(download.e.at)}\nInstallation: ${fmtDateTime(e.from)} to ${fmtDateTime(e.at)}\n${e.text}`);
        labels += `<button type="button" class="wus-timeline-label wus-processing-label" data-n="${n}" title="${title}"><strong><span aria-label="${name}"><span class="wus-processing-full">Downloading + Installing</span><span class="wus-processing-short" aria-hidden="true">DL + Install</span></span><em aria-label="${equation}"><span class="wus-processing-equation">${equation}</span><span class="wus-processing-total" aria-hidden="true">${total}</span></em></strong><small>${shortDate(download.e.from)} → ${shortDate(e.at)}</small></button>`;
        const bars = [download, { e, n }].map(({ e: phase, n: phaseNumber }) => {
          const a = phase.from!, b = phase.at;
          const left = pct(Math.max(start, a)), width = Math.max(0, pct(Math.min(end, b)) - left);
          const phaseTitle = esc(`${release.label}: ${phase.text}\n${fmtDateTime(a)} to ${fmtDateTime(b)} (${durationText(b - a)})`);
          return `<button type="button" class="wus-timeline-mark wus-tone-${phase.tone} is-duration" data-n="${phaseNumber}" style="left:${left}%;width:${width}%;" data-tooltip="${phaseTitle}" aria-label="${phaseTitle}"><span>${durationText(b - a)}</span></button>`;
        }).join("");
        tracks += `<div class="wus-timeline-track">${bars}</div>`;
        continue;
      }
      const a = e.from ?? e.at, b = e.until ?? e.at;
      const duration = b > a;
      const ongoing = e.ongoing;
      const timing = ongoing ? `Since ${shortDate(a)}` : !duration ? shortDate(e.at) : fmtDate(a) === fmtDate(b)
        ? `${shortDate(a)}–${fmtDateTime(b).slice(11)}`
        : `${shortDate(a)} → ${shortDate(b)}`;
      const name = activityName(e);
      const title = esc(`${release.label}: ${e.text}\n${fmtDateTime(a)}${duration && !ongoing ? ` to ${fmtDateTime(b)} (${durationText(b - a)})` : ""}`);
      const durationLabel = ongoing ? "Ongoing" : durationText(b - a);
      labels += `<button type="button" class="wus-timeline-label" data-n="${n}" title="${title}"><strong>${esc(name)}${duration ? `<em>${durationLabel}</em>` : ""}</strong><small>${timing}</small></button>`;
      const left = pct(Math.max(start, a)), width = duration ? pct(Math.min(end, b)) - left : 0;
      tracks += `<div class="wus-timeline-track"><button type="button" class="wus-timeline-mark wus-tone-${e.tone}${duration ? " is-duration" : e.lane === "notify" ? " is-notification" : " is-moment"}" data-n="${n}" style="left:${left}%;${duration ? `width:${width}%;` : ""}" data-tooltip="${title}" aria-label="${title}">${duration ? `<span>${durationLabel}</span>` : ""}</button></div>`;
    }
  }
  const background = Array.from({ length: days }, (_, d) => {
    const day = start + d * DAY, weekend = [0, 6].includes(new Date(day).getUTCDay());
    return `<div class="wus-timeline-day${weekend ? " is-weekend" : ""}${new Date(day).getUTCDate() === 1 ? " is-month" : ""}" style="left:${d / days * 100}%;width:${100 / days}%"></div>`;
  }).join("");
  const firstMonth = new Date(start);
  const patches: string[] = [];
  for (let offset = 0; ; offset++) {
    const date = patchTuesday(firstMonth.getUTCFullYear(), firstMonth.getUTCMonth() + offset);
    const at = releaseAt(date, tz);
    if (at >= end) break;
    if (at >= start) patches.push(`<div class="wus-timeline-patch" style="left:${pct(at)}%" title="Patch Tuesday · ${fmtDateTime(at)}"><span>PT</span></div>`);
  }
  const windows = result.windows.map((w) => {
    const a = Math.max(start, w.start), b = Math.min(end, w.end);
    return b > a ? `<div class="wus-timeline-window" style="left:${pct(a)}%;width:${pct(b) - pct(a)}%" title="Maintenance window ${fmtDateTime(a)} – ${fmtDateTime(b)}"></div>` : "";
  }).join("");
  const rows = numbered.map(({ e, n }) => {
    const notes = [...new Set(e.assumptions)].map((id) => {
      const a = ASSUMPTIONS[id];
      return `<a class="wus-assume" href="${a.url}" target="_blank" rel="noopener" title="${esc(assumptionPlain(a.text))}">Assumption</a>`;
    }).join(" ");
    return `<tr id="wus-row-${n}"><td>${n}</td><td class="wus-nowrap">${fmtDateTime(e.at)}</td><td>${e.lane === "update" ? "Update" : "Notification"}</td><td>${esc(e.label)}</td><td>${esc(e.text)}</td><td>${notes}</td></tr>`;
  }).join("");
  return `
    <div class="wus-timeline-controls">
      <div class="wus-calendar-controls" role="group" aria-label="Timeline month and time zone">
        <button type="button" class="wus-btn" data-month-step="-1" aria-label="Previous month" title="Previous month">‹</button>
        <label class="wus-month">${new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: "UTC" }).format(start)}<input type="month" id="wus-month" aria-label="Month" value="${fmtDate(start).slice(0, 7)}"></label>
        <button type="button" class="wus-btn" data-month-step="1" aria-label="Next month" title="Next month">›</button>
        <select id="wus-tz" class="wus-tz" aria-label="Device time zone" title="Device time zone">${timeZones().map((z) => `<option${z === tz ? " selected" : ""}>${esc(z)}</option>`).join("")}</select>
      </div>
      <div class="wus-zoom" role="group" aria-label="Timeline zoom" title="Pinch or Ctrl + mouse wheel over the timeline to zoom. Click the zoom value to fit the month.">
        <button type="button" class="wus-btn" data-zoom-step="-1" aria-label="Zoom out" title="Zoom out">−</button>
        <input type="range" id="wus-zoom" aria-label="Timeline zoom" min="0" max="8" step="0.01" value="0">
        <button type="button" class="wus-btn" data-zoom-step="1" aria-label="Zoom in" title="Zoom in">+</button>
        <button type="button" class="wus-btn wus-zoom-reset" id="wus-fit" title="Reset zoom to fit month" aria-label="Reset zoom to fit month"><output id="wus-zoom-value" for="wus-zoom">Full month</output></button>
      </div>
      <details class="wus-layers">
        <summary>Activities · ${3 - hiddenGroups.size}</summary>
        <div class="wus-timeline-filters" role="group" aria-label="Visible timeline activity groups">${([["offer", "Discovery & offer"], ["deploy", "Download, install & restart"], ["notify", "Notifications"]] as const).map(([g, label]) => `<label class="wus-filter-option"><input type="checkbox" data-grp="${g}"${hiddenGroups.has(g) ? "" : " checked"}> ${label}</label>`).join("")}</div>
      </details>
    </div>
    <div class="wus-timeline">
      <div class="wus-timeline-labels"><div class="wus-timeline-heading">Activity<small>Dates & times · ${esc(tz)}</small></div>${labels || '<div class="wus-timeline-group">No visible activities</div>'}</div>
      <div class="wus-timeline-viewport" tabindex="0" role="region" aria-label="Update schedule. Pinch or Ctrl + mouse wheel to zoom; scroll horizontally for later events.">
        <div class="wus-timeline-plot" data-start="${start}" data-days="${days}" style="--wus-days:${days};width:${days / daysInMonth(start) * 100}%">
          ${background}${windows}<div class="wus-timeline-axis"></div>${patches}<div class="wus-timeline-tracks">${tracks || '<div class="wus-timeline-group-track"></div>'}</div>
        </div>
      </div>
    </div>
    <details class="wus-group wus-event-details"><summary class="wus-summary" id="wus-event-details-summary">Events (${numbered.length})</summary><div class="ipk-table-scroll"><table class="wus-table">
      <thead><tr><th>#</th><th>When</th><th>Lane</th><th>Update</th><th>Event</th><th>Notes</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="6">No events in this period.</td></tr>'}</tbody>
    </table></div></details>`;
}
