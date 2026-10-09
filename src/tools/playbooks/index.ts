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

function stepHtml(guide: GuideEntry, stepIndex: number): string {
  const step = guide.steps[stepIndex];
  const copyId = `pbk-copy-${guide.id}-${stepIndex}`;
  const codeHtml = step.code ? (step.codeLang ? highlightCode(step.code, step.codeLang) : escapeHtml(step.code)) : "";
  return `
    <li class="pbk-step">
      <p class="pbk-step-text">${step.text}</p>
      ${
        step.code
          ? `<div class="pbk-code-wrap">
               ${step.lang ? `<span class="pbk-lang">${step.lang}</span>` : ""}
               <pre class="mono pbk-code"><code>${codeHtml}</code></pre>
               ${copyButtonHtml(copyId, `Copy "${step.text}"`)}
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
        .map((g, i) => guideHtml(g, deepLinkedId ? g.id === deepLinkedId : i === 0))
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
