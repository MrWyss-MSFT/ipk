---
title: Monitor Registry Changes with Sysmon
summary: Watch a specific registry key for changes and review the events in Event Viewer.
tags: Sysmon, Registry, Troubleshooting
---

1. Enable the built-in Sysmon optional feature.

```powershell
Enable-WindowsOptionalFeature -Online -FeatureName Sysmon
```

2. Create a config that silences the noisy defaults and watches your key (and its subkeys/values):

```xml
<Sysmon schemaversion="4.91">
  <EventFiltering>
    <!-- Silence the normally-enabled, noisy defaults -->
    <ProcessCreate onmatch="include" />
    <ProcessTerminate onmatch="include" />

    <!-- Monitor this key and everything under it -->
    <RegistryEvent onmatch="include">
      <TargetObject condition="begin with">HKLM\SOFTWARE\MyKey</TargetObject>
    </RegistryEvent>
  </EventFiltering>
</Sysmon>
```

3. Load the config:

```cmd
sysmon -i path\to\file.xml
```

4. Check the event log (12/13 = key/value created or deleted, 14 = renamed):

```powershell
Get-WinEvent -FilterHashtable @{
    LogName = 'Microsoft-Windows-Sysmon/Operational'
    Id      = 12, 13, 14
} -MaxEvents 20 | Format-List TimeCreated, Id, Message
```
