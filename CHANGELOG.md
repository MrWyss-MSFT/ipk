# Changelog

## [0.16.1](https://github.com/MrWyss-MSFT/ipk/compare/v0.16.0...v0.16.1) (2026-10-21)

### 📝 Documentation

* Group the 0.16.0 changelog entries by tool for easier browsing.

## [0.16.0](https://github.com/MrWyss-MSFT/ipk/compare/v0.15.0...v0.16.0) (2026-10-21)

### 📅 Update Simulator

* 🎉 New Tool: 📅 Update Simulator ([6f40360](https://github.com/MrWyss-MSFT/ipk/commit/6f40360e40c43bd59524bbfbb7ad912716953b17))
* 🎉 New Tool: 📅 Update Simulator ([5c0186b](https://github.com/MrWyss-MSFT/ipk/commit/5c0186bc5fa97c02c66efcbd1fcc2dd4ddecb31d))
* add combined device schedule editor and per-release durations ([81812bd](https://github.com/MrWyss-MSFT/ipk/commit/81812bda7a2983e60f0cb2f155776dc83940b735))
* add searchable assumption ratings and classifications ([d02a94f](https://github.com/MrWyss-MSFT/ipk/commit/d02a94f6c299486a733f773706433b986144600b))
* add two-way simulator policy import ([f4fc0e8](https://github.com/MrWyss-MSFT/ipk/commit/f4fc0e8a8874612e171e3353cb65ccd990d1a59f))
* combine device and user schedule timeline group ([ed9e250](https://github.com/MrWyss-MSFT/ipk/commit/ed9e25015d14981c081682bae4491d4ec78bdee4))
* make Update Simulator visible in the tool catalog ([74190d2](https://github.com/MrWyss-MSFT/ipk/commit/74190d2d0d7ae3a60badbad92d006b4e128aee53))
* redesign quality update approval controls ([ff2b4f7](https://github.com/MrWyss-MSFT/ipk/commit/ff2b4f7ea07064fb3895d99bab57b06ab3e0ce48))
* redesign simulator release controls ([de6dd22](https://github.com/MrWyss-MSFT/ipk/commit/de6dd2295408247f65711e03bf9fffa17810365f))
* refine maintenance window scheduling and controls ([56e3752](https://github.com/MrWyss-MSFT/ipk/commit/56e3752669a8dbf9f00438293262a0bada615ba6))
* refine update simulator scheduling and time controls ([8c3d054](https://github.com/MrWyss-MSFT/ipk/commit/8c3d0543d6a410a7ae7a620eca825dc21fe3b090))
* align update discovery with availability and clarify timeline ([ffea62e](https://github.com/MrWyss-MSFT/ipk/commit/ffea62e5ba570eeec8db0eeac33495d89631ddbe))
* honor driver release restart requirement ([544578e](https://github.com/MrWyss-MSFT/ipk/commit/544578ee486d59a1fa01fd40f443e63640c3ba28))
* label monthly updates using B-week naming ([4ebc2c4](https://github.com/MrWyss-MSFT/ipk/commit/4ebc2c4484588959e321df5dd20adc2e0191aca0))
* separate driver deferral and refine timeline groups ([373e754](https://github.com/MrWyss-MSFT/ipk/commit/373e754ca642898cfa8bf3dabf20f0a2b5a0b4c1))
* clarify independent update restart simulation ([3bc789a](https://github.com/MrWyss-MSFT/ipk/commit/3bc789a160a567459bee4f3ac912e821a58be59a))

### 🧾 Autopilot Hardware Hash Decoder

* add Autopilot hardware hash CSV export ([c8ecddd](https://github.com/MrWyss-MSFT/ipk/commit/c8ecddde387892fc8783128f30937778c8dcaaef))

### 🔗 Autopilot DeviceLink Decoder

* add example DeviceLink export script to Autopilot DeviceLink Decoder ([1219e49](https://github.com/MrWyss-MSFT/ipk/commit/1219e49395ed21ca0a60432fa62826a9edb10a72))
* add read and remove DeviceLink association example scripts ([2d6b139](https://github.com/MrWyss-MSFT/ipk/commit/2d6b139ca97dd8a26e9bed5a46f9779e212326f8))

### 📷 QR Code Scanner

* add example QR codes, retain scan list, beep sound polish ([dba1db3](https://github.com/MrWyss-MSFT/ipk/commit/dba1db31dc94dd69ac6e9a00f79a9d1b5ab7b658))

## [0.15.0](https://github.com/MrWyss-MSFT/ipk/compare/v0.14.0...v0.15.0) (2026-10-16)

### ✨ Features

* 🎉 New Tool: 🖥️ EDID Decoder ([e3fa666](https://github.com/MrWyss-MSFT/ipk/commit/e3fa666a0051ce03840ef07e8c736dad1bec533d))
* add global paste-anywhere support to input tools ([fea946a](https://github.com/MrWyss-MSFT/ipk/commit/fea946a65e9ec5f7dd6fcc8bd9a59cd75774520c))
* add live WebSocket data variable to Stay Awake ([4884409](https://github.com/MrWyss-MSFT/ipk/commit/4884409a85ca12da75e9a184cf942e2ee33182aa))
* add Load example / Clear buttons to all input-driven tools ([77f058a](https://github.com/MrWyss-MSFT/ipk/commit/77f058aab3f4f6c7862157535c4b29928fdeb8a1))
* make Entra ID ObjectID/SID converter two-way like GDID/LID ([c7ae089](https://github.com/MrWyss-MSFT/ipk/commit/c7ae0890cf73aaf91f2761b09cd5459ca4e46234))
* rename Stay Awake {{ws}} variable to {{websocketdata}} ([9a246cb](https://github.com/MrWyss-MSFT/ipk/commit/9a246cbf92c524b7c7c4f13c1a9cb64218674297))
* support dropping a .devicelink.csv file anywhere on the page ([f552d2d](https://github.com/MrWyss-MSFT/ipk/commit/f552d2d61acd0d7cf4e01f431f6031dd76f277b6))

### 🐛 Bug Fixes

* keep header logo visible and fix popover rendering on narrow screens ([3f062cb](https://github.com/MrWyss-MSFT/ipk/commit/3f062cb24f027dbfdcaaeb67ec2ad8ffc05bcecd))
* normalize field-header-to-field gap across tools ([43599e5](https://github.com/MrWyss-MSFT/ipk/commit/43599e58e3fc1e5be443506dda2de0f00d66421e))
* polish Stay Awake control panel layout and copy ([07b2287](https://github.com/MrWyss-MSFT/ipk/commit/07b2287fef31f3aa23fe8d2655c5406a3abf41ab))
* standardize error message styling across tools ([b92754d](https://github.com/MrWyss-MSFT/ipk/commit/b92754d609542f889887dd0f9cd34d305cb53a57))
* use consistent step-1 instruction wording across tools ([df02b9e](https://github.com/MrWyss-MSFT/ipk/commit/df02b9e2121f5263e86c6f72856bb99d744fd171))

### 📝 Documentation

* document stepped-tool UI conventions for new tools ([e9f8274](https://github.com/MrWyss-MSFT/ipk/commit/e9f82743e5d3c670a880a427db23db3f34d6783e))

## [0.14.0](https://github.com/MrWyss-MSFT/ipk/compare/v0.13.0...v0.14.0) (2026-10-15)

### ✨ Features

* decode Autopilot hash Type 34 (CPU efficiency classes) and Type 37 (SppHwid) ([9a82a27](https://github.com/MrWyss-MSFT/ipk/commit/9a82a279cc14697da1ef1965d0c115156251fdf1))

### 🐛 Bug Fixes

* 🌳 Treeview-style JSON output for Autopilot Hash Decoder ([2e06f02](https://github.com/MrWyss-MSFT/ipk/commit/2e06f02528fac46f1e1f114fcefd0bc4c457b3ea))
* decode Autopilot hash Types 35/36, fix Type 27 monitor pairing ([03ed97c](https://github.com/MrWyss-MSFT/ipk/commit/03ed97c539bd8968802062a57cc966486d82af34))
* rename Find Text in Files tool and add command decoration ([018669b](https://github.com/MrWyss-MSFT/ipk/commit/018669b329ca94093cf88096278fbfb037ab4fb9))

### 📝 Documentation

* document standard command-decoration convention in AGENTS.md ([f27b38f](https://github.com/MrWyss-MSFT/ipk/commit/f27b38f038300c00d69062db4c4b7029655e0a9d))

### 🔧 Chores

* upgrade Vite to v8, release-it to v21, fix basic-ftp CVE ([4a4af08](https://github.com/MrWyss-MSFT/ipk/commit/4a4af08d53ccc50b059d80bbc143fae9f6c6ac6a))

## [0.13.0](https://github.com/MrWyss-MSFT/ipk/compare/v0.12.0...v0.13.0) (2026-10-13)

### ✨ Features

* add fsutil test-file command to reference ([0ecf21a](https://github.com/MrWyss-MSFT/ipk/commit/0ecf21a717abd0d7c9c10acdf701d860a1542db6))
* add Microsoft Defender performance diagnosis playbook ([875ba15](https://github.com/MrWyss-MSFT/ipk/commit/875ba159602f4a879251b8f401452a804b519f85))
* add WPR boot/shutdown/standby trace playbook ([eff3ca7](https://github.com/MrWyss-MSFT/ipk/commit/eff3ca75d051a35171f03daac5da79868aeb3572))
* **mac-address-converter:** add getmac command hint to find local MAC addresses ([88cf8d0](https://github.com/MrWyss-MSFT/ipk/commit/88cf8d0bec130d547af392c54b6e4ad6005a3d24))
* mark elevated steps in sysmon and pktmon playbooks with Admin badge ([468cfc4](https://github.com/MrWyss-MSFT/ipk/commit/468cfc43ef2bae6a05567a8d91ea1a0801a3e1bd))
* register IPK as a browser search-engine provider ([d921aba](https://github.com/MrWyss-MSFT/ipk/commit/d921aba3be58de75bc43ffaee216fdfd301227c6))

### 🐛 Bug Fixes

* decode more DHCP options in the DHCP Options Decoder ([4e31d2c](https://github.com/MrWyss-MSFT/ipk/commit/4e31d2ca0b8f97d5b6e33a6cdec62d865021967b))
* refine comgmt-workloads Force-all and implied-workload handling ([b942704](https://github.com/MrWyss-MSFT/ipk/commit/b9427047d9e0dff5d1f1b93afb53a09e02572660))

## [0.12.0](https://github.com/MrWyss-MSFT/ipk/compare/v0.11.0...v0.12.0) (2026-10-12)

### ✨ Features

* add MAC address converter tool ([bfef951](https://github.com/MrWyss-MSFT/ipk/commit/bfef951da659857da554f13dc78a08b15cb17997))
* **update-history-explorer:** add Windows Update History Explorer tool ([8650541](https://github.com/MrWyss-MSFT/ipk/commit/865054152557d2e03d184a4136c17fbb41032403))

## [0.11.0](https://github.com/MrWyss-MSFT/ipk/compare/v0.10.0...v0.11.0) (2026-10-11)

### ✨ Features

* **device-gid:** equal-level field layout and rewrite hint ([de2ad85](https://github.com/MrWyss-MSFT/ipk/commit/de2ad8510025783734dc314c166b494e6cd6b628))
* **ime-apps-parser:** move app GUID into summary, make it click-to-copy ([d877d57](https://github.com/MrWyss-MSFT/ipk/commit/d877d576c99aa4ffc848d45ee8fcf9c5605aea2c))
* **ime-apps-parser:** replace uninstall badge with inline intent/target icons ([b9584d1](https://github.com/MrWyss-MSFT/ipk/commit/b9584d1374f930e6624f9fb9f8daa1d3bb4d3262))
* **ime-apps-parser:** surface Uninstall intent as a distinct badge ([c596d84](https://github.com/MrWyss-MSFT/ipk/commit/c596d849f654f2dad14b3836b4dc9df9aab533a2))
* **mdm-result:** add MDM Result tool for filterable CSP policy reports ([2c7025d](https://github.com/MrWyss-MSFT/ipk/commit/2c7025d18b20e29beb307f8618f599f7b9613915))
* **reference:** add Elevated column and MDM/MMP-C sync commands ([b3e78f9](https://github.com/MrWyss-MSFT/ipk/commit/b3e78f98979a631ffb380518238bd81c4fc1142f))
* **registry-preview:** match reg export command box to PowerShell tabs ([c22e59a](https://github.com/MrWyss-MSFT/ipk/commit/c22e59ac3086b3f0bfd1f87fcfe08c5c90b2c239))

### 🐛 Bug Fixes

* **mdm-result:** escape copy-button labels and add reusable admin badge ([dad5b3a](https://github.com/MrWyss-MSFT/ipk/commit/dad5b3af12d9d8f3d488c6be6a1841fe3b200ee5))

## [0.10.0](https://github.com/MrWyss-MSFT/ipk/compare/v0.9.0...v0.10.0) (2026-10-11)

### ✨ Features

* **ime-apps-parser:** parse ESPConfiguration, show check-in ESP badge, expandable unchanged apps ([ed8deb3](https://github.com/MrWyss-MSFT/ipk/commit/ed8deb3dec63281c1cab107e0510d0587132dd15))

## [0.9.0](https://github.com/MrWyss-MSFT/ipk/compare/v0.8.0...v0.9.0) (2026-10-11)

### ✨ Features

* add IME Apps Parser tool for AppWorkload.log timeline diffing ([c26a853](https://github.com/MrWyss-MSFT/ipk/commit/c26a853d8330e4b0d5077f6cad6d25652df4d2f9))
* **ui:** add PowerShell 7+/5.1 command tabs across device tools ([1547dc8](https://github.com/MrWyss-MSFT/ipk/commit/1547dc8e64dbfc0309ce471e7a1f7fc757814b81))
* **ui:** notify returning visitors of changes since their last visit ([ba60cfc](https://github.com/MrWyss-MSFT/ipk/commit/ba60cfc4e56d9e14cb152e87a373a7484de62f79))

### 🐛 Bug Fixes

* **ime-apps-parser:** fix nested PS5.1 array wrapper, correct TargetType, preserve log order ([5f5272e](https://github.com/MrWyss-MSFT/ipk/commit/5f5272e975a13bd76b7b0ed845946a2b478ae900))

## [0.8.0](https://github.com/MrWyss-MSFT/ipk/compare/v0.7.0...v0.8.0) (2026-10-10)

### ✨ Features

* **ui:** responsive layout polish, shared hint styling, stay-awake tweaks ([6498cae](https://github.com/MrWyss-MSFT/ipk/commit/6498caef109a5a1e204cbec84b70a63f751cf003))

## [0.7.0](https://github.com/MrWyss-MSFT/ipk/compare/v0.6.0...v0.7.0) (2026-10-10)

### ✨ Features

* **stay-awake:** add Stay Awake tool with Markdown message, full screen/theater modes, and anti burn-in protection ([c64318a](https://github.com/MrWyss-MSFT/ipk/commit/c64318af94194bb8966551a937020ad2741db671))

### 🐛 Bug Fixes

* **qr-scanner:** move start button next to mode toggle, clarify preview copy ([a703346](https://github.com/MrWyss-MSFT/ipk/commit/a703346a645c0e67e6095126e93c8d4d3049f7e5))

## [0.6.0](https://github.com/MrWyss-MSFT/ipk/compare/v0.5.0...v0.6.0) (2026-10-10)

### ✨ Features

* **about:** add GitHub star link and no-analytics note ([d7b6b47](https://github.com/MrWyss-MSFT/ipk/commit/d7b6b475771562e7d1a4598726a2498040b3f235))
* add Windows Sandbox config (.wsb) generator tool ([034b59d](https://github.com/MrWyss-MSFT/ipk/commit/034b59d326e23ff635878b051a8b7eaecd2a1554))
* **wsb:** add 'Use example' buttons for logon command and mapped folders ([85d81f3](https://github.com/MrWyss-MSFT/ipk/commit/85d81f3ce0b6214b24788fbcfcd2792dbbafede6))
* **wsb:** add a copyable example under the logon command field ([49c6046](https://github.com/MrWyss-MSFT/ipk/commit/49c604610023b38a972989eb0d1baef106865aa7))
* **wsb:** add copyable command to enable the Windows Sandbox feature ([e49af88](https://github.com/MrWyss-MSFT/ipk/commit/e49af88b6ab5500efefb7e599e8a7ca100134e51))
* **wsb:** add tooltips explaining each setting ([32d33f1](https://github.com/MrWyss-MSFT/ipk/commit/32d33f1c326f1ead98c2bccc2fff01f59eca3438))
* **wsb:** fold install command into the intro note, add double-click tip ([f17c802](https://github.com/MrWyss-MSFT/ipk/commit/f17c802e63ba53d45f978c876d8966b133d124ce))
* **wsb:** replace native title tooltips with a copyable custom popover ([00256a9](https://github.com/MrWyss-MSFT/ipk/commit/00256a9165635e8c97f03f1b7176a7fb9e992e2f))
* **wsb:** show actual default behavior in tri-state dropdowns ([2612edb](https://github.com/MrWyss-MSFT/ipk/commit/2612edb531dac7b7a5890ed1e42406e412735349))

### ⏪ Reverts

* Revert "chore: remove CNAME file (unneeded with Actions-based Pages deploy)" ([e03f3b0](https://github.com/MrWyss-MSFT/ipk/commit/e03f3b09f22f9996c1171dfa26ae99e3fc62b85b))

## [0.5.0](https://github.com/MrWyss-MSFT/ipk/compare/v0.4.0...v0.5.0) (2026-10-10)

### ✨ Features

* add Autopilot DeviceLink Decoder tool ([20903ab](https://github.com/MrWyss-MSFT/ipk/commit/20903ab9bdac8cdeb7576c062c37bf982fbb589d))
* add QR code scanner tool ([f65f82c](https://github.com/MrWyss-MSFT/ipk/commit/f65f82c50ab901ff2cfad921a3306e353dbc712e))
* make header tagline clickable and keep it left-aligned ([9c08356](https://github.com/MrWyss-MSFT/ipk/commit/9c08356df23c434549cba8ef7c155b206b81ca13))
* **qr-scanner:** add camera device picker and clearer start label ([0feb830](https://github.com/MrWyss-MSFT/ipk/commit/0feb830f426da5d4b9d5d2e1776ffa390c4fc656))
* **qr-scanner:** decode Autopilot Device Preparation DeviceLink QR codes ([132d9f8](https://github.com/MrWyss-MSFT/ipk/commit/132d9f8060a210ddcc0ce8816876d7fa4e4f9dc7))
* **qr-scanner:** list supported QR code formats ([ef9020e](https://github.com/MrWyss-MSFT/ipk/commit/ef9020e027c2491371fa1279557022abe2aa8d46))

### 🐛 Bug Fixes

* apply themed input styling to number inputs and selects ([27595da](https://github.com/MrWyss-MSFT/ipk/commit/27595dac1473371b007d4bc08f7d4c65befbf4d4))
* force hidden attribute to override class display styles ([078b2d3](https://github.com/MrWyss-MSFT/ipk/commit/078b2d3006e9a33268559f0936865cebf06b2f11))
* persist file/example/clear input across tools ([360c5b1](https://github.com/MrWyss-MSFT/ipk/commit/360c5b118e3e7fa12ee55d3a34984e218c7b001b))

## [0.4.0](https://github.com/MrWyss-MSFT/ipk/compare/v0.3.0...v0.4.0) (2026-10-09)

### ✨ Features

* **about:** add license, author, and contributing sections; fix sidebar nav ([02100ae](https://github.com/MrWyss-MSFT/ipk/commit/02100aea8136e140c7280fa1ec3bfd6dc56a0901))
* rebrand to IPK - IT Pro Kit with new logo and favicon ([723062a](https://github.com/MrWyss-MSFT/ipk/commit/723062a9aae2e1130c59cc7f6aa16563a69c2535))
* redesign theme palette and add dual-tone logo for light/dark mode ([482afdc](https://github.com/MrWyss-MSFT/ipk/commit/482afdcfe2b65391c62d7c88df7e77c68a00c43b))

## [0.3.0](https://github.com/MrWyss-MSFT/ipk/compare/v0.2.0...v0.3.0) (2026-10-09)

### ✨ Features

* emoji section headers in generated changelog ([8dce1e0](https://github.com/MrWyss-MSFT/ipk/commit/8dce1e0be452c6d9c0d77cf50e6a17487822cb65))

### 🐛 Bug Fixes

* use Set-Clipboard -PassThru instead of Tee-Object in PowerShell snippets ([f6e3c64](https://github.com/MrWyss-MSFT/ipk/commit/f6e3c641b366f3784c7a0c041c86b2c5a4bb290b))

## 0.2.0 (2026-10-09)

### Features

* **about:** pin About link to sidebar footer instead of tool grid ([c9ba2b9](https://github.com/MrWyss-MSFT/ipk/commit/c9ba2b9ec88b10f1a0100afba8051027fea0e842))
* Prism syntax highlighting for commands + consistent font-size ([8ac55b9](https://github.com/MrWyss-MSFT/ipk/commit/8ac55b9a10b9060c4536c9713783cdd1cc1ee735))

### Reverts

* Revert "chore: auto-create GitHub Release on npm run release" ([653d102](https://github.com/MrWyss-MSFT/ipk/commit/653d102bbd77f61cf98adc32de0af63b92cc64c8))
