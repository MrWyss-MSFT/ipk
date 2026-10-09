import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import pkg from "./package.json";

// Strip the "git+" prefix and ".git" suffix npm sometimes adds to repository
// URLs so the About page can link straight to the GitHub repo.
const repoUrl = pkg.repository?.url?.replace(/^git\+/, "").replace(/\.git$/, "") ?? "";

// Host-agnostic static build: relative base so the output works from any
// subpath (GitHub Pages, Azure Static Web Apps, a plain file share, etc.).
export default defineConfig({
  base: "./",
  resolve: {
    // Mirrors the "@/*" path mapping in tsconfig.json — Vite doesn't read
    // tsconfig paths itself, so the alias has to be declared here too.
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  define: {
    // Exposed to the app as the ambient globals declared in vite-env.d.ts,
    // used by the About tool to show the running version and repo link.
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_REPO_URL__: JSON.stringify(repoUrl),
  },
  build: {
    target: "es2022",
    sourcemap: true,
  },
  server: {
    // Docker Desktop bind mounts on Windows/macOS don't forward native
    // filesystem change events into the container, so HMR silently stops
    // working. Polling trades a little CPU for reliable file watching.
    watch: {
      usePolling: true,
      interval: 300,
    },
    host: true,
  },
});
