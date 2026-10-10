import "./style.css";
import type { ToolDefinition } from "@/types/tool";
import { copyButtonHtml, wireCopyButton, autoGrowTextarea } from "@/app/copy-button";
import { codeBlockHtml, setCode } from "@/app/code-block";
import { buildWsbXml, parseMappedFoldersText, type TriState, type WsbConfig } from "./parse";

const TRI_STATE_OPTIONS: TriState[] = ["Default", "Enable", "Disable"];

function triStateSelectHtml(id: string): string {
  return `
    <select id="${id}" class="wsb-select">
      ${TRI_STATE_OPTIONS.map((v) => `<option value="${v}">${v}</option>`).join("")}
    </select>
  `;
}

function downloadWsb(filename: string, xml: string) {
  const blob = new Blob([xml], { type: "application/xml" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

const tool: ToolDefinition = {
  id: "windows-sandbox-wsb",
  name: "Windows Sandbox Config Generator",
  description:
    "Build a Windows Sandbox .wsb configuration file - vGPU, networking, mapped folders, logon command, audio/video input, protected client, printer/clipboard redirection, and memory - entirely in your browser.",
  category: "Generators",
  keywords: [
    "windows sandbox",
    "wsb",
    "sandbox",
    "vgpu",
    "networking",
    "mapped folders",
    "logon command",
    "appcontainer",
    "isolation",
    "config file",
  ],
  icon: "🏖️",
  mount(container) {
    container.innerHTML = `
      <div class="wsb-tool">
        <p class="wsb-note">
          Configures a <code>.wsb</code> file for
          <a href="https://learn.microsoft.com/windows/security/application-security/application-isolation/windows-sandbox/windows-sandbox-configure-using-wsb-file" target="_blank" rel="noopener noreferrer">Windows Sandbox</a>.
          Settings left at <strong>Default</strong> are omitted from the file since Sandbox already behaves that way.
        </p>

        <div class="wsb-grid">
          <label class="wsb-field">
            <span class="wsb-label">vGPU (virtualized GPU)</span>
            ${triStateSelectHtml("wsb-vgpu")}
          </label>
          <label class="wsb-field">
            <span class="wsb-label">Networking</span>
            ${triStateSelectHtml("wsb-networking")}
          </label>
          <label class="wsb-field">
            <span class="wsb-label">Audio input</span>
            ${triStateSelectHtml("wsb-audio")}
          </label>
          <label class="wsb-field">
            <span class="wsb-label">Video input</span>
            ${triStateSelectHtml("wsb-video")}
          </label>
          <label class="wsb-field">
            <span class="wsb-label">Protected client</span>
            ${triStateSelectHtml("wsb-protected-client")}
          </label>
          <label class="wsb-field">
            <span class="wsb-label">Printer redirection</span>
            ${triStateSelectHtml("wsb-printer")}
          </label>
          <label class="wsb-field">
            <span class="wsb-label">Clipboard redirection</span>
            ${triStateSelectHtml("wsb-clipboard")}
          </label>
          <label class="wsb-field">
            <span class="wsb-label">Memory (MB)</span>
            <input id="wsb-memory" class="mono" type="number" min="0" step="256" placeholder="e.g. 8192" />
          </label>
        </div>

        <label class="wsb-label" for="wsb-logon">Logon command</label>
        <input id="wsb-logon" class="mono" type="text" placeholder="e.g. explorer.exe C:\\Users\\WDAGUtilityAccount\\Desktop" />

        <label class="wsb-label" for="wsb-folders">Mapped folders</label>
        <textarea id="wsb-folders" class="mono wsb-folders-input" rows="3" placeholder="C:\\Users\\Public\\Downloads&#10;C:\\Tools => C:\\Users\\WDAGUtilityAccount\\Desktop\\Tools&#10;C:\\Secrets => C:\\Secrets (readonly)"></textarea>
        <p class="wsb-hint">
          One per line: <code>HostFolder</code>, <code>HostFolder =&gt; SandboxFolder</code>, or
          <code>HostFolder =&gt; SandboxFolder (readonly)</code>. Omit the sandbox path to map to the desktop.
        </p>

        <label class="wsb-label" for="wsb-output">Generated .wsb file</label>
        <div class="ipk-copy-wrap">
          ${codeBlockHtml("wsb-output")}
          ${copyButtonHtml("wsb-copy")}
        </div>
        <div class="wsb-actions">
          <button type="button" id="wsb-download" class="wsb-download-btn">Download .wsb</button>
          <button type="button" id="wsb-reset" class="wsb-reset-btn">Reset to defaults</button>
        </div>
      </div>
    `;

    const vgpuSelect = container.querySelector<HTMLSelectElement>("#wsb-vgpu")!;
    const networkingSelect = container.querySelector<HTMLSelectElement>("#wsb-networking")!;
    const audioSelect = container.querySelector<HTMLSelectElement>("#wsb-audio")!;
    const videoSelect = container.querySelector<HTMLSelectElement>("#wsb-video")!;
    const protectedClientSelect = container.querySelector<HTMLSelectElement>("#wsb-protected-client")!;
    const printerSelect = container.querySelector<HTMLSelectElement>("#wsb-printer")!;
    const clipboardSelect = container.querySelector<HTMLSelectElement>("#wsb-clipboard")!;
    const memoryInput = container.querySelector<HTMLInputElement>("#wsb-memory")!;
    const logonInput = container.querySelector<HTMLInputElement>("#wsb-logon")!;
    const foldersInput = container.querySelector<HTMLTextAreaElement>("#wsb-folders")!;
    const output = container.querySelector<HTMLPreElement>("#wsb-output")!;
    const copyBtn = container.querySelector<HTMLButtonElement>("#wsb-copy")!;
    const downloadBtn = container.querySelector<HTMLButtonElement>("#wsb-download")!;
    const resetBtn = container.querySelector<HTMLButtonElement>("#wsb-reset")!;

    autoGrowTextarea(foldersInput);

    let currentXml = "";

    function render() {
      const config: WsbConfig = {
        vGPU: vgpuSelect.value as TriState,
        networking: networkingSelect.value as TriState,
        audioInput: audioSelect.value as TriState,
        videoInput: videoSelect.value as TriState,
        protectedClient: protectedClientSelect.value as TriState,
        printerRedirection: printerSelect.value as TriState,
        clipboardRedirection: clipboardSelect.value as TriState,
        memoryInMB: memoryInput.value ? Number(memoryInput.value) : undefined,
        mappedFolders: parseMappedFoldersText(foldersInput.value),
        logonCommand: logonInput.value,
      };
      currentXml = buildWsbXml(config);
      setCode(output, currentXml, "xml");
    }

    const allInputs = [
      vgpuSelect,
      networkingSelect,
      audioSelect,
      videoSelect,
      protectedClientSelect,
      printerSelect,
      clipboardSelect,
      memoryInput,
      logonInput,
    ];
    allInputs.forEach((el) => el.addEventListener("input", render));
    const onFoldersInput = () => {
      autoGrowTextarea(foldersInput);
      render();
    };
    foldersInput.addEventListener("input", onFoldersInput);

    wireCopyButton(copyBtn, () => currentXml);
    downloadBtn.addEventListener("click", () => downloadWsb("Sandbox.wsb", currentXml));
    resetBtn.addEventListener("click", () => {
      const selects = [
        vgpuSelect,
        networkingSelect,
        audioSelect,
        videoSelect,
        protectedClientSelect,
        printerSelect,
        clipboardSelect,
      ];
      selects.forEach((sel) => {
        sel.value = "Default";
        sel.dispatchEvent(new Event("input", { bubbles: true }));
      });
      memoryInput.value = "";
      memoryInput.dispatchEvent(new Event("input", { bubbles: true }));
      logonInput.value = "";
      logonInput.dispatchEvent(new Event("input", { bubbles: true }));
      foldersInput.value = "";
      foldersInput.dispatchEvent(new Event("input", { bubbles: true }));
      autoGrowTextarea(foldersInput);
      render();
    });

    render();

    return () => {
      allInputs.forEach((el) => el.removeEventListener("input", render));
      foldersInput.removeEventListener("input", onFoldersInput);
    };
  },
};

export default tool;
