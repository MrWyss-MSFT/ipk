import "./style.css";
import type { ToolDefinition } from "@/types/tool";
import { copyButtonHtml, wireCopyButton } from "@/app/copy-button";
import { decodeFrame } from "./decode";
import { parseQrPayload } from "./parse";
import {
  decodeDeviceLinkData,
  buildDeviceLinkCsvText,
  encodeUtf16LeWithBom,
  deviceLinkCsvFilename,
  type DeviceLinkInfo,
} from "@/app/devicelink";

type CaptureMode = "screen" | "camera";

const DEFAULT_PLACEHOLDER_TEXT = "Pick a capture source, then press Start to scan for a QR code.";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

interface ResultField {
  label: string;
  value: string;
  monospace?: boolean;
}

function buildFieldHtml(field: ResultField, index: number): string {
  const id = `qrs-copy-${index}`;
  return `
    <div class="qrs-field">
      <span class="qrs-field-label">${escapeHtml(field.label)}</span>
      <div class="ipk-copy-wrap">
        <input
          type="text"
          class="qrs-field-value${field.monospace ? " qrs-mono" : ""}"
          readonly
          value="${escapeHtml(field.value)}"
        />
        ${copyButtonHtml(id, `Copy ${field.label}`)}
      </div>
    </div>
  `;
}

const tool: ToolDefinition = {
  id: "qr-scanner",
  name: "QR Code Scanner",
  description:
    "Scan a QR code from your screen (e.g. a TOTP/MFA setup code shown in a remote session) or a webcam - decoded entirely in your browser, nothing is uploaded anywhere.",
  category: "Utilities",
  keywords: ["qr", "qr code", "scanner", "screen capture", "screen share", "camera", "webcam", "totp", "mfa", "2fa", "wifi qr", "barcode"],
  icon: "📷",
  mount(container) {
    const mediaDevicesSupported = typeof navigator !== "undefined" && !!navigator.mediaDevices;
    const screenSupported = mediaDevicesSupported && typeof navigator.mediaDevices.getDisplayMedia === "function";
    const cameraSupported = mediaDevicesSupported && typeof navigator.mediaDevices.getUserMedia === "function";
    const secureContext = typeof window !== "undefined" && window.isSecureContext;

    container.innerHTML = `
      <div class="qrs-tool">
        <p class="qrs-note">
          Nothing leaves your browser - the captured frame is decoded entirely on this device and is never uploaded
          anywhere. When scanning your screen, the browser will show its own sharing indicator; that's normal.
        </p>

        <div class="qrs-formats">
          <p class="qrs-formats-title">What it can decode</p>
          <ul class="qrs-formats-list">
            <li><strong>Links</strong> - any <code>http(s)://</code> URL, shown as a clickable link.</li>
            <li><strong>Wi-Fi networks</strong> - the standard <code>WIFI:T:...;S:...;P:...;;</code> QR format, parsed into SSID, password and security type.</li>
            <li><strong>TOTP / authenticator setup codes</strong> - <code>otpauth://totp/...</code> codes, parsed into issuer, account and secret.</li>
            <li><strong>Autopilot Device Preparation DeviceLink</strong> - <code>deviceLink:/1/?sn=...&amp;data=...</code> codes, decoded into device/key details with a <code>.devicelink.csv</code> export.</li>
            <li><strong>Plain text</strong> - anything else is shown as-is.</li>
          </ul>
        </div>

        <div class="qrs-mode-toggle" role="group" aria-label="Capture source">
          <button type="button" class="btn qrs-mode-btn" data-mode="screen" ${screenSupported ? "" : "disabled"}>
            🖥️ Screen
          </button>
          <button type="button" class="btn qrs-mode-btn" data-mode="camera" ${cameraSupported ? "" : "disabled"}>
            📷 Camera
          </button>
        </div>

        <div class="qrs-camera-picker" id="qrs-camera-picker" hidden>
          <label for="qrs-camera-select">Camera</label>
          <select class="qrs-camera-select" id="qrs-camera-select">
            <option value="">Default camera</option>
          </select>
        </div>

        <div class="qrs-panel">
          <video class="qrs-video" id="qrs-video" playsinline muted hidden></video>
          <p class="qrs-placeholder" id="qrs-placeholder">${DEFAULT_PLACEHOLDER_TEXT}</p>
          <canvas class="qrs-canvas" id="qrs-canvas" hidden></canvas>
        </div>

        <div class="qrs-controls">
          <button type="button" class="btn btn-primary" id="qrs-start">Start scanning</button>
          <button type="button" class="btn" id="qrs-stop" hidden>Stop</button>
          <span class="qrs-status" id="qrs-status"></span>
        </div>

        <p class="qrs-warning" id="qrs-error" role="alert" hidden></p>

        <div class="qrs-result" id="qrs-result" hidden></div>
      </div>
    `;

    const videoEl = container.querySelector<HTMLVideoElement>("#qrs-video")!;
    const placeholderEl = container.querySelector<HTMLParagraphElement>("#qrs-placeholder")!;
    const canvasEl = container.querySelector<HTMLCanvasElement>("#qrs-canvas")!;
    const startBtn = container.querySelector<HTMLButtonElement>("#qrs-start")!;
    const stopBtn = container.querySelector<HTMLButtonElement>("#qrs-stop")!;
    const statusEl = container.querySelector<HTMLSpanElement>("#qrs-status")!;
    const errorEl = container.querySelector<HTMLParagraphElement>("#qrs-error")!;
    const resultEl = container.querySelector<HTMLDivElement>("#qrs-result")!;
    const modeButtons = Array.from(container.querySelectorAll<HTMLButtonElement>(".qrs-mode-btn"));
    const cameraPickerEl = container.querySelector<HTMLDivElement>("#qrs-camera-picker")!;
    const cameraSelectEl = container.querySelector<HTMLSelectElement>("#qrs-camera-select")!;

    const ctx = canvasEl.getContext("2d", { willReadFrequently: true });

    let mode: CaptureMode = screenSupported ? "screen" : "camera";
    let stream: MediaStream | null = null;
    let scanTimer: number | undefined;
    let decoding = false;
    let active = false;
    let preferredCameraId = "";

    function showError(message: string) {
      errorEl.textContent = message;
      errorEl.hidden = false;
    }

    function clearError() {
      errorEl.hidden = true;
      errorEl.textContent = "";
    }

    function setStatus(message: string) {
      statusEl.textContent = message;
    }

    function updateStartLabel() {
      startBtn.textContent =
        mode === "screen" ? "Start scanning (pick a screen or window)" : "Start scanning (pick a camera)";
    }

    function setMode(next: CaptureMode) {
      mode = next;
      modeButtons.forEach((btn) => btn.classList.toggle("is-active", btn.dataset.mode === next));
      cameraPickerEl.hidden = next !== "camera" || !cameraSupported;
      updateStartLabel();
    }

    async function refreshCameraDevices(selectDeviceId?: string) {
      if (!mediaDevicesSupported || typeof navigator.mediaDevices.enumerateDevices !== "function") return;
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const cams = devices.filter((d) => d.kind === "videoinput");
        if (cams.length === 0) return;
        cameraSelectEl.innerHTML = cams
          .map((d, i) => `<option value="${escapeHtml(d.deviceId)}">${escapeHtml(d.label || `Camera ${i + 1}`)}</option>`)
          .join("");
        const toSelect = selectDeviceId ?? preferredCameraId;
        if (toSelect && cams.some((d) => d.deviceId === toSelect)) {
          cameraSelectEl.value = toSelect;
        }
        preferredCameraId = cameraSelectEl.value;
      } catch {
        // Ignore - keep whatever options are already shown.
      }
    }

    async function switchCamera(deviceId: string) {
      if (!stream) return;
      clearError();
      try {
        const newStream = await navigator.mediaDevices.getUserMedia({
          video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: "environment" },
        });
        stream.getTracks().forEach((track) => track.stop());
        stream = newStream;
        videoEl.srcObject = stream;
        await videoEl.play().catch(() => undefined);
        stream.getVideoTracks()[0]?.addEventListener("ended", () => {
          if (active) {
            setStatus("Capture ended.");
            stopStream();
          }
        });
      } catch (err) {
        showError(`Could not switch camera: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    function stopStream() {
      if (scanTimer !== undefined) {
        window.clearInterval(scanTimer);
        scanTimer = undefined;
      }
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
        stream = null;
      }
      videoEl.hidden = true;
      videoEl.srcObject = null;
      placeholderEl.hidden = false;
      active = false;
      startBtn.hidden = false;
      stopBtn.hidden = true;
      modeButtons.forEach((btn) => {
        btn.disabled = btn.dataset.mode === "screen" ? !screenSupported : !cameraSupported;
      });
    }

    async function scanTick() {
      if (!active || decoding || !stream || !ctx) return;
      const w = videoEl.videoWidth;
      const h = videoEl.videoHeight;
      if (!w || !h) return;
      decoding = true;
      try {
        canvasEl.width = w;
        canvasEl.height = h;
        ctx.drawImage(videoEl, 0, 0, w, h);
        const text = await decodeFrame(canvasEl, ctx);
        if (text) {
          setStatus("QR code found!");
          void renderResult(text);
          stopStream();
          placeholderEl.textContent = "✅ QR code found — see the result below.";
        }
      } catch {
        // Ignore a transient decode error for this frame - keep scanning.
      } finally {
        decoding = false;
      }
    }

    async function startScan() {
      clearError();
      resultEl.hidden = true;
      resultEl.innerHTML = "";
      placeholderEl.textContent = DEFAULT_PLACEHOLDER_TEXT;

      if (!secureContext) {
        showError("Screen/camera capture requires a secure context (HTTPS or localhost).");
        return;
      }
      if (!ctx) {
        showError("Could not create a 2D canvas context in this browser.");
        return;
      }

      try {
        if (mode === "screen") {
          if (!screenSupported) throw new Error("Screen capture isn't supported in this browser.");
          stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        } else {
          if (!cameraSupported) throw new Error("Camera access isn't supported in this browser.");
          stream = await navigator.mediaDevices.getUserMedia({
            video: preferredCameraId ? { deviceId: { exact: preferredCameraId } } : { facingMode: "environment" },
          });
        }
      } catch (err) {
        showError(`Could not start capture: ${err instanceof Error ? err.message : String(err)}`);
        return;
      }

      if (mode === "camera") {
        const activeDeviceId = stream.getVideoTracks()[0]?.getSettings().deviceId;
        void refreshCameraDevices(activeDeviceId);
      }

      videoEl.srcObject = stream;
      await videoEl.play().catch(() => undefined);
      videoEl.hidden = false;
      placeholderEl.hidden = true;
      active = true;
      startBtn.hidden = true;
      stopBtn.hidden = false;
      modeButtons.forEach((btn) => (btn.disabled = true));
      setStatus("Scanning…");

      // If the user stops sharing via the browser's own UI, reflect that here too.
      stream.getVideoTracks()[0]?.addEventListener("ended", () => {
        if (active) {
          setStatus("Capture ended.");
          stopStream();
        }
      });

      scanTimer = window.setInterval(() => void scanTick(), 250);
    }

    function renderFields(kindLabel: string, extraHtml: string, fields: ResultField[]) {
      resultEl.innerHTML = `
        <p class="qrs-result-kind">${escapeHtml(kindLabel)}</p>
        ${extraHtml}
        ${fields.map(buildFieldHtml).join("")}
      `;
      resultEl.hidden = false;

      resultEl.querySelectorAll<HTMLButtonElement>(".ipk-copy-btn").forEach((btn, i) => {
        wireCopyButton(btn, () => fields[i].value);
      });
    }

    function downloadDeviceLinkCsv(info: DeviceLinkInfo) {
      const bytes = encodeUtf16LeWithBom(buildDeviceLinkCsvText(info));
      const blob = new Blob([bytes], { type: "text/csv;charset=utf-16le" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = deviceLinkCsvFilename(info);
      link.click();
      URL.revokeObjectURL(url);
    }

    function deviceLinkExtraHtml(info: DeviceLinkInfo): string {
      const keyRows = info.keys
        .map(
          (k) => `
            <tr>
              <td>${escapeHtml(k.keyName)}</td>
              <td>${k.keyType}</td>
              <td class="qrs-mono">${escapeHtml(k.keyId)}</td>
              <td>${k.keyPub ? "Yes" : "No"}</td>
            </tr>
          `,
        )
        .join("");
      const missingPubKeyNote = info.keys.some((k) => !k.keyPub)
        ? `<p class="qrs-note qrs-devicelink-note">
            Note: the scanned QR code doesn't include every key's public key (e.g. the endorsement key) to save
            space, so the exported CSV omits it too - Windows' own export includes it from data already on the
            device.
          </p>`
        : "";
      return `
        <table class="qrs-devicelink-keys">
          <thead><tr><th>Key</th><th>Type</th><th>Key ID</th><th>Public key included</th></tr></thead>
          <tbody>${keyRows}</tbody>
        </table>
        ${missingPubKeyNote}
        <button type="button" class="btn btn-primary qrs-devicelink-export" id="qrs-devicelink-export">
          ⬇️ Export as .devicelink.csv
        </button>
      `;
    }

    async function renderResult(raw: string) {
      const parsed = parseQrPayload(raw);

      if (parsed.kind === "url") {
        renderFields(
          "Link",
          `<p class="qrs-link"><a href="${escapeHtml(parsed.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(
            parsed.url,
          )}</a></p>`,
          [{ label: "Raw decoded text", value: raw, monospace: true }],
        );
        return;
      }

      if (parsed.kind === "wifi") {
        const fields: ResultField[] = [{ label: "SSID", value: parsed.ssid || "(empty)" }];
        if (parsed.password) fields.push({ label: "Password", value: parsed.password });
        if (parsed.authType) fields.push({ label: "Security", value: parsed.authType });
        fields.push({ label: "Raw decoded text", value: raw, monospace: true });
        renderFields("Wi-Fi network", "", fields);
        return;
      }

      if (parsed.kind === "totp") {
        const fields: ResultField[] = [];
        if (parsed.issuer) fields.push({ label: "Issuer", value: parsed.issuer });
        if (parsed.account) fields.push({ label: "Account", value: parsed.account });
        if (parsed.secret) fields.push({ label: "Secret", value: parsed.secret, monospace: true });
        fields.push({ label: "Raw decoded text", value: raw, monospace: true });
        renderFields("TOTP / authenticator", "", fields);
        return;
      }

      if (parsed.kind === "deviceLink") {
        renderFields("Autopilot DeviceLink", "<p>Decoding device link…</p>", [
          { label: "Raw decoded text", value: raw, monospace: true },
        ]);
        try {
          const info = await decodeDeviceLinkData(parsed.data);
          renderFields("Autopilot DeviceLink", deviceLinkExtraHtml(info), [
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
            { label: "Raw decoded text", value: raw, monospace: true },
          ]);
          container.querySelector<HTMLButtonElement>("#qrs-devicelink-export")?.addEventListener("click", () => {
            downloadDeviceLinkCsv(info);
          });
        } catch (err) {
          renderFields("Autopilot DeviceLink", "", [
            { label: "Error", value: `Could not decode this device link: ${err instanceof Error ? err.message : String(err)}` },
            { label: "Raw decoded text", value: raw, monospace: true },
          ]);
        }
        return;
      }

      renderFields("Text", "", [{ label: "Raw decoded text", value: raw, monospace: true }]);
    }

    setMode(mode);
    if (!screenSupported && !cameraSupported) {
      startBtn.disabled = true;
      showError("Neither screen capture nor camera access is supported in this browser.");
    } else if (!secureContext) {
      startBtn.disabled = true;
      showError("Screen/camera capture requires a secure context (HTTPS or localhost).");
    }

    modeButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        if (active || btn.disabled) return;
        setMode(btn.dataset.mode as CaptureMode);
      });
    });

    cameraSelectEl.addEventListener("change", () => {
      preferredCameraId = cameraSelectEl.value;
      if (active && mode === "camera") {
        void switchCamera(preferredCameraId);
      }
    });

    // If camera permission was already granted on a previous visit, this will
    // populate real device labels without prompting again.
    if (cameraSupported) void refreshCameraDevices();

    startBtn.addEventListener("click", () => void startScan());
    stopBtn.addEventListener("click", () => {
      setStatus("Stopped.");
      stopStream();
    });

    return () => {
      stopStream();
    };
  },
};

export default tool;
