import "./style.css";
import { copyButtonHtml, wireCopyButton } from "@/app/copy-button";
import { wireExampleButton } from "@/app/example-button";
import type { ToolDefinition } from "@/types/tool";
import { detectSidCloud, objectIdToSid, sidToObjectId, type SidCloud } from "./convert";

const EXAMPLE_OBJECT_ID = "4f29d7a1-8b3e-4c6a-9f12-3d7e5a8b61c0";

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
        <div class="sid-cloud">
          <span class="sid-label">Cloud</span>
          <label><input type="radio" name="sid-cloud" value="commercial" checked /> Commercial / Global</label>
          <label><input type="radio" name="sid-cloud" value="gcc-high" /> GCC-High</label>
        </div>

        <p class="sid-step-label">Enter either value — the other updates automatically</p>
        <div class="sid-fields">
          <div class="sid-field">
            <div class="ipk-field-header">
              <label class="sid-field-label" for="sid-objectid">Entra ID ObjectID (GUID)</label>
              <button type="button" id="sid-objectid-example" class="ipk-example-btn">Load example</button>
            </div>
            <div class="ipk-copy-wrap">
              <input type="text" id="sid-objectid" class="mono" placeholder="4f29d7a1-8b3e-4c6a-9f12-3d7e5a8b61c0" />
              ${copyButtonHtml("sid-copy-objectid")}
            </div>
            <span class="sid-error" id="sid-error-objectid" role="alert"></span>
          </div>

          <div class="sid-field">
            <div class="ipk-field-header">
              <label class="sid-field-label" for="sid-sid">SID</label>
              <button type="button" id="sid-sid-example" class="ipk-example-btn">Load example</button>
            </div>
            <div class="ipk-copy-wrap">
              <input
                type="text"
                id="sid-sid"
                class="mono"
                placeholder="S-1-12-1-1328142241-1282050878-2117931679-3227618138"
              />
              ${copyButtonHtml("sid-copy-sid")}
            </div>
            <span class="sid-error" id="sid-error-sid" role="alert"></span>
          </div>
        </div>
      </div>
    `;

    const objectIdInput = container.querySelector<HTMLInputElement>("#sid-objectid")!;
    const sidInput = container.querySelector<HTMLInputElement>("#sid-sid")!;
    const objectIdError = container.querySelector<HTMLSpanElement>("#sid-error-objectid")!;
    const sidError = container.querySelector<HTMLSpanElement>("#sid-error-sid")!;
    const copyObjectIdBtn = container.querySelector<HTMLButtonElement>("#sid-copy-objectid")!;
    const copySidBtn = container.querySelector<HTMLButtonElement>("#sid-copy-sid")!;
    const cloudInputs = container.querySelectorAll<HTMLInputElement>("input[name='sid-cloud']");

    const getCloud = (): SidCloud => {
      const checked = container.querySelector<HTMLInputElement>("input[name='sid-cloud']:checked");
      return (checked?.value as SidCloud) ?? "commercial";
    };

    const setCloud = (cloud: SidCloud) => {
      cloudInputs.forEach((el) => (el.checked = el.value === cloud));
    };

    const fromObjectId = () => {
      objectIdError.textContent = "";
      if (!objectIdInput.value.trim()) {
        sidInput.value = "";
        return;
      }
      try {
        sidInput.value = objectIdToSid(objectIdInput.value, getCloud());
        sidError.textContent = "";
      } catch (err) {
        objectIdError.textContent = err instanceof Error ? err.message : "Conversion failed.";
      }
    };

    const fromSid = () => {
      sidError.textContent = "";
      if (!sidInput.value.trim()) {
        objectIdInput.value = "";
        return;
      }
      try {
        objectIdInput.value = sidToObjectId(sidInput.value);
        objectIdError.textContent = "";
        const detected = detectSidCloud(sidInput.value);
        if (detected) setCloud(detected);
      } catch (err) {
        sidError.textContent = err instanceof Error ? err.message : "Conversion failed.";
      }
    };

    objectIdInput.addEventListener("input", fromObjectId);
    sidInput.addEventListener("input", fromSid);
    cloudInputs.forEach((el) =>
      el.addEventListener("change", () => {
        if (objectIdInput.value.trim()) fromObjectId();
      }),
    );

    wireCopyButton(copyObjectIdBtn, () => objectIdInput.value);
    wireCopyButton(copySidBtn, () => sidInput.value);

    const objectIdExampleBtn = container.querySelector<HTMLButtonElement>("#sid-objectid-example")!;
    const unwireObjectIdExample = wireExampleButton(objectIdExampleBtn, objectIdInput, () => EXAMPLE_OBJECT_ID);

    const sidExampleBtn = container.querySelector<HTMLButtonElement>("#sid-sid-example")!;
    const unwireSidExample = wireExampleButton(sidExampleBtn, sidInput, () =>
      objectIdToSid(EXAMPLE_OBJECT_ID, getCloud()),
    );

    return () => {
      objectIdInput.removeEventListener("input", fromObjectId);
      sidInput.removeEventListener("input", fromSid);
      unwireObjectIdExample();
      unwireSidExample();
    };
  },
};

export default tool;

