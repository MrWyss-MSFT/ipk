import { DEVICE_APPLIED_DEFAULTS } from "./settings";

export interface Assumption {
  text: string;
  url: string;
}

const CSP = "https://learn.microsoft.com/windows/client-management/mdm/policy-csp-update";
const DEADLINES = "https://learn.microsoft.com/windows/deployment/update/wufb-compliancedeadlines";
const CLOCK = DEADLINES + "#:~:text=The%20deadline%20calculation%20for%20both%20quality%20and%20feature%20updates%20is%20based%20on%20when%20the%20client%20initially%20discovered%20the%20update%20through%20scan";
const DEC2024 = DEADLINES + "#:~:text=Starting%20with%20the%20December%2010%2C%202024%20update%20for%20Windows%2011";
const NOREBOOT = DEADLINES + "#:~:text=opt%20out%20of%20automatic%20restarts%20until%20the%20grace%20period%20ends";
const GRACE = DEADLINES + "#:~:text=The%20grace%20period%20for%20both%20quality%20and%20feature%20updates%20starts%20its%20countdown";
const CSPA = CSP + "#";
const OVERVIEW = "https://learn.microsoft.com/windows/deployment/windows-autopatch/manage/windows-autopatch-windows-quality-update-overview";
const HOTPATCH = "https://learn.microsoft.com/windows/deployment/windows-autopatch/manage/windows-autopatch-hotpatch-updates";
const RELEASE = "https://learn.microsoft.com/windows/deployment/update/release-cycle";

export const ASSUMPTIONS = {
  cloudOverridesClient: {
    text: "Documented policy precedence: when a device and update are covered by a cloud-based Windows quality update policy (Intune / Autopatch), that policy controls approval and deferral instead of the client-side deferral ({{DeferQualityUpdatesPeriodInDays}}). The deferrals are not added together. Client deadlines and grace periods still apply.",
    url: OVERVIEW + "#:~:text=Deferrals%20set%20in%20cloud-based%20quality%20update%20policies%20override%20any%20client-side%20deferral%20settings",
  },
  cloudOptionalContent: {
    text: "Simulation assumption - optional content: enabled preview releases are assumed eligible for offering, subject to the simulated approval, deferral, pause and hotpatch settings. {{AllowOptionalContent}} is documentation-only in Extra CSPs and does not affect the timeline, even when included in Configured policies. Individual controlled feature rollouts (CFRs) and user selection of optional updates are not modeled.",
    url: CSPA + "allowoptionalcontent",
  },
  cloudClientPause: {
    text: "Simulation assumption - client pause: the simulator still applies the client-side quality-update pause ({{PauseQualityUpdatesStartTime}}) to cloud-approved updates. This interaction is not established by the cited documentation and does not follow from cloud deferral taking precedence.",
    url: CSPA + "pausequalityupdatesstarttime",
  },
  manualApproval: {
    text: "Manual approval has no fixed timing, so it is modeled as the entered number of days after the release date, at the release time. Leave it empty to simulate an update that is never approved.",
    url: OVERVIEW + "#:~:text=For%20manual%20approval%2C%20you%20control%20when%20updates%20are%20offered",
  },
  hotpatchEligible: {
    text: "The device is assumed to be hotpatch-eligible (Windows 11 24H2 or later, a qualifying license, VBS running, and on the latest baseline update).",
    url: HOTPATCH + "#:~:text=Devices%20must%20be%20on%20the%20latest%20baseline%20release%20version%20to%20qualify%20for%20hotpatch%20updates",
  },
  hotpatchCalendar: {
    text: "Automatic B-week restart behavior follows the usual hotpatch cycle: January, April, July and October are baseline months that need a restart; the other months install the B-week security update without a restart. Microsoft can release unplanned baselines outside that schedule. Use the selected month's B-week restart override to model these exceptions.",
    url: HOTPATCH + "#:~:text=Hotpatch%3A%20Includes%20security%20updates.%20No%20restart%20required.",
  },
  restartOverride: {
    text: "The release's restart requirement is explicitly overridden in Releases (simulation). For monthly B-week updates, this takes precedence over the usual hotpatch calendar. For OOB updates, the automatic default requires a restart; select No only when modeling an OOB hotpatch or other release documented to install without a restart. Some OOB hotpatches require a prerequisite security update to already be installed. This models release behavior, not a device policy that can suppress a required restart.",
    url: "https://support.microsoft.com/en-us/servicing/os/hotpatch/windows-11/2026/kb5121768-hotpatch-out-of-band",
  },
  hotpatchNonSecurity: {
    text: "With hotpatch enabled, non-security updates (preview and OOB non-security) are not offered, because they would remove the device from the hotpatch path. The FAQ only names non-security updates in general; the simulator applies it to both.",
    url: OVERVIEW + "#:~:text=If%20a%20policy%20has%20hotpatch%20updates%20enabled%20and%20non-security%20updates%20are%20approved",
  },  deadlineClock: {
    text: "The deadline ({{ConfigureDeadlineForQualityUpdates}}) clock starts when the device first discovers the update through a scan (the older release-date basis was replaced). The simulator starts this clock at the first online opportunity after approval, deferral and any modeled pause allow the update to be offered.",
    url: CLOCK,
  },
  autoUpdateVsDeadline: {
    text: "When a deadline ({{ConfigureDeadlineForQualityUpdates}}) is set, the install timing from {{AllowAutoUpdate}} (e.g. a scheduled 3:00 AM install) still applies until the deadline passes; after that, the deadline forces the install. Microsoft documents this in a December 2024 note, but an older line in the same article says the deadline overrides {{AllowAutoUpdate}} completely. The simulator follows the newer note.",
    url: DEC2024,
  },
  deadlineImmediate: {
    text: "With a deadline ({{ConfigureDeadlineForQualityUpdates}}) configured, updates are downloaded and installed as soon as they are offered.",
    url: DEADLINES + "#:~:text=updates%20are%20downloaded%20and%20installed%20as%20soon%20as%20they%20are%20offered",
  },
  deadlineZero: {
    text: "A deadline ({{ConfigureDeadlineForQualityUpdates}}) of 0 days is modeled as the same-day best case. The Update CSP says it installs immediately upon offering but might not finish within the day due to device availability and network connectivity.",
    url: CSP + "#:~:text=updates%20will%20download%20and%20install%20immediately%2C%20but%20might%20not%20finish%20within%20the%20day",
  },
  releaseTime: {
    text: "Patch Tuesday releases are published around 10:00 AM Pacific. The simulator converts that to the time zone selected next to the calendar dates (default: this browser), so the offer appears at the matching local time.",
    url: RELEASE + "#:~:text=typically%20published%20at%2010%3A00%20AM%20Pacific%20Time",
  },
  previewDate: {
    text: "Docs typically place optional non-security previews in the fourth week, but the exact date is not assumed. Enable the Preview CU row and choose its date under Releases (simulation); none are generated automatically.",
    url: RELEASE + "#:~:text=typically%20released%20the%20fourth%20week%20of%20the%20month",
  },
  userEvents: {
    text: "Out-of-band and driver release dates are unpredictable, so they are user-entered. OOB releases default to requiring a restart; some OOB security hotpatches can install without restarting when prerequisites are met, and can be modeled with the release restart override. Non-critical OOB updates may only be available from the Microsoft Update Catalog; they are modeled here as if offered through Windows Update.",
    url: RELEASE,
  },
  driverDeferral: {
    text: "Managed driver deferral is a separate cloud-side Intune / Autopatch Driver Update policy setting, not the quality-update deferral CSP shown in this tool. Microsoft documents that {{DeferQualityUpdatesPeriodInDays}} does not apply to drivers approved through a Driver Update policy; quality-update deadline and grace settings do apply. The simulator does not yet model a separate Driver Update policy: reusing the quality-update deferral and pause for drivers is a simulation simplification, not documented driver-policy behavior. The driver release row controls whether a restart is required.",
    url: "https://learn.microsoft.com/intune/device-updates/windows/driver-updates-faq#how-do-i-set-deferrals-for-drivers",
  },
  softwareUpdates: {
    text: "Microsoft product updates are modeled as offered when {{AllowMUUpdateService}} is enabled, then downloaded and installed using the simulated device availability, durations and automatic install schedule (3 AM for automatic mode). Product applicability is assumed. Windows quality-update deferrals, pauses, cloud approvals, hotpatch, deadlines and maintenance windows are not applied to these releases; product-specific behavior and restarts are not modeled. This is a timing approximation, not a guarantee for every product. On real devices, setting AllowMUUpdateService back to 0 or Not configured does not automatically unregister an already enabled Microsoft Update service; the simulator does not track that registration history. Microsoft's linked list identifies products that might be updated.",
    url: "https://learn.microsoft.com/en-us/windows/deployment/update/update-other-microsoft-products",
  },
  excludeDriversName: {
    text: "The simulator uses the Update CSP {{ExcludeWUDriversInQualityUpdate}} to exclude standalone driver updates from Windows Update.",
    url: CSPA + "excludewudriversinqualityupdate",
  },
  maintenanceAt3: {
    text: "Automatic Maintenance is assumed to run daily at 03:00 on an idle, plugged-in device. Docs say installation happens during Automatic Maintenance, and forced after two days of failed maintenance, but not at what time it starts.",
    url: CSPA + "allowautoupdate",
  },
  mode4: {
    text: "{{AllowAutoUpdate}} 4 (no end-user control) is modeled like mode 2 for timing; docs do not describe a timing difference.",
    url: CSPA + "allowautoupdate",
  },
  discoveryImmediate: {
    text: "Deferral is measured from release, independently of device availability. The device is assumed to scan and discover the update at its first online opportunity once approval, deferral and any modeled pause allow it to be offered. Discovery and offering are shown as one event: treating these as simultaneous is a modeling assumption, not an explicit guarantee in the Windows 11 documentation. Microsoft product updates use the first online opportunity at or after release. No additional scan cadence or random delay is modeled; real devices discover updates on their next scan.",
    url: CLOCK,
  },
  onlineHours: {
    text: "Online days and hours are when the device is powered on and connected. Discovery and offering wait until the device is online, after approval, deferral and any modeled pause. Before the effective deadline, an automatic restart needs an online period outside active hours (and inside the maintenance window, if used). If none exists, it waits for the effective deadline, or stays pending if none is set. An offline device restarts at its first online opportunity at or after the effective deadline, ignoring active hours. A deadline warning is only shown if the device is online before that restart; a full 15-minute warning is not guaranteed on return from offline. Download and install starts shift online but their durations run continuously. Other notification times and maintenance windows are not adjusted. Overnight periods belong to the day they start; matching start and end hours mean all day on selected days. This is a simulation input, not a Windows setting.",
    url: CSPA + "allowautoupdate",
  },
  restartPending: {
    text: "After installation the device is restart pending: users can schedule the restart until the effective deadline, and Windows can still restart automatically outside active hours. At the effective deadline the restart is forced regardless of active hours.",
    url: DEADLINES + "#:~:text=users%20can%20schedule%20restarts%20before%20the%20effective%20deadline",
  },
  installDuration: {
    text: "Download and installation durations are not documented. They are user-configurable (defaults 5 and 20 minutes); the restart-pending moment is when installation finishes.",
    url: CSPA + "allowautoupdate",
  },
  notifyDefaultOff: {
    text: "With 'Notify me when a restart is required' Off (the default), the restart-required notification appears 24 hours after the restart becomes pending. When On it appears immediately and automatic restarts are blocked for 24 hours (Windows 11 23H2+).",
    url: DEADLINES + "#:~:text=they%20receive%20a%20toast%20notification%20that%20a%20restart%20is%20required%2024%20hours%20after%20the%20device%20enters%20a%20restart%20pending%20state",
  },
  noReminders: {
    text: "Docs describe reminders before the deadline without exact intervals; they are not drawn. Only the documented 15-minute warnings and the deadline notice are shown.",
    url: DEADLINES + "#:~:text=toast%20notifications%20may%20occur%20at%20regular%20intervals%20before%20the%20day%20of%20the%20deadline",
  },
  notifLevelMeaning: {
    text: "{{UpdateNotificationLevel}} 1 is modeled as hiding the restart-required notification but keeping restart warnings; level 2 hides everything except the notice at the deadline, as documented.",
    url: CSPA + "updatenotificationlevel",
  },
  noNotifActiveHours: {
    text: "{{NoUpdateNotificationsDuringActiveHours}} is documentation-only in Extra CSPs and does not affect the simulated notifications, even when included in Configured policies. The CSP accepts 0/1, although its description also lists the levels from {{UpdateNotificationLevel}}.",
    url: CSPA + "noupdatenotificationsduringactivehours",
  },
  noAutoReboot: {
    text: "The UI's 'Auto reboot before deadline' displays {{ConfigureDeadlineNoAutoReboot}} and models the documented quality-update behavior of {{ConfigureDeadlineNoAutoRebootForQualityUpdates}}: checked means 0 (early restarts allowed outside active hours); unchecked means 1 (blocked until both deadline and grace period expire). Microsoft's Windows 10 guidance lists the generic name; Windows 11 guidance lists separate feature/quality settings. Their mapping on Windows 11 is unverified. The effective deadline is the later of offer + deadline and restart-pending + grace. The forced restart is at that time regardless of active hours, with its warning 15 minutes beforehand when the device is online and sufficient time remains.",
    url: NOREBOOT,
  },
  deadlineForcedRestart: {
    text: "At the effective deadline (the later of discovery + deadline ({{ConfigureDeadlineForQualityUpdates}}) and restart-pending + grace ({{ConfigureDeadlineGracePeriod}})) the restart is forced regardless of active hours. The warning is 15 minutes before that time, not an extra 15-minute extension. The simulation moves an offline restart to the next online period; a full warning is not guaranteed if insufficient online time remains.",
    url: GRACE,
  },
  mwWindow: {
    text: "Maintenance window: only the selected actions ({{MaintenanceWindowUpdateActions}}) are limited to the window, and a restart is not started in the last 30 minutes of a window. An expired deadline overrides the window. Docs recommend using either a maintenance window or deadlines, not both.",
    url: CSPA + "maintenancewindowupdateactions",
  },
  mwLast: {
    text: "Occurrence 5 ({{MaintenanceWindowMonthlyWeekBasedOccurrenceInMonth}}) in the weekly-based monthly schedule is interpreted as the last occurrence of that weekday.",
    url: CSPA + "maintenancewindowmonthlyweekbasedoccurrenceinmonth",
  },
  activeHours: {
    text: "Policy-defined active hours ({{ActiveHoursStart}} / {{ActiveHoursEnd}}) take precedence over Local active hours under Simulate Device / User. Local hours represent either user-selected manual hours or automatically learned Intelligent Active Hours. Scheduled Install mode ignores local hours as described in the separate, unverified mode 3 assumption.",
    url: CSPA + "activehoursstart",
  },
  mode3Countdown: {
    text: "{{AllowAutoUpdate}} 3 documents a 15-minute countdown following installation. The simulator assumes local active hours (manual or intelligent) do not block this restart. There is no strong evidence confirming this precedence; this is an unverified modeling choice, not established Windows behavior. Device availability and deadline/no-auto-reboot restrictions still apply.",
    url: CSPA + "allowautoupdate",
  },
  pauseModel: {
    text: "A pause holds back offers until 35 days after the pause start date ({{PauseQualityUpdatesStartTime}}); the update is then offered immediately.",
    url: CSPA + "pausequalityupdatesstarttime",
  },
} satisfies Record<string, Assumption>;

/** Assumption text uses {{SettingName}} markers for CSP setting names. */
export function assumptionPlain(text: string): string {
  return text.replace(/\{\{(.+?)\}\}/g, "$1");
}

export function cspLink(name: string, label = name): string {
  const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const observed = DEVICE_APPLIED_DEFAULTS.get(name);
  const note = name === "ConfigureDeadlineNoAutoReboot"
    ? " Microsoft documents this name for Windows 10, but lists ConfigureDeadlineNoAutoRebootForFeatureUpdates and ConfigureDeadlineNoAutoRebootForQualityUpdates for Windows 11. Whether this value controls both on Windows 11 is not documented in the cited guidance. The simulator retains the quality-update behavior: checked allows early restarts; unchecked waits until both deadline and grace period expire."
    : "";
  const url = name === "ConfigureDeadlineNoAutoReboot" ? DEADLINES
    : `https://learn.microsoft.com/en-us/windows/client-management/mdm/policy-csp-update#${encodeURIComponent(name.toLowerCase())}`;
  return `<a class="wus-csp${observed !== undefined ? " wus-csp-device-default" : ""}" data-csp="${esc(name)}"${observed !== undefined ? ` title="${esc(`Device-applied default: ${observed} on the device even when not configured.${note}`)}"` : ""} href="${url}" target="_blank" rel="noopener">${esc(label)}</a>`;
}

export function assumptionHtml(text: string): string {
  const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return esc(text).replace(/\{\{(.+?)\}\}/g, (_, name: string) => cspLink(name));
}

export type AssumptionId  = keyof typeof ASSUMPTIONS;

export const ASSUMPTION_GROUPS = {
  "Releases and discovery": ["releaseTime", "previewDate", "userEvents", "discoveryImmediate", "driverDeferral", "excludeDriversName", "softwareUpdates"],
  "Cloud policies and hotpatch": ["cloudOverridesClient", "cloudOptionalContent", "cloudClientPause", "manualApproval", "hotpatchEligible", "hotpatchCalendar", "hotpatchNonSecurity", "restartOverride"],
  "Installation and device availability": ["maintenanceAt3", "installDuration", "onlineHours", "mode4", "pauseModel"],
  "Active hours and restarts": ["activeHours", "mode3Countdown", "restartPending"],
  "Deadlines and grace periods": ["deadlineClock", "autoUpdateVsDeadline", "deadlineImmediate", "deadlineZero", "noAutoReboot", "deadlineForcedRestart"],
  "Notifications": ["notifyDefaultOff", "noReminders", "notifLevelMeaning", "noNotifActiveHours"],
  "Maintenance windows": ["mwWindow", "mwLast"],
} satisfies Record<string, AssumptionId[]>;
