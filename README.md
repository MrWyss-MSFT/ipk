# ItProKit (IPK)

**Fast, static, client-side tools for IT Pros managing Microsoft-managed endpoints — Intune, Autopilot, Entra ID, ConfigMgr, and Windows. No installs, no backend, nothing ever leaves your browser.**

![ItProKit dashboard screenshot](docs/screenshot.png)

## Why

Think [IT Tools](https://it-tools.tech/), but focused on day-to-day endpoint
management tasks: decoding hardware hashes, parsing ESP/Autopilot JSON blobs,
converting Entra ID GUIDs to SIDs, browsing exported `.reg` files, and more.

- ⚡ **Fast** — plain Vite + Vanilla TypeScript, no framework overhead.
- 🔒 **Private by design** — everything runs in your browser; tools never
  upload pasted data anywhere.
- 🌗 **Dark & light mode** — follows your system theme or toggle manually.
- 🧩 **Trivially extensible** — adding a tool means "drop a folder", nothing
  else to wire up.
- 🐳 **Run anywhere** — use the hosted static build, run it in Docker/WSL, or
  just `npm run dev` locally.

## Usage

Open the app and either browse the sidebar/categories or use the search box
at the top to find a tool by name or keyword. Each tool is self-contained —
paste/enter your input, get the decoded/converted/generated output, and use
the copy buttons to grab results. Nothing you type is sent anywhere; most
tools persist your last input in `sessionStorage` only (cleared when you
close the tab).

## Tools

| Tool | Category | What it does |
| --- | --- | --- |
| Autopilot Hardware Hash Decoder | Converters | Decode a Windows Autopilot "4K hardware hash" (`DeviceHardwareData`) Base64 string into readable device details. |
| Autopilot Profile Parser | Converters | Parse the cached Autopilot deployment profile (`PolicyJsonCache`) into a readable summary, including a decoded `CloudAssignedOobeConfig` bitmask. |
| Base64 Encode / Decode | Converters | Encode text to Base64 or decode a Base64 string back to text. |
| Co-Management Workloads Decoder | Converters | Decode a ConfigMgr `CCM_System.ComgmtWorkloads` bitmask into individual Co-Management workload switches. |
| DHCP Options Decoder | Converters | Decode the raw `DhcpInterfaceOptions` registry value into human-readable option names and values. |
| Entra ID ObjectID ↔ SID | Converters | Convert an Entra ID (Azure AD) object GUID to its Windows SID form, and back. |
| ESP Progress Parser | Converters | Parse Enrollment Status Page (ESP) per-phase step status from an exported registry JSON blob. |
| GDID ↔ LID | Converters | Convert the Entra ID device `g:` physical ID to and from its raw hex LID registry value. |
| Registry Preview | Converters | Paste/load an exported `.reg` file and browse it as a visual key tree with decoded values. |
| Find Text in Files (cmd command) | Generators | Build a `cmd.exe` one-liner that recursively searches files for a string using `for /r` + `findstr`. |
| Playbooks | Reference | Short, copy-pasteable step-by-step guides for recurring IT Pro tasks. |
| References | Reference | Cheat sheet of Run/cmd commands, keyboard shortcuts, folder paths, registry paths (+ a Registry Editor Favorites script generator), WMI classes, and `ms-settings:` deeplinks. |
| Redactor | Text | Redact emails, URLs, IPs, IBANs, credit card and phone numbers (or your own custom words) from text. |
| Stay Awake | Utilities | Keep the screen from locking/dimming with one click. Runs entirely in your browser. |

New tools land often — check the in-app sidebar for the current list.

## Running it

### Docker (recommended for self-hosting)

A tiny nginx-based image is published to GitHub Container Registry on every
release:

```bash
docker run -d --name ipk -p 8080:80 ghcr.io/mrwyss-msft/ipk:latest
```

Then open `http://localhost:8080`. Works on Linux, Windows (Docker Desktop /
WSL2), and Apple Silicon — images are published for both `linux/amd64` and
`linux/arm64`.

### Local development

Requirements: **Node.js 20+** (22 recommended).

```bash
npm install
npm run dev        # starts Vite dev server with HMR
```

```bash
npm run build       # tsc --noEmit && vite build -> dist/
npm run preview      # serve the production build locally
npm run typecheck    # tsc --noEmit only
```

## Contributing

### For humans

1. Fork/branch, make your change, and verify with `npm run build` (must be
   type-clean) before opening a PR.
2. Commit messages must follow [Conventional Commits](https://www.conventionalcommits.org/)
   (`feat:`, `fix:`, `perf:`, `revert:`, `docs:`, `chore:`, …) — they drive
   the auto-generated `CHANGELOG.md` sections (✨ Features, 🐛 Bug Fixes, …).
3. Adding a new tool is just dropping a new `src/tools/<kebab-id>/` folder —
   it's auto-discovered, no registry/router edits needed. See
   [AGENTS.md](AGENTS.md) for the exact folder contract, styling
   conventions, and established patterns (PowerShell "run here, paste
   there" tools, bitmask/`[Flags]` decoding, theming tokens, etc.).

### For AI agents

Read [AGENTS.md](AGENTS.md) first — it documents the architecture, the tool
contract, CSS/theming conventions, the "no network calls" hard requirement,
and testing/verification steps (`npm run build`, throwaway `.ts` scripts via
`npx tsx` for pure logic). Follow its conventions exactly; it's kept in sync
with how this repo actually works.

## Releases

Maintainers cut a release with `npm run release` ([release-it](https://github.com/release-it/release-it)
+ Conventional Commits), which bumps the version, regenerates
`CHANGELOG.md`, and pushes a `vX.Y.Z` tag. Publishing the GitHub Release
from that tag triggers [`docker-release.yml`](.github/workflows/docker-release.yml),
which builds and pushes the multi-arch image to GHCR.
