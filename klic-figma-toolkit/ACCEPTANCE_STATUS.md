# KLIC Figma Toolkit Acceptance Status

Target deadline: 2026-07-04 09:00 KST.

## Objective Mapping

| User requirement | Completion audit evidence |
|---|---|
| 기능개선 | `feature-improvements`, `font-search-performance`, `macos-runtime-evidence-helpers` |
| UX개선 | `ux-improvements`, `style-semantic-visual-layout`, `diagnostic-i18n-guard` |
| 피그마 Context7 조회 성능개선 | `figma-context7-lookup-performance`, `font-search-performance` |
| 완벽한 i18n 검토 | `i18n`, `i18n-dictionary-parity`, `i18n-dictionary-type-parity`, `dynamic-i18n-guard`, `diagnostic-i18n-guard`, `aria-i18n-guard` |

## Current Verified State

Local verification passes with:

```bash
node klic-figma-toolkit/run-local-verification.mjs
```

The macOS launcher preflight also checks FigmaAgent's ability to open a new design URL and reports `FigmaAgent URL-open check: ready (can open a new design file)` when the signed-in desktop profile can accept editor URLs. Guided runtime acceptance now uses that same FigmaAgent path to try opening a new design file before asking the user to run the development plugin menu.

The completion audit currently passes all local and source-backed requirements, including:

- `feature-improvements`
- `ux-improvements`
- `figma-context7-lookup-performance`
- `font-search-performance`
- `i18n-dictionary-parity`
- `i18n-dictionary-type-parity`
- `dynamic-i18n-guard`
- `diagnostic-i18n-guard`
- `aria-i18n-guard`
- `macos-runtime-evidence-helpers`

## Remaining Blocker

The only incomplete requirement is:

- `actual-figma-runtime-smoke-evidence`

Reason: Figma desktop is installed, a signed-in local profile is detected, and the local plugin manifest is registered. The remaining block is launching the local development plugin and extracting its smoke evidence JSON from this environment: macOS denies UI automation through `osascript` accessibility access (`-25211`), Figma AppleEvents time out for activation/menu actions, and FigmaAgent can open files but does not expose a documented local-plugin launch API. `./KLIC-START.sh --check` reports that no Accessibility grant is visible for Ghostty/Terminal/iTerm2, confirms `AppleEvents permission: present for com.mitchellh.ghostty`, confirms `Accessibility permission: no grants found in user TCC database`, and identifies `Accessibility controller hint: allow Ghostty.app (com.mitchellh.ghostty)`, which explains why `System Events` menu automation is still blocked. A local HTTP receiver was added and verified, but no GET/POST arrived because the local plugin command could not be relaunched programmatically.

Additional runtime-path checks: Figma's local app bundle registers the `figma://` URL scheme, and Context7 Figma developer docs describe local development import through the desktop menu path `Plugins > Development > Import plugin from manifest...`. FigmaAgent `/figma/desktop/open-url` was able to open Figma URLs, but `try-plugin-*` URLs did not start the local development plugin or trigger the runtime evidence receiver. A later bundle inspection found internal menu action payload types such as `run-local-plugin`, but they are delivered through the Electron `handlePluginMenuAction` web binding after a real app menu click; no external HTTP, CLI, URL, or AppleEvents-free IPC caller was found.

Figma Desktop bundle inspection: `app.asar` contains local manifest management bridge calls such as `createMultipleNewLocalFileExtensions`, `getAllLocalManifestFileExtensionIds`, `getLocalFileExtensionManifest`, and `getLocalFileExtensionSource`, but those are internal renderer bridge messages. The command-line and `figma://` URL handler normalizes Figma URLs into file/community/prototype tabs; no external local-development plugin launch route was found. Running Figma processes also do not expose a Figma remote-debugging port.

FigmaAgent endpoint inventory, `2026-07-04 01:44 KST`: the `figma_agent` binary exposes `/figma/desktop/can-open-url`, `/figma/desktop/open-url`, `/figma/desktop/set-open-in-desktop-app-pref`, font, health, and clear-data routes. Safe localhost probes confirmed `/figma/desktop/open-url` exists, while plugin launch candidates such as `/figma/desktop/launch-plugin`, `/figma/desktop/run-plugin`, `/figma/desktop/open-plugin`, and `/figma/desktop/development/run` return 404.

Latest permission and bundle inspection, `2026-07-04 02:06 KST`: `./KLIC-START.sh --check` still reports no Accessibility grant for Ghostty/Terminal/iTerm2 and identifies `Ghostty.app (com.mitchellh.ghostty)` as the controlling app to allow. The TCC database contains Ghostty AppleEvents entries, but no `kTCCServiceAccessibility` grant. `settings.json` confirms the local plugin is registered as local file extension id `1`, with code file id `2`, UI file id `3`, manifest path `/Users/yong/DEV/KLIC-Figma-Toolkit/klic-figma-toolkit/manifest.json`, and plugin id `com.klic.figma-toolkit`. The desktop navigation config contains a `try-plugin-*` rule for `file/new`, `design/new`, and `board/new|jam` URLs, but it routes those URLs as `EDITOR` new-file tabs; the earlier `try-plugin-*` probes showed this does not launch the local development manifest. `app.asar` inspection found local extension IPC handlers for registering, listing, loading manifest/source, opening manifest/directory, writing new extension directories, and removing local extensions. No external IPC, FigmaAgent route, command-line switch, or URL route for running a local development plugin was found.

Latest Context7 official-doc check, `2026-07-04 02:32 KST`: Context7 resolved the official Figma developer docs to `/websites/developers_figma_plugins` and `/websites/developers_figma`. Queries for local development plugin launch, `try-plugin-*`, FigmaAgent, URL parameters, command execution, desktop MCP, and make-local returned documentation for `figma.on('run')`, `figma.parameters`, the normal desktop development-menu launch flow, and the optional Figma Desktop MCP server at `http://127.0.0.1:3845/mcp` after enabling it from a design file's Dev Mode inspect panel. The official quickstart evidence still points to opening a design file in the Figma desktop app and running the plugin from `Plugins > Development`; it did not expose a documented URL, CLI, FigmaAgent, MCP, or external automation API for launching an imported local manifest or command.

Latest launcher helper check, `2026-07-04 01:49 KST`: the new `open_figma_design_file` runtime-acceptance helper called FigmaAgent `/figma/desktop/open-url` for `https://www.figma.com/design/new` and returned `FigmaAgent design file open: request sent`. This reduces the remaining manual runtime acceptance step to running the local development plugin command in the opened Figma design file.

Latest guided runtime acceptance, `2026-07-04 02:18 KST`: `./KLIC-START.sh --open-accessibility && ./KLIC-START.sh --runtime-acceptance` opened the macOS Accessibility settings panel, confirmed Figma Desktop is installed and signed in, confirmed no Accessibility grant for Ghostty/Terminal/iTerm2, started the HTTP receiver and clipboard watcher, opened Figma Desktop, and sent a new-design open request through FigmaAgent. The launcher reported `KLIC auto menu launch skipped: Accessibility permission not detected.` After the full 600000 ms wait, the HTTP receiver timed out with no smoke evidence POST and the clipboard watcher timed out with no real Figma evidence JSON. No receiver, watcher, or `osascript` process remained afterward.

Latest post-timeout check, `2026-07-04 02:19 KST`: a direct clipboard capture with `node klic-figma-toolkit/capture-runtime-evidence.mjs --skip-audit --out /tmp/klic-latest-clipboard-evidence.json` failed because the clipboard was empty or unreadable. A recent evidence-file scan found no matching Figma smoke evidence JSON in the workspace or `/tmp`. `./KLIC-START.sh --check` still reports no Accessibility grant and still identifies Ghostty as the controlling app to allow.

Latest Figma profile/log search, `2026-07-04 02:21 KST`: Figma Desktop profile logs and recent profile files were searched for `KLIC`, `com.klic`, `klic-figma-smoke-evidence`, `localhost:51337`, `127.0.0.1:51337`, and runtime smoke evidence strings. The only text hits were the expected local plugin registration in `settings.json` plus binary code-cache matches; no readable plugin runtime error, no evidence POST failure, and no copied smoke evidence were found. This supports the current blocker assessment: the local development plugin has not been successfully launched in the real Figma Desktop runtime during the watched acceptance windows, rather than the plugin running and only the evidence transport failing.

Latest local port/MCP probe, `2026-07-04 02:22 KST`: `lsof` showed Figma-related listening ports only for FigmaAgent on `127.0.0.1:44950` and `127.0.0.1:44960`. No Figma Desktop DevTools, MCP, or other local control port was listening on common probe ports such as `3845`, `3846`, `3055`, `3333`, `9222`, or `9223`. This leaves the existing FigmaAgent URL-open route as the only confirmed local API surface, and it has not exposed a local development plugin launch endpoint.

Latest launcher readiness check, `2026-07-04 02:25 KST`: `./KLIC-START.sh --check` now distinguishes AppleEvents from Accessibility in the readiness output. It reports `AppleEvents permission: present for com.mitchellh.ghostty`, then reports `AppleEvents permission: Accessibility is still required for System Events menu automation.`, and still reports `Accessibility permission: no grants found in user TCC database`. This removes the ambiguity where AppleEvents permission appeared to exist but `System Events` menu automation remained blocked.

Latest `localFileId` URL attempt, `2026-07-04 02:32 KST`: after finding `run-local-plugin`, `SelectedRunPluginArgs`, `selectedRunPluginArgs`, and `localFileId` tokens in the current Figma Desktop app/profile cache, a 90000 ms localhost HTTP receiver was started and FigmaAgent accepted additional new-design URLs with `{"opened":true}`. Tested `try-plugin-params` payloads included `{"localFileId":1,"command":"run-smoke-evidence"}`, `{"runPluginArgs":{"localFileId":1,"command":"run-smoke-evidence"}}`, `{"selectedRunPluginArgs":{"localFileId":1,"parameterValues":{"command":"run-smoke-evidence"}}}`, `{"pluginId":"com.klic.figma-toolkit","localFileId":1,"command":"run-smoke-evidence"}`, and `{"localFileId":1}`. No smoke evidence POST arrived before receiver timeout, so `try-plugin-params` still cannot be treated as an external local development plugin launch path in this environment.

Latest UI-control probe, `2026-07-04 02:35 KST`: a second Figma process was launched with `--remote-debugging-port=9333` to check whether Electron DevTools Protocol could expose the internal `handlePluginMenuAction` web binding. The process started, but no `9333` listener opened, so the debug instance was killed and the original Figma process was left running. A screenshot-based check then confirmed that macOS Accessibility settings are visible and Ghostty is listed with its toggle off. A minimal Swift `CGEvent` Escape-key probe did not close the active Figma menu, which indicates this terminal session still cannot synthesize usable UI events without Accessibility permission.

Latest launcher UX improvement, `2026-07-04 02:39 KST`: `KLIC-START.sh` now includes `--wait-accessibility-runtime`. This opens macOS Accessibility settings, polls for a Ghostty/Terminal/iTerm2 Accessibility grant, and immediately continues into guided runtime acceptance when the grant appears. It does not change the final completion gate; a real Figma Desktop smoke evidence JSON is still required.

Latest Accessibility wait attempt and guidance update, `2026-07-04 02:51 KST`: `./KLIC-START.sh --wait-accessibility-runtime` was run with the default 300 second wait. It opened macOS Accessibility settings and continued polling, but timed out without detecting an Accessibility grant. The timeout guidance now says `After enabling Accessibility, run ./KLIC-START.sh --check, then rerun ./KLIC-START.sh --wait-accessibility-runtime.` Completion audit missing guidance also now mentions `--wait-accessibility-runtime` when Accessibility settings are already open. Fresh local verification passed after this update, and a fresh completion audit still reports only `actual-figma-runtime-smoke-evidence` as missing.

Latest app bundle extraction, `2026-07-04 02:54 KST`: `app.asar` was extracted to `/tmp/klic-figma-asar` and searched at the JS-file level. `main.js` classifies `try-plugin-id`, `try-plugin-version-id`, `try-plugin-name`, and `try-plugin-params` only as an `EDITOR` new-file route with `isNewFile: true`; it does not expose those params as a desktop local-plugin command runner. The same bundle validates internal menu actions shaped as `{"type":"run-local-plugin","localFileId":number,"command"?:string}` and `{"type":"run-installed-plugin","pluginId":string,"command"?:string}`, but those actions are wired through Electron menu clicks: `bN(...)` stores them as `pluginMenuAction`, `uir(...)` forwards them with `postMessageToActiveWebBinding("handlePluginMenuAction", ...)`, and `web_app_binding_renderer.js` forwards `handlePluginMenuAction` into the active Figma web app. This confirms the remaining launch path is an actual app menu action or manual plugin run, not a documented URL/FigmaAgent/CLI route.

Latest `FIGMA_TEST=1` remote-debugging probe, `2026-07-04 03:01 KST`: because `main.js` removes `--remote-debugging-port` unless `process.env.FIGMA_TEST` is set, a separate Figma instance was launched with `FIGMA_TEST=1 --remote-debugging-port=9334`. The DevTools endpoint opened and exposed Figma page targets, proving the earlier no-port result was caused by the production switch removal. CDP inspection showed the shell page exposes `window.__figmaShell`, but not a direct plugin-menu action method. Figma web pages did not expose `window.__figmaDesktop` in default or Electron isolated execution contexts, and a manual `MessageChannel` bridge attempt timed out. A renderer input attempt to open Quick Actions via CDP made the debug target unresponsive before any smoke evidence was produced. The debug Figma instance and test node process were killed; only the original Figma process remained. This route is therefore not accepted as completion evidence.

Latest desktop-message handler probe, `2026-07-04 03:05 KST`: a fresh `FIGMA_TEST=1 --remote-debugging-port=9336` instance was launched and controlled through browser-level CDP instead of direct page WebSockets. Browser-level attach/evaluate worked on the design page. A pre-navigation hook was installed with `Page.addScriptToEvaluateOnNewDocument` to wrap `window.__figmaDesktop.setMessageHandler` and capture the active web app's desktop message handler, then the design page was reloaded. The hook itself executed, but `window.__figmaDesktop` was never assigned on the reloaded design page, so no `handlePluginMenuAction` handler could be captured or invoked. CDP `Input.dispatchKeyEvent` also timed out when trying to open Quick Actions. The debug instance was killed afterward. This means the internal `handlePluginMenuAction` route still cannot be reached from this environment without the actual Electron menu action or a user-triggered plugin run.

Latest macOS TCC check, `2026-07-04 02:23 KST`: a recent unified-log query for `tccd`, `System Events`, Accessibility, Ghostty, and Figma did not return useful denial lines. The user TCC database still only shows Ghostty `kTCCServiceAppleEvents` records and no `kTCCServiceAccessibility` grant. `./KLIC-START.sh --check` still reports `Accessibility permission: no grants found in user TCC database`.

Previous runtime evidence probe, `2026-07-04 02:04 KST`: a 45000 ms localhost HTTP receiver and a 45000 ms clipboard watcher were started directly with `--timeout-ms`, then FigmaAgent `/figma/desktop/open-url` opened `https://www.figma.com/design/new` and returned `{"opened":true}`. No smoke evidence POST or clipboard evidence arrived before timeout. A direct `System Events` menu-read probe against the running Figma process did not complete and was killed, which reinforces that this environment still cannot use the Figma desktop menu automation path without Accessibility permission or manual user action. `./KLIC-START.sh --open-accessibility` was run to open the macOS Accessibility settings panel for the required grant.

Previous short runtime evidence window, `2026-07-04 01:53 KST`: a 120000 ms localhost HTTP receiver and clipboard watcher were started, then the launcher helpers returned `Figma desktop: open request sent`, `FigmaAgent design file open: request sent`, and `KLIC auto menu launch skipped: Accessibility permission not detected.` No smoke evidence POST or clipboard evidence arrived before timeout. No receiver or watcher process remained afterward.

Latest runtime attempt, `2026-07-04 01:30 KST`: `./KLIC-START.sh --runtime-acceptance` opened Figma Desktop, started the localhost HTTP receiver and clipboard watcher, and then timed out after 600000 ms with `Timed out waiting for Figma smoke evidence POST after 600000 ms.` The launcher reported `KLIC auto menu launch skipped: Accessibility permission not detected.` No receiver or watcher process remained afterward.

Latest FigmaAgent URL attempt, `2026-07-04 01:38 KST`: a 90000 ms localhost HTTP receiver was started, then FigmaAgent accepted all tested new-design URLs with `{"opened":true}`:

- `https://www.figma.com/design/new?try-plugin-name=KLIC%20Figma%20Toolkit`
- `https://www.figma.com/design/new?try-plugin-id=com.klic.figma-toolkit&try-plugin-name=KLIC%20Figma%20Toolkit`
- `https://www.figma.com/design/new?try-plugin-id=1&try-plugin-name=KLIC%20Figma%20Toolkit`

No smoke evidence POST arrived before receiver timeout. This confirms that FigmaAgent can open the editor URL but does not launch the local development plugin or its `Run Runtime Smoke Evidence` command.

Latest `try-plugin-params` attempt, `2026-07-04 01:46 KST`: a 60000 ms localhost HTTP receiver was started, then FigmaAgent accepted tested URLs with `try-plugin-params` values for the manifest command `run-smoke-evidence`:

- `try-plugin-id=1&try-plugin-params={"command":"run-smoke-evidence"}`
- `try-plugin-id=1&try-plugin-params=run-smoke-evidence`
- `try-plugin-id=com.klic.figma-toolkit&try-plugin-params={"command":"run-smoke-evidence"}`

All returned `{"opened":true}`, but no smoke evidence POST arrived before receiver timeout. This rules out the known `try-plugin-*` URL parameters as a reliable external launch path for the local development plugin in this environment.

## Final Acceptance Steps

1. Start the localhost receiver, then open the plugin in Figma desktop:

```bash
./KLIC-START.sh --check
./KLIC-START.sh --open-accessibility
./KLIC-START.sh --wait-accessibility-runtime
./KLIC-START.sh --runtime-acceptance
```

2. The launcher opens Figma Desktop after the HTTP receiver and clipboard watcher start, then tries to open a new design file through FigmaAgent.
3. If Accessibility is granted, the launcher tries `Plugins > Development > Run Runtime Smoke Evidence` automatically.
4. If `--check` reports missing Accessibility permission, allow the terminal app in macOS Accessibility settings and restart the terminal, or run the plugin manually.
5. If FigmaAgent did not open a design file, open any Figma design file manually. Then run `Plugins > Development > KLIC Figma Toolkit` or `Run Runtime Smoke Evidence`.
6. If using the UI instead, in Command Center click `Run smoke test`.
7. If the HTTP receiver is not used, copy the smoke evidence JSON while `--runtime-acceptance` is still running, or download the JSON and run one of:

```bash
./KLIC-START.sh
./KLIC-START.sh --open-accessibility
./KLIC-START.sh --runtime-acceptance
./KLIC-START.sh --watch-http
./KLIC-START.sh --capture-clipboard
./KLIC-START.sh --audit path/to/figma-smoke-evidence.json
./klic-figma-toolkit/watch-runtime-http.sh
./klic-figma-toolkit/capture-runtime-evidence.sh
node klic-figma-toolkit/run-completion-audit.mjs --runtime-evidence path/to/figma-smoke-evidence.json
```

Acceptance is complete only when `actual-figma-runtime-smoke-evidence` is `PASS`.
