import { getCategories, getToolById, getTools, searchAll, type SearchResult } from "@/app/registry";
import { navigateHome, navigateToTool, type Route } from "@/app/router";
import { persistFormState } from "@/app/state-persistence";
import { cycleThemePreference, getThemePreference } from "@/app/theme";
import type { ToolDefinition, ToolSearchItem } from "@/types/tool";

const THEME_ICONS: Record<string, string> = {
  light: "☀️ Light",
  dark: "🌙 Dark",
  system: "🖥️ System",
};

let toolCleanup: (() => void) | void;
let sidebarEl: HTMLElement | undefined;

function escapeHtml(value: string): string {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}

function renderCard(tool: ToolDefinition): string {
  return `
    <a class="ipk-card" href="#/tool/${encodeURIComponent(tool.id)}" data-tool-id="${tool.id}">
      <div class="ipk-card-icon">${tool.icon ?? "🧰"}</div>
      <h3>${escapeHtml(tool.name)}</h3>
      <p>${escapeHtml(tool.description)}</p>
      <span class="ipk-badge">${escapeHtml(tool.category)}</span>
    </a>
  `;
}

function renderItemCard(tool: ToolDefinition, item: ToolSearchItem): string {
  return `
    <a class="ipk-card" href="#/tool/${encodeURIComponent(tool.id)}/${encodeURIComponent(item.id)}" data-tool-id="${tool.id}">
      <div class="ipk-card-icon">${tool.icon ?? "🧰"}</div>
      <h3>${escapeHtml(item.title)}</h3>
      <p>${escapeHtml(item.description ?? "")}</p>
      <span class="ipk-badge">${escapeHtml(tool.name)}</span>
    </a>
  `;
}

function renderHome(main: HTMLElement, query = ""): void {
  const results: SearchResult[] = query ? searchAll(query) : getTools().map((tool) => ({ tool }));
  const totalCategories = getCategories().length;
  const subtitle = totalCategories
    ? `${getTools().length} tool${getTools().length === 1 ? "" : "s"} across ${totalCategories} categor${totalCategories === 1 ? "y" : "ies"}.`
    : "";

  main.innerHTML = `
    <div class="ipk-home">
      <h1>ItProKit</h1>
      <p>Handy static tools for IT Pros managing endpoints with Microsoft technologies. ${subtitle}</p>
      ${
        results.length
          ? `<div class="ipk-grid">${results.map((r) => (r.item ? renderItemCard(r.tool, r.item) : renderCard(r.tool))).join("")}</div>`
          : `<div class="ipk-empty-state">No tools match "${escapeHtml(query)}".</div>`
      }
    </div>
  `;
}

function renderTool(main: HTMLElement, id: string, itemId?: string): void {
  if (toolCleanup) {
    toolCleanup();
    toolCleanup = undefined;
  }

  const tool = getToolById(id);

  if (!tool) {
    main.innerHTML = `
      <a class="ipk-back-link" href="#/">&larr; Back to all tools</a>
      <div class="ipk-empty-state">Tool "${escapeHtml(id)}" was not found.</div>
    `;
    return;
  }

  main.innerHTML = `
    <a class="ipk-back-link" href="#/">&larr; Back to all tools</a>
    <div class="ipk-tool-header">
      <div>
        <h1>${escapeHtml(tool.name)}</h1>
        <p>${escapeHtml(tool.description)}</p>
      </div>
    </div>
    <div class="ipk-tool-body" id="ipk-tool-body"></div>
  `;

  const body = main.querySelector<HTMLElement>("#ipk-tool-body")!;
  const mountCleanup = tool.mount(body, { itemId });
  const stopPersisting = persistFormState(body, tool.id);
  toolCleanup = () => {
    mountCleanup?.();
    stopPersisting();
  };
}

export function renderRoute(main: HTMLElement, route: Route): void {
  if (route.name === "tool") {
    renderTool(main, route.id, route.itemId);
  } else {
    renderHome(main);
  }
  updateActiveSidebarLink(route);
}

function renderSidebar(nav: HTMLElement): void {
  const tools = getTools();
  const categories = getCategories();

  const groups = categories
    .map((category) => {
      const items = tools
        .filter((tool) => tool.category === category)
        .map(
          (tool) => `
            <li>
              <a class="ipk-nav-link" href="#/tool/${encodeURIComponent(tool.id)}" data-tool-id="${tool.id}">
                <span class="ipk-nav-icon">${tool.icon ?? "🧰"}</span>
                <span>${escapeHtml(tool.name)}</span>
              </a>
            </li>
          `,
        )
        .join("");
      return `
        <div class="ipk-nav-group">
          <div class="ipk-nav-group-title">${escapeHtml(category)}</div>
          <ul class="ipk-nav-list">${items}</ul>
        </div>
      `;
    })
    .join("");

  nav.innerHTML = `
    <a class="ipk-nav-link ipk-nav-home" href="#/" data-tool-id="">
      <span class="ipk-nav-icon">🏠</span>
      <span>All tools</span>
    </a>
    ${groups}
  `;
}

function updateActiveSidebarLink(route: Route): void {
  if (!sidebarEl) return;
  const activeId = route.name === "tool" ? route.id : "";
  sidebarEl.querySelectorAll<HTMLAnchorElement>("[data-tool-id]").forEach((link) => {
    link.classList.toggle("is-active", link.dataset.toolId === activeId);
  });
}

export function buildLayout(root: HTMLElement): { main: HTMLElement } {
  root.innerHTML = `
    <header class="ipk-header">
      <a class="ipk-brand" href="#/">
        <img src="favicon.svg" alt="" />
        <span>ItProKit</span>
      </a>
      <div class="ipk-search">
        <input type="search" id="ipk-search" placeholder="Search tools..." aria-label="Search tools" />
      </div>
      <button type="button" class="btn" id="ipk-theme-toggle"></button>
    </header>
    <div class="ipk-body">
      <nav class="ipk-sidebar" id="ipk-sidebar" aria-label="Tools navigation"></nav>
      <main class="ipk-main" id="ipk-main"></main>
    </div>
  `;

  const main = root.querySelector<HTMLElement>("#ipk-main")!;
  const sidebar = root.querySelector<HTMLElement>("#ipk-sidebar")!;
  const searchInput = root.querySelector<HTMLInputElement>("#ipk-search")!;
  const themeToggle = root.querySelector<HTMLButtonElement>("#ipk-theme-toggle")!;

  sidebarEl = sidebar;
  renderSidebar(sidebar);

  const updateThemeLabel = () => {
    themeToggle.textContent = THEME_ICONS[getThemePreference()];
  };
  updateThemeLabel();

  themeToggle.addEventListener("click", () => {
    cycleThemePreference();
    updateThemeLabel();
  });

  searchInput.addEventListener("input", () => {
    if (window.location.hash && window.location.hash !== "#/") {
      navigateHome();
    }
    renderHome(main, searchInput.value);
  });

  // Clicking a card uses a plain <a href="#/tool/...">; keep navigateToTool
  // exported for any tool that wants to link elsewhere programmatically.
  void navigateToTool;

  return { main };
}
