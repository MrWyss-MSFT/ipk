---
title: Capture a Boot/Shutdown/Standby Trace with WPR (built-in tool)
summary: Record a GeneralProfile on/off transition trace - boot, fast startup, shutdown, reboot cycle, standby, or hibernate - with the built-in wpr.exe tool.
tags: WPR, Boot, Performance, Troubleshooting, Untested
---

1. 🛡️ From an elevated Command Prompt, start recording the Boot (startup performance) scenario (arms a `GeneralProfile` autologger that survives the reboot; results are saved to `-onoffresultspath` and `-numiterations` sets how many cycles to capture). The other on/off scenarios are included below as `rem` (commented-out) lines - remove the `rem ` prefix from the one you need instead of Boot:

```cmd
wpr -start GeneralProfile -onoffscenario Boot -onoffresultspath C:\WPR -numiterations 3 -filemode

rem FastStartup (hybrid shutdown + boot):
rem wpr -start GeneralProfile -onoffscenario FastStartup -onoffresultspath C:\WPR -numiterations 3 -filemode

rem Shutdown performance:
rem wpr -start GeneralProfile -onoffscenario Shutdown -onoffresultspath C:\WPR -numiterations 3 -filemode

rem Reboot cycle (shutdown + boot):
rem wpr -start GeneralProfile -onoffscenario RebootCycle -onoffresultspath C:\WPR -numiterations 3 -filemode

rem Standby / resume (sleep):
rem wpr -start GeneralProfile -onoffscenario Standby -onoffresultspath C:\WPR -numiterations 3 -filemode

rem Hibernate / resume:
rem wpr -start GeneralProfile -onoffscenario Hibernate -onoffresultspath C:\WPR -numiterations 3 -filemode
```

2. Repeat the matching action the number of times given by `-numiterations` (3 by default): restart the computer (Boot/RebootCycle), shut down and turn it back on (Shutdown/FastStartup), or sleep/hibernate and resume (Standby/Hibernate). WPR keeps recording across every cycle on its own - there's no command to run here.

3. 🛡️ Once all cycles are done, stop and merge the trace from an elevated Command Prompt (this is the step that actually saves the `.etl` - it's not automatic):

```cmd
wpr -stop C:\WPR\Trace.etl
```

4. Open `Trace.etl` in Windows Performance Analyzer (WPA) to analyze it. Install WPA first if it isn't already:

```cmd
winget install --id 9N0W1B2BXGNZ
```

5. 🛡️ To abandon a running recording without saving it, instead of step 3 run:

```cmd
wpr -cancel
```
