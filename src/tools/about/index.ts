import "./style.css";
import type { ToolDefinition } from "@/types/tool";
import rawChangelog from "../../../CHANGELOG.md?raw";
import { hasReleaseEntries, renderChangelogHtml } from "./changelog";

const tool: ToolDefinition = {
  id: "about",
  name: "About",
  description: "IPK's version, source repository, and release changelog.",
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
          <h2 class="abt-details-title">Details</h2>
          <dl class="abt-facts">
            <dt>Version</dt>
            <dd><button type="button" class="abt-tag abt-version" title="v${__APP_VERSION__}">v${__APP_VERSION__}</button></dd>
            <dt>Source</dt>
            <dd>${repoHtml}</dd>
            <dt>Author</dt>
            <dd>
              <a href="https://github.com/MrWyss-MSFT" target="_blank" rel="noopener noreferrer">MrWyss-MSFT</a>
              <span class="abt-muted"> — maintained in a private capacity.</span>
            </dd>
            <dt>License</dt>
            <dd>
              ${
                repoUrl
                  ? `<a href="${repoUrl}/blob/main/LICENSE" target="_blank" rel="noopener noreferrer">MIT</a>`
                  : `MIT`
              }
            </dd>
          </dl>
          <img class="abt-mascot" src="mascot.png" alt="IPK mascot: a grandma happily typing on a laptop" hidden />
        </section>

        <section class="abt-card">
          <h2 class="abt-contrib-title">Contributing</h2>
          <p>
            Contributions are welcome! Feel free to open a pull request, or file an
            issue for bugs and feature requests on
            ${
              repoUrl
                ? `<a href="${repoUrl}/issues" target="_blank" rel="noopener noreferrer">GitHub Issues</a>`
                : `GitHub Issues`
            }.
          </p>
        </section>

        <section class="abt-card">
          <h2 class="abt-changelog-title">Changelog</h2>
          <div class="abt-changelog">
            ${
              hasReleaseEntries(rawChangelog)
                ? renderChangelogHtml(rawChangelog)
                : `<p class="abt-muted">No releases yet - run <code>npm run release</code> to cut the first one.</p>`
            }
          </div>
        </section>
      </div>
    `;

    // Easter egg: tap the version badge a few times to reveal the mascot.
    const versionButton = container.querySelector<HTMLButtonElement>(".abt-version");
    const mascot = container.querySelector<HTMLImageElement>(".abt-mascot");
    const TAPS_REQUIRED = 5;
    let taps = 0;
    versionButton?.addEventListener("click", () => {
      taps += 1;
      if (taps >= TAPS_REQUIRED) {
        mascot?.removeAttribute("hidden");
      }
    });
  },
};

export default tool;
