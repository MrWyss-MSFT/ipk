import "./style.css";
import { copyButtonHtml, wireCopyButton } from "@/app/copy-button";
import { wireGlobalPaste } from "@/app/global-paste";
import { wireExampleButton } from "@/app/example-button";
import { makePsCommandVariants, psCommandTabsHtml, wirePsCommandTabs } from "@/app/ps-command";
import type { ToolDefinition } from "@/types/tool";
import { decodeAutopilotHashBase64 } from "./decode";
import { autopilotCsvFilename, buildAutopilotCsv } from "./csv";

const PS_VARIANTS = makePsCommandVariants(
  '(Get-CimInstance -Namespace root/cimv2/mdm/dmmap -Class MDM_DevDetail_Ext01 -Filter "InstanceID=\'Ext\' AND ParentID=\'./DevDetail\'").DeviceHardwareData',
);

// A made-up (not a real device) hardware hash, hand-built as a minimal valid
// TLV structure so "Load example" has something to decode without needing a
// real Windows device.
const EXAMPLE_HASH_BASE64 =
  "NEuIAAMAEABHZW51aW5lSW50ZWwEAB4ASW50ZWwoUikgQ29yZShUTSkgaTctMTI2NVUOAA4ASVBLMTIzNDU2NxAAFABJUEsgLSBJVCBQcm8gS2l0EQAZAElQSyBJVCBQcm8gS2l0IERldmljZRgAGwAwMDMyOS0wMDAwMC0wMDAwMy1BQTExMQ==";

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
  return `<span class="aph-leaf-value ipk-copy-value mono" data-copy-value="${escapeHtml(text)}" title="Click to copy">${escapeHtml(
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
        <p class="aph-step-label ipk-step-label">1. Get the hardware hash <span class="ipk-step-note">(copies to clipboard)</span></p>
        ${psCommandTabsHtml("aph-snippet", { requiresAdmin: true })}
        <p class="aph-step-label ipk-step-label">2. Paste anywhere on the page</p>
        <div class="ipk-field-header">
          <label class="aph-label ipk-field-label" for="aph-input">Base64 hardware hash (DeviceHardwareData)</label>
          <button type="button" id="aph-example" class="ipk-example-btn">Load example</button>
        </div>
        <textarea
          id="aph-input"
          class="mono"
          rows="6"
          placeholder="AAAAAAEAHAAAAAoAAAAAwMBAAAAAAAAACgAAAAEABQAAAAEAAAAAAAAAAAAAAIABAAChDjmGH...(very long Base64 string)"
        ></textarea>
        <span class="aph-error ipk-error" id="aph-error" role="alert"></span>
        <details class="aph-csv">
          <summary>Export Autopilot CSV</summary>
          <div class="aph-csv-fields">
            <label>
              <span class="aph-csv-label-tip" tabindex="0" aria-describedby="aph-csv-serial-tip">
                Device Serial Nr. or Device Name
                <span class="aph-csv-tooltip" id="aph-csv-serial-tip" role="tooltip">Used only in the CSV's Device Serial Number column and filename. This does not rename the device or set its name in Autopilot.</span>
              </span>
              <input id="aph-csv-serial" type="text" readonly aria-describedby="aph-csv-serial-tip">
            </label>
            <label>Windows Product ID (optional)<input id="aph-csv-product" type="text" readonly></label>
            <label>Group Tag (optional)<input id="aph-csv-group" type="text"></label>
            <label>Assigned User (optional UPN)<input id="aph-csv-user" type="text" placeholder="user@contoso.com"></label>
          </div>
          <button type="button" id="aph-csv-download" class="btn btn-primary" disabled>⬇️ Export as .csv</button>
          <span class="aph-error ipk-error" id="aph-csv-error" role="alert"></span>
        </details>
        <label class="aph-label ipk-field-label" for="aph-output">Decoded device details</label>
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
    const serialInput = container.querySelector<HTMLInputElement>("#aph-csv-serial")!;
    const productInput = container.querySelector<HTMLInputElement>("#aph-csv-product")!;
    const download = container.querySelector<HTMLButtonElement>("#aph-csv-download")!;
    const csvError = container.querySelector<HTMLElement>("#aph-csv-error")!;
    let validHash = "";

    const render = () => {
      errorEl.textContent = "";
      validHash = "";
      download.disabled = true;
      csvError.textContent = "";
      serialInput.value = "";
      serialInput.readOnly = true;
      productInput.value = "";
      productInput.readOnly = true;
      if (!input.value.trim()) {
        output.innerHTML = "";
        rawOutput.textContent = "";
        rawJson = "";
        rawDetails.hidden = true;
        return;
      }
      try {
        const decoded = decodeAutopilotHashBase64(input.value);
        validHash = input.value.replace(/\s/g, "");
        serialInput.value = decoded.Smbios.SystemSerialNumber ?? "";
        serialInput.readOnly = false;
        productInput.value = decoded.ProductKeyID ?? "";
        productInput.readOnly = Boolean(productInput.value);
        download.disabled = false;
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

    // Let Ctrl+V paste the hash here no matter what has focus, unless the user is
    // actively typing into some other editable field (e.g. header search).
    input.addEventListener("input", render);
    output.addEventListener("click", onOutputClick);
    const unwireGlobalPaste = wireGlobalPaste(input);
    wireCopyButton(copyBtn, () => rawJson);
    const unwirePsTabs = wirePsCommandTabs(container, "aph-snippet", PS_VARIANTS);

    const exampleBtn = container.querySelector<HTMLButtonElement>("#aph-example")!;
    const unwireExample = wireExampleButton(exampleBtn, input, () => EXAMPLE_HASH_BASE64);
    let downloadUrl: string | null = null;
    const onDownload = () => {
      csvError.textContent = "";
      try {
        if (!validHash) throw new Error("Paste a valid hardware hash before exporting.");
        const csv = buildAutopilotCsv({
          serialNumber: serialInput.value,
          productId: container.querySelector<HTMLInputElement>("#aph-csv-product")!.value,
          hardwareHash: validHash,
          groupTag: container.querySelector<HTMLInputElement>("#aph-csv-group")!.value,
          assignedUser: container.querySelector<HTMLInputElement>("#aph-csv-user")!.value,
        });
        if (downloadUrl) URL.revokeObjectURL(downloadUrl);
        downloadUrl = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=us-ascii" }));
        const link = document.createElement("a");
        link.href = downloadUrl;
        link.download = autopilotCsvFilename(serialInput.value);
        link.click();
      } catch (error) {
        csvError.textContent = error instanceof Error ? error.message : "Failed to export CSV.";
      }
    };
    download.addEventListener("click", onDownload);

    return () => {
      input.removeEventListener("input", render);
      output.removeEventListener("click", onOutputClick);
      unwireGlobalPaste();
      unwirePsTabs();
      unwireExample();
      download.removeEventListener("click", onDownload);
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    };
  },
};

export default tool;
