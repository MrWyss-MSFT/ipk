import "./style.css";
import { wireGlobalPaste } from "@/app/global-paste";
import { wireExampleButton } from "@/app/example-button";
import { makePsCommandVariants, psCommandTabsHtml, wirePsCommandTabs } from "@/app/ps-command";
import type { ToolDefinition } from "@/types/tool";
import { parseEspExport, type EspPhaseResult, type EspParseError } from "./parse";

const PS_VARIANTS = makePsCommandVariants("$Values | ConvertTo-Json -Compress", {
  setup:
    '$RegPath = "HKLM:\\SOFTWARE\\Microsoft\\Provisioning\\AutopilotSettings"; $Values = @{}; (Get-Item $RegPath).Property -like "*Category.Status*" | ForEach-Object { $Values[$_] = Get-ItemPropertyValue $RegPath -Name $_ }; ',
});

// Shaped after a real (anonymized) AutopilotSettings export, which is why the
// per-phase substep keys look like "AccountSetup.AppsSubcategory" rather than
// "AccountSetupCategory.Apps" - see stripPhasePrefix()'s doc comment.
const EXAMPLE_ESP_JSON = JSON.stringify({
  "DevicePreparationCategory.Status": JSON.stringify({
    categoryState: "succeeded",
    categoryStatusText: "Completed",
    "DevicePreparation.TpmAttestationSubcategory": {
      subcategoryState: "succeeded",
      subcategoryStatusText: "Securing your hardware (Completed)",
    },
    "DevicePreparation.AadjSubcategory": {
      subcategoryState: "succeeded",
      subcategoryStatusText: "Joining your organization's network (Completed)",
    },
    "DevicePreparation.MdmEnrollmentSubcategory": {
      subcategoryState: "succeeded",
      subcategoryStatusText: "Registering your device for mobile management (Completed)",
    },
  }),
  "DeviceSetupCategory.Status": JSON.stringify({
    categoryState: "succeeded",
    categoryStatusText: "Completed",
    "DeviceSetup.SecurityPoliciesSubcategory": {
      subcategoryState: "succeeded",
      subcategoryStatusText: "Security policies (1 of 1 applied)",
    },
    "DeviceSetup.AppsSubcategory": {
      subcategoryState: "succeeded",
      subcategoryStatusText: "Apps (3 of 3 installed)",
    },
    "DeviceSetup.SendResultsToMdmServer": { subcategoryState: "succeeded", subcategoryStatusText: "succeeded" },
  }),
  "AccountSetupCategory.Status.2026-10-05T13:19:26.888Z": JSON.stringify({
    categoryState: "succeeded",
    categoryStatusText: "Completed",
    "AccountSetup.WaitingForAadRegistrationSubcategory": {
      subcategoryState: "succeeded",
      subcategoryStatusText: "Joining your organization's network (Completed)",
    },
    "AccountSetup.AppsSubcategory": {
      subcategoryState: "inProgress",
      subcategoryStatusText: "Apps (No setup needed)",
    },
    "AccountSetup.SendResultsToMdmServer": { subcategoryState: "succeeded", subcategoryStatusText: "succeeded" },
  }),
});

/** Best-effort bucket for coloring a status badge; falls back to "unknown" for anything unrecognized. */
function stateBucket(state: string): "ok" | "fail" | "progress" | "block" | "idle" | "unknown" {
  const s = state.toLowerCase();
  if (!s) return "unknown";
  if (s.includes("succeed") || s.includes("complete")) return "ok";
  if (s.includes("fail") || s.includes("error")) return "fail";
  if (s.includes("progress") || s.includes("pending") || s.includes("running")) return "progress";
  if (s.includes("block")) return "block";
  if (s.includes("notstarted") || s.includes("not started")) return "idle";
  return "unknown";
}

function phaseHtml(phase: EspPhaseResult): string {
  const rows = phase.steps
    .map(
      (s) => `
        <tr>
          <td>${s.stepName || "<em>(unnamed)</em>"}</td>
          <td><span class="esp-badge esp-badge-${stateBucket(s.state)}">${s.state || "—"}</span></td>
          <td class="esp-text-cell">${s.text || ""}</td>
        </tr>
      `,
    )
    .join("");
  return `
    <section class="esp-phase">
      <h3>
        <span>${phase.label}${phase.phaseText ? `<span class="esp-phase-text">${phase.phaseText}</span>` : ""}</span>
        ${phase.phaseState ? `<span class="esp-badge esp-badge-${stateBucket(phase.phaseState)}">${phase.phaseState}</span>` : ""}
      </h3>
      <div class="ipk-table-scroll"><table class="esp-table">
        <thead><tr><th>Step</th><th>State</th><th>Details</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="3" class="esp-empty">No steps found.</td></tr>`}</tbody>
      </table></div>
    </section>
  `;
}

function errorsHtml(errors: EspParseError[]): string {
  if (errors.length === 0) return "";
  return `<p class="esp-warn">${errors.map((e) => e.message).join("<br/>")}</p>`;
}

const tool: ToolDefinition = {
  id: "esp-parser",
  name: "ESP Progress Parser",
  description:
    "Parse the Windows Autopilot Enrollment Status Page (ESP) per-phase step status from an exported registry JSON blob — Device Preparation, Device Setup, and Account Setup.",
  category: "Converters",
  keywords: [
    "esp",
    "enrollment status page",
    "autopilot",
    "device preparation",
    "device setup",
    "account setup",
    "provisioning",
    "autopilotsettings",
    "intune",
  ],
  icon: "🧩",
  mount(container) {
    container.innerHTML = `
      <div class="esp-tool">
        <p class="ipk-hint">
          Not every device has all three phases — <strong>Device Preparation</strong> only exists on
          newer builds that use the updated Enrollment Status Page. This dumps every value under the key,
          so timestamp-suffixed value names (e.g.
          <code class="mono">AccountSetupCategory.Status.2026-10-05T13:19:26.888Z</code>) and missing
          phases are both handled automatically.
        </p>

        <p class="esp-step-label">1. Get the ESP registry values <span class="ipk-step-note">(copies to clipboard)</span></p>
        ${psCommandTabsHtml("esp-cmd")}

        <p class="esp-step-label">2. Paste anywhere on the page</p>
        <div class="ipk-field-header">
          <label class="esp-field-label" for="esp-input">ESP registry values (JSON)</label>
          <button type="button" id="esp-example" class="ipk-example-btn">Load example</button>
        </div>
        <textarea
          id="esp-input"
          class="mono"
          rows="6"
          placeholder='{"DeviceSetupCategory.Status":"Succeeded","DeviceSetupCategory.StatusText":"Succeeded","AccountSetupCategory.Status.2026-10-05T13:19:26.888Z":"Succeeded",...}'
        ></textarea>
        <div id="esp-status" class="esp-status" role="alert"></div>

        <div id="esp-results"></div>
      </div>
    `;

    const unwirePsTabs = wirePsCommandTabs(container, "esp-cmd", PS_VARIANTS);

    const input = container.querySelector<HTMLTextAreaElement>("#esp-input")!;
    const statusEl = container.querySelector<HTMLDivElement>("#esp-status")!;
    const resultsEl = container.querySelector<HTMLDivElement>("#esp-results")!;

    const render = () => {
      const raw = input.value.trim();
      if (!raw) {
        statusEl.textContent = "";
        resultsEl.innerHTML = "";
        return;
      }
      try {
        const { phases, errors } = parseEspExport(raw);
        if (phases.length === 0) {
          statusEl.textContent =
            "No recognized phases (DevicePreparation / DeviceSetup / AccountSetup) found in that JSON.";
          resultsEl.innerHTML = "";
          return;
        }
        statusEl.innerHTML = errorsHtml(errors);
        resultsEl.innerHTML = phases.map(phaseHtml).join("");
      } catch (err) {
        statusEl.textContent = err instanceof Error ? err.message : "Couldn't parse that input.";
        resultsEl.innerHTML = "";
      }
    };

    input.addEventListener("input", render);
    const unwireGlobalPaste = wireGlobalPaste(input);

    const exampleBtn = container.querySelector<HTMLButtonElement>("#esp-example")!;
    const unwireExample = wireExampleButton(exampleBtn, input, () => EXAMPLE_ESP_JSON);

    return () => {
      input.removeEventListener("input", render);
      unwireGlobalPaste();
      unwirePsTabs();
      unwireExample();
    };
  },
};

export default tool;
