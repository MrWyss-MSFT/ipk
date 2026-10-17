import "./style.css";
import type { ToolDefinition } from "@/types/tool";
import { copyButtonHtml, wireCopyButton } from "@/app/copy-button";
import { wireGlobalPaste } from "@/app/global-paste";
import { wireFileDrop } from "@/app/file-drop";
import { wireExampleButton } from "@/app/example-button";
import { makePsCommandVariants, psCommandTabsHtml, wirePsCommandTabs } from "@/app/ps-command";
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

/**
 * Undocumented WinRT call behind Autopilot Device Preparation's own DeviceLink export (reverse-engineered
 * from the community `Get-AutopilotDeviceAssociation` script). Calls `ModernDeployment.Autopilot.Core.
 * DeviceLinkUtilities.ExportDeviceLinkInfoCsvAsync` directly via raw COM/WinRT interop - no external tool,
 * just `Add-Type` + `combase.dll` P/Invoke - to produce a real `.devicelink.csv` without running the full
 * `MdmDiagnosticsTool.exe -area Autopilot -cab` collection. Requires an elevated session on a Device
 * Preparation-capable edition (Pro/Enterprise/Education) with a recent-enough build (KB5120998+).
 */
const EXPORT_SCRIPT_SETUP = `# Run elevated, on a Device-Prep-capable edition (Pro/Enterprise/Education).
if (-not ('DeviceLink.Native' -as [type])) {
    Add-Type @'
using System;
using System.IO;
using System.Runtime.InteropServices;

namespace DeviceLink
{
    [ComImport, Guid("6410BEE7-60A9-5627-9EB2-FEDA7518A4EB"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IDeviceLinkUtilities
    {
        [PreserveSig] int GetIids(out int c, out IntPtr p);
        [PreserveSig] int GetRuntimeClassName(out IntPtr n);
        [PreserveSig] int GetTrustLevel(out int l);
        [PreserveSig] int ExportDeviceLinkInfoCsvAsync(IntPtr folder, int format, out IntPtr op); // slot 6
    }
    [ComImport, Guid("00000036-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAsyncInfo
    {
        [PreserveSig] int GetIids(out int c, out IntPtr p);
        [PreserveSig] int GetRuntimeClassName(out IntPtr n);
        [PreserveSig] int GetTrustLevel(out int l);
        [PreserveSig] int get_Id(out uint id);
        [PreserveSig] int get_Status(out int status);
        [PreserveSig] int get_ErrorCode(out int hr);
    }

    public static class Native
    {
        [DllImport("combase.dll")] static extern int RoInitialize(int type);
        [DllImport("combase.dll", CharSet = CharSet.Unicode)] static extern int WindowsCreateString(string s, int len, out IntPtr h);
        [DllImport("combase.dll")] static extern int WindowsDeleteString(IntPtr h);
        [DllImport("combase.dll", CharSet = CharSet.Unicode)] static extern int RoActivateInstance(IntPtr id, out IntPtr inst);

        static void ThrowIfFailed(string op, int hr) { if (hr < 0) throw new Exception(op + " failed (0x" + hr.ToString("X8") + ")"); }

        public static string ExportCsv(string folder, int timeoutSec = 30)
        {
            RoInitialize(1);
            const string className = "ModernDeployment.Autopilot.Core.DeviceLinkUtilities";
            IntPtr hClass; ThrowIfFailed("WindowsCreateString(class)",
                WindowsCreateString(className, className.Length, out hClass));
            IntPtr inst; int hr = RoActivateInstance(hClass, out inst); WindowsDeleteString(hClass);
            ThrowIfFailed("RoActivateInstance", hr);
            var dlu = (IDeviceLinkUtilities)Marshal.GetObjectForIUnknown(inst);

            IntPtr hFolder; ThrowIfFailed("WindowsCreateString(folder)",
                WindowsCreateString(folder, folder.Length, out hFolder));
            IntPtr op; ThrowIfFailed("ExportDeviceLinkInfoCsvAsync",
                dlu.ExportDeviceLinkInfoCsvAsync(hFolder, 33 /* Json|Base64 */, out op)); // format 33 matches the OOBE export
            WindowsDeleteString(hFolder);

            var asyncInfo = (IAsyncInfo)Marshal.GetObjectForIUnknown(op);
            var deadline = DateTime.UtcNow.AddSeconds(timeoutSec);
            int status;
            do
            {
                System.Threading.Thread.Sleep(250);
                ThrowIfFailed("get_Status", asyncInfo.get_Status(out status));
                if (DateTime.UtcNow > deadline) throw new Exception("Export timed out.");
            } while (status == 0); // 0 = Started

            if (status != 1) // 1 = Completed
            {
                int errorCode; asyncInfo.get_ErrorCode(out errorCode);
                throw new Exception("Export failed, status " + status + " (0x" + errorCode.ToString("X8") + ")");
            }

            string newest = null; DateTime newestTime = DateTime.MinValue;
            foreach (var f in Directory.GetFiles(folder, "*.devicelink.csv"))
            {
                var t = File.GetLastWriteTimeUtc(f);
                if (t >= newestTime) { newestTime = t; newest = f; }
            }
            if (newest == null) throw new Exception("Export completed but no *.devicelink.csv found in " + folder);
            return newest;
        }
    }
}
'@
}

$folder = "$env:ProgramData\\DeviceLink"
New-Item -ItemType Directory -Path $folder -Force | Out-Null

$csvPath = [DeviceLink.Native]::ExportCsv($folder)
Write-Host "Exported: $csvPath"
`;
const EXPORT_SCRIPT_VARIANTS = makePsCommandVariants("Get-Content -Raw $csvPath", { setup: EXPORT_SCRIPT_SETUP });

/** A made-up but structurally valid record, rendered to `.devicelink.csv` text for the "Load example" button. */
const EXAMPLE_DEVICELINK_INFO: DeviceLinkInfo = {
  version: "1.0",
  deviceLinkCreationTimeUtc: "2024-01-01T00:00:00Z",
  serialNumber: "IPK1234567",
  manufacturer: "IPK - IT Pro Kit",
  modelName: "IPK IT Pro Kit Device",
  smbiosUuid: "12345678-1234-1234-1234-123456789012",
  linkId: "87654321-4321-4321-4321-210987654321",
  linkIdCreationTimeUtc: "2024-01-01T00:00:00Z",
  keys: [
    { keyName: "DeviceKey", keyId: "0123456789abcdef0123456789abcdef", keyType: 1, keyPub: "SGVsbG8gZnJvbSBJUEs=" },
  ],
  signingAlgorithm: "RS256",
  signingKeyName: "DeviceKey",
  signature: "SGVsbG8gZnJvbSBJUEsgLSBJVCBQcm8gS2l0IQ==",
  signaturePssHashAlgorithm: "SHA256",
  signaturePssSaltLength: 32,
  rawJson: "",
};

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
    "Paste a scanned Autopilot Device Preparation DeviceLink QR payload or the contents of a .devicelink.csv bulk-import file and decode it into device/key details, with a .devicelink.csv export.",
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
    "drag and drop",
  ],
  icon: "🔗",
  mount(container) {
    container.innerHTML = `
      <div class="adl-tool">
        <p class="adl-step-label">
          1. Get the DeviceLink
          <span class="ipk-step-note">
            with the <a class="btn" href="#/tool/qr-scanner">📷 QR Code Scanner</a> tool,
            <label class="btn" for="adl-file">📂 Upload</label>
            <input type="file" id="adl-file" accept=".csv,text/csv" hidden />
            or drop the .devicelink.csv file, or paste anywhere on the page
          </span>
        </p>
        <div class="ipk-field-header">
          <label class="adl-input-label" for="adl-input">DeviceLink URL or .devicelink.csv contents</label>
          <button type="button" class="btn ipk-example-btn" id="adl-example">Load example</button>
        </div>
        <textarea
          id="adl-input"
          class="adl-raw"
          rows="6"
          placeholder="devicelink:/1/?sn=...&amp;data=...&#10;&#10;or paste the contents of a .devicelink.csv file"
        ></textarea>

        <p class="adl-error" id="adl-error" role="alert" hidden></p>

        <div class="adl-results" id="adl-results"></div>

        <details class="adl-script-example">
          <summary>
            <span class="adl-script-summary-text">
              Example: export a .devicelink.csv in PowerShell
              <span
                class="ipk-stage-badge ipk-stage-alpha"
                title="This script is alpha - still under active work, rough edges and missing features are expected."
                >alpha</span
              >
            </span>
          </summary>
          <p class="adl-script-attribution">
            Approach derived from Rudy Ooms' (call4cloud)
            <a href="https://www.powershellgallery.com/packages/Get-AutopilotDeviceAssociation" target="_blank" rel="noopener">Get-AutopilotDeviceAssociation</a>
            module.
          </p>
          <p class="adl-script-note ipk-hint">
            Calls the undocumented <code>ModernDeployment.Autopilot.Core.DeviceLinkUtilities</code> WinRT
            class directly (no external tool) to export a real <code>.devicelink.csv</code> without running
            the full <code>MdmDiagnosticsTool.exe -area Autopilot -cab</code> collection. Needs an elevated
            session on a Device Preparation-capable edition (Pro/Enterprise/Education) with KB5120998+.
          </p>
          ${psCommandTabsHtml("adl-script", { requiresAdmin: true })}
        </details>
      </div>
    `;

    const fileInput = container.querySelector<HTMLInputElement>("#adl-file")!;
    const input = container.querySelector<HTMLTextAreaElement>("#adl-input")!;
    const errorEl = container.querySelector<HTMLParagraphElement>("#adl-error")!;
    const resultsEl = container.querySelector<HTMLDivElement>("#adl-results")!;

    const unwireScriptTabs = wirePsCommandTabs(container, "adl-script", EXPORT_SCRIPT_VARIANTS);

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
    const unwireGlobalPaste = wireGlobalPaste(input);

    const exampleBtn = container.querySelector<HTMLButtonElement>("#adl-example")!;
    const unwireExample = wireExampleButton(exampleBtn, input, () => buildDeviceLinkCsvText(EXAMPLE_DEVICELINK_INFO));

    // Setting .value programmatically doesn't fire a native "input" event, which is what both
    // our own listener above and the generic sessionStorage persistence (wired in layout.ts) rely
    // on - dispatch one explicitly so file-loaded content decodes and survives switching tools/apps.
    async function loadFile(file: File) {
      input.value = decodeTextFileBytes(await file.arrayBuffer());
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }

    fileInput.addEventListener("change", async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      await loadFile(file);
      fileInput.value = "";
    });
    const unwireFileDrop = wireFileDrop(container.querySelector<HTMLElement>(".adl-tool")!, (file) =>
      void loadFile(file),
    );

    void decode();

    return () => {
      unwireGlobalPaste();
      unwireFileDrop();
      unwireExample();
      unwireScriptTabs();
    };
  },
};

export default tool;
