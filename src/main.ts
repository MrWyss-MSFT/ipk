import "@/styles/variables.css";
import "@/styles/base.css";
import "@/styles/components.css";

import { initRouter } from "@/app/router";
import { initTheme } from "@/app/theme";
import { initWhatsNew } from "@/app/whats-new";
import { buildLayout, renderRoute } from "@/app/layout";

initTheme();
initWhatsNew(__APP_VERSION__);

const root = document.getElementById("app");
if (!root) {
  throw new Error("Missing #app root element");
}

const { main } = buildLayout(root);
initRouter((route) => renderRoute(main, route));
