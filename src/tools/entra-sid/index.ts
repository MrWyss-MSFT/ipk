import "./style.css";
import { copyButtonHtml, wireCopyButton } from "@/app/copy-button";
import type { ToolDefinition } from "@/types/tool";
import { detectSidCloud, objectIdToSid, sidToObjectId, type SidCloud } from "./convert";

type Mode = "objectid-to-sid" | "sid-to-objectid";

const tool: ToolDefinition = {
  id: "entra-sid",
  name: "Entra ID ObjectID ↔ SID",
  description:
    "Convert an Entra ID (Azure AD) object GUID to its Windows SID form, and back — handy for Intune local group membership policies.",
  category: "Converters",
  keywords: ["entra", "azure ad", "aad", "objectid", "guid", "sid", "intune", "local group membership"],
  icon: "🆔",
  mount(container) {
    container.innerHTML = `
      <div class="sid-tool">
        <div class="sid-mode" role="radiogroup" aria-label="Conversion direction">
          <button type="button" class="btn btn-primary" data-mode="objectid-to-sid">ObjectID &rarr; SID</button>
          <button type="button" class="btn" data-mode="sid-to-objectid">SID &rarr; ObjectID</button>
        </div>

        <div class="sid-cloud" id="sid-cloud-row">
          <span class="sid-label">Cloud</span>
          <label><input type="radio" name="sid-cloud" value="commercial" checked /> Commercial / Global</label>
          <label><input type="radio" name="sid-cloud" value="gcc-high" /> GCC-High</label>
        </div>

        <label class="sid-field-label" id="sid-input-label" for="sid-input">Entra ID ObjectID (GUID)</label>
        <input type="text" id="sid-input" class="mono" placeholder="4f29d7a1-8b3e-4c6a-9f12-3d7e5a8b61c0" />

        <span class="sid-error" id="sid-error" role="alert"></span>

        <label class="sid-field-label" id="sid-output-label" for="sid-output">SID</label>
        <div class="ipk-copy-wrap">
          <input type="text" id="sid-output" class="mono" readonly />
          ${copyButtonHtml("sid-copy")}
        </div>
      </div>
    `;

    const input = container.querySelector<HTMLInputElement>("#sid-input")!;
    const output = container.querySelector<HTMLInputElement>("#sid-output")!;
    const inputLabel = container.querySelector<HTMLLabelElement>("#sid-input-label")!;
    const outputLabel = container.querySelector<HTMLLabelElement>("#sid-output-label")!;
    const errorEl = container.querySelector<HTMLSpanElement>("#sid-error")!;
    const copyBtn = container.querySelector<HTMLButtonElement>("#sid-copy")!;
    const modeButtons = container.querySelectorAll<HTMLButtonElement>("[data-mode]");
    const cloudRow = container.querySelector<HTMLElement>("#sid-cloud-row")!;
    const cloudInputs = container.querySelectorAll<HTMLInputElement>("input[name='sid-cloud']");

    let mode: Mode = "objectid-to-sid";

    const getCloud = (): SidCloud => {
      const checked = container.querySelector<HTMLInputElement>("input[name='sid-cloud']:checked");
      return (checked?.value as SidCloud) ?? "commercial";
    };

    const setCloud = (cloud: SidCloud) => {
      cloudInputs.forEach((el) => (el.checked = el.value === cloud));
    };

    const render = () => {
      errorEl.textContent = "";
      if (!input.value.trim()) {
        output.value = "";
        return;
      }
      try {
        if (mode === "objectid-to-sid") {
          output.value = objectIdToSid(input.value, getCloud());
        } else {
          output.value = sidToObjectId(input.value);
        }
      } catch (err) {
        output.value = "";
        errorEl.textContent = err instanceof Error ? err.message : "Conversion failed.";
      }
    };

    const setMode = (next: Mode) => {
      mode = next;
      modeButtons.forEach((btn) => {
        btn.classList.toggle("btn-primary", btn.dataset.mode === next);
      });
      cloudRow.style.visibility = next === "objectid-to-sid" ? "visible" : "hidden";
      if (next === "objectid-to-sid") {
        inputLabel.textContent = "Entra ID ObjectID (GUID)";
        outputLabel.textContent = "SID";
        input.placeholder = "4f29d7a1-8b3e-4c6a-9f12-3d7e5a8b61c0";
      } else {
        inputLabel.textContent = "SID";
        outputLabel.textContent = "Entra ID ObjectID (GUID)";
        input.placeholder = "S-1-12-1-1328142241-1282050878-2117931679-3227618138";
        const detected = detectSidCloud(input.value);
        if (detected) setCloud(detected);
      }
      render();
    };

    modeButtons.forEach((btn) => {
      btn.addEventListener("click", () => setMode(btn.dataset.mode as Mode));
    });

    cloudInputs.forEach((el) => el.addEventListener("change", render));
    input.addEventListener("input", () => {
      if (mode === "sid-to-objectid") {
        const detected = detectSidCloud(input.value);
        if (detected) setCloud(detected);
      }
      render();
    });

    wireCopyButton(copyBtn, () => output.value);

    setMode(mode);

    return () => {
      input.removeEventListener("input", render);
    };
  },
};

export default tool;
