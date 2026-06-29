# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Verification Commands

All verification is Node.js, no build step needed.

```bash
# Full preflight — run before every commit
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

`code.js` runs in Figma's sandboxed JavaScript worker (no `fetch`, no `import`, no DOM, no Node.js APIs). `ui.html` runs in an iframe with a normal browser environment. They communicate exclusively via message passing:

- **Plugin → UI**: `figma.ui.postMessage({ type: '...' })` in `code.js` → `window.onmessage` handler in `ui.html`
- **UI → Plugin**: `parent.postMessage({ pluginMessage: { type: '...' } }, '*')` in `ui.html` → `figma.ui.onmessage` in `code.js`

### Message Namespacing

All message types are namespaced to avoid collisions across the four modules:

| Prefix | Direction | Module |
|--------|-----------|--------|
| `command-*` | both | Command Center |
| `menu-*` | both | Menu Page Generator |
| `style-*` | both | Style Guide Generator |
| `table-*` | both | Table Builder |

`verify-integration.mjs` maintains the canonical lists of expected plugin→UI and UI→plugin message types. Add new types there when adding new messages.

### File Overview

- `klic-figma-toolkit/code.js` (~2450 lines) — plugin backend, four modules: Command Center, Menu Page, Style Guide, Table
- `klic-figma-toolkit/ui.html` (~2410 lines) — single-file dark SPA, inline CSS + JS, no external dependencies
- `klic-figma-toolkit/manifest.json` — Figma plugin manifest (`networkAccess: ["none"]`, `documentAccess: dynamic-page`)
- `style-guide-viewer_ver2.md` — canonical KLIC design token source (Pretendard font, brand/semantic colors, spacing, radius, typography, button, input specs)
- `메뉴샘플.csv` — sample menu CSV with 4-level hierarchy and `분류` column
- `메뉴페이지생성기/`, `스타일가이드변수생성기/`, `테이블생성기/` — legacy Korean-named originals, kept as reference only; do not edit

### Figma Variables API — Critical Constraint

All calls to `figma.variables.*` must go through the three async wrapper functions in `code.js`:

```js
commandGetLocalVariableCollections()  // wraps getLocalVariableCollectionsAsync / getLocalVariableCollections
commandGetLocalVariables()            // wraps getLocalVariablesAsync / getLocalVariables
// getVariableById is also wrapped — one direct call only, inside the wrapper
```

`verify-integration.mjs` asserts that each direct API call appears exactly once in the file (inside its wrapper). Adding a second direct call will fail the integration check.

### code.js Syntax Constraint

`code.js` must remain ES5 — use `var`, traditional `function` declarations, string concatenation. No `const`/`let`, arrow functions, template literals, destructuring, or spread. Figma's plugin worker does not guarantee a modern JS environment.

### Embedded Assets in ui.html

Two files are embedded verbatim inside `ui.html` and must stay in sync:

`style-guide-viewer_ver2.md` is embedded verbatim inside `ui.html` as:

```js
const STYLE_GUIDE_VIEWER_MD = `...`;
```

When editing `style-guide-viewer_ver2.md`, update the embedded literal in `ui.html` to match. `verify-integration.mjs` asserts byte-for-byte equality. The MD is auto-loaded on plugin open via `styleLoadEmbeddedMd()`.

`메뉴샘플.csv` is embedded as `MENU_SAMPLE_CSV` in `ui.html`. `verify-integration.mjs` asserts the constant is present and that the CSV parses to exactly 14 content-category pages with correct fill-down hierarchy.

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

`ui.html` contains a single `I18N` object with `en` and `ko` dictionaries. DOM elements use `data-i18n`, `data-i18n-ph` (placeholder), `data-i18n-html`, and `data-i18n-title` attributes. Language persists via `localStorage`. Dynamic Command Center content re-renders through `commandRenderDynamicI18n`. `verify-integration.mjs` checks that every attribute key exists in both dictionaries.

## Loading the Plugin in Figma

1. Figma desktop → Plugins → Development → Import plugin from manifest
2. Select `klic-figma-toolkit/manifest.json`
3. After runtime smoke test: copy evidence JSON from UI → run `validate-smoke-evidence.mjs` on it

See `klic-figma-toolkit/RUNTIME_CHECKLIST.md` for the full manual acceptance procedure.
