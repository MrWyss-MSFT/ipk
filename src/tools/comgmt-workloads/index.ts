import "./style.css";
import { copyButtonHtml, wireCopyButton } from "@/app/copy-button";
import { wireGlobalPaste } from "@/app/global-paste";
import { makePsCommandVariants, psCommandTabsHtml, wirePsCommandTabs } from "@/app/ps-command";
import type { ToolDefinition } from "@/types/tool";
import {
  CO_MANAGEMENT_CONFIGURED_VALUE,
  decodeComgmtWorkloadsValue,
  INTUNE_DISPLAY_ORDER,
  parseWorkloadValue,
} from "./decode";

const PS_VARIANTS = makePsCommandVariants("$System.ComgmtWorkloads", {
  setup: '$System = Get-CimInstance -Namespace "root\\ccm\\InvAgt" -ClassName "CCM_System"; "CoManaged: $($System.CoManaged)"; ',
});

const tool: ToolDefinition = {
  id: "comgmt-workloads",
  name: "Co-Management Workloads Decoder",
  description:
    "Decode a ConfigMgr CCM_System.ComgmtWorkloads bitmask into the individual Co-Management workload switches.",
  category: "Converters",
  keywords: [
    "comanagement",
    "co-management",
    "comgmtworkloads",
    "ccm_system",
    "configmgr",
    "sccm",
    "intune",
    "workloads",
  ],
  icon: "🔀",
  mount(container) {
    container.innerHTML = `
      <div class="cmw-tool">
        <p class="cmw-step-label">1. Get the ComgmtWorkloads value on a co-managed device <span class="ipk-step-note">(copies to clipboard)</span></p>
        ${psCommandTabsHtml("cmw-snippet", { requiresAdmin: true })}
        <p class="cmw-step-label">2. Paste anywhere on the page</p>
        <label class="cmw-field-label" for="cmw-input">ComgmtWorkloads value</label>
        <input id="cmw-input" class="mono" type="text" placeholder="e.g. 8193" value="8193" />
        <span class="cmw-error" id="cmw-error" role="alert"></span>
        <p class="cmw-note">Tick or untick workloads below to build the value the other way around.</p>
        <table class="cmw-table" id="cmw-table">
          <thead>
            <tr>
              <th>Workload</th>
              <th>Flag value</th>
              <th>Enabled</th>
            </tr>
          </thead>
          <tbody id="cmw-tbody"></tbody>
        </table>

        <p class="cmw-step-label">As shown in the Intune admin center</p>
        <div class="ipk-copy-wrap">
          <p class="ipk-code mono" id="cmw-intune-text"></p>
          ${copyButtonHtml("cmw-intune-copy")}
        </div>
      </div>
    `;

    const input = container.querySelector<HTMLInputElement>("#cmw-input")!;
    const errorEl = container.querySelector<HTMLSpanElement>("#cmw-error")!;
    const tbody = container.querySelector<HTMLTableSectionElement>("#cmw-tbody")!;
    const intuneTextEl = container.querySelector<HTMLParagraphElement>("#cmw-intune-text")!;
    const intuneCopyBtn = container.querySelector<HTMLButtonElement>("#cmw-intune-copy")!;
    let intuneCopyText = "";

    const renderFromValue = () => {
      errorEl.textContent = "";
      tbody.innerHTML = "";
      intuneTextEl.innerHTML = "";
      intuneCopyText = "";

      const trimmed = input.value.trim();
      let numericValue = 0;
      if (trimmed) {
        try {
          numericValue = parseWorkloadValue(trimmed);
        } catch (err) {
          errorEl.textContent = err instanceof Error ? err.message : "Failed to decode value.";
        }
      }

      const results = decodeComgmtWorkloadsValue(numericValue);
      const rowResults = results.filter((r) => !r.hiddenFromTable);
      const forceAllEnabled = rowResults.find((r) => r.isForceAllSwitch)?.isEnabled ?? false;
      const isImpliedByEnabledOther = (r: (typeof rowResults)[number]) =>
        rowResults.some((other) => other.isEnabled && other.impliesWhenEnabled?.includes(r.value));
      tbody.innerHTML = rowResults
        .map((r) => {
          const locked =
            !r.isForceAllSwitch &&
            (forceAllEnabled || (r.alwaysOnInIntune && r.isEnabled) || isImpliedByEnabledOther(r));
          const rowClass = [locked && "cmw-locked-row", r.isForceAllSwitch && "cmw-force-all-row"]
            .filter(Boolean)
            .join(" ");
          return `
              <tr${rowClass ? ` class="${rowClass}"` : ""}>
                <td>${r.configMgrName ?? r.workload}</td>
                <td>${r.value}</td>
                <td class="cmw-enabled-cell">
                  <input type="checkbox" class="cmw-checkbox" data-flag-value="${r.value}" data-implied-only="${r.impliedOnly ? "true" : "false"}" ${r.isEnabled ? "checked" : ""} ${locked ? "disabled" : ""} />
                </td>
              </tr>
            `;
        })
        .join("");

      const sortedIntuneRows = (rows: typeof results) =>
        [...rows].sort(
          (a, b) => INTUNE_DISPLAY_ORDER.indexOf(a.workload) - INTUNE_DISPLAY_ORDER.indexOf(b.workload),
        );
      const shownNames = sortedIntuneRows(results.filter((r) => r.intuneName && r.isEnabled && !r.impliedOnly)).map(
        (r) => r.intuneName!,
      );
      // Oddly, Intune's own workload summary text omits a workload that's
      // only enabled because another flag implies it (e.g. Endpoint
      // Protection via Device configuration) - even though its switch shows
      // on in the table. Keep it visible here too, just de-emphasized, so
      // it's clear it's active but not part of what Intune itself prints.
      const impliedOnlyNames = sortedIntuneRows(
        results.filter((r) => r.intuneName && r.isEnabled && r.impliedOnly),
      ).map((r) => r.intuneName!);

      intuneCopyText = shownNames.join(", ");
      intuneTextEl.innerHTML =
        shownNames.join(", ") +
        (impliedOnlyNames.length
          ? (shownNames.length ? ", " : "") +
            impliedOnlyNames
              .map(
                (name) =>
                  `<span class="cmw-implied-hidden" title="Enabled via another workload, but Intune doesn't list it here">${name}</span>`,
              )
              .join(", ")
          : "");

      tbody.querySelectorAll<HTMLInputElement>(".cmw-checkbox").forEach((checkbox) => {
        checkbox.addEventListener("change", () => {
          // Rebuild the value from the ticked checkboxes rather than
          // bit-twiddling the previous number - this always keeps the
          // always-on CoManagementConfigured baseline set and drops any
          // extra reserved bits a pasted "all workloads" value may have
          // carried, no matter what was in the input beforehand.
          // A checkbox that's only checked because another workload
          // implies it (data-implied-only) must NOT contribute its own
          // bit unless it's the one the user actually just toggled -
          // otherwise its bit gets baked into the raw value and it stops
          // being "implied only" (e.g. Endpoint Protection would wrongly
          // keep showing in the Intune summary text after Device
          // configuration is unticked again).
          let next = CO_MANAGEMENT_CONFIGURED_VALUE;
          tbody.querySelectorAll<HTMLInputElement>(".cmw-checkbox").forEach((cb) => {
            const wasImpliedOnly = cb.dataset.impliedOnly === "true";
            if (cb.checked && (!wasImpliedOnly || cb === checkbox)) {
              next |= Number(cb.dataset.flagValue);
            }
          });
          input.value = String(next >>> 0);
          renderFromValue();
        });
      });
    };

    input.addEventListener("input", renderFromValue);
    const unwireGlobalPaste = wireGlobalPaste(input);
    const unwirePsTabs = wirePsCommandTabs(container, "cmw-snippet", PS_VARIANTS);
    wireCopyButton(intuneCopyBtn, () => intuneCopyText);

    renderFromValue();

    return () => {
      input.removeEventListener("input", renderFromValue);
      unwireGlobalPaste();
      unwirePsTabs();
    };
  },
};

export default tool;
