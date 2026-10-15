import "./style.css";
import { copyButtonHtml, wireCopyButton } from "@/app/copy-button";
import { makePsCommandVariants, psCommandTabsHtml, wirePsCommandTabs } from "@/app/ps-command";
import { wireExampleButton } from "@/app/example-button";
import type { ToolDefinition } from "@/types/tool";
import { gidToLid, lidToGid } from "./convert";

const PS_LID_VARIANTS = makePsCommandVariants(
  '(Get-ItemProperty "Registry::HKEY_USERS\\.DEFAULT\\Software\\Microsoft\\IdentityCRL\\ExtendedProperties").LID',
);

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
        <p class="gid-hint ipk-hint">
          Converts a device's GDID (physical ID, used e.g. to correlate devices in Log Analytics) to and from
          its raw <code class="mono">LID</code> registry value. Fun fact: this ID made the news lately for
          reasons that have nothing to do with Intune reporting 🫠.
        </p>

        <p class="gid-step-label">1. Get the local LID value <span class="ipk-step-note">(copies to clipboard)</span></p>
        ${psCommandTabsHtml("gid-ps-lid")}

        <p class="gid-step-label">2. Enter either value — the other updates automatically</p>
        <div class="gid-fields">
          <div class="gid-field">
            <div class="ipk-field-header">
              <label class="gid-field-label" for="gid-lid">LID (hex)</label>
              <button type="button" id="gid-example" class="ipk-example-btn">Load example</button>
            </div>
            <div class="ipk-copy-wrap">
              <input type="text" id="gid-lid" class="mono" placeholder="0a1b2c3d4e5f6071" />
              ${copyButtonHtml("gid-copy-lid")}
            </div>
            <span class="gid-error" id="gid-error-lid" role="alert"></span>
          </div>

          <div class="gid-field">
            <label class="gid-field-label" for="gid-gid">Device physical ID (g:)</label>
            <div class="ipk-copy-wrap">
              <input type="text" id="gid-gid" class="mono" placeholder="g:1234567891234567" />
              ${copyButtonHtml("gid-copy-gid")}
            </div>
            <span class="gid-error" id="gid-error-gid" role="alert"></span>
          </div>
        </div>
      </div>
    `;

    const lidInput = container.querySelector<HTMLInputElement>("#gid-lid")!;
    const gidInput = container.querySelector<HTMLInputElement>("#gid-gid")!;
    const lidError = container.querySelector<HTMLSpanElement>("#gid-error-lid")!;
    const gidError = container.querySelector<HTMLSpanElement>("#gid-error-gid")!;
    const copyLidBtn = container.querySelector<HTMLButtonElement>("#gid-copy-lid")!;
    const copyGidBtn = container.querySelector<HTMLButtonElement>("#gid-copy-gid")!;

    const unwirePsTabs = wirePsCommandTabs(container, "gid-ps-lid", PS_LID_VARIANTS);

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

    const exampleBtn = container.querySelector<HTMLButtonElement>("#gid-example")!;
    const unwireExample = wireExampleButton(exampleBtn, lidInput, () => "0a1b2c3d4e5f6071");

    return () => {
      lidInput.removeEventListener("input", fromLid);
      gidInput.removeEventListener("input", fromGid);
      unwirePsTabs();
      unwireExample();
    };
  },
};

export default tool;
