import "./style.css";
import { autoGrowTextarea, copyButtonHtml, wireCopyButton } from "@/app/copy-button";
import { codeBlockHtml, setCode } from "@/app/code-block";
import { wireGlobalPaste } from "@/app/global-paste";
import { wireExampleButton } from "@/app/example-button";
import type { ToolDefinition } from "@/types/tool";
import {
  formatMac,
  MAC_DERIVED_FORMATS,
  MAC_FORMATS,
  normalizeMac,
  splitMacList,
  type MacCase,
  type MacFormat,
} from "./parse";

const GETMAC_COMMAND = "getmac /v /fo list";

const ALL_FORMATS: MacFormat[] = [...MAC_FORMATS, ...MAC_DERIVED_FORMATS];

function radioHtml(f: MacFormat, checked: boolean): string {
  return `
    <label class="mac-format-radio">
      <input type="radio" name="mac-list-format" value="${f.id}" ${checked ? "checked" : ""} />
      ${f.label}
    </label>
  `;
}

const tool: ToolDefinition = {
  id: "mac-address-converter",
  name: "MAC Address Converter",
  description:
    "Paste one or many MAC addresses in any common format and convert them all to the output format you pick — colon, hyphen, Cisco dot-grouped, plain hex, plus the derived IPv6 EUI-64 interface ID and link-local address.",
  category: "Converters",
  keywords: [
    "mac",
    "mac address",
    "ethernet",
    "nic",
    "hardware address",
    "eui-64",
    "eui64",
    "ipv6",
    "link-local",
    "slaac",
    "cisco",
    "bulk",
    "list",
  ],
  icon: "🏷️",
  mount(container) {
    container.innerHTML = `
      <div class="mac-tool">
        <div class="mac-hint ipk-hint">
          <p>
            Paste one MAC address, or a whole list (one per line, or comma/semicolon-separated). Any common
            format is accepted — colon, hyphen, Cisco dot-grouped, plain hex, with or without a
            <code class="mono">0x</code> prefix, any case. Pick an output format below to convert them all.
          </p>
          <p>
            Don't know your MAC address(es)? Run <code class="mono">${GETMAC_COMMAND}</code> in a Windows
            command prompt to list every network interface's MAC address.
          </p>
          <div class="ipk-copy-wrap mac-getmac-wrap">
            ${codeBlockHtml("mac-getmac-cmd")}
            ${copyButtonHtml("mac-getmac-copy")}
          </div>
        </div>

        <div class="ipk-field-header">
          <label class="mac-label ipk-field-label" for="mac-input">MAC address(es) <span class="ipk-paste-note">— paste anywhere on the page</span></label>
          <button type="button" id="mac-example" class="ipk-example-btn">Load example</button>
        </div>
        <textarea id="mac-input" class="mono" rows="6" placeholder="Paste one or more MAC addresses, one per line..."></textarea>
        <span class="mac-error ipk-error" id="mac-error" role="alert"></span>

        <p class="mac-section-label">Convert to</p>
        <div class="mac-format-radios" id="mac-format-radios">
          ${ALL_FORMATS.map((f, i) => radioHtml(f, i === 0)).join("")}
        </div>

        <div class="mac-case" role="radiogroup" aria-label="Letter case">
          <button type="button" class="btn" data-case="lower">lowercase</button>
          <button type="button" class="btn btn-primary" data-case="upper">UPPERCASE</button>
        </div>

        <label class="mac-label ipk-field-label" for="mac-list-output">Converted</label>
        <div class="ipk-copy-wrap">
          <textarea id="mac-list-output" class="mono" rows="6" readonly></textarea>
          ${copyButtonHtml("mac-list-copy")}
        </div>
      </div>
    `;

    const input = container.querySelector<HTMLTextAreaElement>("#mac-input")!;
    const errorEl = container.querySelector<HTMLParagraphElement>("#mac-error")!;
    const listOutput = container.querySelector<HTMLTextAreaElement>("#mac-list-output")!;
    const listOutputLabel = container.querySelector<HTMLLabelElement>("label[for='mac-list-output']")!;
    const formatRadios = container.querySelectorAll<HTMLInputElement>("input[name='mac-list-format']");
    const caseButtons = container.querySelectorAll<HTMLButtonElement>("[data-case]");

    const listCopyBtn = container.querySelector<HTMLButtonElement>("#mac-list-copy")!;
    wireCopyButton(listCopyBtn, () => listOutput.value);

    const getmacCode = container.querySelector<HTMLPreElement>("#mac-getmac-cmd")!;
    const getmacCopyBtn = container.querySelector<HTMLButtonElement>("#mac-getmac-copy")!;
    setCode(getmacCode, GETMAC_COMMAND, "cmd");
    wireCopyButton(getmacCopyBtn, () => GETMAC_COMMAND);

    let caseMode: MacCase = "upper";

    const getSelectedFormat = (): MacFormat => {
      const checked = container.querySelector<HTMLInputElement>("input[name='mac-list-format']:checked");
      return ALL_FORMATS.find((f) => f.id === checked?.value) ?? ALL_FORMATS[0];
    };

    const render = () => {
      errorEl.textContent = "";
      const entries = splitMacList(input.value);
      if (entries.length === 0) {
        listOutput.value = "";
        listOutputLabel.textContent = "Converted";
        return;
      }

      const format = getSelectedFormat();
      let invalidCount = 0;
      const lines = entries.map((entry) => {
        try {
          return formatMac(format, normalizeMac(entry), caseMode);
        } catch (err) {
          invalidCount += 1;
          const reason = err instanceof Error ? err.message : "invalid";
          return `# ${entry} — ${reason}`;
        }
      });
      listOutput.value = lines.join("\n");
      autoGrowTextarea(listOutput);
      listOutputLabel.textContent = `Converted (${entries.length} address${entries.length === 1 ? "" : "es"})`;
      if (invalidCount > 0) {
        errorEl.textContent = `${invalidCount} of ${entries.length} line${entries.length === 1 ? "" : "s"} couldn't be parsed — left as a commented-out line below.`;
      }
    };

    const setCaseMode = (next: MacCase) => {
      caseMode = next;
      caseButtons.forEach((btn) => btn.classList.toggle("btn-primary", btn.dataset.case === next));
      render();
    };

    input.addEventListener("input", () => {
      autoGrowTextarea(input);
      render();
    });
    formatRadios.forEach((radio) => radio.addEventListener("change", render));
    caseButtons.forEach((btn) =>
      btn.addEventListener("click", () => setCaseMode(btn.dataset.case as MacCase))
    );

    render();

    const unwireGlobalPaste = wireGlobalPaste(input);

    const exampleBtn = container.querySelector<HTMLButtonElement>("#mac-example")!;
    const unwireExample = wireExampleButton(
      exampleBtn,
      input,
      () => "00:1A:2B:3C:4D:5E\n00-1A-2B-6F-7A-8B\n001a.2b9c.de01",
    );

    return () => {
      input.removeEventListener("input", render);
      unwireGlobalPaste();
      unwireExample();
    };
  },
};

export default tool;
