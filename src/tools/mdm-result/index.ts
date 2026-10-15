import "./style.css";
import { wireGlobalPaste } from "@/app/global-paste";
import { makePsCommandVariants, psCommandTabsHtml, wirePsCommandTabs } from "@/app/ps-command";
import type { ToolDefinition } from "@/types/tool";
import { parseMdmDiagReport, type CspPolicyRow } from "./parse";

// Runs the built-in MdmDiagnosticsTool.exe (admin-elevated) into a throwaway
// temp folder, then reads the XML report it produces back out — mirrors
// jonasatgit/IntuneDebug's own `Start-Process MdmDiagnosticsTool.exe -out ...`
// call. This is inherently multi-statement (run the tool, then read a file),
// so it needs the `setup` option rather than a single pipeline expression.
//
// MDMDiagReport.xml is normally several MB. Our parser only ever reads four
// top-level sections — `Enrollments`/`ProvisioningResults` (resolve the
// "Intune"/"Local" provider label) and `PolicyManager`/`PolicyManagerMeta`
// (the actual policy values + metadata) — so every other top-level section
// (`SystemInformation`, `Schedules`, `HealthAttestation`, `LAPS`, etc.) is
// dropped outright, in the same pass as `PolicyManager/IngestedADMXPolicyMetaData`
// (raw contents of every ingested ADMX file, e.g. Office/Edge — can be
// 700KB+ on its own), which is never read either. `PolicyManagerMeta/AreaMetadata`
// lists default-value metadata for *every* policy in *every* CSP policy area
// known to the OS (hundreds of areas, often far more policies per area than
// are actually configured — e.g. `Update` can carry 100 metadata entries
// when only 20 are configured); filtering by area name alone isn't enough on
// real-world reports (confirmed: only shrank one real device's report from
// 3.6MB to 366KB), so this keeps only the `${area}|${policyName}` metadata
// pairs actually configured in `ConfigSource` (matched via flat XPath off
// `$_.ParentNode`, no loops). Leftover now-empty `AreaMetadata` wrapper nodes
// (an area with metadata but nothing configured in it) are left in place —
// trimming them isn't worth another statement given how small they are.
// Result: ~90KB (97.5% smaller) on real samples, identical parsed output.
const PS_VARIANTS = makePsCommandVariants("$Xml.OuterXml", {
  setup:
    "$Dir = Join-Path $env:TEMP 'ipk-mdmdiag'; New-Item -Path $Dir -ItemType Directory -Force | Out-Null; Start-Process -FilePath (Join-Path $env:WINDIR 'System32\\MdmDiagnosticsTool.exe') -ArgumentList \"-out `\"$Dir`\"\" -Wait -NoNewWindow; " +
    "[xml]$Xml = Get-Content -Path (Join-Path $Dir 'MDMDiagReport.xml') -Raw; " +
    "$Xml.SelectNodes('//IngestedADMXPolicyMetaData|//IngestedADMXInstallData|/*/*[not(self::Enrollments or self::ProvisioningResults or self::PolicyManager or self::PolicyManagerMeta)]') | ForEach-Object { [void]$_.ParentNode.RemoveChild($_) }; " +
    "$Keep = [System.Collections.Generic.HashSet[string]]::new(); " +
    "$Xml.SelectNodes('//PolicyManager/ConfigSource/PolicyScope/Area/*[name()!=\"PolicyAreaName\"]') | ForEach-Object { [void]$Keep.Add(\"$($_.ParentNode.PolicyAreaName)|$($_.Name)\") }; " +
    "$Xml.SelectNodes('//PolicyManagerMeta/AreaMetadata/PolicyMetadata') | Where-Object { -not $Keep.Contains(\"$($_.ParentNode.PolicyAreaName)|$($_.PolicyName)\") } | ForEach-Object { [void]$_.ParentNode.RemoveChild($_) }; ",
  varName: "report",
});

function escapeHtml(value: string): string {
  const div = document.createElement("div");
  div.textContent = value;
  // innerHTML only escapes &, <, > — also escape quotes so this is safe to
  // interpolate into double- or single-quoted HTML attributes (e.g. title=).
  return div.innerHTML.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Deterministic hue (0-359) for a string, so the same value always gets the same badge color. */
function stringHue(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i++) {
    h = (h * 31 + value.charCodeAt(i)) >>> 0;
  }
  return h % 360;
}

// Microsoft Learn's Policy CSP doc file slugs lowercase the area name and
// turn underscores into hyphens (e.g. `ADMX_Kerberos` -> `policy-csp-admx-kerberos`),
// but in-page heading anchors are plain markdown slugs that just lowercase
// (keeping underscores) (e.g. `TS_AUTO_RECONNECT` -> `#ts_auto_reconnect`) —
// confirmed against live docs pages, not assumed.
function areaDocsUrl(area: string): string {
  const slug = area.toLowerCase().replace(/_/g, "-");
  return `https://learn.microsoft.com/en-us/windows/client-management/mdm/policy-csp-${slug}`;
}

function policyDocsUrl(area: string, name: string): string {
  const anchor = name.toLowerCase().replace(/\s+/g, "-");
  return `${areaDocsUrl(area)}#${anchor}`;
}

function docsLinkHtml(url: string, label: string): string {
  return `<a class="mdm-docs-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" title="View ${escapeHtml(
    label,
  )} on Microsoft Learn" aria-label="View ${escapeHtml(label)} on Microsoft Learn">🛈</a>`;
}

// Areas with a `~` (e.g. `Microsoft-Edge~Policy~Microsoft-Edge`,
// `Office16~Policy~L-MicrosoftOfficeMachine~L-Updates`) are vendor ADMX
// ingestion namespaces, not core Windows Policy CSP areas — they don't have
// a `policy-csp-*` page on Microsoft Learn (confirmed: 404), so skip the
// link instead of pointing to a page that doesn't exist.
function hasPolicyCspDocsPage(area: string): boolean {
  return !area.includes("~");
}

function scopeLabel(row: CspPolicyRow): string {
  return row.scopeKind === "device" ? "Device" : `User (${row.scope})`;
}

function winningProviderBadgeHtml(winningProvider: string | null): string {
  if (!winningProvider) {
    return `<span class="mdm-badge mdm-badge-muted">Not set</span>`;
  }
  return `<span class="mdm-badge" style="--h:${stringHue(winningProvider)}">${escapeHtml(winningProvider)}</span>`;
}

function metadataTitle(row: CspPolicyRow): string {
  const parts: string[] = [];
  if (row.metadata.defaultValue !== null) parts.push(`Default: ${row.metadata.defaultValue}`);
  if (row.metadata.redirectPath !== null) parts.push(`Redirect: ${row.metadata.redirectPath}`);
  return parts.join(" · ");
}

function matchText(row: CspPolicyRow, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return [row.area, row.name, row.value, row.enrollmentProvider, row.winningProvider ?? ""].some((v) =>
    v.toLowerCase().includes(q),
  );
}

const tool: ToolDefinition = {
  id: "mdm-result",
  name: "MDM Result",
  stage: "alpha",
  description:
    "Turn a device's MDMDiagReport.xml into a filterable \"gpresult for Intune\" table — every applied CSP/policy value, its area, scope, and which provider (MDM vs. GP vs. local) actually won.",
  category: "Converters",
  keywords: [
    "csp",
    "mdm",
    "mdm result",
    "policy",
    "mdmdiagnosticstool",
    "mdmdiagreport",
    "policymanager",
    "gpresult",
    "winning provider",
    "intune",
    "configuration service provider",
    "enterprise diagnostics",
  ],
  icon: "🏆",
  mount(container) {
    container.innerHTML = `
      <div class="mdm-tool">
        <p class="ipk-hint">
          Settings pushed by MDM but overridden locally or by Group Policy still show up here, with
          the "winning provider" column telling you who actually won.
        </p>

        <p class="mdm-step-label">1. Run this on the device — copies to clipboard</p>
        ${psCommandTabsHtml("mdm-cmd", { requiresAdmin: true })}

        <p class="mdm-step-label">2. Paste anywhere on the page</p>
        <label class="mdm-field-label" for="mdm-input">MDM diagnostics report (XML)</label>
        <textarea
          id="mdm-input"
          class="mono"
          rows="6"
          placeholder="&lt;?xml version=&quot;1.0&quot; encoding=&quot;UTF-8&quot;?&gt;&#10;&lt;MDMEnterpriseDiagnosticsReport&gt;&#10;  &lt;EnrollmentState&gt;&#10;    &lt;EnrollmentInfo&gt;...&lt;/EnrollmentInfo&gt;&#10;  &lt;/EnrollmentState&gt;&#10;  ...&#10;&lt;/MDMEnterpriseDiagnosticsReport&gt;"
        ></textarea>
        <div id="mdm-status" class="mdm-status" role="alert"></div>

        <div id="mdm-results" hidden>
          <p id="mdm-summary" class="mdm-summary"></p>
          <details id="mdm-enrollments" class="mdm-enrollments">
            <summary id="mdm-enrollments-summary"></summary>
            <ul id="mdm-enrollments-list" class="mdm-enrollments-list"></ul>
          </details>
          <div class="mdm-filters">
            <input id="mdm-filter" class="mono" type="text" placeholder="Filter by area, policy, value, provider..." />
            <div class="mdm-scope-tabs" id="mdm-scope-tabs" role="tablist" aria-label="Scope"></div>
          </div>
          <div class="mdm-tagbar" id="mdm-tagbar"></div>
          <div class="ipk-table-scroll">
            <table class="mdm-table">
              <thead>
                <tr>
                  <th>Policy</th>
                  <th>Value</th>
                  <th>Winning provider</th>
                  <th>Scope</th>
                  <th>Enrollment</th>
                </tr>
              </thead>
              <tbody id="mdm-rows"></tbody>
            </table>
          </div>
          <p class="mdm-empty" id="mdm-empty" hidden>Nothing matches your filter.</p>
        </div>
      </div>
    `;

    const unwirePsTabs = wirePsCommandTabs(container, "mdm-cmd", PS_VARIANTS);

    const input = container.querySelector<HTMLTextAreaElement>("#mdm-input")!;
    const statusEl = container.querySelector<HTMLDivElement>("#mdm-status")!;
    const resultsEl = container.querySelector<HTMLDivElement>("#mdm-results")!;
    const summaryEl = container.querySelector<HTMLParagraphElement>("#mdm-summary")!;
    const enrollmentsSummaryEl = container.querySelector<HTMLElement>("#mdm-enrollments-summary")!;
    const enrollmentsListEl = container.querySelector<HTMLUListElement>("#mdm-enrollments-list")!;
    const filterInput = container.querySelector<HTMLInputElement>("#mdm-filter")!;
    const scopeTabsEl = container.querySelector<HTMLDivElement>("#mdm-scope-tabs")!;
    const tagbarEl = container.querySelector<HTMLDivElement>("#mdm-tagbar")!;
    const rowsEl = container.querySelector<HTMLTableSectionElement>("#mdm-rows")!;
    const emptyEl = container.querySelector<HTMLParagraphElement>("#mdm-empty")!;

    let allRows: CspPolicyRow[] = [];
    let activeScope = "all";
    const activeAreas = new Set<string>();

    function renderScopeTabs(scopes: string[]) {
      const tabs = ["all", ...scopes];
      scopeTabsEl.innerHTML = tabs
        .map(
          (s) =>
            `<button type="button" class="btn ${activeScope === s ? "btn-primary" : ""}" data-scope="${escapeHtml(s)}" role="tab">${s === "all" ? "All" : s === "Device" ? "Device" : `User (${escapeHtml(s)})`}</button>`,
        )
        .join("");
      scopeTabsEl.querySelectorAll<HTMLButtonElement>("[data-scope]").forEach((btn) => {
        btn.addEventListener("click", () => {
          activeScope = btn.dataset.scope!;
          renderTable();
        });
      });
    }

    function renderTagBar(areas: string[]) {
      tagbarEl.innerHTML = areas
        .map(
          (a) =>
            `<button type="button" class="mdm-tag ${activeAreas.has(a) ? "is-active" : ""}" style="--h:${stringHue(a)}" data-area="${escapeHtml(a)}">${escapeHtml(a)}</button>`,
        )
        .join("");
      tagbarEl.querySelectorAll<HTMLButtonElement>("[data-area]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const area = btn.dataset.area!;
          if (activeAreas.has(area)) activeAreas.delete(area);
          else activeAreas.add(area);
          renderTable();
        });
      });
    }

    function renderTable() {
      scopeTabsEl.querySelectorAll<HTMLButtonElement>("[data-scope]").forEach((btn) => {
        btn.classList.toggle("btn-primary", btn.dataset.scope === activeScope);
      });
      tagbarEl.querySelectorAll<HTMLButtonElement>("[data-area]").forEach((btn) => {
        btn.classList.toggle("is-active", activeAreas.has(btn.dataset.area!));
      });

      const query = filterInput.value.trim();
      const filtered = allRows.filter(
        (r) =>
          (activeScope === "all" || r.scope === activeScope) &&
          (activeAreas.size === 0 || activeAreas.has(r.area)) &&
          matchText(r, query),
      );

      // Group by area instead of repeating it in every row — frees up
      // horizontal space for the policy name/value columns.
      const groups = new Map<string, CspPolicyRow[]>();
      for (const r of filtered) {
        const list = groups.get(r.area);
        if (list) list.push(r);
        else groups.set(r.area, [r]);
      }
      const areaNames = Array.from(groups.keys()).sort((a, b) => a.localeCompare(b));

      rowsEl.innerHTML = areaNames
        .map((area) => {
          const groupRows = groups.get(area)!;
          const headerHtml = `
            <tr class="mdm-group-row">
              <td colspan="5">
                <span class="mdm-group-header">
                  <span class="mdm-group-icon" aria-hidden="true">📁</span>
                  <span class="mdm-group-area">${escapeHtml(area)}</span>
                  ${hasPolicyCspDocsPage(area) ? docsLinkHtml(areaDocsUrl(area), area) : ""}
                  <span class="mdm-group-count">${groupRows.length}</span>
                </span>
              </td>
            </tr>
          `;
          const bodyHtml = groupRows
            .map((r) => {
              const title = metadataTitle(r);
              return `
                <tr>
                  <td class="mdm-name-cell"${title ? ` title="${escapeHtml(title)}"` : ""}>
                    <span class="mono">${escapeHtml(r.name)}</span>
                    ${hasPolicyCspDocsPage(r.area) ? docsLinkHtml(policyDocsUrl(r.area, r.name), r.name) : ""}
                  </td>
                  <td class="mdm-value-cell">
                    <code class="mono">${escapeHtml(r.value)}</code>
                  </td>
                  <td class="mdm-provider-cell">${winningProviderBadgeHtml(r.winningProvider)}</td>
                  <td class="mdm-scope-cell">${escapeHtml(scopeLabel(r))}</td>
                  <td class="mdm-enrollment-cell">${escapeHtml(r.enrollmentProvider)}</td>
                </tr>
              `;
            })
            .join("");
          return headerHtml + bodyHtml;
        })
        .join("");
      emptyEl.hidden = filtered.length > 0;
    }

    const render = () => {
      const raw = input.value.trim();
      if (!raw) {
        statusEl.textContent = "";
        resultsEl.hidden = true;
        return;
      }
      try {
        const { rows, enrollments, areas, scopes } = parseMdmDiagReport(raw);
        allRows = rows;
        activeScope = "all";
        activeAreas.clear();

        if (rows.length === 0) {
          statusEl.textContent = "No policies found in that report.";
          resultsEl.hidden = true;
          return;
        }

        statusEl.textContent = "";
        resultsEl.hidden = false;
        summaryEl.textContent = `${rows.length} policies across ${areas.length} areas`;
        enrollmentsSummaryEl.textContent = `Enrollments (${enrollments.length})`;
        enrollmentsListEl.innerHTML = enrollments
          .map((e) => `<li>${escapeHtml(e.provider)} <span class="mono mdm-enrollment-id">(${escapeHtml(e.enrollmentId)})</span></li>`)
          .join("");

        renderScopeTabs(scopes);
        renderTagBar(areas);
        renderTable();
      } catch (err) {
        statusEl.textContent = err instanceof Error ? err.message : "Couldn't parse that input.";
        resultsEl.hidden = true;
      }
    };

    input.addEventListener("input", render);
    filterInput.addEventListener("input", renderTable);
    const unwireGlobalPaste = wireGlobalPaste(input);

    return () => {
      input.removeEventListener("input", render);
      filterInput.removeEventListener("input", renderTable);
      unwireGlobalPaste();
      unwirePsTabs();
    };
  },
};

export default tool;
