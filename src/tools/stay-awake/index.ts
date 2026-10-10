import "./style.css";
import type { ToolDefinition } from "@/types/tool";

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
    "Keep this device's screen from locking or dimming with one click - handy while following a guide, running a long task, or presenting.",
  category: "Utilities",
  keywords: ["stay awake", "keep awake", "caffeine", "no sleep", "wake lock", "screen on", "presentation mode"],
  icon: "☕",
  mount(container) {
    container.innerHTML = `
      <div class="awk-tool">
        <p class="awk-note">
          Click the button to prevent this device's screen from turning off or locking while this tab stays open
          and visible. It stops the instant you close or switch away from this tab for good, so it won't keep
          your machine awake by accident.
        </p>

        <div class="awk-panel">
          <button type="button" class="btn btn-primary awk-toggle" id="awk-toggle">☕ Keep screen awake</button>
          <span class="awk-status" id="awk-status"><span class="awk-indicator"></span>Screen may turn off as usual.</span>
          <p class="awk-timer" id="awk-timer" hidden></p>
        </div>

        <p class="awk-warning" id="awk-warning" role="alert"></p>
      </div>
    `;

    const toggleBtn = container.querySelector<HTMLButtonElement>("#awk-toggle")!;
    const statusEl = container.querySelector<HTMLSpanElement>("#awk-status")!;
    const timerEl = container.querySelector<HTMLParagraphElement>("#awk-timer")!;
    const warningEl = container.querySelector<HTMLParagraphElement>("#awk-warning")!;

    const supported = "wakeLock" in navigator;

    let wakeLock: WakeLockSentinel | null = null;
    let active = false;
    let startedAt = 0;
    let timerInterval: number | undefined;

    const updateTimer = () => {
      timerEl.textContent = `Awake for ${formatElapsed(Date.now() - startedAt)}`;
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

    toggleBtn.addEventListener("click", () => {
      if (active) void releaseWakeLock();
      else void requestWakeLock();
    });

    const onVisibilityChange = () => {
      // Re-acquire the lock once the tab becomes visible again, if the user still wants it on.
      if (active && !wakeLock && document.visibilityState === "visible") {
        void requestWakeLock();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      stopTimer();
      void releaseWakeLock();
    };
  },
};

export default tool;
