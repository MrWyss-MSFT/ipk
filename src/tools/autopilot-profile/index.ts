import "./style.css";
import { copyButtonHtml, wireCopyButton } from "@/app/copy-button";
import type { ToolDefinition } from "@/types/tool";
import { parseAutopilotProfile, type AutopilotProfileResult } from "./parse";

const EXPORT_COMMAND =
  '(Get-ItemProperty "HKLM:\\SOFTWARE\\Microsoft\\Provisioning\\AutopilotPolicyCache" -Name PolicyJsonCache).PolicyJsonCache | Tee-Object -Variable Json | Set-Clipboard; $Json';

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
        <p class="apc-step-label">1. Run this on the device — it copies the cached profile JSON to your clipboard</p>
        <div class="ipk-copy-wrap">
          <textarea id="apc-cmd" class="mono" rows="3" readonly></textarea>
          ${copyButtonHtml("apc-cmd-copy")}
        </div>

        <label class="apc-step-label" for="apc-input">2. Paste it here (<kbd>Ctrl</kbd>+<kbd>V</kbd> — it's already on your clipboard)</label>
        <textarea id="apc-input" class="mono" rows="6" placeholder="Paste the PolicyJsonCache JSON here..."></textarea>
        <div id="apc-status" class="apc-status" role="alert"></div>

        <div id="apc-results"></div>
      </div>
    `;

    const cmdEl = container.querySelector<HTMLTextAreaElement>("#apc-cmd")!;
    cmdEl.value = EXPORT_COMMAND;
    const cmdCopyBtn = container.querySelector<HTMLButtonElement>("#apc-cmd-copy")!;
    wireCopyButton(cmdCopyBtn, () => EXPORT_COMMAND);

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

    return () => {
      input.removeEventListener("input", render);
    };
  },
};

export default tool;
