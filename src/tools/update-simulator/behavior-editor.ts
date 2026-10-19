export function mountBehaviorEditor(container: HTMLElement, dialog: HTMLElement, onChange: (start: number, end: number, overridden: boolean) => void): { validate: () => boolean; commit: () => void } {
  const source = (id: string) => container.querySelector<HTMLInputElement>(`#wus-${id}`)!;
  let start = 420;
  let end = 1080;
  let overridden = false;
  let drag: { x: number; start: number; end: number; edge?: string } | null = null;
  const time = (value: number) => `${String(Math.floor(value % 1440 / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
  const minutes = (value: string) => {
    const [h, m] = value.split(":").map(Number);
    return h * 60 + m;
  };
  const error = (message: string) => { dialog.querySelector<HTMLElement>('[role="alert"]')!.textContent = message; };
  const paint = (syncFields = true) => {
    const track = dialog.querySelector<HTMLElement>(".wus-day-track")!;
    track.querySelectorAll(".wus-day-block").forEach((block) => block.remove());
    const segments = end > 1440
      ? [{ start, end: 1440, first: true, last: false }, { start: 0, end: end - 1440, first: false, last: true }]
      : [{ start, end, first: true, last: true }];
    if (end !== start) for (const segment of segments) {
      if (segment.end <= segment.start) continue;
      const block = document.createElement("div");
      block.className = "wus-day-block";
      block.style.left = `${segment.start / 1440 * 100}%`;
      block.style.width = `${(segment.end - segment.start) / 1440 * 100}%`;
      block.innerHTML = `${segment.first ? '<span class="wus-day-handle is-start" data-edge="start"></span>' : ""}<button type="button" class="wus-day-time" aria-haspopup="dialog"${overridden ? " disabled" : ""}>${time(start)}–${time(end)}${end >= 1440 ? " +1d" : ""}</button>${segment.last ? '<span class="wus-day-handle is-end" data-edge="end"></span>' : ""}`;
      track.append(block);
    }
    dialog.querySelector<HTMLElement>(".wus-day-duration")!.textContent = end === start
      ? "No active hours — matching times leave no active-hours block."
      : `${Math.floor((end - start) / 60)}h ${(end - start) % 60}m each day${end >= 1440 ? " · continues into the next day" : ""}`;
    dialog.querySelector<HTMLElement>(".wus-lah-edit")!.hidden = start !== end;
    if (syncFields) {
      dialog.querySelector<HTMLSelectElement>('[data-edit="start"]')!.value = time(start);
      dialog.querySelector<HTMLSelectElement>('[data-edit="end"]')!.value = time(end);
    }
    error(!overridden && end - start > 1080 ? "Active hours must be no more than 18 hours apart." : "");
    onChange(start, end, overridden);
  };
  const validate = () => {
    if (!overridden && end - start > 1080) { error("Active hours must be no more than 18 hours apart."); return false; }
    return true;
  };
  const commit = () => {
    if (!overridden) {
      source("localStart").value = time(start);
      source("localEnd").value = time(end);
    }
    for (const key of ["userRestartNotify", "userSignedIn"]) {
      source(key).checked = dialog.querySelector<HTMLInputElement>(`[data-setting="${key}"]`)!.checked;
    }
    // Update all canonical values before notifying the simulator and central persistence.
    for (const key of ["localStart", "localEnd", "userRestartNotify", "userSignedIn"]) {
      source(key).dispatchEvent(new Event(key.startsWith("user") ? "change" : "input", { bubbles: true }));
    }
  };
  const edit = (event: Event) => {
    event.stopPropagation();
    const input = event.target as HTMLSelectElement;
    if (!input.dataset.edit || !input.value || !input.validity.valid) return;
    start = minutes(dialog.querySelector<HTMLSelectElement>('[data-edit="start"]')!.value);
    end = minutes(dialog.querySelector<HTMLSelectElement>('[data-edit="end"]')!.value);
    if (end < start) end += 1440;
    paint(false);
  };
  dialog.addEventListener("input", edit);
  dialog.addEventListener("change", edit);
  const popup = () => dialog.querySelector<HTMLElement>(".wus-lah-popup")!;
  dialog.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const trigger = target.closest<HTMLElement>(".wus-day-time, .wus-lah-edit");
    if (trigger && !overridden) {
      const rect = trigger.getBoundingClientRect();
      popup().showPopover();
      const bounds = popup().getBoundingClientRect();
      popup().style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - bounds.width - 8))}px`;
      popup().style.top = `${Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - bounds.height - 8))}px`;
      popup().querySelector<HTMLElement>("select")!.focus({ preventScroll: true });
    }
    if (target.closest('[data-action="done-lah"]') && validate()) {
      popup().hidePopover();
      dialog.querySelector<HTMLElement>(".wus-day-time, .wus-lah-edit")?.focus({ preventScroll: true });
    }
  });
  dialog.addEventListener("pointerdown", (event) => {
    const target = event.target as HTMLElement;
    if (overridden || drag || event.button !== 0 || target.closest(".wus-day-time") || !target.closest(".wus-day-block")) return;
    drag = { x: event.clientX, start, end, edge: target.dataset.edge };
    dialog.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  dialog.addEventListener("pointermove", (event) => {
    if (!drag) return;
    const width = dialog.querySelector(".wus-day-track")!.getBoundingClientRect().width;
    const delta = Math.round((event.clientX - drag.x) / width * 48) * 30;
    if (drag.edge === "start") {
      start = Math.max(0, drag.end - 1080, Math.min(1410, drag.end - 30, Math.round(drag.start / 30) * 30 + delta));
    } else if (drag.edge === "end") {
      end = Math.max(drag.start + 30, Math.min(drag.start + 1080, Math.round(drag.end / 30) * 30 + delta));
    } else {
      start = Math.max(0, Math.min(1410, Math.round(drag.start / 30) * 30 + delta));
      end = start + drag.end - drag.start;
    }
    paint();
  });
  dialog.addEventListener("pointerup", () => { drag = null; });
  dialog.addEventListener("pointercancel", () => { drag = null; });
  overridden = source("localStart").disabled;
  const valid = source("localStart").validity.valid && source("localEnd").validity.valid;
  start = valid ? Math.round(minutes(source("localStart").value) / 30) * 30 % 1440 : 420;
  end = valid ? Math.round(minutes(source("localEnd").value) / 30) * 30 % 1440 : 1080;
  if (end < start) end += 1440;
  dialog.innerHTML = `
        <fieldset class="wus-day-hours" aria-labelledby="wus-daily-hours-title"${overridden ? " disabled" : ""}>
          <div class="wus-schedule-edit"><h3 id="wus-daily-hours-title" data-help tabindex="0">Local Active Hours</h3><a class="wus-csp" href="ms-settings:windowsupdate-activehours" aria-label="Open Windows Update active hours" title="Open Windows Update active hours">↗</a><span class="wus-help wus-day-duration"></span><button type="button" class="wus-lah-edit">Edit hours</button></div>
          <div class="wus-day-scroll"><div class="wus-day-grid">
            <div class="wus-day-ticks">${Array.from({ length: 25 }, (_, h) => `<span style="left:${h / 24 * 100}%">${String(h).padStart(2, "0")}</span>`).join("")}</div>
            <div class="wus-day-track"></div>
          </div></div>
        </fieldset>
        <div class="wus-period-popup wus-lah-popup" popover="auto" role="dialog" aria-label="Edit local active hours"><div class="wus-schedule-edit"><strong>Local Active Hours</strong>${["start", "end"].map((key) => `<label>${key === "start" ? "From" : "To"} <select data-edit="${key}"${overridden ? " disabled" : ""}>${Array.from({ length: 48 }, (_, i) => `<option value="${time(i * 30)}">${time(i * 30)}</option>`).join("")}</select></label>`).join("")}<button type="button" data-action="done-lah">Done</button></div></div>
        <div class="wus-behavior-settings">
          <div><label class="wus-check"><input type="checkbox" data-setting="userRestartNotify"> Notify me when a restart is required</label> <a class="wus-csp" href="ms-settings:windowsupdate-options" aria-label="Open Windows Update advanced options" title="Open Windows Update advanced options">↗</a></div>
          <label class="wus-check"><input type="checkbox" data-setting="userSignedIn"> A user is signed in when notifications fire</label>
        </div>
        <p class="wus-error" role="alert"></p>`;
  dialog.querySelector<HTMLElement>("[data-help]")!.title = `${container.querySelector<HTMLElement>("#wus-local-active-hours-title")!.title} Repeats every day. Drag or resize in half-hour increments, up to 18 hours. Click the bar's time text to edit. An earlier end continues into the next day; matching times mean no active hours. Existing times between half hours round to the nearest half hour when applied.`;
  for (const key of ["userRestartNotify", "userSignedIn"]) {
    dialog.querySelector<HTMLInputElement>(`[data-setting="${key}"]`)!.checked = source(key).checked;
  }
  paint();
  if (!valid) error("The current local active hours are invalid. Enter valid times before applying.");
  return { validate, commit };
}
