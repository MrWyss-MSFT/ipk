/**
 * Decodes the Windows Autopilot cached profile (PolicyJsonCache) JSON blob
 * found under HKLM:\SOFTWARE\Microsoft\Provisioning\AutopilotPolicyCache.
 */

export interface OobeConfigFlag {
  name: string;
  label: string;
  value: number;
  isEnabled: boolean;
}

/** [Flags] enum CloudAssignedOobeConfig, in ascending bit order. */
const OOBE_CONFIG_FLAGS: { name: string; label: string; value: number }[] = [
  { name: "SkipCortanaOptIn", label: "Skip Cortana opt-in", value: 1 },
  { name: "OobeUserNotLocalAdmin", label: "OOBE user is not a local admin", value: 2 },
  { name: "SkipExpressSettings", label: "Skip Express Settings", value: 4 },
  { name: "SkipOemRegistration", label: "Skip OEM registration", value: 8 },
  { name: "SkipEula", label: "Skip EULA", value: 16 },
  { name: "TPMAttestation", label: "TPM attestation", value: 32 },
  { name: "AADDeviceauth", label: "AAD device auth", value: 64 },
  { name: "AADTPMRequired", label: "AAD TPM required", value: 128 },
  { name: "SkipWindowsUpgrade", label: "Skip Windows upgrade", value: 256 },
  { name: "EnablePatchDownload", label: "Enable patch download", value: 512 },
  { name: "SkipKeyboard", label: "Skip keyboard selection", value: 1024 },
];

export function decodeOobeConfig(value: number): OobeConfigFlag[] {
  return OOBE_CONFIG_FLAGS.map((flag) => ({ ...flag, isEnabled: (value & flag.value) === flag.value }));
}

/** Best-known mapping; not formally documented by Microsoft. */
const AUTOPILOT_MODES: Record<number, string> = {
  0: "User-Driven",
  1: "Self-Deploying",
  2: "Pre-Provisioned (White Glove)",
};

/** Confirmed by Microsoft/community docs. */
const DOMAIN_JOIN_METHODS: Record<number, string> = {
  0: "Azure AD Join",
  1: "Hybrid Azure AD Join",
};

export interface AutopilotSummaryField {
  label: string;
  value: string;
}

export interface AutopilotBoolField {
  label: string;
  key: string;
  raw: unknown;
  isSet: boolean;
}

export interface AutopilotRawField {
  label: string;
  key: string;
  value: string;
}

export interface AutopilotProfileResult {
  summary: AutopilotSummaryField[];
  oobeConfig: { raw: number; flags: OobeConfigFlag[] } | null;
  boolFields: AutopilotBoolField[];
  nestedAadServerData: string | null;
  otherFields: AutopilotRawField[];
}

/** Keys surfaced in the "Summary" section (order controls display order), and their label. */
const SUMMARY_KEYS: { key: string; label: string; format?: (v: unknown) => string }[] = [
  { key: "CloudAssignedDeviceName", label: "Device name template" },
  { key: "DeploymentProfileName", label: "Deployment profile" },
  { key: "CloudAssignedTenantDomain", label: "Tenant domain" },
  { key: "CloudAssignedTenantId", label: "Tenant ID" },
  { key: "CloudAssignedRegion", label: "Region" },
  { key: "CloudAssignedLanguage", label: "Language" },
  {
    key: "AutopilotMode",
    label: "Autopilot mode",
    format: (v) => formatEnum(v, AUTOPILOT_MODES),
  },
  {
    key: "CloudAssignedDomainJoinMethod",
    label: "Domain join method",
    format: (v) => formatEnum(v, DOMAIN_JOIN_METHODS),
  },
  { key: "AadDeviceId", label: "Entra device ID" },
  { key: "ZtdRegistrationId", label: "ZTD registration ID" },
  { key: "PolicyDownloadDate", label: "Policy download date", format: formatDate },
  { key: "AutopilotCreationDate", label: "Autopilot creation date", format: formatDate },
];

/** Keys surfaced as Yes/No flags in the "Flags" section. */
const BOOL_KEYS: { key: string; label: string }[] = [
  { key: "CloudAssignedForcedEnrollment", label: "Forced enrollment" },
  { key: "IsExplicitProfileAssignment", label: "Explicit profile assignment" },
  { key: "HybridJoinSkipDCConnectivityCheck", label: "Skip DC connectivity check (hybrid join)" },
  { key: "CloudAssignedAutopilotUpdateDisabled", label: "Autopilot update disabled" },
  { key: "CloudAssignedPrivacyDiagnostics", label: "Privacy diagnostics" },
];

/** Keys already shown elsewhere (summary/flags/oobe config/nested data) - excluded from "Other fields". */
const HANDLED_KEYS = new Set([
  ...SUMMARY_KEYS.map((f) => f.key),
  ...BOOL_KEYS.map((f) => f.key),
  "CloudAssignedOobeConfig",
  "CloudAssignedAadServerData",
]);

function formatEnum(value: unknown, map: Record<number, string>): string {
  const num = Number(value);
  const known = map[num];
  return known ? `${known} (${num})` : String(value);
}

function formatDate(value: unknown): string {
  if (typeof value !== "string") return String(value ?? "");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.toLocaleString()} (${value})`;
}

/** Splits a PascalCase/camelCase key into space-separated words, e.g. "AadDeviceId" -> "Aad Device Id". */
function humanizeKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .trim();
}

function stringify(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function parseAutopilotProfile(raw: string): AutopilotProfileResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Couldn't parse that as JSON — paste the full value of PolicyJsonCache from the command above.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Expected a JSON object (the decoded PolicyJsonCache value).");
  }
  const dict = parsed as Record<string, unknown>;

  const summary: AutopilotSummaryField[] = SUMMARY_KEYS.filter((f) => dict[f.key] !== undefined).map((f) => ({
    label: f.label,
    value: f.format ? f.format(dict[f.key]) : stringify(dict[f.key]),
  }));

  let oobeConfig: AutopilotProfileResult["oobeConfig"] = null;
  if (dict.CloudAssignedOobeConfig !== undefined) {
    const num = Number(dict.CloudAssignedOobeConfig);
    if (Number.isFinite(num)) {
      oobeConfig = { raw: num, flags: decodeOobeConfig(num) };
    }
  }

  const boolFields: AutopilotBoolField[] = BOOL_KEYS.filter((f) => dict[f.key] !== undefined).map((f) => ({
    label: f.label,
    key: f.key,
    raw: dict[f.key],
    isSet: Boolean(Number(dict[f.key])),
  }));

  let nestedAadServerData: string | null = null;
  if (typeof dict.CloudAssignedAadServerData === "string") {
    try {
      nestedAadServerData = JSON.stringify(JSON.parse(dict.CloudAssignedAadServerData), null, 2);
    } catch {
      nestedAadServerData = dict.CloudAssignedAadServerData;
    }
  }

  const otherFields: AutopilotRawField[] = Object.keys(dict)
    .filter((key) => !HANDLED_KEYS.has(key))
    .map((key) => ({ label: humanizeKey(key), key, value: stringify(dict[key]) }));

  return { summary, oobeConfig, boolFields, nestedAadServerData, otherFields };
}
