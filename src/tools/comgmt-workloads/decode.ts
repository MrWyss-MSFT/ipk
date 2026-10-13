/**
 * Decodes the ConfigMgr "Co-Management Workloads" bitmask (CCM_System.ComgmtWorkloads)
 * into the individual workload flags, mirroring the PowerShell script at
 * https://gist.github.com/MrWyss-MSFT/228ed9f3dd2b67077790a3bef98442d5
 *
 * Each flag is considered enabled when every bit of its value is set in the
 * input (the same semantics as .NET's Enum.HasFlag for [Flags] enums).
 */

export interface CoManagementFlagDef {
  name: string;
  value: number;
  /**
   * Display name Intune itself uses for this workload (from the Intune portal's
   * `ConfigMgrFeature_*` string table) - shown alongside the ConfigMgr enum name
   * so the decoded output matches what admins see in the Intune "Co-management
   * workloads" settings page. Omitted for flags that aren't individual Intune
   * workload switches (CoManagementConfigured, AllWorkloadsIntune).
   */
  intuneName?: string;
  /**
   * Display name the ConfigMgr console itself uses for this workload (the
   * "Co-management" node's workload sliders in the ConfigMgr console).
   * Omitted for flags that aren't individual workload switches
   * (CoManagementConfigured, AllWorkloadsIntune).
   */
  configMgrName?: string;
  /**
   * Set for workloads that Intune always treats as enabled once co-management
   * is configured (the admin can't independently switch them off). The
   * checkbox for this workload is shown ticked-but-disabled whenever its bit
   * is set, but the raw input value can still omit the bit (e.g. an older
   * export) and will then correctly decode as not enabled.
   */
  alwaysOnInIntune?: boolean;
  /**
   * Other flag values that Intune automatically enables alongside this one
   * when it's switched on (e.g. moving "Device configuration" to Intune also
   * moves "Endpoint Protection", per Microsoft's co-management docs), even
   * though their bit patterns don't overlap. Only applied when ticking the
   * checkbox on - unticking a flag never clears the flags it implies.
   */
  impliesWhenEnabled?: number[];
  /**
   * Set for pseudo-flags that aren't individual workload switches
   * (currently just CoManagementConfigured) - these are hidden from the
   * workload table since they aren't things an admin toggles directly.
   */
  hiddenFromTable?: boolean;
  /**
   * Set on the single "Force all workloads" row (AllWorkloadsIntune).
   * Ticking it (or entering its value directly) forces every other
   * workload's checkbox ticked-and-disabled; unticking it returns to the
   * normal baseline + ticked-flags calculation.
   */
  isForceAllSwitch?: boolean;
}

export interface CoManagementWorkloadResult {
  workload: string;
  value: number;
  isEnabled: boolean;
  intuneName?: string;
  configMgrName?: string;
  alwaysOnInIntune?: boolean;
  impliesWhenEnabled?: number[];
  hiddenFromTable?: boolean;
  isForceAllSwitch?: boolean;
  /**
   * True when this workload is only enabled because another flag implies it
   * (e.g. Endpoint Protection via Device configuration), not because its own
   * bit is set. Intune's admin center still shows the workload table switch
   * for it as on, but oddly omits it from the plain-text workload summary -
   * so callers should keep it visible in the table but exclude/de-emphasize
   * it in that summary text.
   */
  impliedOnly?: boolean;
}

/** Order matches .NET's Type.GetEnumNames() for a [Flags] enum: ascending by underlying value. */
export const CO_MANAGEMENT_FLAGS: CoManagementFlagDef[] = [
  { name: "CompliancePolicies", value: 2, intuneName: "Compliance policy", configMgrName: "Compliance policies" },
  {
    name: "ResourceAccessPolicies",
    value: 4,
    intuneName: "Resource access",
    configMgrName: "Resource access policies",
    alwaysOnInIntune: true,
  },
  {
    name: "DeviceConfiguration",
    value: 8,
    intuneName: "Device configuration",
    configMgrName: "Device configuration",
    // Moving Device configuration to Intune also moves Endpoint Protection.
    impliesWhenEnabled: [4128],
  },
  {
    name: "WindowsUpdatesPolicies",
    value: 16,
    intuneName: "Windows Update for Business",
    configMgrName: "Windows Update policies",
  },
  { name: "ClientApps", value: 64, intuneName: "Modern apps", configMgrName: "Client apps" },
  {
    name: "OfficeClickToRunApps",
    value: 128,
    intuneName: "Office apps",
    configMgrName: "Office Click-to-Run apps",
  },
  {
    name: "EndpointProtection",
    value: 4128,
    intuneName: "Endpoint protection",
    configMgrName: "Endpoint Protection",
  },
  { name: "CoManagementConfigured", value: 8193, hiddenFromTable: true },
  {
    name: "AllWorkloadsIntune",
    value: 2147479807,
    configMgrName: "Force all workloads",
    isForceAllSwitch: true,
  },
];

/**
 * Order the Intune admin center itself uses for workload names - taken from
 * the property-declaration order of the `ConfigMgrFeature_*` string table in
 * Intune's own portal JS bundle. This does NOT follow the flags' bitmask
 * values (e.g. "Modern apps" / ClientApps=64 is declared first, well before
 * lower-valued flags like CompliancePolicies=2), so it's kept as its own
 * ordering, separate from CO_MANAGEMENT_FLAGS' ascending-by-value order used
 * for the workload table.
 */
export const INTUNE_DISPLAY_ORDER = [
  "ClientApps",
  "ResourceAccessPolicies",
  "DeviceConfiguration",
  "CompliancePolicies",
  "WindowsUpdatesPolicies",
  "EndpointProtection",
  "OfficeClickToRunApps",
];

/**
 * The real ConfigMgr/Intune value seen when every workload has been switched
 * to Intune. Pasting/typing this value decodes every workload as enabled,
 * even though ticking every individual workload checkbox produces the plain
 * bitwise-OR sum of their values instead (Intune's dedicated "all workloads"
 * value is a separate, special-cased bit pattern, not just that sum).
 */
export const ALL_WORKLOADS_VALUE = CO_MANAGEMENT_FLAGS.find((f) => f.name === "AllWorkloadsIntune")!.value;

/**
 * Set on every real-world ComgmtWorkloads value for a co-managed device,
 * regardless of which workloads have been switched to Intune. Always OR
 * this in when building a value from ticked workload checkboxes.
 */
export const CO_MANAGEMENT_CONFIGURED_VALUE = CO_MANAGEMENT_FLAGS.find(
  (f) => f.name === "CoManagementConfigured",
)!.value;

/** The individual workload flags an admin can toggle (excludes the pseudo-flags and the force-all switch). */
export const TOGGLEABLE_WORKLOAD_FLAGS = CO_MANAGEMENT_FLAGS.filter(
  (f) => !f.hiddenFromTable && !f.isForceAllSwitch,
);

export function parseWorkloadValue(raw: string): number {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("Enter the ComgmtWorkloads value.");
  }

  const isHex = /^0x[0-9a-f]+$/i.test(trimmed);
  const value = isHex ? parseInt(trimmed, 16) : Number(trimmed);

  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    throw new Error("Enter a valid non-negative integer (decimal, e.g. 8193, or hex, e.g. 0x2001).");
  }
  if (value > 2147483647) {
    throw new Error("Value is out of range for a 32-bit ComgmtWorkloads bitmask.");
  }

  return value;
}

export function decodeComgmtWorkloadsValue(value: number): CoManagementWorkloadResult[] {
  const results: CoManagementWorkloadResult[] = CO_MANAGEMENT_FLAGS.map((flag) => ({
    workload: flag.name,
    value: flag.value,
    isEnabled: (value & flag.value) === flag.value,
    intuneName: flag.intuneName,
    configMgrName: flag.configMgrName,
    alwaysOnInIntune: flag.alwaysOnInIntune,
    impliesWhenEnabled: flag.impliesWhenEnabled,
    hiddenFromTable: flag.hiddenFromTable,
    isForceAllSwitch: flag.isForceAllSwitch,
  }));

  // A flag that implies others (e.g. Device configuration implies Endpoint
  // Protection) always carries its implied workloads along with it in real
  // co-management - so force those implied results to enabled too, and mark
  // them implied-only so the UI can grey/strike them out of the Intune
  // summary text the same way the table greys out their locked checkbox.
  // This is one-way: Endpoint Protection can still be enabled independently
  // of Device configuration, just not the reverse.
  for (const flag of CO_MANAGEMENT_FLAGS) {
    if (!flag.impliesWhenEnabled) continue;
    const implierEnabled = (value & flag.value) === flag.value;
    if (!implierEnabled) continue;
    for (const impliedValue of flag.impliesWhenEnabled) {
      const impliedResult = results.find((r) => r.value === impliedValue);
      if (impliedResult) {
        impliedResult.isEnabled = true;
        impliedResult.impliedOnly = true;
      }
    }
  }

  return results;
}

export function decodeComgmtWorkloads(raw: string): CoManagementWorkloadResult[] {
  const value = parseWorkloadValue(raw);
  return decodeComgmtWorkloadsValue(value);
}
