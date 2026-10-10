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
          <h2 class="abt-support-title">Support</h2>
          <p>
            ${
              repoUrl
                ? `<a class="abt-star-btn" href="${repoUrl}" target="_blank" rel="noopener noreferrer" aria-label="Star MrWyss-MSFT/ipk on GitHub">
                    <svg class="abt-star-icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="currentColor">
                      <path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.751.751 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z"></path>
                    </svg>
                    Star on GitHub
                  </a>`
                : `Star on GitHub`
            }
          </p>
          <p class="abt-muted">
            No analytics, no tracking - I have no idea how many people use IPK
            or find it useful. A star is the only signal I get, so if it's
            saved you time, it'd mean a lot.
          </p>
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
