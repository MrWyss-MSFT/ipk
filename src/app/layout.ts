import { getCategories, getToolById, getTools, searchAll, type SearchResult } from "@/app/registry";
import { navigateHome, navigateToTool, type Route } from "@/app/router";
import { persistFormState } from "@/app/state-persistence";
import { relocateHintsToTitle } from "@/app/hint-popover";
import { getResolvedTheme, onSystemThemeChange, toggleTheme } from "@/app/theme";
import { hasUnseenChanges } from "@/app/whats-new";
import { copyButtonHtml, wireCopyButton } from "@/app/copy-button";
import { getSearchEngineUrl } from "@/app/search-provider";
import type { ToolDefinition, ToolSearchItem } from "@/types/tool";

const DEFAULT_SEARCH_KEYWORD = "ipk";
const DEFAULT_SEARCH_NAME = "IT Pro Kit";

const THEME_ICONS: Record<string, string> = {
  light: "☀️",
  dark: "🌙",
};

const SIDEBAR_COLLAPSE_KEY = "ipk-sidebar-collapsed";
const MOBILE_SIDEBAR_QUERY = "(max-width: 900px)";

let toolCleanup: (() => void) | void;
let sidebarEl: HTMLElement | undefined;

function isMobileViewport(): boolean {
  return window.matchMedia(MOBILE_SIDEBAR_QUERY).matches;
}

function closeMobileSidebar(): void {
  document.body.classList.remove("ipk-sidebar-open");
}

function escapeHtml(value: string): string {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}

function renderCard(tool: ToolDefinition): string {
  return `
    <a class="ipk-card" href="#/tool/${encodeURIComponent(tool.id)}" data-tool-id="${tool.id}">
      <div class="ipk-card-head">
        <div class="ipk-card-icon">${tool.icon ?? "🧰"}</div>
        <h3>${escapeHtml(tool.name)}</h3>
      </div>
      <p>${escapeHtml(tool.description)}</p>
      <span class="ipk-badge">${escapeHtml(tool.category)}</span>
    </a>
  `;
}

function renderItemCard(tool: ToolDefinition, item: ToolSearchItem): string {
  return `
    <a class="ipk-card" href="#/tool/${encodeURIComponent(tool.id)}/${encodeURIComponent(item.id)}" data-tool-id="${tool.id}">
      <div class="ipk-card-head">
        <div class="ipk-card-icon">${tool.icon ?? "🧰"}</div>
        <h3>${escapeHtml(item.title)}</h3>
      </div>
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
      <h1>IT Pro Kit</h1>
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
      <div class="ipk-tool-title">
        <h1 title="${escapeHtml(tool.description)}">${escapeHtml(tool.name)}</h1>
        ${
          tool.stage
            ? `<span class="ipk-stage-badge ipk-stage-${tool.stage}" title="This tool is ${tool.stage} — still under active work, rough edges and missing features are expected.">${tool.stage}</span>`
            : ""
        }
      </div>
      <div class="ipk-tool-hints" id="ipk-tool-hints"></div>
    </div>
    <div class="ipk-tool-body" id="ipk-tool-body"></div>
  `;

  const body = main.querySelector<HTMLElement>("#ipk-tool-body")!;
  const hintsTray = main.querySelector<HTMLElement>("#ipk-tool-hints")!;
  const mountCleanup = tool.mount(body, { itemId });
  const stopPersisting = persistFormState(body, tool.id);
  const stopHintPopovers = relocateHintsToTitle(body, hintsTray);
  toolCleanup = () => {
    mountCleanup?.();
    stopPersisting();
    stopHintPopovers();
  };
}

/**
 * Puts the home page in a prefilled, filtered-search state - used when an
 * incoming `?q=` lands on zero or multiple matches. Mirrors what the header
 * search box's own `input` listener does, but callable from outside layout.ts
 * (e.g. the app bootstrap in main.ts) without relying on dispatching a
 * synthetic event that could race the router's async hashchange handling.
 */
export function showHomeSearch(main: HTMLElement, query: string): void {
  if (window.location.hash && window.location.hash !== "#/") {
    navigateHome();
  }
  const input = document.querySelector<HTMLInputElement>("#ipk-search");
  if (input) input.value = query;
  renderHome(main, query);
}

export function renderRoute(main: HTMLElement, route: Route): void {
  if (route.name === "tool") {
    renderTool(main, route.id, route.itemId);
  } else {
    renderHome(main);
  }
  updateActiveSidebarLink(route);
  refreshWhatsNewBadge();
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
    <div class="ipk-nav-scroll">
      <a class="ipk-nav-link ipk-nav-home" href="#/" data-tool-id="">
        <span class="ipk-nav-icon">🏠</span>
        <span>All tools</span>
      </a>
      ${groups}
    </div>
    ${renderSidebarFooter()}
  `;

  // On a narrow viewport the sidebar is an off-canvas drawer; following any
  // nav link should close it instead of leaving it open over the new page.
  nav.addEventListener("click", (event) => {
    if (isMobileViewport() && (event.target as HTMLElement).closest(".ipk-nav-link")) {
      closeMobileSidebar();
    }
  });
}

function renderSidebarFooter(): string {
  const about = getToolById("about");
  if (!about) return "";
  return `
    <div class="ipk-nav-footer">
      <a class="ipk-nav-link" href="#/tool/${encodeURIComponent(about.id)}" data-tool-id="${about.id}">
        <span class="ipk-nav-footer-label">
          <span class="ipk-nav-icon">${about.icon ?? "ℹ️"}</span>
          <span>${escapeHtml(about.name)}</span>
          <span class="ipk-nav-new-dot" title="New changes since your last visit" hidden></span>
        </span>
        <span class="ipk-nav-version">v${__APP_VERSION__}</span>
      </a>
    </div>
  `;
}

/** Shows/hides the sidebar footer's "new changes" dot based on current localStorage state. */
function refreshWhatsNewBadge(): void {
  const dot = sidebarEl?.querySelector<HTMLElement>(".ipk-nav-new-dot");
  if (!dot) return;
  dot.hidden = !hasUnseenChanges(__APP_VERSION__);
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
      <div class="ipk-header-start">
        <button type="button" class="btn ipk-sidebar-toggle" id="ipk-sidebar-toggle" aria-label="Toggle sidebar" aria-expanded="true">☰</button>
        <div class="ipk-brand-group">
          <a class="ipk-brand" href="#/">
            <img class="ipk-logo ipk-logo-light" src="logo-light.png" alt="IPK" />
            <img class="ipk-logo ipk-logo-dark" src="logo-dark.png" alt="IPK" />
          </a>
          <button
            type="button"
            class="ipk-tagline"
            id="ipk-tagline"
            aria-haspopup="dialog"
            aria-expanded="false"
            aria-controls="ipk-tagline-popover"
          >
            Everything in your browser, nothing leaves
          </button>
          <div class="ipk-tagline-popover" id="ipk-tagline-popover" role="dialog" aria-label="Why everything stays in your browser" hidden>
            <p>
              IPK has no backend and makes no network calls from its tools - everything you paste or generate is
              processed as plain JavaScript right here in this tab.
            </p>
            <p>
              Some tools remember what you typed when you switch between them using the browser's
              <code class="mono">sessionStorage</code>. That's a small per-tab storage area built into the browser: it
              stays on your device, is never sent anywhere, and is automatically cleared the moment you close this tab.
            </p>
            <button type="button" class="btn ipk-tagline-popover-close" id="ipk-tagline-popover-close">Got it</button>
          </div>
        </div>
      </div>
      <div class="ipk-search">
        <form id="ipk-search-form" method="get" autocomplete="off">
          <svg class="ipk-search-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="7" cy="7" r="5" stroke="currentColor" stroke-width="1.5" />
            <line x1="11" y1="11" x2="14.5" y2="14.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
          </svg>
          <input type="search" id="ipk-search" name="q" placeholder="Search..." aria-label="Search" />
        </form>
        <button
          type="button"
          class="ipk-search-engine-btn"
          id="ipk-search-engine-btn"
          title="Add IPK as a browser search engine"
          aria-label="Add IPK as a browser search engine"
          aria-haspopup="dialog"
          aria-expanded="false"
          aria-controls="ipk-search-engine-popover"
        ><svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <line x1="8" y1="2.5" x2="8" y2="13.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
            <line x1="2.5" y1="8" x2="13.5" y2="8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
          </svg></button>
        <div class="ipk-search-engine-popover" id="ipk-search-engine-popover" role="dialog" aria-label="Add IPK as a browser search engine" hidden>
          <p>
            Search here once, then most browsers can add IPK as a shortcut: in Chrome/Edge, type this site's
            address and press Tab; in Firefox, click "Add Search Engine" next to the address bar. Or add it
            manually with these fields:
          </p>
          <div class="ipk-search-engine-field">
            <label class="ipk-search-engine-label" for="ipk-search-engine-name">Name</label>
            <div class="ipk-copy-wrap">
              <input type="text" id="ipk-search-engine-name" class="mono" readonly value="${DEFAULT_SEARCH_NAME}" />
              ${copyButtonHtml("ipk-search-engine-copy-name")}
            </div>
          </div>
          <div class="ipk-search-engine-field">
            <label class="ipk-search-engine-label" for="ipk-search-engine-keyword">Keyword / shortcut</label>
            <div class="ipk-copy-wrap">
              <input type="text" id="ipk-search-engine-keyword" class="mono" readonly value="${DEFAULT_SEARCH_KEYWORD}" />
              ${copyButtonHtml("ipk-search-engine-copy-keyword")}
            </div>
          </div>
          <div class="ipk-search-engine-field">
            <label class="ipk-search-engine-label" for="ipk-search-engine-url">URL</label>
            <div class="ipk-copy-wrap">
              <input type="text" id="ipk-search-engine-url" class="mono" readonly value="" />
              ${copyButtonHtml("ipk-search-engine-copy-url")}
            </div>
          </div>
        </div>
      </div>
      <div class="ipk-header-end">
        <button type="button" class="btn" id="ipk-theme-toggle"></button>
      </div>
    </header>
    <div class="ipk-body">
      <nav class="ipk-sidebar" id="ipk-sidebar" aria-label="Tools navigation"></nav>
      <div class="ipk-sidebar-backdrop" id="ipk-sidebar-backdrop"></div>
      <main class="ipk-main" id="ipk-main"></main>
    </div>
  `;

  const main = root.querySelector<HTMLElement>("#ipk-main")!;
  const sidebar = root.querySelector<HTMLElement>("#ipk-sidebar")!;
  const sidebarBackdrop = root.querySelector<HTMLElement>("#ipk-sidebar-backdrop")!;
  const sidebarToggle = root.querySelector<HTMLButtonElement>("#ipk-sidebar-toggle")!;
  const searchInput = root.querySelector<HTMLInputElement>("#ipk-search")!;
  const themeToggle = root.querySelector<HTMLButtonElement>("#ipk-theme-toggle")!;
  const taglineButton = root.querySelector<HTMLButtonElement>("#ipk-tagline")!;
  const taglinePopover = root.querySelector<HTMLElement>("#ipk-tagline-popover")!;
  const taglinePopoverClose = root.querySelector<HTMLButtonElement>("#ipk-tagline-popover-close")!;

  sidebarEl = sidebar;
  renderSidebar(sidebar);

  const closeTaglinePopover = () => {
    taglinePopover.hidden = true;
    taglineButton.setAttribute("aria-expanded", "false");
  };
  const openTaglinePopover = () => {
    taglinePopover.hidden = false;
    taglineButton.setAttribute("aria-expanded", "true");
  };
  taglineButton.addEventListener("click", (event) => {
    event.stopPropagation();
    if (taglinePopover.hidden) {
      openTaglinePopover();
    } else {
      closeTaglinePopover();
    }
  });
  taglinePopoverClose.addEventListener("click", closeTaglinePopover);
  const taglineGroup = root.querySelector<HTMLElement>(".ipk-brand-group")!;
  taglineGroup.addEventListener("mouseenter", openTaglinePopover);
  taglineGroup.addEventListener("mouseleave", closeTaglinePopover);
  taglineButton.addEventListener("focus", openTaglinePopover);
  taglineButton.addEventListener("blur", (event) => {
    if (!taglinePopover.contains(event.relatedTarget as Node)) {
      closeTaglinePopover();
    }
  });
  document.addEventListener("click", (event) => {
    if (!taglinePopover.hidden && !taglinePopover.contains(event.target as Node) && event.target !== taglineButton) {
      closeTaglinePopover();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !taglinePopover.hidden) {
      closeTaglinePopover();
      taglineButton.focus();
    }
  });

  const updateThemeToggle = () => {
    const resolved = getResolvedTheme();
    themeToggle.textContent = THEME_ICONS[resolved];
    themeToggle.setAttribute("aria-label", `Switch to ${resolved === "dark" ? "light" : "dark"} mode`);
  };
  updateThemeToggle();
  onSystemThemeChange(updateThemeToggle);

  themeToggle.addEventListener("click", () => {
    toggleTheme();
    updateThemeToggle();
  });

  const setSidebarCollapsed = (collapsed: boolean) => {
    document.body.classList.toggle("ipk-sidebar-collapsed", collapsed);
    sidebarToggle.setAttribute("aria-expanded", String(!collapsed));
    localStorage.setItem(SIDEBAR_COLLAPSE_KEY, collapsed ? "1" : "0");
  };
  if (localStorage.getItem(SIDEBAR_COLLAPSE_KEY) === "1") {
    setSidebarCollapsed(true);
  }
  sidebarToggle.addEventListener("click", () => {
    if (isMobileViewport()) {
      document.body.classList.toggle("ipk-sidebar-open");
    } else {
      setSidebarCollapsed(!document.body.classList.contains("ipk-sidebar-collapsed"));
    }
  });
  sidebarBackdrop.addEventListener("click", closeMobileSidebar);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && document.body.classList.contains("ipk-sidebar-open")) {
      closeMobileSidebar();
    }
  });

  searchInput.addEventListener("input", () => {
    if (window.location.hash && window.location.hash !== "#/") {
      navigateHome();
    }
    renderHome(main, searchInput.value);
  });

  const searchEngineBtn = root.querySelector<HTMLButtonElement>("#ipk-search-engine-btn")!;
  const searchEnginePopover = root.querySelector<HTMLElement>("#ipk-search-engine-popover")!;
  const searchEngineNameInput = root.querySelector<HTMLInputElement>("#ipk-search-engine-name")!;
  const searchEngineKeywordInput = root.querySelector<HTMLInputElement>("#ipk-search-engine-keyword")!;
  const searchEngineUrlInput = root.querySelector<HTMLInputElement>("#ipk-search-engine-url")!;
  wireCopyButton(root.querySelector<HTMLButtonElement>("#ipk-search-engine-copy-name")!, () => searchEngineNameInput.value);
  wireCopyButton(root.querySelector<HTMLButtonElement>("#ipk-search-engine-copy-keyword")!, () => searchEngineKeywordInput.value);
  wireCopyButton(root.querySelector<HTMLButtonElement>("#ipk-search-engine-copy-url")!, () => searchEngineUrlInput.value);

  const closeSearchEnginePopover = () => {
    searchEnginePopover.hidden = true;
    searchEngineBtn.setAttribute("aria-expanded", "false");
  };
  const openSearchEnginePopover = () => {
    // Recomputed on each open so it always reflects this deployment's real
    // location, even if the user somehow navigated to a different origin.
    searchEngineUrlInput.value = getSearchEngineUrl();
    searchEnginePopover.hidden = false;
    searchEngineBtn.setAttribute("aria-expanded", "true");
  };
  searchEngineBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    if (searchEnginePopover.hidden) {
      openSearchEnginePopover();
    } else {
      closeSearchEnginePopover();
    }
  });
  document.addEventListener("click", (event) => {
    if (
      !searchEnginePopover.hidden &&
      !searchEnginePopover.contains(event.target as Node) &&
      event.target !== searchEngineBtn
    ) {
      closeSearchEnginePopover();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !searchEnginePopover.hidden) {
      closeSearchEnginePopover();
      searchEngineBtn.focus();
    }
  });

  // Clicking a card uses a plain <a href="#/tool/...">; keep navigateToTool
  // exported for any tool that wants to link elsewhere programmatically.
  void navigateToTool;

  return { main };
}
