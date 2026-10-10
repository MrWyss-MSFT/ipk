import "./style.css";
import { copyButtonHtml, wireCopyButton } from "@/app/copy-button";
import { codeBlockHtml, setCode } from "@/app/code-block";
import { highlightCode } from "@/app/highlight";
import type { ToolDefinition } from "@/types/tool";
import {
  COMMANDS,
  DEEPLINKS,
  FOLDER_PATHS,
  REGISTRY_PATHS,
  SHORTCUTS,
  WMI_CLASSES,
  type CommandEntry,
  type DeeplinkEntry,
  type FolderPathEntry,
  type ShortcutEntry,
  type WmiEntry,
} from "./data";
import { buildRegistryFavoritesScript, type RegistryFavoriteEntry } from "./favorites-script";

type TabId = "commands" | "shortcuts" | "folders" | "registry" | "wmi" | "deeplinks";

const TABS: { id: TabId; label: string }[] = [
  { id: "commands", label: "Commands" },
  { id: "shortcuts", label: "Keyboard Shortcuts" },
  { id: "folders", label: "Folder Paths" },
  { id: "registry", label: "Registry Paths" },
  { id: "wmi", label: "WMI Classes" },
  { id: "deeplinks", label: "Deeplinks" },
];

/** Splits "Win + R" into individual `<kbd>` chips. */
function kbdChips(keys: string): string {
  return keys
    .split("+")
    .map((k) => `<kbd>${k.trim()}</kbd>`)
    .join(" + ");
}

function tagsHtml(tags?: string[]): string {
  return (tags ?? [])
    .map((t) => `<span class="ref-badge ref-tag" style="--h:${tagHue(t)}">${t}</span>`)
    .join(" ");
}

/** Deterministic hue (0-359) for a tag name, so the same tag always gets the same color. */
function tagHue(tag: string): number {
  let h = 0;
  for (let i = 0; i < tag.length; i++) {
    h = (h * 31 + tag.charCodeAt(i)) >>> 0;
  }
  return h % 360;
}

function matchText(haystack: (string | undefined)[], query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return haystack.some((h) => (h ?? "").toLowerCase().includes(q));
}

let customFavoriteCounter = 0;

function renderCustomFavoriteRow(customId: string): string {
  return `
    <li class="ref-fav-row-custom" data-custom-id="${customId}">
      <input type="text" class="mono ref-fav-custom-name" placeholder="⭐ My Favorite" />
      <input type="text" class="mono ref-fav-custom-path" placeholder="HKLM\\SOFTWARE\\..." />
      <button type="button" class="btn ref-fav-remove-custom" aria-label="Remove">✕</button>
    </li>
  `;
}

const tool: ToolDefinition = {
  id: "reference",
  name: "References",
  description:
    "A growing cheat sheet of handy Run/cmd commands, keyboard shortcuts, folder paths, registry paths (with a Registry Editor Favorites script generator), WMI classes and ms-settings: deeplinks — with one-click copy.",
  category: "Reference",
  keywords: [
    "run",
    "win+r",
    "cmd",
    "commands",
    "cheat sheet",
    "msc",
    "control panel",
    "cmtrace",
    "keyboard shortcuts",
    "hotkeys",
    "folder paths",
    "registry paths",
    "registry favorites",
    "regedit",
    "intune",
    "autopilot",
    "wmi",
    "cim",
    "namespace",
    "deeplinks",
    "ms-settings",
    "uri",
  ],
  icon: "📚",
  mount(container) {
    container.innerHTML = `
      <div class="ref-tool">
        <p class="ref-tip ipk-hint">
          Tip: in the Run dialog (<kbd>Win</kbd>+<kbd>R</kbd>), press <kbd>Ctrl</kbd>+<kbd>Enter</kbd> instead of
          <kbd>Enter</kbd> to launch a command elevated (as Administrator).
        </p>
        <div class="ref-tabs" role="tablist">
          ${TABS.map(
            (t, i) =>
              `<button type="button" class="btn ${i === 0 ? "btn-primary" : ""}" data-tab="${t.id}" role="tab">${t.label}</button>`,
          ).join("")}
        </div>
        <input id="ref-filter" class="mono" type="text" placeholder="Filter..." />
        <div class="ref-tagbar" id="ref-tagbar"></div>
        <div class="ipk-table-scroll">
          <table class="ref-table">
            <thead id="ref-thead"></thead>
            <tbody id="ref-list"></tbody>
          </table>
        </div>
        <p class="ref-empty" id="ref-empty" hidden>Nothing matches your filter.</p>

        <div class="ref-fav-panel" id="ref-fav-panel" hidden>
          <div class="ref-fav-header">
            <span class="ref-label">Custom favorites (optional)</span>
            <button type="button" class="btn" id="ref-fav-add-custom">+ Add custom favorite</button>
          </div>
          <ul class="ref-fav-custom-list" id="ref-fav-custom-list"></ul>

          <label class="ref-label" for="ref-fav-output">
            cmd.exe command — adds the checked paths above to Registry Editor's Favorites
          </label>
          <div class="ipk-copy-wrap">
            ${codeBlockHtml("ref-fav-output")}
            ${copyButtonHtml("ref-fav-copy")}
          </div>
          <p class="ref-tip ipk-hint">
            Paste directly into cmd.exe. Then open <strong>regedit</strong> — your picks appear under
            <strong>Favorites</strong>. Tip: run <code class="mono">regedit -m</code> to open multiple Registry
            Editor windows at once. Inside a .bat/.cmd file, double every <code class="mono">%</code> (e.g.
            <code class="mono">%K</code> → <code class="mono">%%K</code>).
          </p>
        </div>
      </div>
    `;

    const tabButtons = container.querySelectorAll<HTMLButtonElement>("[data-tab]");
    const filterInput = container.querySelector<HTMLInputElement>("#ref-filter")!;
    const tagbar = container.querySelector<HTMLDivElement>("#ref-tagbar")!;
    const thead = container.querySelector<HTMLTableSectionElement>("#ref-thead")!;
    const list = container.querySelector<HTMLTableSectionElement>("#ref-list")!;
    const emptyEl = container.querySelector<HTMLParagraphElement>("#ref-empty")!;
    const favPanel = container.querySelector<HTMLDivElement>("#ref-fav-panel")!;
    const favCustomList = container.querySelector<HTMLUListElement>("#ref-fav-custom-list")!;
    const favAddCustomBtn = container.querySelector<HTMLButtonElement>("#ref-fav-add-custom")!;
    const favOutput = container.querySelector<HTMLPreElement>("#ref-fav-output")!;
    const favCopyBtn = container.querySelector<HTMLButtonElement>("#ref-fav-copy")!;

    let activeTab: TabId = "commands";
    const activeTags = new Set<string>();
    const selectedFavorites = new Set<string>(
      REGISTRY_PATHS.filter((e) => e.defaultFavorite).map((e) => e.path),
    );

    function itemsForTab(tab: TabId): { tags?: string[] }[] {
      if (tab === "commands") return COMMANDS;
      if (tab === "shortcuts") return SHORTCUTS;
      if (tab === "folders") return FOLDER_PATHS;
      if (tab === "registry") return REGISTRY_PATHS;
      if (tab === "deeplinks") return DEEPLINKS;
      return WMI_CLASSES;
    }

    function uniqueTags(items: { tags?: string[] }[]): string[] {
      const set = new Set<string>();
      items.forEach((e) => (e.tags ?? []).forEach((t) => set.add(t)));
      return [...set].sort((a, b) => a.localeCompare(b));
    }

    /** All currently selected tags must be present on the entry (AND, not OR). */
    function matchTags(tags?: string[]): boolean {
      if (activeTags.size === 0) return true;
      const set = new Set(tags ?? []);
      return [...activeTags].every((t) => set.has(t));
    }

    function renderTagBar() {
      const tags = uniqueTags(itemsForTab(activeTab));
      tagbar.innerHTML = tags
        .map(
          (t) =>
            `<button type="button" class="ref-tag-filter ${activeTags.has(t) ? "is-active" : ""}" style="--h:${tagHue(t)}" data-tag="${t}">${t}</button>`,
        )
        .join("");
      tagbar.querySelectorAll<HTMLButtonElement>("[data-tag]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const tag = btn.dataset.tag!;
          if (activeTags.has(tag)) activeTags.delete(tag);
          else activeTags.add(tag);
          render();
        });
      });
    }

    const renderCommands = (query: string) => {
      const filtered = COMMANDS.filter(
        (e: CommandEntry) => matchText([e.command, e.description, ...(e.tags ?? [])], query) && matchTags(e.tags),
      );
      thead.innerHTML = "<tr><th>Command</th><th>Run from</th><th>Description</th><th>Tags</th></tr>";
      list.innerHTML = filtered
        .map(
          (e, i) => `
            <tr>
              <td class="ref-cmd-cell">
                <span class="ref-cmd-inner">
                  <code class="mono">${highlightCode(e.command, e.powershellOnly ? "powershell" : "cmd").replace(/\n/g, "<br/>")}</code>
                  ${copyButtonHtml(`ref-copy-${i}`, `Copy "${e.command}"`)}
                </span>
              </td>
              <td class="ref-from-cell">
                <span class="ref-from-inner">
                  ${
                    e.powershellOnly
                      ? `<span class="ref-badge ref-badge-ps">PowerShell</span>`
                      : e.cmdOnly
                        ? `<span class="ref-badge ref-badge-cmd">cmd</span>`
                        : `<span class="ref-badge ref-badge-run">Run</span>${e.runOnly ? "" : `<span class="ref-badge ref-badge-cmd">cmd</span>`}`
                  }
                </span>
              </td>
              <td class="ref-desc-cell">${e.description}</td>
              <td class="ref-tags-cell">${tagsHtml(e.tags)}</td>
            </tr>
          `,
        )
        .join("");
      list.querySelectorAll<HTMLButtonElement>(".ipk-copy-btn").forEach((btn, i) => {
        wireCopyButton(btn, () => filtered[i].command);
      });
      emptyEl.hidden = filtered.length > 0;
    };

    const renderShortcuts = (query: string) => {
      const filtered = SHORTCUTS.filter(
        (e: ShortcutEntry) => matchText([e.keys, e.description, ...(e.tags ?? [])], query) && matchTags(e.tags),
      );
      thead.innerHTML = "<tr><th>Keys</th><th>Description</th><th>Tags</th></tr>";
      list.innerHTML = filtered
        .map(
          (e) => `
            <tr>
              <td class="ref-keys-cell">${kbdChips(e.keys)}</td>
              <td class="ref-desc-cell">${e.description}</td>
              <td class="ref-tags-cell">${tagsHtml(e.tags)}</td>
            </tr>
          `,
        )
        .join("");
      emptyEl.hidden = filtered.length > 0;
    };

    const renderPaths = (items: FolderPathEntry[], query: string) => {
      const filtered = items.filter(
        (e) => matchText([e.path, e.description, ...(e.tags ?? [])], query) && matchTags(e.tags),
      );
      thead.innerHTML = "<tr><th>Path</th><th>Description</th><th>Tags</th></tr>";
      list.innerHTML = filtered
        .map(
          (e, i) => `
            <tr>
              <td class="ref-cmd-cell">
                <span class="ref-cmd-inner">
                  <code class="mono">${e.path}</code>
                  ${copyButtonHtml(`ref-copy-${i}`, `Copy "${e.path}"`)}
                </span>
              </td>
              <td class="ref-desc-cell">${e.description}</td>
              <td class="ref-tags-cell">${tagsHtml(e.tags)}</td>
            </tr>
          `,
        )
        .join("");
      list.querySelectorAll<HTMLButtonElement>(".ipk-copy-btn").forEach((btn, i) => {
        wireCopyButton(btn, () => filtered[i].path);
      });
      emptyEl.hidden = filtered.length > 0;
    };

    const renderRegistry = (query: string) => {
      const filtered = REGISTRY_PATHS.filter(
        (e) => matchText([e.name, e.path, e.description, ...(e.tags ?? [])], query) && matchTags(e.tags),
      );
      thead.innerHTML = "<tr><th>☆</th><th>Name</th><th>Path</th><th>Description</th><th>Tags</th></tr>";
      list.innerHTML = filtered
        .map(
          (e, i) => `
            <tr>
              <td class="ref-fav-check-cell">
                <input
                  type="checkbox"
                  class="ref-fav-check"
                  data-path="${e.path}"
                  ${selectedFavorites.has(e.path) ? "checked" : ""}
                  aria-label="Add &quot;${e.path}&quot; to the Registry Favorites script"
                />
              </td>
              <td class="ref-name-cell">${e.name}</td>
              <td class="ref-cmd-cell">
                <span class="ref-cmd-inner">
                  <code class="mono">${e.path}</code>
                  ${copyButtonHtml(`ref-copy-${i}`, `Copy "${e.path}"`)}
                </span>
              </td>
              <td class="ref-desc-cell">${e.description}</td>
              <td class="ref-tags-cell">${tagsHtml(e.tags)}</td>
            </tr>
          `,
        )
        .join("");
      list.querySelectorAll<HTMLButtonElement>(".ipk-copy-btn").forEach((btn, i) => {
        wireCopyButton(btn, () => filtered[i].path);
      });
      emptyEl.hidden = filtered.length > 0;
    };

    const renderWmi = (query: string) => {
      const filtered = WMI_CLASSES.filter(
        (e: WmiEntry) =>
          matchText([e.namespace, e.className, e.description, ...(e.tags ?? [])], query) &&
          matchTags(e.tags),
      );
      thead.innerHTML = "<tr><th>Namespace</th><th>Class</th><th>Description</th><th>Tags</th></tr>";
      list.innerHTML = filtered
        .map(
          (e, i) => `
            <tr>
              <td class="ref-cmd-cell"><code class="mono">${e.namespace}</code></td>
              <td class="ref-cmd-cell">
                <span class="ref-cmd-inner">
                  <code class="mono">${e.className}</code>
                  ${copyButtonHtml(`ref-copy-${i}`, `Copy "${e.className}"`)}
                </span>
              </td>
              <td class="ref-desc-cell">${e.description}</td>
              <td class="ref-tags-cell">${tagsHtml(e.tags)}</td>
            </tr>
          `,
        )
        .join("");
      list.querySelectorAll<HTMLButtonElement>(".ipk-copy-btn").forEach((btn, i) => {
        wireCopyButton(btn, () => `${filtered[i].namespace}:${filtered[i].className}`);
      });
      emptyEl.hidden = filtered.length > 0;
    };

    const renderDeeplinks = (query: string) => {
      const filtered = DEEPLINKS.filter(
        (e: DeeplinkEntry) => matchText([e.uri, e.description, ...(e.tags ?? [])], query) && matchTags(e.tags),
      );
      thead.innerHTML = "<tr><th>URI</th><th></th><th>Description</th><th>Tags</th></tr>";
      list.innerHTML = filtered
        .map(
          (e, i) => `
            <tr>
              <td class="ref-cmd-cell">
                <span class="ref-cmd-inner">
                  <code class="mono">${e.uri}</code>
                  ${copyButtonHtml(`ref-copy-${i}`, `Copy "${e.uri}"`)}
                </span>
              </td>
              <td class="ref-open-cell">
                <a class="btn ref-open-link" href="${e.uri}" title="Opens ${e.uri} — your browser will ask to confirm launching Settings.">🔗 Open</a>
              </td>
              <td class="ref-desc-cell">${e.description}</td>
              <td class="ref-tags-cell">${tagsHtml(e.tags)}</td>
            </tr>
          `,
        )
        .join("");
      list.querySelectorAll<HTMLButtonElement>(".ipk-copy-btn").forEach((btn, i) => {
        wireCopyButton(btn, () => filtered[i].uri);
      });
      emptyEl.hidden = filtered.length > 0;
    };

    const render = () => {
      renderTagBar();
      const query = filterInput.value.trim();
      if (activeTab === "commands") renderCommands(query);
      else if (activeTab === "shortcuts") renderShortcuts(query);
      else if (activeTab === "folders") renderPaths(FOLDER_PATHS, query);
      else if (activeTab === "registry") renderRegistry(query);
      else if (activeTab === "deeplinks") renderDeeplinks(query);
      else renderWmi(query);
    };

    let currentFavScript = "";

    const updateFavScript = () => {
      const builtins: RegistryFavoriteEntry[] = REGISTRY_PATHS.filter((e) => selectedFavorites.has(e.path)).map(
        (e) => ({ name: e.name, path: e.path }),
      );
      const customs: RegistryFavoriteEntry[] = Array.from(
        favCustomList.querySelectorAll<HTMLLIElement>(".ref-fav-row-custom"),
      )
        .map((row) => ({
          name: row.querySelector<HTMLInputElement>(".ref-fav-custom-name")!.value.trim(),
          path: row.querySelector<HTMLInputElement>(".ref-fav-custom-path")!.value.trim(),
        }))
        .filter((f) => f.name && f.path);

      currentFavScript = buildRegistryFavoritesScript([...builtins, ...customs]);
      setCode(favOutput, currentFavScript, "cmd");
    };

    const addCustomFavoriteRow = () => {
      customFavoriteCounter += 1;
      const id = `custom-fav-${customFavoriteCounter}`;
      favCustomList.insertAdjacentHTML("beforeend", renderCustomFavoriteRow(id));
      const row = favCustomList.querySelector<HTMLLIElement>(`[data-custom-id="${id}"]`)!;
      row.querySelectorAll<HTMLInputElement>("input").forEach((input) => {
        input.addEventListener("input", updateFavScript);
      });
      row.querySelector<HTMLButtonElement>(".ref-fav-remove-custom")!.addEventListener("click", () => {
        row.remove();
        updateFavScript();
      });
    };

    favAddCustomBtn.addEventListener("click", addCustomFavoriteRow);
    wireCopyButton(favCopyBtn, () => currentFavScript);

    // Event delegation: the table body is replaced wholesale on every render(), so a single
    // listener on the stable `list` element (rather than per-checkbox listeners) survives
    // filtering/tag changes without needing to be re-wired each time.
    list.addEventListener("change", (ev) => {
      const checkbox = (ev.target as HTMLElement).closest<HTMLInputElement>(".ref-fav-check");
      if (!checkbox) return;
      const path = checkbox.dataset.path!;
      if (checkbox.checked) selectedFavorites.add(path);
      else selectedFavorites.delete(path);
      updateFavScript();
    });

    tabButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        activeTab = btn.dataset.tab as TabId;
        tabButtons.forEach((b) => b.classList.toggle("btn-primary", b === btn));
        filterInput.value = "";
        activeTags.clear();
        favPanel.hidden = activeTab !== "registry";
        render();
      });
    });

    filterInput.addEventListener("input", render);
    updateFavScript();
    render();

    return () => {
      filterInput.removeEventListener("input", render);
      favAddCustomBtn.removeEventListener("click", addCustomFavoriteRow);
    };
  },
};

export default tool;
