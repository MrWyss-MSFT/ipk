import "./style.css";
import type { ToolDefinition } from "@/types/tool";
import { copyButtonHtml, wireCopyButton } from "@/app/copy-button";
import { configuredPolicies, DEFAULTS, DEVICE_APPLIED_DEFAULTS, GROUPS, LOCAL_ACTIVE_HOURS_HELP, WEEKDAYS, type CloudKind, type Field, type Settings } from "./settings";
import { autoReleases, KIND_LABEL, simulate, type Release, type UpdateKind } from "./simulate";
import { BROWSER_TZ, fmtDate, lastDayOfMonth, parseDate, patchTuesday } from "./calendar";
import { setTimelineZoom, renderTimeline, wireTimelineInteractions, type EventGroup } from "./timeline";
import { ASSUMPTIONS, ASSUMPTION_BASES, ASSUMPTION_GROUPS, assumptionHtml, cspLink } from "./assumptions";
import { DEFAULT_SCHEDULE, parseSchedule, wireScheduleEditor } from "./schedule-editor";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const timeValue = (hour: number) => `${String(Math.floor(hour)).padStart(2, "0")}:${String(Math.round(hour % 1 * 60)).padStart(2, "0")}`;
const timeHour = (value: string) => {
  const [hours, minutes] = value.split(":").map(Number);
  return hours + minutes / 60;
};

function fieldHtml(f: Field): string {
  const id = `wus-${f.key}`;
  const def = DEFAULTS[f.key];
  const isExtraPolicy = f.key === "optionalContent" || f.key === "noNotifActive";
  const csp = f.key === "userRestartNotify"
    ? '<a class="wus-csp" href="ms-settings:windowsupdate-options" title="Open Windows Update advanced options">ms-settings:windowsupdate-options</a>'
    : f.csp === "User setting" || f.csp === "Device"
    ? `<span class="wus-csp">${esc(f.csp === "Device" ? "User session state" : f.csp)}</span>` : cspLink(f.csp).replace('class="wus-csp"', `class="wus-csp"${f.type === "bool" && f.help ? ` title="${esc(f.help)}"` : ""}`);
  let control = "";
  switch (f.type) {
    case "bool":
      control = `<label class="wus-check"><input type="checkbox" id="${id}" ${(f.key === "excludeDrivers" ? !def : def) ? "checked" : ""}> ${esc(f.label)}</label>`;
      if (!isExtraPolicy) return `<div class="wus-field">${control}${csp}</div>`;
      control = `<label class="wus-check"><input type="checkbox" id="${id}" ${def ? "checked" : ""} aria-label="${esc(f.label)}"> On</label>`;
      break;
    case "number":
      control = `<input type="number" id="${id}" min="${f.min}" max="${f.max}" value="${def}">`;
      break;
    case "time":
      control = `<input type="time" id="${id}" value="${def}">`;
      break;
    case "date":
      control = `<input type="date" id="${id}" value="${def}">`;
      break;
    case "select":
      control = `<select id="${id}">${(f.options ?? []).map(([v, t]) => `<option value="${v}" ${v === def ? "selected" : ""}>${esc(t)}</option>`).join("")}</select>`;
      break;
  }
  if (isExtraPolicy) {
    return `<tr><td><input type="checkbox" id="wus-${f.key}Enabled" aria-label="Include ${esc(f.label)} in configured policies"></td><td><label for="${id}">${esc(f.label)}</label><div class="wus-extra-csp">${csp}</div></td><td>${control}</td></tr>`;
  }
  return `<div class="wus-field"><label for="${id}">${esc(f.label)}</label>${control}${csp}${f.help ? `<span class="wus-help">${esc(f.help)}</span>` : ""}</div>`;
}

function readSettings(root: HTMLElement): Settings {
  const s: Settings = { ...DEFAULTS, mwWeekly: [...DEFAULTS.mwWeekly], cloud: structuredClone(DEFAULTS.cloud) };
  const rec = s as unknown as Record<string, unknown>;
  for (const g of GROUPS) {
    for (const f of g.fields) {
      const el = root.querySelector<HTMLInputElement | HTMLSelectElement>(`#wus-${f.key}`);
      if (!el) continue;
      if (f.type === "bool") {
        const checked = (el as HTMLInputElement).checked;
        rec[f.key] = f.key === "excludeDrivers" ? !checked : checked;
      }
      else if (f.type === "number" || f.type === "select") {
        const n = Number(el.value);
        rec[f.key] = Number.isFinite(n) ? n : DEFAULTS[f.key];
      } else rec[f.key] = el.value;
    }
  }
  s.mwWeekly = WEEKDAYS.map((_, i) => !!root.querySelector<HTMLInputElement>(`#wus-wk-${i}`)?.checked);
  const num = (id: string) => root.querySelector<HTMLInputElement>(`#wus-${id}`)?.value ?? "";
  const rad = (name: string) => root.querySelector<HTMLInputElement>(`input[name="wus-${name}"]:checked`)?.value ?? "";
  s.deferDays = Math.min(30, Math.max(0, Number(num("deferDays")) || 0));
  s.downloadMin = num("downloadMin") === "" ? DEFAULTS.downloadMin : Math.min(1440, Math.max(0, Number(num("downloadMin")) || 0));
  s.installMin = num("installMin") === "" ? DEFAULTS.installMin : Math.min(1440, Math.max(0, Number(num("installMin")) || 0));
  s.deadlineEnabled = num("deadlineDays") !== "";
  s.deadlineDays = Math.min(30, Math.max(0, Number(num("deadlineDays")) || 0));
  s.graceDays = num("graceDays") === "" ? DEFAULTS.graceDays : Math.min(7, Math.max(0, Number(num("graceDays")) || 0));
  s.noAutoReboot = !root.querySelector<HTMLInputElement>("#wus-autoRebootBeforeDeadline")!.checked;
  s.installMode = rad("installMode") || "auto";
  s.schedSub = rad("schedSub") || "active";
  s.resetToDefault = root.querySelector<HTMLInputElement>("#wus-resetToDefault")!.checked;
  s.eduRestart = root.querySelector<HTMLInputElement>("#wus-eduRestart")!.checked;
  s.featureUninstallDays = Math.min(60, Math.max(2, Number(num("featureUninstallDays")) || DEFAULTS.featureUninstallDays));
  s.optionalContentEnabled = root.querySelector<HTMLInputElement>("#wus-optionalContentEnabled")!.checked;
  s.noNotifActiveEnabled = root.querySelector<HTMLInputElement>("#wus-noNotifActiveEnabled")!.checked;
  s.autoUpdate = s.installMode === "auto" && s.resetToDefault ? 6
    : s.installMode === "scheduled" && s.schedSub === "scheduled" ? 3 : 2;
  s.activeStart = timeHour(num("localStart") || timeValue(DEFAULTS.activeStart));
  s.activeEnd = timeHour(num("localEnd") || timeValue(DEFAULTS.activeEnd));
  s.onlineAlways = false;
  s.weeklySchedule = parseSchedule(root.querySelector<HTMLTextAreaElement>("#wus-weekly-schedule")!.value);
  if (s.installMode === "scheduled" && s.schedSub === "active") {
    s.activeStart = Number(num("activeStart"));
    s.activeEnd = Number(num("activeEnd"));
  }
  s.schedFreq = Number(num("schedFreq")) || 0;
  s.schedDay = Number(num("schedDay")) || 0;
  s.schedTime = Number(num("schedTime")) || 0;
  s.notifLevel = Number(rad("notifLevel")) || 0;
  const cloudKinds: CloudKind[] = ["cu", "preview", "oob", "oobns"];
  s.cloudEnabled = !!root.querySelector<HTMLInputElement>("#wus-cloudEnabled")?.checked;
  s.hotpatch = !!root.querySelector<HTMLInputElement>("#wus-hotpatch")?.checked;
  for (const k of cloudKinds) {
    const auto = (root.querySelector<HTMLSelectElement>(`#wus-cloud-${k}`)?.value ?? "") === "auto";
    const defer = Math.min(30, Math.max(0, Number(num(`cloud-${k}-defer`)) || 0));
    const appr = num(`cloud-${k}-approve`);
    s.cloud[k] = { auto, defer, approveAfter: appr === "" ? null : Math.min(60, Math.max(0, Number(appr) || 0)) };
  }
  return s;
}
const HOURS = Array.from({ length: 24 }, (_, h) => `<option value="${h}">${String(h).padStart(2, "0")}:00</option>`);
const hourSelect = (id: string, def: number) => `<select id="${id}">${HOURS.map((o) => o.replace(`value="${def}"`, `value="${def}" selected`)).join("")}</select>`;
const radio = (name: string, value: string, label: string, tip: string, checked: boolean, csp = "") =>
  `<label class="wus-radio"><input type="radio" name="${name}" value="${value}" ${checked ? "checked" : ""}> ${esc(label)}${csp ? ` ${cspLink(csp.split(" =")[0], csp).replace('class="wus-csp"', `class="wus-csp" data-radio-csp="${name}-${value}"${tip && tip !== csp ? ` title="${esc(tip)}"` : ""}`)}`
    : tip ? ` ${tip.split(" / ").map((setting) => cspLink(setting)).join(" / ")}` : ""}</label>`;

const CLOUD_ROWS: [CloudKind, string, string][] = [
  ["cu", "Monthly B-week", "Security cumulative"],
  ["preview", "Monthly D-week previews", "Optional non-security"],
  ["oob", "Out-of-band security", "Unscheduled security releases"],
  ["oobns", "Out-of-band non-security", "Unscheduled non-security releases"],
];

const RELEASE_ROWS: [UpdateKind, string][] = [
  ["cu", "Monthly B-week CU"],
  ["preview", "Preview CU"],
  ["oob", "OOB security update"],
  ["oobns", "OOB non-security update"],
  ["driver", "Driver"],
  ["software", "Microsoft product update"],
];

const QUALITY_POLICY_HTML = `
  <details class="wus-group" id="wus-quality-policy">
    <summary class="wus-summary" id="wus-quality-policy-summary">Windows quality update policy</summary>
    <div class="wus-section wus-panel wus-quality-panel">
      <div class="wus-cloud-policy">
        <div><h3>Cloud approval policy</h3><p>Control when each update type becomes available.</p></div>
        <label class="wus-check"><input type="checkbox" id="wus-cloudEnabled"> Enable policy</label>
      </div>
      <p class="wus-cloud-note" id="wus-cloud-note"></p>
      <h3>Release approvals</h3>
      <div class="wus-cloud-list">
        ${CLOUD_ROWS.map(([k, label, subtitle]) => `<div class="wus-cloud-row">
          <div class="wus-cloud-title"><strong>${label}</strong><p>${subtitle}</p></div>
          <div class="wus-field"><label for="wus-cloud-${k}">Approval method</label><select id="wus-cloud-${k}" aria-label="Approval method for ${label}"><option value="auto" ${k === "cu" ? "selected" : ""}>Automatically approve</option><option value="manual" ${k === "cu" ? "" : "selected"}>Manually review &amp; approve</option></select></div>
          <div class="wus-field" id="wus-cloud-${k}-auto"><label for="wus-cloud-${k}-defer">Make available after</label><div class="wus-cloud-time"><input type="number" id="wus-cloud-${k}-defer" min="0" max="30" step="1" value="0" aria-label="${label} deferral in days"><span>days after release</span></div></div>
          <div class="wus-field" id="wus-cloud-${k}-man"><label for="wus-cloud-${k}-approve">Simulate approval after</label><div class="wus-cloud-time"><input type="number" id="wus-cloud-${k}-approve" min="0" max="60" step="1" placeholder="Never" aria-label="${label} days after release until approval (empty = never approved)"><span>days after release</span></div></div>
          <p class="wus-cloud-summary" id="wus-cloud-${k}-summary"></p>
        </div>`).join("")}
      </div>
      <div class="wus-cloud-hotpatch">
        <label class="wus-check"><input type="checkbox" id="wus-hotpatch"><span><strong>Apply eligible B-week updates without a restart</strong><span class="wus-cloud-hotpatch-note">Use hotpatch when available. Baseline updates still require a restart.</span></span></label>
        ${cspLink("AllowRebootlessUpdates")}
      </div>
    </div>
  </details>`;
const DEPLOYMENT_RING_HTML = `
  <details class="wus-group" id="wus-deployment-ring" open>
    <summary class="wus-summary" id="wus-deployment-ring-summary">Deployment Ring</summary>
    <div class="ipk-table-scroll wus-panel" role="region" aria-label="Quality and driver updates">
    <h3>Quality and driver updates</h3>
    <table class="wus-policy-table wus-update-timing-table" aria-label="Quality and driver update timing settings">
      <thead><tr><th>Client update deferrals</th><th>Deadline</th><th>Grace period</th><th>Driver update deferrals</th></tr></thead>
      <tbody><tr>
        <td><input type="number" id="wus-deferDays" min="0" max="30" value="${DEFAULTS.deferDays}" aria-label="Deferral in days">${cspLink("DeferQualityUpdatesPeriodInDays")}</td>
        <td><input type="number" id="wus-deadlineDays" min="0" max="30" value="${DEFAULTS.deadlineDays}" placeholder="Not set" aria-label="Deadline in days">${cspLink("ConfigureDeadlineForQualityUpdates")}</td>
        <td><input type="number" id="wus-graceDays" min="0" max="7" value="${DEFAULTS.graceDays}" placeholder="2" aria-label="Grace period in days">${cspLink("ConfigureDeadlineGracePeriod")}</td>
        <td><input type="number" value="0" disabled aria-label="Driver update deferral in days (fixed at zero)"><span class="wus-csp" title="Separate cloud-side Driver Update policy, not a CSP. The simulator assumes automatic approval with zero deferral (&quot;Make updates available after&quot;). The entered release date represents when the driver update is released.">Driver Update policy</span></td>
      </tr></tbody>
    </table>
    </div>
  <section class="wus-section wus-panel" id="wus-install-options">
    <h3>Install and restart option</h3>
    <div class="wus-install-auto">
      ${radio("wus-installMode", "auto", "Automatically install and restart", "AllowAutoUpdate = 2, or 6 when Reset to default is checked. Both use the same simulation behavior.", true, "AllowAutoUpdate = 6")}
      <label class="wus-check"><input type="checkbox" id="wus-resetToDefault" checked> Reset to default ${cspLink("AllowAutoUpdate", "AllowAutoUpdate = 6").replace('class="wus-csp"', 'class="wus-csp" title="Value 6 was observed on an Intune-managed device using Reset to default; it is not listed in the public CSP table. Simulated identically to 2."')}</label>
    </div>
    ${radio("wus-installMode", "scheduled", "Scheduled install and restart", "Choose active hours or a scheduled install time. This setting will only allow devices to install and reboot at the specified time +/- 15 minutes. If a device doesn't finish installing in that window, it will wait to reboot until the next one.", false, "AllowAutoUpdate = 2")}
    <div class="wus-nested" id="wus-scheduled-install-options" hidden>
      ${radio("wus-schedSub", "active", "Set active hours", "ActiveHoursStart / ActiveHoursEnd", true)}
      ${radio("wus-schedSub", "scheduled", "Scheduled install and restart", "AllowAutoUpdate = 3 with ScheduledInstallDay / Time / week options", false, "AllowAutoUpdate = 3")}
      <div class="wus-nested" id="wus-active-box">
        <div class="wus-field"><label for="wus-activeStart">Active hours start (device's timezone)</label>${hourSelect("wus-activeStart", 8)}${cspLink("ActiveHoursStart")}</div>
        <div class="wus-field"><label for="wus-activeEnd">Active hours end (device's timezone)</label>${hourSelect("wus-activeEnd", 17)}${cspLink("ActiveHoursEnd", "ActiveHoursEnd (max range 18 hours)")}</div>
      </div>
      <div class="wus-nested" id="wus-slot-box" hidden>
        <div class="wus-field"><label for="wus-schedFreq">Automatic update frequency</label>
          <select id="wus-schedFreq"><option value="0">Every week</option><option value="1">First week of the month</option><option value="2">Second week of the month</option><option value="3">Third week of the month</option><option value="4">Fourth week of the month</option></select>
          <span>${["Every", "First", "Second", "Third", "Fourth"].map((week) => cspLink(`ScheduledInstall${week}Week`)).join(" / ")}</span></div>
        <div class="wus-field"><label for="wus-schedDay">Schedule install day</label>
          <select id="wus-schedDay"><option value="0">Every day</option><option value="1">Sunday</option><option value="2">Monday</option><option value="3">Tuesday</option><option value="4">Wednesday</option><option value="5">Thursday</option><option value="6">Friday</option><option value="7">Saturday</option></select>
          ${cspLink("ScheduledInstallDay")}</div>
        <div class="wus-field"><label for="wus-schedTime">Schedule install time</label>${hourSelect("wus-schedTime", 3)}${cspLink("ScheduledInstallTime")}</div>
      </div>
    </div>
  </section>
  <section class="wus-section wus-panel" id="wus-update-notifications">
    <h3>Windows Update notifications</h3>
    ${radio("wus-notifLevel", "0", "Use the default Windows Update notifications", "UpdateNotificationLevel = 0", true, "UpdateNotificationLevel = 0")}
    ${radio("wus-notifLevel", "1", "Turn off all notifications, excluding restart warnings", "UpdateNotificationLevel = 1", false, "UpdateNotificationLevel = 1")}
    ${radio("wus-notifLevel", "2", "Turn off all notifications, including restart warnings", "UpdateNotificationLevel = 2", false, "UpdateNotificationLevel = 2")}
  </section>
    <div class="wus-fields wus-panel">
      <h3 class="wus-subheading">Update Types</h3>
      ${GROUPS.flatMap((g) => g.fields).filter((f) => f.key === "excludeDrivers" || f.key === "allowMUUpdateService").map(fieldHtml).join("")}
    </div>
    <section class="wus-section wus-panel" id="wus-additional-settings">
      <h3>Additional settings</h3>
      <div class="wus-fields">
      <div class="wus-field">
        <label for="wus-featureUninstallDays">Feature update uninstall period (days)</label>
        <input type="number" id="wus-featureUninstallDays" min="2" max="60" value="${DEFAULTS.featureUninstallDays}">
        ${cspLink("ConfigureFeatureUpdateUninstallPeriod")}
      </div>
      <div class="wus-field">
        <label class="wus-check"><input type="checkbox" id="wus-eduRestart"> Enable EDU restart behavior</label>
        ${cspLink("SetEDURestart")}
      </div>
      <div class="wus-field">
        <label class="wus-check"><input type="checkbox" id="wus-autoRebootBeforeDeadline" checked> Auto reboot before deadline</label>
        ${cspLink("ConfigureDeadlineNoAutoReboot")}
      </div>
      </div>
    </section>
  </details>`;

const DEVICE_USER_STATE_HTML = `
  <!-- Canonical fields remain mounted for central persistence, including legacy schedule migration. -->
  <div hidden>
      <input type="checkbox" id="wus-onlineAlways">
      ${WEEKDAYS.map((_, i) => `<input type="checkbox" id="wus-online-day-${i}" ${DEFAULTS.onlineDays[i] ? "checked" : ""}>`).join("")}
      <input type="time" id="wus-onlineStartTime" value="${timeValue(DEFAULTS.onlineStart)}">
      <input type="time" id="wus-onlineEndTime" value="${timeValue(DEFAULTS.onlineEnd)}">
    <textarea id="wus-weekly-schedule" hidden aria-label="Weekly online schedule">${JSON.stringify(DEFAULT_SCHEDULE)}</textarea>
      <div class="wus-fields">${GROUPS.filter((g) => g.id === "user-behavior").flatMap((g) => g.fields).map(fieldHtml).join("")}</div>
      <h4 class="wus-subheading"><span id="wus-local-active-hours-title" title="${esc(LOCAL_ACTIVE_HOURS_HELP)}" tabindex="0">Local active hours</span></h4>
      <div class="wus-fields" id="wus-local-active-hours">
        <div class="wus-field"><label for="wus-localStart">Start</label><input type="time" id="wus-localStart" step="60" value="${timeValue(DEFAULTS.activeStart)}" required aria-describedby="wus-local-hours-error"></div>
        <div class="wus-field"><label for="wus-localEnd">End (max 18 hours)</label><input type="time" id="wus-localEnd" step="60" value="${timeValue(DEFAULTS.activeEnd)}" required aria-describedby="wus-local-hours-error"></div>
      </div>
  </div>
  <p class="wus-error" id="wus-availability-error" role="alert" hidden></p>
  <p class="wus-error" id="wus-local-hours-error" role="alert" hidden></p>
  <button type="button" class="wus-btn" id="wus-edit-schedule" aria-haspopup="dialog" hidden>Edit device availability & user behavior</button>`;

/** Device-local calendar dates stored as UTC epoch ms, like the rest of the engine. */
const monthStart = () => {
  const d = new Date();
  return Date.UTC(d.getFullYear(), d.getMonth(), 1);
};
const tool: ToolDefinition = {
  id: "update-simulator",
  name: "Update Simulator",
  description:
    "Simulate a month-long Windows Update timeline and notifications for Windows 11 25H2+, plus Microsoft product update installation, from Update Policy CSP settings.",
  category: "Simulators",
  keywords: ["windows update", "wufb", "update policy", "csp", "deadline", "maintenance window", "active hours", "patch tuesday", "restart", "deferral"],
  icon: "📅",
  stage: "alpha",
  hidden: true,
  mount(container) {
    const groups = GROUPS.filter((g) => g.id !== "user-behavior").map((g) => {
      const extra =
        g.id === "maintenance"
          ? `<div class="wus-field"><span class="wus-label">Weekly days</span><div class="wus-weekly">${WEEKDAYS.map(
              (d, i) => `<label class="wus-check"><input type="checkbox" id="wus-wk-${i}" ${DEFAULTS.mwWeekly[i] ? "checked" : ""}> ${d}</label>`,
            ).join("")}</div><span>${["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((day) => cspLink(`MaintenanceWindowWeekly${day}`)).join(" / ")}</span></div>`
          : "";
      const fields = g.fields.filter((f) => f.key !== "excludeDrivers" && f.key !== "allowMUUpdateService").map(fieldHtml).join("");
      const body = g.id === "extra"
        ? `<div class="wus-panel"><p class="wus-help wus-extra-note">Documentation only; not simulated. Check Include to add a setting to Configured policies.</p><div class="ipk-table-scroll"><table class="wus-table wus-extra-table"><thead><tr><th scope="col">Include</th><th scope="col">Setting</th><th scope="col">Value</th></tr></thead><tbody>${fields}</tbody></table></div></div>`
        : `<div class="wus-fields wus-panel">${fields}${extra}</div>`;
      return `<details class="wus-group"><summary class="wus-summary" id="wus-${g.id}-summary">${esc(g.title)}${g.id === "maintenance" ? ' <span class="ipk-badge wus-todo-chip">TODO</span>' : ""}</summary>${body}</details>`;
    }).join("");

    container.innerHTML = `
      <div class="wus-tool">
        <p class="ipk-hint">Hypothetical timeline for an idle Windows 11 25H2+ device using the configured online schedule. Models quality updates and optional Microsoft product releases; legacy policies and feature updates are not simulated. Each release's restarts and notifications are modeled independently; shared restarts and notifications across updates are not simulated, so duplicates can appear. Hover a numbered marker, or use the Notes column, to see assumptions where Microsoft docs are silent or conflict.</p>
        <div class="wus-result" id="wus-result"></div>
        ${DEPLOYMENT_RING_HTML}
        <details class="wus-group" id="wus-releases"><summary class="wus-summary" id="wus-releases-summary">Simulate releases</summary>
          <div class="wus-panel">
            <div class="wus-release-list">
              ${RELEASE_ROWS.map(([kind, label]) => `<section class="wus-release-card" id="wus-release-config-${kind}" tabindex="-1">
                <div class="wus-release-heading">
                  <input type="checkbox" id="wus-release-${kind}-enabled" ${kind === "cu" ? "checked" : ""} aria-label="Include ${label}">
                  <div class="wus-release-heading-text"><label for="wus-release-${kind}-enabled">${label}</label><span class="wus-release-summary" id="wus-release-${kind}-summary"></span></div>
                  <button type="button" class="wus-release-edit" data-release-edit="${kind}" aria-expanded="false" aria-controls="wus-release-${kind}-controls">Edit ▾</button>
                </div>
                <div class="wus-release-controls" id="wus-release-${kind}-controls" hidden>
                ${kind === "software" ? '<div class="wus-field"><label for="wus-release-software-title">Release title</label><input type="text" id="wus-release-software-title" value="Microsoft product update"></div>' : ""}
                <div class="wus-field"><label${kind === "cu" ? "" : ` for="wus-release-${kind}-date"`}>Release date</label>${kind === "cu" ? '<span><time id="wus-patch-date" title="Patch Tuesday: second Tuesday of the selected month"></time> · Automatic (PT)</span>' : `<input type="date" id="wus-release-${kind}-date" aria-label="Release date for ${label}" aria-describedby="wus-release-${kind}-date-error"><span class="wus-release-date-error wus-error" id="wus-release-${kind}-date-error" role="alert" hidden></span>`}</div>
                <div class="wus-field"><label${kind === "software" ? "" : ` for="wus-release-${kind}-restart"`}>Requires restart</label>${kind === "software" ? "<span>Not modeled</span>" : kind === "cu"
                  ? '<select id="wus-release-cu-restart" aria-label="Monthly B-week CU requires restart"><option value="auto">Automatic (hotpatch schedule)</option><option value="yes">Yes (override)</option><option value="no">No (override)</option></select>'
                  : kind === "oob" || kind === "oobns"
                    ? `<select id="wus-release-${kind}-restart" aria-label="${label} requires restart"><option value="auto">Automatic (release default)</option><option value="yes">Yes (override)</option><option value="no">No (override)</option></select>`
                    : `<input type="checkbox" id="wus-release-${kind}-restart" aria-label="${label} requires restart" ${kind !== "driver" ? "checked" : ""}>`}</div>
                <div class="wus-field"><label for="wus-release-${kind}-duration-mode" title="Blank overrides inherit the defaults. Zero means instantaneous.${kind === "cu" ? " Monthly B-week overrides apply to every modeled B release." : ""}">Durations</label><select id="wus-release-${kind}-duration-mode"><option value="default">Use defaults</option><option value="custom">Custom for this release</option></select></div>
                <div class="wus-release-custom" id="wus-release-${kind}-custom" hidden>
                ${["downloadMin", "installMin"].map((key) => `<div class="wus-field"><label for="wus-release-${kind}-${key}">${key === "downloadMin" ? "Download" : "Install"} (min)</label><input type="number" id="wus-release-${kind}-${key}" min="0" max="1440" step="1" aria-label="${label} ${key === "downloadMin" ? "download" : "install"} duration in minutes" aria-describedby="wus-duration-note"></div>`).join("")}
                </div>
                ${kind === "software" ? '<p class="wus-help wus-release-info">Microsoft product releases use AllowMUUpdateService and approximate download/install timing, without restart modeling or Windows quality-update policies. See <a href="https://learn.microsoft.com/en-us/windows/deployment/update/update-other-microsoft-products" target="_blank" rel="noopener">Microsoft\'s list of products that might be updated</a>. Setting the policy to 0 on a real device does not automatically unregister an existing Microsoft Update service.</p>' : ""}
                </div>
              </section>`).join("")}
            </div>
            <div class="wus-release-defaults">
              <strong>Default durations</strong>
              <label for="wus-downloadMin">Download <input type="number" id="wus-downloadMin" min="0" max="1440" step="1" placeholder="5"> min</label>
              <label for="wus-installMin">Install <input type="number" id="wus-installMin" min="0" max="1440" step="1" placeholder="20"> min</label>
            </div>
          </div>
          <p class="wus-help" id="wus-release-note">Choose releases for this month. Policies still apply; restart overrides are simulation-only.</p>
          <p class="wus-help" id="wus-duration-note" hidden>Blank duration overrides inherit the defaults (5 minutes download, 20 minutes install unless changed). Zero means instantaneous. Monthly B-week overrides apply to every modeled B release.</p>
          <p class="wus-error" id="wus-release-error" role="alert" hidden></p>
        </details>
        ${DEVICE_USER_STATE_HTML}
        ${QUALITY_POLICY_HTML}
        ${groups}
        <details class="wus-group"><summary class="wus-summary" id="wus-assumptions-summary">All assumptions used by this tool</summary>
          <p class="wus-help wus-assumption-scale">Initial editorial confidence in how closely the model represents Windows behavior, based on the cited guidance and known simplifications; not a measured probability or fresh source verification. 5/5: strong explicit support · 4/5: supported with caveats · 3/5: mixed evidence or interpretation · 2/5: weak support or substantial simplification · 1/5: unverified or illustrative. IDs remain stable when entries are reordered.</p>
          <div class="wus-assumption-filters wus-fields wus-panel">
            <div class="wus-field"><label for="wus-assumption-search">Search assumptions</label><input type="search" id="wus-assumption-search" placeholder="ID, policy, text or rationale"></div>
            <div class="wus-field"><label for="wus-assumption-category">Category</label><select id="wus-assumption-category"><option value="">All categories</option>${Object.keys(ASSUMPTION_GROUPS).map((title) => `<option>${esc(title)}</option>`).join("")}</select></div>
            <div class="wus-field"><label for="wus-assumption-basis" title="Primary classification; secondary caveats remain in the text and rationale. Documentation contradiction: conflicting guidance. Documentation gap: missing or ambiguous guidance. Simulator limitation: behavior omitted or unsupported by this tool. Modeling approximation: real behavior simplified for timing or calculation. Scenario input: user-selected or assumed device/release conditions. Documented behavior: primarily supported by explicit guidance.">Basis / limitation</label><select id="wus-assumption-basis"><option value="">All bases / limitations</option>${ASSUMPTION_BASES.map((basis) => `<option>${basis}</option>`).join("")}</select></div>
            <div class="wus-field"><label for="wus-assumption-confidence">Confidence</label><select id="wus-assumption-confidence"><option value="">All ratings</option>${[1, 2, 3, 4, 5].map((n) => `<option value="${n}">${n}/5</option>`).join("")}</select></div>
            <button type="button" class="wus-btn" id="wus-assumption-reset">Clear filters</button>
          </div>
          <p class="wus-help wus-assumption-count" id="wus-assumption-count" role="status"></p>
          <div class="ipk-table-scroll">
          <table class="wus-table wus-assumption-table">
            <thead><tr>${[["id", "ID"], ["category", "Category"], ["text", "Assumption"], ["confidence", "Confidence"], ["rationale", "Rating rationale"], ["basis", "Basis / limitation"]].map(([key, label]) => `<th scope="col" aria-sort="${key === "id" ? "ascending" : "none"}"><button type="button" data-assumption-sort="${key}">${label}<span aria-hidden="true">${key === "id" ? " ↑" : " ↕"}</span></button></th>`).join("")}<th scope="col">Source</th></tr></thead>
            <tbody>${Object.entries(ASSUMPTION_GROUPS).flatMap(([title, ids]) => ids.map((id) => {
            const a = ASSUMPTIONS[id];
            return `<tr id="wus-assumption-${id}" tabindex="-1" data-confidence="${a.confidence}"><th scope="row">${a.id}</th><td>${esc(title)}</td><td>${assumptionHtml(a.text)}</td><td>${a.confidence}/5</td><td>${esc(a.rationale)}</td><td>${a.basis}</td><td><a href="${a.url}" target="_blank" rel="noopener">Docs</a></td></tr>`;
          })).join("")}</tbody>
          </table>
          </div>
        </details>
        <section class="wus-section" id="wus-configured-policies">
          <h3>Configured policies</h3>
            <p class="wus-help">Simulated values, not a device export. Dimmed policies are device defaults; others are absent unless configured. Enabled cloud approvals and deferrals override client deferral.</p>
            <div class="ipk-copy-wrap">
              <div class="wus-policy-values" id="wus-policy-values"></div>
              ${copyButtonHtml("wus-copy-policies", "Copy configured policies")}
            </div>
        </section>
      </div>`;

    let tz = BROWSER_TZ;
    let start = monthStart();
    const hidden = new Set<EventGroup>();
    const collapsedGroups = new Set<string>();
    const resultEl = container.querySelector<HTMLElement>("#wus-result")!;
    const assumptionTable = container.querySelector<HTMLTableElement>(".wus-assumption-table")!;
    const assumptionSearch = container.querySelector<HTMLInputElement>("#wus-assumption-search")!;
    const assumptionCategory = container.querySelector<HTMLSelectElement>("#wus-assumption-category")!;
    const assumptionBasis = container.querySelector<HTMLSelectElement>("#wus-assumption-basis")!;
    const assumptionConfidence = container.querySelector<HTMLSelectElement>("#wus-assumption-confidence")!;
    const sortColumns = { id: 0, category: 1, text: 2, confidence: 3, rationale: 4, basis: 5 };
    type AssumptionSort = keyof typeof sortColumns;
    let assumptionSort: AssumptionSort = "id";
    let assumptionAscending = true;
    const updateAssumptions = () => {
      const terms = assumptionSearch.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
      const rows = [...assumptionTable.tBodies[0].rows];
      rows.sort((a, b) => {
        const column = sortColumns[assumptionSort];
        const comparison = assumptionSort === "confidence"
          ? Number(a.dataset.confidence) - Number(b.dataset.confidence)
          : a.cells[column].textContent!.localeCompare(b.cells[column].textContent!);
        return (assumptionAscending ? comparison : -comparison) || a.cells[0].textContent!.localeCompare(b.cells[0].textContent!);
      });
      let visible = 0;
      for (const row of rows) {
        row.hidden = !terms.every((term) => row.textContent!.toLowerCase().includes(term)) ||
          (assumptionCategory.value !== "" && row.cells[1].textContent !== assumptionCategory.value) ||
          (assumptionBasis.value !== "" && row.cells[5].textContent !== assumptionBasis.value) ||
          (assumptionConfidence.value !== "" && row.dataset.confidence !== assumptionConfidence.value);
        if (!row.hidden) visible++;
        assumptionTable.tBodies[0].append(row);
      }
      container.querySelector<HTMLElement>("#wus-assumption-count")!.textContent =
        visible ? `${visible} of ${rows.length} assumptions` : `No matching assumptions (0 of ${rows.length}).`;
      for (const button of assumptionTable.querySelectorAll<HTMLButtonElement>("[data-assumption-sort]")) {
        const active = button.dataset.assumptionSort === assumptionSort;
        button.closest("th")!.setAttribute("aria-sort", active ? assumptionAscending ? "ascending" : "descending" : "none");
        button.querySelector("span")!.textContent = active ? assumptionAscending ? " ↑" : " ↓" : " ↕";
      }
    };
    const clearAssumptionFilters = () => {
      for (const input of [assumptionSearch, assumptionCategory, assumptionBasis, assumptionConfidence]) {
        input.value = "";
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
    };
    updateAssumptions();
    const scheduleField = container.querySelector<HTMLTextAreaElement>("#wus-weekly-schedule")!;
    const scheduleEditor = wireScheduleEditor(container, scheduleField, () => tz, () => ({
      installMode: container.querySelector<HTMLInputElement>('input[name="wus-installMode"]:checked')!.value,
      schedSub: container.querySelector<HTMLInputElement>('input[name="wus-schedSub"]:checked')!.value,
      activeStart: Number(container.querySelector<HTMLSelectElement>("#wus-activeStart")!.value),
      activeEnd: Number(container.querySelector<HTMLSelectElement>("#wus-activeEnd")!.value),
    }));
    const syncCollapsedGroups = () => {
      const labels = resultEl.querySelectorAll<HTMLElement>(".wus-timeline-labels > :not(.wus-timeline-heading)");
      const tracks = resultEl.querySelectorAll<HTMLElement>(".wus-timeline-tracks > *");
      let collapsed = false;
      labels.forEach((label, index) => {
        if (label.dataset.groupId !== undefined) {
          collapsed = collapsedGroups.has(label.dataset.groupId);
          const button = label.querySelector<HTMLButtonElement>(".wus-group-toggle")!;
          button.setAttribute("aria-expanded", String(!collapsed));
          const name = label.querySelector("a, span")!.textContent;
          button.setAttribute("aria-label", `${collapsed ? "Expand" : "Collapse"} ${name}`);
          button.textContent = collapsed ? "▸" : "▾";
        } else {
          label.hidden = collapsed;
          tracks[index].hidden = collapsed;
        }
      });
    };
    wireCopyButton(container.querySelector<HTMLButtonElement>("#wus-copy-policies")!, () =>
      Array.from(container.querySelectorAll<HTMLElement>("#wus-policy-values .wus-policy-value-row"), (row) =>
        `${row.querySelector(".wus-policy-value-name")!.textContent} ${row.querySelector(".wus-policy-value")!.textContent}`,
      ).join("\n"),
    );

    const syncVisibility = () => {
      const m = readSettings(container);
      const sched = m.installMode === "scheduled";
      container.querySelector<HTMLElement>('[data-radio-csp="wus-installMode-auto"]')!.textContent = `AllowAutoUpdate = ${m.resetToDefault ? 6 : 2}`;
      container.querySelector<HTMLElement>('[data-radio-csp="wus-installMode-scheduled"]')!.textContent = `AllowAutoUpdate = ${m.schedSub === "scheduled" ? 3 : 2}`;
      container.querySelector<HTMLInputElement>("#wus-resetToDefault")!.disabled = sched;
      container.querySelector<HTMLElement>("#wus-scheduled-install-options")!.hidden = !sched;
      container.querySelector<HTMLElement>("#wus-active-box")!.hidden = m.schedSub !== "active";
      container.querySelector<HTMLElement>("#wus-slot-box")!.hidden = m.schedSub !== "scheduled";
      const localHoursOverridden = sched;
      const localHours = container.querySelector<HTMLElement>("#wus-local-active-hours")!;
      container.querySelector<HTMLElement>("#wus-local-active-hours-title")!.title = sched
        ? m.schedSub === "active"
          ? "Local active hours have no effect while policy-defined active hours (ActiveHoursStart / ActiveHoursEnd) are configured. Change those hours under Deployment Ring > Set active hours."
          : "The simulator assumes AllowAutoUpdate = 3 ignores local active hours (manual or intelligent). There is no strong evidence confirming this; it is an unverified simulator assumption, not established Windows behavior."
        : LOCAL_ACTIVE_HOURS_HELP;
      for (const input of localHours.querySelectorAll<HTMLInputElement>("input")) {
        input.disabled = localHoursOverridden;
      }
      container.querySelector<HTMLInputElement>("#wus-deferDays")!.disabled = m.cloudEnabled;
      container.querySelector<HTMLElement>("#wus-cloud-note")!.textContent = m.cloudEnabled
        ? "Cloud approvals and deferrals replace the client quality-update deferral."
        : "Policy is off. Values below are retained but do not affect the simulation.";
      for (const [k] of CLOUD_ROWS) {
        const auto = m.cloud[k].auto;
        container.querySelector<HTMLElement>(`#wus-cloud-${k}-auto`)!.hidden = !auto;
        container.querySelector<HTMLElement>(`#wus-cloud-${k}-man`)!.hidden = auto;
        const days = auto ? m.cloud[k].defer : m.cloud[k].approveAfter;
        container.querySelector<HTMLElement>(`#wus-cloud-${k}-summary`)!.textContent = auto
          ? `Automatically available ${days} ${days === 1 ? "day" : "days"} after release.`
          : days === null ? "No approval simulated — leave blank to keep this release unapproved."
          : `Manual approval simulated ${days} ${days === 1 ? "day" : "days"} after release.`;
      }
    };

    const expandRelease = (kind: string, open: boolean) => {
      const controls = container.querySelector<HTMLElement>(`#wus-release-${kind}-controls`)!;
      const button = container.querySelector<HTMLButtonElement>(`[data-release-edit="${kind}"]`)!;
      controls.hidden = !open;
      button.setAttribute("aria-expanded", String(open));
      button.textContent = open ? "Close ▴" : "Edit ▾";
    };

    const run = () => {
      const scheduleError = container.querySelector<HTMLElement>("#wus-availability-error")!;
      try { parseSchedule(scheduleField.value); } catch (e) {
        scheduleError.textContent = `Invalid weekly schedule: ${(e as Error).message}`;
        scheduleError.hidden = false;
        resultEl.hidden = true;
        container.querySelector<HTMLElement>("#wus-edit-schedule")!.hidden = false;
        return;
      }
      const layersOpen = resultEl.querySelector<HTMLDetailsElement>(".wus-layers")?.open ?? false;
      const focusedLayer = document.activeElement instanceof HTMLInputElement
        ? document.activeElement.dataset.grp : undefined;
      const oldZoom = container.querySelector<HTMLInputElement>("#wus-zoom")?.value ?? "0";
      const oldViewport = resultEl.querySelector<HTMLElement>(".wus-timeline-viewport");
      const oldScroll = oldViewport?.scrollLeft ?? 0;
      syncVisibility();
      const tzEl = container.querySelector<HTMLSelectElement>("#wus-tz");
      if (tzEl) tz = tzEl.value;
      const monthEl = container.querySelector<HTMLInputElement>("#wus-month");
      const grpEls = container.querySelectorAll<HTMLInputElement>("input[data-grp]");
      if (grpEls.length) {
        hidden.clear();
        grpEls.forEach((el) => { if (!el.checked) hidden.add(el.dataset.grp as EventGroup); });
      }
      const m = monthEl && /^(\d{4})-(\d{2})$/.exec(monthEl.value);
      const nextStart = m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, 1) : start;
      const monthChanged = nextStart !== start;
      start = nextStart;
      const month = new Date(start);
      const monthEnd = lastDayOfMonth(month.getUTCFullYear(), month.getUTCMonth());
      const patchDate = fmtDate(patchTuesday(month.getUTCFullYear(), month.getUTCMonth()));
      const patchEl = container.querySelector<HTMLTimeElement>("#wus-patch-date")!;
      patchEl.dateTime = patchDate;
      patchEl.textContent = patchDate;
      const releases: Release[] = [];
      const invalidReleases: string[] = [];
      const durationDefaults = readSettings(container);
      for (const key of ["downloadMin", "installMin"]) {
        const input = container.querySelector<HTMLInputElement>(`#wus-${key}`)!;
        input.setAttribute("aria-invalid", String(!input.validity.valid));
        if (!input.validity.valid) invalidReleases.push(`Default ${key === "downloadMin" ? "download" : "install"} duration`);
      }
      for (const [kind, label] of RELEASE_ROWS) {
        const enabled = container.querySelector<HTMLInputElement>(`#wus-release-${kind}-enabled`)!.checked;
        const card = container.querySelector<HTMLElement>(`#wus-release-config-${kind}`)!;
        card.classList.toggle("is-included", enabled);
        const mode = container.querySelector<HTMLSelectElement>(`#wus-release-${kind}-duration-mode`)!;
        const durationInputs = [...card.querySelectorAll<HTMLInputElement>('input[type="number"]')];
        if (durationInputs.some((input) => input.value !== "")) mode.value = "custom";
        mode.disabled = !enabled;
        container.querySelector<HTMLElement>(`#wus-release-${kind}-custom`)!.hidden = mode.value !== "custom";
        const titleInput = card.querySelector<HTMLInputElement>('input[type="text"]');
        if (titleInput) titleInput.disabled = !enabled;
        const durations: Pick<Release, "downloadMin" | "installMin"> = {};
        let invalidDuration = false;
        for (const key of ["downloadMin", "installMin"] as const) {
          const input = container.querySelector<HTMLInputElement>(`#wus-release-${kind}-${key}`)!;
          input.disabled = !enabled;
          input.placeholder = String(durationDefaults[key]);
          const invalid = enabled && !input.validity.valid;
          input.setAttribute("aria-invalid", String(invalid));
          invalidDuration ||= invalid;
          if (input.value !== "" && !invalid) durations[key] = Number(input.value);
        }
        if (invalidDuration) invalidReleases.push(`${label} (enter durations from 0 to 1440 whole minutes)`);
        const dateInput = card.querySelector<HTMLInputElement>('input[type="date"]');
        let date: number | null = null;
        let invalidDate = false;
        if (dateInput) {
          dateInput.disabled = !enabled;
          dateInput.required = enabled;
          dateInput.min = fmtDate(start);
          dateInput.max = fmtDate(monthEnd);
          date = parseDate(dateInput.value);
          invalidDate = enabled && (date === null || !dateInput.validity.valid);
          dateInput.setAttribute("aria-invalid", String(invalidDate));
          const error = card.querySelector<HTMLElement>(".wus-release-date-error")!;
          error.hidden = !invalidDate;
          error.textContent = invalidDate ? `Choose a release date from ${fmtDate(start)} to ${fmtDate(monthEnd)}.` : "";
          if (invalidDate) {
            invalidReleases.push(label);
            expandRelease(kind, true);
          }
        }
        card.classList.toggle("has-error", invalidDate || invalidDuration);
        const restartInput = container.querySelector<HTMLInputElement | HTMLSelectElement>(`#wus-release-${kind}-restart`);
        if (restartInput) restartInput.disabled = !enabled;
        const restartSummary = restartInput instanceof HTMLSelectElement
          ? restartInput.selectedOptions[0].textContent!
          : restartInput ? (restartInput.checked ? "Restart required" : "No restart") : "Restart not modeled";
        const status = !enabled ? "Not included" : invalidDate ? `${dateInput!.value ? "Invalid date" : "Date required"} · Not simulated`
          : invalidDuration ? "Invalid duration · Not simulated" : "Included";
        const durationSummary = invalidDuration ? "Check durations"
          : `DL ${durations.downloadMin ?? durationDefaults.downloadMin}m + Install ${durations.installMin ?? durationDefaults.installMin}m`;
        container.querySelector<HTMLElement>(`#wus-release-${kind}-summary`)!.textContent = [
          status, kind === "cu" ? patchDate : dateInput!.value || "Choose date", restartSummary,
          durationSummary, mode.value === "custom" ? "Custom" : "Defaults",
        ].join(" · ");
        if (kind === "cu") {
          const restartInput = container.querySelector<HTMLSelectElement>("#wus-release-cu-restart")!;
          restartInput.disabled = !enabled;
          const restartOverride = restartInput.value === "auto" ? undefined : restartInput.value === "yes";
          if (enabled && !invalidDuration) releases.push(...autoReleases(start).map((release) => ({
            ...release, ...durations,
            ...(release.date >= start && release.date <= monthEnd ? { restartOverride } : {}),
          })));
          continue;
        }
        if (!enabled || invalidDate || invalidDuration || date === null) continue;
        const restartOverride = restartInput instanceof HTMLSelectElement && restartInput.value !== "auto"
          ? restartInput.value === "yes"
          : undefined;
        const restart = restartInput instanceof HTMLSelectElement
          ? kind === "oob" || kind === "oobns"
          : !!restartInput?.checked;
        const title = kind === "software"
          ? container.querySelector<HTMLInputElement>("#wus-release-software-title")!.value.trim() || KIND_LABEL.software
          : KIND_LABEL[kind];
        releases.push({ id: `${kind}-${date}`, kind, date, label: `${title} ${fmtDate(date)}`, restart, restartOverride, auto: false, ...durations });
      }
      const releaseError = container.querySelector<HTMLElement>("#wus-release-error")!;
      releaseError.hidden = invalidReleases.length === 0;
      releaseError.textContent = invalidReleases.length ? `Check release dates (within the selected month) and durations (0–1440 whole minutes): ${invalidReleases.join(", ")}.` : "";
      const settings = { ...readSettings(container), tz };
      const policyValues = new Map(configuredPolicies({ ...settings, mwEnabled: true }));
      policyValues.set("MaintenanceWindowEnabled", String(Number(settings.mwEnabled)));
      policyValues.set("AllowOptionalContent", String(settings.optionalContent));
      policyValues.set("NoUpdateNotificationsDuringActiveHours", String(Number(settings.noNotifActive)));
      const syncCspValues = () => {
        for (const link of container.querySelectorAll<HTMLAnchorElement>("a[data-csp]")) {
          if (link.closest(".wus-assumption-table")) continue;
          const name = link.dataset.csp!;
          let value = policyValues.get(name);
          const option = link.dataset.radioCsp;
          if (option === "wus-installMode-auto") value = String(settings.resetToDefault ? 6 : 2);
          else if (option === "wus-installMode-scheduled") value = String(settings.schedSub === "scheduled" ? 3 : 2);
          else if (option === "wus-schedSub-scheduled") value = "3";
          else if (option?.startsWith("wus-notifLevel-")) value = option.slice("wus-notifLevel-".length);
          else if (link.closest("label")?.querySelector("#wus-resetToDefault")) value = String(settings.resetToDefault ? 6 : 2);
          if (value !== undefined) link.textContent = `${name} = ${value}`;
        }
      };
      syncCspValues();
      container.querySelector<HTMLElement>("#wus-policy-values")!.innerHTML = configuredPolicies(settings)
        .filter(([name, value]) => value !== "Not configured" || DEVICE_APPLIED_DEFAULTS.has(name))
        .map(([name, value]) => `<div class="wus-policy-value-row"><span class="wus-policy-value-name${DEVICE_APPLIED_DEFAULTS.has(name) ? " wus-csp-device-default" : ""}"${DEVICE_APPLIED_DEFAULTS.has(name) ? ` title="Device-applied default: ${DEVICE_APPLIED_DEFAULTS.get(name)} on the device even when not configured"` : ""}>${esc(name)} =</span><span class="wus-policy-value mono">${esc(value)}</span>${/^MaintenanceWindow(Daily|Weekly|Monthly)Interval$/.test(name) ? '<span class="wus-help">Windows Insider Preview · non-default intervals not simulated</span>' : ""}</div>`)
        .join("");
      const localInputs = [...container.querySelectorAll<HTMLInputElement>("#wus-local-active-hours input")];
      const invalidLocalHours = settings.installMode === "auto" && (
        localInputs.some((input) => !input.validity.valid) ||
        (Math.round((settings.activeEnd - settings.activeStart) * 60) + 1440) % 1440 > 1080
      );
      const localHoursError = container.querySelector<HTMLElement>("#wus-local-hours-error")!;
      localHoursError.hidden = !invalidLocalHours;
      localHoursError.textContent = invalidLocalHours ? "Enter start and end times no more than 18 hours apart." : "";
      for (const input of localInputs) input.setAttribute("aria-invalid", String(invalidLocalHours));
      const availabilityError = container.querySelector<HTMLElement>("#wus-availability-error")!;
      availabilityError.hidden = true;
      availabilityError.textContent = "";
      resultEl.hidden = invalidLocalHours;
      container.querySelector<HTMLElement>("#wus-edit-schedule")!.hidden = !invalidLocalHours;
      if (invalidLocalHours) {
        return;
      }
      const calendarReleases = releases.filter((r) => {
        if (r.kind === "cu" && r.auto) return true;
        if (r.kind === "driver") return !settings.excludeDrivers;
        if (r.kind === "software") return true;
        if (!settings.cloudEnabled) return false;
        const approval = settings.cloud[r.kind];
        return approval.auto || approval.approveAfter !== null;
      });
      resultEl.innerHTML = renderTimeline(start, simulate(settings, start, releases), calendarReleases, tz, settings, hidden);
      syncCollapsedGroups();
      resultEl.querySelector<HTMLDetailsElement>(".wus-layers")!.open = layersOpen;
      if (focusedLayer) resultEl.querySelector<HTMLInputElement>(`input[data-grp="${focusedLayer}"]`)?.focus({ preventScroll: true });
      syncCspValues();
      container.querySelector<HTMLInputElement>("#wus-zoom")!.value = monthChanged ? "0" : oldZoom;
      setTimelineZoom(resultEl, monthChanged ? 0 : Number(oldZoom));
      resultEl.querySelector<HTMLElement>(".wus-timeline-viewport")!.scrollLeft = monthChanged ? 0 : oldScroll;
    };

    const onInput = (e: Event) => {
      if (e.target instanceof Element && e.target.closest(".wus-assumption-filters")) {
        updateAssumptions();
        return;
      }
      if (e.target instanceof HTMLSelectElement && e.target.id.endsWith("-duration-mode") && e.target.value === "default") {
        // Do not overwrite saved overrides before their fields restore after the mode selector.
        const inputs = [...e.target.closest<HTMLElement>(".wus-release-card")!.querySelectorAll<HTMLInputElement>('input[type="number"]')]
          .filter((input) => input.value !== "");
        inputs.forEach((input) => { input.value = ""; });
        inputs.forEach((input) => input.dispatchEvent(new Event("input", { bubbles: true })));
      }
      if (e.type === "change" && e.target instanceof HTMLInputElement && e.target.checked && /^wus-release-.+-enabled$/.test(e.target.id)) {
        const kind = e.target.id.slice("wus-release-".length, -"-enabled".length);
        expandRelease(kind, true);
        if (e.isTrusted) container.querySelector<HTMLInputElement>(`#wus-release-${kind}-date`)?.focus();
      }
      if (e.target instanceof HTMLInputElement && /^wus-online(?:Always|-day-\d|StartTime|EndTime)$/.test(e.target.id)) {
        const always = container.querySelector<HTMLInputElement>("#wus-onlineAlways")!.checked;
        const startTime = Math.round(timeHour(container.querySelector<HTMLInputElement>("#wus-onlineStartTime")!.value) * 60);
        const endTime = Math.round(timeHour(container.querySelector<HTMLInputElement>("#wus-onlineEndTime")!.value) * 60);
        const migrated = WEEKDAYS.flatMap((_, day) => {
          if (!always && !container.querySelector<HTMLInputElement>(`#wus-online-day-${day}`)!.checked) return [];
          return [{ day, start: always || startTime === endTime ? 0 : startTime,
            end: always || startTime === endTime ? 1440 : endTime <= startTime ? endTime + 1440 : endTime }];
        });
        scheduleField.value = JSON.stringify(migrated);
      }
      if (e.target instanceof HTMLInputElement && e.target.id === "wus-zoom") {
        setTimelineZoom(resultEl, Number(e.target.value));
        return;
      }
      run();
    };
    const onNumberWheel = (e: WheelEvent) => {
      const input = e.target;
      if (!(input instanceof HTMLInputElement) || input.type !== "number" ||
          input.disabled || input.readOnly || input.step === "any" ||
          e.ctrlKey || e.metaKey || e.deltaY === 0 || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      e.preventDefault();
      const previous = input.value;
      if (e.deltaY < 0) input.stepUp();
      else input.stepDown();
      if (input.value !== previous) input.dispatchEvent(new Event("input", { bubbles: true }));
    };
    const onClick = (e: Event) => {
      const t = e.target as HTMLElement;
      const sortButton = t.closest<HTMLButtonElement>("[data-assumption-sort]");
      if (sortButton) {
        const key = sortButton.dataset.assumptionSort!;
        if (Object.prototype.hasOwnProperty.call(sortColumns, key)) {
          const next = key as AssumptionSort;
          assumptionAscending = next === assumptionSort ? !assumptionAscending : true;
          assumptionSort = next;
          updateAssumptions();
        }
        return;
      }
      if (t.closest("#wus-assumption-reset")) {
        clearAssumptionFilters();
        return;
      }
      const releaseEdit = t.closest<HTMLButtonElement>("[data-release-edit]");
      if (releaseEdit) {
        expandRelease(releaseEdit.dataset.releaseEdit!, releaseEdit.getAttribute("aria-expanded") !== "true");
        return;
      }
      if (t.closest("#wus-edit-schedule, .wus-online-edit, .wus-behavior-edit")) {
        e.preventDefault();
        scheduleEditor.open();
        return;
      }
      const group = t.closest<HTMLElement>(".wus-timeline-group[data-group-id]");
      if (group && !t.closest(".wus-config-link")) {
        const id = group.dataset.groupId!;
        if (collapsedGroups.has(id)) collapsedGroups.delete(id);
        else collapsedGroups.add(id);
        syncCollapsedGroups();
        return;
      }
      const configLink = t.closest<HTMLAnchorElement>(".wus-config-link, .wus-assume");
      if (configLink) {
        e.preventDefault();
        const heading = container.querySelector<HTMLElement>(configLink.hash)!;
        if (configLink.matches(".wus-assume") && heading.hidden) clearAssumptionFilters();
        for (let details = heading.closest<HTMLDetailsElement>("details"); details; details = details.parentElement?.closest<HTMLDetailsElement>("details") ?? null) {
          details.open = true;
        }
        const releaseEdit = heading.querySelector<HTMLButtonElement>("[data-release-edit]");
        if (releaseEdit) expandRelease(releaseEdit.dataset.releaseEdit!, true);
        heading.focus({ preventScroll: true });
        const section = heading.closest<HTMLElement>("li, tr, section")!;
        const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        section.scrollIntoView({ block: "center", behavior: reducedMotion ? "instant" : "smooth" });
        section.getAnimations().filter((animation) => animation.id === "wus-config-highlight").forEach((animation) => animation.cancel());
        section.animate([
          { boxShadow: "inset 0 0 0 2px var(--accent)", offset: 0 },
          { boxShadow: "inset 0 0 0 2px var(--accent)", offset: 0.65 },
          { boxShadow: "inset 0 0 0 2px transparent", offset: 1 },
        ], { duration: 2800, easing: "ease-out", id: "wus-config-highlight" });
        return;
      }
      const mark = t.closest<HTMLElement>("[data-n]");
      const monthStep = t.closest<HTMLButtonElement>("[data-month-step]");
      if (monthStep) {
        const input = container.querySelector<HTMLInputElement>("#wus-month")!;
        const [year, month] = input.value.split("-").map(Number);
        input.value = fmtDate(Date.UTC(year, month - 1 + Number(monthStep.dataset.monthStep), 1)).slice(0, 7);
        run();
        return;
      }
      if (t.id === "wus-month") { try { (t as HTMLInputElement).showPicker(); } catch { /* unsupported */ } return; }
      const zoomStep = t.closest<HTMLButtonElement>("[data-zoom-step]");
      if (zoomStep) {
        const slider = container.querySelector<HTMLInputElement>("#wus-zoom")!;
        setTimelineZoom(resultEl, Number(slider.value) + Number(zoomStep.dataset.zoomStep));
        return;
      }
      if (t.closest("#wus-fit")) {
        container.querySelector<HTMLInputElement>("#wus-zoom")!.value = "0";
        setTimelineZoom(resultEl, 0);
        resultEl.querySelector<HTMLElement>(".wus-timeline-viewport")!.scrollLeft = 0;
        return;
      }
      if (mark) {
        const row = container.querySelector<HTMLElement>(`#wus-row-${mark.dataset.n}`);
        const details = row?.closest<HTMLDetailsElement>("details");
        if (details) details.open = true;
        row?.scrollIntoView({ block: "center", behavior: "smooth" });
        row?.classList.add("is-flash");
        setTimeout(() => row?.classList.remove("is-flash"), 1200);
      }
    };
    const closeLayers = (e: Event) => {
      const layers = resultEl.querySelector<HTMLDetailsElement>(".wus-layers");
      if (!layers?.open) return;
      if (e instanceof KeyboardEvent) {
        if (e.key !== "Escape") return;
        layers.open = false;
        layers.querySelector("summary")!.focus();
      } else if (e.target instanceof Node && !layers.contains(e.target)) {
        layers.open = false;
      }
    };
    container.addEventListener("input", onInput);
    container.addEventListener("change", onInput);
    container.addEventListener("click", onClick);
    container.addEventListener("wheel", onNumberWheel, { passive: false });
    document.addEventListener("click", closeLayers);
    document.addEventListener("keydown", closeLayers);
    run();
    const cleanupTimeline = wireTimelineInteractions(container);

    return () => {
      scheduleEditor.cleanup();
      cleanupTimeline();
      container.removeEventListener("input", onInput);
      container.removeEventListener("change", onInput);
      container.removeEventListener("click", onClick);
      container.removeEventListener("wheel", onNumberWheel);
      document.removeEventListener("click", closeLayers);
      document.removeEventListener("keydown", closeLayers);
    };
  },
};

export default tool;