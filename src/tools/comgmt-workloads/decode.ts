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
}

export interface CoManagementWorkloadResult {
  workload: string;
  value: number;
  isEnabled: boolean;
}

/** Order matches .NET's Type.GetEnumNames() for a [Flags] enum: ascending by underlying value. */
export const CO_MANAGEMENT_FLAGS: CoManagementFlagDef[] = [
  { name: "CompliancePolicies", value: 2 },
  { name: "ResourceAccessPolicies", value: 4 },
  { name: "DeviceConfiguration", value: 8 },
  { name: "WindowsUpdatesPolicies", value: 16 },
  { name: "ClientApps", value: 64 },
  { name: "OfficeClickToRunApps", value: 128 },
  { name: "EndpointProtection", value: 4128 },
  { name: "CoManagementConfigured", value: 8193 },
  { name: "AllWorkloadsIntune", value: 2147479807 },
];

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

export function decodeComgmtWorkloads(raw: string): CoManagementWorkloadResult[] {
  const value = parseWorkloadValue(raw);
  return CO_MANAGEMENT_FLAGS.map((flag) => ({
    workload: flag.name,
    value: flag.value,
    isEnabled: (value & flag.value) === flag.value,
  }));
}
