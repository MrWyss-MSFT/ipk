import "./style.css";
import type { ToolDefinition } from "@/types/tool";
import { copyButtonHtml, wireCopyButton } from "@/app/copy-button";
import { decodeFrame } from "./decode";
import { parseQrPayload } from "./parse";
import { QR_EXAMPLES } from "./examples";
import {
  decodeDeviceLinkData,
  buildDeviceLinkCsvText,
  buildDeviceLinkCsvTextMulti,
  encodeUtf16LeWithBom,
  deviceLinkCsvFilename,
  type DeviceLinkInfo,
} from "@/app/devicelink";

type CaptureMode = "screen" | "camera";

const PLACEHOLDER_TEXT: Record<CaptureMode, string> = {
  screen: "Press Start scanning, then pick a screen or window to share - your browser will prompt you.",
  camera: "Press Start scanning, then allow camera access when your browser asks - this also fills in the camera list below.",
};

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

function buildFieldHtml(field: ResultField, id: string): string {
  return `
    <div class="qrs-field">
      <span class="qrs-field-label ipk-field-label">${escapeHtml(field.label)}</span>
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

/** Shortens a long string for a one-line summary-row preview. */
function truncate(value: string, max = 70): string {
  const flat = value.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/** A single row in the (potentially multi-result) result list - a collapsible `<details>` with a live-updatable summary/body. */
interface ResultRow {
  el: HTMLDetailsElement;
  /** Updates the one-line summary shown when collapsed. */
  setSummary(kindLabel: string, preview: string): void;
  /** Replaces the row's expanded body content, rewiring any copy buttons inside it. */
  setBody(extraHtml: string, fields: ResultField[]): void;
}

const tool: ToolDefinition = {
  id: "qr-scanner",
  name: "QR Code Scanner",
  description:
    "Scan a QR code from your screen (e.g. a TOTP/MFA setup code shown in a remote session) or a webcam - nothing is uploaded anywhere.",
  category: "Utilities",
  keywords: ["qr", "qr code", "scanner", "screen capture", "screen share", "camera", "webcam", "totp", "mfa", "2fa", "wifi qr", "barcode"],
  icon: "📷",
  mount(container) {
    const mediaDevicesSupported = typeof navigator !== "undefined" && !!navigator.mediaDevices;
    const screenSupported = mediaDevicesSupported && typeof navigator.mediaDevices.getDisplayMedia === "function";
    const cameraSupported = mediaDevicesSupported && typeof navigator.mediaDevices.getUserMedia === "function";
    const secureContext = typeof window !== "undefined" && window.isSecureContext;
    const initialMode: CaptureMode = screenSupported ? "screen" : "camera";

    container.innerHTML = `
      <div class="qrs-tool">
        <p class="qrs-note ipk-hint">
          When scanning your screen, the browser will show its own sharing indicator; that's normal.
        </p>

        <div class="qrs-mode-toggle" role="group" aria-label="Capture source">
          <button type="button" class="btn qrs-mode-btn" data-mode="screen" ${screenSupported ? "" : "disabled"}>
            🖥️ Screen
          </button>
          <button type="button" class="btn qrs-mode-btn" data-mode="camera" ${cameraSupported ? "" : "disabled"}>
            📷 Camera
          </button>
          <button type="button" class="btn btn-primary" id="qrs-start">Start scanning</button>
          <button type="button" class="btn" id="qrs-stop" hidden>Stop</button>
          <span class="qrs-status" id="qrs-status"></span>
        </div>

        <div class="qrs-options" role="group" aria-label="Scanning options">
          <label class="qrs-checkbox-label">
            <input type="checkbox" id="qrs-continuous" />
            Continuous scanning <span class="ipk-step-note">(keep scanning, add every code found to a list)</span>
          </label>
          <label class="qrs-checkbox-label">
            <input type="checkbox" id="qrs-beep" checked />
            🔊 Beep on scan
          </label>
        </div>

        <div class="qrs-formats">
          <p class="qrs-formats-title">
            Decodes: <strong>Autopilot DeviceLink</strong>, Links, Wi-Fi networks, TOTP / authenticator codes, Plain text.
          </p>

          <details class="qrs-examples">
            <summary class="qrs-examples-summary">Try example QR codes</summary>
            <div class="qrs-examples-body">
              <div class="qrs-example-qr" id="qrs-example-qr"></div>
              <div class="qrs-example-nav">
                <button type="button" class="btn" id="qrs-example-prev">◀ Previous</button>
                <span class="qrs-example-label" id="qrs-example-label"></span>
                <button type="button" class="btn" id="qrs-example-next">Next ▶</button>
              </div>
            </div>
          </details>
        </div>

        <div class="qrs-camera-picker" id="qrs-camera-picker" hidden>
          <label for="qrs-camera-select">Camera</label>
          <select class="qrs-camera-select" id="qrs-camera-select">
            <option value="">Default camera</option>
          </select>
        </div>

        <div class="qrs-panel">
          <video class="qrs-video" id="qrs-video" playsinline muted hidden></video>
          <p class="qrs-placeholder" id="qrs-placeholder">${PLACEHOLDER_TEXT[initialMode]}</p>
          <canvas class="qrs-canvas" id="qrs-canvas" hidden></canvas>
        </div>

        <p class="qrs-warning" id="qrs-error" role="alert" hidden></p>

        <div class="qrs-result-panel" id="qrs-result-panel" hidden>
          <div class="qrs-result-panel-header">
            <span class="qrs-result-count" id="qrs-result-count"></span>
            <div class="qrs-result-panel-actions">
              <button type="button" class="btn" id="qrs-export-devicelinks" hidden>⬇️ Export all DeviceLinks as .csv</button>
              <button type="button" class="btn" id="qrs-clear-list" hidden>Clear list</button>
            </div>
          </div>
          <div class="qrs-result-list" id="qrs-result-list"></div>
        </div>
      </div>
    `;

    const videoEl = container.querySelector<HTMLVideoElement>("#qrs-video")!;
    const placeholderEl = container.querySelector<HTMLParagraphElement>("#qrs-placeholder")!;
    const canvasEl = container.querySelector<HTMLCanvasElement>("#qrs-canvas")!;
    const startBtn = container.querySelector<HTMLButtonElement>("#qrs-start")!;
    const stopBtn = container.querySelector<HTMLButtonElement>("#qrs-stop")!;
    const statusEl = container.querySelector<HTMLSpanElement>("#qrs-status")!;
    const errorEl = container.querySelector<HTMLParagraphElement>("#qrs-error")!;
    const modeButtons = Array.from(container.querySelectorAll<HTMLButtonElement>(".qrs-mode-btn"));
    const cameraPickerEl = container.querySelector<HTMLDivElement>("#qrs-camera-picker")!;
    const cameraSelectEl = container.querySelector<HTMLSelectElement>("#qrs-camera-select")!;
    const continuousCheckbox = container.querySelector<HTMLInputElement>("#qrs-continuous")!;
    const beepCheckbox = container.querySelector<HTMLInputElement>("#qrs-beep")!;
    const resultPanelEl = container.querySelector<HTMLDivElement>("#qrs-result-panel")!;
    const resultListEl = container.querySelector<HTMLDivElement>("#qrs-result-list")!;
    const resultCountEl = container.querySelector<HTMLSpanElement>("#qrs-result-count")!;
    const clearListBtn = container.querySelector<HTMLButtonElement>("#qrs-clear-list")!;
    const exportDeviceLinksBtn = container.querySelector<HTMLButtonElement>("#qrs-export-devicelinks")!;
    const exampleQrEl = container.querySelector<HTMLDivElement>("#qrs-example-qr")!;
    const exampleLabelEl = container.querySelector<HTMLSpanElement>("#qrs-example-label")!;
    const examplePrevBtn = container.querySelector<HTMLButtonElement>("#qrs-example-prev")!;
    const exampleNextBtn = container.querySelector<HTMLButtonElement>("#qrs-example-next")!;

    const ctx = canvasEl.getContext("2d", { willReadFrequently: true });

    let mode: CaptureMode = initialMode;
    let stream: MediaStream | null = null;
    let scanTimer: number | undefined;
    let decoding = false;
    let active = false;
    let preferredCameraId = "";
    let lastDecodedText: string | null = null;
    let rowCounter = 0;
    let audioCtx: AudioContext | null = null;
    let exampleIndex = 0;
    const scannedDeviceLinks: DeviceLinkInfo[] = [];

    function showExample(index: number) {
      exampleIndex = ((index % QR_EXAMPLES.length) + QR_EXAMPLES.length) % QR_EXAMPLES.length;
      const example = QR_EXAMPLES[exampleIndex];
      exampleQrEl.innerHTML = example.svg;
      exampleLabelEl.textContent = `${exampleIndex + 1} of ${QR_EXAMPLES.length} — ${example.label}`;
    }


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

    function setMode(next: CaptureMode) {
      mode = next;
      modeButtons.forEach((btn) => btn.classList.toggle("is-active", btn.dataset.mode === next));
      cameraPickerEl.hidden = next !== "camera" || !cameraSupported;
      if (!active) placeholderEl.textContent = PLACEHOLDER_TEXT[next];
    }

    /** Short synthesized tone on every successful decode - no audio file, no network, gated on the "Beep on scan" checkbox. */
    function playBeep() {
      if (!beepCheckbox.checked) return;
      try {
        const AudioCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtor) return;
        if (!audioCtx) audioCtx = new AudioCtor();
        if (audioCtx.state === "suspended") void audioCtx.resume();
        // Mimic a classic handheld barcode scanner: a short, sharp, high-pitched square-wave blip.
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = "square";
        osc.frequency.value = 2800;
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.2, now + 0.005);
        gain.gain.setValueAtTime(0.2, now + 0.06);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
        osc.connect(gain).connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.09);
      } catch {
        // Beep is a nice-to-have - never let an audio error interrupt scanning.
      }
    }

    function updateResultCount() {
      const count = resultListEl.children.length;
      resultCountEl.textContent = count === 1 ? "1 result" : `${count} results`;
      clearListBtn.hidden = count === 0;
      exportDeviceLinksBtn.hidden = scannedDeviceLinks.length === 0;
    }

    function clearResultList() {
      resultListEl.innerHTML = "";
      resultPanelEl.hidden = true;
      lastDecodedText = null;
      scannedDeviceLinks.length = 0;
      updateResultCount();
    }

    /** Appends a new collapsible row to the result list and returns handles to update its summary/body live. */
    function createResultRow(autoOpen: boolean): ResultRow {
      rowCounter += 1;
      const rowId = rowCounter;
      const details = document.createElement("details");
      details.className = "qrs-result-item";
      details.open = autoOpen;
      details.innerHTML = `
        <summary class="qrs-result-summary">
          <span class="qrs-result-kind" data-role="kind">Result</span>
          <span class="qrs-result-preview" data-role="preview"></span>
          <span class="qrs-result-time">${new Date().toLocaleTimeString()}</span>
        </summary>
        <div class="qrs-result-body" data-role="body"></div>
      `;
      resultListEl.appendChild(details);
      resultPanelEl.hidden = false;
      updateResultCount();

      const kindEl = details.querySelector<HTMLElement>('[data-role="kind"]')!;
      const previewEl = details.querySelector<HTMLElement>('[data-role="preview"]')!;
      const bodyEl = details.querySelector<HTMLElement>('[data-role="body"]')!;

      return {
        el: details,
        setSummary(kindLabel, preview) {
          kindEl.textContent = kindLabel;
          previewEl.textContent = preview;
        },
        setBody(extraHtml, fields) {
          bodyEl.innerHTML = `${extraHtml}${fields.map((f, i) => buildFieldHtml(f, `qrs-copy-${rowId}-${i}`)).join("")}`;
          bodyEl.querySelectorAll<HTMLButtonElement>(".ipk-copy-btn").forEach((btn, i) => {
            wireCopyButton(btn, () => fields[i].value);
          });
        },
      };
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
      continuousCheckbox.disabled = false;
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
        const continuous = continuousCheckbox.checked;

        if (!text) {
          // The code (if any) left the frame - clear the dedupe guard so it can be re-added if it reappears.
          lastDecodedText = null;
          return;
        }

        if (continuous) {
          if (text === lastDecodedText) return; // Same code still in view - already recorded this sighting.
          lastDecodedText = text;
          playBeep();
          const row = createResultRow(false);
          void renderResult(text, row);
          setStatus("Scanning… (continuous mode - new code added to the list below)");
          return;
        }

        setStatus("QR code found!");
        playBeep();
        const row = createResultRow(true);
        void renderResult(text, row);
        stopStream();
        placeholderEl.textContent = "✅ QR code found — see the result below.";
      } catch {
        // Ignore a transient decode error for this frame - keep scanning.
      } finally {
        decoding = false;
      }
    }

    async function startScan() {
      clearError();
      placeholderEl.textContent = PLACEHOLDER_TEXT[mode];

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
      continuousCheckbox.disabled = true;
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

    /** Combines every DeviceLink scanned so far (across continuous-mode results) into one `.devicelink.csv`. */
    function downloadDeviceLinksCsvMulti() {
      if (scannedDeviceLinks.length === 0) return;
      const bytes = encodeUtf16LeWithBom(buildDeviceLinkCsvTextMulti(scannedDeviceLinks));
      const blob = new Blob([bytes], { type: "text/csv;charset=utf-16le" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "scanned.devicelink.csv";
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
        ? `<p class="qrs-note qrs-devicelink-note ipk-hint">
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
        <button type="button" class="btn btn-primary qrs-devicelink-export">
          ⬇️ Export as .devicelink.csv
        </button>
      `;
    }

    async function renderResult(raw: string, row: ResultRow) {
      const parsed = parseQrPayload(raw);

      if (parsed.kind === "url") {
        row.setSummary("Link", truncate(parsed.url));
        row.setBody(
          `<p class="qrs-link"><a href="${escapeHtml(parsed.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(
            parsed.url,
          )}</a></p>`,
          [{ label: "Raw decoded text", value: raw, monospace: true }],
        );
        return;
      }

      if (parsed.kind === "wifi") {
        row.setSummary("Wi-Fi network", `SSID: ${parsed.ssid || "(empty)"}`);
        const fields: ResultField[] = [{ label: "SSID", value: parsed.ssid || "(empty)" }];
        if (parsed.password) fields.push({ label: "Password", value: parsed.password });
        if (parsed.authType) fields.push({ label: "Security", value: parsed.authType });
        fields.push({ label: "Raw decoded text", value: raw, monospace: true });
        row.setBody("", fields);
        return;
      }

      if (parsed.kind === "totp") {
        row.setSummary("TOTP / authenticator", [parsed.issuer, parsed.account].filter(Boolean).join(" · ") || truncate(raw));
        const fields: ResultField[] = [];
        if (parsed.issuer) fields.push({ label: "Issuer", value: parsed.issuer });
        if (parsed.account) fields.push({ label: "Account", value: parsed.account });
        if (parsed.secret) fields.push({ label: "Secret", value: parsed.secret, monospace: true });
        fields.push({ label: "Raw decoded text", value: raw, monospace: true });
        row.setBody("", fields);
        return;
      }

      if (parsed.kind === "deviceLink") {
        row.setSummary("Autopilot DeviceLink", `Serial: ${parsed.serialNumber}`);
        row.setBody("<p>Decoding device link…</p>", [{ label: "Raw decoded text", value: raw, monospace: true }]);
        try {
          const info = await decodeDeviceLinkData(parsed.data);
          scannedDeviceLinks.push(info);
          updateResultCount();
          row.setBody(deviceLinkExtraHtml(info), [
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
          row.el.querySelector<HTMLButtonElement>(".qrs-devicelink-export")?.addEventListener("click", () => {
            downloadDeviceLinkCsv(info);
          });
        } catch (err) {
          row.setBody("", [
            { label: "Error", value: `Could not decode this device link: ${err instanceof Error ? err.message : String(err)}` },
            { label: "Raw decoded text", value: raw, monospace: true },
          ]);
        }
        return;
      }

      row.setSummary("Text", truncate(raw));
      row.setBody("", [{ label: "Raw decoded text", value: raw, monospace: true }]);
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
    clearListBtn.addEventListener("click", () => clearResultList());
    exportDeviceLinksBtn.addEventListener("click", () => downloadDeviceLinksCsvMulti());
    continuousCheckbox.addEventListener("change", () => updateResultCount());

    showExample(0);
    examplePrevBtn.addEventListener("click", () => showExample(exampleIndex - 1));
    exampleNextBtn.addEventListener("click", () => showExample(exampleIndex + 1));

    return () => {
      stopStream();
      if (audioCtx) {
        void audioCtx.close().catch(() => undefined);
        audioCtx = null;
      }
    };
  },
};

export default tool;
