import "./style.css";
import { copyButtonHtml, wireCopyButton } from "@/app/copy-button";
import { codeBlockHtml, setPowerShellCode } from "@/app/code-block";
import type { ToolDefinition } from "@/types/tool";
import {
  parseImeAppsExport,
  diffApps,
  intentLabel,
  targetTypeLabel,
  type ImeSnapshot,
  type ImeAppDiff,
  type ImeParseError,
} from "./parse";

// Captures every "Get policies = {...}" line across all rotated AppWorkload
// log files along with its CMTrace time/date attributes (needed to order
// and label snapshots), decodes each Apps payload client-side, and copies
// the whole thing as one JSON array — following the repo's "run here, paste
// there" convention. Uses `$var | Set-Clipboard; $var` instead of
// `Set-Clipboard -PassThru` because -PassThru isn't available in Windows
// PowerShell 5.1 (the default console on managed endpoints) — only in
// PowerShell 7.4+ — so this phrasing copies *and* echoes the output on
// every version. The decoded Apps payload is also re-wrapped with `@(...)`
// before nesting it in the snapshot object: in Windows PowerShell 5.1,
// re-serializing a bare ConvertFrom-Json array nested in another object
// turns it into `{"value":[...],"Count":n}` instead of a plain array —
// `@(...)` forces a real PowerShell array so ConvertTo-Json emits `[...]`
// consistently on both PS 5.1 and 7+.
const EXPORT_COMMAND =
  '$ime = (Select-String -Path \'C:\\ProgramData\\Microsoft\\IntuneManagementExtension\\Logs\\AppWorkload*.log\' -Pattern \'<!\\[LOG\\[Get policies = (.*?)\\]LOG\\]!><time="([^"]+)" date="([^"]+)"\').ForEach({[pscustomobject]@{Date=$_.Matches.Groups[3].Value;Time=$_.Matches.Groups[2].Value;Apps=@($_.Matches.Groups[1].Value | ConvertFrom-Json)}}) | ConvertTo-Json -Depth 12 -Compress; $ime | Set-Clipboard; $ime';

function escapeHtml(value: string): string {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}

function formatSnapshotLabel(snapshot: ImeSnapshot): string {
  if (snapshot.timestampMs !== null) {
    return new Date(snapshot.timestampMs).toLocaleString();
  }
  return `${snapshot.dateRaw} ${snapshot.timeRaw}`.trim() || "(unknown time)";
}

const STATUS_LABEL: Record<ImeAppDiff["status"], string> = {
  added: "Added",
  removed: "Removed",
  changed: "Changed",
  unchanged: "Unchanged",
};

function appDiffHtml(diff: ImeAppDiff): string {
  const fieldRows = diff.fieldDiffs
    .map(
      (f) => `
        <tr>
          <td class="ima-field-key mono">${escapeHtml(f.key)}</td>
          <td class="mono">${escapeHtml(f.from)}</td>
          <td class="mono">${escapeHtml(f.to)}</td>
        </tr>
      `,
    )
    .join("");

  return `
    <details class="ima-app ima-app-${diff.status}">
      <summary class="ima-app-summary">
        <span class="ima-badge ima-badge-${diff.status}">${STATUS_LABEL[diff.status]}</span>
        <span class="ima-app-name">${escapeHtml(diff.name)}</span>
        <span class="ima-app-meta">${escapeHtml(intentLabel(diff.app.intent))} · ${escapeHtml(targetTypeLabel(diff.app.targetType))}${diff.app.version !== null ? ` · v${diff.app.version}` : ""}</span>
      </summary>
      <div class="ima-app-detail">
        <p class="ima-app-id mono">${escapeHtml(diff.app.id)}</p>
        ${
          diff.fieldDiffs.length > 0
            ? `<table class="ima-diff-table">
                <thead><tr><th>Field</th><th>Before</th><th>After</th></tr></thead>
                <tbody>${fieldRows}</tbody>
              </table>`
            : ""
        }
        <details class="ima-raw">
          <summary>Raw JSON</summary>
          <pre class="ipk-code mono">${escapeHtml(JSON.stringify(diff.app.raw, null, 2))}</pre>
        </details>
      </div>
    </details>
  `;
}

function snapshotHtml(snapshot: ImeSnapshot, diffs: ImeAppDiff[], isFirst: boolean, onlyChanges: boolean): string {
  const visibleDiffs = onlyChanges && !isFirst ? diffs.filter((d) => d.status !== "unchanged") : diffs;
  const added = diffs.filter((d) => d.status === "added").length;
  const removed = diffs.filter((d) => d.status === "removed").length;
  const changed = diffs.filter((d) => d.status === "changed").length;

  const summaryBadges = isFirst
    ? `<span class="ima-badge ima-badge-baseline">Baseline · ${snapshot.apps.length} apps</span>`
    : [
        added ? `<span class="ima-badge ima-badge-added">+${added}</span>` : "",
        removed ? `<span class="ima-badge ima-badge-removed">-${removed}</span>` : "",
        changed ? `<span class="ima-badge ima-badge-changed">${changed} changed</span>` : "",
        !added && !removed && !changed ? `<span class="ima-badge ima-badge-unchanged">No changes</span>` : "",
      ].join("");

  return `
    <li class="ima-entry">
      <div class="ima-entry-dot"></div>
      <div class="ima-entry-body">
        <div class="ima-entry-header">
          <span class="ima-entry-time">${escapeHtml(formatSnapshotLabel(snapshot))}</span>
          ${summaryBadges}
        </div>
        <div class="ima-entry-apps">
          ${
            visibleDiffs.length > 0
              ? visibleDiffs.map(appDiffHtml).join("")
              : `<p class="ima-empty">${onlyChanges && !isFirst ? "No app changes in this check-in." : "No apps in this snapshot."}</p>`
          }
        </div>
      </div>
    </li>
  `;
}

function errorsHtml(errors: ImeParseError[]): string {
  if (errors.length === 0) return "";
  return `<p class="ima-warn">${errors.map((e) => escapeHtml(e.message)).join("<br/>")}</p>`;
}

const tool: ToolDefinition = {
  id: "ime-apps-parser",
  name: "IME Apps Parser",
  description:
    "Turn Intune Management Extension AppWorkload.log \"Get policies\" entries into a vertical timeline, highlighting what changed between check-ins for each Win32 app.",
  category: "Converters",
  keywords: [
    "ime",
    "intune management extension",
    "appworkload",
    "appworkload.log",
    "win32 app",
    "get policies",
    "intune",
    "win32",
    "company portal",
    "policy timeline",
  ],
  icon: "📦",
  mount(container) {
    container.innerHTML = `
      <div class="ima-tool">
        <p class="ima-step-label">1. Run this on the device — it copies every "Get policies" snapshot to your clipboard</p>
        <div class="ipk-copy-wrap">
          ${codeBlockHtml("ima-cmd")}
          ${copyButtonHtml("ima-cmd-copy")}
        </div>
        <p class="ipk-hint">
          This reads every rotated <code>AppWorkload*.log</code> file and keeps each snapshot's own CMTrace
          timestamp, so entries always sort chronologically regardless of log rotation or paste order. Re-run it
          any time to capture newer check-ins, then paste the full output again — it fully replaces the view below.
          <code>TargetType</code> isn't officially documented by Microsoft, so its label is shown with a "?" as a
          best-effort guess, never as fact. Requires <strong>PowerShell 7+</strong> (<code>pwsh</code>) — run it
          from a PowerShell 7 console, or via <code>pwsh -Command "..."</code> from Windows PowerShell 5.1.
        </p>

        <label class="ima-step-label" for="ima-input">2. Paste it here (<kbd>Ctrl</kbd>+<kbd>V</kbd> — it's already on your clipboard)</label>
        <textarea id="ima-input" class="mono" rows="6" placeholder="Paste the JSON output here..."></textarea>
        <div id="ima-status" class="ima-status" role="alert"></div>

        <label class="ima-toggle" id="ima-toggle-wrap" hidden>
          <input type="checkbox" id="ima-only-changes" checked />
          Only show added / removed / changed apps after the first check-in
        </label>

        <ol id="ima-timeline" class="ima-timeline"></ol>
      </div>
    `;

    const cmdEl = container.querySelector<HTMLElement>("#ima-cmd")!;
    setPowerShellCode(cmdEl, EXPORT_COMMAND);
    const cmdCopyBtn = container.querySelector<HTMLButtonElement>("#ima-cmd-copy")!;
    wireCopyButton(cmdCopyBtn, () => EXPORT_COMMAND);

    const input = container.querySelector<HTMLTextAreaElement>("#ima-input")!;
    const statusEl = container.querySelector<HTMLDivElement>("#ima-status")!;
    const timelineEl = container.querySelector<HTMLOListElement>("#ima-timeline")!;
    const toggleWrap = container.querySelector<HTMLLabelElement>("#ima-toggle-wrap")!;
    const onlyChangesInput = container.querySelector<HTMLInputElement>("#ima-only-changes")!;

    const render = () => {
      const raw = input.value.trim();
      if (!raw) {
        statusEl.textContent = "";
        timelineEl.innerHTML = "";
        toggleWrap.hidden = true;
        return;
      }
      try {
        const { snapshots, errors } = parseImeAppsExport(raw);
        if (snapshots.length === 0) {
          statusEl.textContent = "No snapshots found in that JSON.";
          timelineEl.innerHTML = "";
          toggleWrap.hidden = true;
          return;
        }
        statusEl.innerHTML = errorsHtml(errors);
        toggleWrap.hidden = snapshots.length < 2;

        const onlyChanges = onlyChangesInput.checked;
        let prevApps: ImeSnapshot["apps"] | null = null;
        timelineEl.innerHTML = snapshots
          .map((snapshot, i) => {
            const diffs = diffApps(prevApps, snapshot.apps);
            prevApps = snapshot.apps;
            return snapshotHtml(snapshot, diffs, i === 0, onlyChanges);
          })
          .join("");
      } catch (err) {
        statusEl.textContent = err instanceof Error ? err.message : "Couldn't parse that input.";
        timelineEl.innerHTML = "";
        toggleWrap.hidden = true;
      }
    };

    input.addEventListener("input", render);
    onlyChangesInput.addEventListener("change", render);

    return () => {
      input.removeEventListener("input", render);
      onlyChangesInput.removeEventListener("change", render);
    };
  },
};

export default tool;
