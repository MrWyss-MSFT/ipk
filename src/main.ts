import "@/styles/variables.css";
import "@/styles/base.css";
import "@/styles/components.css";

import { initRouter, navigateToTool } from "@/app/router";
import { initTheme } from "@/app/theme";
import { initWhatsNew } from "@/app/whats-new";
import { buildLayout, renderRoute, showHomeSearch } from "@/app/layout";
import { installOpenSearchDescriptor, resolveIncomingSearchQuery } from "@/app/search-provider";

initTheme();
initWhatsNew(__APP_VERSION__);
installOpenSearchDescriptor();

const root = document.getElementById("app");
if (!root) {
  throw new Error("Missing #app root element");
}

const { main } = buildLayout(root);
initRouter((route) => renderRoute(main, route));

const searchAction = resolveIncomingSearchQuery();
if (searchAction.kind === "redirect") {
  navigateToTool(searchAction.toolId, searchAction.itemId);
} else if (searchAction.kind === "show") {
  showHomeSearch(main, searchAction.query);
}
