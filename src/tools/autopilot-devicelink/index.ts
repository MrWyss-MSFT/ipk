import "./style.css";
import type { ToolDefinition } from "@/types/tool";
import { copyButtonHtml, wireCopyButton } from "@/app/copy-button";
import {
  isDeviceLinkPayload,
  parseDeviceLinkUrl,
  decodeDeviceLinkData,
  parseDeviceLinkCsvText,
  decodeTextFileBytes,
  buildDeviceLinkCsvText,
  buildDeviceLinkCsvTextMulti,
  encodeUtf16LeWithBom,
  deviceLinkCsvFilename,
  type DeviceLinkInfo,
  type DeviceLinkCsvRowError,
} from "@/app/devicelink";

function escapeHtml(value: string): string {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}

interface ResultField {
  label: string;
  value: string;
  monospace?: boolean;
}

function buildFieldHtml(field: ResultField, index: number): string {
  const id = `adl-copy-${index}`;
  return `
    <div class="adl-field">
      <span class="adl-field-label">${escapeHtml(field.label)}</span>
      <div class="ipk-copy-wrap">
        <input
          type="text"
          class="adl-field-value${field.monospace ? " adl-mono" : ""}"
          readonly
          value="${escapeHtml(field.value)}"
        />
        ${copyButtonHtml(id, `Copy ${field.label}`)}
      </div>
    </div>
  `;
}

function downloadCsv(filename: string, text: string) {
  const bytes = encodeUtf16LeWithBom(text);
  const blob = new Blob([bytes], { type: "text/csv;charset=utf-16le" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function deviceLinkFields(info: DeviceLinkInfo): ResultField[] {
  return [
    { label: "Serial Number", value: info.serialNumber },
    { label: "Manufacturer", value: info.manufacturer },
    { label: "Model", value: info.modelName },
    { label: "SMBIOS UUID", value: info.smbiosUuid, monospace: true },
    { label: "Link ID", value: info.linkId, monospace: true },
    { label: "Device Link Created (UTC)", value: info.deviceLinkCreationTimeUtc },
    { label: "Link ID Created (UTC)", value: info.linkIdCreationTimeUtc },
    { label: "Signing Algorithm", value: info.signingAlgorithm },
    { label: "Signing Key", value: info.signingKeyName },
    { label: "Decoded JSON", value: info.rawJson, monospace: true },
  ];
}

function deviceLinkKeysHtml(info: DeviceLinkInfo): string {
  const keyRows = info.keys
    .map(
      (k) => `
        <tr>
          <td>${escapeHtml(k.keyName)}</td>
          <td>${k.keyType}</td>
          <td class="adl-mono">${escapeHtml(k.keyId)}</td>
          <td>${k.keyPub ? "Yes" : "No"}</td>
        </tr>
      `,
    )
    .join("");
  return `
    <table class="adl-keys">
      <thead><tr><th>Key</th><th>Type</th><th>Key ID</th><th>Public key included</th></tr></thead>
      <tbody>${keyRows}</tbody>
    </table>
  `;
}

function buildResultHtml(info: DeviceLinkInfo, exportId: string): string {
  const fields = deviceLinkFields(info);
  return `
    <div class="adl-result">
      <p class="adl-result-kind">Autopilot DeviceLink</p>
      ${deviceLinkKeysHtml(info)}
      ${fields.map(buildFieldHtml).join("")}
      <button type="button" class="btn btn-primary adl-export" id="${exportId}">⬇️ Export as .devicelink.csv</button>
    </div>
  `;
}

function wireResultFieldsAndExport(resultEl: HTMLElement, info: DeviceLinkInfo, exportId: string) {
  const fields = deviceLinkFields(info);
  resultEl.querySelectorAll<HTMLButtonElement>(".ipk-copy-btn").forEach((btn, i) => {
    wireCopyButton(btn, () => fields[i].value);
  });
  resultEl.querySelector<HTMLButtonElement>(`#${exportId}`)?.addEventListener("click", () => {
    downloadCsv(deviceLinkCsvFilename(info), buildDeviceLinkCsvText(info));
  });
}

const tool: ToolDefinition = {
  id: "autopilot-devicelink",
  name: "Autopilot DeviceLink Decoder",
  description:
    "Paste a scanned Autopilot Device Preparation DeviceLink QR payload or the contents of a .devicelink.csv bulk-import file and decode it into device/key details, with a .devicelink.csv export - decoded entirely in your browser.",
  category: "Converters",
  keywords: [
    "autopilot",
    "device preparation",
    "devicelink",
    "device link",
    "csv",
    "bulk import",
    "decoder",
    "qr code",
    "windows autopilot",
  ],
  icon: "🔗",
  mount(container) {
    container.innerHTML = `
      <div class="adl-tool">
        <p class="adl-note">
          Nothing leaves your browser - decoding happens entirely on this device and nothing is uploaded anywhere.
        </p>
        <p class="adl-note">
          You can also scan a DeviceLink QR code directly with the <a href="#/tool/qr-scanner">QR Code Scanner</a>
          tool, which decodes it the same way.
        </p>

        <div class="adl-input-row">
          <label class="btn" for="adl-file">📂 Upload .devicelink.csv file</label>
          <input type="file" id="adl-file" accept=".csv,text/csv" hidden />
          <button type="button" class="btn" id="adl-clear">Clear</button>
        </div>

        <label class="adl-label" for="adl-input">
          DeviceLink QR payload (<code>deviceLink:/1/?...</code>) or .devicelink.csv content
        </label>
        <textarea
          id="adl-input"
          class="adl-raw"
          rows="6"
          placeholder="devicelink:/1/?sn=...&amp;data=...&#10;&#10;or paste the contents of a .devicelink.csv file"
        ></textarea>

        <p class="adl-warning" id="adl-error" role="alert" hidden></p>

        <div class="adl-results" id="adl-results"></div>
      </div>
    `;

    const fileInput = container.querySelector<HTMLInputElement>("#adl-file")!;
    const clearBtn = container.querySelector<HTMLButtonElement>("#adl-clear")!;
    const input = container.querySelector<HTMLTextAreaElement>("#adl-input")!;
    const errorEl = container.querySelector<HTMLParagraphElement>("#adl-error")!;
    const resultsEl = container.querySelector<HTMLDivElement>("#adl-results")!;

    function showError(message: string) {
      errorEl.textContent = message;
      errorEl.hidden = false;
    }

    function clearError() {
      errorEl.hidden = true;
      errorEl.textContent = "";
    }

    function renderRowErrors(errors: DeviceLinkCsvRowError[]): string {
      if (errors.length === 0) return "";
      return errors
        .map((e) => `<p class="adl-row-error">⚠️ Line ${e.line}: ${escapeHtml(e.message)}</p>`)
        .join("");
    }

    function renderRecords(records: DeviceLinkInfo[], rowErrorsHtml: string) {
      const exportAllHtml =
        records.length > 1
          ? `<button type="button" class="btn adl-export-all" id="adl-export-all">⬇️ Export all as one .devicelink.csv</button>`
          : "";

      resultsEl.innerHTML =
        rowErrorsHtml +
        records.map((info, i) => buildResultHtml(info, `adl-export-${i}`)).join("") +
        exportAllHtml;

      resultsEl.querySelectorAll<HTMLDivElement>(".adl-result").forEach((resultEl, i) => {
        wireResultFieldsAndExport(resultEl, records[i], `adl-export-${i}`);
      });

      resultsEl.querySelector<HTMLButtonElement>("#adl-export-all")?.addEventListener("click", () => {
        downloadCsv("devicelink-export.csv", buildDeviceLinkCsvTextMulti(records));
      });
    }

    async function decode() {
      clearError();
      resultsEl.innerHTML = "";
      const raw = input.value.trim();
      if (!raw) return;

      if (isDeviceLinkPayload(raw)) {
        const parsed = parseDeviceLinkUrl(raw);
        if (!parsed) {
          showError("This looks like a DeviceLink payload, but the URL couldn't be parsed.");
          return;
        }
        try {
          const info = await decodeDeviceLinkData(parsed.data);
          renderRecords([info], "");
        } catch (err) {
          showError(`Could not decode this device link: ${err instanceof Error ? err.message : String(err)}`);
        }
        return;
      }

      const { records, errors } = parseDeviceLinkCsvText(raw);
      if (records.length === 0 && errors.length === 0) {
        showError("Couldn't recognize this as a DeviceLink payload or a .devicelink.csv file's content.");
        return;
      }
      renderRecords(records, renderRowErrors(errors));
    }

    input.addEventListener("input", () => void decode());

    clearBtn.addEventListener("click", () => {
      input.value = "";
      void decode();
    });

    fileInput.addEventListener("change", async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      input.value = decodeTextFileBytes(await file.arrayBuffer());
      fileInput.value = "";
      void decode();
    });

    void decode();

    return () => {
      // No listeners outlive the container; nothing to clean up.
    };
  },
};

export default tool;
