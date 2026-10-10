import "./style.css";
import type { ToolDefinition } from "@/types/tool";
import { autoGrowTextarea } from "@/app/copy-button";
import { escapeHtml, renderMarkdown, substituteVariables } from "./markdown";

const MESSAGE_PLACEHOLDER =
  "# Test running\nStarted {{startedAt}} - {{timer}} elapsed. Please do not disturb.\nPress Esc to leave full screen or theater mode.";
const EXAMPLE_MESSAGE = MESSAGE_PLACEHOLDER;
const DEFAULT_BG_COLOR = "#121212";
const DEFAULT_FG_COLOR = "#f5f5f5";
const BURN_IN_SAFE_BG_COLOR = "#000000";
const ANTI_BURN_INTERVAL_MS = 45_000;
const ANTI_BURN_MAX_OFFSET_PX = 18;

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return hours > 0 ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

const tool: ToolDefinition = {
  id: "stay-awake",
  name: "Stay Awake",
  description:
    "Keep this device's screen from locking or dimming with one click, and optionally show a custom Markdown message - with a live timer - for bystanders to see, in full screen.",
  category: "Utilities",
  keywords: [
    "stay awake",
    "keep awake",
    "caffeine",
    "no sleep",
    "wake lock",
    "screen on",
    "presentation mode",
    "markdown",
    "full screen",
    "fullscreen",
    "sign",
    "message",
  ],
  icon: "☕",
  mount(container) {
    const fullscreenSupported = typeof document.documentElement.requestFullscreen === "function";

    container.innerHTML = `
      <div class="awk-tool">
        <p class="awk-note">
          Keeps the screen on only while this tab stays open and visible - it stops the instant you leave, so it
          won't run by accident.
        </p>

        <div class="awk-panel">
          <button type="button" class="btn btn-primary awk-toggle" id="awk-toggle">☕ Keep screen awake</button>
          <span class="awk-status" id="awk-status"><span class="awk-indicator"></span>Screen may turn off as usual.</span>
          <p class="awk-timer" id="awk-timer" hidden></p>
          <div class="awk-mode-options">
            <label class="awk-mode-field">
              <input type="checkbox" id="awk-fullscreen" readonly ${fullscreenSupported ? "" : "disabled"} />
              ⛶ Full screen
            </label>
            <label class="awk-mode-field">
              <input type="checkbox" id="awk-theater" readonly />
              🗖 Theater mode
            </label>
          </div>
        </div>

        <div class="awk-message-field">
          <div class="awk-field-header">
            <label class="awk-label" for="awk-message">Bystander message (Markdown, optional)</label>
            <button type="button" id="awk-message-example" class="awk-populate-btn">Use example</button>
          </div>
          <textarea
            id="awk-message"
            class="mono awk-message-input"
            rows="5"
            placeholder="${escapeHtml(MESSAGE_PLACEHOLDER)}"
          ></textarea>
          <p class="awk-hint">
            Supports basic Markdown, and <code>{{startedAt}}</code> / <code>{{timer}}</code> variables.
          </p>
        </div>

        <div class="awk-preview-wrap">
          <div class="awk-preview-header">
            <span class="awk-label">Preview</span>
            <div class="awk-preview-controls">
              <label class="awk-antiburn-field" title="Periodically nudges the message so it doesn't burn a static image into the screen">
                <input type="checkbox" id="awk-antiburn" checked />
                🔥 Prevent burn-in
              </label>
              <label class="awk-color-field" id="awk-bg-field" title="Locked to black while Prevent burn-in is on - a static colored background would burn in regardless of text movement">
                Background
                <input type="color" id="awk-bg-color" value="${DEFAULT_BG_COLOR}" />
              </label>
              <label class="awk-color-field">
                Text
                <input type="color" id="awk-fg-color" value="${DEFAULT_FG_COLOR}" />
              </label>
              <button type="button" id="awk-colors-reset" class="awk-populate-btn">Reset colors</button>
            </div>
          </div>
          <div class="awk-preview" id="awk-preview">
            <div class="awk-preview-content" id="awk-preview-content"></div>
          </div>
        </div>

        <p class="awk-warning" id="awk-warning" role="alert"></p>
      </div>
    `;

    const toggleBtn = container.querySelector<HTMLButtonElement>("#awk-toggle")!;
    const statusEl = container.querySelector<HTMLSpanElement>("#awk-status")!;
    const timerEl = container.querySelector<HTMLParagraphElement>("#awk-timer")!;
    const warningEl = container.querySelector<HTMLParagraphElement>("#awk-warning")!;
    const messageInput = container.querySelector<HTMLTextAreaElement>("#awk-message")!;
    const previewEl = container.querySelector<HTMLDivElement>("#awk-preview")!;
    const previewContentEl = container.querySelector<HTMLDivElement>("#awk-preview-content")!;
    const fullscreenToggle = container.querySelector<HTMLInputElement>("#awk-fullscreen")!;
    const theaterToggle = container.querySelector<HTMLInputElement>("#awk-theater")!;
    const messageExampleBtn = container.querySelector<HTMLButtonElement>("#awk-message-example")!;
    const bgColorInput = container.querySelector<HTMLInputElement>("#awk-bg-color")!;
    const bgFieldEl = container.querySelector<HTMLLabelElement>("#awk-bg-field")!;
    const fgColorInput = container.querySelector<HTMLInputElement>("#awk-fg-color")!;
    const colorsResetBtn = container.querySelector<HTMLButtonElement>("#awk-colors-reset")!;
    const antiBurnToggle = container.querySelector<HTMLInputElement>("#awk-antiburn")!;

    const supported = "wakeLock" in navigator;

    let wakeLock: WakeLockSentinel | null = null;
    let active = false;
    let startedAt = 0;
    let timerInterval: number | undefined;

    const renderPreview = () => {
      const raw = messageInput.value;
      if (!raw.trim()) {
        const fallback = active ? "Screen will stay on while this tab is open and visible." : "Screen may turn off as usual.";
        previewContentEl.innerHTML = `<p class="awk-preview-placeholder">${escapeHtml(fallback)}</p>`;
        return;
      }
      const vars = {
        timer: formatElapsed(active ? Date.now() - startedAt : 0),
        startedat: active && startedAt ? new Date(startedAt).toLocaleTimeString() : "-",
      };
      previewContentEl.innerHTML = renderMarkdown(substituteVariables(raw, vars));
    };

    const updateTimer = () => {
      timerEl.textContent = `Awake for ${formatElapsed(Date.now() - startedAt)}`;
      renderPreview();
    };

    const startTimer = () => {
      startedAt = Date.now();
      timerEl.hidden = false;
      updateTimer();
      timerInterval = window.setInterval(updateTimer, 1000);
    };

    const stopTimer = () => {
      if (timerInterval !== undefined) {
        window.clearInterval(timerInterval);
        timerInterval = undefined;
      }
      timerEl.hidden = true;
    };

    const setActive = (next: boolean) => {
      active = next;
      toggleBtn.textContent = active ? "🛑 Stop keeping screen awake" : "☕ Keep screen awake";
      toggleBtn.classList.toggle("is-active", active);
      toggleBtn.classList.toggle("btn-primary", !active);
      statusEl.classList.toggle("is-active", active);
      statusEl.innerHTML = `<span class="awk-indicator"></span>${
        active ? "Screen will stay on while this tab is open and visible." : "Screen may turn off as usual."
      }`;
      if (active) startTimer();
      else stopTimer();
      renderPreview();
    };

    const requestWakeLock = async () => {
      try {
        wakeLock = await navigator.wakeLock.request("screen");
        warningEl.textContent = "";
        setActive(true);
        wakeLock.addEventListener("release", () => {
          // The browser releases the lock automatically when the tab is hidden/minimized;
          // only reflect this as "off" if the page is still visible (an unexpected release).
          if (!document.hidden) {
            wakeLock = null;
            setActive(false);
          }
        });
      } catch (err) {
        warningEl.textContent = `Could not keep the screen awake: ${err instanceof Error ? err.message : String(err)}`;
        setActive(false);
      }
    };

    const releaseWakeLock = async () => {
      setActive(false);
      if (wakeLock) {
        await wakeLock.release().catch(() => undefined);
        wakeLock = null;
      }
    };

    if (!supported) {
      toggleBtn.disabled = true;
      warningEl.textContent =
        "Your browser doesn't support the Wake Lock API, so this tool can't keep the screen on here. Try a recent version of Chrome, Edge, or Safari.";
    }

    let theaterActive = false;

    const setTheaterMode = (next: boolean) => {
      theaterActive = next;
      document.body.classList.toggle("ipk-theater-mode", next);
      previewEl.classList.toggle("is-theater", next);
      theaterToggle.checked = next;
      if (next) previewEl.scrollIntoView({ behavior: "smooth", block: "center" });
    };

    toggleBtn.addEventListener("click", () => {
      if (active) {
        void releaseWakeLock();
        return;
      }
      // Enter the selected focus mode (if any) as part of this same click, so the Fullscreen
      // API still sees it as a trusted user gesture, then start the wake lock.
      if (fullscreenToggle.checked) {
        previewEl.requestFullscreen().catch((err) => {
          warningEl.textContent = `Could not enter full screen: ${err instanceof Error ? err.message : String(err)}`;
          fullscreenToggle.checked = false;
        });
      } else if (theaterToggle.checked) {
        setTheaterMode(true);
      }
      void requestWakeLock();
    });

    autoGrowTextarea(messageInput);
    messageInput.addEventListener("input", () => {
      autoGrowTextarea(messageInput);
      renderPreview();
    });
    messageExampleBtn.addEventListener("click", () => {
      messageInput.value = EXAMPLE_MESSAGE;
      messageInput.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const applyColors = () => {
      const bg = antiBurnToggle.checked ? BURN_IN_SAFE_BG_COLOR : bgColorInput.value;
      previewEl.style.setProperty("--awk-preview-bg", bg);
      previewEl.style.setProperty("--awk-preview-fg", fgColorInput.value);
    };
    bgColorInput.addEventListener("input", applyColors);
    fgColorInput.addEventListener("input", applyColors);
    colorsResetBtn.addEventListener("click", () => {
      if (!bgColorInput.disabled) {
        bgColorInput.value = DEFAULT_BG_COLOR;
        bgColorInput.dispatchEvent(new Event("input", { bubbles: true }));
      }
      fgColorInput.value = DEFAULT_FG_COLOR;
      fgColorInput.dispatchEvent(new Event("input", { bubbles: true }));
    });

    let antiBurnInterval: number | undefined;

    const shiftAntiBurn = () => {
      const x = Math.round((Math.random() * 2 - 1) * ANTI_BURN_MAX_OFFSET_PX);
      const y = Math.round((Math.random() * 2 - 1) * ANTI_BURN_MAX_OFFSET_PX);
      previewContentEl.style.transform = `translate(${x}px, ${y}px)`;
    };

    const stopAntiBurn = () => {
      if (antiBurnInterval !== undefined) {
        window.clearInterval(antiBurnInterval);
        antiBurnInterval = undefined;
      }
      previewContentEl.style.transform = "";
    };

    const startAntiBurn = () => {
      stopAntiBurn();
      shiftAntiBurn();
      antiBurnInterval = window.setInterval(shiftAntiBurn, ANTI_BURN_INTERVAL_MS);
    };

    // A static colored background would burn in just as badly as static text, no matter how much
    // the text itself gets nudged around - so background colors are only available once burn-in
    // protection is switched off, and locked to black (the safest option) while it's on.
    const syncBgLock = () => {
      const locked = antiBurnToggle.checked;
      bgColorInput.disabled = locked;
      bgFieldEl.classList.toggle("is-locked", locked);
      applyColors();
    };

    antiBurnToggle.addEventListener("change", () => {
      if (antiBurnToggle.checked) startAntiBurn();
      else stopAntiBurn();
      syncBgLock();
    });
    if (antiBurnToggle.checked) startAntiBurn();
    syncBgLock();

    const onFullscreenChange = () => {
      const isFullscreen = document.fullscreenElement === previewEl;
      previewEl.classList.toggle("is-fullscreen", isFullscreen);
      fullscreenToggle.checked = isFullscreen;
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);

    // Full screen and theater mode are two different ways to focus on the preview, so only one
    // applies at a time: switching one on takes care of switching the other off first. While the
    // screen isn't being kept awake yet, checking a box only records the preference - it's applied
    // once "Keep screen awake" is clicked, instead of immediately requesting full screen here.
    fullscreenToggle.addEventListener("change", () => {
      if (fullscreenToggle.checked) {
        if (theaterToggle.checked) {
          theaterToggle.checked = false;
          if (active) setTheaterMode(false);
        }
        if (active) {
          previewEl.requestFullscreen().catch((err) => {
            warningEl.textContent = `Could not enter full screen: ${err instanceof Error ? err.message : String(err)}`;
            fullscreenToggle.checked = false;
          });
        }
      } else if (document.fullscreenElement === previewEl) {
        void document.exitFullscreen().catch(() => undefined);
      }
    });

    theaterToggle.addEventListener("change", () => {
      if (theaterToggle.checked) {
        if (fullscreenToggle.checked) {
          fullscreenToggle.checked = false;
          if (document.fullscreenElement === previewEl) void document.exitFullscreen().catch(() => undefined);
        }
        if (active) setTheaterMode(true);
      } else if (active) {
        setTheaterMode(false);
      }
    });

    const onKeydown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && theaterActive && document.fullscreenElement !== previewEl) {
        setTheaterMode(false);
      }
    };
    document.addEventListener("keydown", onKeydown);

    renderPreview();

    const onVisibilityChange = () => {
      // Re-acquire the lock once the tab becomes visible again, if the user still wants it on.
      if (active && !wakeLock && document.visibilityState === "visible") {
        void requestWakeLock();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener("keydown", onKeydown);
      if (document.fullscreenElement === previewEl) void document.exitFullscreen().catch(() => undefined);
      if (theaterActive) document.body.classList.remove("ipk-theater-mode");
      stopAntiBurn();
      stopTimer();
      void releaseWakeLock();
    };
  },
};

export default tool;
