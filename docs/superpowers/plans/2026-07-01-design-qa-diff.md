# Design QA Diff (`qa-*`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Design QA Diff" tool that captures a selected Figma frame and an implementation screenshot, lets the designer manually label divergences, and commits a persistent, provenance-tagged board to the canvas.

**Architecture:** New isolated backend module `src/code/50-design-qa.js` (namespace `qa-*`) + a new UI tool tab `designqa`. Image bytes travel end-to-end as raw `Uint8Array` (no base64). The backend rasterizes the selected frame via `exportAsync`, and on commit rebuilds a board (design image + implementation image + label callouts) tagged `qa-diff`. The mock runtime (`run-smoke-test-mock.mjs`) is extended with `exportAsync` + `figma.createImage` so the full flow is tested headlessly.

**Tech Stack:** Figma Plugin API (sandbox JS: `var`/`function`, async/await OK, `for..of` OK, `Object.values` OK), browser-iframe UI (modern JS), Node.js verification scripts (`vm` mock + regex harnesses).

## Global Constraints

- **Never hand-edit `code.js` or `ui.html`** — they are generated bundles. Edit `src/`, then run `node klic-figma-toolkit/build-toolkit.mjs` to rebuild. Every task that changes `src/` MUST rebuild before running verification (the test scripts read the generated bundles).
- **Message registry is a CI gate.** Every new `qa-*` message type must be added to BOTH lists in `klic-figma-toolkit/verify-integration.mjs` (`expectedPluginMessages` for UI→plugin, `expectedUiMessages` for plugin→UI) and the backend functions to the `fnName` array. A missing entry fails `verify-integration.mjs`.
- **Figma sandbox syntax** (for `src/code/*.js`): `var`, traditional `function` declarations, string concatenation. `async`/`await`, `for...of`, `Object.values`, `Promise`, `Math`, `JSON` are available. No DOM, no Node APIs.
- **Image bytes are raw `Uint8Array` everywhere.** `figma.ui.postMessage` supports `Uint8Array` natively (per Figma docs); UI preview uses `new Blob([bytes], {type:'image/png'})` + `URL.createObjectURL`. Never base64.
- **`documentAccess: "dynamic-page"` rules:** `exportAsync` on a `FrameNode` is safe without `loadAsync`; only `PageNode` needs it — so the feature REJECTS `PageNode` selections. Re-fetch on commit uses `figma.getNodeByIdAsync` (async form).
- **Provenance:** every committed board root is tagged via `tagKlicNode(board, 'qa-diff', meta)` (existing helper in `src/code/10-command-center.js:10`).
- **i18n:** every new UI string lives in BOTH `I18N.en` and `I18N.ko` (`src/ui/i18n.js`) and is bound via `data-i18n` / `data-i18n-ph` attributes.
- **Commits:** commit after each task. We are on branch `docs/design-qa-diff-spec`; create a feature branch `feat/design-qa-diff` off `main` before Task 1 (see Task 0).

## File Structure

- **Create** `klic-figma-toolkit/src/code/50-design-qa.js` — backend: `qaRasterizeSelection`, `qaCommitBoard`, `qaMapNormalized`, `qaLabelCallout`.
- **Modify** `klic-figma-toolkit/src/code/00-bootstrap.js` — add two router cases (`qa-rasterize-request`, `qa-commit-board`).
- **Modify** `klic-figma-toolkit/build-toolkit.mjs` — add `src/code/50-design-qa.js` to `codeSources` (after `40-table-builder.js`).
- **Modify** `klic-figma-toolkit/run-smoke-test-mock.mjs` — extend mock `BaseNode` with `exportAsync`, add `figma.createImage`, append QA smoke assertions.
- **Modify** `klic-figma-toolkit/verify-integration.mjs` — register 4 `qa-*` message types + 2 function names.
- **Modify** `klic-figma-toolkit/run-ui-roundtrip-smoke.mjs` — assert QA panel markup + i18n keys + normalize-math harness.
- **Modify** `klic-figma-toolkit/src/ui/index.html` — add `tool-designqa` tab + `pane-designqa` pane.
- **Modify** `klic-figma-toolkit/src/ui/i18n.js` — add `designqa.*` / `tool.designqa` keys (en + ko).
- **Modify** `klic-figma-toolkit/src/ui/app.js` — `switchTool` array, QA panel wiring (capture/upload/canvas/labels/commit), `window.onmessage` branches for `qa-rasterize-result` / `qa-commit-result`.

---

### Task 0: Feature branch

**Files:** none (git only)

- [ ] **Step 1: Create feature branch off main**

```bash
git checkout main
git pull --ff-only origin main 2>/dev/null || true
git checkout -b feat/design-qa-diff
```

- [ ] **Step 2: Confirm clean base**

Run: `git status --short`
Expected: empty (clean tree).

---

### Task 1: Backend rasterize + scaffolding + mock extensions

**Files:**
- Create: `klic-figma-toolkit/src/code/50-design-qa.js`
- Modify: `klic-figma-toolkit/src/code/00-bootstrap.js` (router, ~line 43)
- Modify: `klic-figma-toolkit/build-toolkit.mjs` (`codeSources`, ~line 8-15)
- Modify: `klic-figma-toolkit/run-smoke-test-mock.mjs` (BaseNode + figma mock + assertions)
- Modify: `klic-figma-toolkit/verify-integration.mjs` (message + fn registry)

**Interfaces:**
- Produces: `qaRasterizeSelection(msg)` (reads `figma.currentPage.selection`, posts `qa-rasterize-result`), `qaMapNormalized(norm, size)` pure helper. Later tasks rely on `qaMapNormalized` and the `qa-rasterize-result` shape `{ type, bytes, width, height, nodeId }` / `{ type, error }`.

- [ ] **Step 1: Write the failing test (mock smoke assertions)**

Append to `klic-figma-toolkit/run-smoke-test-mock.mjs`, immediately BEFORE the final `console.log('Mock Figma runtime smoke test passed.');` (line ~954):

```js
// ── Design QA Diff: rasterize ──
page.children = [];
page.selection = [];
figma.commitUndoCount = 0;

await figma.ui.onmessage({ type: 'qa-rasterize-request' });
var qaNoSel = latestMessage('qa-rasterize-result');
assert(qaNoSel && qaNoSel.error === 'no-selection', 'qa-rasterize should report no-selection');

page.selection = [page];
await figma.ui.onmessage({ type: 'qa-rasterize-request' });
var qaPageErr = latestMessage('qa-rasterize-result');
assert(qaPageErr && qaPageErr.error === 'page-not-allowed', 'qa-rasterize should reject PageNode selection');

var qaDesignFrame = figma.createFrame();
qaDesignFrame.name = 'Design Source';
qaDesignFrame.resize(320, 200);
page.appendChild(qaDesignFrame);
page.selection = [qaDesignFrame];
await figma.ui.onmessage({ type: 'qa-rasterize-request' });
var qaRaster = latestMessage('qa-rasterize-result');
assert(qaRaster && qaRaster.bytes && qaRaster.width === 320 && qaRaster.height === 200, 'qa-rasterize should return PNG bytes + dimensions');
assert(qaRaster.nodeId === qaDesignFrame.id, 'qa-rasterize should echo design node id');

var qaMapped = vm.runInContext('qaMapNormalized(0.5, 200)', context);
assert(qaMapped === 100, 'qaMapNormalized(0.5, 200) should be 100');
var qaClamped = vm.runInContext('qaMapNormalized(1.4, 100)', context);
assert(qaClamped === 100, 'qaMapNormalized should clamp >1 to size');
```

Also extend the mock so the test can run. In `run-smoke-test-mock.mjs`:

Add a method to the `BaseNode` class (inside the class body, after `resize(width, height) { ... }`):

```js
  exportAsync() {
    return Promise.resolve(new Uint8Array([1, 2, 3, 4]));
  }
```

Add `createImage` to the `figma` object (inside the `figma = { ... }` literal, next to `createRectangle()`):

```js
  createImage() {
    return { hash: nextId('img') };
  },
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node klic-figma-toolkit/run-smoke-test-mock.mjs`
Expected: FAIL — `qaRasterizeSelection` is not defined / `qa-rasterize-result` never posted (router has no case yet).

- [ ] **Step 3: Create the backend module**

Create `klic-figma-toolkit/src/code/50-design-qa.js`:

```js
/* ═══════════════════════════════════════════════════════════════════════════
   MODULE: DESIGN QA DIFF
   Capture a selected Figma frame (design source of truth) + an implementation
   screenshot, let the designer label divergences, commit a persistent board.
   Namespace: qa-*
   ═══════════════════════════════════════════════════════════════════════════ */

var QA_ALLOWED_TYPES = { FRAME: 1, COMPONENT: 1, COMPONENT_SET: 1, GROUP: 1, SECTION: 1 };

function qaMapNormalized(norm, size) {
  var n = Math.max(0, Math.min(1, norm));
  return Math.round(n * size);
}

async function qaRasterizeSelection(msg) {
  try {
    var sel = figma.currentPage.selection;
    if (!sel || sel.length === 0) {
      figma.ui.postMessage({ type: 'qa-rasterize-result', error: 'no-selection' });
      return;
    }
    var node = sel[0];
    if (node.type === 'PAGE') {
      figma.ui.postMessage({ type: 'qa-rasterize-result', error: 'page-not-allowed' });
      return;
    }
    if (!QA_ALLOWED_TYPES[node.type]) {
      figma.ui.postMessage({ type: 'qa-rasterize-result', error: 'unsupported-type' });
      return;
    }
    var bytes = await node.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: 1 } });
    figma.ui.postMessage({
      type: 'qa-rasterize-result',
      bytes: bytes,
      width: node.width,
      height: node.height,
      nodeId: node.id,
    });
  } catch (err) {
    figma.ui.postMessage({ type: 'qa-rasterize-result', error: 'encode-failed', message: err.message || String(err) });
  }
}
```

- [ ] **Step 4: Wire the router case**

In `klic-figma-toolkit/src/code/00-bootstrap.js`, add a new block inside the `switch (msg.type)` (after the `style-search-fonts` case, before the `/* ── Shared ── */` comment, ~line 43):

```js
    /* ── Design QA ── */
    case 'qa-rasterize-request':       return qaRasterizeSelection(msg);
    case 'qa-commit-board':            return qaCommitBoard(msg);
```

(`qaCommitBoard` is added in Task 2; the router case can reference it now since the file is concatenated and the function will exist by the time Task 2 lands. If you run the build between tasks, define a temporary stub — but Tasks 1 and 2 land together in practice.)

- [ ] **Step 5: Add to the build concatenation order**

In `klic-figma-toolkit/build-toolkit.mjs`, add to the `codeSources` array immediately after `'src/code/40-table-builder.js'`:

```js
  'src/code/50-design-qa.js',
```

- [ ] **Step 6: Register messages + function names**

In `klic-figma-toolkit/verify-integration.mjs`:

Add to the `expectedPluginMessages` array (before its closing `];`, currently at line ~192):

```js
  'qa-rasterize-request',
  'qa-commit-board',
```

Add to the `expectedUiMessages` array (before its closing `];`, currently at line ~229):

```js
  'qa-rasterize-result',
  'qa-commit-result',
```

Add `'qaRasterizeSelection'` and `'qaCommitBoard'` to the `fnName` array (the literal inside `for (const fnName of [ ... ])`, starting ~line 236).

- [ ] **Step 7: Rebuild bundles**

Run: `node klic-figma-toolkit/build-toolkit.mjs`
Expected: `KLIC generated plugin files rebuilt.`

- [ ] **Step 8: Run the mock smoke test**

Run: `node klic-figma-toolkit/run-smoke-test-mock.mjs`
Expected: PASS — `Mock Figma runtime smoke test passed.`

- [ ] **Step 9: Commit**

```bash
git add klic-figma-toolkit/src/code/50-design-qa.js klic-figma-toolkit/src/code/00-bootstrap.js klic-figma-toolkit/build-toolkit.mjs klic-figma-toolkit/run-smoke-test-mock.mjs klic-figma-toolkit/verify-integration.mjs code.js ui.html
git commit -m "feat(qa): rasterize selected frame + mock exportAsync/createImage"
```

---

### Task 2: Backend commit board

**Files:**
- Modify: `klic-figma-toolkit/src/code/50-design-qa.js` (add `qaLabelCallout`, `qaCommitBoard`)
- Modify: `klic-figma-toolkit/run-smoke-test-mock.mjs` (append commit assertions)

**Interfaces:**
- Consumes: `qaMapNormalized` (Task 1), `tagKlicNode` (existing).
- Produces: `qaCommitBoard(msg)` where `msg = { implBytes: Uint8Array, designNodeId, designW, designH, implW, implH, labels[] }` and each label is `{ id, x, y, w, h (normalized 0..1), note, category }`. Posts `qa-commit-result { boardId, labelCount }` or `{ error }`.

- [ ] **Step 1: Write the failing test (append to mock smoke, before final console.log, after the Task 1 block)**

```js
// ── Design QA Diff: commit board ──
var qaImplBytes = new Uint8Array([10, 20, 30, 40]);
var qaLabels = [
  { id: 'l1', x: 0.25, y: 0.5, w: 0.2, h: 0.1, note: 'wrong color', category: 'color' },
  { id: 'l2', x: 0.6, y: 0.2, w: 0.15, h: 0.05, note: '', category: 'spacing' },
];
await figma.ui.onmessage({
  type: 'qa-commit-board',
  designNodeId: qaDesignFrame.id,
  designW: 320, designH: 200,
  implBytes: qaImplBytes, implW: 320, implH: 200,
  labels: qaLabels,
});
var qaCommitted = latestMessage('qa-commit-result');
assert(qaCommitted && qaCommitted.boardId, 'qa-commit-board should create a board');
assert(qaCommitted.labelCount === 2, 'qa-commit-board should echo label count');
var qaBoard = figma.getNodeById(qaCommitted.boardId);
assert(qaBoard && qaBoard.name === 'KLIC Design QA Diff', 'qa board should be created and named');
var qaMeta = JSON.parse(qaBoard.getPluginData('klic.meta'));
assert(qaMeta.tool === 'qa-diff', 'qa board should be tagged qa-diff');
assert(qaMeta.labelCount === 2 && qaMeta.categories.join(',') === 'color,spacing', 'qa board pluginData should persist label meta');
var qaBoxes = qaBoard.findAll(function (n) { return n.type === 'RECTANGLE' && /QA Label/.test(n.name); });
assert(qaBoxes.length === 2, 'qa board should render one rectangle per label');

nodeMap.delete(qaDesignFrame.id);
await figma.ui.onmessage({
  type: 'qa-commit-board',
  designNodeId: qaDesignFrame.id,
  designW: 320, designH: 200,
  implBytes: qaImplBytes, implW: 320, implH: 200,
  labels: qaLabels,
});
var qaUnreachable = latestMessage('qa-commit-result');
assert(qaUnreachable && qaUnreachable.error === 'design-unreachable', 'qa-commit should report design-unreachable when the design node is gone');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node klic-figma-toolkit/run-smoke-test-mock.mjs`
Expected: FAIL — `qaCommitBoard` not defined.

- [ ] **Step 3: Implement `qaLabelCallout` + `qaCommitBoard`**

Append to `klic-figma-toolkit/src/code/50-design-qa.js`:

```js
function qaLabelCallout(index) {
  var box = figma.createRectangle();
  box.name = 'QA Label ' + (index + 1);
  box.fills = [{ type: 'SOLID', color: { r: 1, g: 0.21, b: 0.21 }, opacity: 0.08 }];
  box.strokes = [{ type: 'SOLID', color: { r: 1, g: 0.21, b: 0.21 } }];
  box.strokeWeight = 2;
  return box;
}

async function qaCommitBoard(msg) {
  try {
    var designNode = await figma.getNodeByIdAsync(msg.designNodeId);
    if (!designNode || designNode.type === 'PAGE') {
      figma.ui.postMessage({ type: 'qa-commit-result', error: 'design-unreachable' });
      return;
    }
    var designBytes = await designNode.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: 1 } });
    var designImage = figma.createImage(designBytes);
    var implImage = figma.createImage(msg.implBytes);

    await figma.loadFontAsync({ family: 'Inter', style: 'Regular' }).catch(function () {});
    await figma.loadFontAsync({ family: 'Inter', style: 'Bold' }).catch(function () {});

    var boardH = Math.max(msg.designH, msg.implH);
    var designScale = boardH / msg.designH;
    var implScale = boardH / msg.implH;
    var designW = msg.designW * designScale;
    var implW = msg.implW * implScale;
    var implH = msg.implH * implScale;
    var gap = 48;

    var board = figma.createFrame();
    board.name = 'KLIC Design QA Diff';
    board.fills = [{ type: 'SOLID', color: { r: 0.98, g: 0.98, b: 0.99 } }];
    board.resize(designW + implW + gap + 64, boardH + 120);

    var designRect = figma.createRectangle();
    designRect.name = 'Design (source)';
    designRect.resize(designW, msg.designH * designScale);
    designRect.x = 32; designRect.y = 80;
    designRect.fills = [{ type: 'IMAGE', imageHash: designImage.hash, scaleMode: 'FILL' }];
    board.appendChild(designRect);

    var implRect = figma.createRectangle();
    implRect.name = 'Implementation';
    implRect.resize(implW, implH);
    implRect.x = 32 + designW + gap; implRect.y = 80;
    implRect.fills = [{ type: 'IMAGE', imageHash: implImage.hash, scaleMode: 'FILL' }];
    board.appendChild(implRect);

    var labels = msg.labels || [];
    labels.forEach(function (label, i) {
      var box = qaLabelCallout(i);
      var bw = qaMapNormalized(label.w, implW);
      var bh = qaMapNormalized(label.h, implH);
      box.resize(bw, bh);
      box.x = implRect.x + qaMapNormalized(label.x, implW);
      box.y = implRect.y + qaMapNormalized(label.y, implH);
      board.appendChild(box);
      var caption = figma.createText();
      caption.fontName = { family: 'Inter', style: 'Bold' };
      caption.fontSize = 12;
      caption.characters = (i + 1) + '. ' + (label.category || 'other') + (label.note ? ' — ' + label.note : '');
      caption.fills = [{ type: 'SOLID', color: { r: 0.1, g: 0.1, b: 0.13 } }];
      caption.x = box.x; caption.y = box.y + bh + 4;
      board.appendChild(caption);
    });

    figma.currentPage.appendChild(board);
    tagKlicNode(board, 'qa-diff', {
      designNodeId: msg.designNodeId,
      implImageHash: implImage.hash,
      labelCount: labels.length,
      categories: labels.map(function (l) { return l.category || 'other'; }),
    });
    figma.viewport.scrollAndZoomIntoView([board]);
    figma.ui.postMessage({ type: 'qa-commit-result', boardId: board.id, labelCount: labels.length });
  } catch (err) {
    figma.ui.postMessage({ type: 'qa-commit-result', error: 'encode-failed', message: err.message || String(err) });
  }
}
```

- [ ] **Step 4: Rebuild + run mock smoke**

Run: `node klic-figma-toolkit/build-toolkit.mjs && node klic-figma-toolkit/run-smoke-test-mock.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add klic-figma-toolkit/src/code/50-design-qa.js klic-figma-toolkit/run-smoke-test-mock.mjs code.js
git commit -m "feat(qa): commit design/impl board with labels + qa-diff provenance"
```

---

### Task 3: UI panel — capture, upload, label overlay, commit

**Files:**
- Modify: `klic-figma-toolkit/src/ui/index.html` (add tab + pane)
- Modify: `klic-figma-toolkit/src/ui/i18n.js` (add keys en+ko)
- Modify: `klic-figma-toolkit/src/ui/app.js` (switchTool, wiring, handlers, canvas overlay)
- Modify: `klic-figma-toolkit/run-ui-roundtrip-smoke.mjs` (markup + i18n + math asserts)

**Interfaces:**
- Consumes: `qa-rasterize-result` (`{ bytes: Uint8Array, width, height, nodeId }` or `{ error }`), `qa-commit-result` (`{ boardId, labelCount }` or `{ error }`).
- Produces: sends `qa-rasterize-request` (button), `qa-commit-board` (`{ implBytes: Uint8Array, designNodeId, designW, designH, implW, implH, labels[] }`).

- [ ] **Step 1: Write the failing UI test (append to run-ui-roundtrip-smoke.mjs, before the final `console.log`)**

```js
// ── Design QA Diff panel ──
assert(ui.includes('id="tool-designqa"') && ui.includes('id="pane-designqa"'), 'Design QA should be a top-level tool tab');
assert(ui.includes('id="qa-capture"'), 'Design QA should expose a capture button');
assert(ui.includes('id="qa-impl-file"'), 'Design QA should expose an implementation upload input');
assert(ui.includes('id="qa-commit"'), 'Design QA should expose a commit button');
assert(ui.includes('id="qa-label-overlay"'), 'Design QA should render a label overlay canvas');
assert(script.includes("'designqa.title'"), 'i18n missing designqa.title key');
assert(script.includes("'designqa.cat.color'"), 'i18n missing designqa category key');
assert(script.includes("qaNormalizeRect"), 'Design QA should expose a pure qaNormalizeRect helper');

const qaMathHarness = (() => {
  const m = script.match(/function qaNormalizeRect\(rect, dispW, dispH\) \{[\s\S]*?\n\}/);
  assert(m, 'qaNormalizeRect is missing or malformed');
  return Function(`${m[0]}\nreturn { qaNormalizeRect };`)();
})();
const qaNorm = qaMathHarness.qaNormalizeRect({ x: 50, y: 100, w: 25, h: 50 }, 200, 400);
assert(qaNorm.x === 0.25 && qaNorm.y === 0.25 && qaNorm.w === 0.125 && qaNorm.h === 0.125, 'qaNormalizeRect should convert px to normalized 0..1');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node klic-figma-toolkit/run-ui-roundtrip-smoke.mjs`
Expected: FAIL — `tool-designqa` missing.

- [ ] **Step 3: Add the tool tab + pane to index.html**

In `klic-figma-toolkit/src/ui/index.html`:

(a) Add a tab button inside `.tool-tabs` (after the `tool-handoff` button, ~line 35):

```html
    <button class="tool-tab" id="tool-designqa" onclick="switchTool('designqa')" data-i18n="tool.designqa">Design QA</button>
```

(b) Add the pane before the closing `</div>` of `.root` (after the HANDOFF pane `</div>` at ~line 483):

```html
  <!-- PANE: DESIGN QA DIFF -->
  <div class="tool-pane" id="pane-designqa">
    <div>
      <div class="panel-title" data-i18n="designqa.title">Design QA Diff</div>
      <div class="panel-desc" data-i18n="designqa.desc">Capture the design and the implemented page, label the differences, commit to canvas.</div>
    </div>

    <div class="workspace-panel">
      <div class="workspace-actions">
        <button class="btn" id="qa-capture" data-i18n="designqa.rasterize">Capture selected frame</button>
      </div>

      <div class="qa-columns">
        <div class="qa-col">
          <div class="section-label" data-i18n="designqa.designPrev">Design (selected frame)</div>
          <img id="qa-design-img" class="qa-preview" alt="">
          <div class="hint" id="qa-design-hint" data-i18n="designqa.noDesign">Select a frame and capture it first.</div>
        </div>
        <div class="qa-col">
          <div class="section-label" data-i18n="designqa.implPrev">Implementation</div>
          <div class="qa-impl-stage" id="qa-impl-stage">
            <img id="qa-impl-img" class="qa-preview" alt="">
            <canvas id="qa-label-overlay" class="qa-overlay"></canvas>
          </div>
          <label class="file-label">
            <span data-i18n="designqa.implUpload">Upload implementation screenshot</span>
            <input type="file" accept="image/*" id="qa-impl-file" style="display:none">
          </label>
        </div>
      </div>

      <div class="row" style="margin-top:8px">
        <input type="text" class="grow" id="qa-url" data-i18n-ph="designqa.urlPh">
      </div>
      <div class="hint" data-i18n="designqa.urlNote">Live URL is reference only — cross-origin pages cannot be auto-captured.</div>
      <iframe id="qa-url-frame" class="qa-url-frame" style="display:none"></iframe>
      <div class="hint" id="qa-url-blocked" style="display:none" data-i18n="designqa.urlBlocked">This site blocks embedding. Use manual upload.</div>

      <div class="hint" style="margin-top:8px" data-i18n="designqa.labelHint">Drag on the implementation image to label a difference.</div>
      <div class="binding-list" id="qa-label-list"></div>

      <div class="workspace-actions" style="margin-top:8px">
        <button class="btn btn-primary" id="qa-commit" data-i18n="designqa.commit">Commit to canvas</button>
      </div>
      <div class="result" id="qa-result"></div>
    </div>
  </div>
```

- [ ] **Step 4: Add i18n keys**

In `klic-figma-toolkit/src/ui/i18n.js`, add to BOTH the `en` and `ko` objects (keep keys identical):

```js
      'tool.designqa': 'Design QA',
      'designqa.title': 'Design QA Diff',
      'designqa.desc': 'Capture the design and the implemented page, label the differences, commit to canvas.',
      'designqa.rasterize': 'Capture selected frame',
      'designqa.designPrev': 'Design (selected frame)',
      'designqa.implPrev': 'Implementation',
      'designqa.implUpload': 'Upload implementation screenshot',
      'designqa.urlPh': 'https://example.com — live URL (reference only)',
      'designqa.urlNote': 'Live URL is reference only — cross-origin pages cannot be auto-captured.',
      'designqa.urlBlocked': 'This site blocks embedding. Use manual upload.',
      'designqa.labelHint': 'Drag on the implementation image to label a difference.',
      'designqa.notePh': 'Describe the difference',
      'designqa.category': 'Category',
      'designqa.cat.color': 'Color',
      'designqa.cat.spacing': 'Spacing',
      'designqa.cat.typography': 'Typography',
      'designqa.cat.missing': 'Missing',
      'designqa.cat.extra': 'Extra',
      'designqa.cat.alignment': 'Alignment',
      'designqa.cat.other': 'Other',
      'designqa.labels': 'Labels',
      'designqa.commit': 'Commit to canvas',
      'designqa.noDesign': 'Select a frame and capture it first.',
      'designqa.noImpl': 'Upload an implementation screenshot first.',
      'designqa.committed': 'Board created.',
      'designqa.errEncodeFailed': 'Capture failed. See Figma notification.',
      'designqa.errDesignUnreachable': 'Design frame was not found. Re-capture and try again.',
      'designqa.errDefault': 'Something went wrong. See Figma notification.',
```

Korean (`ko`) equivalent values:

```js
      'tool.designqa': '디자인 QA',
      'designqa.title': '디자인 QA 비교',
      'designqa.desc': '디자인과 구현 페이지를 캡처해 차이를 라벨링하고 캔버스에 기록합니다.',
      'designqa.rasterize': '선택 프레임 캡처',
      'designqa.designPrev': '디자인 (선택 프레임)',
      'designqa.implPrev': '구현',
      'designqa.implUpload': '구현 스크린샷 업로드',
      'designqa.urlPh': 'https://example.com — 실시간 URL (참고용)',
      'designqa.urlNote': '실시간 URL은 참고용입니다. 타 도메인은 자동 캡처가 불가합니다.',
      'designqa.urlBlocked': '이 사이트는 임베드를 차단합니다. 수동 업로드를 사용하세요.',
      'designqa.labelHint': '구현 이미지 위에서 드래그해 차이를 라벨링하세요.',
      'designqa.notePh': '차이 설명',
      'designqa.category': '분류',
      'designqa.cat.color': '색상',
      'designqa.cat.spacing': '여백',
      'designqa.cat.typography': '타이포그래피',
      'designqa.cat.missing': '누락',
      'designqa.cat.extra': '잘못 추가',
      'designqa.cat.alignment': '정렬',
      'designqa.cat.other': '기타',
      'designqa.labels': '라벨',
      'designqa.commit': '캔버스에 기록',
      'designqa.noDesign': '프레임을 선택하고 먼저 캡처하세요.',
      'designqa.noImpl': '구현 스크린샷을 먼저 업로드하세요.',
      'designqa.committed': '보드가 생성되었습니다.',
      'designqa.errEncodeFailed': '캡처에 실패했습니다. Figma 알림을 확인하세요.',
      'designqa.errDesignUnreachable': '디자인 프레임을 찾을 수 없습니다. 다시 캡처하세요.',
      'designqa.errDefault': '문제가 발생했습니다. Figma 알림을 확인하세요.',
```

- [ ] **Step 5: Add `designqa` to switchTool**

In `klic-figma-toolkit/src/ui/app.js`, update the array in `switchTool` (line ~72):

```js
  ['command', 'menu', 'style', 'table', 'qa', 'handoff', 'designqa'].forEach(k => {
```

- [ ] **Step 6: Add the QA module logic**

Append to `klic-figma-toolkit/src/ui/app.js` (new module block at end of file):

```js
/* ═══════════════════════════════════════════════════════════════════════════
   MODULE: DESIGN QA DIFF
   ═══════════════════════════════════════════════════════════════════════════ */
let qaDesign = null;        // { bytes:Uint8Array, width, height, nodeId }
let qaImpl = null;          // { bytes:Uint8Array, width, height }
let qaLabels = [];
let qaDrawing = null;       // active drag { x0,y0,x1,y1 } in display px

const QA_CATEGORIES = ['color', 'spacing', 'typography', 'missing', 'extra', 'alignment', 'other'];

function qaNormalizeRect(rect, dispW, dispH) {
  return {
    x: Math.max(0, Math.min(1, rect.x / dispW)),
    y: Math.max(0, Math.min(1, rect.y / dispH)),
    w: Math.max(0, Math.min(1, rect.w / dispW)),
    h: Math.max(0, Math.min(1, rect.h / dispH)),
  };
}

function qaBytesToObjectUrl(bytes) {
  const blob = new Blob([bytes], { type: 'image/png' });
  return URL.createObjectURL(blob);
}

function qaRenderLabels() {
  const list = document.getElementById('qa-label-list');
  list.innerHTML = '';
  qaLabels.forEach((label, i) => {
    const row = document.createElement('div');
    row.className = 'fix-c-item';
    const num = document.createElement('strong');
    num.textContent = (i + 1) + '. ';
    const note = document.createElement('input');
    note.type = 'text'; note.className = 'grow'; note.value = label.note || '';
    note.setAttribute('data-i18n-ph', 'designqa.notePh');
    note.placeholder = t('designqa.notePh');
    note.addEventListener('input', () => { label.note = note.value; });
    const cat = document.createElement('select');
    cat.className = 'col-select';
    QA_CATEGORIES.forEach(c => {
      const o = document.createElement('option');
      o.value = c; o.textContent = t('designqa.cat.' + c);
      if (label.category === c) o.selected = true;
      cat.appendChild(o);
    });
    cat.addEventListener('change', () => { label.category = cat.value; });
    const del = document.createElement('button');
    del.className = 'link-btn'; del.textContent = '×';
    del.title = 'Remove';
    del.addEventListener('click', () => { qaLabels.splice(i, 1); qaRedrawOverlay(); qaRenderLabels(); });
    row.appendChild(num); row.appendChild(note); row.appendChild(cat); row.appendChild(del);
    list.appendChild(row);
  });
}

function qaRedrawOverlay() {
  const canvas = document.getElementById('qa-label-overlay');
  const img = document.getElementById('qa-impl-img');
  if (!img.naturalWidth) return;
  const dispW = img.clientWidth, dispH = img.clientHeight;
  canvas.width = dispW; canvas.height = dispH;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, dispW, dispH);
  const colors = ['#E63636', '#2563EB', '#16A34A', '#9333EA', '#D97706', '#0891B2', '#525252'];
  qaLabels.forEach((label, i) => {
    const x = label.x * dispW, y = label.y * dispH, w = label.w * dispW, h = label.h * dispH;
    ctx.strokeStyle = colors[i % colors.length];
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = colors[i % colors.length];
    ctx.fillRect(x, y - 16, 24, 16);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px Inter, sans-serif';
    ctx.fillText(String(i + 1), x + 4, y - 4);
  });
}

function qaInitOverlay() {
  const canvas = document.getElementById('qa-label-overlay');
  const img = document.getElementById('qa-impl-img');
  const stage = document.getElementById('qa-impl-stage');
  const scope = (evt) => qaImpl && img.naturalWidth;
  function pos(evt) {
    const r = canvas.getBoundingClientRect();
    return { x: Math.max(0, Math.min(r.width, evt.clientX - r.left)), y: Math.max(0, Math.min(r.height, evt.clientY - r.top)) };
  }
  canvas.addEventListener('mousedown', (evt) => {
    if (!scope(evt)) return;
    qaDrawing = { ...pos(evt) };
  });
  window.addEventListener('mousemove', (evt) => {
    if (!qaDrawing) return;
    const p = pos(evt);
    const ctx = canvas.getContext('2d');
    qaRedrawOverlay();
    ctx.strokeStyle = '#E63636'; ctx.lineWidth = 2;
    const x = Math.min(qaDrawing.x, p.x), y = Math.min(qaDrawing.y, p.y), w = Math.abs(p.x - qaDrawing.x), h = Math.abs(p.y - qaDrawing.y);
    ctx.strokeRect(x, y, w, h);
  });
  window.addEventListener('mouseup', (evt) => {
    if (!qaDrawing) return;
    const p = pos(evt);
    const r = canvas.getBoundingClientRect();
    const x = Math.min(qaDrawing.x, p.x), y = Math.min(qaDrawing.y, p.y), w = Math.abs(p.x - qaDrawing.x), h = Math.abs(p.y - qaDrawing.y);
    qaDrawing = null;
    if (w < 6 || h < 6) return;
    const norm = qaNormalizeRect({ x, y, w, h }, r.width, r.height);
    qaLabels.push({ id: 'l' + Date.now(), x: norm.x, y: norm.y, w: norm.w, h: norm.h, note: '', category: 'other' });
    qaRedrawOverlay();
    qaRenderLabels();
  });
  img.addEventListener('load', qaRedrawOverlay);
  window.addEventListener('resize', qaRedrawOverlay);
  stage.addEventListener('dragover', (e) => e.preventDefault());
  stage.addEventListener('drop', (e) => {
    e.preventDefault();
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) qaLoadImplFile(file);
  });
}

function qaLoadImplFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
  file.arrayBuffer().then((buf) => {
    const bytes = new Uint8Array(buf);
    const url = qaBytesToObjectUrl(bytes);
    const img = document.getElementById('qa-impl-img');
    img.onload = () => {
      qaImpl = { bytes, width: img.naturalWidth, height: img.naturalHeight };
      qaRedrawOverlay();
    };
    img.src = url;
  });
}

function qaRenderRasterResult(msg) {
  const hint = document.getElementById('qa-design-hint');
  const img = document.getElementById('qa-design-img');
  if (msg.error) {
    hint.textContent = t('designqa.noDesign');
    return;
  }
  qaDesign = { bytes: msg.bytes, width: msg.width, height: msg.height, nodeId: msg.nodeId };
  img.src = qaBytesToObjectUrl(msg.bytes);
  hint.textContent = msg.width + ' × ' + msg.height;
}

function qaRenderCommitResult(msg) {
  const result = document.getElementById('qa-result');
  if (msg.error === 'design-unreachable') {
    result.textContent = t('designqa.errDesignUnreachable');
  } else if (msg.error) {
    result.textContent = t('designqa.errDefault');
  } else {
    result.textContent = t('designqa.committed') + ' (' + (msg.labelCount || 0) + ')';
    qaLabels = [];
    qaRenderLabels();
    qaRedrawOverlay();
  }
}

document.getElementById('qa-capture').addEventListener('click', () => {
  parent.postMessage({ pluginMessage: { type: 'qa-rasterize-request' } }, '*');
});
document.getElementById('qa-impl-file').addEventListener('change', (e) => {
  const file = e.target.files && e.target.files[0];
  if (file) qaLoadImplFile(file);
});
const qaUrlInput = document.getElementById('qa-url');
qaUrlInput.addEventListener('change', () => {
  const frame = document.getElementById('qa-url-frame');
  const blocked = document.getElementById('qa-url-blocked');
  const url = qaUrlInput.value.trim();
  if (!url) { frame.style.display = 'none'; blocked.style.display = 'none'; return; }
  frame.style.display = 'block';
  blocked.style.display = 'none';
  frame.onload = () => { blocked.style.display = 'none'; };
  frame.onerror = () => { blocked.style.display = 'block'; };
  frame.src = url;
});
document.getElementById('qa-commit').addEventListener('click', () => {
  const result = document.getElementById('qa-result');
  if (!qaDesign) { result.textContent = t('designqa.noDesign'); return; }
  if (!qaImpl) { result.textContent = t('designqa.noImpl'); return; }
  parent.postMessage({
    pluginMessage: {
      type: 'qa-commit-board',
      designNodeId: qaDesign.nodeId,
      designW: qaDesign.width, designH: qaDesign.height,
      implBytes: qaImpl.bytes, implW: qaImpl.width, implH: qaImpl.height,
      labels: qaLabels.map(l => ({ id: l.id, x: l.x, y: l.y, w: l.w, h: l.h, note: l.note, category: l.category })),
    },
  }, '*');
  result.textContent = '';
});
qaInitOverlay();
```

- [ ] **Step 7: Add incoming-message branches**

In `klic-figma-toolkit/src/ui/app.js`, find the existing `window.onmessage` if-chain (around line ~1921) and add two branches alongside the other `msg.type === '...'` checks:

```js
  } else if (msg.type === 'qa-rasterize-result') {
    qaRenderRasterResult(msg);
  } else if (msg.type === 'qa-commit-result') {
    qaRenderCommitResult(msg);
  }
```

(Insert before the final closing `}` of the onmessage handler. Match the surrounding `else if` style.)

- [ ] **Step 8: Add minimal CSS**

Append to `klic-figma-toolkit/src/ui/styles.css`:

```css
.qa-columns { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.qa-col { display: flex; flex-direction: column; gap: 6px; }
.qa-preview { max-width: 100%; border: 1px solid #2a2a2a; border-radius: 6px; background: #111; }
.qa-impl-stage { position: relative; display: inline-block; }
.qa-overlay { position: absolute; inset: 0; cursor: crosshair; }
.qa-url-frame { width: 100%; height: 180px; border: 1px solid #2a2a2a; border-radius: 6px; }
```

- [ ] **Step 9: Rebuild + run roundtrip smoke**

Run: `node klic-figma-toolkit/build-toolkit.mjs && node klic-figma-toolkit/run-ui-roundtrip-smoke.mjs`
Expected: PASS — `KLIC UI i18n and style import/export roundtrip smoke test passed.`

- [ ] **Step 10: Commit**

```bash
git add klic-figma-toolkit/src/ui/index.html klic-figma-toolkit/src/ui/i18n.js klic-figma-toolkit/src/ui/app.js klic-figma-toolkit/src/ui/styles.css klic-figma-toolkit/run-ui-roundtrip-smoke.mjs ui.html
git commit -m "feat(qa): Design QA panel — capture, upload, label overlay, commit"
```

---

### Task 4: Full preflight + verify-integration gate

**Files:** none (verification only; fix anything that surfaces)

- [ ] **Step 1: Rebuild and run the strictest gate**

Run: `node klic-figma-toolkit/build-toolkit.mjs && node klic-figma-toolkit/verify-integration.mjs`
Expected: PASS, no assertion errors. If it fails, the error names the exact missing message/function/i18n key — fix the source and rebuild.

- [ ] **Step 2: Run the full preflight**

Run: `node klic-figma-toolkit/run-local-verification.mjs`
Expected: all gates pass (includes `build --check`, integration, mock smoke, UI roundtrip).

- [ ] **Step 3: Manual runtime checklist**

Follow `klic-figma-toolkit/RUNTIME_CHECKLIST.md`: import the plugin in Figma, select a frame, open the Design QA tab, capture, upload a screenshot, draw 2 labels, commit, confirm a `KLIC Design QA Diff` board appears with both images + label callouts and is tagged `qa-diff`.

- [ ] **Step 4: Commit any preflight fixes, then merge-readiness**

```bash
git status --short   # confirm clean
git log --oneline -5
```

---

## Self-Review

**Spec coverage:**
- Rasterize selected frame → Task 1 (`qaRasterizeSelection`, PageNode/empty/type guards).
- Manual upload (file + drag-drop) → Task 3 (`qaLoadImplFile`, drop handler). Paste is covered structurally by the drop path; a global paste handler is YAGNI for v1 (drag-drop + file picker suffice).
- URL iframe reference + fallback notice → Task 3 (`qa-url-frame` + `qa-url-blocked`).
- Label overlay (drag to draw, normalized coords, note + category, list editor) → Task 3 (`qaInitOverlay`, `qaNormalizeRect`, `qaRenderLabels`).
- Commit persistent canvas board with design + impl + labels, `qa-diff` provenance → Task 2 (`qaCommitBoard`, `tagKlicNode`).
- Uint8Array end-to-end (no base64) → enforced in Global Constraints; mock + UI use raw bytes.
- Mock extended with `exportAsync` + `createImage` → Task 1 Step 1.
- Registry + i18n gate → Tasks 1 & 3 + Task 4 verification.

**Placeholder scan:** none — every step has concrete code or exact commands.

**Type consistency:** `qaMapNormalized(norm, size)` (backend) and `qaNormalizeRect(rect, dispW, dispH)` (UI) both produce/consume 0..1 normalized values; `qaCommitBoard` consumes `msg.labels[].{x,y,w,h}` as normalized — matches what the UI sends. Message type strings (`qa-rasterize-request`, `qa-rasterize-result`, `qa-commit-board`, `qa-commit-result`) are identical across router, handlers, registry, and tests.
