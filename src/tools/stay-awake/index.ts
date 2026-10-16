import "./style.css";
import type { ToolDefinition } from "@/types/tool";
import { autoGrowTextarea, copyButtonHtml, wireCopyButton } from "@/app/copy-button";
import { codeBlockHtml, setPowerShellCode } from "@/app/code-block";
import { escapeHtml, renderMarkdown, substituteVariables } from "./markdown";

const MESSAGE_PLACEHOLDER =
  "# 🚫🖐️🖥️\n\n# I am a server, serving important stuff\n\nRunning non-stop since {{startedAt}} - {{timer}} and crunching numbers.\n🐌......10110101010101010101\n\nPress Esc to leave full screen or theater mode.";
const EXAMPLE_MESSAGE = MESSAGE_PLACEHOLDER;
const DEFAULT_BG_COLOR = "#121212";
const DEFAULT_FG_COLOR = "#f5f5f5";
const BURN_IN_SAFE_BG_COLOR = "#000000";
const ANTI_BURN_INTERVAL_MS = 45_000;
const ANTI_BURN_MAX_OFFSET_PX = 18;
const WS_RECONNECT_BASE_MS = 1_000;
const WS_RECONNECT_MAX_MS = 30_000;
const WS_EXAMPLE_SERVER_SCRIPT = `function New-ToStayAwake {
    <#
    .SYNOPSIS
        Creates a Stay Awake WebSocket server object. Call .Start() to begin waiting for a
        connection in the background (it prints "Client connected." once the browser connects,
        so your console stays free to keep going), .Send(text) to show a message, and .Stop()
        when done.
    .EXAMPLE
        $tsa = New-ToStayAwake
        $tsa.Start()
        $tsa.Send("test")
        $tsa.Stop()
    .EXAMPLE
        # Accept connections from other machines too (needs an elevated PowerShell session, or a
        # one-time "netsh http add urlacl url=http://+:8080/ user=Everyone" to allow non-admins,
        # plus an inbound firewall rule allowing the port).
        $tsa = New-ToStayAwake -Prefix "http://+:8080/"
        $tsa.Start()
    #>
    [CmdletBinding()]
    param(
        [string]$Prefix = "http://localhost:8080/"
    )

    $instance = [pscustomobject]@{
        Prefix      = $Prefix
        Listener    = $null
        Socket      = $null
        Runspace    = $null
        PowerShell  = $null
        AsyncResult = $null
    }

    $instance | Add-Member -MemberType ScriptMethod -Name Start -Value {
        # Running this twice in a row (or after Ctrl+C) without cleaning up first would
        # otherwise fail with "address already in use" - stop any still-running instance first.
        $this.Stop($true)

        $this.Listener = [System.Net.HttpListener]::new()
        $this.Listener.Prefixes.Add($this.Prefix)
        $this.Listener.Start()
        Write-Host "Waiting for a connection on $($this.Prefix.Replace('http://', 'ws://')) in the background (Ctrl+C or .Stop() to cancel)..."

        # Accept the connection on a background runspace so Start() returns immediately instead
        # of blocking the console. It shares this session's $Host, so Write-Host below still
        # prints to this same console once the browser connects.
        $acceptScript = {
            param($Instance)
            try {
                do {
                    $context = $Instance.Listener.GetContextAsync().GetAwaiter().GetResult()
                    if (-not $context.Request.IsWebSocketRequest) {
                        $context.Response.StatusCode = 400
                        $context.Response.Close()
                    }
                } while (-not $context.Request.IsWebSocketRequest)

                # $null here would be coerced to "" by PowerShell's string parameter binding,
                # which HttpListenerContext.AcceptWebSocketAsync rejects - [NullString]::Value
                # avoids that.
                $Instance.Socket = $context.AcceptWebSocketAsync([NullString]::Value).GetAwaiter().GetResult().WebSocket
                Write-Host "Client connected."
            }
            catch {
                # .Stop() (or Ctrl+C) while still waiting for a connection lands here - nothing
                # more to do.
                Write-Host "Stopped waiting for a connection."
            }
        }

        $this.Runspace = [runspacefactory]::CreateRunspace($Host)
        $this.Runspace.Open()
        $this.PowerShell = [powershell]::Create()
        $this.PowerShell.Runspace = $this.Runspace
        $this.PowerShell.AddScript($acceptScript).AddArgument($this) | Out-Null
        $this.AsyncResult = $this.PowerShell.BeginInvoke()
    }

    $instance | Add-Member -MemberType ScriptMethod -Name Send -Value {
        param([string]$Message)
        if (-not $this.Socket -or $this.Socket.State -ne "Open" -or [string]::IsNullOrEmpty($Message)) { return }
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($Message)
        $segment = [System.ArraySegment[byte]]::new($bytes)
        try {
            $this.Socket.SendAsync($segment, "Text", $true, [Threading.CancellationToken]::None).GetAwaiter().GetResult() | Out-Null
        }
        catch {
            Write-Host "Client disconnected."
        }
    }

    $instance | Add-Member -MemberType ScriptMethod -Name Stop -Value {
        param([bool]$Quiet)
        if ($this.Listener -and $this.Listener.IsListening) {
            # Unblocks the background accept loop (if it's still waiting for a connection) by
            # making its GetContextAsync() call throw - the loop already catches that.
            $this.Listener.Stop()
        }
        if ($this.PowerShell) {
            if ($this.AsyncResult -and -not $this.AsyncResult.IsCompleted) {
                $this.PowerShell.EndInvoke($this.AsyncResult) | Out-Null
            }
            $this.PowerShell.Dispose()
            $this.PowerShell = $null
        }
        if ($this.Runspace) {
            $this.Runspace.Close()
            $this.Runspace.Dispose()
            $this.Runspace = $null
        }
        $this.AsyncResult = $null
        if ($this.Socket) {
            $this.Socket.Dispose()
            $this.Socket = $null
        }
        if ($this.Listener) {
            $this.Listener.Close()
            $this.Listener = $null
        }
        if (-not $Quiet) { Write-Host "Stopped." }
    }

    return $instance
}

# Example: call .Send() with your own text, however often you like.
$tsa = New-ToStayAwake
# $tsa = New-ToStayAwake -Prefix "http://+:8080/" # Other machines too (needs an inbound firewall rule allowing the port).
$tsa.Start()
$tsa.Send("Hello from PowerShell Script")
# $tsa.Stop() # Uncomment to stop the server when you're done.`;

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
    "Keep this device's screen from locking or dimming with one click, and optionally show a custom Markdown screen message - with a live timer - in full screen.",
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
        <p class="awk-note ipk-hint">
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
            <label class="awk-label" for="awk-message">Screen message (Markdown, optional)</label>
            <button type="button" id="awk-message-example" class="awk-populate-btn">Use example</button>
          </div>
          <textarea
            id="awk-message"
            class="mono awk-message-input"
            rows="5"
            placeholder="${escapeHtml(MESSAGE_PLACEHOLDER)}"
          ></textarea>
          <p class="awk-hint">
            Supports basic Markdown, and <code>{{startedAt}}</code> / <code>{{timer}}</code> / <code>{{ws}}</code>
            variables.
          </p>
        </div>

        <div class="awk-ws-field">
          <div class="awk-ws-title">
            <label class="awk-ws-label" for="awk-ws-url">Live data via WebSocket (optional)</label>
            <span
              class="ipk-stage-badge ipk-stage-alpha"
              title="This feature is alpha - still under active work, rough edges and missing features are expected."
              >alpha</span
            >
          </div>
          <div class="awk-ws-row">
            <input
              type="text"
              id="awk-ws-url"
              class="mono awk-ws-input"
              placeholder="ws://localhost:8080/"
            />
            <button type="button" class="btn awk-ws-toggle" id="awk-ws-toggle">Connect</button>
          </div>
          <span
            class="awk-ws-status"
            id="awk-ws-status"
            title="Your browser connects directly to the URL you enter - IPK's own code doesn't see or relay this traffic. Use {{ws}} in the message above to show whatever text the server sends."
            ><span class="awk-indicator"></span>Not connected.</span
          >
          <details class="awk-ws-example">
            <summary>Example: test server in PowerShell</summary>
            <div class="ipk-ps-command">
              <div class="ipk-ps-tabs" role="tablist" aria-label="Command shell">
                <button type="button" class="ipk-ps-tab is-active" role="tab" aria-selected="true" tabindex="-1">PowerShell</button>
                <span class="ipk-ps-admin-badge" title="May need an elevated PowerShell window, depending on URL reservation permissions">🛡️ Admin</span>
              </div>
              <div class="ipk-copy-wrap ipk-copy-wrap-tabbed">
                ${codeBlockHtml("awk-ws-example-code")}
                ${copyButtonHtml("awk-ws-example-copy", "Copy example PowerShell WebSocket server")}
              </div>
            </div>
          </details>
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
    const wsUrlInput = container.querySelector<HTMLInputElement>("#awk-ws-url")!;
    const wsToggleBtn = container.querySelector<HTMLButtonElement>("#awk-ws-toggle")!;
    const wsStatusEl = container.querySelector<HTMLSpanElement>("#awk-ws-status")!;
    const wsExampleCodeEl = container.querySelector<HTMLElement>("#awk-ws-example-code")!;
    const wsExampleCopyBtn = container.querySelector<HTMLButtonElement>("#awk-ws-example-copy")!;
    setPowerShellCode(wsExampleCodeEl, WS_EXAMPLE_SERVER_SCRIPT);
    wireCopyButton(wsExampleCopyBtn, () => WS_EXAMPLE_SERVER_SCRIPT);

    const supported = "wakeLock" in navigator;

    let wakeLock: WakeLockSentinel | null = null;
    let active = false;
    let startedAt = 0;
    let timerInterval: number | undefined;
    let wsSocket: WebSocket | null = null;
    let wsValue = "";
    let wsManualDisconnect = false;
    let wsReconnectAttempt = 0;
    let wsReconnectTimer: number | undefined;

    const renderPreview = () => {
      const raw = messageInput.value;
      const vars = {
        timer: formatElapsed(active ? Date.now() - startedAt : 0),
        startedat: active && startedAt ? new Date(startedAt).toLocaleTimeString() : "-",
        ws: wsValue,
      };
      if (!raw.trim()) {
        previewContentEl.innerHTML = `<div class="awk-preview-placeholder">${renderMarkdown(substituteVariables(MESSAGE_PLACEHOLDER, vars))}</div>`;
        return;
      }
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

    const setWsStatus = (connected: boolean, message: string) => {
      wsStatusEl.classList.toggle("is-connected", connected);
      wsStatusEl.innerHTML = `<span class="awk-indicator"></span>${escapeHtml(message)}`;
    };

    const clearWsReconnectTimer = () => {
      if (wsReconnectTimer !== undefined) {
        window.clearTimeout(wsReconnectTimer);
        wsReconnectTimer = undefined;
      }
    };

    const scheduleWsReconnect = (url: string) => {
      clearWsReconnectTimer();
      const delaySeconds = Math.round(Math.min(WS_RECONNECT_BASE_MS * 2 ** wsReconnectAttempt, WS_RECONNECT_MAX_MS) / 1000);
      wsReconnectAttempt += 1;
      setWsStatus(false, `Disconnected - reconnecting in ${delaySeconds}s...`);
      wsReconnectTimer = window.setTimeout(() => connectWs(url), delaySeconds * 1000);
    };

    const connectWs = (url: string) => {
      clearWsReconnectTimer();
      wsManualDisconnect = false;
      setWsStatus(false, "Connecting...");
      wsToggleBtn.textContent = "Disconnect";

      let socket: WebSocket;
      try {
        socket = new WebSocket(url);
      } catch (err) {
        setWsStatus(false, `Could not connect: ${err instanceof Error ? err.message : String(err)}`);
        wsToggleBtn.textContent = "Connect";
        return;
      }
      wsSocket = socket;

      socket.addEventListener("open", () => {
        wsReconnectAttempt = 0;
        setWsStatus(true, "Connected.");
      });
      socket.addEventListener("message", (event) => {
        if (typeof event.data === "string") {
          wsValue = event.data;
          renderPreview();
        } else if (event.data instanceof Blob) {
          void event.data.text().then((text) => {
            wsValue = text;
            renderPreview();
          });
        }
      });
      socket.addEventListener("close", () => {
        if (wsSocket !== socket) return;
        wsSocket = null;
        if (wsManualDisconnect) {
          setWsStatus(false, "Not connected.");
          wsToggleBtn.textContent = "Connect";
        } else {
          scheduleWsReconnect(url);
        }
      });
    };

    const disconnectWs = () => {
      wsManualDisconnect = true;
      clearWsReconnectTimer();
      wsReconnectAttempt = 0;
      setWsStatus(false, "Not connected.");
      wsToggleBtn.textContent = "Connect";
      if (wsSocket) {
        // Update the UI immediately rather than waiting for the "close" event - a server that
        // never reads from its socket (e.g. the example script, which only sends) won't respond
        // to the close handshake, and the event could be delayed or never arrive at all.
        const socket = wsSocket;
        wsSocket = null;
        socket.close();
      }
    };

    wsToggleBtn.addEventListener("click", () => {
      if (wsSocket) {
        disconnectWs();
        return;
      }
      const url = wsUrlInput.value.trim();
      if (!/^wss?:\/\//i.test(url)) {
        setWsStatus(false, "Enter a ws:// or wss:// URL first.");
        return;
      }
      connectWs(url);
    });

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
      wsManualDisconnect = true;
      clearWsReconnectTimer();
      wsSocket?.close();
      void releaseWakeLock();
    };
  },
};

export default tool;
