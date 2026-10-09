/**
 * Minimal Markdown-ish parser for Playbooks guide files (see guides/*.md).
 *
 * Format, kept deliberately simple so non-TypeScript collaborators can
 * author a guide without reading this file:
 *
 *   ---
 *   title: My Guide Title
 *   summary: One-line summary shown on the collapsed card.
 *   tags: Comma, Separated, Tags
 *   ---
 *
 *   1. Step instruction text.
 *
 *   ```powershell
 *   Some-Command -Here
 *   ```
 *
 *   2. Next step, code block is optional.
 *
 * Each numbered list item (top-level, "N. ") starts a new step; everything
 * until the next numbered item is that step's text, with at most one fenced
 * code block extracted out of it (the fence's language becomes the badge).
 */

export interface GuideStep {
  /** Short instruction text for this step, plain text. */
  text: string;
  /** Optional command/config block shown below the text, with a copy button. */
  code?: string;
  /** Badge shown next to the code block, e.g. "PowerShell", "XML", "cmd". */
  lang?: string;
}

export interface GuideEntry {
  /** URL-safe slug, derived from the markdown file name. */
  id: string;
  title: string;
  /** One-line summary shown on the collapsed card. */
  summary: string;
  /** Free-form labels, e.g. ["Sysmon"], ["Registry", "Troubleshooting"]. */
  tags?: string[];
  steps: GuideStep[];
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

/** Friendlier badge text for common fence languages; falls back to the raw tag. */
const LANG_LABELS: Record<string, string> = {
  powershell: "PowerShell",
  ps1: "PowerShell",
  xml: "XML",
  cmd: "cmd",
  bat: "cmd",
  batch: "cmd",
  json: "JSON",
  text: "text",
};

function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
  const match = FRONTMATTER_RE.exec(raw);
  if (!match) return { meta: {}, body: raw };
  const [, yaml, body] = match;
  const meta: Record<string, string> = {};
  for (const line of yaml.split(/\r?\n/)) {
    const m = /^([a-zA-Z][\w-]*):\s*(.*)$/.exec(line);
    if (m) meta[m[1]] = m[2].trim();
  }
  return { meta, body };
}

function stepFromLines(lines: string[]): GuideStep {
  const joined = lines.join("\n").trim();
  const codeMatch = /```(\w*)\r?\n([\s\S]*?)```/.exec(joined);
  if (!codeMatch) return { text: joined };

  const text = joined.slice(0, codeMatch.index).trim();
  const rawLang = codeMatch[1].toLowerCase();
  const code = codeMatch[2].replace(/\r?\n$/, "");
  return { text, code, lang: rawLang ? (LANG_LABELS[rawLang] ?? codeMatch[1]) : undefined };
}

function parseSteps(body: string): GuideStep[] {
  const lines = body.split(/\r?\n/);
  const steps: GuideStep[] = [];
  let current: string[] | null = null;

  const flush = () => {
    if (current) steps.push(stepFromLines(current));
    current = null;
  };

  for (const line of lines) {
    const listMatch = /^\d+\.\s+(.*)$/.exec(line);
    if (listMatch) {
      flush();
      current = [listMatch[1]];
    } else if (current) {
      current.push(line);
    }
  }
  flush();
  return steps;
}

export function parseGuideMarkdown(raw: string, idFromFileName: string): GuideEntry {
  const { meta, body } = parseFrontmatter(raw);
  return {
    id: idFromFileName,
    title: meta.title ?? idFromFileName,
    summary: meta.summary ?? "",
    tags: meta.tags
      ? meta.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
      : undefined,
    steps: parseSteps(body),
  };
}
