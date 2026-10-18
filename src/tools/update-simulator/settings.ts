import { BROWSER_TZ } from "./calendar";

export const LOCAL_ACTIVE_HOURS_HELP = "Active hours set locally in Windows Settings. With Automatically, Windows learns these hours from device usage, called Intelligent Active Hours. With Manually, the user chooses them. Policy-defined active hours take precedence.";

export type CloudKind = "cu" | "preview" | "oob" | "oobns";
export interface CloudApproval {
  auto: boolean;
  defer: number;
  approveAfter: number | null;
}

export interface Settings {  // Intune / Autopatch Windows quality update policy
  cloudEnabled: boolean;
  cloud: Record<CloudKind, CloudApproval>;
  hotpatch: boolean;
  // Offer
  deferDays: number;
  downloadMin: number;
  installMin: number;
  pauseEnabled: boolean;
  pauseStart: string;
  optionalContent: number;
  optionalContentEnabled: boolean;
  excludeDrivers: boolean;
  allowMUUpdateService: boolean;
  // Automatic update behaviour
  autoUpdate: number;
  resetToDefault: boolean;
  eduRestart: boolean;
  featureUninstallDays: number;
  schedDay: number;
  schedTime: number;
  schedFreq: number;
  installMode: string;
  schedSub: string;
  // Deadlines
  deadlineEnabled: boolean;
  deadlineDays: number;
  graceDays: number;
  noAutoReboot: boolean;
  // Active hours
  onlineAlways: boolean;
  onlineDays: boolean[]; // Mon..Sun
  onlineStart: number;
  onlineEnd: number;
  activeStart: number;
  activeEnd: number;
  // Maintenance window
  mwEnabled: boolean;
  mwActions: number;
  mwStart: string;
  mwDuration: number;
  mwRepeat: number;
  mwDailyInterval: number;
  mwWeeklyInterval: number;
  mwMonthlyInterval: number;
  mwStartDate: string;
  mwWeekly: boolean[]; // Mon..Sun
  mwMonthlySchedule: number;
  mwDayOfMonth: number;
  mwWeekOccurrence: number;
  mwWeekDay: number;
  // Notifications
  notifLevel: number;
  noNotifActive: boolean;
  noNotifActiveEnabled: boolean;
  // Device / user model
  userRestartNotify: boolean;
  userSignedIn: boolean;
  /** IANA time zone of the simulated device; all displayed times are wall-clock in this zone. */
  tz: string;
}

export const DEFAULTS: Settings = {
  cloudEnabled: false,
  cloud: {
    cu: { auto: true, defer: 0, approveAfter: null },
    preview: { auto: false, defer: 0, approveAfter: null },
    oob: { auto: false, defer: 0, approveAfter: null },
    oobns: { auto: false, defer: 0, approveAfter: null },
  },
  hotpatch: false,
  deferDays: 1,
  downloadMin: 5,
  installMin: 20,
  pauseEnabled: false,
  pauseStart: "",
  optionalContent: 0,
  optionalContentEnabled: false,
  excludeDrivers: false,
  allowMUUpdateService: true,
  autoUpdate: 6,
  resetToDefault: true,
  eduRestart: false,
  featureUninstallDays: 30,
  schedDay: 0,
  schedTime: 3,
  schedFreq: 0,
  installMode: "auto",
  schedSub: "active",
  deadlineEnabled: false,
  deadlineDays: 2,
  graceDays: 2,
  noAutoReboot: false,
  onlineAlways: false,
  onlineDays: [true, true, true, true, true, false, false],
  onlineStart: 8,
  onlineEnd: 17,
  activeStart: 7,
  activeEnd: 18,
  mwEnabled: false,
  mwActions: 1,
  mwStart: "",
  mwDuration: 2,
  mwRepeat: 1,
  mwDailyInterval: 1,
  mwWeeklyInterval: 1,
  mwMonthlyInterval: 1,
  mwStartDate: "",
  mwWeekly: [false, false, false, false, false, false, false],
  mwMonthlySchedule: 1,
  mwDayOfMonth: 1,
  mwWeekOccurrence: 1,
  mwWeekDay: 1,
  notifLevel: 0,
  noNotifActive: false,
  noNotifActiveEnabled: false,
  userRestartNotify: false,
  userSignedIn: true,
  tz: BROWSER_TZ,
};

export type FieldType = "bool" | "number" | "select" | "time" | "date";

export interface Field {
  key: keyof Settings;
  csp: string;
  label: string;
  type: FieldType;
  min?: number;
  max?: number;
  options?: [number, string][];
  help?: string;
}

export interface Group {
  id: string;
  title: string;
  fields: Field[];
}

export const GROUPS: Group[] = [
  {
    id: "pause",
    title: "Pause",
    fields: [
      { key: "pauseEnabled", csp: "PauseQualityUpdates", label: "Pause quality updates", type: "bool" },
      { key: "pauseStart", csp: "PauseQualityUpdatesStartTime", label: "Pause start date (35 days)", type: "date" },
      { key: "excludeDrivers", csp: "ExcludeWUDriversInQualityUpdate", label: "Driver Update", type: "bool", help: "Called Windows drivers in the Intune update ring policy. Inverted CSP: checked = Allow (0, drivers not excluded), unchecked = Block (1, drivers excluded)." },
      { key: "allowMUUpdateService", csp: "AllowMUUpdateService", label: "Microsoft product updates", type: "bool" },
    ],
  },
  {
    id: "maintenance",
    title: "Maintenance window (24H2+ with KB5077181)",
    fields: [
      { key: "mwEnabled", csp: "MaintenanceWindowEnabled", label: "Enable maintenance window", type: "bool" },
      {
        key: "mwActions",
        csp: "MaintenanceWindowUpdateActions",
        label: "Actions restricted to the window",
        type: "select",
        options: [[1, "1 - Download, install, restart"], [2, "2 - Install, restart"], [3, "3 - Restart only"]],
      },
      { key: "mwStart", csp: "MaintenanceWindowStartTime", label: "Start time", type: "time" },
      { key: "mwDuration", csp: "MaintenanceWindowDurationHours", label: "Duration (hours)", type: "number", min: 2, max: 24 },
      {
        key: "mwRepeat",
        csp: "MaintenanceWindowRepeatScheduleOption",
        label: "Repeat",
        type: "select",
        options: [[1, "1 - One time"], [2, "2 - Daily"], [3, "3 - Weekly"], [4, "4 - Monthly"]],
      },
      { key: "mwStartDate", csp: "MaintenanceWindowStartDate", label: "Start date (one time)", type: "date" },
      { key: "mwDailyInterval", csp: "MaintenanceWindowDailyInterval", label: "Daily interval (days, Insider Preview)", type: "number", min: 1, max: 90, help: "Windows Insider Preview only. Default: 1. Non-default intervals are listed below but not applied to the simulated timeline." },
      { key: "mwWeeklyInterval", csp: "MaintenanceWindowWeeklyInterval", label: "Weekly interval (weeks, Insider Preview)", type: "number", min: 1, max: 12, help: "Windows Insider Preview only. Default: 1. Non-default intervals are listed below but not applied to the simulated timeline." },
      { key: "mwMonthlyInterval", csp: "MaintenanceWindowMonthlyInterval", label: "Monthly interval (months, Insider Preview)", type: "number", min: 1, max: 3, help: "Windows Insider Preview only. Default: 1. Non-default intervals are listed below but not applied to the simulated timeline." },
      {
        key: "mwMonthlySchedule",
        csp: "MaintenanceWindowMonthlySchedule",
        label: "Monthly schedule",
        type: "select",
        options: [[1, "1 - Day of month"], [2, "2 - Week based"], [3, "3 - Last day of month"]],
      },
      { key: "mwDayOfMonth", csp: "MaintenanceWindowMonthlyMonthBasedDayOfMonth", label: "Day of month", type: "number", min: 1, max: 28 },
      {
        key: "mwWeekOccurrence",
        csp: "MaintenanceWindowMonthlyWeekBasedOccurrenceInMonth",
        label: "Occurrence in month",
        type: "select",
        options: [[1, "First"], [2, "Second"], [3, "Third"], [4, "Fourth"], [5, "Last"]],
      },
      {
        key: "mwWeekDay",
        csp: "MaintenanceWindowMonthlyWeekBasedDayOfTheWeek",
        label: "Day of the week",
        type: "select",
        options: [[1, "Sunday"], [2, "Monday"], [3, "Tuesday"], [4, "Wednesday"], [5, "Thursday"], [6, "Friday"], [7, "Saturday"]],
      },
    ],
  },
  {
    id: "extra",
    title: "Extra CSPs",
    fields: [
      { key: "noNotifActive", csp: "NoUpdateNotificationsDuringActiveHours", label: "Suppress update notifications during active hours", type: "bool" },
      {
        key: "optionalContent",
        csp: "AllowOptionalContent",
        label: "Optional updates (preview CUs / CFRs)",
        type: "select",
        options: [
          [0, "0 - Not offered automatically"],
          [1, "1 - Automatically (incl. CFRs)"],
          [2, "2 - Automatically (optional CUs)"],
          [3, "3 - User selects"],
        ],
      },
    ],
  },
  {
    id: "user-behavior",
    title: "Device model",
    fields: [
      { key: "userRestartNotify", csp: "User setting", label: "Notify me when a restart is required", type: "bool" },
      { key: "userSignedIn", csp: "Device", label: "A user is signed in when notifications fire", type: "bool" },
    ],
  },
];

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export const DEVICE_APPLIED_DEFAULTS: ReadonlyMap<string, number> = new Map([
  ["ConfigureDeadlineNoAutoReboot", 0],
  ["PauseFeatureUpdates", 0],
  ["AllowMUUpdateService", 1],
  ["SetDisablePauseUXAccess", 1],
  ["SetEDURestart", 0],
  ["ConfigureFeatureUpdateUninstallPeriod", 30],
]);

export function configuredPolicies(s: Settings): [string, string][] {
  const value = (v: string | number | boolean) =>
    typeof v === "boolean" ? String(Number(v)) : v === "" ? "Not configured" : String(v);
  const rows: [string, string][] = [];
  const add = (name: string, v: string | number | boolean) => rows.push([name, value(v)]);
  add("DeferQualityUpdatesPeriodInDays", s.deferDays);
  add("ConfigureDeadlineForQualityUpdates", s.deadlineEnabled ? s.deadlineDays : "");
  add("ConfigureDeadlineGracePeriod", s.graceDays);
  add("ConfigureDeadlineNoAutoReboot", s.noAutoReboot);
  add("AllowAutoUpdate", s.autoUpdate);
  add("SetEDURestart", s.eduRestart);
  add("ConfigureFeatureUpdateUninstallPeriod", s.featureUninstallDays);
  add("SetDisablePauseUXAccess", DEVICE_APPLIED_DEFAULTS.get("SetDisablePauseUXAccess")!);
  add("PauseFeatureUpdates", DEVICE_APPLIED_DEFAULTS.get("PauseFeatureUpdates")!);
  const active = s.installMode === "scheduled" && s.schedSub === "active";
  add("ActiveHoursStart", active ? s.activeStart : "");
  add("ActiveHoursEnd", active ? s.activeEnd : "");
  const scheduled = s.autoUpdate === 3;
  add("ScheduledInstallDay", scheduled ? s.schedDay : "");
  add("ScheduledInstallTime", scheduled ? s.schedTime : "");
  for (const [i, name] of ["Every", "First", "Second", "Third", "Fourth"].entries()) {
    add(`ScheduledInstall${name}Week`, scheduled ? s.schedFreq === i : "");
  }
  add("UpdateNotificationLevel", s.notifLevel);
  for (const g of GROUPS.filter((group) => group.id !== "user-behavior")) {
    if (g.id === "maintenance" && !s.mwEnabled) continue;
    for (const f of g.fields) {
      if (f.key === "optionalContent" && !s.optionalContentEnabled) continue;
      if (f.key === "noNotifActive" && !s.noNotifActiveEnabled) continue;
      const v = s[f.key];
      if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") add(f.csp, v);
    }
  }
  if (s.mwEnabled) {
    for (const [i, day] of ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].entries()) {
      add(`MaintenanceWindowWeekly${day}`, s.mwWeekly[i]);
    }
  }
  add("AllowRebootlessUpdates", s.cloudEnabled ? s.hotpatch : "");
  return rows;
}
