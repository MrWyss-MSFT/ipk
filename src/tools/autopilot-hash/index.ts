import "./style.css";
import { copyButtonHtml, wireCopyButton } from "@/app/copy-button";
import { makePsCommandVariants, psCommandTabsHtml, wirePsCommandTabs } from "@/app/ps-command";
import type { ToolDefinition } from "@/types/tool";
import { decodeAutopilotHashBase64 } from "./decode";

const PS_VARIANTS = makePsCommandVariants(
  '(Get-CimInstance -Namespace root/cimv2/mdm/dmmap -Class MDM_DevDetail_Ext01 -Filter "InstanceID=\'Ext\' AND ParentID=\'./DevDetail\'").DeviceHardwareData',
);

function escapeHtml(value: string): string {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Whether a value should render as a collapsible tree node (vs. a single leaf row). */
function isExpandable(value: unknown): value is Record<string, unknown> | unknown[] {
  if (Array.isArray(value)) return value.length > 0;
  if (isPlainObject(value)) return Object.keys(value).length > 0;
  return false;
}

/** Renders a leaf's display text (only leaf values use the code/mono font). */
function renderLeafValue(value: unknown): string {
  const isEmptyCollection = (Array.isArray(value) && value.length === 0) || (isPlainObject(value) && Object.keys(value).length === 0);
  if (value === null || value === undefined || value === "" || isEmptyCollection) {
    return `<span class="aph-leaf-value aph-empty">—</span>`;
  }
  const text = String(value);
  return `<span class="aph-leaf-value mono" data-copy-value="${escapeHtml(text)}" title="Click to copy">${escapeHtml(
    text,
  )}</span>`;
}

/** Recursively renders one key + value as either a collapsible tree node or a leaf row. */
function renderNode(label: string, value: unknown): string {
  if (isExpandable(value)) {
    const children = Array.isArray(value)
      ? value.map((item, i) => renderNode(`#${i + 1}`, item)).join("")
      : Object.entries(value)
          .map(([key, v]) => renderNode(key, v))
          .join("");
    return `
      <details class="aph-node" open>
        <summary class="aph-node-label">${escapeHtml(label)}</summary>
        <div class="aph-children">${children}</div>
      </details>
    `;
  }
  return `
    <div class="aph-leaf-row">
      <span class="aph-leaf-label">${escapeHtml(label)}</span>
      ${renderLeafValue(value)}
    </div>
  `;
}

/** Renders the root object's entries as a top-level treeview (no wrapping node for the root itself). */
function renderTree(root: Record<string, unknown>): string {
  return Object.entries(root)
    .map(([key, value]) => renderNode(key, value))
    .join("");
}

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
        <p class="aph-step-label">1. Get the hardware hash on a Windows device (copies to clipboard)</p>
        ${psCommandTabsHtml("aph-snippet", { requiresAdmin: true })}
        <label class="aph-step-label" for="aph-input">2. Base64 hardware hash (DeviceHardwareData)</label>
        <textarea
          id="aph-input"
          class="mono"
          rows="6"
          placeholder="AAAAAAEAHAAAAAoAAAAAwMBAAAAAAAAACgAAAAEABQAAAAEAAAAAAAAAAAAAAIABAAChDjmGH...(very long Base64 string)"
        ></textarea>
        <span class="aph-error" id="aph-error" role="alert"></span>
        <label class="aph-label" for="aph-output">Decoded device details</label>
        <div class="aph-output" id="aph-output"></div>
        <details class="aph-raw" hidden>
          <summary>Raw JSON</summary>
          <div class="ipk-copy-wrap">
            <pre class="ipk-code mono" id="aph-raw-output"></pre>
            ${copyButtonHtml("aph-copy")}
          </div>
        </details>
      </div>
    `;

    const input = container.querySelector<HTMLTextAreaElement>("#aph-input")!;
    const output = container.querySelector<HTMLDivElement>("#aph-output")!;
    const rawOutput = container.querySelector<HTMLPreElement>("#aph-raw-output")!;
    const rawDetails = container.querySelector<HTMLDetailsElement>(".aph-raw")!;
    const errorEl = container.querySelector<HTMLSpanElement>("#aph-error")!;
    const copyBtn = container.querySelector<HTMLButtonElement>("#aph-copy")!;

    let rawJson = "";

    const render = () => {
      errorEl.textContent = "";
      if (!input.value.trim()) {
        output.innerHTML = "";
        rawOutput.textContent = "";
        rawJson = "";
        rawDetails.hidden = true;
        return;
      }
      try {
        const decoded = decodeAutopilotHashBase64(input.value);
        rawJson = JSON.stringify(decoded, null, 2);
        output.innerHTML = renderTree(decoded as unknown as Record<string, unknown>);
        rawOutput.textContent = rawJson;
        rawDetails.hidden = false;
      } catch (err) {
        output.innerHTML = "";
        rawOutput.textContent = "";
        rawJson = "";
        rawDetails.hidden = true;
        errorEl.textContent = err instanceof Error ? err.message : "Failed to decode hardware hash.";
      }
    };

    const onOutputClick = async (e: MouseEvent) => {
      const leaf = (e.target as HTMLElement).closest<HTMLElement>(".aph-leaf-value:not(.aph-empty)");
      if (!leaf) return;
      const value = leaf.dataset.copyValue ?? leaf.textContent ?? "";
      if (!value) return;
      await navigator.clipboard.writeText(value);
      leaf.classList.remove("is-copied");
      // Force reflow so retriggering the animation on repeated clicks restarts it.
      void leaf.offsetWidth;
      leaf.classList.add("is-copied");
    };

    input.addEventListener("input", render);
    output.addEventListener("click", onOutputClick);
    wireCopyButton(copyBtn, () => rawJson);
    const unwirePsTabs = wirePsCommandTabs(container, "aph-snippet", PS_VARIANTS);

    return () => {
      input.removeEventListener("input", render);
      output.removeEventListener("click", onOutputClick);
      unwirePsTabs();
    };
  },
};

export default tool;
