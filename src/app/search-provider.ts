import { searchAll } from "@/app/registry";

/**
 * Computes this deployment's absolute base URL at runtime (e.g.
 * "https://ipk.ittips.ch/" or "https://host/some/subpath/"). Never
 * hardcoded - IPK can be self-hosted at any domain/path, so every URL this
 * module builds (OpenSearch descriptor, "add as search engine" fields) must
 * be derived from `location` instead of a build-time constant.
 */
export function getSearchBaseUrl(): string {
  return new URL(".", window.location.href).href;
}

/** The exact URL template to register as a browser search engine. */
export function getSearchEngineUrl(): string {
  return `${getSearchBaseUrl()}?q=%s`;
}

const OPENSEARCH_SHORT_NAME = "IT Pro Kit";
const OPENSEARCH_DESCRIPTION = "IT Pro Kit - handy static tools for IT Pros managing endpoints with Microsoft tech.";

/**
 * Builds an OpenSearch descriptor for this exact deployment and injects a
 * `<link rel="search">` tag into <head> so Firefox can auto-detect it and
 * offer "Add Search Engine". The descriptor can't be a static file because
 * its <Url template> must bake in an absolute, deployment-specific base URL
 * - so it's generated client-side as a Blob instead.
 */
export function installOpenSearchDescriptor(): void {
  const baseUrl = getSearchBaseUrl();
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/">
  <ShortName>${OPENSEARCH_SHORT_NAME}</ShortName>
  <Description>${OPENSEARCH_DESCRIPTION}</Description>
  <InputEncoding>UTF-8</InputEncoding>
  <Url type="text/html" template="${baseUrl}?q={searchTerms}"/>
  <Image width="16" height="16" type="image/png">${baseUrl}favicon-16x16.png</Image>
</OpenSearchDescription>`;

  const blob = new Blob([xml], { type: "application/opensearchdescription+xml" });
  const link = document.createElement("link");
  link.rel = "search";
  link.type = "application/opensearchdescription+xml";
  link.title = OPENSEARCH_SHORT_NAME;
  link.href = URL.createObjectURL(blob);
  document.head.appendChild(link);
}

/**
 * Result of inspecting an incoming `?q=` query param: either nothing to do,
 * a single unambiguous match to redirect straight to, or multiple/zero
 * matches that should be shown on the home page's search results.
 */
export type IncomingSearchAction =
  | { kind: "none" }
  | { kind: "redirect"; toolId: string; itemId?: string }
  | { kind: "show"; query: string };

/**
 * Inspects a `?q=` landed on at boot (from a browser search-engine query, a
 * bookmarked search URL, or the header search form's real GET submit) and
 * decides what the app should do about it. Always strips `?q=` from the
 * address bar as a side effect (the hash is preserved) so the URL doesn't
 * keep stale search state. Deliberately returns a plain decision instead of
 * performing navigation itself - doing the actual `navigateHome`/
 * `navigateToTool`/render call in `main.ts` avoids a race between this
 * running synchronously at boot and the router's own (async) hashchange
 * handling.
 */
export function resolveIncomingSearchQuery(): IncomingSearchAction {
  const url = new URL(window.location.href);
  const query = url.searchParams.get("q");
  if (query === null) return { kind: "none" };

  url.searchParams.delete("q");
  history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);

  const trimmed = query.trim();
  if (!trimmed) return { kind: "none" };

  const results = searchAll(trimmed);
  if (results.length === 1) {
    return { kind: "redirect", toolId: results[0].tool.id, itemId: results[0].item?.id };
  }
  return { kind: "show", query: trimmed };
}
