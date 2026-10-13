---
title: Diagnose Microsoft Defender Performance Impact
summary: Record a Microsoft Defender Antivirus scan trace, review the top time-consuming files/scans, export the results, and check current process exclusions.
tags: Defender, MDE, Performance, Troubleshooting
---

1. 🛡️ From an elevated PowerShell, start recording a performance trace, reproduce the slow scenario (e.g. the slow app launch or scan), then press `Ctrl+C` to stop and save the trace:

```powershell
New-MpPerformanceRecording -RecordTo C:\Temp\MDE.etl
```

2. View the top time-consuming files and scans straight in the console:

```powershell
Get-MpPerformanceReport -Path C:\Temp\MDE.etl -TopFiles 10 -TopScansPerFile 10
```

3. Export the full scan list to a CSV for deeper analysis (e.g. in Excel):

```powershell
(Get-MpPerformanceReport -Path C:\Temp\MDE.etl -Topscans 1000).TopScans | Export-Csv -Path C:\Temp\YourScenario.csv -Encoding UTF8 -NoTypeInformation
```

4. Check the process paths currently excluded from Defender scanning - an exclusion here can explain why a process is missing from the recorded scan data:

```powershell
Get-MpPreference | Select-Object -Property ExclusionProcess -ExpandProperty ExclusionProcess
```
