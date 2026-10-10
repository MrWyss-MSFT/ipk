import "./style.css";
import { copyButtonHtml, wireCopyButton } from "@/app/copy-button";
import { codeBlockHtml, setCode } from "@/app/code-block";
import type { ToolDefinition } from "@/types/tool";

/** Normalizes a free-form file formats string into `*.ext` tokens separated by spaces. */
function normalizePatterns(raw: string): string {
  return raw
    .split(/[\s,;]+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .map((token) => {
      let t = token;
      if (!t.includes("*") && !t.startsWith(".")) t = `.${t}`;
      if (!t.startsWith("*")) t = `*${t}`;
      return t;
    })
    .join(" ");
}

const tool: ToolDefinition = {
  id: "cmd-findstr-search",
  name: "Find Text in Files (cmd command)",
  description:
    "Build a Windows cmd.exe one-liner that recursively searches files for a text string using for /r and findstr.",
  category: "Generators",
  keywords: ["cmd", "findstr", "for /r", "search", "grep", "batch", "dos", "find text in files"],
  icon: "🔎",
  mount(container) {
    container.innerHTML = `
      <div class="cfs-tool">
        <label class="cfs-label" for="cfs-text">Text to search for</label>
        <input id="cfs-text" class="mono" type="text" placeholder="e.g. search string" value="search string" />

        <label class="cfs-label" for="cfs-path">Root folder</label>
        <input id="cfs-path" class="mono" type="text" placeholder="e.g. C:\\" value="C:\\" />

        <label class="cfs-label" for="cfs-formats">File formats</label>
        <input id="cfs-formats" class="mono" type="text" placeholder="e.g. *.ps1 *.bat *.log" value="*.ps1 *.bat *.log" />

        <label class="cfs-checkbox-label">
          <input id="cfs-icase" type="checkbox" checked />
          Case-insensitive (/I)
        </label>

        <span class="cfs-error" id="cfs-error" role="alert"></span>

        <label class="cfs-label" for="cfs-output">cmd.exe command</label>
        <div class="ipk-copy-wrap">
          ${codeBlockHtml("cfs-output")}
          ${copyButtonHtml("cfs-copy")}
        </div>
        <p class="cfs-note">
          Paste directly into cmd.exe. Inside a .bat/.cmd file, double every <code>%F</code> to <code>%%F</code>.
        </p>
      </div>
    `;

    const textInput = container.querySelector<HTMLInputElement>("#cfs-text")!;
    const pathInput = container.querySelector<HTMLInputElement>("#cfs-path")!;
    const formatsInput = container.querySelector<HTMLInputElement>("#cfs-formats")!;
    const icaseInput = container.querySelector<HTMLInputElement>("#cfs-icase")!;
    const errorEl = container.querySelector<HTMLSpanElement>("#cfs-error")!;
    const output = container.querySelector<HTMLPreElement>("#cfs-output")!;
    const copyBtn = container.querySelector<HTMLButtonElement>("#cfs-copy")!;

    let currentCommand = "";

    const render = () => {
      errorEl.textContent = "";

      const text = textInput.value;
      const root = pathInput.value.trim() || "C:\\";
      const patterns = normalizePatterns(formatsInput.value);

      if (!text) {
        currentCommand = "";
        setCode(output, currentCommand, "cmd");
        errorEl.textContent = "Enter a text string to search for.";
        return;
      }
      if (!patterns) {
        currentCommand = "";
        setCode(output, currentCommand, "cmd");
        errorEl.textContent = "Enter at least one file format (e.g. *.ps1).";
        return;
      }
      if (text.includes('"')) {
        errorEl.textContent = 'Warning: the search text contains a " character, which findstr cannot escape reliably.';
      }

      const flags = icaseInput.checked ? "/I /M" : "/M";
      const rootArg = root.includes(" ") ? `"${root}"` : root;
      currentCommand = `for /r ${rootArg} %F in (${patterns}) do @findstr ${flags} /C:"${text}" "%F" >nul 2>nul && echo %F`;
      setCode(output, currentCommand, "cmd");
    };

    textInput.addEventListener("input", render);
    pathInput.addEventListener("input", render);
    formatsInput.addEventListener("input", render);
    icaseInput.addEventListener("change", render);
    wireCopyButton(copyBtn, () => currentCommand);

    render();

    return () => {
      textInput.removeEventListener("input", render);
      pathInput.removeEventListener("input", render);
      formatsInput.removeEventListener("input", render);
      icaseInput.removeEventListener("change", render);
    };
  },
};

export default tool;
