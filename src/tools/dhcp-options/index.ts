import "./style.css";
import { autoGrowTextarea } from "@/app/copy-button";
import { wireGlobalPaste } from "@/app/global-paste";
import { wireExampleButton } from "@/app/example-button";
import { makePsCommandVariants, psCommandTabsHtml, wirePsCommandTabs } from "@/app/ps-command";
import type { ToolDefinition } from "@/types/tool";
import { hexToBytes, parseDhcpInterfaceOptions, type ParsedDhcpOption } from "./parser";

const PS_VARIANTS = makePsCommandVariants(`Get-CimInstance Win32_NetworkAdapterConfiguration -Filter "IPEnabled='True' AND DHCPEnabled='True'" | ForEach-Object {
    $path = "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces\\$($_.SettingID)"
    $bytes = (Get-ItemProperty -Path $path -Name DhcpInterfaceOptions -ErrorAction SilentlyContinue).DhcpInterfaceOptions
    if ($bytes) {
        "--- $($_.Description) ---"
        ($bytes | ForEach-Object { $_.ToString('X2') }) -join ' '
    }
} | Out-String`);

const EXAMPLE_HEX =
  "35 00 00 00 00 00 00 00 01 00 00 00 00 00 00 00 00 00 00 00 05 00 00 00 " +
  "33 00 00 00 00 00 00 00 04 00 00 00 00 00 00 00 00 00 00 00 00 01 51 80 " +
  "01 00 00 00 00 00 00 00 04 00 00 00 00 00 00 00 00 00 00 00 FF FF FF 00 " +
  "03 00 00 00 00 00 00 00 04 00 00 00 00 00 00 00 00 00 00 00 C0 A8 01 01 " +
  "0F 00 00 00 00 00 00 00 0F 00 00 00 00 00 00 00 00 00 00 00 69 70 6B 69 74 70 72 6F 6B 69 74 2E 63 6F 6D 00";

function escapeHtml(value: string): string {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML.replace(/"/g, "&quot;");
}

function renderRow(opt: ParsedDhcpOption): string {
  return `
    <tr>
      <td><span class="dho-code mono">${opt.code}</span></td>
      <td>${opt.meta.name}${opt.vendorSpecific ? ' <span class="dho-badge">vendor</span>' : ""}</td>
      <td>${opt.decoded ? `<button type="button" class="dho-copy-value mono" data-copy-value="${escapeHtml(opt.decoded)}" title="Click to copy">${escapeHtml(opt.decoded)}</button>` : "<em>(empty)</em>"}</td>
    </tr>
  `;
}

const tool: ToolDefinition = {
  id: "dhcp-options",
  name: "DHCP Options Decoder",
  description:
    "Decode the raw DhcpInterfaceOptions registry value (what a Windows client actually received from DHCP) into human-readable option names and values.",
  category: "Converters",
  keywords: [
    "dhcp",
    "dhcpinterfaceoptions",
    "registry",
    "tcpip",
    "network adapter",
    "lease",
    "option 43",
    "vendor specific",
    "ipconfig",
  ],
  icon: "🌐",
  mount(container) {
    container.innerHTML = `
      <div class="dho-tool">
        <p class="ipk-hint">
          Based on
          <a href="https://www.ingmarverheij.com/read-dhcp-options-received-by-the-client/" target="_blank" rel="noopener">
            Ingmar Verheij's ReadDhcpOptions.ps1</a>.
        </p>

        <p class="dho-step-label">1. Get the DHCP interface options <span class="ipk-step-note">(copies to clipboard; pick the NIC you care about from the output)</span></p>
        ${psCommandTabsHtml("dho-ps")}

        <p class="dho-step-label">2. Paste anywhere on the page</p>
        <div class="ipk-field-header">
          <label class="dho-field-label" for="dho-input">DHCP interface options (hex)</label>
          <button type="button" id="dho-example" class="ipk-example-btn">Load example</button>
        </div>
        <textarea
          id="dho-input"
          class="mono dho-input"
          rows="4"
          placeholder="35 00 00 00 00 00 00 00 01 00 00 00 ..."
        ></textarea>
        <div class="dho-actions">
          <label class="dho-filter-label">
            <input type="checkbox" id="dho-hide-empty" checked />
            Hide empty values
          </label>
          <span class="dho-count" id="dho-count"></span>
        </div>

        <span class="dho-error" id="dho-copy-error" role="alert"></span>
        <div id="dho-results"></div>
      </div>
    `;

    const input = container.querySelector<HTMLTextAreaElement>("#dho-input")!;
    const exampleBtn = container.querySelector<HTMLButtonElement>("#dho-example")!;
    const hideEmptyCheck = container.querySelector<HTMLInputElement>("#dho-hide-empty")!;
    const countEl = container.querySelector<HTMLSpanElement>("#dho-count")!;
    const results = container.querySelector<HTMLDivElement>("#dho-results")!;
    const copyError = container.querySelector<HTMLElement>("#dho-copy-error")!;

    const unwirePsTabs = wirePsCommandTabs(container, "dho-ps", PS_VARIANTS);

    const render = () => {
      copyError.textContent = "";
      autoGrowTextarea(input);
      const bytes = hexToBytes(input.value);
      countEl.textContent = bytes.length ? `${bytes.length} bytes` : "";

      if (bytes.length === 0) {
        results.innerHTML = "";
        return;
      }

      const options = parseDhcpInterfaceOptions(bytes);
      if (options.length === 0) {
        results.innerHTML = `<p class="dho-note dho-empty">Couldn't find any valid DHCP options in that data.</p>`;
        return;
      }

      const visible = hideEmptyCheck.checked ? options.filter((o) => o.decoded !== "") : options;
      const sorted = [...visible].sort((a, b) => a.code - b.code);
      const standard = sorted.filter((o) => !o.vendorSpecific);
      const vendor = sorted.filter((o) => o.vendorSpecific);

      if (standard.length === 0 && vendor.length === 0) {
        results.innerHTML = `<p class="dho-note dho-empty">No options to show (try unchecking "Hide empty values").</p>`;
        return;
      }

      const table = (rows: ParsedDhcpOption[]) => `
        <div class="ipk-table-scroll">
          <table class="dho-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Option</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(renderRow).join("")}
            </tbody>
          </table>
        </div>
      `;

      results.innerHTML = `
        ${standard.length ? table(standard) : ""}
        ${vendor.length ? `<h3 class="dho-subheading">Vendor-specific (option 43)</h3>${table(vendor)}` : ""}
      `;
    };

    const onCopy = async (event: MouseEvent) => {
      const button = (event.target as Element).closest<HTMLButtonElement>(".dho-copy-value");
      if (!button) return;
      try {
        await navigator.clipboard.writeText(button.dataset.copyValue!);
        copyError.textContent = "";
        button.classList.remove("is-copied");
        void button.offsetWidth;
        button.classList.add("is-copied");
      } catch (error) {
        copyError.textContent = error instanceof Error ? error.message : "Couldn't copy that value.";
      }
    };
    results.addEventListener("click", onCopy);
    input.addEventListener("input", render);
    hideEmptyCheck.addEventListener("change", render);
    const unwireGlobalPaste = wireGlobalPaste(input);
    const unwireExample = wireExampleButton(exampleBtn, input, () => EXAMPLE_HEX);

    render();

    return () => {
      input.removeEventListener("input", render);
      results.removeEventListener("click", onCopy);
      hideEmptyCheck.removeEventListener("change", render);
      unwireGlobalPaste();
      unwirePsTabs();
      unwireExample();
    };
  },
};

export default tool;
