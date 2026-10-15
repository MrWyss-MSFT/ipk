import "./style.css";
import { wireGlobalPaste } from "@/app/global-paste";
import { makePsCommandVariants, psCommandTabsHtml, wirePsCommandTabs } from "@/app/ps-command";
import type { ToolDefinition } from "@/types/tool";
import { parseAutopilotProfile, type AutopilotProfileResult } from "./parse";

const PS_VARIANTS = makePsCommandVariants(
  '(Get-ItemProperty "HKLM:\\SOFTWARE\\Microsoft\\Provisioning\\AutopilotPolicyCache" -Name PolicyJsonCache).PolicyJsonCache',
);

function escapeHtml(value: string): string {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}

function summaryHtml(result: AutopilotProfileResult): string {
  if (result.summary.length === 0) return "";
  const rows = result.summary
    .map((f) => `<tr><td>${escapeHtml(f.label)}</td><td class="mono">${escapeHtml(f.value)}</td></tr>`)
    .join("");
  return `
    <section class="apc-section">
      <h3>Summary</h3>
      <table class="apc-table"><tbody>${rows}</tbody></table>
    </section>
  `;
}

function oobeConfigHtml(result: AutopilotProfileResult): string {
  if (!result.oobeConfig) return "";
  const { raw, flags } = result.oobeConfig;
  const rows = flags
    .map(
      (f) => `
        <tr class="${f.isEnabled ? "is-enabled" : ""}">
          <td>${escapeHtml(f.label)}</td>
          <td class="mono">${f.value}</td>
          <td>${f.isEnabled ? '<span class="apc-badge apc-badge-on">On</span>' : '<span class="apc-badge apc-badge-off">Off</span>'}</td>
        </tr>
      `,
    )
    .join("");
  return `
    <section class="apc-section">
      <h3>OOBE Config <span class="mono apc-raw-value">${raw} (0x${raw.toString(16).toUpperCase()})</span></h3>
      <table class="apc-table">
        <thead><tr><th>Flag</th><th>Bit value</th><th>Enabled</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </section>
  `;
}

function boolFieldsHtml(result: AutopilotProfileResult): string {
  if (result.boolFields.length === 0) return "";
  const rows = result.boolFields
    .map(
      (f) => `
        <tr>
          <td>${escapeHtml(f.label)}</td>
          <td>${f.isSet ? '<span class="apc-badge apc-badge-on">Yes</span>' : '<span class="apc-badge apc-badge-off">No</span>'}</td>
          <td class="mono apc-raw-cell">${escapeHtml(String(f.raw))}</td>
        </tr>
      `,
    )
    .join("");
  return `
    <section class="apc-section">
      <h3>Flags</h3>
      <table class="apc-table">
        <thead><tr><th>Setting</th><th>Set</th><th>Raw</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </section>
  `;
}

function nestedAadServerDataHtml(result: AutopilotProfileResult): string {
  if (!result.nestedAadServerData) return "";
  return `
    <section class="apc-section">
      <h3>AAD server data</h3>
      <pre class="apc-pre mono">${escapeHtml(result.nestedAadServerData)}</pre>
    </section>
  `;
}

function otherFieldsHtml(result: AutopilotProfileResult): string {
  if (result.otherFields.length === 0) return "";
  const rows = result.otherFields
    .map((f) => `<tr><td>${escapeHtml(f.label)}</td><td class="mono">${escapeHtml(f.value) || "<em>(empty)</em>"}</td></tr>`)
    .join("");
  return `
    <section class="apc-section">
      <h3>Other fields</h3>
      <table class="apc-table"><tbody>${rows}</tbody></table>
    </section>
  `;
}

const tool: ToolDefinition = {
  id: "autopilot-profile",
  name: "Autopilot Profile Parser",
  description:
    "Parse the Windows Autopilot cached deployment profile (PolicyJsonCache) into a readable summary, including a decoded CloudAssignedOobeConfig bitmask.",
  category: "Converters",
  keywords: [
    "autopilot",
    "deployment profile",
    "policyjsoncache",
    "autopilotpolicycache",
    "oobeconfig",
    "provisioning",
    "intune",
    "esp",
  ],
  icon: "📋",
  mount(container) {
    container.innerHTML = `
      <div class="apc-tool">
        <p class="apc-step-label">1. Get the Autopilot profile <span class="ipk-step-note">(copies to clipboard)</span></p>
        ${psCommandTabsHtml("apc-cmd")}

        <p class="apc-step-label">2. Paste anywhere on the page</p>
        <label class="apc-field-label" for="apc-input">Autopilot profile JSON (PolicyJsonCache)</label>
        <textarea
          id="apc-input"
          class="mono"
          rows="6"
          placeholder='{"CloudAssignedTenantDomain":"contoso.onmicrosoft.com","DeploymentProfileName":"Contoso Autopilot","CloudAssignedDeviceName":"CNTS-%SERIAL%","AutopilotMode":0,"CloudAssignedOobeConfig":28,...}'
        ></textarea>
        <div id="apc-status" class="apc-status" role="alert"></div>

        <div id="apc-results"></div>
      </div>
    `;

    const unwirePsTabs = wirePsCommandTabs(container, "apc-cmd", PS_VARIANTS);

    const input = container.querySelector<HTMLTextAreaElement>("#apc-input")!;
    const statusEl = container.querySelector<HTMLDivElement>("#apc-status")!;
    const resultsEl = container.querySelector<HTMLDivElement>("#apc-results")!;

    const render = () => {
      const raw = input.value.trim();
      if (!raw) {
        statusEl.textContent = "";
        resultsEl.innerHTML = "";
        return;
      }
      try {
        const result = parseAutopilotProfile(raw);
        statusEl.textContent = "";
        resultsEl.innerHTML = [
          summaryHtml(result),
          oobeConfigHtml(result),
          boolFieldsHtml(result),
          nestedAadServerDataHtml(result),
          otherFieldsHtml(result),
        ].join("");
      } catch (err) {
        statusEl.textContent = err instanceof Error ? err.message : "Couldn't parse that input.";
        resultsEl.innerHTML = "";
      }
    };

    input.addEventListener("input", render);
    const unwireGlobalPaste = wireGlobalPaste(input);

    return () => {
      input.removeEventListener("input", render);
      unwireGlobalPaste();
      unwirePsTabs();
    };
  },
};

export default tool;
