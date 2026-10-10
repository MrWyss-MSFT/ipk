/**
 * Minimal, tailored renderer for CHANGELOG.md as produced by release-it's
 * conventional-changelog plugin (not a general-purpose Markdown parser -
 * see src/tools/playbooks/markdown.ts for that). Expected shape:
 *
 *   ## [1.2.0](compare-url) (2024-01-01)
 *   ### Features
 *   * **scope:** description ([abcdef](commit-url))
 */

import { isVersionOlder } from "@/app/version";

function escapeHtml(value: string): string {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}

/** Converts **bold**, `code`, and [text](url) inline markdown to HTML (input must already be escaped). */
function renderInline(escaped: string): string {
  return escaped
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+?)`/g, "<code>$1</code>")
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
}

export function renderChangelogHtml(markdown: string): string {
  const lines = markdown.split(/\r?\n/);
  let html = "";
  let inList = false;

  const closeList = () => {
    if (inList) {
      html += "</ul>";
      inList = false;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("# ")) continue; // skip blank lines and the top-level "# Changelog" title

    if (line.startsWith("## ")) {
      closeList();
      html += `<h3 class="abt-ver">${renderInline(escapeHtml(line.slice(3)))}</h3>`;
    } else if (line.startsWith("### ")) {
      closeList();
      html += `<h4 class="abt-sub">${renderInline(escapeHtml(line.slice(4)))}</h4>`;
    } else if (line.startsWith("* ") || line.startsWith("- ")) {
      if (!inList) {
        html += "<ul>";
        inList = true;
      }
      html += `<li>${renderInline(escapeHtml(line.slice(2)))}</li>`;
    } else {
      closeList();
      html += `<p>${renderInline(escapeHtml(line))}</p>`;
    }
  }
  closeList();
  return html;
}

/** True once CHANGELOG.md contains at least one release section (a "## " heading). */
export function hasReleaseEntries(markdown: string): boolean {
  return /^## /m.test(markdown);
}

/**
 * Returns just the "## [x.y.z](...)" sections strictly newer than
 * `sinceVersion`, in their original markdown form (ready to pass through
 * renderChangelogHtml). Used to show a "what's new since your last visit"
 * excerpt instead of the entire history.
 */
export function sliceChangelogSince(markdown: string, sinceVersion: string): string {
  const lines = markdown.split(/\r?\n/);
  const sections: { version: string; lines: string[] }[] = [];
  let current: { version: string; lines: string[] } | null = null;

  for (const line of lines) {
    const match = /^## \[(\d+(?:\.\d+)*)\]/.exec(line.trim());
    if (match) {
      if (current) sections.push(current);
      current = { version: match[1], lines: [line] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) sections.push(current);

  return sections
    .filter((section) => isVersionOlder(sinceVersion, section.version))
    .map((section) => section.lines.join("\n"))
    .join("\n");
}
