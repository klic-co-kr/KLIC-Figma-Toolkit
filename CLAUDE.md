# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build — Read This First

`code.js` and `ui.html` are **generated bundles**. Both carry a `Do not edit directly` header. Never hand-edit them — edits get clobbered on the next build and `run-source-split-check.mjs` will fail.

Edit the source under `klic-figma-toolkit/src/`, then rebuild:

```bash
# Source of truth → bundle
#   src/code/*.js   → code.js   (concatenated in numeric order)
#   src/ui/index.html + styles.css + i18n.js + app.js → ui.html
node klic-figma-toolkit/build-toolkit.mjs          # rebuild bundles
node klic-figma-toolkit/build-toolkit.mjs --check  # verify bundles match src/ (CI gate)
```

`run-local-verification.mjs` runs the `--check` form via `run-source-split-check.mjs`; a stale bundle fails preflight.

## Verification Commands

All verification is Node.js.

```bash
# Full preflight — run before every commit (includes build --check)
node klic-figma-toolkit/run-local-verification.mjs

# Final completion audit — requires actual Figma runtime evidence
node klic-figma-toolkit/run-completion-audit.mjs --runtime-evidence path/to/smoke-evidence.json

# Individual gates (run-local-verification.mjs chains all of these)
node klic-figma-toolkit/verify-integration.mjs
node klic-figma-toolkit/run-ui-roundtrip-smoke.mjs
node klic-figma-toolkit/run-smoke-test-mock.mjs

# Validate exported artefacts
node klic-figma-toolkit/validate-smoke-evidence.mjs path/to/smoke-evidence.json
node klic-figma-toolkit/validate-style-token-json.mjs path/to/tokens.json
```

`verify-integration.mjs` is the strictest gate — it asserts every message type, every required function, every i18n key, and the embedded style-guide MD match. A failing assertion prints the exact requirement; fix the source before re-running.

## Architecture

### Figma Plugin Execution Model

The plugin backend (`src/code/` → `code.js`) runs in Figma's sandboxed JavaScript worker (no DOM, no Node.js APIs). The UI (`src/ui/` → `ui.html`) runs in an iframe with a normal browser environment. They communicate exclusively via message passing:

- **Plugin → UI**: `figma.ui.postMessage({ type: '...' })` in `src/code/` → `window.onmessage` handler in `src/ui/app.js`
- **UI → Plugin**: `parent.postMessage({ pluginMessage: { type: '...' } }, '*')` in `src/ui/app.js` → `figma.ui.onmessage` in `src/code/00-bootstrap.js`

### Message Namespacing

All message types are namespaced to avoid collisions across modules:

| Prefix | Direction | Module (source file) |
|--------|-----------|---------|
| `command-*` | both | Command Center (`src/code/10-command-center.js`) |
| `menu-*` | both | Menu Page Generator (`src/code/20-menu-generator.js`) |
| `style-*` | both | Style Guide Generator (`src/code/30-style-guide.js`) |
| `table-*` | both | Table Builder (`src/code/40-table-builder.js`) |

`verify-integration.mjs` maintains the canonical lists of expected plugin→UI and UI→plugin message types. Add new types there when adding new messages.

### File Overview

Source of truth — edit these:

- `src/code/00-bootstrap.js` — `figma.showUI` + message router (`figma.ui.onmessage` switch)
- `src/code/10-command-center.js` — Command Center: file scan, color binding, token export, KWCAG/KRDS audit, Component QA, token governance, smoke test
- `src/code/20-menu-generator.js` — Menu Page Generator + template discovery
- `src/code/30-style-guide.js` — Style Guide variables / board / components
- `src/code/40-table-builder.js` — Table Builder
- `src/ui/index.html` — UI skeleton with `<!-- @klic-styles -->` / `<!-- @klic-script -->` injection points
- `src/ui/styles.css`, `src/ui/i18n.js`, `src/ui/app.js` — UI styles, i18n dictionaries, app logic

Generated / do-not-edit: `code.js`, `ui.html`.

Other:

- `klic-figma-toolkit/manifest.json` — manifest (`networkAccess.allowedDomains: ["*"]` for menu URL extraction + Folder Maker localhost bridge; `documentAccess: dynamic-page`)
- `style-guide-viewer_ver2.md` — canonical KLIC design token source (Pretendard, brand/semantic colors, spacing, radius, typography, button, input)
- `메뉴샘플.csv` — sample menu CSV with 4-level hierarchy and `분류` column
- `folder-maker/` — PowerShell batch folder-creation utility + localhost bridge for the Command Center button
- `메뉴페이지생성기/`, `스타일가이드변수생성기/`, `테이블생성기/` — legacy Korean-named originals (now deleted from git; integrated into the toolkit)

### Figma Variables / Pages API — Critical Constraint

All `figma.variables.*` and page-access calls must go through the async wrapper functions in `src/code/`:

```js
commandGetLocalVariableCollections()  // wraps getLocalVariableCollectionsAsync / getLocalVariableCollections
commandGetLocalVariables()            // wraps getLocalVariablesAsync / getLocalVariables
commandGetLocalPages() / commandSetCurrentPage()  // dynamic-page-safe page access
// getVariableById is also wrapped — one direct call only, inside the wrapper
```

`verify-integration.mjs` asserts each direct API call appears exactly once (inside its wrapper). A second direct call fails the check. This exists because `documentAccess: dynamic-page` makes the sync APIs throw "not a function" in newer Figma.

### src/code/ Syntax Constraint

`src/code/` targets the Figma plugin sandbox. Follow the existing style: `var`, traditional `function` declarations, string concatenation. `async`/`await`, `for...of`, and `Object.values` are used and fine. Avoid relying on bleeding-edge syntax. `src/ui/` is a browser iframe — modern JS is fine there.

### Embedded Assets in src/ui/app.js

`style-guide-viewer_ver2.md` and `메뉴샘플.csv` are embedded verbatim in `src/ui/app.js` as `STYLE_GUIDE_VIEWER_MD` and `MENU_SAMPLE_CSV`. When editing either source file, update the embedded literal to match, then rebuild. `verify-integration.mjs` asserts byte-for-byte equality on the built `ui.html`. The MD auto-loads on plugin open via `styleLoadEmbeddedMd()`; the CSV must parse to exactly 14 content-category pages with correct fill-down hierarchy.

### Color Matching Policy

Two match tiers — never conflate them:

- **RGB exact** (`matchType: 'rgb-exact'`): apply-safe, applied by default when user clicks apply
- **OKLCH suggested** (`matchType: 'oklch-suggested'`): perceptual match with delta details exposed to designer, requires explicit `includeOklchApply: true` opt-in before applying

Semi-transparent paints (opacity < 1.0) must **never** be auto-selected for binding.

### Provenance Tagging

Every root node created by the plugin must be tagged:

```js
tagKlicNode(node, 'menu' | 'style' | 'table', metaObject)
```

This writes `pluginData('klic.meta', ...)` with `tool`, `version`, `generatedAt` plus tool-specific fields (`sourceName`/`selectedCategories`/`rowCount` for menu; `styleMdHash`/`fontFamily` for style; `tableConfig` for table). The Command Center reads this data for provenance summaries.

### i18n

`src/ui/i18n.js` holds a single `I18N` object with `en` and `ko` dictionaries. DOM elements use `data-i18n`, `data-i18n-ph` (placeholder), `data-i18n-html`, and `data-i18n-title` attributes. Language persists via `localStorage` (through a `safeStorage` wrapper). Dynamic Command Center content re-renders through `commandRenderDynamicI18n`. `verify-integration.mjs` checks that every attribute key exists in both dictionaries.

## Loading the Plugin in Figma

1. Figma desktop → Plugins → Development → Import plugin from manifest
2. Select `klic-figma-toolkit/manifest.json`
3. After runtime smoke test: copy evidence JSON from UI → run `validate-smoke-evidence.mjs` on it

See `klic-figma-toolkit/RUNTIME_CHECKLIST.md` for the full manual acceptance procedure.
