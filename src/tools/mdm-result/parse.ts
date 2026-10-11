/**
 * Parses `MDMDiagReport.xml` (produced by the built-in `MdmDiagnosticsTool.exe
 * -out <dir>`) into a flat, filterable list of applied MDM/CSP policies —
 * essentially a client-side "gpresult for Intune".
 *
 * The approach (which XML nodes to read, which to skip, and how to resolve
 * enrollment IDs to friendly provider names) is ported from the settings
 * portion of jonasatgit/IntuneDebug's `Get-MDMPolicyReport` module
 * (MIT licensed: https://github.com/jonasatgit/IntuneDebug) — re-implemented
 * here in TypeScript, scoped to policy *settings* only (its app/Win32,
 * LAPS, and firewall report sections are intentionally left out).
 *
 * Reverse-engineered shape of `MDMEnterpriseDiagnosticsReport` (real XML,
 * not the differently-shaped "illustrative" examples that show up in web
 * search results):
 *
 * - `PolicyManager.ConfigSource[]`: one per enrollment — `EnrollmentId` +
 *   `PolicyScope[]` (each a `PolicyScope` string of "Device" or a user SID,
 *   plus `Area[]`). Each `Area` has `PolicyAreaName` and then one raw XML
 *   child element *per policy*, named after the policy itself (e.g.
 *   `<AllowTelemetry>1</AllowTelemetry>`), with a sibling
 *   `<AllowTelemetry_LastWrite>` timestamp element IntuneDebug itself
 *   deliberately ignores (it's FILETIME-encoded and never surfaced in its
 *   report), so this parser skips it too.
 * - `PolicyManager.currentPolicies[]`: one per scope — `PolicyScope` +
 *   `CurrentPolicyValues[]` (one per area), each with `PolicyAreaName` and,
 *   per policy, `<Name>_ProviderSet` / `<Name>_WinningProvider` — the
 *   "who actually won" (MDM vs. GP vs. local) signal.
 * - `Enrollments.Enrollment[]`: `EnrollmentId` + `ProviderID` (raw
 *   `"MS DM Server"` is relabeled "Intune"; empty falls back to a
 *   provisioning-package lookup, then "Local").
 * - `PolicyManagerMeta.AreaMetadata[].PolicyMetadata[]`: optional per-policy
 *   `value` (the CSP's own default) and `RegKeyPathRedirect` /
 *   `translationDllPath` metadata, shown as extra detail when present.
 *
 * The `knobs` policy area (internal diagnostic/experimentation flags, not
 * admin-configurable policy) is skipped entirely, matching IntuneDebug.
 */

export interface CspPolicyMetadata {
  defaultValue: string | null;
  redirectPath: string | null;
}

export interface CspPolicyRow {
  enrollmentId: string | null;
  enrollmentProvider: string;
  /** Raw scope value: "Device" or a user SID string. */
  scope: string;
  scopeKind: "device" | "user";
  area: string;
  name: string;
  value: string;
  /** From `currentPolicies` — null when no winning-provider data was found for this policy/scope. */
  winningProvider: string | null;
  metadata: CspPolicyMetadata;
}

export interface CspEnrollmentInfo {
  enrollmentId: string;
  provider: string;
}

export interface CspParseResult {
  rows: CspPolicyRow[];
  enrollments: CspEnrollmentInfo[];
  areas: string[];
  scopes: string[];
}

function tagNameIs(el: Element, name: string): boolean {
  return el.tagName.toLowerCase() === name.toLowerCase();
}

function getChildrenByTag(parent: Element, name: string): Element[] {
  return Array.from(parent.children).filter((c) => tagNameIs(c, name));
}

function getChildText(parent: Element, name: string): string | null {
  const child = getChildrenByTag(parent, name)[0];
  if (!child) return null;
  const text = child.textContent?.trim() ?? "";
  return text === "" ? null : text;
}

/**
 * Real-world `MDMDiagReport.xml` files case the *same* "Device" scope
 * inconsistently between `ConfigSource` (`Device`) and `CurrentPolicies`
 * (`device`) — confirmed by inspecting an actual export, not assumed.
 * Lookup keys are built/matched on this lowercased form so both sides join
 * correctly; the original casing is kept separately for display.
 */
function scopeKeyPart(scope: string): string {
  return scope.toLowerCase();
}

/** Builds EnrollmentId -> friendly provider name (e.g. "Intune", "Local"). */
function resolveEnrollmentProviders(root: Element): Map<string, string> {
  const map = new Map<string, string>();
  const enrollmentsEl = getChildrenByTag(root, "Enrollments")[0];
  if (!enrollmentsEl) return map;

  const provisioningResultsEl = getChildrenByTag(root, "ProvisioningResults")[0];
  const provisioningResults = provisioningResultsEl ? getChildrenByTag(provisioningResultsEl, "Result") : [];

  for (const enrollment of getChildrenByTag(enrollmentsEl, "Enrollment")) {
    const id = getChildText(enrollment, "EnrollmentId");
    if (!id) continue;

    let provider = getChildText(enrollment, "ProviderID");
    if (!provider) {
      const bracketed = `{${id}}`.toLowerCase();
      const match = provisioningResults.find((r) => (getChildText(r, "PackageID") ?? "").toLowerCase() === bracketed);
      provider = match ? getChildText(match, "PackageFileName") : null;
    }
    if (!provider) {
      provider = "Local";
    } else if (provider === "MS DM Server") {
      provider = "Intune";
    }
    map.set(id, provider);
  }
  return map;
}

interface CurrentPolicyInfo {
  providerSet: string | null;
  winningProvider: string | null;
}

/** Builds `${scope}|${area}|${policyName}` -> winning-provider info from `PolicyManager.currentPolicies`. */
function parseCurrentPolicies(root: Element): Map<string, CurrentPolicyInfo> {
  const map = new Map<string, CurrentPolicyInfo>();
  const policyManager = getChildrenByTag(root, "PolicyManager")[0];
  if (!policyManager) return map;

  for (const cp of getChildrenByTag(policyManager, "currentPolicies")) {
    const scope = getChildText(cp, "PolicyScope") ?? "Unknown";
    for (const cpv of getChildrenByTag(cp, "CurrentPolicyValues")) {
      const area = getChildText(cpv, "PolicyAreaName") ?? "";
      for (const child of Array.from(cpv.children)) {
        const tag = child.tagName;
        const winMatch = /^(.*)_WinningProvider$/i.exec(tag);
        const setMatch = /^(.*)_ProviderSet$/i.exec(tag);
        const name = winMatch?.[1] ?? setMatch?.[1];
        if (!name) continue;
        const key = `${scopeKeyPart(scope)}|${area}|${name}`;
        const existing = map.get(key) ?? { providerSet: null, winningProvider: null };
        const text = child.textContent?.trim() ?? "";
        if (winMatch) existing.winningProvider = text || null;
        if (setMatch) existing.providerSet = text || null;
        map.set(key, existing);
      }
    }
  }
  return map;
}

/** Builds `${area}|${policyName}` -> default value / redirect metadata from `PolicyManagerMeta.AreaMetadata`. */
function parseAreaMetadata(root: Element): Map<string, CspPolicyMetadata> {
  const map = new Map<string, CspPolicyMetadata>();
  const meta = getChildrenByTag(root, "PolicyManagerMeta")[0];
  if (!meta) return map;

  for (const areaMeta of getChildrenByTag(meta, "AreaMetadata")) {
    const area = getChildText(areaMeta, "PolicyAreaName") ?? "";
    for (const policyMeta of getChildrenByTag(areaMeta, "PolicyMetadata")) {
      const name = getChildText(policyMeta, "PolicyName");
      if (!name) continue;
      const defaultValue = getChildText(policyMeta, "value");
      const redirectPath = getChildText(policyMeta, "RegKeyPathRedirect");
      const translationDllPath = getChildText(policyMeta, "translationDllPath");
      map.set(`${area}|${name}`, {
        defaultValue,
        redirectPath: redirectPath ?? (translationDllPath ? `Translation DLL: ${translationDllPath}` : null),
      });
    }
  }
  return map;
}

function parseConfigSource(
  root: Element,
  enrollmentProviders: Map<string, string>,
  currentPolicies: Map<string, CurrentPolicyInfo>,
  areaMetadata: Map<string, CspPolicyMetadata>,
): CspPolicyRow[] {
  const rows: CspPolicyRow[] = [];
  const policyManager = getChildrenByTag(root, "PolicyManager")[0];
  if (!policyManager) return rows;

  for (const configSource of getChildrenByTag(policyManager, "ConfigSource")) {
    const enrollmentId = getChildText(configSource, "EnrollmentId");
    const enrollmentProvider = (enrollmentId && enrollmentProviders.get(enrollmentId)) || "Unknown";

    for (const policyScopeEl of getChildrenByTag(configSource, "PolicyScope")) {
      const rawScope = getChildText(policyScopeEl, "PolicyScope") ?? "Unknown";
      const scopeKind: CspPolicyRow["scopeKind"] = rawScope.toLowerCase() === "device" ? "device" : "user";
      // Canonicalize "Device"/"device" casing (both appear across enrollments
      // in real exports) so device-scope rows collapse into one scope/filter
      // instead of splitting across two differently-cased tabs.
      const scope = scopeKind === "device" ? "Device" : rawScope;

      for (const areaEl of getChildrenByTag(policyScopeEl, "Area")) {
        const area = getChildText(areaEl, "PolicyAreaName") ?? "(unknown area)";
        if (area.toLowerCase() === "knobs") continue;

        for (const child of Array.from(areaEl.children)) {
          const tag = child.tagName;
          if (tagNameIs(child, "PolicyAreaName")) continue;
          if (/_LastWrite$/i.test(tag)) continue;

          const name = tag;
          const value = child.textContent?.trim() ?? "";
          const current = currentPolicies.get(`${scopeKeyPart(scope)}|${area}|${name}`);
          const metadata = areaMetadata.get(`${area}|${name}`) ?? { defaultValue: null, redirectPath: null };
          // WinningProvider is reported as an enrollment ID (GUID), not a
          // friendly name — resolve it through the same enrollment-provider
          // map, falling back to the raw value if it isn't a known enrollment.
          const rawWinningProvider = current?.winningProvider ?? null;
          const winningProvider = rawWinningProvider
            ? enrollmentProviders.get(rawWinningProvider) ?? rawWinningProvider
            : null;

          rows.push({
            enrollmentId,
            enrollmentProvider,
            scope,
            scopeKind,
            area,
            name,
            value,
            winningProvider,
            metadata,
          });
        }
      }
    }
  }
  return rows;
}

export function parseMdmDiagReport(raw: string): CspParseResult {
  const cleaned = raw.replace(/^\uFEFF/, "").trim();
  if (!cleaned) {
    throw new Error("Paste the contents of MDMDiagReport.xml above.");
  }

  const doc = new DOMParser().parseFromString(cleaned, "application/xml");
  if (doc.querySelector("parsererror")) {
    throw new Error("Couldn't parse that as XML — paste the full contents of MDMDiagReport.xml.");
  }

  const root = doc.documentElement;
  if (!root || !/^MDMEnterpriseDiagnosticsReport$/i.test(root.tagName)) {
    throw new Error("This doesn't look like an MDMDiagReport.xml file (missing the MDMEnterpriseDiagnosticsReport root element).");
  }

  const enrollmentProviders = resolveEnrollmentProviders(root);
  const currentPolicies = parseCurrentPolicies(root);
  const areaMetadata = parseAreaMetadata(root);
  const rows = parseConfigSource(root, enrollmentProviders, currentPolicies, areaMetadata);

  rows.sort((a, b) => a.area.localeCompare(b.area) || a.name.localeCompare(b.name) || a.scope.localeCompare(b.scope));

  const enrollments: CspEnrollmentInfo[] = Array.from(enrollmentProviders.entries()).map(([enrollmentId, provider]) => ({
    enrollmentId,
    provider,
  }));
  const areas = Array.from(new Set(rows.map((r) => r.area))).sort((a, b) => a.localeCompare(b));
  const scopes = Array.from(new Set(rows.map((r) => r.scope))).sort((a, b) => a.localeCompare(b));

  return { rows, enrollments, areas, scopes };
}
