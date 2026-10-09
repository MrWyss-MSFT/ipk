import "./style.css";
import { copyButtonHtml, wireCopyButton } from "@/app/copy-button";
import { codeBlockHtml, setPowerShellCode } from "@/app/code-block";
import type { ToolDefinition } from "@/types/tool";
import { gidToLid, lidToGid } from "./convert";

const PS_LID_COMMAND =
  '(Get-ItemProperty "Registry::HKEY_USERS\\.DEFAULT\\Software\\Microsoft\\IdentityCRL\\ExtendedProperties").LID | Set-Clipboard -PassThru';

const tool: ToolDefinition = {
  id: "device-gid",
  name: "GDID ↔ LID",
  description: 'Convert the Entra ID/Azure AD device "g:" physical ID to and from its raw hex LID registry value.',
  category: "Converters",
  keywords: [
    "entra",
    "azure ad",
    "aad",
    "device",
    "physicalids",
    "gid",
    "lid",
    "intune",
    "autopilot",
    "identitycrl",
  ],
  icon: "🔢",
  mount(container) {
    container.innerHTML = `
      <div class="gid-tool">
        <p class="gid-hint">
          The <code class="mono">g:</code> device physical ID is a decimal view of the
          <code class="mono">LID</code> registry value. Edit either field — the other updates automatically.
        </p>

        <label class="gid-field-label" for="gid-ps-lid">PowerShell: get the local LID value (copies it to your clipboard)</label>
        <div class="ipk-copy-wrap">
          ${codeBlockHtml("gid-ps-lid")}
          ${copyButtonHtml("gid-copy-ps-lid")}
        </div>

        <label class="gid-field-label" for="gid-lid">LID (hex)</label>
        <div class="ipk-copy-wrap">
          <input type="text" id="gid-lid" class="mono" placeholder="0a1b2c3d4e5f6071" />
          ${copyButtonHtml("gid-copy-lid")}
        </div>

        <span class="gid-error" id="gid-error-lid" role="alert"></span>

        <label class="gid-field-label" for="gid-gid">Device physical ID (g:)</label>
        <div class="ipk-copy-wrap">
          <input type="text" id="gid-gid" class="mono" placeholder="g:1234567891234567" />
          ${copyButtonHtml("gid-copy-gid")}
        </div>

        <span class="gid-error" id="gid-error-gid" role="alert"></span>
      </div>
    `;

    const lidInput = container.querySelector<HTMLInputElement>("#gid-lid")!;
    const gidInput = container.querySelector<HTMLInputElement>("#gid-gid")!;
    const lidError = container.querySelector<HTMLSpanElement>("#gid-error-lid")!;
    const gidError = container.querySelector<HTMLSpanElement>("#gid-error-gid")!;
    const psLidOutput = container.querySelector<HTMLPreElement>("#gid-ps-lid")!;
    const copyLidBtn = container.querySelector<HTMLButtonElement>("#gid-copy-lid")!;
    const copyGidBtn = container.querySelector<HTMLButtonElement>("#gid-copy-gid")!;
    const copyPsLidBtn = container.querySelector<HTMLButtonElement>("#gid-copy-ps-lid")!;

    setPowerShellCode(psLidOutput, PS_LID_COMMAND);

    const fromLid = () => {
      lidError.textContent = "";
      if (!lidInput.value.trim()) {
        gidInput.value = "";
        return;
      }
      try {
        gidInput.value = lidToGid(lidInput.value);
        gidError.textContent = "";
      } catch (err) {
        lidError.textContent = err instanceof Error ? err.message : "Conversion failed.";
      }
    };

    const fromGid = () => {
      gidError.textContent = "";
      if (!gidInput.value.trim()) {
        lidInput.value = "";
        return;
      }
      try {
        lidInput.value = gidToLid(gidInput.value);
        lidError.textContent = "";
      } catch (err) {
        gidError.textContent = err instanceof Error ? err.message : "Conversion failed.";
      }
    };

    lidInput.addEventListener("input", fromLid);
    gidInput.addEventListener("input", fromGid);

    wireCopyButton(copyLidBtn, () => lidInput.value);
    wireCopyButton(copyGidBtn, () => gidInput.value);
    wireCopyButton(copyPsLidBtn, () => PS_LID_COMMAND);

    return () => {
      lidInput.removeEventListener("input", fromLid);
      gidInput.removeEventListener("input", fromGid);
    };
  },
};

export default tool;
