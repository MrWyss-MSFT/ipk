/**
 * Contract every Tool must implement to plug into ItProKit.
 *
 * Drop a new folder under src/tools/<tool-id>/ with an index.ts that
 * exports a ToolDefinition as its default export, and it is automatically
 * discovered and listed - no other code needs to change.
 */
/** A sub-item within a tool (e.g. one Playbooks guide) that the global search can surface and deep-link to directly. */
export interface ToolSearchItem {
  /** Sub-item slug, unique within this tool. Deep-links via #/tool/<toolId>/<id> and is passed to mount() as context.itemId. */
  id: string;
  /** Title shown in search results. */
  title: string;
  /** Short snippet shown under the title in search results. */
  description?: string;
  /** Extra search terms matched against the quick-search box. */
  keywords?: string[];
}

/** Extra info passed to mount() when the tool was entered via a deep link. */
export interface ToolMountContext {
  /** Set to a ToolSearchItem's `id` when navigated via #/tool/<id>/<itemId>; tools with searchItems() should scroll to/open the matching item. */
  itemId?: string;
}

export interface ToolDefinition {
  /** URL-safe unique slug, e.g. "base64". Used in the route #/tool/<id>. */
  id: string;
  /** Display name shown on the tool card and detail header. */
  name: string;
  /** Short one/two-line description shown on the home grid and search. */
  description: string;
  /** Grouping category, e.g. "Converters", "Intune", "Entra ID". */
  category: string;
  /** Extra search terms matched against the quick-search box. */
  keywords?: string[];
  /** Inline SVG markup (preferred) or emoji fallback shown on the card. */
  icon?: string;
  /**
   * Render the tool's UI into `container`. Called each time the tool route
   * is entered. May return a cleanup function, invoked when the user
   * navigates away (to remove listeners, timers, etc.). `context.itemId` is
   * set when entered via a deep link to one of this tool's searchItems().
   */
  mount(container: HTMLElement, context?: ToolMountContext): void | (() => void);
  /**
   * Optional extra searchable sub-items this tool contributes (e.g.
   * individual playbook guides or reference entries), so the global search
   * can match and deep-link straight to them instead of only matching the
   * tool as a whole. Call cheaply - this runs on every keystroke in search.
   */
  searchItems?(): ToolSearchItem[];
}
