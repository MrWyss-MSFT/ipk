import "./style.css";
import { autoGrowTextarea, copyButtonHtml, wireCopyButton } from "@/app/copy-button";
import { makePsCommandVariants, psCommandTabsHtml, wirePsCommandTabs } from "@/app/ps-command";
import type { ToolDefinition } from "@/types/tool";
import { decodeAutopilotHashBase64 } from "./decode";

const PS_VARIANTS = makePsCommandVariants(
  '(Get-CimInstance -Namespace root/cimv2/mdm/dmmap -Class MDM_DevDetail_Ext01 -Filter "InstanceID=\'Ext\' AND ParentID=\'./DevDetail\'").DeviceHardwareData',
);

const tool: ToolDefinition = {
  id: "autopilot-hash",
  name: "Autopilot Hardware Hash Decoder",
  description:
    "Decode a Windows Autopilot \"4K hardware hash\" (DeviceHardwareData) Base64 string into readable device details.",
  category: "Converters",
  keywords: [
    "autopilot",
    "hardware hash",
    "devicehardwaredata",
    "oa3tool",
    "intune",
    "4k hash",
    "tpm",
    "smbios",
  ],
  icon: "🧾",
  mount(container) {
    container.innerHTML = `
      <div class="aph-tool">
        <label class="aph-label" for="aph-snippet">Get the hardware hash on a Windows device (PowerShell — copies it to your clipboard)</label>
        ${psCommandTabsHtml("aph-snippet", { requiresAdmin: true })}
        <label class="aph-label" for="aph-input">Base64 hardware hash (DeviceHardwareData)</label>
        <textarea id="aph-input" class="mono" rows="6" placeholder="Paste the Base64 hardware hash here..."></textarea>
        <span class="aph-error" id="aph-error" role="alert"></span>
        <label class="aph-label" for="aph-output">Decoded JSON</label>
        <div class="ipk-copy-wrap">
          <textarea id="aph-output" class="mono" rows="20" readonly></textarea>
          ${copyButtonHtml("aph-copy")}
        </div>
      </div>
    `;

    const input = container.querySelector<HTMLTextAreaElement>("#aph-input")!;
    const output = container.querySelector<HTMLTextAreaElement>("#aph-output")!;
    const errorEl = container.querySelector<HTMLSpanElement>("#aph-error")!;
    const copyBtn = container.querySelector<HTMLButtonElement>("#aph-copy")!;

    const render = () => {
      errorEl.textContent = "";
      if (!input.value.trim()) {
        output.value = "";
        autoGrowTextarea(output);
        return;
      }
      try {
        const decoded = decodeAutopilotHashBase64(input.value);
        output.value = JSON.stringify(decoded, null, 2);
      } catch (err) {
        output.value = "";
        errorEl.textContent = err instanceof Error ? err.message : "Failed to decode hardware hash.";
      }
      autoGrowTextarea(output);
    };

    input.addEventListener("input", render);
    wireCopyButton(copyBtn, () => output.value);
    const unwirePsTabs = wirePsCommandTabs(container, "aph-snippet", PS_VARIANTS);

    return () => {
      input.removeEventListener("input", render);
      unwirePsTabs();
    };
  },
};

export default tool;
