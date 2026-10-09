/**
 * Mirrors the community `Get-ESPProgress` PowerShell function's parsing logic
 * (reads the `<Phase>Category.Status` registry values under
 * HKLM:\SOFTWARE\Microsoft\Provisioning\AutopilotSettings), so it can be
 * reproduced client-side from a pasted JSON export.
 */

export type EspPhaseId = "DevicePreparation" | "DeviceSetup" | "AccountSetup";

export interface EspStep {
  stepName: string;
  state: string;
  text: string;
}

export interface EspPhaseResult {
  phase: EspPhaseId;
  label: string;
  /** Overall phase status, pulled from the JSON's top-level `categoryState`/`categoryStatusText`. */
  phaseState: string;
  phaseText: string;
  steps: EspStep[];
}

export interface EspParseError {
  phase: EspPhaseId;
  message: string;
}

export const ESP_PHASES: { id: EspPhaseId; label: string }[] = [
  { id: "DevicePreparation", label: "Device Preparation" },
  { id: "DeviceSetup", label: "Device Setup" },
  { id: "AccountSetup", label: "Account Setup" },
];

/**
 * Mirrors PowerShell's `-creplace '.(?=[^a-z])', '$& '`: inserts a space
 * after every character that is immediately followed by something other
 * than a lowercase a-z letter, turning CamelCase into space-separated words.
 */
function spaceOutCamelCase(raw: string): string {
  let out = "";
  for (let i = 0; i < raw.length; i++) {
    out += raw[i];
    if (i < raw.length - 1 && !/[a-z]/.test(raw[i + 1])) out += " ";
  }
  return out;
}

/**
 * Strips the phase name plus one following character (normally the literal
 * "."), mirroring PowerShell's unescaped, unanchored `-replace "$Phase.", ""`.
 */
function stripPhasePrefix(name: string, phase: string): string {
  return name.replace(new RegExp(`${phase}.`, "g"), "");
}

/**
 * Parses the JSON blob produced by this tool's export command: a flat
 * dictionary of every value name under AutopilotSettings to its raw value.
 * The three phase values (`<Phase>Category.Status`) are matched by prefix,
 * since on some builds the value name has a timestamp suffix (e.g.
 * `AccountSetupCategory.Status.2026-10-05T13:19:26.888Z`) and there can be
 * more than one — the lexicographically-last one (newest timestamp) wins.
 */
export function parseEspExport(raw: string): { phases: EspPhaseResult[]; errors: EspParseError[] } {
  let outer: unknown;
  try {
    outer = JSON.parse(raw);
  } catch {
    throw new Error("Couldn't parse that as JSON — paste the full output of the export command above.");
  }
  if (!outer || typeof outer !== "object") {
    throw new Error("Expected a JSON object of registry value names to values.");
  }
  const dict = outer as Record<string, unknown>;

  const phases: EspPhaseResult[] = [];
  const errors: EspParseError[] = [];

  for (const { id, label } of ESP_PHASES) {
    const prefix = `${id}Category.Status`;
    const matchingKeys = Object.keys(dict)
      .filter((k) => k === prefix || k.startsWith(`${prefix}.`))
      .sort();
    const latestKey = matchingKeys[matchingKeys.length - 1];
    if (!latestKey) continue;

    const value = dict[latestKey];
    if (value === undefined || value === null || value === "") continue;

    let parsed: Record<string, unknown>;
    try {
      parsed = typeof value === "string" ? JSON.parse(value) : (value as Record<string, unknown>);
    } catch (err) {
      errors.push({
        phase: id,
        message: `Couldn't parse ${label} JSON: ${err instanceof Error ? err.message : String(err)}`,
      });
      continue;
    }

    let phaseState = "";
    let phaseText = "";
    const steps: EspStep[] = [];
    for (const [key, v] of Object.entries(parsed)) {
      if (key === "categoryState") {
        phaseState = String(v ?? "");
        continue;
      }
      if (key === "categoryStatusText") {
        phaseText = String(v ?? "");
        continue;
      }
      const stepName = spaceOutCamelCase(stripPhasePrefix(key, id));
      let state = "";
      let text = "";
      if (typeof v === "string") {
        state = v;
      } else if (v && typeof v === "object") {
        const obj = v as Record<string, unknown>;
        state = String(obj.subcategoryState ?? "");
        text = String(obj.subcategoryStatusText ?? "");
      }
      steps.push({ stepName, state, text });
    }

    phases.push({ phase: id, label, phaseState, phaseText, steps });
  }

  return { phases, errors };
}
