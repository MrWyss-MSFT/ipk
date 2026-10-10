/**
 * Minimal Markdown-ish renderer for the Stay Awake "screen message" preview.
 * Not a general-purpose parser (see src/tools/playbooks/markdown.ts for that one) -
 * just enough for a short status message: headings, bold/italic, inline code,
 * links, and simple bullet lists. Everything else renders as plain paragraphs.
 */

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Converts **bold**, *italic*, `code`, and [text](url) inline markdown to HTML (input must already be escaped). */
function renderInline(escaped: string): string {
  return escaped
    .replace(/`([^`]+?)`/g, "<code>$1</code>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/__(.+?)__/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/_(.+?)_/g, "<em>$1</em>")
    .replace(/\[(.+?)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
}

/** Renders a small Markdown subset to HTML. Caller is responsible for any `{{variable}}` substitution first. */
export function renderMarkdown(markdown: string): string {
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
    if (!line) {
      closeList();
      continue;
    }

    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      closeList();
      const level = heading[1].length;
      html += `<h${level} class="awk-md-h${level}">${renderInline(escapeHtml(heading[2]))}</h${level}>`;
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      if (!inList) {
        html += "<ul>";
        inList = true;
      }
      html += `<li>${renderInline(escapeHtml(line.replace(/^[-*]\s+/, "")))}</li>`;
      continue;
    }

    closeList();
    html += `<p>${renderInline(escapeHtml(line))}</p>`;
  }
  closeList();
  return html;
}

/** Replaces `{{key}}` placeholders (case-insensitive) with values from `vars`; unknown keys are left as-is. */
export function substituteVariables(markdown: string, vars: Record<string, string>): string {
  return markdown.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) => {
    const value = vars[key.toLowerCase()];
    return value !== undefined ? value : match;
  });
}
