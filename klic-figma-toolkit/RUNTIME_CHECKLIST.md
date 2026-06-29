# KLIC Figma Toolkit Runtime Checklist

Use this checklist inside the Figma desktop app after importing `manifest.json`.

## Quick Start

On Windows, run the root launcher:

`KLIC-START.cmd`

It can run local preflight, capture copied Figma smoke evidence from the clipboard, run completion audit, watch an evidence file path, open this checklist, and install Node.js LTS with `winget`.

If you want the Command Center `Open Folder Maker` button to launch the CSV folder generator, start the local bridge first:

`folder-maker\folder-maker-bridge.cmd`

The plugin calls `http://localhost:39573/open-folder-maker`. The Folder Maker window is where users upload the CSV, choose the output folder/template file, preview, and run the existing folder creation script.

## Local Preflight

Before opening Figma, Node.js LTS must be installed because the local validators are Node scripts.

If `node` is not recognized on Windows, install Node.js LTS first:

- `winget install OpenJS.NodeJS.LTS`
- or download Node.js LTS from `https://nodejs.org/`

Then close and reopen the terminal.

Windows users can run the preflight wrapper, which prints the same install guidance if Node.js is missing:

`klic-figma-toolkit\run-local-verification.cmd`

Or run the Node script directly:

`node klic-figma-toolkit/run-local-verification.mjs`

The local preflight must pass before runtime acceptance.

Preflight verifies the manifest contract:

- `main` is `code.js` and `ui` is `ui.html`.
- `editorType` includes `figma`.
- `documentAccess` is `dynamic-page`.
- `networkAccess.allowedDomains` includes `*` so the Menu Page URL extractor can request user-entered public website URLs. The Folder Maker bridge still uses `http://localhost:39573`.
- `figma.showUI(__html__, ...)` uses the integrated `KLIC Figma Toolkit` panel.
- UI i18n and `style-guide-viewer_ver2.md` JSON export/import roundtrip pass in `run-ui-roundtrip-smoke.mjs`.
- Headless Chrome visual smoke verifies the Style Guide semantic color preview has 4 rows, 16 swatches, and no overlapping layout boxes.

## Load

1. Open Figma desktop.
2. Go to `Plugins > Development > Import plugin from manifest...`.
3. Select `klic-figma-toolkit/manifest.json`.
4. Run `KLIC Figma Toolkit`.

## Smoke Test

1. Open the `Command Center` tab.
2. Click `Run smoke test`.
3. Confirm the result says `Runtime smoke test passed`.
4. Confirm the canvas includes `KLIC Smoke Test Report`.
5. Confirm the report board lists each detailed check as `OK`, including:
   - Create local COLOR variable
   - Detect RGB exact token match
   - Apply RGB exact binding
   - Verify boundVariables.color
   - Export token data available
   - Create component node
   - Create component instance
   - Combine component variants
   - Create report board with pluginData
   - Persist smoke-test pluginData
6. Confirm the UI includes copyable smoke evidence JSON with `passed`, `passCount`, `failCount`, `nodeId`, `reportNodeId`, `variableId`, `componentSetId`, and `componentInstanceId`.
   - Confirm `runtime.kind` is `figma-plugin` and `runtime.editorType` is `figma`; mock evidence must not be used for completion.
   - Click `Download JSON` to save `figma-smoke-evidence.json`, then run:
     `klic-figma-toolkit\validate-smoke-evidence.cmd --require-figma-runtime path\to\smoke-evidence.json`
   - If downloading is blocked, click `Copy evidence JSON`.
   - If clipboard copy is blocked, click `JSON 선택`, press `Ctrl+C`, save the selected JSON to a local file, and validate that file.
   - Or run the Node script directly:
     `node klic-figma-toolkit/validate-smoke-evidence.mjs --require-figma-runtime path/to/smoke-evidence.json`
7. Confirm the UI detailed checklist shows `OK` for:
   - Create local COLOR variable
   - Create selectable test node
   - Detect RGB exact token match
   - Apply RGB exact binding
   - Verify boundVariables.color
   - Export token data available
   - Create component node
   - Create component instance
   - Combine component variants
   - Create report board with pluginData
   - Persist smoke-test pluginData

## Manual Feature Checks

1. Select any frame or shape and click `Refresh selection`.
2. Click `Preview bindings`.
3. Confirm `RGB exact` rows are checked by default.
4. Confirm `OKLCH suggested` rows are unchecked unless `Allow applying OKLCH suggestions` is enabled.
5. Click `KWCAG/KRDS audit` and confirm low-contrast text issues are reported with:
   - `KWCAG 2.2 + KRDS` standard label
   - `KWCAG 2.2 텍스트 콘텐츠의 명도 대비` rule mapping
   - foreground/background hex values
   - actual contrast ratio and required `4.5:1`
   - non-text contrast issues where icons, control boundaries, or state indicators fail `3:1`
   - interactive target-size issues where buttons, tags, tabs, toggles, or inputs are smaller than `44×44px`
6. Click `Component QA` and confirm component issues are reported for:
   - component sets with fewer than two variants
   - interactive components without `Property=Value` variant naming
   - interactive components or component sets without a `Focus`/`Focused` state variant for KWCAG/KRDS keyboard focus visibility review
   - interactive components with children but without auto layout
7. Click `Token governance` and confirm token issues are reported for:
   - duplicate color values across multiple local color variables
   - flat token names that do not use grouped path naming such as `Primary/50`
8. Click `Export tokens` and confirm CSS variables and JSON appear.
   - JSON includes `tokens`, `audit`, `audit.provenanceSummary`, and `audit.previewItems`.
   - DTCG JSON includes `$schema: https://www.designtokens.org/TR/2025.10/format/`.
   - DTCG color tokens use `$type: color` and `$value: #RRGGBB`.
   - The export summary shows health, unbound paint count, and KLIC generated node count.
9. Click `Create report` and confirm `KLIC Design System Report` appears on canvas.
10. Start `folder-maker\folder-maker-bridge.cmd`, then click `Open Folder Maker` and confirm the Folder Maker GUI opens.
11. In Folder Maker, use `Select CSV`, `Select Folder`, optional `Select File`, then `Preview` and `Create Folders` to confirm the uploaded CSV drives `Create-Folders.ps1`.
12. Generate from `Menu Page`, `Style Guide`, and `Table Builder`, then refresh Command Center and confirm KLIC node count increases.
   - Command Center generated-node summary lists tool/source provenance, including CSV source names when present.
13. In `Style Guide`, click `Export JSON`, save the file, then run:
   `klic-figma-toolkit\validate-style-token-json.cmd path\to\style-guide-viewer_ver2.tokens.json`
   Or run the Node script directly:
   `node klic-figma-toolkit/validate-style-token-json.mjs path/to/style-guide-viewer_ver2.tokens.json`
14. In `Style Guide`, click `Import JSON` with the exported file and confirm preview, `Create Variables`, `Draw Board`, and `Components` remain enabled.
15. Click `Components` and confirm component generation completes without `Component generation failed`.
    - Confirm Figma creates or reuses the `📦 Components` page.
    - Confirm the page includes Button, Input, Select, Badge, and Table component artifacts.
    - If an error appears, copy the full message because it includes the failed generation stage.

## Pass Criteria

Runtime is accepted only when the smoke test passes and no manual check blocks the core flow.

## Completion Audit

After copying the real Figma smoke evidence JSON to a local file, run:

`klic-figma-toolkit\run-completion-audit.cmd --runtime-evidence path\to\smoke-evidence.json`

Or run the Node script directly:

`node klic-figma-toolkit/run-completion-audit.mjs --runtime-evidence path/to/smoke-evidence.json`

If the evidence JSON is already on the clipboard after clicking `Copy evidence JSON` or selecting JSON and pressing `Ctrl+C`, Windows users can run:

`klic-figma-toolkit\capture-runtime-evidence.cmd`

Or run the Node script directly:

`node klic-figma-toolkit/capture-runtime-evidence.mjs`

If you want to start the helper before copying from Figma, use the clipboard watcher:

`klic-figma-toolkit\watch-runtime-clipboard.cmd`

Or run the Node script directly:

`node klic-figma-toolkit/watch-runtime-clipboard.mjs`

If you used `Download JSON`, pass the downloaded file directly to the completion audit command above.

Or start a watcher before saving the downloaded/copied JSON:

`klic-figma-toolkit\watch-runtime-evidence.cmd C:\path\to\figma-smoke-evidence.json`

Or run the Node script directly:

`node klic-figma-toolkit/watch-runtime-evidence.mjs /mnt/d/DEV/KLIC-Figma/figma-smoke-evidence.json`

The audit must pass before marking the MVP complete. Without real Figma runtime evidence, the audit intentionally fails.
