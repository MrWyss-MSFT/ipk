import "./style.css";
import { makePsCommandVariants, psCommandTabsHtml, wirePsCommandTabs } from "@/app/ps-command";
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
// there" convention. The decoded Apps payload is re-wrapped with `@(...)`
// before nesting it in the snapshot object: in Windows PowerShell 5.1,
// re-serializing a bare ConvertFrom-Json array nested in another object
// turns it into `{"value":[...],"Count":n}` instead of a plain array —
// `@(...)` forces a real PowerShell array so ConvertTo-Json emits `[...]`
// consistently on both PS 5.1 and 7+.
const PS_VARIANTS = makePsCommandVariants(
  '(Select-String -Path \'C:\\ProgramData\\Microsoft\\IntuneManagementExtension\\Logs\\AppWorkload*.log\' -Pattern \'<!\\[LOG\\[Get policies = (.*?)\\]LOG\\]!><time="([^"]+)" date="([^"]+)"\').ForEach({[pscustomobject]@{Date=$_.Matches.Groups[3].Value;Time=$_.Matches.Groups[2].Value;Apps=@($_.Matches.Groups[1].Value | ConvertFrom-Json)}}) | ConvertTo-Json -Depth 12 -Compress',
  { varName: "ime" },
);

function escapeHtml(value: string): string {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}

function formatSnapshotLabel(snapshot: ImeSnapshot): string {
  if (snapshot.timestampMs !== null) {
    // With a real bias, timestampMs is a true UTC instant — convert to the
    // viewer's own local timezone. Without one, timestampMs only preserves
    // the raw device-local numbers (parsed as if UTC), so format it back out
    // in UTC to avoid a spurious conversion through the viewer's timezone.
    const zone = snapshot.hasBias ? undefined : "UTC";
    return new Date(snapshot.timestampMs).toLocaleString(undefined, zone ? { timeZone: zone } : undefined);
  }
  return `${snapshot.dateRaw} ${snapshot.timeRaw}`.trim() || "(unknown time)";
}

const STATUS_LABEL: Record<ImeAppDiff["status"], string> = {
  added: "Added",
  removed: "Removed",
  changed: "Changed",
  unchanged: "Unchanged",
};

/** Small visual cue next to the intent text — see `INTENT_LABELS` in parse.ts for the numeric meaning. */
const INTENT_ICON: Record<number, string> = {
  0: "➖",
  1: "📥",
  3: "📌",
  4: "🗑️",
  5: "🌐",
};

function intentIcon(intent: number | null): string {
  return intent !== null && INTENT_ICON[intent] ? INTENT_ICON[intent] : "";
}

/** Small visual cue next to the target-type text — see `TARGET_TYPE_LABELS` in parse.ts for the numeric meaning. */
const TARGET_TYPE_ICON: Record<number, string> = {
  0: "➖",
  1: "👤",
  2: "🖥️",
  3: "👤🖥️",
};

function targetTypeIcon(targetType: number | null): string {
  return targetType !== null && TARGET_TYPE_ICON[targetType] ? TARGET_TYPE_ICON[targetType] : "";
}

/** Drops the trailing " (n)" raw-value suffix from intentLabel()/targetTypeLabel() — the icon already conveys it. */
function stripNumberSuffix(label: string): string {
  return label.replace(/\s*\(\d+\)$/, "");
}

/**
 * Many app fields are themselves JSON *strings* (e.g. `InstallEx`,
 * `RequirementRules`) — attempt to parse and pretty-print them so they read
 * like structured data instead of an escaped one-liner; fall back to the
 * raw string (or a dash for empty values) when parsing doesn't apply.
 */
function renderFieldValue(raw: unknown): string {
  if (raw === null || raw === undefined || raw === "") {
    return `<span class="ima-field-empty">—</span>`;
  }
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      value = raw;
    }
  }
  if (typeof value === "object" && value !== null) {
    return `<pre class="ipk-code mono ima-field-pre">${escapeHtml(JSON.stringify(value, null, 2))}</pre>`;
  }
  return `<span class="mono">${escapeHtml(String(value))}</span>`;
}

/** Curated set of the fields most useful to inspect per app, beyond the name/intent/type already shown in the summary row. */
const DETAIL_FIELDS: { key: string; label: string }[] = [
  { key: "InstallCommandLine", label: "Install command" },
  { key: "UninstallCommandLine", label: "Uninstall command" },
  { key: "SetUpFilePath", label: "Setup file" },
  { key: "DetectionRule", label: "Detection rule" },
  { key: "RequirementRules", label: "Requirement rules" },
  { key: "ExtendedRequirementRules", label: "Extended requirement rules" },
  { key: "InstallEx", label: "Install behavior settings" },
  { key: "RebootEx", label: "Reboot behavior" },
  { key: "ReturnCodes", label: "Return codes" },
  { key: "InstallBehavior", label: "Install behavior" },
  { key: "AvailableAppEnforcement", label: "Available app enforcement" },
  { key: "InstallContext", label: "Install context" },
  { key: "ReevaluationInterval", label: "Re-evaluation interval (min)" },
  { key: "InstallerData", label: "Installer data" },
  { key: "ESPConfiguration", label: "ESP configuration" },
];

function appDetailFieldsHtml(raw: Record<string, unknown>): string {
  const rows = DETAIL_FIELDS.filter((f) => raw[f.key] !== undefined && raw[f.key] !== null && raw[f.key] !== "")
    .map(
      (f) => `
        <div class="ima-detail-row">
          <span class="ima-detail-label">${escapeHtml(f.label)}</span>
          <div class="ima-detail-value">${renderFieldValue(raw[f.key])}</div>
        </div>
      `,
    )
    .join("");
  return rows ? `<div class="ima-detail-grid">${rows}</div>` : `<p class="ima-empty">No additional details available.</p>`;
}

/**
 * `ESPConfiguration.IsSelectedApp` marks a Win32 app as a "blocking" app in
 * an Enrollment Status Page profile — confirmed by community documentation
 * of Intune's "Only fail selected blocking apps" ESP feature. Shown as a
 * per-app badge.
 */
function espBadgeHtml(raw: Record<string, unknown>): string {
  const esp = raw.ESPConfiguration;
  if (!esp || typeof esp !== "object") return "";
  const isSelected = (esp as Record<string, unknown>).IsSelectedApp === true;
  if (!isSelected) return "";
  const bestEffort = (esp as Record<string, unknown>).InstallWithBestEffort === true;
  return `<span class="ima-badge ima-badge-esp" title="ESPConfiguration.IsSelectedApp = true: configured as a blocking app in an Enrollment Status Page profile">ESP blocking${bestEffort ? " · best effort" : ""}</span>`;
}

/**
 * The `ESPConfiguration` key itself (regardless of `IsSelectedApp`) is only
 * present on an app's policy while the device is still going through
 * Enrollment Status Page — once ESP completes it drops off entirely on
 * later check-ins. So its presence on *any* app in a snapshot is a reliable
 * check-in-level "this happened during ESP" signal, shown at the timeline
 * entry level (separate from the per-app "blocking" badge above).
 */
function espCheckInBadgeHtml(snapshot: ImeSnapshot): string {
  const inEsp = snapshot.apps.some((app) => app.raw.ESPConfiguration !== null && app.raw.ESPConfiguration !== undefined);
  if (!inEsp) return "";
  return `<span class="ima-badge ima-badge-esp" title="At least one app in this check-in has an ESPConfiguration, meaning the device was still going through Enrollment Status Page">In ESP</span>`;
}

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
        <span class="ima-app-meta">${intentIcon(diff.app.intent)} ${escapeHtml(stripNumberSuffix(intentLabel(diff.app.intent)))} · ${targetTypeIcon(diff.app.targetType)} ${escapeHtml(stripNumberSuffix(targetTypeLabel(diff.app.targetType)))}${diff.app.version !== null ? ` · v${diff.app.version}` : ""} · <span class="ima-app-guid mono" data-guid="${escapeHtml(diff.app.id)}" title="Click to copy">${escapeHtml(diff.app.id)}</span></span>
        ${espBadgeHtml(diff.app.raw)}
      </summary>
      <div class="ima-app-detail">
        ${
          diff.fieldDiffs.length > 0
            ? `<table class="ima-diff-table">
                <thead><tr><th>Field</th><th>Before</th><th>After</th></tr></thead>
                <tbody>${fieldRows}</tbody>
              </table>`
            : ""
        }
        ${diff.fieldDiffs.length === 0 ? appDetailFieldsHtml(diff.app.raw) : ""}
        <details class="ima-raw">
          <summary>Raw JSON</summary>
          <pre class="ipk-code mono">${escapeHtml(JSON.stringify(diff.app.raw, null, 2))}</pre>
        </details>
      </div>
    </details>
  `;
}

function snapshotHtml(snapshot: ImeSnapshot, diffs: ImeAppDiff[], isFirst: boolean, isLast: boolean, isEmptyGap: boolean): string {
  // On the baseline there's no "change" concept yet (every app is reported
  // as "unchanged" by diffApps when prevApps is null) so it always shows
  // the full app list. The last check-in is the device's current state, so
  // it's shown the same way for the same reason, every app matters there
  // even if it happens to be unchanged from the previous check-in. Every
  // other check-in hides unchanged apps by default, tucking them behind an
  // expandable "N unchanged" pill instead.
  const showFull = isFirst || isLast;
  const visibleDiffs = showFull ? diffs : diffs.filter((d) => d.status !== "unchanged");
  const hiddenUnchanged = showFull ? [] : diffs.filter((d) => d.status === "unchanged");
  const added = diffs.filter((d) => d.status === "added").length;
  const removed = diffs.filter((d) => d.status === "removed").length;
  const changed = diffs.filter((d) => d.status === "changed").length;

  const summaryBadges =
    (isFirst
      ? `<span class="ima-badge ima-badge-baseline">Baseline · ${snapshot.apps.length} apps</span>`
      : isEmptyGap
        ? `<span class="ima-badge ima-badge-gap">Empty check-in · ignored</span>`
        : [
            isLast ? `<span class="ima-badge ima-badge-baseline">Latest · ${snapshot.apps.length} apps</span>` : "",
            added ? `<span class="ima-badge ima-badge-added">+${added}</span>` : "",
            removed ? `<span class="ima-badge ima-badge-removed">-${removed}</span>` : "",
            changed ? `<span class="ima-badge ima-badge-changed">${changed} changed</span>` : "",
          ].join("")) + espCheckInBadgeHtml(snapshot);

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
              : `<p class="ima-empty">${
                  isEmptyGap
                    ? "No apps reported in this check-in, likely a transient gap in the log (e.g. mid-sync), so it isn't treated as every app being removed."
                    : "No apps in this snapshot."
                }</p>`
          }
          ${
            hiddenUnchanged.length > 0
              ? `<details class="ima-unchanged-toggle">
                  <summary class="ima-badge ima-badge-unchanged">${hiddenUnchanged.length} unchanged, click to show</summary>
                  ${hiddenUnchanged.map(appDiffHtml).join("")}
                </details>`
              : ""
          }
        </div>
      </div>
    </li>
  `;
}

/**
 * A run of consecutive check-ins with no app changes at all (relative to
 * the last known-good state) gets collapsed into a single compact marker —
 * "+N unchanged check-ins" — instead of eating vertical space one row per
 * check-in. Expanding it reveals each check-in's own timestamp.
 */
function unchangedRunHtml(snapshots: ImeSnapshot[]): string {
  if (snapshots.length === 1) {
    return `
      <li class="ima-entry ima-entry-run">
        <div class="ima-entry-dot ima-entry-dot-run"></div>
        <div class="ima-entry-body ima-entry-run-body">
          <div class="ima-entry-header">
            <span class="ima-entry-time">${escapeHtml(formatSnapshotLabel(snapshots[0]))}</span>
            <span class="ima-badge ima-badge-unchanged">No changes</span>
            ${espCheckInBadgeHtml(snapshots[0])}
          </div>
        </div>
      </li>
    `;
  }
  const first = formatSnapshotLabel(snapshots[0]);
  const last = formatSnapshotLabel(snapshots[snapshots.length - 1]);
  const rows = snapshots
    .map(
      (s) => `
        <div class="ima-run-row">
          <span class="ima-entry-time">${escapeHtml(formatSnapshotLabel(s))}</span>
          <span class="ima-badge ima-badge-unchanged">No changes</span>
          ${espCheckInBadgeHtml(s)}
        </div>
      `,
    )
    .join("");
  return `
    <li class="ima-entry ima-entry-run">
      <div class="ima-entry-dot ima-entry-dot-run"></div>
      <details class="ima-entry-body ima-entry-run-body">
        <summary class="ima-entry-summary ima-run-summary">
          <span class="ima-badge ima-badge-unchanged">+${snapshots.length} unchanged check-ins</span>
          <span class="ima-run-range">${escapeHtml(first)} – ${escapeHtml(last)}</span>
        </summary>
        <div class="ima-run-rows">${rows}</div>
      </details>
    </li>
  `;
}

function errorsHtml(errors: ImeParseError[]): string {
  if (errors.length === 0) return "";
  return `<p class="ima-error">${errors.map((e) => escapeHtml(e.message)).join("<br/>")}</p>`;
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
        <p class="ipk-hint">
          Reads every rotated <code>AppWorkload*.log</code> file, covering both required and available
          (Company Portal) check-ins, the latter only run on sync/logon or an 8h fallback, so a newly assigned
          app may lag behind Company Portal.
        </p>

        <p class="ima-step-label">1. Run this on the device — copies to clipboard</p>
        ${psCommandTabsHtml("ima-cmd", { requiresAdmin: true })}

        <label class="ima-step-label" for="ima-input">2. Paste it here (<kbd>Ctrl</kbd>+<kbd>V</kbd>)</label>
        <textarea
          id="ima-input"
          class="mono"
          rows="6"
          placeholder='[{"Date":"10-5-2026","Time":"14:22:10.123+120","Apps":[{"Id":"11111111-2222-3333-4444-555555555555","Name":"7-Zip","Version":24,"Intent":1,"TargetType":2}]},...]'
        ></textarea>
        <div id="ima-status" class="ima-status" role="alert"></div>

        <div class="ima-toggles" id="ima-toggle-wrap" hidden>
          <label class="ima-toggle">
            <input type="checkbox" id="ima-hide-gaps" />
            Hide empty check-ins (ignored gaps)
          </label>
        </div>

        <ol id="ima-timeline" class="ima-timeline"></ol>
      </div>
    `;

    const unwirePsTabs = wirePsCommandTabs(container, "ima-cmd", PS_VARIANTS);

    const input = container.querySelector<HTMLTextAreaElement>("#ima-input")!;
    const statusEl = container.querySelector<HTMLDivElement>("#ima-status")!;
    const timelineEl = container.querySelector<HTMLOListElement>("#ima-timeline")!;
    const toggleWrap = container.querySelector<HTMLDivElement>("#ima-toggle-wrap")!;
    const hideGapsInput = container.querySelector<HTMLInputElement>("#ima-hide-gaps")!;

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
        const hasNoBiasEntries = snapshots.some((s) => s.timestampMs !== null && !s.hasBias);
        const tzNote = hasNoBiasEntries
          ? `<p class="ipk-warn">Someone thought device-local time with no UTC offset was a good idea 😡. Times below are shown as-is, compare against the device's own clock. Snapshots are still ordered correctly top-to-bottom (that follows the log's own order, not this timestamp), even across a time zone change.</p>`
          : "";
        statusEl.innerHTML = errorsHtml(errors) + tzNote;
        toggleWrap.hidden = snapshots.length < 2;

        const hideGaps = hideGapsInput.checked;
        let prevApps: ImeSnapshot["apps"] | null = null;
        // Consecutive check-ins with nothing actionable (no adds/removes/
        // changes) are buffered and flushed as a single collapsed
        // "+N unchanged check-ins" marker instead of one row per check-in —
        // the baseline, any empty-gap, and anything with real changes always
        // breaks/flushes the run and renders as its own full entry.
        let unchangedRun: ImeSnapshot[] = [];
        const html: string[] = [];
        const flushRun = () => {
          if (unchangedRun.length === 0) return;
          html.push(unchangedRunHtml(unchangedRun));
          unchangedRun = [];
        };

        snapshots.forEach((snapshot, i) => {
          // A 0-app snapshot sandwiched between non-empty ones is usually
          // a transient gap in the log (e.g. IME briefly re-evaluating
          // mid-sync), not a real mass-uninstall — we can't know the full
          // app state from before the log started either, so treat this
          // the same way as "unknown baseline": don't diff it as removals,
          // and don't let it poison the *next* snapshot's diff into
          // showing everything as freshly "added".
          const isEmptyGap = i > 0 && snapshot.apps.length === 0 && prevApps !== null && prevApps.length > 0;
          const diffs = isEmptyGap ? [] : diffApps(prevApps, snapshot.apps);
          if (!isEmptyGap) prevApps = snapshot.apps;

          if (isEmptyGap && hideGaps) {
            // Skip it entirely — not even a run marker — without flushing a
            // pending unchanged run, so an unchanged streak still merges
            // across a hidden gap instead of being needlessly split in two.
            return;
          }

          const isFirst = i === 0;
          const isLast = i === snapshots.length - 1;
          const hasChanges = diffs.some((d) => d.status !== "unchanged");
          const isCollapsible = !isFirst && !isLast && !isEmptyGap && !hasChanges;

          if (isCollapsible) {
            unchangedRun.push(snapshot);
            return;
          }
          flushRun();
          html.push(snapshotHtml(snapshot, diffs, isFirst, isLast, isEmptyGap));
        });
        flushRun();

        timelineEl.innerHTML = html.join("");
      } catch (err) {
        statusEl.textContent = err instanceof Error ? err.message : "Couldn't parse that input.";
        timelineEl.innerHTML = "";
        toggleWrap.hidden = true;
      }
    };

    input.addEventListener("input", render);
    hideGapsInput.addEventListener("change", render);

    const onTimelineClick = async (e: MouseEvent) => {
      const guidEl = (e.target as HTMLElement).closest<HTMLElement>(".ima-app-guid");
      if (!guidEl) return;
      // Prevent the click from also toggling the parent <details> open/closed.
      e.preventDefault();
      e.stopPropagation();
      const value = guidEl.dataset.guid ?? guidEl.textContent ?? "";
      if (!value) return;
      await navigator.clipboard.writeText(value);
      guidEl.classList.remove("is-copied");
      // Force reflow so retriggering the animation on repeated clicks restarts it.
      void guidEl.offsetWidth;
      guidEl.classList.add("is-copied");
    };
    timelineEl.addEventListener("click", onTimelineClick);

    return () => {
      input.removeEventListener("input", render);
      hideGapsInput.removeEventListener("change", render);
      timelineEl.removeEventListener("click", onTimelineClick);
      unwirePsTabs();
    };
  },
};

export default tool;
