# AGENTS.md — IPK - IT Pro Kit

Guidance for AI agents (and humans) working in this repo.

## What this is

IPK (IT Pro Kit) is a static website of small, self-contained tools for IT Pros
managing endpoints with Microsoft technologies — think [IT Tools](https://it-tools.tech/)
but focused on Intune/Autopilot/Entra/ConfigMgr/Windows. It must stay **slim,
fast, and trivially extensible**: adding a tool should mean "drop a folder",
nothing more.

- **Stack**: Vite + Vanilla TypeScript (no framework). Plain CSS with custom
  properties for theming (light/dark). Hash-based router (`#/`, `#/tool/<id>`).
- **Everything runs client-side.** Tools never upload user data anywhere —
  this is a hard requirement, not a preference (see "No network calls" below).

## Architecture

```
src/
  app/            # router, layout/shell, theme, tool registry, shared helpers
  styles/         # variables.css (theme tokens), base.css, components.css
  tools/<id>/     # one folder per tool — see "Adding a tool" below
  types/tool.ts   # the ToolDefinition contract
main.ts
```

- **Tool discovery is automatic**: `src/app/registry.ts` uses
  `import.meta.glob("../tools/*/index.ts", { eager: true })` to find every
  tool. Adding a tool never requires touching the registry, router, or any
  other existing file.
- Tools are sorted alphabetically by name and grouped by `category` (free-form
  string — reuse an existing category where it fits, e.g. "Converters",
  "Generators", "Reference", "Utilities").

## Adding a tool

Create `src/tools/<kebab-id>/`:

- `index.ts` — default-exports a `ToolDefinition` (see `src/types/tool.ts`):
  `id`, `name`, `description`, `category`, optional `keywords`/`icon`, and a
  `mount(container)` function that renders the UI and optionally returns a
  cleanup callback (remove listeners/timers on navigation away). Set
  `hidden: true` for an app-level page that shouldn't appear in the home
  grid/sidebar groups/search (e.g. About, linked from the sidebar footer
  instead) - it's still reachable at `#/tool/<id>`.
- `parse.ts` / `decode.ts` / etc. — pure logic, kept separate from DOM code so
  it's easy to unit-test with a throwaway script (see "Testing" below).
- `style.css` — imported at the top of `index.ts` (`import "./style.css"`).
  Scope class names with a short tool-specific prefix (e.g. `.esp-*`,
  `.apc-*`) to avoid collisions; use the shared tokens from
  `variables.css`/`components.css` (`--space-*`, `--radius-*`, `--border`,
  `--text-muted`, `--success`, `--danger`, …) instead of hard-coded values.

Use `copyButtonHtml()` / `wireCopyButton()` / `autoGrowTextarea()` from
`@/app/copy-button` for any copyable field — don't reinvent copy buttons.

## Adding a Playbook (guide)

Playbooks (`src/tools/playbooks/`) are short, step-by-step guides authored as
plain Markdown — no TypeScript needed. To add one, drop a new file at
`src/tools/playbooks/guides/<kebab-id>.md`:

```markdown
---
title: My Guide Title
summary: One-line summary shown on the collapsed card.
tags: Comma, Separated, Tags
---

1. First step's instruction text.

   ```powershell
   Some-Command -Here
   ```

2. Next step. A code block is optional per step.
```

- The file name becomes the guide's id/slug.
- Each top-level numbered item (`1.`, `2.`, …) is one step; everything up to
  the next numbered item is that step's text, with at most one fenced code
  block pulled out of it (the fence's language, e.g. `powershell`/`xml`/`cmd`,
  becomes the badge shown next to it).
- The glob + parser live in `src/tools/playbooks/data.ts` /
  `src/tools/playbooks/markdown.ts` — don't add guides to those files
  directly; they auto-discover every `.md` file under `guides/`.
- Guides are automatically searchable from the global (header) search box
  via the generic `ToolDefinition.searchItems()` mechanism below - no extra
  work needed per guide.

## Deep-linkable, globally searchable sub-items (`searchItems()`)

Any tool can optionally implement `searchItems(): ToolSearchItem[]`
(see `src/types/tool.ts`) to contribute individually searchable,
deep-linkable sub-items - e.g. Playbooks does this so each guide (not just
the "Playbooks" tool as a whole) shows up as its own result when you search
"pktmon" or "sysmon" in the header search box.

- Global search (`searchAll()` in `src/app/registry.ts`) matches a tool's
  `searchItems()` first; if any match, those are shown as distinct result
  cards instead of the parent tool card.
- Each result card links to `#/tool/<toolId>/<itemId>`. The router parses
  the extra segment and passes it to the tool as `mount(container, { itemId })`.
- A tool that implements `searchItems()` should check `context?.itemId` in
  `mount()` and open/scroll to the matching item (see Playbooks'
  `data-guide-id` + `scrollIntoView` for the pattern).
- This is entirely optional - tools without `searchItems()` just keep
  matching as a whole tool, exactly as before.

## Conventions established in this project

- **Living off the land (LotL).** Any script/command a tool generates for
  the user to run must use only tools already built into Windows —
  PowerShell (built-in cmdlets/modules), `cmd`, WMI/CIM, the registry, etc.
  Don't generate commands that assume a third-party tool, module, or
  executable is installed (e.g. `Install-Module`, RSAT-only cmdlets, a
  random GitHub script). The only acceptable exceptions are well-known,
  Microsoft-adjacent, commonly-already-present admin tools called out
  explicitly in that tool's own hint/comment (e.g. CMTrace for reading
  ConfigMgr/MDM logs) — never assume silently that something extra is
  installed.
- **No network calls from tools.** A tool that needs to fetch from the
  internet (e.g. an earlier "Windows Version Info" tool hitting
  `learn.microsoft.com`) will get CORS-blocked in real browser usage and was
  removed for exactly that reason. Assume **no backend, no proxy** — tools
  must work from static data bundled in the repo or from user-pasted input.
  **One deliberate, narrow exception**: Stay Awake's `{{websocketdata}}` variable lets
  the browser open a WebSocket directly to a URL the *user types in*, purely
  client-side (no IPK backend/proxy involved) — the user opts in explicitly
  per connection, so this isn't IPK silently phoning home. Don't use this as
  precedent for adding other network calls without the same explicit,
  user-entered-URL opt-in.
- **PowerShell "run here, paste there" tools**: when a tool needs data from a
  live Windows device/registry, give the user a short PowerShell one-liner
  that:
  1. Reads only what's needed (don't over-fetch; prefer `-like` wildcard
     filters over `Where-Object` pipelines to keep it short).
  2. Pipes through `Set-Clipboard -PassThru` so the command **both copies the
     output to the clipboard and displays it back in the console** in one
     step — this is the established UX pattern (see `esp-parser`,
     `autopilot-profile`, `autopilot-hash`, `device-gid`, `comgmt-workloads`,
     `dhcp-options`). If the pipeline emits multiple objects that need to
     render as one clipboard-friendly block (e.g. multi-line output), pipe
     through `Out-String` first: `... | Out-String | Set-Clipboard -PassThru`.
  3. Keep the actual parsing/decoding logic in TypeScript, not PowerShell —
     PowerShell should just dump raw data; all interpretation (timestamp
     resolution, bitmask decoding, JSON reshaping, etc.) belongs in the
     tool's `parse.ts` where it's testable and easy to iterate on.
- **Real-world registry quirks over naive docs**: e.g. ESP registry value
  names aren't always literal — they can have a timestamp suffix (e.g.
  `AccountSetupCategory.Status.2026-10-05T13:19:26.888Z`), and there can be
  more than one. Resolve "latest" by prefix-matching + lexicographic sort
  (ISO-8601 sorts correctly as strings) rather than assuming exact key names.
  Prefer this kind of defensive parsing over trusting a single documented
  shape.
- **Bitmask/`[Flags]` enum decoding**: when a tool decodes a C#/PowerShell
  `[Flags]` enum (e.g. `CloudAssignedOobeConfig`, ConfigMgr co-management
  workloads), list flags ascending by value, and compute `isEnabled` as
  `(value & flag.value) === flag.value` (matches .NET's `Enum.HasFlag`
  semantics) — don't assume single-bit-only values.
- **Don't guess undocumented Microsoft enum values.** If a mapping isn't
  confirmed by official docs or solid community consensus, either omit it
  (show the raw value) or clearly mark it as best-effort in a code comment.
- **Input persistence is handled centrally and generically.**
  `src/app/state-persistence.ts` auto-saves every editable
  input/textarea/select under the mounted tool's container to
  `sessionStorage` (keyed by tool id) and replays it (with a synthetic
  `input`/`change` event) next time that tool mounts. Wired once in
  `layout.ts` — **do not** add per-tool localStorage/sessionStorage code;
  if a field shouldn't persist, mark it `readonly` (computed/output fields
  are already excluded) rather than opting out in the tool itself.
  Session storage (not local storage) is deliberate: some tool input is
  sensitive (hardware hashes, registry dumps) and shouldn't persist past the
  browser tab's lifetime.
- **Reference tool (`src/tools/reference/data.ts`)** is a living, hand-curated
  cheat sheet (keyboard shortcuts + commands). It intentionally favors
  lesser-known shortcuts over ubiquitous ones (e.g. `Win+R`/`Win+L` were
  removed as "too well known"); when adding entries, match that bar.

## Testing / verification

- There's no test framework. Verify:
  - **Build**: `npm run build` (runs `tsc --noEmit && vite build`) — must be
    clean (no type errors) before considering a change done.
  - **Logic-only changes**: write a small throwaway `.ts` file, run it with
    `npx tsx <file>.ts`, then delete it — faster than round-tripping through
    the browser for pure parsing/decoding logic.
  - **UI changes**: the dev server (`npm run dev`) runs on port 5173; use the
    browser preview to click through and confirm rendering, especially for
    anything involving pasted/real-world data shapes.
- This repo runs inside a devcontainer; commands are typically executed via
  the containerized shell, not the host directly.

## Releasing

Versioning and the changelog are automated with
[release-it](https://github.com/release-it/release-it) +
`@release-it/conventional-changelog`, configured in `.release-it.json`.

- **Commit using [Conventional Commits](https://www.conventionalcommits.org/)**
  (`feat: ...`, `fix: ...`, `chore: ...`, `docs: ...`, etc.) - the changelog
  and the version bump (major/minor/patch) are both derived from these commit
  messages, so unconventional messages won't show up in `CHANGELOG.md` and
  won't influence the bump.
- **Brand-new tool squash-merge commits** use a special `feat:` subject so
  they stand out in the changelog while still grouping under "✨ Features":
  `feat: 🎉 New Tool: <tool icon> <Tool Name>` (e.g.
  `feat: 🎉 New Tool: 🏷️ MAC Address Converter`). Use the same icon the tool
  defines in its `index.ts`. Regular (non-new-tool) commits keep the plain
  `feat: <description>` / `fix: <description>` style.
- **Cut a release**: `npm run release` (interactive - prompts for the next
  version based on your commits since the last tag, then updates
  `package.json`'s version, prepends to `CHANGELOG.md`, and creates a git
  commit + tag). Preview without changing anything: `npm run release:dry`.
- **Requires a clean git working tree** on the `main` branch (see
  `requireCleanWorkingDir`/`requireBranch` in `.release-it.json`) - commit or
  stash first.
- `npm.publish` and `github.release` are both disabled in `.release-it.json`
  (this isn't an npm package, and no `GITHUB_TOKEN`/repo is wired up yet) -
  release-it only bumps the version, updates the changelog, and tags.
- The running version and a link to the GitHub repo are shown in-app on the
  **About** page (`src/tools/about/`, a `hidden: true` tool linked from a
  pinned link at the bottom of the sidebar — see `renderSidebarFooter()` in
  `src/app/layout.ts` — instead of the home grid), which reads the
  version/repo from `package.json` via `__APP_VERSION__`/`__APP_REPO_URL__`
  (injected by `vite.config.ts`'s `define`, typed in `src/vite-env.d.ts`) and
  renders `CHANGELOG.md` (imported with `?raw`) through
  `src/tools/about/changelog.ts`.
- Once the repo exists on GitHub, update `package.json`'s `repository.url`
  (currently a `TODO` placeholder) so the About page's repo link works.

## Theming

- All colors are CSS custom properties in `src/styles/variables.css`
  (`--bg`, `--text`, `--accent`, `--success`, `--danger`, …), redefined under
  `[data-theme="dark"]`. **Never hard-code colors in a tool's CSS** — use the
  variables so both themes stay correct automatically. Theme is managed via
  `src/app/theme.ts`: it defaults to following the OS preference ("system")
  until the user clicks the header toggle, which flips between light/dark
  directly (the toggle only ever shows the resolved ☀️/🌙 icon — there's no
  separate "System" option to pick in the UI).

## Design guidelines

These apply to every new tool so the site stays visually consistent as it
grows — see `src/tools/stay-awake` or `src/tools/reference` for examples.

- **Tools use the full width of the content area.** Do not put a `max-width`
  on your tool's root element (e.g. `.xyz-tool`) — let it fill
  `.ipk-tool-body`. If a specific inner element genuinely needs a narrower
  measure for readability (e.g. a long paragraph of prose), constrain that
  element directly instead of the whole tool.
- **Wide tables scroll horizontally, not the page.** If a table can have many
  columns or long unbreakable cells (`white-space: nowrap` badges/commands),
  wrap it in `<div class="ipk-table-scroll">…</div>` (defined in
  `components.css`) so it scrolls internally instead of pushing the whole
  page wider than the viewport.
- **The tool header shows the description as a tooltip, not inline text.**
  `layout.ts` already renders `<h1 title="...">` with the tool's
  `description` for every tool — you don't need to (and shouldn't) repeat the
  description as a visible `<p>` under your own tool's heading; it would
  just duplicate what's already on hover and cost vertical space.
- **The sidebar collapses manually (desktop) and automatically (narrow
  viewports) via `components.css`'s `body.ipk-sidebar-collapsed` /
  `body.ipk-sidebar-open` classes** — tools don't need to do anything for
  this, it's handled centrally in `layout.ts`.
- **Short usage notes/tips use the shared `.ipk-hint` class** (defined in
  `components.css`) instead of a bespoke per-tool note style — it renders an
  accent-tinted callout box with a leading 💡 icon so it reads as a hint
  rather than blending in with plain card-like content. Add `ipk-hint`
  alongside your tool-specific class (e.g. `<p class="xyz-note ipk-hint">`)
  if you still need a tool-specific class for child-selector rules (links,
  `<code>`, layout); otherwise `ipk-hint` alone is enough. Don't repeat the
  box's `background`/`border`/`padding`/`border-radius` in your own CSS.
- **Any generated PowerShell or cmd.exe command gets the standard shell-tab
  decoration**, unless a tool has an explicit reason not to: wrap the code
  block in `.ipk-ps-command` > `.ipk-ps-tabs` (`role="tablist"`,
  `aria-label="Command shell"`) containing one `.ipk-ps-tab.is-active` button
  per shell variant (e.g. a single static "Command Prompt" tab for a cmd-only
  command, or the PS7+/PS5.1 pair via `psCommandTabsHtml()`/
  `wirePsCommandTabs()` from `@/app/ps-command` when a command differs
  between PowerShell versions), with an `.ipk-ps-admin-badge` added to the
  tab only when the command needs elevation. The code block + copy button
  then go in `.ipk-copy-wrap.ipk-copy-wrap-tabbed` below the tab bar. See
  `src/tools/registry-preview/index.ts` and `src/tools/cmd-findstr-search/index.ts`
  (single static tab, no admin badge) or `src/tools/playbooks/index.ts`
  (single tab, conditional admin badge) for the hand-rolled pattern, and any
  tool using `psCommandTabsHtml()` for the two-tab PS7/PS5.1 switcher. CSS
  lives in `src/styles/components.css` (`.ipk-ps-command` and friends).
- **"Paste something generated on a device" tools follow one stepped
  pattern** — see `src/tools/autopilot-hash` as the reference implementation
  and copy its structure for any new tool shaped like it:
  - **Step 1** is a bold `<p class="xyz-step-label">1. Get the &lt;thing&gt;
    …</p>`, phrased as "Get the \<thing\>" (not "Run this on the device"),
    followed by the generated command (see the PowerShell/cmd.exe bullet
    above). If the command only copies to clipboard and nothing more exotic,
    say so with the shared `.ipk-step-note` class for a de-emphasized
    trailing note: `` Get the hardware hash <span class="ipk-step-note">(copies
    to clipboard)</span> ``. Don't repeat the output format (e.g. "as JSON",
    "as hex") in that note — keep it just "(copies to clipboard)" unless a
    step genuinely needs an extra instruction (e.g. dhcp-options' "pick the
    NIC you care about from the output"). Don't mention an OS/device type
    (e.g. "on a Windows device") in step 1 — that's implied by the
    PowerShell/cmd.exe command itself.
  - **Step 2** is always exactly `<p class="xyz-step-label">2. Paste anywhere
    on the page</p>` — the input field's own label (see next bullet) carries
    the "what goes here" explanation, so step 2 never needs to restate it.
  - **The field label above the input** is a separate, plain (non-bold)
    `<label class="xyz-field-label" for="xyz-input">…</label>` describing
    what the field expects (e.g. "Base64 hardware hash
    (DeviceHardwareData)"). Give it `margin: 0 0 calc(var(--space-1) -
    var(--space-N))` where `--space-N` matches your tool's root container's
    flex `gap`, so the visible label-to-input gap ends up a consistent
    `--space-1` (4px) everywhere — don't just use `margin-top`. If the same
    class name is also used in a different nested context with a different
    parent `gap` (e.g. inside a result card), give that context its own
    class/override instead of changing the shared one.
  - **Wire global paste** with `wireGlobalPaste(input)` from
    `@/app/global-paste` on the primary input so `Ctrl+V` works anywhere on
    the page, not just when that field has focus (call its returned cleanup
    function from your `mount()`'s unmount callback).
  - **Error/status messages use the plain `.xyz-error` style**: `color:
    var(--danger); font-size: 0.85rem;` on a `<span>`/`<p>`/`<div
    role="alert">` — no `min-height` reservation, no `var(--danger,
    #fallback)` color fallback (the `--danger` variable is always defined).
    Keep a dedicated error element distinct from any soft/partial warning
    (e.g. "N lines were skipped"), which may use `--warning` instead since
    it's a different, non-fatal severity.
