import { WEEKDAYS, type OnlinePeriod, type Settings } from "./settings";
import { mountBehaviorEditor } from "./behavior-editor";

export const DEFAULT_SCHEDULE: OnlinePeriod[] = Array.from({ length: 5 }, (_, day) => ({ day, start: 480, end: 1020 }));

export function parseSchedule(value: string): OnlinePeriod[] {
  const periods: unknown = JSON.parse(value);
  if (!Array.isArray(periods) || !periods.length || !periods.every((p: unknown): p is OnlinePeriod =>
    typeof p === "object" && p !== null && "day" in p && "start" in p && "end" in p &&
    typeof p.day === "number" && Number.isInteger(p.day) && p.day >= 0 && p.day <= 6 &&
    typeof p.start === "number" && Number.isInteger(p.start) && p.start >= 0 && p.start < 1440 &&
    typeof p.end === "number" && Number.isInteger(p.end) && p.end > p.start && p.end <= p.start + 1440)) {
    throw new Error("Add at least one valid online period (maximum 24 hours each).");
  }
  return periods;
}

const time = (minutes: number) => `${String(Math.floor(minutes % 1440 / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
const minutes = (value: string) => {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
};

export function wireScheduleEditor(container: HTMLElement, field: HTMLTextAreaElement, zone: () => string, settings: () => Pick<Settings, "installMode" | "schedSub" | "activeStart" | "activeEnd">): { open: () => void; cleanup: () => void } {
  const dialog = document.createElement("dialog");
  dialog.className = "wus-schedule";
  dialog.setAttribute("aria-labelledby", "wus-schedule-title");
  container.append(dialog);
  let draft: OnlinePeriod[] = [];
  let selected = -1;
  let returnFocus: HTMLElement | null = null;
  let behaviorLauncher = false;
  let behavior: ReturnType<typeof mountBehaviorEditor>;
  let showOverriddenLah = false;
  let localHours = { start: 0, end: 0, overridden: false };
  const paintActiveHours = (start: number, end: number, overridden: boolean) => {
    localHours = { start, end, overridden };
    dialog.querySelectorAll(".wus-schedule-lah").forEach((block) => block.remove());
    const policy = settings();
    const policyHours = policy.installMode === "scheduled" && policy.schedSub === "active";
    const legend = dialog.querySelector<HTMLButtonElement>("[data-action='toggle-lah']")!;
    legend.setAttribute("aria-pressed", String(!policyHours || showOverriddenLah));
    legend.title = policyHours ? "Show or hide overridden Local Active Hours for comparison. Policy-defined Active Hours take precedence." : "Local Active Hours repeated daily. Edit using the horizontal control below.";
    legend.disabled = !policyHours;
    legend.hidden = overridden && !policyHours;
    dialog.querySelector<HTMLElement>(".wus-legend-ah")!.hidden = !policyHours;
    dialog.querySelector<HTMLElement>(".wus-hours-precedence")!.hidden = !policyHours || !showOverriddenLah;
    dialog.classList.toggle("wus-compare-hours", policyHours && showOverriddenLah);
    const draw = (start: number, end: number, kind: "AH" | "LAH", inactive = false) => {
    if (end < start) end += 1440;
    if (start === end) return;
    const segments = end > 1440 ? [{ start, end: 1440 }, { start: 0, end: end - 1440 }] : [{ start, end }];
    for (const column of dialog.querySelectorAll<HTMLElement>("[data-day]")) {
      for (const segment of segments) {
        if (segment.end <= segment.start) continue;
        const block = document.createElement("div");
        block.className = `wus-schedule-lah${kind === "AH" ? " wus-schedule-ah" : ""}${inactive ? " is-overridden" : ""}`;
        block.style.top = `${segment.start / 60 * 32}px`;
        block.style.height = `${(segment.end - segment.start) / 60 * 32}px`;
        block.textContent = kind;
        block.title = kind === "AH"
          ? `Active Hours ${time(start)}–${time(end)} (ActiveHoursStart / ActiveHoursEnd). Change these under Deployment Ring > Set active hours.`
          : `Local Active Hours ${time(start)}–${time(end)}.${inactive ? " Not effective: policy-defined Active Hours take precedence." : " Edit using the daily control below."}`;
        column.append(block);
      }
    }
    };
    if (policyHours) {
      draw(Math.round(policy.activeStart * 60), Math.round(policy.activeEnd * 60), "AH");
      if (showOverriddenLah) draw(start, end, "LAH", true);
    } else if (!overridden) draw(start, end, "LAH");
  };
  const render = () => {
    dialog.innerHTML = `
      <header><div><h2 id="wus-schedule-title" tabindex="0" title="Click an empty day to add a period. Drag to move between days; resize either edge in half-hour steps. Click a bar's time text to fine-tune its day and times. End at or before start continues into the next day (equal times mean 24 hours).">Device availability & user behavior</h2><p class="wus-help">Weekly schedule · <span class="wus-schedule-zone"></span></p></div><button type="button" data-action="cancel" aria-label="Close schedule editor">×</button></header>
      <div class="wus-schedule-tools"><button type="button" data-action="weekdays">Weekdays · 08:00–17:00</button><button type="button" data-action="always">Always online</button><button type="button" data-action="clear">Clear</button><button type="button" data-action="add">Add period</button><div class="wus-schedule-legend"><span title="Drag or resize online periods in half-hour steps. Click the time text to edit.">Online</span><span class="wus-legend-ah">AH</span><button type="button" data-action="toggle-lah" aria-pressed="false">LAH</button></div></div>
      <p class="wus-help wus-hours-precedence" role="status" hidden>Policy-defined Active Hours (AH) take precedence. Local Active Hours (LAH) are shown for comparison only and have no effect.</p>
      <div class="wus-schedule-scroll"><div class="wus-schedule-grid">
        <div class="wus-schedule-day"></div>${WEEKDAYS.map((day) => `<div class="wus-schedule-day">${day}</div>`).join("")}
        <div class="wus-schedule-hours">${Array.from({ length: 24 }, (_, h) => `<span style="top:${h * 32}px">${String(h).padStart(2, "0")}</span>`).join("")}</div>
        ${WEEKDAYS.map((_, day) => `<div class="wus-schedule-column" data-day="${day}"></div>`).join("")}
      </div></div>
      <div class="wus-period-popup" popover="auto" role="dialog" aria-label="Edit online period"><div class="wus-schedule-edit"><strong>Online period</strong><label>Day <select data-edit="day">${WEEKDAYS.map((day, i) => `<option value="${i}">${day}</option>`).join("")}</select></label><label>From <input type="time" step="60" required data-edit="start"></label><label>To <input type="time" step="60" required data-edit="end"></label><button type="button" data-action="remove">Remove</button><button type="button" data-action="done-period">Done</button></div></div>
      <p class="wus-error wus-schedule-error" role="alert"></p>
      <section class="wus-behavior-editor"></section>
      <footer><span class="wus-help">Changes apply only when saved.</span><button type="button" data-action="cancel">Cancel</button><button type="button" data-action="apply">Apply changes</button></footer>`;
    dialog.querySelector(".wus-schedule-zone")!.textContent = zone();
    paint();
    behavior = mountBehaviorEditor(container, dialog.querySelector(".wus-behavior-editor")!, paintActiveHours);
  };
  const paint = (syncFields = true) => {
    dialog.querySelectorAll(".wus-schedule-block").forEach((b) => b.remove());
    draft.forEach((p, index) => {
      // An overnight period is drawn in both days, but edited as one period.
      const segments = [{ day: p.day, start: p.start, end: Math.min(1440, p.end) }];
      if (p.end > 1440) segments.push({ day: (p.day + 1) % 7, start: 0, end: p.end - 1440 });
      segments.forEach((segment, part) => {
        const block = document.createElement("button");
        block.type = "button";
        block.className = `wus-schedule-block${index === selected ? " is-selected" : ""}`;
        block.dataset.period = String(index);
        block.dataset.part = String(part);
        block.setAttribute("aria-haspopup", "dialog");
        block.style.top = `${segment.start / 60 * 32}px`;
        block.style.height = `${(segment.end - segment.start) / 60 * 32}px`;
        block.innerHTML = `${part === 0 ? '<span class="wus-schedule-handle is-top" data-edge="start"></span>' : ""}<b>${time(p.start)}–${time(p.end)}${p.end >= 1440 ? " +1d" : ""}</b>${part === segments.length - 1 ? '<span class="wus-schedule-handle is-bottom" data-edge="end"></span>' : ""}`;
        block.setAttribute("aria-label", `${WEEKDAYS[p.day]} ${time(p.start)} to ${time(p.end)}${p.end >= 1440 ? " next day" : ""}`);
        dialog.querySelector(`[data-day="${segment.day}"]`)!.append(block);
      });
    });
    if (!syncFields) return;
    const period = draft[selected];
    for (const key of ["day", "start", "end"] as const) {
      const input = dialog.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-edit="${key}"]`)!;
      input.disabled = !period;
      input.value = period ? key === "day" ? String(period.day) : time(period[key]) : "";
    }
    dialog.querySelector<HTMLButtonElement>('[data-action="remove"]')!.disabled = !period;
  };
  const error = (message: string) => { dialog.querySelector(".wus-schedule-error")!.textContent = message; };
  const popup = () => dialog.querySelector<HTMLElement>(".wus-period-popup")!;
  const showPeriod = (rect: DOMRect) => {
    popup().showPopover();
    const bounds = popup().getBoundingClientRect();
    popup().style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - bounds.width - 8))}px`;
    popup().style.top = `${Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - bounds.height - 8))}px`;
    popup().querySelector<HTMLElement>("select")!.focus({ preventScroll: true });
  };
  const hidePeriod = () => {
    popup().hidePopover();
    dialog.querySelector<HTMLElement>(`[data-period="${selected}"]`)?.focus({ preventScroll: true });
  };
  dialog.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    if (target.closest(".wus-behavior-editor, .wus-schedule-lah")) return;
    const block = target.closest<HTMLElement>("[data-period]");
    if (block) {
      const rect = target.getBoundingClientRect();
      const open = !!target.closest("b") || event.detail === 0;
      selected = Number(block.dataset.period);
      paint();
      if (open) showPeriod(rect);
      else dialog.querySelector<HTMLElement>(`[data-period="${selected}"]`)?.focus({ preventScroll: true });
      return;
    }
    const action = target.closest<HTMLElement>("[data-action]")?.dataset.action;
    if (action === "toggle-lah") {
      showOverriddenLah = !showOverriddenLah;
      paintActiveHours(localHours.start, localHours.end, localHours.overridden);
      return;
    }
    if (action === "done-period") {
      if ([...popup().querySelectorAll<HTMLInputElement>("input")].every((input) => input.reportValidity())) hidePeriod();
      return;
    }
    if (action === "cancel") { dialog.close(); return; }
    if (action === "apply") {
      if (![...dialog.querySelectorAll<HTMLInputElement>("input")].every((input) => input.reportValidity())) return;
      try { parseSchedule(JSON.stringify(draft)); } catch (e) { error((e as Error).message); return; }
      if (!behavior.validate()) return;
      field.value = JSON.stringify(draft);
      behavior.commit();
      field.dispatchEvent(new Event("input", { bubbles: true }));
      dialog.close();
      return;
    }
    if (action === "weekdays") draft = structuredClone(DEFAULT_SCHEDULE);
    if (action === "always") draft = WEEKDAYS.map((_, day) => ({ day, start: 0, end: 1440 }));
    if (action === "clear") draft = [];
    if (action === "remove" && selected >= 0) { popup().hidePopover(); draft.splice(selected, 1); }
    const column = target.closest<HTMLElement>(".wus-schedule-column");
    if (action === "add" || column) {
      const start = column ? Math.min(1410, Math.max(0, Math.floor((event.clientY - column.getBoundingClientRect().top) / 16) * 30)) : 480;
      draft.push({ day: column ? Number(column.dataset.day) : 0, start, end: Math.min(1440, start + 60) });
      selected = draft.length - 1;
    } else if (action) selected = draft.length ? 0 : -1;
    if (action || column) {
      error("");
      paint();
      if (action === "add") showPeriod(target.getBoundingClientRect());
      if (action === "remove") dialog.querySelector<HTMLElement>('[data-action="add"]')!.focus();
    }
  });
  const edit = (event: Event) => {
    event.stopPropagation();
    const input = event.target as HTMLInputElement;
    const key = input.dataset.edit;
    const p = draft[selected];
    if (!key || !p || !input.value || !input.validity.valid) return;
    if (key === "day") p.day = Number(input.value);
    else {
      const start = key === "start" ? minutes(input.value) : p.start;
      const end = key === "end" ? minutes(input.value) : p.end % 1440;
      p.start = start;
      p.end = end <= start ? end + 1440 : end;
    }
    error("");
    paint(false);
  };
  dialog.addEventListener("input", edit);
  dialog.addEventListener("change", edit);
  let drag: { index: number; part: number; y: number; start: number; end: number; edge?: string; moved: boolean } | null = null;
  dialog.addEventListener("pointerdown", (event) => {
    const target = event.target as HTMLElement;
    const block = target.closest<HTMLElement>("[data-period]");
    if (!block || target.closest("b") || drag || event.button !== 0) return;
    const index = Number(block.dataset.period), p = draft[index];
    selected = index;
    drag = { index, part: Number(block.dataset.part), y: event.clientY, start: p.start, end: p.end, edge: target.dataset.edge, moved: false };
    dialog.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  dialog.addEventListener("pointermove", (event) => {
    if (!drag) return;
    const delta = Math.round((event.clientY - drag.y) / 16) * 30;
    if (!delta && !drag.moved && event.movementX === 0) return;
    drag.moved = true;
    const p = draft[drag.index];
    if (drag.edge === "start") p.start = Math.max(0, drag.end - 1440, Math.min(1439, drag.end - 30, Math.round(drag.start / 30) * 30 + delta));
    else if (drag.edge === "end") p.end = Math.max(drag.start + 30, Math.min(drag.start + 1440, Math.round(drag.end / 30) * 30 + delta));
    else {
      p.start = Math.max(0, Math.min(1410, Math.round(drag.start / 30) * 30 + delta));
      p.end = p.start + drag.end - drag.start;
      const column = [...dialog.querySelectorAll<HTMLElement>("[data-day]")].find((el) => {
        const r = el.getBoundingClientRect();
        return event.clientX >= r.left && event.clientX < r.right;
      });
      if (column) p.day = (Number(column.dataset.day) - drag.part + 7) % 7;
    }
    paint();
  });
  dialog.addEventListener("pointerup", () => { if (drag) paint(); drag = null; });
  dialog.addEventListener("pointercancel", () => { drag = null; });
  dialog.addEventListener("close", () => {
    drag = null;
    const fallback = container.querySelector<HTMLElement>(behaviorLauncher ? ".wus-behavior-edit" : ".wus-online-edit")
      ?? container.querySelector<HTMLElement>("#wus-edit-schedule");
    (returnFocus?.isConnected ? returnFocus : fallback)?.focus({ preventScroll: true });
  });
  return {
    open: () => {
      if (dialog.open) return;
      returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      behaviorLauncher = returnFocus?.matches(".wus-behavior-edit") ?? false;
      showOverriddenLah = false;
      let recoveryMessage = "";
      try { draft = structuredClone(parseSchedule(field.value)); } catch (e) {
        recoveryMessage = `Saved schedule could not be read: ${(e as Error).message} Choose a preset or add periods to replace it.`;
        draft = [];
      }
      selected = draft.length ? 0 : -1;
      render();
      error(recoveryMessage);
      dialog.showModal();
      dialog.querySelector(".wus-schedule-scroll")!.scrollTop = Math.max(0, (draft[0]?.start ?? 480) / 60 * 32 - 64);
    },
    cleanup: () => dialog.remove(),
  };
}
