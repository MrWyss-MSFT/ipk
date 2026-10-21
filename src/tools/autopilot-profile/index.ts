import "./style.css";
import { wireGlobalPaste } from "@/app/global-paste";
import { wireExampleButton } from "@/app/example-button";
import { makePsCommandVariants, psCommandTabsHtml, wirePsCommandTabs } from "@/app/ps-command";
import type { ToolDefinition } from "@/types/tool";
import { parseAutopilotProfile, type AutopilotProfileResult } from "./parse";

const PS_VARIANTS = makePsCommandVariants(
  '(Get-ItemProperty "HKLM:\\SOFTWARE\\Microsoft\\Provisioning\\AutopilotPolicyCache" -Name PolicyJsonCache).PolicyJsonCache',
);

const EXAMPLE_PROFILE_JSON = JSON.stringify({
  CloudAssignedTenantDomain: "ipkitprokit.onmicrosoft.com",
  CloudAssignedTenantId: "11111111-2222-3333-4444-555555555555",
  DeploymentProfileName: "IPK - IT Pro Kit Autopilot",
  CloudAssignedDeviceName: "IPK-%SERIAL%",
  CloudAssignedRegion: "US",
  CloudAssignedLanguage: "en-US",
  AutopilotMode: 0,
  CloudAssignedDomainJoinMethod: 0,
  CloudAssignedOobeConfig: 28,
  CloudAssignedForcedEnrollment: 1,
  IsExplicitProfileAssignment: true,
  ZtdRegistrationId: "66666666-7777-8888-9999-000000000000",
  PolicyDownloadDate: "2026-10-05T13:19:26.888Z",
});

function escapeHtml(value: string): string {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}

function copyValueHtml(value: string, badge = false): string {
  if (!value) return "<em>(empty)</em>";
  return `<button type="button" class="apc-copy-value mono${badge ? " apc-number" : ""}" data-copy-value="${escapeHtml(value)}" title="Click to copy">${escapeHtml(value)}</button>`;
}

function summaryHtml(result: AutopilotProfileResult): string {
  if (result.summary.length === 0) return "";
  const rows = result.summary
    .map((f) => `<tr><td>${escapeHtml(f.label)}</td><td>${copyValueHtml(f.value)}</td></tr>`)
    .join("");
  return `
    <section class="apc-section apc-summary">
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
          <td>${copyValueHtml(String(f.value), true)}</td>
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
          <td>${copyValueHtml(String(f.raw), true)}</td>
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
    .map((f) => `<tr><td>${escapeHtml(f.label)}</td><td>${copyValueHtml(f.value)}</td></tr>`)
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
        <div class="ipk-field-header">
          <label class="apc-field-label" for="apc-input">Autopilot profile JSON (PolicyJsonCache)</label>
          <button type="button" id="apc-example" class="ipk-example-btn">Load example</button>
        </div>
        <textarea
          id="apc-input"
          class="mono"
          rows="6"
          placeholder='{"CloudAssignedTenantDomain":"ipkitprokit.onmicrosoft.com","DeploymentProfileName":"IPK - IT Pro Kit Autopilot","CloudAssignedDeviceName":"IPK-%SERIAL%","AutopilotMode":0,"CloudAssignedOobeConfig":28,...}'
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
    const onCopy = async (event: MouseEvent) => {
      const button = (event.target as Element).closest<HTMLButtonElement>(".apc-copy-value");
      if (!button) return;
      try {
        await navigator.clipboard.writeText(button.dataset.copyValue!);
        statusEl.textContent = "";
        button.classList.remove("is-copied");
        void button.offsetWidth;
        button.classList.add("is-copied");
      } catch (error) {
        statusEl.textContent = error instanceof Error ? error.message : "Couldn't copy that value.";
      }
    };
    resultsEl.addEventListener("click", onCopy);
    const unwireGlobalPaste = wireGlobalPaste(input);

    const exampleBtn = container.querySelector<HTMLButtonElement>("#apc-example")!;
    const unwireExample = wireExampleButton(exampleBtn, input, () => EXAMPLE_PROFILE_JSON);

    return () => {
      input.removeEventListener("input", render);
      resultsEl.removeEventListener("click", onCopy);
      unwireGlobalPaste();
      unwirePsTabs();
      unwireExample();
    };
  },
};

export default tool;
