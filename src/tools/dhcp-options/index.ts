import "./style.css";
import { autoGrowTextarea, copyButtonHtml, wireCopyButton } from "@/app/copy-button";
import { codeBlockHtml, setPowerShellCode } from "@/app/code-block";
import type { ToolDefinition } from "@/types/tool";
import { hexToBytes, parseDhcpInterfaceOptions, type ParsedDhcpOption } from "./parser";

const PS_SNIPPET = `Get-CimInstance Win32_NetworkAdapterConfiguration -Filter "IPEnabled='True' AND DHCPEnabled='True'" | ForEach-Object {
    $path = "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces\\$($_.SettingID)"
    $bytes = (Get-ItemProperty -Path $path -Name DhcpInterfaceOptions -ErrorAction SilentlyContinue).DhcpInterfaceOptions
    if ($bytes) {
        "--- $($_.Description) ---"
        ($bytes | ForEach-Object { $_.ToString('X2') }) -join ' '
    }
} | Out-String | Set-Clipboard -PassThru`;

const EXAMPLE_HEX =
  "35 00 00 00 00 00 00 00 01 00 00 00 00 00 00 00 00 00 00 00 05 00 00 00 " +
  "33 00 00 00 00 00 00 00 04 00 00 00 00 00 00 00 00 00 00 00 00 01 51 80 " +
  "01 00 00 00 00 00 00 00 04 00 00 00 00 00 00 00 00 00 00 00 FF FF FF 00 " +
  "03 00 00 00 00 00 00 00 04 00 00 00 00 00 00 00 00 00 00 00 C0 A8 01 01 " +
  "0F 00 00 00 00 00 00 00 0B 00 00 00 00 00 00 00 00 00 00 00 63 6F 6E 74 6F 73 6F 2E 63 6F 6D 00";

function renderRow(opt: ParsedDhcpOption): string {
  return `
    <tr>
      <td class="mono">${opt.code}</td>
      <td>${opt.meta.name}${opt.vendorSpecific ? ' <span class="dho-badge">vendor</span>' : ""}</td>
      <td class="mono">${opt.decoded || "<em>(empty)</em>"}</td>
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
          Windows stores every DHCP option a client received under
          <code class="mono">HKLM\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces\\&lt;GUID&gt;</code>
          in a binary value named <code class="mono">DhcpInterfaceOptions</code>. Run the PowerShell snippet below on
          the client, copy the hex for the NIC you care about, and paste it below to decode it. Based on
          <a href="https://www.ingmarverheij.com/read-dhcp-options-received-by-the-client/" target="_blank" rel="noopener">
            Ingmar Verheij's ReadDhcpOptions.ps1</a>.
        </p>

        <label class="dho-label" for="dho-ps">PowerShell: dump DHCP options as hex (copies the output to your clipboard)</label>
        <div class="ipk-copy-wrap">
          ${codeBlockHtml("dho-ps")}
          ${copyButtonHtml("dho-ps-copy")}
        </div>

        <label class="dho-label" for="dho-input">Paste hex bytes</label>
        <textarea
          id="dho-input"
          class="mono dho-input"
          rows="4"
          placeholder="35 00 00 00 00 00 00 00 01 00 00 00 ..."
        ></textarea>
        <div class="dho-actions">
          <button type="button" class="btn" id="dho-example">Load example</button>
          <button type="button" class="btn" id="dho-clear">Clear</button>
          <label class="dho-filter-label">
            <input type="checkbox" id="dho-hide-empty" checked />
            Hide empty values
          </label>
          <span class="dho-count" id="dho-count"></span>
        </div>

        <div id="dho-results"></div>
      </div>
    `;

    const psOutput = container.querySelector<HTMLElement>("#dho-ps")!;
    const psCopyBtn = container.querySelector<HTMLButtonElement>("#dho-ps-copy")!;
    const input = container.querySelector<HTMLTextAreaElement>("#dho-input")!;
    const exampleBtn = container.querySelector<HTMLButtonElement>("#dho-example")!;
    const clearBtn = container.querySelector<HTMLButtonElement>("#dho-clear")!;
    const hideEmptyCheck = container.querySelector<HTMLInputElement>("#dho-hide-empty")!;
    const countEl = container.querySelector<HTMLSpanElement>("#dho-count")!;
    const results = container.querySelector<HTMLDivElement>("#dho-results")!;

    setPowerShellCode(psOutput, PS_SNIPPET);
    wireCopyButton(psCopyBtn, () => PS_SNIPPET);

    const render = () => {
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

    input.addEventListener("input", render);
    hideEmptyCheck.addEventListener("change", render);
    // Setting .value programmatically doesn't fire a native "input" event, which the generic
    // sessionStorage persistence (wired in layout.ts) relies on - dispatch one explicitly so this
    // survives switching tools/apps, not just manually typed input.
    exampleBtn.addEventListener("click", () => {
      input.value = EXAMPLE_HEX;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    clearBtn.addEventListener("click", () => {
      input.value = "";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

    render();

    return () => {
      input.removeEventListener("input", render);
      hideEmptyCheck.removeEventListener("change", render);
    };
  },
};

export default tool;
