/**
 * Guides are authored as plain Markdown files under ./guides/*.md (see
 * markdown.ts for the exact format) and loaded here automatically - adding a
 * new playbook is just adding a new .md file, no TypeScript changes needed.
 */
import { parseGuideMarkdown, type GuideEntry, type GuideStep } from "./markdown";

const files = import.meta.glob<string>("./guides/*.md", {
  eager: true,
  query: "?raw",
  import: "default",
});

export const GUIDES: GuideEntry[] = Object.entries(files)
  .map(([path, raw]) => {
    const id = path.split("/").pop()!.replace(/\.md$/, "");
    return parseGuideMarkdown(raw, id);
  })
  .sort((a, b) => a.title.localeCompare(b.title));

export type { GuideEntry, GuideStep };
