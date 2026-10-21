import { readdirSync, readFileSync } from "node:fs";

const toolsDirectory = new URL("./src/tools/", import.meta.url);
const toolHeadings = new Map(
  readdirSync(toolsDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const source = readFileSync(new URL(`${entry.name}/index.ts`, toolsDirectory), "utf8");
      const name = /^\s*name: "([^"]+)"/m.exec(source)?.[1];
      const icon = /^\s*icon: "([^"]+)"/m.exec(source)?.[1];
      if (!name) throw new Error(`Missing tool name in src/tools/${entry.name}/index.ts`);
      return [entry.name, [icon, name].filter(Boolean).join(" ")];
    }),
);

export default {
  "git": {
    "commitMessage": "chore: release v${version}",
    "tagName": "v${version}",
    "requireCleanWorkingDir": true,
    "requireBranch": "main"
  },
  "npm": {
    "publish": false
  },
  "github": {
    "release": false
  },
  "plugins": {
    "@release-it/conventional-changelog": {
      "preset": {
        "name": "conventionalcommits",
        "types": [
          { "type": "feat", "section": "✨ Features" },
          { "type": "feature", "section": "✨ Features" },
          { "type": "fix", "section": "🐛 Bug Fixes" },
          { "type": "perf", "section": "⚡ Performance Improvements" },
          { "type": "revert", "section": "⏪ Reverts" },
          { "type": "docs", "section": "📝 Documentation", "effect": "hidden" },
          { "type": "style", "section": "💄 Styles", "effect": "hidden" },
          { "type": "chore", "section": "🔧 Chores", "effect": "hidden" },
          { "type": "refactor", "section": "♻️ Code Refactoring", "effect": "hidden" },
          { "type": "test", "section": "✅ Tests", "effect": "hidden" },
          { "type": "build", "section": "📦 Build System", "effect": "hidden" },
          { "type": "ci", "section": "👷 Continuous Integration", "effect": "hidden" }
        ]
      },
      "infile": "CHANGELOG.md",
      "writerOpts": {
        groupBy: "scope",
        finalizeContext(context) {
          const groups = new Map();
          const sharedHeading = "App & shared components";
          for (const group of context.commitGroups) {
            const heading = toolHeadings.get(group.title) ?? sharedHeading;
            if (!groups.has(heading)) groups.set(heading, []);
            for (const commit of group.commits) {
              groups.get(heading).push({
                ...commit,
                scope: heading === sharedHeading ? commit.scope : "",
                subject: `${commit.type?.split(" ")[0] || "⚠️"} ${commit.subject || commit.header}`,
              });
            }
          }
          context.commitGroups = [...groups]
            .sort(([a], [b]) => {
              if (a === sharedHeading) return 1;
              if (b === sharedHeading) return -1;
              return a.localeCompare(b);
            })
            .map(([title, commits]) => ({ title, commits }));
          return context;
        },
      }
    }
  }
};
