export type Route = { name: "home" } | { name: "tool"; id: string; itemId?: string };

function parseHash(hash: string): Route {
  const clean = hash.replace(/^#\/?/, "");
  if (!clean) return { name: "home" };
  const match = clean.match(/^tool\/([^/]+)(?:\/([^/]+))?$/);
  if (match) {
    return {
      name: "tool",
      id: decodeURIComponent(match[1]),
      itemId: match[2] ? decodeURIComponent(match[2]) : undefined,
    };
  }
  return { name: "home" };
}

/** Minimal hash-based router. No framework needed for two routes. */
export function initRouter(onChange: (route: Route) => void): void {
  const emit = () => onChange(parseHash(window.location.hash));
  window.addEventListener("hashchange", emit);
  emit();
}

export function navigateToTool(id: string, itemId?: string): void {
  window.location.hash = itemId
    ? `#/tool/${encodeURIComponent(id)}/${encodeURIComponent(itemId)}`
    : `#/tool/${encodeURIComponent(id)}`;
}

export function navigateHome(): void {
  window.location.hash = "#/";
}
