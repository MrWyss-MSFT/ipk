import "./style.css";
import { autoGrowTextarea, copyButtonHtml, wireCopyButton } from "@/app/copy-button";
import { codeBlockHtml, setPowerShellCode } from "@/app/code-block";
import type { ToolDefinition } from "@/types/tool";
import { decodeAutopilotHashBase64 } from "./decode";

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
    const psSnippet =
      '(Get-CimInstance -Namespace root/cimv2/mdm/dmmap -Class MDM_DevDetail_Ext01 -Filter "InstanceID=\'Ext\' AND ParentID=\'./DevDetail\'").DeviceHardwareData | Set-Clipboard -PassThru';

    container.innerHTML = `
      <div class="aph-tool">
        <label class="aph-label" for="aph-snippet">Get the hardware hash on a Windows device (PowerShell — copies it to your clipboard)</label>
        <div class="ipk-copy-wrap">
          ${codeBlockHtml("aph-snippet")}
          ${copyButtonHtml("aph-copy-snippet")}
        </div>
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
    const snippetCopyBtn = container.querySelector<HTMLButtonElement>("#aph-copy-snippet")!;

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
    wireCopyButton(snippetCopyBtn, () => psSnippet);
    setPowerShellCode(container.querySelector<HTMLElement>("#aph-snippet")!, psSnippet);

    return () => {
      input.removeEventListener("input", render);
    };
  },
};

export default tool;
