import type { ToolDefinition, ToolSearchItem } from "@/types/tool";

/**
 * Auto-discovers every Tool under src/tools/ (index.ts files). Adding a new
 * tool is just dropping a new folder there with a default-exported
 * ToolDefinition - nothing here needs to change.
 */
const modules = import.meta.glob<{ default: ToolDefinition }>("../tools/*/index.ts", {
  eager: true,
});

const allTools: ToolDefinition[] = Object.values(modules)
  .map((mod) => mod.default)
  .filter((tool): tool is ToolDefinition => Boolean(tool?.id))
  .sort((a, b) => a.name.localeCompare(b.name));

/** Visible tools only (excludes `hidden` tools like About) - used for the home grid, sidebar, categories, and search. */
export function getTools(): ToolDefinition[] {
  return allTools.filter((tool) => !tool.hidden);
}

/** Looks up any tool by id, including hidden ones, so #/tool/<id> routing works regardless of visibility. */
export function getToolById(id: string): ToolDefinition | undefined {
  return allTools.find((tool) => tool.id === id);
}

export function searchTools(query: string): ToolDefinition[] {
  const q = query.trim().toLowerCase();
  const tools = getTools();
  if (!q) return tools;
  return tools.filter((tool) => {
    const haystack = [tool.name, tool.description, tool.category, ...(tool.keywords ?? [])]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}

/** A home-search result: either a whole tool, or one of its searchItems() (deep-linkable sub-item). */
export type SearchResult = { tool: ToolDefinition; item?: ToolSearchItem };

/**
 * Like searchTools, but also matches each tool's optional searchItems()
 * (e.g. individual Playbooks guides) and returns those as distinct,
 * deep-linkable results instead of folding them into the parent tool.
 */
export function searchAll(query: string): SearchResult[] {
  const q = query.trim().toLowerCase();
  const tools = getTools();
  if (!q) return tools.map((tool) => ({ tool }));

  const results: SearchResult[] = [];
  for (const tool of tools) {
    const toolHaystack = [tool.name, tool.description, tool.category, ...(tool.keywords ?? [])]
      .join(" ")
      .toLowerCase();
    const matchedItems = (tool.searchItems?.() ?? []).filter((item) =>
      [item.title, item.description, ...(item.keywords ?? [])].join(" ").toLowerCase().includes(q),
    );
    if (matchedItems.length) {
      matchedItems.forEach((item) => results.push({ tool, item }));
    } else if (toolHaystack.includes(q)) {
      results.push({ tool });
    }
  }
  return results;
}

export function getCategories(): string[] {
  return Array.from(new Set(getTools().map((tool) => tool.category))).sort();
}
