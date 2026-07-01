# Design QA Diff (`qa-*`) — Design Spec

**Date:** 2026-07-01
**Status:** Draft, pending review
**Scope:** v1 (manual labeling, canvas-persistent)

## Problem

Designers ship a Figma frame as the source of truth; engineers implement it on a real
web page. Today there is no in-Figma workflow to capture both, mark the spots where the
implementation diverges from the design, and persist those callouts on the canvas for
the team. This feature adds that workflow to the KLIC Figma Toolkit.

## Goal

A new "Design QA" panel that lets the designer:

1. Rasterize the currently selected Figma frame (the design source of truth).
2. Bring in a screenshot of the implemented page — by manual upload (paste / drag /
   file picker). A URL iframe is supported as a live visual reference only.
3. Draw label boxes on the implementation image where it diverges, each with a short
   note and a category.
4. Commit the result to the canvas as persistent nodes: a board containing the design
   image and the implementation image with its labels, tagged with KLIC provenance.

## Non-Goals (v1)

- Automatic pixel diffing or heatmap overlays (v2).
- AI vision auto-detection of mismatches (v2).
- Automatic screenshot capture of the URL iframe — impossible cross-origin (tainted
  canvas / X-Frame-Options). The iframe is reference-only.
- Severity / priority fields on labels (YAGNI for v1).

## Decisions (from brainstorming)

| Question | Decision |
|---|---|
| Source of implementation image | Both: URL iframe (reference only) + manual upload (primary, diffable) |
| Comparison mechanism | Manual labeling (annotation tool) |
| Where labels live | Canvas nodes, persistent, provenance-tagged |
| Module placement | New isolated module `src/code/50-design-qa.js`, namespace `qa-*` |

## Adversarial Review Corrections (context7-verified against Figma Plugin API docs)

Four corrections applied after verifying assumptions against the official API docs:

1. **Uint8Array end-to-end, not base64.** `figma.ui.postMessage` documents explicit
   support for `Uint8Array` payloads, and the official "working-with-images" example
   sends raw image bytes in both directions. The original base64 design added a 33%
   payload overhead and an `atob`-in-sandbox dependency that does not exist with raw
   bytes. Dropped.
2. **PageNode selection guard.** Under `documentAccess: "dynamic-page"`,
   `exportAsync` on a `PageNode` requires a prior `loadAsync`. Rather than wrap that
   case, the feature rejects `PageNode` selections and only accepts
   Frame/Component/Group/Section-type nodes.
3. **`getNodeById` failure handling on commit.** Between rasterize and commit the user
   may deselect or switch pages. The commit handler re-fetches the design node by id
   and returns a typed error if it is no longer reachable on the current page.
4. **Export scale cap.** `exportAsync` uses `{ format: 'PNG', constraint: { type:
   'SCALE', value: 1 } }` to bound payload size on large frames.

## Architecture

New module follows the existing `00`–`40` generator pattern: a source file under
`src/code/`, a UI panel section, bidirectional `qa-*` messages, and entries in the
`verify-integration.mjs` message registry.

```
[UI: Design QA panel]                         [Backend: src/code/50-design-qa.js]

  design preview  <--- qa-rasterize-result ---  qaRasterizeSelection(msg)
  (selected frame PNG, raw bytes)               |  validate selection (not PageNode)
                                               |  exportAsync PNG @ SCALE:1
                                               |  -> Uint8Array + width/height
                                               |
  impl screenshot upload                       |
  (paste / drag / file) -> Uint8Array           |
  preview via Blob + URL.createObjectURL        |
  URL iframe (optional, reference only)         |
                                                |
  label overlay <canvas> on impl image          |
  drag to draw boxes; edit note + category      |
  labels stored as normalized 0..1 coords       |
                                                |
  [Commit to canvas] --- qa-commit-board --->   qaCommitBoard(msg)
                                                |  re-fetch design node by id (guard)
                                                |  re-exportAsync design PNG
                                                |  figma.createImage(designBytes).hash
                                                |  figma.createImage(implBytes).hash
                                                |  board frame: design | impl + labels
                                                |  labels = rectangle + labelBox() text
                                                |  tagKlicNode(board, 'qa-diff', meta)
                              <-- qa-commit-result ---  success / error
```

### Data flow — image bytes

End-to-end raw `Uint8Array`; no base64 anywhere.

- **Plugin → UI (design preview):** `exportAsync` → `Uint8Array`. Sent inside
  `qa-rasterize-result` as `{ bytes: <Uint8Array>, width, height }`. UI builds
  `new Blob([bytes], { type: 'image/png' })` → `URL.createObjectURL` → `<img>.src`.
- **UI → Plugin (impl bytes + labels):** UI reads upload via
  `FileReader.readAsArrayBuffer` → `Uint8Array`, or converts a paste/drag `Blob`
  directly via `blob.arrayBuffer()`. Sent inside `qa-commit-board` as
  `{ implBytes: <Uint8Array>, designNodeId, designW, designH, implW, implH, labels[] }`.
  Plugin passes bytes straight to `figma.createImage(implBytes)`.

Structured clone carries nested `Uint8Array` inside the message object without issue.

### Coordinate mapping

Labels must be independent of the UI display scale.

- UI tracks display size (`dispW`, `dispH`) of the rendered impl image.
- On label creation the overlay stores normalized coordinates: `x = px / dispW`,
  etc. (range 0..1).
- On commit the backend maps back to canvas units:
  `actual = norm × implNodeWidth`, where the impl image node is placed at the impl
  pixel dimensions scaled to a fixed board axis (see Layout).
- Design and impl nodes share the same vertical scale so the two are visually
  comparable on the board.

## Components

### Backend — `src/code/50-design-qa.js`

New file, concatenated after `40-table-builder.js` in the build.

- **`qaRasterizeSelection(msg)`**
  - Read `figma.currentPage.selection[0]`.
  - Validate: selection exists; type is in the allowed set
    (`FRAME`, `COMPONENT`, `COMPONENT_SET`, `GROUP`, `SECTION`). Reject `PAGE` and
    empty selection.
  - `await node.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: 1 } })`.
  - Read `node.width` / `node.height`.
  - `figma.ui.postMessage({ type: 'qa-rasterize-result', bytes, width, height })`.
    On error: `{ type: 'qa-rasterize-result', error: '<code>' }`.

- **`qaCommitBoard(msg)`**
  - Inputs: `implBytes` (Uint8Array), `designNodeId`, `designW`, `designH`,
    `implW`, `implH`, `labels[]`.
  - Re-fetch design node via the async form `figma.getNodeByIdAsync(designNodeId)`
    (under `documentAccess: "dynamic-page"` the sync `getNodeById` can reject for
    nodes not yet loaded; the codebase already prefers async wrappers for
    variable/page access — see CLAUDE.md). If it resolves to null or a node not on
    the current page → post `qa-commit-result` with `error: 'design-unreachable'`
    and abort.
  - Re-export design PNG via `exportAsync` (same SCALE:1 setting).
  - `const designImage = figma.createImage(designBytes)`.
  - `const implImage = figma.createImage(implBytes)`.
  - Build board (precedent: `createCommandReportBoard` at
    `src/code/10-command-center.js:972`):
    - `figma.createFrame()` parent, KLIC styling.
    - Left: rectangle resized to `designW × designH` (scaled), fills =
      `[{ type: 'IMAGE', imageHash: designImage.hash, scaleMode: 'FILL' }]`.
    - Right: rectangle resized to `implW × implH` (same vertical scale), fills =
      `[{ type: 'IMAGE', imageHash: implImage.hash, scaleMode: 'FILL' }]`.
    - Labels (on the impl rectangle): for each label, `figma.createRectangle()`
      placed at normalized→actual coords with a transparent fill and contrasting
      stroke, plus a text callout via the `labelBox()` helper
      (`src/code/30-style-guide.js:305`) carrying the note + category.
  - `tagKlicNode(board, 'qa-diff', { tool: 'qa-diff', version, generatedAt,
    designNodeId, implImageHash: implImage.hash, labelCount: labels.length,
    categories: labels.map(l => l.category) })`.
  - `figma.ui.postMessage({ type: 'qa-commit-result', boardId: board.id })`.

Note: `figma.createImage(uint8)` (synchronous) is used per the official
"working-with-images" example; it returns an `Image` whose `.hash` feeds an
`IMAGE`-type fill. `createImage` expects **encoded** bytes (PNG/JPG), which is exactly
what `exportAsync` and an uploaded PNG both provide — not raw RGBA.

### UI — `src/ui/index.html` + `src/ui/app.js` + `src/ui/i18n.js`

New panel section (tab) in `index.html`:

- Design preview area (`<img>` or `<canvas>`).
- Implementation upload area: `<input type="file" accept="image/*">` + drag-drop
  (`ondrop` / `ondragover`) + paste (`onpaste` handling image types). All existing
  file inputs in the codebase are text-only (`index.html:146,272,279`), so image
  handling is net-new.
- Implementation preview `<canvas>` with a label overlay `<canvas>` stacked on top.
- URL iframe toggle (`<iframe>` + load/error detection for X-Frame-Options fallback).
- Label list editor (note text + category `<select>`).
- "Commit to canvas" button.

`app.js` additions:

- Image upload handlers → `Uint8Array` (via `blob.arrayBuffer()` or
  `FileReader.readAsArrayBuffer`).
- Outbound: `parent.postMessage({ pluginMessage: { type: 'qa-rasterize-request' } }, '*')`
  and `parent.postMessage({ pluginMessage: { type: 'qa-commit-board', implBytes, ... } }, '*')`.
- Inbound: extend the `window.onmessage` chain (`app.js:1921`) with
  `qa-rasterize-result` and `qa-commit-result` handlers.
- Label overlay: mouse-drag rectangle drawing on the stacked `<canvas>`; on pointer-up,
  push `{ id, x, y, w, h, note, category }` (normalized) into the label list.
- Design preview render from received `Uint8Array` via `Blob` + object URL.

`i18n.js` additions: `qa.*` keys in both `en` and `ko` — panel title, button labels,
the seven categories (`color`, `spacing`, `typography`, `missing`, `extra`,
`alignment`, `other`), and error strings. DOM binding via `data-i18n` /
`data-i18n-ph` / `data-i18n-title`.

### Label data model

```
type Label = {
  id: string,            // unique per session
  x: number, y: number,  // normalized 0..1, top-left
  w: number, h: number,  // normalized 0..1
  note: string,          // free text
  category: 'color' | 'spacing' | 'typography'
           | 'missing' | 'extra' | 'alignment' | 'other'
}
```

### Message registry

Add to `verify-integration.mjs:202-208` (both the plugin→UI and UI→plugin lists):

- UI → plugin: `qa-rasterize-request`, `qa-commit-board`
- plugin → UI: `qa-rasterize-result`, `qa-commit-result`

### Router wiring

Add two cases to the `figma.ui.onmessage` switch in `src/code/00-bootstrap.js:9-47`
under a new `/* ── Design QA ── */` block:

```
case 'qa-rasterize-request': return qaRasterizeSelection(msg)
case 'qa-commit-board':      return qaCommitBoard(msg)
```

### Build

Add `src/code/50-design-qa.js` to the concatenation order in
`klic-figma-toolkit/build-toolkit.mjs`, immediately after `40-table-builder.js`.
`node klic-figma-toolkit/build-toolkit.mjs --check` must pass.

## Error Handling

| Case | Behavior |
|---|---|
| No selection / empty selection | `qa-rasterize-result{ error:'no-selection' }` + `figma.notify` |
| Selection is a PageNode | `qa-rasterize-result{ error:'page-not-allowed' }` + notify |
| Selection type not in allowed set | `qa-rasterize-result{ error:'unsupported-type' }` + notify |
| Upload not a decodable image | UI-side reject; never reaches plugin |
| URL iframe blocked (X-Frame-Options / CSP) | iframe load-error → show fallback notice ("use manual upload"); no auto-capture attempted |
| Commit with zero labels | Warn but allow (board with images only) |
| `getNodeById` returns null / wrong page at commit | `qa-commit-result{ error:'design-unreachable' }` + notify |
| `createImage` / `exportAsync` throws | `qa-commit-result{ error:'encode-failed' }` + notify |

## Testing

- **`run-smoke-test-mock.mjs`** — with a mock `figma`, call `qaRasterizeSelection`
  and `qaCommitBoard`; assert the board node is created, `klic.meta` tool ===
  `'qa-diff'`, and `labelCount` matches the input labels. Cover the error branches
  (`no-selection`, `page-not-allowed`, `design-unreachable`).
- **`run-ui-roundtrip-smoke.mjs`** — add the four `qa-*` messages to the round-trip.
- **`verify-integration.mjs`** — registry assertions for both message directions and
  for every new `qa.*` i18n key existing in `en` and `ko`.
- **`run-local-verification.mjs`** — full preflight (includes `build --check`) must
  pass before commit.

## Layout (board)

The committed board places the design image on the left and the implementation image
on the right, both scaled to a shared vertical height so discrepancies are visually
aligned. Labels overlay the implementation image at their mapped coordinates. The
board is tagged `qa-diff` and is selectable as a single root node for provenance
summary in the Command Center.

## Open Questions

None blocking. Potential v2 work tracked as non-goals above (pixel diff, AI vision,
severity, auto-capture).
