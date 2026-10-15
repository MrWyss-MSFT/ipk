import "./style.css";
import { copyButtonHtml, wireCopyButton } from "@/app/copy-button";
import { wireGlobalPaste } from "@/app/global-paste";
import { makePsCommandVariants, psCommandTabsHtml, wirePsCommandTabs } from "@/app/ps-command";
import type { ToolDefinition } from "@/types/tool";
import { decodeEdidHex, parseEdidInput, type DecodedEdid, type EdidInputEntry } from "./parse";

const PS_SETUP = `$tech = @{}; Get-CimInstance -Namespace root\\wmi WmiMonitorConnectionParams | Where-Object Active | ForEach-Object { $tech[$_.InstanceName -replace '^DISPLAY\\\\|_\\d+$'] = $_.VideoOutputTechnology }; `;

const PS_VALUE_EXPR = `Get-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Enum\\DISPLAY\\*\\*\\Device Parameters' EDID -ErrorAction SilentlyContinue | ForEach-Object {
  $path = $_.PSParentPath -replace '.*DISPLAY\\\\'
  [ordered]@{ DevicePath = $path; Connected = $tech.ContainsKey($path); Internal = $tech[$path] -eq -2147483648; EDIDHex = -join ($_.EDID | ForEach-Object { $_.ToString('X2') }) }
} | ConvertTo-Json`;

const PS_VARIANTS = makePsCommandVariants(PS_VALUE_EXPR, { setup: PS_SETUP });

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
    return `<span class="edd-leaf-value edd-empty">—</span>`;
  }
  const text = typeof value === "boolean" ? (value ? "Yes" : "No") : String(value);
  return `<span class="edd-leaf-value mono" data-copy-value="${escapeHtml(text)}" title="Click to copy">${escapeHtml(
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
      <details class="edd-node">
        <summary class="edd-node-label">${escapeHtml(label)}</summary>
        <div class="edd-children">${children}</div>
      </details>
    `;
  }
  return `
    <div class="edd-leaf-row">
      <span class="edd-leaf-label">${escapeHtml(label)}</span>
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

function overviewRow(label: string, value: string): string {
  return `
    <div class="edd-overview-row">
      <span class="edd-overview-label">${escapeHtml(label)}</span>
      <span class="edd-overview-value">${escapeHtml(value)}</span>
    </div>
  `;
}

/** Whether any CEA-861 extension block advertises HDR (HDR10/PQ or HLG) support. */
function hasHdrSupport(decoded: DecodedEdid): boolean {
  return decoded.extensions.some(
    (ext) =>
      ext.isCea861 &&
      ext.dataBlocks.some((db) => db.kind === "hdrStaticMetadata" && (db.metadata.supportsSmpteSt2084 || db.metadata.supportsHlg)),
  );
}

function summarizeExtensions(decoded: DecodedEdid): string {
  const cea = decoded.extensions.filter((e) => e.isCea861);
  if (cea.length === 0) return `${decoded.extensionBlockCount} (not CEA-861)`;

  const videoVics = new Set<number>();
  let hasAudio = false;
  let hasHdmi = false;
  for (const ext of cea) {
    for (const db of ext.dataBlocks) {
      if (db.kind === "video" || db.kind === "ycbcr420Video") db.descriptors.forEach((d) => videoVics.add(d.vic));
      if (db.kind === "audio") hasAudio = true;
      if (db.kind === "vendorSpecific" && (db.block.kind === "hdmi" || db.block.kind === "hdmiForum")) hasHdmi = true;
    }
  }
  const hasHdr = hasHdrSupport(decoded);
  const parts = [`${videoVics.size} extra resolution${videoVics.size === 1 ? "" : "s"}`];
  if (hasAudio) parts.push("audio");
  if (hasHdmi) parts.push("HDMI");
  if (hasHdr) parts.push("HDR");
  return `${decoded.extensionBlockCount} (${parts.join(", ")})`;
}

/** Diagonal screen size in inches, derived from the EDID's max horizontal/vertical image size - null when undefined. */
function screenSizeInches(decoded: DecodedEdid): number | null {
  if (decoded.screenSizeUndefined) return null;
  return Math.sqrt(decoded.maxHorizontalImageSizeCm ** 2 + decoded.maxVerticalImageSizeCm ** 2) / 2.54;
}

function renderOverview(decoded: DecodedEdid): string {
  const preferred = decoded.preferredTiming;
  const resolution = preferred
    ? `${preferred.horizontalActivePixels}x${preferred.verticalActiveLines} @ ${Math.round(preferred.refreshRateHz)}Hz`
    : "Not specified";
  const sizeCm = decoded.screenSizeUndefined
    ? "Not specified"
    : `${decoded.maxHorizontalImageSizeCm} x ${decoded.maxVerticalImageSizeCm} cm`;
  const sizeInches = screenSizeInches(decoded);

  return `
    <div class="edd-overview">
      ${overviewRow("Monitor name", decoded.monitorName ?? "Not specified")}
      ${overviewRow("Manufacturer", decoded.manufacturerId)}
      ${overviewRow("Product code", decoded.productCodeHex)}
      ${overviewRow("Serial number", decoded.serialNumberString ?? decoded.serialNumberHex)}
      ${overviewRow(
        "Manufactured",
        decoded.yearIsModelYear
          ? `Model year ${decoded.manufactureYear}`
          : decoded.manufactureWeek
            ? `Week ${decoded.manufactureWeek}, ${decoded.manufactureYear}`
            : `${decoded.manufactureYear}`,
      )}
      ${overviewRow("Native resolution", resolution)}
      ${overviewRow("Screen size", sizeInches ? `${sizeCm} (~${sizeInches.toFixed(1)}")` : sizeCm)}
      ${overviewRow("EDID version", decoded.edidVersion)}
      ${overviewRow(
        "Video input",
        decoded.videoInput.signalType === "Digital"
          ? `Digital - ${decoded.videoInput.videoInterface}, ${decoded.videoInput.bitDepth}`
          : `Analog - ${decoded.videoInput.signalLevelStandard}`,
      )}
      ${overviewRow("Checksum", decoded.checksumValid ? "Valid" : "Invalid")}
      ${decoded.extensionBlockCount > 0 ? overviewRow("Extension blocks", summarizeExtensions(decoded)) : ""}
    </div>
  `;
}

interface RenderedEntry {
  html: string;
  /** Raw JSON to wire up for the copy button, keyed by the entry's copy button id. Absent when the entry failed to decode. */
  copy?: { id: string; json: string };
}

/** Finds the highest-resolution mode (by pixel count) and the highest refresh rate across all DTDs, standard timings, and CEA video modes - these can come from different modes (e.g. 4K@60 and 1080p@144). */
function summarizeCapabilities(decoded: DecodedEdid): { maxResolution: string; maxRefreshHz: number } | null {
  let bestPixels = 0;
  let bestWidth = 0;
  let bestHeight = 0;
  let bestRefreshHz = 0;

  const consider = (width: number, height: number, refreshHz: number) => {
    const pixels = width * height;
    if (pixels > bestPixels) {
      bestPixels = pixels;
      bestWidth = width;
      bestHeight = height;
    }
    if (refreshHz > bestRefreshHz) bestRefreshHz = refreshHz;
  };

  for (const d of decoded.descriptors) {
    if (d.type === "detailedTiming") consider(d.horizontalActivePixels, d.verticalActiveLines, d.refreshRateHz);
  }
  for (const st of decoded.standardTimings) consider(st.horizontalPixels, st.verticalPixels, st.refreshRateHz);
  for (const ext of decoded.extensions) {
    if (!ext.isCea861) continue;
    for (const db of ext.dataBlocks) {
      if (db.kind === "video" || db.kind === "ycbcr420Video") {
        for (const vic of db.descriptors) consider(vic.width, vic.height, vic.refreshHz);
      }
    }
  }

  if (bestPixels === 0) return null;
  return { maxResolution: `${bestWidth}x${bestHeight}`, maxRefreshHz: Math.round(bestRefreshHz) };
}

function renderBadges(entry: EdidInputEntry, decoded?: DecodedEdid): string {
  const badges: string[] = [];
  if (entry.connected) badges.push(`<span class="edd-badge edd-badge-connected">Connected</span>`);
  if (entry.internal) badges.push(`<span class="edd-badge edd-badge-internal">Internal</span>`);
  if (decoded && hasHdrSupport(decoded)) badges.push(`<span class="edd-badge edd-badge-hdr">HDR</span>`);
  return badges.length ? `<span class="edd-badges">${badges.join("")}</span>` : "";
}

function renderEstablishedTimings(decoded: DecodedEdid): string {
  if (decoded.establishedTimings.length === 0) return "";
  const chips = decoded.establishedTimings.map((t) => `<span class="edd-timing-chip">${escapeHtml(t)}</span>`).join("");
  return `<div class="edd-timings"><span class="edd-timings-label">Established timings</span>${chips}</div>`;
}

function renderEntry(entry: EdidInputEntry, index: number, total: number): RenderedEntry {
  const fallbackHeading = total > 1 ? entry.devicePath ?? `Monitor #${index + 1}` : entry.devicePath ?? "Monitor";

  let decoded: DecodedEdid;
  try {
    decoded = decodeEdidHex(entry.hex);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to decode EDID.";
    return {
      html: `
        <section class="edd-entry">
          <h2 class="edd-entry-heading">${escapeHtml(fallbackHeading)}${renderBadges(entry)}</h2>
          <p class="edd-error" role="alert">${escapeHtml(message)}</p>
        </section>
      `,
    };
  }

  const badges = renderBadges(entry, decoded);

  // Prefer the monitor's own name (from its EDID), falling back to the device path/index.
  // When a name is shown, keep the device path visible as a subtitle - EDID monitor names
  // aren't guaranteed unique (e.g. a laptop's two identical built-in panel instances).
  const heading = decoded.monitorName ?? fallbackHeading;
  const subtitle = decoded.monitorName && entry.devicePath ? `<span class="edd-entry-subtitle mono">${escapeHtml(entry.devicePath)}</span>` : "";

  const capabilities = summarizeCapabilities(decoded);
  const sizeInches = screenSizeInches(decoded);
  const metaParts: string[] = [];
  if (sizeInches) metaParts.push(`${sizeInches.toFixed(1)}"`);
  if (capabilities) metaParts.push(`(${capabilities.maxResolution}, ${capabilities.maxRefreshHz}Hz)`);
  const meta = metaParts.length ? `<span class="edd-entry-meta">${escapeHtml(metaParts.join(" "))}</span>` : "";

  const rawJson = JSON.stringify(decoded, null, 2);
  const copyId = `edd-raw-copy-${index}`;
  return {
    html: `
      <section class="edd-entry">
        <h2 class="edd-entry-heading">${escapeHtml(heading)}${meta}${badges}</h2>
        ${subtitle}
        ${!decoded.checksumValid ? `<p class="edd-warning">⚠️ Checksum did not validate - this data may be truncated or corrupted.</p>` : ""}
        ${renderOverview(decoded)}
        ${renderEstablishedTimings(decoded)}
        <details class="edd-details">
          <summary>All decoded fields</summary>
          <div class="edd-tree">${renderTree(decoded as unknown as Record<string, unknown>)}</div>
        </details>
        <details class="edd-raw">
          <summary>Raw JSON</summary>
          <div class="ipk-copy-wrap">
            <pre class="ipk-code mono edd-raw-json">${escapeHtml(rawJson)}</pre>
            ${copyButtonHtml(copyId)}
          </div>
        </details>
      </section>
    `,
    copy: { id: copyId, json: rawJson },
  };
}

const tool: ToolDefinition = {
  id: "edid-decoder",
  name: "EDID Decoder",
  description:
    "Decode a monitor's EDID (Extended Display Identification Data) into manufacturer, native resolution, size, and supported timings.",
  category: "Converters",
  keywords: ["edid", "monitor", "display", "vesa", "resolution", "refresh rate", "panel", "native resolution"],
  icon: "🖥️",
  stage: "alpha",
  mount(container) {
    container.innerHTML = `
      <div class="edd-tool">
        <p class="edd-step-label">1. Get the EDID for connected monitor(s) <span class="ipk-step-note">(copies to clipboard)</span></p>
        ${psCommandTabsHtml("edd-snippet")}
        <p class="edd-step-label">2. Paste anywhere on the page</p>
        <label class="edd-field-label" for="edd-input">EDID hex, or the JSON from the command above</label>
        <textarea
          id="edd-input"
          class="mono"
          rows="6"
          placeholder='00FFFFFFFFFFFF00... or [{"DevicePath":"...","EDIDHex":"00FFFFFFFFFFFF00..."}]'
        ></textarea>
        <span class="edd-error" id="edd-top-error" role="alert"></span>
        <div class="edd-results" id="edd-results"></div>
      </div>
    `;

    const input = container.querySelector<HTMLTextAreaElement>("#edd-input")!;
    const topError = container.querySelector<HTMLSpanElement>("#edd-top-error")!;
    const results = container.querySelector<HTMLDivElement>("#edd-results")!;

    const render = () => {
      topError.textContent = "";
      if (!input.value.trim()) {
        results.innerHTML = "";
        return;
      }
      try {
        const entries = parseEdidInput(input.value);
        if (entries.length === 0) {
          results.innerHTML = "";
          return;
        }
        const rendered = entries.map((entry, i) => renderEntry(entry, i, entries.length));
        results.innerHTML = rendered.map((r) => r.html).join("");
        for (const r of rendered) {
          if (!r.copy) continue;
          const btn = results.querySelector<HTMLButtonElement>(`#${r.copy.id}`);
          if (btn) wireCopyButton(btn, () => r.copy!.json);
        }
      } catch (err) {
        results.innerHTML = "";
        topError.textContent = err instanceof Error ? err.message : "Failed to parse input.";
      }
    };

    const onResultsClick = async (e: MouseEvent) => {
      const leaf = (e.target as HTMLElement).closest<HTMLElement>(".edd-leaf-value:not(.edd-empty)");
      if (leaf) {
        const value = leaf.dataset.copyValue ?? leaf.textContent ?? "";
        if (!value) return;
        await navigator.clipboard.writeText(value);
        leaf.classList.remove("is-copied");
        void leaf.offsetWidth;
        leaf.classList.add("is-copied");
      }
    };

    input.addEventListener("input", render);
    results.addEventListener("click", onResultsClick);
    const unwireGlobalPaste = wireGlobalPaste(input);
    const unwirePsTabs = wirePsCommandTabs(container, "edd-snippet", PS_VARIANTS);

    return () => {
      input.removeEventListener("input", render);
      results.removeEventListener("click", onResultsClick);
      unwireGlobalPaste();
      unwirePsTabs();
    };
  },
};

export default tool;
