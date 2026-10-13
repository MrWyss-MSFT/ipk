import "./style.css";
import { copyButtonHtml, wireCopyButton } from "@/app/copy-button";
import { highlightCode } from "@/app/highlight";
import type { ToolDefinition, ToolMountContext } from "@/types/tool";
import { GUIDES, type GuideEntry } from "./data";

function tagsHtml(tags?: string[]): string {
  return (tags ?? []).map((t) => `<span class="pbk-tag">${t}</span>`).join(" ");
}

function matchText(haystack: (string | undefined)[], query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return haystack.some((h) => (h ?? "").toLowerCase().includes(q));
}

const ADMIN_PREFIX = "🛡️ ";

/** Friendlier tab label for a step's fence language, mirroring `psCommandTabsHtml`'s single-tab usage (see registry-preview). Falls back to the fence's own label (e.g. "PowerShell", "XML"). */
const TAB_LABELS: Record<string, string> = {
  cmd: "Command Prompt",
};

/** Escapes a step's plain-text instruction and renders single-backtick inline code (e.g. `` `-numiterations` ``) as `<code>`, the one bit of inline Markdown Playbooks supports. */
function stepTextHtml(text: string): string {
  return escapeHtml(text).replace(/`([^`]+)`/g, "<code>$1</code>");
}

function stepHtml(guide: GuideEntry, stepIndex: number): string {
  const step = guide.steps[stepIndex];
  const requiresAdmin = step.text.startsWith(ADMIN_PREFIX);
  const text = requiresAdmin ? step.text.slice(ADMIN_PREFIX.length) : step.text;
  const copyId = `pbk-copy-${guide.id}-${stepIndex}`;
  const codeHtml = step.code ? (step.codeLang ? highlightCode(step.code, step.codeLang) : escapeHtml(step.code)) : "";
  const tabLabel = step.lang ? (TAB_LABELS[step.lang.toLowerCase()] ?? step.lang) : "Command";
  return `
    <li class="pbk-step">
      <p class="pbk-step-text">${stepTextHtml(text)}</p>
      ${
        step.code
          ? `<div class="ipk-ps-command">
               <div class="ipk-ps-tabs" role="tablist" aria-label="Command shell">
                 <button type="button" class="ipk-ps-tab is-active" role="tab" aria-selected="true" tabindex="-1">${tabLabel}</button>
                 ${requiresAdmin ? `<span class="ipk-ps-admin-badge" title="Needs an elevated Command Prompt (Run as Administrator)">🛡️ Admin</span>` : ""}
               </div>
               <div class="ipk-copy-wrap ipk-copy-wrap-tabbed">
                 <pre class="ipk-code mono"><code>${codeHtml}</code></pre>
                 ${copyButtonHtml(copyId, `Copy "${text}"`)}
               </div>
             </div>`
          : ""
      }
    </li>
  `;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
}

function guideHtml(guide: GuideEntry, isOpen: boolean): string {
  return `
    <details class="pbk-guide" data-guide-id="${guide.id}" ${isOpen ? "open" : ""}>
      <summary class="pbk-guide-summary">
        <span class="pbk-guide-title">${guide.title}</span>
        <span class="pbk-guide-desc">${guide.summary}</span>
        <span class="pbk-guide-tags">${tagsHtml(guide.tags)}</span>
      </summary>
      <ol class="pbk-steps">
        ${guide.steps.map((_, i) => stepHtml(guide, i)).join("")}
      </ol>
    </details>
  `;
}

const tool: ToolDefinition = {
  id: "playbooks",
  name: "Playbooks",
  description: "Short, copy-pasteable step-by-step guides for recurring IT Pro tasks.",
  category: "Reference",
  keywords: ["guide", "guides", "howto", "how-to", "runbook", "recipe", "walkthrough"],
  icon: "📓",
  searchItems() {
    return GUIDES.map((g) => ({
      id: g.id,
      title: g.title,
      description: g.summary,
      keywords: g.tags,
    }));
  },
  mount(container, context?: ToolMountContext) {
    container.innerHTML = `
      <div class="pbk-tool">
        <input type="search" id="pbk-filter" class="pbk-filter" placeholder="Filter playbooks by title, step, or tag..." />
        <div class="pbk-list" id="pbk-list"></div>
        <p class="pbk-empty" id="pbk-empty" hidden>No playbooks match your filter.</p>
      </div>
    `;

    const filterInput = container.querySelector<HTMLInputElement>("#pbk-filter")!;
    const list = container.querySelector<HTMLDivElement>("#pbk-list")!;
    const empty = container.querySelector<HTMLParagraphElement>("#pbk-empty")!;
    const deepLinkedId = context?.itemId;

    const render = () => {
      const query = filterInput.value.trim();
      const filtered = GUIDES.filter((g) =>
        matchText(
          [g.title, g.summary, ...(g.tags ?? []), ...g.steps.map((s) => s.text), ...g.steps.map((s) => s.code)],
          query,
        ),
      );
      empty.hidden = filtered.length > 0;
      list.innerHTML = filtered
        .map((g) => guideHtml(g, deepLinkedId ? g.id === deepLinkedId : false))
        .join("");

      filtered.forEach((guide) => {
        guide.steps.forEach((step, i) => {
          if (!step.code) return;
          const btn = list.querySelector<HTMLButtonElement>(`#pbk-copy-${guide.id}-${i}`);
          if (btn) wireCopyButton(btn, () => step.code ?? "");
        });
      });
    };

    filterInput.addEventListener("input", render);
    render();

    if (deepLinkedId) {
      list.querySelector(`[data-guide-id="${CSS.escape(deepLinkedId)}"]`)?.scrollIntoView({ block: "start" });
    }
  },
};

export default tool;
