import { DEFAULTS, DEVICE_APPLIED_DEFAULTS, GROUPS } from "./settings";
import { makePsCommandVariants } from "@/app/ps-command";

export interface PolicyImport {
  reported: [string, string][];
  controls: Record<string, string | boolean>;
  errors: string[];
  warnings: string[];
  policies: [string, string][];
}

export const POLICY_EXPORT_COMMANDS = makePsCommandVariants('($p.PSObject.Properties | Where-Object { $_.Name -notlike \'PS*\' -and $_.Name -notlike \'*_ProviderSet\' -and $_.Name -notlike \'*_WinningProvider\' -and $_.Name -notlike \'*_LastWrite\' } | ForEach-Object { "{0} = {1}" -f $_.Name, $_.Value }) -join [Environment]::NewLine', {
  setup: "$p = Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\PolicyManager\\current\\device\\Update' -ErrorAction Stop; ",
});

const fields = GROUPS.filter((g) => g.id !== "user-behavior").flatMap((g) => g.fields);
const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const weeks = ["Every", "First", "Second", "Third", "Fourth"];
export const ENROLLMENT_POLICIES: Readonly<Record<string, string>> = {
  DriverUpdateEnrolled: "Driver updates",
  FeatureUpdateEnrolled: "Feature updates",
  QualityUpdateEnrolled: "Quality updates",
  QuickMachineRecoveryEnrolled: "Quick Machine Recovery",
};
export const NON_SIMULATED_POLICIES: Readonly<Record<string, number>> = {
  ConfigureDeadlineForFeatureUpdates: 30,
  DeferFeatureUpdatesPeriodInDays: 365,
  SetDisablePauseUXAccess: 1,
};

export function parsePolicyImport(text: string): PolicyImport {
  const result: PolicyImport = { controls: {}, errors: [], warnings: [], policies: [], reported: [] };
  const values = new Map<string, string>();
  const put = (name: string, raw: unknown) => {
    if (/^PS(Path|ParentPath|ChildName|Drive|Provider)$|_(ProviderSet|WinningProvider|LastWrite)$/i.test(name)) {
      result.warnings.push(`Registry metadata excluded: ${name}`);
      return;
    }
    if (typeof raw !== "string" && typeof raw !== "number" && typeof raw !== "boolean") {
      result.errors.push(`${name}: expected a scalar value.`);
      return;
    }
    const value = typeof raw === "boolean" ? String(Number(raw)) : String(raw).trim();
    if (values.has(name) && values.get(name) !== value) result.errors.push(`${name}: conflicting duplicate values.`);
    values.set(name, value);
  };
  if (text.trim().startsWith("{")) {
    try {
      const parsed: unknown = JSON.parse(text);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) result.errors.push("Expected a JSON object of policy names and values.");
      else for (const [name, value] of Object.entries(parsed)) put(name, value);
    } catch (error) {
      result.errors.push(`Invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
  } else {
    for (const line of text.split(/\r?\n/).filter((line) => line.trim())) {
      const match = /^\s*([A-Za-z][A-Za-z0-9_]*)\s*(?:=|:)\s*(.*?)\s*$/.exec(line);
      if (!match) result.errors.push(`Cannot read line: ${line}`);
      else put(match[1], match[2]);
    }
  }
  if (!values.size) result.errors.push("No policies found.");
  const controls = result.controls;
  for (const f of fields) controls[`wus-${f.key}`] = f.type === "bool"
    ? f.key === "excludeDrivers" ? !DEFAULTS.excludeDrivers : Boolean(DEFAULTS[f.key])
    : String(DEFAULTS[f.key]);
  Object.assign(controls, {
    "wus-deferDays": "1", "wus-deadlineDays": "", "wus-graceDays": "2",
    "wus-autoRebootBeforeDeadline": true, "wus-resetToDefault": true,
    "wus-eduRestart": false, "wus-featureUninstallDays": "30",
    "wus-optionalContentEnabled": false, "wus-noNotifActiveEnabled": false,
    "wus-featureDeadlineEnabled": false, "wus-featureDeferralEnabled": false, "wus-disablePauseUXEnabled": false,
    "wus-activeStart": "8", "wus-activeEnd": "17",
    "wus-schedDay": "0", "wus-schedTime": "3", "wus-schedFreq": "0",
    "radio:installMode": "auto", "radio:schedSub": "active", "radio:notifLevel": "0",
  });
  days.forEach((_, i) => { controls[`wus-wk-${i}`] = false; });
  const specs = new Map<string, { id: string; min?: number; max?: number; allowed?: number[]; type?: string }>();
  for (const f of fields) specs.set(f.csp, { id: `wus-${f.key}`, min: f.min, max: f.max,
    allowed: f.type === "bool" ? [0, 1] : f.options?.map(([n]) => n), type: f.type });
  const number = (name: string, id: string, min: number, max: number, allowed?: number[]) =>
    specs.set(name, { id, min, max, allowed });
  number("DeferQualityUpdatesPeriodInDays", "wus-deferDays", 0, 30);
  number("ConfigureDeadlineForQualityUpdates", "wus-deadlineDays", 0, 30);
  number("ConfigureDeadlineGracePeriod", "wus-graceDays", 0, 7);
  number("ConfigureDeadlineNoAutoReboot", "wus-autoRebootBeforeDeadline", 0, 1);
  number("AllowAutoUpdate", "auto", 2, 6, [2, 3, 6]);
  number("SetEDURestart", "wus-eduRestart", 0, 1);
  number("ConfigureFeatureUpdateUninstallPeriod", "wus-featureUninstallDays", 2, 60);
  number("ActiveHoursStart", "wus-activeStart", 0, 23);
  number("ActiveHoursEnd", "wus-activeEnd", 0, 23);
  number("ScheduledInstallDay", "wus-schedDay", 0, 7);
  number("ScheduledInstallTime", "wus-schedTime", 0, 23);
  number("UpdateNotificationLevel", "radio:notifLevel", 0, 2);
  days.forEach((day, i) => number(`MaintenanceWindowWeekly${day}`, `wus-wk-${i}`, 0, 1));
  weeks.forEach((week) => number(`ScheduledInstall${week}Week`, `week:${week}`, 0, 1));
  const inactive = (name: string) => {
    const mode = values.get("AllowAutoUpdate") ?? "6";
    if (name.startsWith("ScheduledInstall")) return mode !== "3";
    if (/^ActiveHours(Start|End)$/.test(name)) return mode === "3";
    if (!name.startsWith("MaintenanceWindow") || name === "MaintenanceWindowEnabled") return false;
    if (values.get("MaintenanceWindowEnabled") !== "1") return true;
    const repeat = values.get("MaintenanceWindowRepeatScheduleOption") ?? "1";
    const monthly = values.get("MaintenanceWindowMonthlySchedule") ?? "1";
    if (name === "MaintenanceWindowStartDate") return repeat !== "1";
    if (/^MaintenanceWindowWeekly(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)$/.test(name)) return repeat !== "3";
    if (name.startsWith("MaintenanceWindowMonthly") && !name.endsWith("Interval")) {
      if (repeat !== "4") return true;
      if (name.includes("MonthBased")) return monthly !== "1";
      if (name.includes("WeekBased")) return monthly !== "2";
    }
    return false;
  };
  for (const [name, value] of values) {
    if (value === "Not configured") continue;
    if (Object.hasOwn(ENROLLMENT_POLICIES, name)) {
      const max = Object.hasOwn(ENROLLMENT_POLICIES, name) ? 1 : NON_SIMULATED_POLICIES[name];
      if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > max) {
        result.errors.push(`${name}: expected a whole number from 0 to ${max}.`);
      } else {
        result.reported.push([name, value]);
        result.policies.push([name, value]);
      }
      continue;
    }
    if (name === "AllowRebootlessUpdates") {
      if (!["0", "1"].includes(value)) result.errors.push(`${name}: expected 0 or 1.`);
      else result.warnings.push(`${name}: excluded; cloud settings are preserved.`);
      continue;
    }
    if (DEVICE_APPLIED_DEFAULTS.has(name) && !specs.has(name)) {
      if (value !== String(DEVICE_APPLIED_DEFAULTS.get(name))) result.errors.push(`${name}: only the simulator's fixed default ${DEVICE_APPLIED_DEFAULTS.get(name)} is supported.`);
      else result.policies.push([name, value]);
      continue;
    }
    const spec = specs.get(name);
    if (!spec) {
      result.reported.push([name, value]);
      result.policies.push([name, value]);
      continue;
    }
    const n = Number(value);
    if (spec.type === "date") {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) {
        result.errors.push(`${name}: expected a valid YYYY-MM-DD date.`); continue;
      }
    } else if (spec.type === "time") {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) { result.errors.push(`${name}: expected HH:mm.`); continue; }
    } else if (!/^\d+$/.test(value) || !Number.isSafeInteger(n) || (spec.min !== undefined && n < spec.min) ||
      (spec.max !== undefined && n > spec.max) || (spec.allowed && !spec.allowed.includes(n))) {
      result.errors.push(`${name}: value ${value} is outside the simulator's supported values.`); continue;
    }
    if (/^MaintenanceWindow(Daily|Weekly|Monthly)Interval$/.test(name)) {
      if (n !== 1) result.errors.push(`${name}: non-default Insider intervals cannot be simulated.`);
      else result.warnings.push(`${name}: default interval excluded; Insider policies are not configured.`);
      continue;
    }
    if (inactive(name)) { result.warnings.push(`${name}: inactive for the selected mode; will be discarded.`); continue; }
    result.policies.push([name, value]);
    if (name === "AllowAutoUpdate") {
      controls["radio:installMode"] = n === 3 ? "scheduled" : "auto";
      controls["radio:schedSub"] = n === 3 ? "scheduled" : "active";
      controls["wus-resetToDefault"] = n === 6;
    } else if (name === "ConfigureDeadlineNoAutoReboot") controls[spec.id] = n === 0;
    else if (name === "ExcludeWUDriversInQualityUpdate") controls[spec.id] = n === 0;
    else if (name === "SetEDURestart" || spec.type === "bool" || name.startsWith("MaintenanceWindowWeekly")) controls[spec.id] = n === 1;
    else controls[spec.id] = value;
    if (name === "AllowOptionalContent") controls["wus-optionalContentEnabled"] = true;
    if (name === "NoUpdateNotificationsDuringActiveHours") controls["wus-noNotifActiveEnabled"] = true;
    const extra = GROUPS.find((g) => g.id === "extra")!.fields.find((f) => f.csp === name);
    if (extra) controls[`wus-${extra.key}Enabled`] = true;
  }
  const active = values.has("ActiveHoursStart") || values.has("ActiveHoursEnd");
  if (active && values.get("AllowAutoUpdate") !== "3") {
    if (!values.has("ActiveHoursStart") || !values.has("ActiveHoursEnd")) result.errors.push("Active hours require both start and end.");
    else if ((Number(values.get("ActiveHoursEnd")) - Number(values.get("ActiveHoursStart")) + 24) % 24 > 18) result.errors.push("Active hours cannot exceed 18 hours.");
    controls["radio:installMode"] = "scheduled";
    controls["radio:schedSub"] = "active";
    if (values.get("AllowAutoUpdate") === "6") result.errors.push("The UI cannot represent policy active hours together with AllowAutoUpdate = 6.");
  }
  const chosen = weeks.filter((week) => controls[`week:${week}`] === "1");
  if (chosen.length > 1) result.errors.push("Multiple scheduled-install week flags cannot be represented by this UI.");
  if (chosen.length === 1) controls["wus-schedFreq"] = String(weeks.indexOf(chosen[0]));
  for (const week of weeks) delete controls[`week:${week}`];
  if (controls["wus-pauseEnabled"] && !values.has("PauseQualityUpdatesStartTime")) result.errors.push("A paused scenario requires PauseQualityUpdatesStartTime.");
  if (controls["wus-mwEnabled"]) {
    for (const name of ["MaintenanceWindowStartTime", ...(controls["wus-mwRepeat"] === "1" ? ["MaintenanceWindowStartDate"] : [])]) {
      if (!values.has(name)) result.errors.push(`${name}: required for this maintenance scenario.`);
    }
    if (controls["wus-mwRepeat"] === "3" && !days.some((_, i) => controls[`wus-wk-${i}`])) result.errors.push("Weekly maintenance requires at least one weekday.");
    if (values.has("ConfigureDeadlineForQualityUpdates")) result.warnings.push("Maintenance windows and deadlines are both enabled. Expired deadlines override the window; Microsoft recommends choosing one.");
    if (values.get("AllowAutoUpdate") === "3") result.warnings.push("Maintenance windows override the scheduled install for the actions they govern.");
  }
  return result;
}
