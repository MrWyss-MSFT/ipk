import "./style.css";
import type { ToolDefinition } from "@/types/tool";
import rawChangelog from "../../../CHANGELOG.md?raw";
import { hasReleaseEntries, renderChangelogHtml } from "./changelog";

const tool: ToolDefinition = {
  id: "about",
  name: "About",
  description: "ItProKit's version, source repository, and release changelog.",
  category: "About",
  icon: "ℹ️",
  // Linked from a pinned sidebar footer link (see layout.ts), not listed as a
  // regular tool - keeps it out of the home grid, nav groups, and search.
  hidden: true,
  mount(container) {
    const repoUrl = __APP_REPO_URL__;
    const repoHtml = repoUrl
      ? `<a href="${repoUrl}" target="_blank" rel="noopener noreferrer">${repoUrl.replace(/^https?:\/\//, "")}</a>`
      : `<span class="abt-muted">Not set yet</span>`;

    container.innerHTML = `
      <div class="abt-tool">
        <section class="abt-card">
          <dl class="abt-facts">
            <dt>Version</dt>
            <dd><span class="abt-tag">v${__APP_VERSION__}</span></dd>
            <dt>Source</dt>
            <dd>${repoHtml}</dd>
          </dl>
          <p class="abt-note">
            Releases are cut with <a href="https://github.com/release-it/release-it" target="_blank" rel="noopener noreferrer">release-it</a>.
            Use <a href="https://www.conventionalcommits.org/" target="_blank" rel="noopener noreferrer">Conventional Commits</a>
            (<code>feat:</code>, <code>fix:</code>, <code>chore:</code>, …), then run
            <code>npm run release</code> to bump the version, update this changelog, and tag the release.
          </p>
        </section>

        <h2 class="abt-changelog-title">Changelog</h2>
        <div class="abt-changelog">
          ${
            hasReleaseEntries(rawChangelog)
              ? renderChangelogHtml(rawChangelog)
              : `<p class="abt-muted">No releases yet - run <code>npm run release</code> to cut the first one.</p>`
          }
        </div>
      </div>
    `;
  },
};

export default tool;
