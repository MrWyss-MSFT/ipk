---
title: Wireshark Network Trace with PKTMON (built-in tool)
summary: Capture all network traffic with the built-in pktmon tool and convert it to a .pcap for Wireshark - no driver install needed.
tags: Network, Wireshark, pktmon, Troubleshooting
---

1. From an elevated prompt, start a full capture (captures every interface, full packet size, no filters):

```cmd
pktmon start --capture --pkt-size 0 -f C:\temp\capture.etl
```

2. Reproduce the issue, then stop the capture:

```cmd
pktmon stop
```

3. Convert the capture to a Wireshark-readable .pcap:

```cmd
pktmon etl2pcap C:\temp\capture.etl -o C:\temp\capture.pcap
```

4. Open `capture.pcap` in Wireshark.

5. If the capture is Wi-Fi traffic, Wireshark may show it as unreadable/malformed (etl2pcap's Ethernet framing doesn't apply to 802.11). Fix it by re-tagging the link-layer type:

```cmd
editcap.exe -T ieee-802-11 capture.pcap capture-wifi-fixed.pcap
```
