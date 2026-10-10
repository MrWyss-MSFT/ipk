/**
 * Pure logic for building a Windows Sandbox `.wsb` configuration file.
 * Schema reference:
 * https://learn.microsoft.com/windows/security/application-security/application-isolation/windows-sandbox/windows-sandbox-configure-using-wsb-file
 */

export type TriState = "Default" | "Enable" | "Disable";

export interface MappedFolderConfig {
  hostFolder: string;
  sandboxFolder?: string;
  readOnly?: boolean;
}

export interface WsbConfig {
  vGPU: TriState;
  networking: TriState;
  audioInput: TriState;
  videoInput: TriState;
  protectedClient: TriState;
  printerRedirection: TriState;
  clipboardRedirection: TriState;
  memoryInMB?: number;
  mappedFolders: MappedFolderConfig[];
  logonCommand: string;
}

export const DEFAULT_WSB_CONFIG: WsbConfig = {
  vGPU: "Default",
  networking: "Default",
  audioInput: "Default",
  videoInput: "Default",
  protectedClient: "Default",
  printerRedirection: "Default",
  clipboardRedirection: "Default",
  memoryInMB: undefined,
  mappedFolders: [],
  logonCommand: "",
};

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Parses the mapped-folders textarea, one folder per line:
 * `HostFolder`, `HostFolder => SandboxFolder`, or `HostFolder => SandboxFolder (readonly)`.
 * Blank lines and lines without a host folder are skipped.
 */
export function parseMappedFoldersText(text: string): MappedFolderConfig[] {
  const folders: MappedFolderConfig[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const [hostPart, ...rest] = line.split("=>");
    const hostFolder = hostPart.trim();
    if (!hostFolder) continue;

    let sandboxPart = rest.join("=>").trim();
    let readOnly = false;
    const readOnlyMatch = sandboxPart.match(/\(\s*(readonly|ro)\s*\)\s*$/i);
    if (readOnlyMatch) {
      readOnly = true;
      sandboxPart = sandboxPart.slice(0, readOnlyMatch.index).trim();
    }

    folders.push({
      hostFolder,
      sandboxFolder: sandboxPart || undefined,
      readOnly: readOnly || undefined,
    });
  }
  return folders;
}

/** Renders mapped folders back into the one-line-per-folder textarea format `parseMappedFoldersText` understands. */
export function formatMappedFoldersText(folders: MappedFolderConfig[]): string {
  return folders
    .map((f) => {
      let line = f.hostFolder;
      if (f.sandboxFolder) line += ` => ${f.sandboxFolder}`;
      if (f.readOnly) line += f.sandboxFolder ? " (readonly)" : " => (readonly)";
      return line;
    })
    .join("\n");
}

function indentLines(xml: string, spaces: number): string {
  const pad = " ".repeat(spaces);
  return xml
    .split("\n")
    .map((line) => pad + line)
    .join("\n");
}

/** Builds the `<Configuration>` XML for a `.wsb` file. Tri-state settings left at "Default" are omitted (Sandbox already defaults to them). */
export function buildWsbXml(config: WsbConfig): string {
  const lines: string[] = [];

  const addTriState = (tag: string, value: TriState) => {
    if (value === "Default") return;
    lines.push(`  <${tag}>${value}</${tag}>`);
  };

  addTriState("vGPU", config.vGPU);
  addTriState("Networking", config.networking);

  if (config.mappedFolders.length > 0) {
    const folderBlocks = config.mappedFolders
      .map((f) => {
        const parts = [`<HostFolder>${escapeXml(f.hostFolder)}</HostFolder>`];
        if (f.sandboxFolder) parts.push(`<SandboxFolder>${escapeXml(f.sandboxFolder)}</SandboxFolder>`);
        if (f.readOnly) parts.push(`<ReadOnly>true</ReadOnly>`);
        return `<MappedFolder>\n${indentLines(parts.join("\n"), 2)}\n</MappedFolder>`;
      })
      .join("\n");
    lines.push(`  <MappedFolders>`, indentLines(folderBlocks, 4), `  </MappedFolders>`);
  }

  const logonCommand = config.logonCommand.trim();
  if (logonCommand) {
    lines.push(`  <LogonCommand>`, `    <Command>${escapeXml(logonCommand)}</Command>`, `  </LogonCommand>`);
  }

  addTriState("AudioInput", config.audioInput);
  addTriState("VideoInput", config.videoInput);
  addTriState("ProtectedClient", config.protectedClient);
  addTriState("PrinterRedirection", config.printerRedirection);
  addTriState("ClipboardRedirection", config.clipboardRedirection);

  if (config.memoryInMB && config.memoryInMB > 0) {
    lines.push(`  <MemoryInMB>${Math.round(config.memoryInMB)}</MemoryInMB>`);
  }

  return `<Configuration>\n${lines.join("\n")}\n</Configuration>`;
}
