import "./style.css";
import { copyButtonHtml, wireCopyButton } from "@/app/copy-button";
import { highlightCode } from "@/app/highlight";
import type { ToolDefinition } from "@/types/tool";
import { parseRegFile, type RegKeyNode, type RegValue } from "./parser";

const EXPORT_COMMAND = 'reg export "HKCU\\Software\\ItProKit" "%USERPROFILE%\\Desktop\\export.reg"';

const EXAMPLE_REG = `Windows Registry Editor Version 5.00

[HKEY_CURRENT_USER\\Software\\ItProKit\\Demo]
"StringValue"="Hello World"
"DwordValue"=dword:00000001
@="Default value for this key"

[HKEY_CURRENT_USER\\Software\\ItProKit\\Demo\\Settings]
"ExpandValue"=hex(2):25,00,55,00,53,00,45,00,52,00,50,00,52,00,4f,00,46,00,49,\\
  00,4c,00,45,00,25,00,00,00
"MultiValue"=hex(7):41,00,6c,00,70,00,68,00,61,00,00,00,42,00,65,00,74,00,61,\\
  00,00,00,00,00
"BinaryValue"=hex:01,02,03,04,0a,0b,0c,0d
"QwordValue"=hex(b):00,e4,0b,54,02,00,00,00

[-HKEY_CURRENT_USER\\Software\\ItProKit\\Demo\\OldKey]

[HKEY_CURRENT_USER\\Software\\ItProKit\\Demo\\Settings]
"RemovedValue"=-
`;

function escapeHtml(value: string): string {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/"/g, "&quot;");
}

function countDescendantKeys(node: RegKeyNode): number {
  let count = node.children.size;
  for (const child of node.children.values()) count += countDescendantKeys(child);
  return count;
}

/**
 * Windows exports .reg files as UTF-16 (LE, with BOM) by default, but `Blob.text()`
 * always decodes as UTF-8, which turns every character into mojibake. Detect the
 * encoding from the BOM (or lack of one) and decode accordingly.
 */
async function readRegFileText(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  }
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder("utf-8").decode(bytes.subarray(3));
  }
  return new TextDecoder("utf-8").decode(bytes);
}

const tool: ToolDefinition = {
  id: "registry-preview",
  name: "Registry Preview",
  description:
    "Paste or load an exported .reg file and browse it as a visual key tree with decoded values - a web-based take on the PowerToys Registry Preview utility.",
  category: "Converters",
  keywords: ["registry", "reg file", "regedit", "powertoys", "registry preview", "tree", "hive", "export"],
  icon: "🗂️",
  mount(container) {
    container.innerHTML = `
      <div class="rgp-tool">
        <p class="rgp-note">
          Export a registry location (or Registry Editor &rarr; File &rarr; Export) using a command like
          <span class="rgp-sample-cmd">
            <code class="mono" id="rgp-export-cmd"></code>
            ${copyButtonHtml("rgp-export-copy", 'Copy "reg export" command')}
          </span>
          then load or paste the .reg file to browse it as a tree. Inspired by
          <a href="https://learn.microsoft.com/en-us/windows/powertoys/registry-preview" target="_blank" rel="noopener">
            PowerToys Registry Preview</a>. This runs entirely in your browser - nothing is uploaded.
        </p>

        <div class="rgp-input-row">
          <label class="btn" for="rgp-file">📂 Load .reg file</label>
          <input type="file" id="rgp-file" accept=".reg,text/plain" hidden />
          <button type="button" class="btn" id="rgp-example">Load example</button>
          <button type="button" class="btn" id="rgp-clear">Clear</button>
          <span class="rgp-count" id="rgp-count"></span>
        </div>

        <label class="rgp-label" for="rgp-input">.reg file content</label>
        <textarea
          id="rgp-input"
          class="mono rgp-raw"
          rows="6"
          placeholder="Windows Registry Editor Version 5.00&#10;&#10;[HKEY_CURRENT_USER\\Software\\...]"
        ></textarea>
        <div id="rgp-errors"></div>

        <div class="rgp-layout" id="rgp-layout">
          <div class="rgp-spinner-overlay" id="rgp-spinner" hidden>
            <div class="rgp-spinner"></div>
          </div>
          <div class="rgp-tree-pane">
            <div class="rgp-pane-title">Keys</div>
            <div class="rgp-tree" id="rgp-tree"></div>
          </div>
          <div class="rgp-details-pane">
            <div class="rgp-pane-title">Values</div>
            <div id="rgp-details" class="rgp-details"></div>
          </div>
        </div>
      </div>
    `;

    const fileInput = container.querySelector<HTMLInputElement>("#rgp-file")!;
    const exampleBtn = container.querySelector<HTMLButtonElement>("#rgp-example")!;
    const clearBtn = container.querySelector<HTMLButtonElement>("#rgp-clear")!;
    const countEl = container.querySelector<HTMLSpanElement>("#rgp-count")!;
    const exportCmdEl = container.querySelector<HTMLElement>("#rgp-export-cmd")!;
    const exportCopyBtn = container.querySelector<HTMLButtonElement>("#rgp-export-copy")!;
    exportCmdEl.innerHTML = highlightCode(EXPORT_COMMAND, "cmd");
    const input = container.querySelector<HTMLTextAreaElement>("#rgp-input")!;
    const errorsEl = container.querySelector<HTMLDivElement>("#rgp-errors")!;
    const treeEl = container.querySelector<HTMLDivElement>("#rgp-tree")!;
    const detailsEl = container.querySelector<HTMLDivElement>("#rgp-details")!;
    const spinnerEl = container.querySelector<HTMLDivElement>("#rgp-spinner")!;

    let root: RegKeyNode | null = null;
    let selectedPath: string | null = null;
    let focusedPath: string | null = null;
    const expanded = new Set<string>();

    /** Flattened, in-render-order list of currently *visible* nodes (collapsed branches excluded). */
    const getVisibleNodes = (): RegKeyNode[] => {
      const result: RegKeyNode[] = [];
      const walk = (node: RegKeyNode) => {
        for (const child of node.children.values()) {
          result.push(child);
          if (child.children.size > 0 && expanded.has(child.path)) walk(child);
        }
      };
      if (root) walk(root);
      return result;
    };

    const renderValueRow = (v: RegValue): string => {
      const displayValue = v.deleted
        ? '<span class="rgp-deleted-tag">deleted</span>'
        : `<span class="mono rgp-value-text">${escapeHtml(v.display) || "<em>(empty)</em>"}</span>`;
      return `
        <tr>
          <td class="mono">${v.name === "@" ? "(Default)" : escapeHtml(v.name)}</td>
          <td class="mono">${v.deleted ? "-" : v.type}</td>
          <td>${displayValue}</td>
        </tr>
      `;
    };

    const renderDetails = () => {
      if (!root || !selectedPath) {
        detailsEl.innerHTML = `<p class="rgp-hint">Select a key in the tree to see its values.</p>`;
        return;
      }
      const segments = selectedPath.split("\\");
      let node: RegKeyNode = root;
      for (const segment of segments) {
        const next = node.children.get(segment);
        if (!next) {
          detailsEl.innerHTML = `<p class="rgp-hint">Key not found.</p>`;
          return;
        }
        node = next;
      }

      detailsEl.innerHTML = `
        <div class="rgp-path-row">
          <code class="mono rgp-path">${escapeHtml(node.path)}</code>
          ${copyButtonHtml("rgp-path-copy")}
          ${node.deleted ? '<span class="rgp-deleted-tag">key deleted</span>' : ""}
        </div>
        ${
          node.values.length === 0
            ? '<p class="rgp-hint">This key has no values.</p>'
            : `
          <table class="rgp-table">
            <thead>
              <tr><th>Name</th><th>Type</th><th>Value</th></tr>
            </thead>
            <tbody>${node.values.map(renderValueRow).join("")}</tbody>
          </table>
        `
        }
      `;

      const copyBtn = detailsEl.querySelector<HTMLButtonElement>("#rgp-path-copy");
      if (copyBtn) wireCopyButton(copyBtn, () => node.path);
    };

    const renderNode = (node: RegKeyNode): string => {
      const hasChildren = node.children.size > 0;
      const isCollapsed = hasChildren && !expanded.has(node.path);
      const isSelected = node.path === selectedPath;
      const isFocused = node.path === focusedPath;
      const childCount = hasChildren ? countDescendantKeys(node) : 0;

      return `
        <li class="rgp-node" role="none">
          <div class="rgp-row ${isSelected ? "is-selected" : ""}">
            ${
              hasChildren
                ? `<button type="button" class="rgp-toggle" tabindex="-1" data-path="${escapeAttr(node.path)}">${isCollapsed ? "▸" : "▾"}</button>`
                : '<span class="rgp-toggle-spacer"></span>'
            }
            <span
              class="rgp-key ${node.deleted ? "is-deleted" : ""}"
              data-path="${escapeAttr(node.path)}"
              role="treeitem"
              tabindex="${isFocused ? "0" : "-1"}"
              aria-selected="${isSelected}"
              ${hasChildren ? `aria-expanded="${!isCollapsed}"` : ""}
            >
              📁 ${escapeHtml(node.name)}${hasChildren ? `<span class="rgp-child-count">${childCount}</span>` : ""}
            </span>
          </div>
          ${
            hasChildren
              ? `<ul class="rgp-children" role="group" ${isCollapsed ? 'style="display:none"' : ""}>${[...node.children.values()].map(renderNode).join("")}</ul>`
              : ""
          }
        </li>
      `;
    };

    const renderTree = () => {
      if (!root || root.children.size === 0) {
        treeEl.innerHTML = `<p class="rgp-hint">No keys to show yet.</p>`;
        return;
      }
      const visible = getVisibleNodes();
      if (!focusedPath || !visible.some((n) => n.path === focusedPath)) {
        focusedPath = (selectedPath && visible.some((n) => n.path === selectedPath) ? selectedPath : visible[0]?.path) ?? null;
      }
      const hadFocusInTree = treeEl.contains(document.activeElement);
      treeEl.innerHTML = `<ul class="rgp-tree-root" role="tree">${[...root.children.values()].map(renderNode).join("")}</ul>`;
      if (hadFocusInTree && focusedPath) {
        const match = [...treeEl.querySelectorAll<HTMLElement>(".rgp-key")].find((el) => el.dataset.path === focusedPath);
        match?.focus();
      }
    };

    const setLoading = (loading: boolean) => {
      spinnerEl.hidden = !loading;
    };

    let parseRequestId = 0;

    const parse = () => {
      const text = input.value;
      const requestId = ++parseRequestId;

      if (!text.trim()) {
        setLoading(false);
        root = null;
        selectedPath = null;
        countEl.textContent = "";
        errorsEl.innerHTML = "";
        renderTree();
        renderDetails();
        return;
      }

      setLoading(true);
      window.setTimeout(() => {
        if (requestId !== parseRequestId) return; // a newer parse has since been requested

        const parsed = parseRegFile(text);
        root = parsed.root;
        countEl.textContent = `${parsed.keyCount} key${parsed.keyCount === 1 ? "" : "s"}`;
        errorsEl.innerHTML = parsed.errors.length
          ? `<p class="rgp-warning">⚠️ ${parsed.errors.length} line(s) could not be parsed and were skipped.</p>`
          : "";

        if (selectedPath) {
          const segments = selectedPath.split("\\");
          let node: RegKeyNode | undefined = root;
          for (const segment of segments) {
            node = node?.children.get(segment);
            if (!node) break;
          }
          if (!node) selectedPath = null;
        }

        renderTree();
        renderDetails();
        setLoading(false);
      }, 20);
    };

    wireCopyButton(exportCopyBtn, () => EXPORT_COMMAND);

    treeEl.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;
      const toggle = target.closest<HTMLElement>(".rgp-toggle");
      if (toggle) {
        const path = toggle.dataset.path!;
        if (expanded.has(path)) expanded.delete(path);
        else expanded.add(path);
        renderTree();
        return;
      }
      const key = target.closest<HTMLElement>(".rgp-key");
      if (key) {
        selectedPath = key.dataset.path!;
        renderTree();
        renderDetails();
      }
    });

    treeEl.addEventListener("keydown", (e) => {
      const keyEl = (e.target as HTMLElement).closest<HTMLElement>(".rgp-key");
      if (!keyEl) return;
      const path = keyEl.dataset.path!;
      const visible = getVisibleNodes();
      const idx = visible.findIndex((n) => n.path === path);
      if (idx === -1) return;
      const node = visible[idx];
      const hasChildren = node.children.size > 0;

      const moveFocusTo = (target: string | undefined | null) => {
        if (!target) return;
        focusedPath = target;
        selectedPath = target;
        renderTree();
        renderDetails();
      };

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          moveFocusTo(visible[idx + 1]?.path);
          break;
        case "ArrowUp":
          e.preventDefault();
          moveFocusTo(visible[idx - 1]?.path);
          break;
        case "ArrowRight":
          e.preventDefault();
          if (hasChildren && !expanded.has(node.path)) {
            expanded.add(node.path);
            focusedPath = node.path;
            renderTree();
          } else if (hasChildren) {
            moveFocusTo([...node.children.values()][0]?.path);
          }
          break;
        case "ArrowLeft":
          e.preventDefault();
          if (hasChildren && expanded.has(node.path)) {
            expanded.delete(node.path);
            focusedPath = node.path;
            renderTree();
          } else {
            const parentPath = node.path.split("\\").slice(0, -1).join("\\");
            moveFocusTo(parentPath || null);
          }
          break;
        case "Home":
          e.preventDefault();
          moveFocusTo(visible[0]?.path);
          break;
        case "End":
          e.preventDefault();
          moveFocusTo(visible[visible.length - 1]?.path);
          break;
        case "Enter":
        case " ":
          e.preventDefault();
          selectedPath = path;
          renderTree();
          renderDetails();
          break;
        default:
          break;
      }
    });

    input.addEventListener("input", parse);

    exampleBtn.addEventListener("click", () => {
      input.value = EXAMPLE_REG;
      parse();
    });

    clearBtn.addEventListener("click", () => {
      input.value = "";
      parse();
    });

    fileInput.addEventListener("change", async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      input.value = await readRegFileText(file);
      fileInput.value = "";
      parse();
    });

    parse();

    return () => {
      input.removeEventListener("input", parse);
    };
  },
};

export default tool;
