import "./style.css";
import { autoGrowTextarea, copyButtonHtml, wireCopyButton } from "@/app/copy-button";
import type { ToolDefinition } from "@/types/tool";
import { decodeComgmtWorkloads, parseWorkloadValue } from "./decode";

const tool: ToolDefinition = {
  id: "comgmt-workloads",
  name: "Co-Management Workloads Decoder",
  description:
    "Decode a ConfigMgr CCM_System.ComgmtWorkloads bitmask into the individual Co-Management workload switches.",
  category: "Converters",
  keywords: [
    "comanagement",
    "co-management",
    "comgmtworkloads",
    "ccm_system",
    "configmgr",
    "sccm",
    "intune",
    "workloads",
  ],
  icon: "🔀",
  mount(container) {
    const psSnippet =
      '$System = Get-CimInstance -Namespace "root\\ccm\\InvAgt" -ClassName "CCM_System"; "CoManaged: $($System.CoManaged)"; $System.ComgmtWorkloads | Tee-Object -Variable Result | Set-Clipboard; $Result';

    container.innerHTML = `
      <div class="cmw-tool">
        <p class="cmw-note">
          Runs entirely in your browser — nothing is uploaded anywhere.
        </p>
        <label class="cmw-label" for="cmw-snippet">Get the value on a co-managed device (PowerShell — copies the value to your clipboard)</label>
        <div class="ipk-copy-wrap">
          <textarea id="cmw-snippet" class="mono" rows="3" readonly>${psSnippet}</textarea>
          ${copyButtonHtml("cmw-copy-snippet")}
        </div>
        <label class="cmw-label" for="cmw-input">ComgmtWorkloads value (decimal or hex, e.g. 8193 or 0x2001)</label>
        <input id="cmw-input" class="mono" type="text" placeholder="e.g. 8193" value="8193" />
        <span class="cmw-error" id="cmw-error" role="alert"></span>
        <p class="cmw-hex" id="cmw-hex"></p>
        <p class="cmw-note">Tick or untick workloads below to build the value the other way around.</p>
        <table class="cmw-table" id="cmw-table">
          <thead>
            <tr>
              <th>Workload</th>
              <th>Flag value</th>
              <th>Enabled</th>
            </tr>
          </thead>
          <tbody id="cmw-tbody"></tbody>
        </table>
      </div>
    `;

    const input = container.querySelector<HTMLInputElement>("#cmw-input")!;
    const errorEl = container.querySelector<HTMLSpanElement>("#cmw-error")!;
    const hexEl = container.querySelector<HTMLParagraphElement>("#cmw-hex")!;
    const tbody = container.querySelector<HTMLTableSectionElement>("#cmw-tbody")!;
    const snippetCopyBtn = container.querySelector<HTMLButtonElement>("#cmw-copy-snippet")!;

    const renderFromValue = () => {
      errorEl.textContent = "";
      hexEl.textContent = "";
      tbody.innerHTML = "";

      if (!input.value.trim()) {
        return;
      }

      try {
        const results = decodeComgmtWorkloads(input.value);
        const numericValue = parseWorkloadValue(input.value);
        hexEl.textContent = `= ${numericValue} (0x${numericValue.toString(16).toUpperCase()})`;
        tbody.innerHTML = results
          .map(
            (r) => `
              <tr>
                <td>${r.workload}</td>
                <td>${r.value}</td>
                <td class="cmw-enabled-cell">
                  <input type="checkbox" class="cmw-checkbox" data-flag-value="${r.value}" ${r.isEnabled ? "checked" : ""} />
                </td>
              </tr>
            `
          )
          .join("");

        tbody.querySelectorAll<HTMLInputElement>(".cmw-checkbox").forEach((checkbox) => {
          checkbox.addEventListener("change", () => {
            const flagValue = Number(checkbox.dataset.flagValue);
            const current = numericValue || 0;
            const next = checkbox.checked ? current | flagValue : current & ~flagValue;
            input.value = String(next >>> 0);
            renderFromValue();
          });
        });
      } catch (err) {
        errorEl.textContent = err instanceof Error ? err.message : "Failed to decode value.";
      }
    };

    input.addEventListener("input", renderFromValue);
    wireCopyButton(snippetCopyBtn, () => psSnippet);
    autoGrowTextarea(container.querySelector<HTMLTextAreaElement>("#cmw-snippet")!);

    renderFromValue();

    return () => {
      input.removeEventListener("input", renderFromValue);
    };
  },
};

export default tool;
