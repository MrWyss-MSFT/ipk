/**
 * Curated IT Pro reference data, grouped by kind. Add new entries to the
 * relevant array here — the UI picks them up automatically, no other
 * changes needed.
 */

export interface CommandEntry {
  /** The literal text to type into Run / cmd.exe, or a PowerShell command when `powershellOnly` is set. */
  command: string;
  /** Short, plain-language explanation of what it does. */
  description: string;
  /** Free-form labels, e.g. ["ConfigMgr"], ["MMC", "Windows"]. */
  tags?: string[];
  /** Set to true if the command only works from the Run dialog (e.g. relies on an App Paths registry entry), not from cmd.exe's PATH search. */
  runOnly?: boolean;
  /** Set to true for a PowerShell-only command (shown with a PowerShell badge instead of Run/cmd). */
  powershellOnly?: boolean;
  /** Set to true for a cmd.exe-internal command (e.g. doskey, dir) that the Run dialog can't launch directly. */
  cmdOnly?: boolean;
}

export const COMMANDS: CommandEntry[] = [
  {
    command: "ccm/cmtrace",
    description: "Opens CMTrace, the ConfigMgr/MECM log viewer.",
    tags: ["ConfigMgr", "Log"],
    runOnly: true,
  },
  {
    command: "control smscfgrc",
    description: "Opens the Configuration Manager control panel applet (client properties).",
    tags: ["ConfigMgr", "Control Panel"],
  },
  {
    command: "lusrmgr.msc",
    description: "Opens Local Users and Groups.",
    tags: ["MMC", "Windows"],
  },
  {
    command: "shutdown /r /fw /f /t 0",
    description: "Restarts the PC straight into UEFI/BIOS firmware settings.",
    tags: ["Windows", "Power"],
  },
  {
    command: "perfmon /rel",
    description: "Opens Reliability Monitor directly.",
    tags: ["Windows", "Diagnostics"],
  },
  {
    command: "osk",
    description: "Opens the On-Screen Keyboard.",
    tags: ["Windows", "Accessibility"],
  },
  {
    command:
      'Get-CimInstance -Namespace root/CIMV2/mdm/dmmap `\n  -ClassName "MDM_EnterpriseModernAppManagement_AppManagement01" |\n  Invoke-CimMethod -MethodName UpdateScanMethod',
    description: "Triggers Microsoft Store to scan for updates and install updates.",
    tags: ["Microsoft Store", "PowerShell", "MDM"],
    powershellOnly: true,
  },
  {
    command:
      'Get-NetUDPEndpoint |\n  Select-Object LocalAddress, LocalPort, CreationTime, OwningProcess,\n    @{Name="Process"; Expression={(Get-Process -Id $_.OwningProcess).ProcessName}} |\n  Format-Table -AutoSize',
    description: "Lists UDP listening endpoints with the owning process name.",
    tags: ["PowerShell", "Network"],
    powershellOnly: true,
  },
  {
    command:
      'Get-NetTCPConnection |\n  Select-Object LocalAddress, LocalPort, RemoteAddress, RemotePort, State, CreationTime, OwningProcess,\n    @{Name="Process"; Expression={(Get-Process -Id $_.OwningProcess).ProcessName}} |\n  Format-Table -AutoSize',
    description: "Lists TCP connections with state and the owning process name.",
    tags: ["PowerShell", "Network"],
    powershellOnly: true,
  },
  {
    command:
      'Get-DeliveryOptimizationStatus |\n  Select-Object PredefinedCallerApplication, FileId,\n    @{Name = "FileSizeInMiB"; Expression = { [math]::round($_.FileSize / 1MB, 2) } },\n    @{Name = "FileSizeInGiB"; Expression = { [math]::round($_.FileSize / 1GB, 2) } },\n    @{Name = "MiBFromPeers"; Expression = { [math]::round($_.BytesFromPeers / 1MB, 2) } },\n    @{Name = "MiBFromHttp"; Expression = { [math]::round($_.BytesFromHttp / 1MB, 2) } },\n    Status, FileSizeInCache, TotalBytesDownloaded, PercentPeerCaching, Priority, `\n    BytesFromCacheServer, BytesFromLanPeers, BytesFromLinkLocalPeers, BytesFromGroupPeers, BytesFromInternetPeers,\n    BytesToLanPeers, BytesToLinkLocalPeers, BytesToGroupPeers, BytesToInternetPeers, DownloadDuration,\n    HttpConnectionCount, CacheServerConnectionCount, LanConnectionCount, LinkLocalConnectionCount,\n    GroupConnectionCount, InternetConnectionCount, DownloadMode, SourceURL, CacheHost,\n    NumPeers, ExpireOn, IsPinned |\n  Out-GridView',
    description:
      "Shows Delivery Optimization transfer status per file (size, source, peer vs. HTTP bytes, connections) in a sortable grid view.",
    tags: ["PowerShell", "Delivery Optimization", "Windows Update"],
    powershellOnly: true,
  },
  {
    command: '"%ProgramFiles%\\Windows Defender\\MpCmdRun.exe" -removedefinitions -all',
    description: "Removes all Windows Defender definition updates, reverting to the platform's baseline definitions.",
    tags: ["Windows Defender", "Security", "Troubleshooting"],
  },
  {
    command: "doskey /HISTORY",
    description: "Shows the last entered commands in the current cmd.exe session.",
    tags: ["cmd", "Windows"],
    cmdOnly: true,
  },
  {
    command: "Export-WindowsDriver -Online -Destination D:\\drivers",
    description: "Exports all third-party drivers currently installed on the running system to the destination folder.",
    tags: ["PowerShell", "Drivers", "Windows"],
    powershellOnly: true,
  },
];

export interface ShortcutEntry {
  /** Key combo, e.g. "Win + R". Rendered as individual kbd chips split on "+". */
  keys: string;
  /** Short, plain-language explanation of what it does. */
  description: string;
  /** Free-form labels, e.g. ["Global"], ["Run dialog"]. */
  tags?: string[];
}

export const SHORTCUTS: ShortcutEntry[] = [
  {
    keys: "Ctrl + Enter",
    description: "In the Run dialog, launches the command elevated (as Administrator).",
    tags: ["Run dialog"],
  },
  {
    keys: "Ctrl + Shift + Esc",
    description: "Opens Task Manager directly.",
    tags: ["Global"],
  },
  {
    keys: "Win + Shift + S",
    description: "Opens the snipping/screenshot tool.",
    tags: ["Global"],
  },
  {
    keys: "Win + X",
    description: "Opens the Quick Link / Power User menu (Device Manager, Disk Management, etc.).",
    tags: ["Global"],
  },
  {
    keys: "Win + Ctrl + Shift + B",
    description: "Wakes up the device when the screen is blank or black (resets the graphics driver).",
    tags: ["Global", "Troubleshooting"],
  },
  {
    keys: "Ctrl + Shift + V",
    description: "Pastes clipboard content as plain text, stripping formatting.",
    tags: ["Global"],
  },
  {
    keys: "Win + H",
    description: "Opens voice dictation.",
    tags: ["Global"],
  },
  {
    keys: "Win + Ctrl + Q",
    description: "Opens Quick Assist.",
    tags: ["Global"],
  },
  {
    keys: "Win + Shift + R",
    description: "Selects a region of the screen to record a video.",
    tags: ["Global"],
  },
  {
    keys: "Alt + D",
    description: "Selects the address bar (browser address bar or File Explorer path bar).",
    tags: ["Global", "File Explorer"],
  },
  {
    keys: "Alt + .",
    description:
      "In PowerShell (PSReadLine), yanks the last argument of the previous command. E.g. after \"ping test\", pressing it inserts \"test\".",
    tags: ["PowerShell"],
  },
];

export interface FolderPathEntry {
  /** The literal folder path, environment variables welcome. */
  path: string;
  /** Short, plain-language explanation of what lives there. */
  description: string;
  /** Free-form labels, e.g. ["Log", "Intune"], ["Windows", "Windows Update"]. */
  tags?: string[];
}

export const FOLDER_PATHS: FolderPathEntry[] = [
  {
    path: "%WinDir%\\CCM\\Logs",
    description: "ConfigMgr/MECM client log files.",
    tags: ["Log", "ConfigMgr"],
  },
  {
    path: "%ProgramData%\\Microsoft\\IntuneManagementExtension\\Logs",
    description: "Intune Management Extension log files (Win32 apps, scripts, remediations).",
    tags: ["Log", "Intune"],
  },
  {
    path: "%WinDir%\\Logs\\MoSetup",
    description: "Windows Setup/upgrade logs.",
    tags: ["Log", "Windows", "Windows Update"],
  },
  {
    path: "%WinDir%\\SoftwareDistribution\\Download",
    description: "Staged Windows Update download payloads.",
    tags: ["Windows", "Windows Update"],
  },
  {
    path: "%ProgramData%\\Microsoft\\Windows\\AppRepository",
    description: "App package repository state used by the Microsoft Store/AppX stack.",
    tags: ["Windows"],
  },
  {
    path: "%LocalAppData%\\Packages",
    description: "Per-user UWP/MSIX app data and local state.",
    tags: ["Windows"],
  },
];

export interface RegistryPathEntry {
  /** The literal registry key path. May contain the literal placeholder `{EnrollmentID}`,
   * substituted at script-generation time with a runtime `reg query` lookup of the device's
   * Intune enrollment GUID. */
  path: string;
  /** Display name (emoji welcome), also used as the Registry Editor "Favorite" name
   * when this path is added to the Favorites script. */
  name: string;
  /** Short, plain-language explanation of what it's used for. */
  description: string;
  /** Free-form labels, e.g. ["Intune"], ["Autopilot"]. */
  tags?: string[];
  /** Pre-checked by default in the Registry Favorites script generator. */
  defaultFavorite?: boolean;
}

export const REGISTRY_PATHS: RegistryPathEntry[] = [
  {
    path: "HKLM\\SOFTWARE\\Microsoft\\Enrollments",
    name: "🔑 MDM Enrollments",
    description: "Per-device MDM enrollment records, keyed by EnrollmentID GUID.",
    tags: ["Intune"],
  },
  {
    path: "HKLM\\SOFTWARE\\Microsoft\\PolicyManager\\current\\device",
    name: "📃 Policy Manager",
    description: "Current effective MDM/CSP policy values applied to the device.",
    tags: ["Intune"],
    defaultFavorite: true,
  },
  {
    path: "HKLM\\SOFTWARE\\Microsoft\\Enrollments\\{EnrollmentID}\\FirstSync",
    name: "⚙️ ESP Settings",
    description: "Enrollment Status Page (ESP) settings for the device's current enrollment.",
    tags: ["Intune", "Autopilot", "ESP"],
    defaultFavorite: true,
  },
  {
    path: "HKLM\\SOFTWARE\\Microsoft\\Provisioning\\AutopilotSettings",
    name: "⚙️ Autopilot Settings",
    description: "Windows Autopilot profile/settings cache.",
    tags: ["Autopilot"],
    defaultFavorite: true,
  },
  {
    path: "HKLM\\SOFTWARE\\Microsoft\\Provisioning\\AutopilotPolicyCache",
    name: "🩺 Autopilot Policy Cache",
    description: "Cached Autopilot policy payload applied during provisioning.",
    tags: ["Autopilot"],
    defaultFavorite: true,
  },
  {
    path: "HKLM\\SOFTWARE\\Microsoft\\Windows\\Autopilot\\EnrollmentStatusTracking\\ESPTrackingInfo\\Diagnostics",
    name: "✅ ESP Tracking Info",
    description: "Per-phase ESP tracking/diagnostic info (account setup, device setup).",
    tags: ["Autopilot", "ESP"],
    defaultFavorite: true,
  },
  {
    path: "HKLM\\SOFTWARE\\Microsoft\\IntuneManagementExtension\\Win32Apps",
    name: "🪟 IME Win32Apps",
    description: "Win32 app install state tracked by the Intune Management Extension.",
    tags: ["Intune"],
    defaultFavorite: true,
  },
  {
    path: "HKLM\\SOFTWARE\\Microsoft\\Provisioning\\Diagnostics\\AutoPilot",
    name: "🩺 AutoPilot Diagnostic Settings",
    description: "Autopilot diagnostic settings written by the provisioning stack.",
    tags: ["Autopilot"],
    defaultFavorite: true,
  },
  {
    path: "HKLM\\SOFTWARE\\Microsoft\\Provisioning\\SyncML\\RebootRequiredURIs",
    name: "🔍 RebootRequiredURIs",
    description: "CSPs that are pending and require a reboot to apply.",
    tags: ["Intune"],
    defaultFavorite: true,
  },
  {
    path: "HKLM\\SOFTWARE\\Microsoft\\MDMWins",
    name: "🏆 MDMWins (Hybrid Join only)",
    description: "If MDMWinsOverGP is enabled, shows which GPOs are overridden by MDM.",
    tags: ["Intune", "Group Policy"],
    defaultFavorite: true,
  },
  {
    path: "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Applets\\Regedit\\Favorites",
    name: "⭐ Regedit Favorites",
    description: "Registry Editor's saved Favorites list for the current user.",
    tags: ["Windows"],
  },
  {
    path: "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run",
    name: "🚀 Run (Startup Programs)",
    description: "Per-machine programs that auto-start at sign-in.",
    tags: ["Windows"],
  },
];

export interface WmiEntry {
  /** Namespace, e.g. "root\\cimv2". */
  namespace: string;
  /** Class name, e.g. "Win32_OperatingSystem". */
  className: string;
  /** Short, plain-language explanation of what it's used for. */
  description: string;
  /** Free-form labels, e.g. ["ConfigMgr"], ["Windows"]. */
  tags?: string[];
}

export const WMI_CLASSES: WmiEntry[] = [
  {
    namespace: "root\\cimv2",
    className: "Win32_OperatingSystem",
    description: "OS version, build, install date, and related details.",
    tags: ["Windows"],
  },
  {
    namespace: "root\\cimv2",
    className: "Win32_ComputerSystem",
    description: "Manufacturer, model, domain/workgroup, and system details.",
    tags: ["Windows"],
  },
  {
    namespace: "root\\ccm",
    className: "SMS_Client",
    description: "ConfigMgr client version and basic client actions (TriggerSchedule, etc.).",
    tags: ["ConfigMgr"],
  },
  {
    namespace: "root\\ccm\\InvAgt",
    className: "CCM_System",
    description: "Co-management state, including the ComgmtWorkloads bitmask.",
    tags: ["ConfigMgr"],
  },
  {
    namespace: "root\\cimv2\\mdm\\dmmap",
    className: "MDM_DevDetail_Ext01",
    description: "Exposes DeviceHardwareData, the Autopilot 4K hardware hash.",
    tags: ["Autopilot"],
  },
  {
    namespace: "root\\ccm\\ClientSDK",
    className: "CCM_Application",
    description: "Installed/available ConfigMgr applications and their deployment state.",
    tags: ["ConfigMgr"],
  },
];

export interface DeeplinkEntry {
  /** The literal URI, e.g. "ms-settings:windowsupdate-history". */
  uri: string;
  /** Short, plain-language explanation of what it opens. */
  description: string;
  /** Free-form labels, e.g. ["Settings"], ["Windows Update"]. */
  tags?: string[];
}

export const DEEPLINKS: DeeplinkEntry[] = [
  {
    uri: "ms-settings:workplace",
    description: "Opens Access work or school (MDM/Entra ID join & enrollment status).",
    tags: ["Settings", "Intune", "Entra ID"],
  },
  {
    uri: "ms-settings:network-advancedsettings",
    description: "Opens advanced network settings / adapter list.",
    tags: ["Settings", "Network"],
  },
  {
    uri: "ms-settings:network-proxy",
    description: "Opens proxy settings.",
    tags: ["Settings", "Network"],
  },
  {
    uri: "ms-settings:windowsupdate-history",
    description: "Opens Windows Update history.",
    tags: ["Settings", "Windows Update"],
  },
  {
    uri: "ms-settings:windowsupdate-action",
    description: "Opens Windows Update and checks for updates.",
    tags: ["Settings", "Windows Update"],
  },
  {
    uri: "ms-settings:windowsdefender",
    description: "Opens the Windows Security dashboard.",
    tags: ["Settings", "Security"],
  },
  {
    uri: "ms-settings:privacy",
    description: "Opens the Privacy settings overview.",
    tags: ["Settings", "Privacy"],
  },
  {
    uri: "ms-settings:developers",
    description: "Opens For developers settings (Developer Mode, sideloading).",
    tags: ["Settings", "Windows"],
  },
  {
    uri: "ms-settings:recovery",
    description: "Opens Recovery options (reset/reinstall this PC).",
    tags: ["Settings", "Windows"],
  },
  {
    uri: "ms-settings:about",
    description: "Opens the About page (OS build, device specs, rename PC).",
    tags: ["Settings", "Windows"],
  },
  {
    uri: "ms-settings:troubleshoot",
    description: "Opens Troubleshoot settings.",
    tags: ["Settings", "Windows"],
  },
];
