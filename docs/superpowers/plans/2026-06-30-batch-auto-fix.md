# Batch Auto-Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Command Center 감사가 탐지한 디자인 시스템 이슈를 통합 Fix 큐로 수리한다 (detect → fix).

**Architecture:** 각 감사 함수가 fixable issue에 `fix` 디스크립터를 부착하고, 신규 `src/code/15-fix-engine.js`의 provider 레지스트리가 이를 수집·프리뷰·적용한다. 안전 등급 A+B는 일괄 적용 후 `figma.commitUndo()` 1회, C는 항목별 적용 후 항목당 `commitUndo()`.

**Tech Stack:** Figma Plugin API (ES5 스타일 sandbox JS), vanilla JS UI iframe, Node.js `vm` 기반 mock 테스트.

## Global Constraints

- `code.js`·`ui.html`은 **생성 번들 — 직접 수정 금지.** `src/`를 고치고 `node klic-figma-toolkit/build-toolkit.mjs`로 재빌드. `run-source-split-check.mjs`가 동기화 강제.
- `src/code/`는 Figma 샌드박스 스타일: `var`, 일반 `function` 선언, 문자열 결합. `async`/`await`·`for...of`·`Object.values` 허용.
- Figma 변수·페이지·노드 조회는 기존 비동기 래퍼(`commandGetNodeById`·`commandGetVariableById`·`commandGetLocalVariables` 등)만 사용. 직접 `figma.variables.*` 호출은 래퍼당 1회로 제한 (verify-integration 강제).
- paint 바인딩은 불변 배열 패턴 필수: `var copy = paints.slice(); copy[i] = figma.variables.setBoundVariableForPaint(copy[i], 'color', variable); node[prop] = copy;` (구버전 폴백 포함, 기존 `commandApplySingleColorBinding` 참조).
- **모든 적용 경로 끝에서 `figma.commitUndo()` 호출 필수.** 누락 시 사용자가 Ctrl+Z로 수리를 되돌릴 수 없음 (Figma는 기본적으로 플러그인 변경을 undo 히스토리에 넣지 않음).
- 안전 등급: **A+B 일괄, C 항목별.** AB 일괄 경로는 C·C제안 provider를 절대 포함 금지.
- 신규 UI 문자열은 EN/KO i18n 양쪽 등록 (verify-integration 강제).
- v1 범위 외: `addFocusState`(variant 삽입 spike 미해결 — Task 5 노트 참조), 명시적 revert 버튼, A+B+C 전체 일괄.

---

## File Structure

| 파일 | 책임 | 작업 |
|---|---|---|
| `src/code/15-fix-engine.js` | provider 레지스트리, 수집/프리뷰/적용, AB 안전 가드, commitUndo | 생성 |
| `src/code/00-bootstrap.js` | 라우터에 신규 메시지 case 추가 | 수정 |
| `src/code/10-command-center.js` | 감사 함수에 fix 디스크립터 부착, bindRawColor provider 등록 | 수정 |
| `klic-figma-toolkit/build-toolkit.mjs` | codeSources에 `15-fix-engine.js` 삽입 | 수정 |
| `src/ui/app.js` | Fix 섹션: 프리뷰 렌더, AB 일괄/ C 개별 트리거 | 수정 |
| `src/ui/index.html` | Fix 섹션 DOM | 수정 |
| `src/ui/styles.css` | Fix 섹션 스타일 | 수정 |
| `src/ui/i18n.js` | Fix 관련 EN/KO 키 | 수정 |
| `run-smoke-test-mock.mjs` | figma mock에 `commitUndo`·`Variable.remove` 추가, provider 회귀 | 수정 |
| `verify-integration.mjs` | 신규 메시지·함수·i18n 키 계약 | 수정 |

---

## Task 1: Fix 엔진 스켈레톤 + 레지스트리 + commitUndo 배선

**Files:**
- Create: `klic-figma-toolkit/src/code/15-fix-engine.js`
- Modify: `klic-figma-toolkit/build-toolkit.mjs:8-14` (codeSources 배열)
- Modify: `klic-figma-toolkit/src/code/00-bootstrap.js:20` (라우터 case 추가)
- Modify: `klic-figma-toolkit/run-smoke-test-mock.mjs` (figma mock에 `commitUndo`, 회귀 블록)

**Interfaces:**
- Produces:
  - `commandRegisterFixProvider(id, tier, applyFn)` — provider 등록. `applyFn(payload)` 는 async, boolean 반환(적용 성공 여부)
  - `commandCollectFixes(msg)` — 스캔+감사 실행, `command-fixes-preview` 포스트. (Task 2+에서 디스크립터 수집 채움; Task 1은 빈 큐)
  - `commandApplyFixes(msg)` — `msg.tier === 'AB'` 또는 `msg.ids` 처리, 적용 후 `figma.commitUndo()`, `command-fixes-applied` 포스트
  - 전역 `commandFixQueue` (배열, 수집된 디스크립터 보관)

- [ ] **Step 1: figma mock에 commitUndo 추가 (테스트 전제)**

`run-smoke-test-mock.mjs`의 `figma` 객체에 카운터와 메서드 추가. `showUI() {},` 줄 바로 뒤에 삽입:

```javascript
  commitUndoCount: 0,
  commitUndo() {
    this.commitUndoCount++;
  },
```

- [ ] **Step 2: 실패하는 테스트 작성**

`run-smoke-test-mock.mjs`의 마지막 `console.log('Mock Figma runtime smoke test passed.');` **직전**에 추가:

```javascript
// ── Batch Auto-Fix: engine skeleton ──
figma.commitUndoCount = 0;
await figma.ui.onmessage({ type: 'command-collect-fixes', scope: 'page', options: { scanLimit: 500 } });
const fixesPreview = latestMessage('command-fixes-preview');
assert(fixesPreview, 'command-collect-fixes did not post command-fixes-preview');
assert(typeof fixesPreview.counts === 'object', 'fixes preview should include counts object');

await figma.ui.onmessage({ type: 'command-apply-fixes', tier: 'AB' });
const fixesApplied = latestMessage('command-fixes-applied');
assert(fixesApplied, 'command-apply-fixes did not post command-fixes-applied');
assert(figma.commitUndoCount >= 1, 'apply-fixes must call figma.commitUndo so users can undo fixes');
```

- [ ] **Step 3: 테스트 실행 — 실패 확인**

```bash
node klic-figma-toolkit/build-toolkit.mjs && node klic-figma-toolkit/run-smoke-test-mock.mjs
```
Expected: FAIL — `command-collect-fixes did not post command-fixes-preview` (핸들러 없음).

- [ ] **Step 4: 엔진 파일 생성**

`src/code/15-fix-engine.js`:

```javascript
/* ═══════════════════════════════════════════════════════════════════════════
   MODULE: FIX ENGINE
   감사가 부착한 fix 디스크립터를 수집·프리뷰·적용한다.
   안전 등급 A+B 일괄, C 항목별. 적용 후 figma.commitUndo() 필수.
   ═══════════════════════════════════════════════════════════════════════════ */

var commandFixProviders = {};
var commandFixQueue = [];

function commandRegisterFixProvider(id, tier, applyFn) {
  commandFixProviders[id] = { tier: tier, apply: applyFn };
}

function commandFixCounts(queue) {
  var counts = { A: 0, B: 0, C: 0, suggestion: 0 };
  for (var i = 0; i < queue.length; i++) {
    var tier = queue[i].tier;
    if (tier === 'C-suggest') counts.suggestion++;
    else if (counts[tier] !== undefined) counts[tier]++;
  }
  return counts;
}

async function commandCollectFixes(msg) {
  try {
    commandFixQueue = [];
    var snapshot = await collectCommandSnapshot(msg.scope || 'selection', msg.options || {});
    commandGatherFixDescriptors(snapshot, commandFixQueue);
    figma.ui.postMessage({
      type: 'command-fixes-preview',
      counts: commandFixCounts(commandFixQueue),
      items: commandFixQueue.map(function (item) {
        return { id: item.id, providerId: item.providerId, tier: item.tier, label: item.label, preview: item.preview };
      }),
    });
  } catch (err) {
    figma.ui.postMessage({ type: 'command-error', message: err.message || String(err) });
  }
}

// Task 2+ 에서 감사별 디스크립터 수집을 채운다. Task 1 은 no-op.
function commandGatherFixDescriptors(snapshot, queue) {
  return queue;
}

async function commandApplyFixes(msg) {
  var applied = 0;
  var skipped = 0;
  try {
    var targets = [];
    if (msg.tier === 'AB') {
      targets = commandFixQueue.filter(function (item) { return item.tier === 'A' || item.tier === 'B'; });
    } else if (msg.ids && msg.ids.length) {
      var idSet = {};
      for (var k = 0; k < msg.ids.length; k++) idSet[msg.ids[k]] = true;
      targets = commandFixQueue.filter(function (item) { return idSet[item.id]; });
    }
    for (var i = 0; i < targets.length; i++) {
      var item = targets[i];
      var provider = commandFixProviders[item.providerId];
      if (!provider) { skipped++; continue; }
      var ok = await provider.apply(item.payload);
      if (ok) applied++; else skipped++;
    }
    figma.commitUndo();
    figma.ui.postMessage({ type: 'command-fixes-applied', applied: applied, skipped: skipped, tier: msg.tier || 'items' });
  } catch (err) {
    figma.ui.postMessage({ type: 'command-error', message: err.message || String(err) });
  }
}
```

- [ ] **Step 5: 빌드 배선 — codeSources에 삽입**

`build-toolkit.mjs`의 `codeSources` 배열을 수정:

```javascript
const codeSources = [
  'src/code/00-bootstrap.js',
  'src/code/10-command-center.js',
  'src/code/15-fix-engine.js',
  'src/code/20-menu-generator.js',
  'src/code/30-style-guide.js',
  'src/code/40-table-builder.js',
];
```

- [ ] **Step 6: 라우터에 case 추가**

`src/code/00-bootstrap.js`의 `case 'command-create-report-board':` 줄 **뒤에** 추가:

```javascript
    case 'command-collect-fixes':          return commandCollectFixes(msg);
    case 'command-apply-fixes':            return commandApplyFixes(msg);
```

- [ ] **Step 7: 재빌드 + 테스트 통과 확인**

```bash
node klic-figma-toolkit/build-toolkit.mjs && node klic-figma-toolkit/run-smoke-test-mock.mjs
```
Expected: PASS — `Mock Figma runtime smoke test passed.`

- [ ] **Step 8: 커밋**

```bash
git add klic-figma-toolkit/src/code/15-fix-engine.js klic-figma-toolkit/build-toolkit.mjs klic-figma-toolkit/src/code/00-bootstrap.js klic-figma-toolkit/code.js klic-figma-toolkit/run-smoke-test-mock.mjs
git commit -m "feat: fix 엔진 스켈레톤 + 레지스트리 + commitUndo 배선"
```

---

## Task 2: bindRawColor provider (Tier A)

**Files:**
- Modify: `klic-figma-toolkit/src/code/15-fix-engine.js` (provider 등록)
- Modify: `klic-figma-toolkit/src/code/10-command-center.js` (paint 분석 결과에 fix 디스크립터 부착)
- Modify: `klic-figma-toolkit/run-smoke-test-mock.mjs` (bindRawColor 회귀)

**Interfaces:**
- Consumes: `commandRegisterFixProvider`, `commandApplySingleColorBinding(change)` (기존, `10-command-center.js`)
- Produces: 디스크립터 `{ id, providerId:'bindRawColor', tier:'A', label, preview, payload:{nodeId, property, paintIndex, variableId, matchType} }`

기존 paint 분석은 `command-snapshot`의 `previewItems`에 `{nodeId, property, paintIndex, variableId, matchType:'rgb-exact'|'oklch-suggested', ...}` 형태 항목을 만든다. `bindRawColor`는 `matchType==='rgb-exact'` 항목만 Tier A로 부착한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`run-smoke-test-mock.mjs`의 Task 1 테스트 블록 뒤에 추가. 먼저 원시 색상 노드 + 일치 변수 셋업이 필요하다. 기존 스모크 테스트가 만든 변수/노드를 활용하되, 명시적으로 raw 사각형을 만든다:

```javascript
// ── Batch Auto-Fix: bindRawColor (Tier A) ──
const fixVar = figma.variables.createVariable('Fix/Primary', collections[0], 'COLOR');
fixVar.valuesByMode[collections[0].defaultModeId] = { r: 0.2, g: 0.4, b: 0.8 };
const rawRect = figma.createRectangle();
rawRect.name = 'Raw Fill Rect';
rawRect.fills = [{ type: 'SOLID', color: { r: 0.2, g: 0.4, b: 0.8 }, opacity: 1 }];
page.appendChild(rawRect);
page.selection = [rawRect];

await figma.ui.onmessage({ type: 'command-collect-fixes', scope: 'selection', options: { scanLimit: 100 } });
const bindPreview = latestMessage('command-fixes-preview');
assert(bindPreview.counts.A >= 1, 'bindRawColor should contribute a Tier A fix for an exact-match raw color');
const bindItem = bindPreview.items.find((it) => it.providerId === 'bindRawColor');
assert(bindItem, 'preview should include a bindRawColor item');

await figma.ui.onmessage({ type: 'command-apply-fixes', tier: 'AB' });
assert(rawRect.fills[0].boundVariables && rawRect.fills[0].boundVariables.color, 'bindRawColor should bind the matching variable to the paint');
```

> `collections`·`variables`·`page` 는 기존 mock 셋업의 전역. `valuesByMode`/`defaultModeId` 는 mock `Variable`/`VariableCollection` 클래스 필드 — 기존 테스트에서 이미 사용 중.

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
node klic-figma-toolkit/build-toolkit.mjs && node klic-figma-toolkit/run-smoke-test-mock.mjs
```
Expected: FAIL — `bindRawColor should contribute a Tier A fix`.

- [ ] **Step 3: provider 등록 (15-fix-engine.js 끝에 추가)**

```javascript
/* ── Provider: bindRawColor (Tier A) ── */
commandRegisterFixProvider('bindRawColor', 'A', async function (payload) {
  return await commandApplySingleColorBinding(payload);
});
```

- [ ] **Step 4: 디스크립터 수집 구현 (15-fix-engine.js `commandGatherFixDescriptors` 교체)**

`collectCommandSnapshot`의 반환에는 색상 매칭 프리뷰 항목이 들어있다 (`snapshot.previewItems` — 기존 export/preview 경로가 사용하는 동일 구조). rgb-exact 항목을 bindRawColor 디스크립터로 변환:

```javascript
var commandFixIdSeq = 0;
function commandNextFixId() {
  commandFixIdSeq++;
  return 'fix-' + commandFixIdSeq;
}

function commandGatherFixDescriptors(snapshot, queue) {
  var previewItems = (snapshot && snapshot.previewItems) || [];
  for (var i = 0; i < previewItems.length; i++) {
    var item = previewItems[i];
    if (item.matchType === 'rgb-exact' && item.variableId && item.nodeId) {
      queue.push({
        id: commandNextFixId(),
        providerId: 'bindRawColor',
        tier: 'A',
        label: 'Bind ' + (item.nodeName || item.nodeId) + ' → ' + (item.variableName || item.variableId),
        preview: { before: item.hex || 'raw color', after: item.variableName || 'variable' },
        payload: {
          nodeId: item.nodeId,
          property: item.property,
          paintIndex: item.paintIndex,
          variableId: item.variableId,
          matchType: 'rgb-exact',
        },
      });
    }
  }
  return queue;
}
```

> **검증 필요**: `collectCommandSnapshot` 반환 객체의 색상 매칭 항목 필드명을 `10-command-center.js`에서 확인하라 (`previewItems` 또는 유사). 필드명이 다르면 위 매핑을 실제 필드명에 맞춰 수정. `commandApplySingleColorBinding`의 payload 시그니처(`nodeId, property, paintIndex, variableId`)와 일치시킬 것.

- [ ] **Step 5: 재빌드 + 테스트 통과 확인**

```bash
node klic-figma-toolkit/build-toolkit.mjs && node klic-figma-toolkit/run-smoke-test-mock.mjs
```
Expected: PASS.

- [ ] **Step 6: 커밋**

```bash
git add klic-figma-toolkit/src/code/15-fix-engine.js klic-figma-toolkit/code.js klic-figma-toolkit/run-smoke-test-mock.mjs
git commit -m "feat: bindRawColor fix provider (Tier A) — 원시 색상 일괄 토큰 바인딩"
```

---

## Task 3: trimNodeName + renameDefaultName providers (Tier A/B 명명)

**Files:**
- Modify: `klic-figma-toolkit/src/code/15-fix-engine.js`
- Modify: `klic-figma-toolkit/run-smoke-test-mock.mjs`

**Interfaces:**
- Consumes: `commandGetNodeById` (기존)
- Produces: providers `trimNodeName`(A), `renameDefaultName`(B); 디스크립터 payload `{ nodeId, nextName }`

명명 수리는 `node.name` setter만 사용. 기본명 판별: `/^(Frame|Rectangle|Ellipse|Group|Vector|Line|Text|Component) \d+$/`. trim: 앞뒤 공백 + 연속 공백 1칸.

- [ ] **Step 1: 실패하는 테스트 작성**

`run-smoke-test-mock.mjs`의 Task 2 블록 뒤에 추가:

```javascript
// ── Batch Auto-Fix: name normalization (Tier A/B) ──
const trimNode = figma.createFrame();
trimNode.name = '  Spaced   Name  ';
page.appendChild(trimNode);
const defaultNode = figma.createRectangle();
defaultNode.name = 'Rectangle 5';
page.appendChild(defaultNode);
page.selection = [trimNode, defaultNode];

await figma.ui.onmessage({ type: 'command-collect-fixes', scope: 'selection', options: { scanLimit: 100 } });
const namePreview = latestMessage('command-fixes-preview');
const trimItem = namePreview.items.find((it) => it.providerId === 'trimNodeName');
const renameItem = namePreview.items.find((it) => it.providerId === 'renameDefaultName');
assert(trimItem, 'trimNodeName should propose a fix for a node with extra whitespace');
assert(renameItem, 'renameDefaultName should propose a fix for a default-named node');
assert(trimItem.tier === 'A', 'trimNodeName is Tier A');
assert(renameItem.tier === 'B', 'renameDefaultName is Tier B');

await figma.ui.onmessage({ type: 'command-apply-fixes', tier: 'AB' });
assert(trimNode.name === 'Spaced Name', 'trimNodeName should collapse whitespace');
assert(defaultNode.name !== 'Rectangle 5', 'renameDefaultName should rename the default-named node');
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
node klic-figma-toolkit/build-toolkit.mjs && node klic-figma-toolkit/run-smoke-test-mock.mjs
```
Expected: FAIL — `trimNodeName should propose a fix`.

- [ ] **Step 3: provider 등록 (15-fix-engine.js)**

```javascript
/* ── Provider: trimNodeName (Tier A) ── */
commandRegisterFixProvider('trimNodeName', 'A', async function (payload) {
  var node = await commandGetNodeById(payload.nodeId);
  if (!node) return false;
  node.name = payload.nextName;
  return true;
});

/* ── Provider: renameDefaultName (Tier B) ── */
commandRegisterFixProvider('renameDefaultName', 'B', async function (payload) {
  var node = await commandGetNodeById(payload.nodeId);
  if (!node) return false;
  node.name = payload.nextName;
  return true;
});

var COMMAND_DEFAULT_NAME_RE = /^(Frame|Rectangle|Ellipse|Group|Vector|Line|Text|Component|Slice|Star|Polygon) \d+$/;

function commandTrimNodeName(name) {
  return name.replace(/\s+/g, ' ').replace(/^ | $/g, '');
}

function commandSuggestSemanticName(node) {
  // 자식 텍스트가 있으면 그 내용을, 없으면 타입 기반 의미명
  if (node.children) {
    for (var i = 0; i < node.children.length; i++) {
      if (node.children[i].type === 'TEXT' && node.children[i].characters) {
        return commandTrimNodeName(node.children[i].characters).slice(0, 40) || node.type;
      }
    }
  }
  return node.type + ' (renamed)';
}
```

- [ ] **Step 4: 디스크립터 수집 확장 (commandGatherFixDescriptors에 노드 순회 추가)**

`commandGatherFixDescriptors` 안, previewItems 루프 뒤에 추가. 스냅샷이 스캔한 노드 목록을 재사용한다 (`snapshot.nodes` 또는 동일 노드 컬렉션 — 기존 필드명 확인):

```javascript
  var nodes = (snapshot && snapshot.nodes) || [];
  for (var n = 0; n < nodes.length; n++) {
    var nd = nodes[n];
    var rawName = nd.name || '';
    var trimmed = commandTrimNodeName(rawName);
    if (trimmed !== rawName) {
      queue.push({
        id: commandNextFixId(), providerId: 'trimNodeName', tier: 'A',
        label: 'Trim "' + rawName + '"',
        preview: { before: rawName, after: trimmed },
        payload: { nodeId: nd.id, nextName: trimmed },
      });
    } else if (COMMAND_DEFAULT_NAME_RE.test(rawName)) {
      var suggested = commandSuggestSemanticName(nd);
      queue.push({
        id: commandNextFixId(), providerId: 'renameDefaultName', tier: 'B',
        label: 'Rename "' + rawName + '" → "' + suggested + '"',
        preview: { before: rawName, after: suggested },
        payload: { nodeId: nd.id, nextName: suggested },
      });
    }
  }
```

> **검증 필요**: `collectCommandSnapshot`이 스캔한 노드를 어떤 필드로 노출하는지 `10-command-center.js`에서 확인 (`snapshot.nodes` 가정). 노드 배열을 직접 노출하지 않으면, 스냅샷이 내부적으로 쓰는 `commandCollectNodes`/`commandCollectNodesLimited` 결과를 `commandCollectFixes`에서 별도 수집해 `commandGatherFixDescriptors`에 전달하도록 시그니처를 `(snapshot, nodes, queue)`로 조정.

- [ ] **Step 5: 재빌드 + 테스트 통과 확인**

```bash
node klic-figma-toolkit/build-toolkit.mjs && node klic-figma-toolkit/run-smoke-test-mock.mjs
```
Expected: PASS.

- [ ] **Step 6: 커밋**

```bash
git add klic-figma-toolkit/src/code/15-fix-engine.js klic-figma-toolkit/code.js klic-figma-toolkit/run-smoke-test-mock.mjs
git commit -m "feat: trimNodeName(A)·renameDefaultName(B) 명명 정규화 provider"
```

---

## Task 4: consolidateDuplicateToken provider (Tier B) — 변수 삭제 spike 포함

**Files:**
- Modify: `klic-figma-toolkit/src/code/15-fix-engine.js`
- Modify: `klic-figma-toolkit/run-smoke-test-mock.mjs` (mock `Variable.remove`, 회귀)

**Interfaces:**
- Consumes: `commandGetLocalVariables` 또는 `commandGetLocalColorVariables` (기존), `commandGetNodeById`
- Produces: provider `consolidateDuplicateToken`(B); payload `{ duplicateVariableId, canonicalVariableId, boundNodeRefs:[{nodeId,property,paintIndex}] }`

**순서 강제 (스펙 §10 리스크 완화):** 삭제 전 중복 변수에 바인딩된 **모든 노드를 정규 변수로 재바인딩 완료** 후에만 `duplicate.remove()` 호출.

> **SPIKE (구현 전 필수):** 실 Figma 데스크탑에서 작은 플러그인 스니펫으로 검증 — (1) `variable.remove()`가 dynamic-page에서 동작하는가, (2) 여전히 바인딩된 노드가 있을 때 remove의 거동(예외? 무시? 바인딩 깨짐?). 검증 결과를 이 Task 주석에 기록. **remove가 바인딩 노드 존재 시 위험하면**, 본 provider는 "재바인딩만 하고 변수는 삭제하지 않음 + 사용자에게 '미사용 중복 변수 N개 — Figma 변수 패널에서 수동 삭제' 안내"로 축소한다.

- [ ] **Step 1: mock에 Variable.remove 추가**

`run-smoke-test-mock.mjs`의 `class Variable` 정의에 메서드 추가 (없으면 클래스 찾아서):

```javascript
  remove() {
    this.removed = true;
    const idx = variables.indexOf(this);
    if (idx >= 0) variables.splice(idx, 1);
  }
```

- [ ] **Step 2: 실패하는 테스트 작성**

```javascript
// ── Batch Auto-Fix: consolidateDuplicateToken (Tier B) ──
const canonicalVar = figma.variables.createVariable('Canonical/Blue', collections[0], 'COLOR');
canonicalVar.valuesByMode[collections[0].defaultModeId] = { r: 0.1, g: 0.3, b: 0.9 };
const dupVar = figma.variables.createVariable('Dup/Blue', collections[0], 'COLOR');
dupVar.valuesByMode[collections[0].defaultModeId] = { r: 0.1, g: 0.3, b: 0.9 };
const dupBoundRect = figma.createRectangle();
dupBoundRect.fills = [figma.variables.setBoundVariableForPaint({ type: 'SOLID', color: { r: 0.1, g: 0.3, b: 0.9 }, opacity: 1 }, 'color', dupVar)];
page.appendChild(dupBoundRect);
page.selection = [];

await figma.ui.onmessage({ type: 'command-collect-fixes', scope: 'page', options: { scanLimit: 500 } });
const dupPreview = latestMessage('command-fixes-preview');
const dupItem = dupPreview.items.find((it) => it.providerId === 'consolidateDuplicateToken');
assert(dupItem, 'consolidateDuplicateToken should propose a fix for duplicate color values');

await figma.ui.onmessage({ type: 'command-apply-fixes', tier: 'AB' });
assert(dupBoundRect.fills[0].boundVariables.color.id === canonicalVar.id, 'consolidate should rebind node to the canonical variable BEFORE deleting duplicate');
assert(dupVar.removed === true, 'consolidate should remove the duplicate variable after rebinding');
```

- [ ] **Step 3: 테스트 실행 — 실패 확인**

```bash
node klic-figma-toolkit/build-toolkit.mjs && node klic-figma-toolkit/run-smoke-test-mock.mjs
```
Expected: FAIL — `consolidateDuplicateToken should propose a fix`.

- [ ] **Step 4: provider 등록 + 디스크립터 수집 (15-fix-engine.js)**

```javascript
/* ── Provider: consolidateDuplicateToken (Tier B) ──
   순서: 모든 바인딩 노드를 canonical 로 재바인딩 → 그 후 duplicate.remove() */
commandRegisterFixProvider('consolidateDuplicateToken', 'B', async function (payload) {
  var canonical = await commandGetVariableById(payload.canonicalVariableId);
  var duplicate = await commandGetVariableById(payload.duplicateVariableId);
  if (!canonical || !duplicate) return false;
  var refs = payload.boundNodeRefs || [];
  for (var i = 0; i < refs.length; i++) {
    var ref = refs[i];
    var ok = await commandApplySingleColorBinding({
      nodeId: ref.nodeId, property: ref.property, paintIndex: ref.paintIndex, variableId: canonical.id,
    });
    if (!ok) return false; // 재바인딩 실패 시 삭제하지 않음 (안전)
  }
  if (typeof duplicate.remove === 'function') duplicate.remove();
  return true;
});
```

`commandGatherFixDescriptors`에 중복 탐지 추가. hex가 동일한 COLOR 변수 그룹에서 정규(예: 이름이 더 짧거나 우선순위 높은) 1개를 canonical, 나머지를 duplicate로:

```javascript
  // 중복 색상값 토큰 통합
  var colorVars = (snapshot && snapshot.colorVariables) || [];
  var byHex = {};
  for (var c = 0; c < colorVars.length; c++) {
    var cv = colorVars[c];
    if (!cv.hex) continue;
    (byHex[cv.hex] = byHex[cv.hex] || []).push(cv);
  }
  var boundRefs = commandFindBoundNodeRefs(snapshot);
  for (var hex in byHex) {
    if (byHex[hex].length < 2) continue;
    var group = byHex[hex].slice().sort(function (a, b) { return a.name.length - b.name.length; });
    var canonical = group[0];
    for (var d = 1; d < group.length; d++) {
      var dup = group[d];
      queue.push({
        id: commandNextFixId(), providerId: 'consolidateDuplicateToken', tier: 'B',
        label: 'Merge "' + dup.name + '" → "' + canonical.name + '"',
        preview: { before: dup.name + ' (' + hex + ')', after: canonical.name },
        payload: {
          duplicateVariableId: dup.id, canonicalVariableId: canonical.id,
          boundNodeRefs: boundRefs.filter(function (r) { return r.variableId === dup.id; }),
        },
      });
    }
  }
```

`commandFindBoundNodeRefs` 헬퍼 추가 (스캔 노드의 fills에서 boundVariables.color를 가진 항목 수집):

```javascript
function commandFindBoundNodeRefs(snapshot) {
  var nodes = (snapshot && snapshot.nodes) || [];
  var refs = [];
  for (var i = 0; i < nodes.length; i++) {
    var nd = nodes[i];
    var fills = nd.fills;
    if (!Array.isArray(fills)) continue;
    for (var p = 0; p < fills.length; p++) {
      var bv = fills[p].boundVariables;
      if (bv && bv.color && bv.color.id) {
        refs.push({ nodeId: nd.id, property: 'fills', paintIndex: p, variableId: bv.color.id });
      }
    }
  }
  return refs;
}
```

> **검증 필요**: `snapshot.colorVariables`/`snapshot.nodes` 필드명을 `10-command-center.js`에서 확인. 색상 변수 목록이 스냅샷에 없으면 `commandCollectFixes`에서 `commandGetLocalColorVariables()`를 호출해 전달.

- [ ] **Step 5: 재빌드 + 테스트 통과 확인**

```bash
node klic-figma-toolkit/build-toolkit.mjs && node klic-figma-toolkit/run-smoke-test-mock.mjs
```
Expected: PASS.

- [ ] **Step 6: 커밋**

```bash
git add klic-figma-toolkit/src/code/15-fix-engine.js klic-figma-toolkit/code.js klic-figma-toolkit/run-smoke-test-mock.mjs
git commit -m "feat: consolidateDuplicateToken(B) — 재바인딩 후 중복 변수 삭제 (순서 강제)"
```

---

## Task 5: Tier C providers (fixContrast, fixTargetSize) + 항목별 적용

**Files:**
- Modify: `klic-figma-toolkit/src/code/15-fix-engine.js`
- Modify: `klic-figma-toolkit/run-smoke-test-mock.mjs`

**Interfaces:**
- Consumes: `commandContrastRatio`·`commandRelativeLuminance` (기존, `10-command-center.js`), `commandGetNodeById`
- Produces: providers `fixContrast`(C), `fixTargetSize`(C); 항목별 적용 (`command-apply-fixes {ids}`)

> **v1 제외**: `addFocusState` — 기존 컴포넌트셋에 variant 노드 삽입은 context7에서 흐름 미확정(스펙 §10). v1에서는 Component QA가 "포커스 상태 누락 N건"을 탐지만 하고, fix 디스크립터는 부착하지 않는다. 별도 spike 후 후속 Task로.

`fixTargetSize`: 타깃 미달 노드를 KRDS 권장 최소(44px) 이상으로 `resize`. `fixContrast`: 전경색을 배경 대비 통과(텍스트 4.5:1)까지 명도 보정 — v1은 결정적 근사로 "검정 또는 흰색 중 대비가 통과하는 쪽"으로 전경 교체(보수적·예측 가능).

- [ ] **Step 1: 실패하는 테스트 작성**

```javascript
// ── Batch Auto-Fix: Tier C per-item (fixTargetSize) ──
const smallBtn = figma.createFrame();
smallBtn.name = 'Tiny Button';
smallBtn.resize(24, 24);
page.appendChild(smallBtn);
page.selection = [smallBtn];

await figma.ui.onmessage({ type: 'command-collect-fixes', scope: 'selection', options: { scanLimit: 100 } });
const cPreview = latestMessage('command-fixes-preview');
const sizeItem = cPreview.items.find((it) => it.providerId === 'fixTargetSize');
assert(sizeItem, 'fixTargetSize should propose a Tier C fix for an undersized target');
assert(sizeItem.tier === 'C', 'fixTargetSize is Tier C');

// AB 일괄은 C 를 건드리지 않아야 함 (안전 가드 — Task 6에서 본격 검증)
await figma.ui.onmessage({ type: 'command-apply-fixes', tier: 'AB' });
assert(smallBtn.width === 24, 'AB batch must NOT apply Tier C fixes');

// 항목별 적용
await figma.ui.onmessage({ type: 'command-apply-fixes', ids: [sizeItem.id] });
assert(smallBtn.width >= 44, 'fixTargetSize per-item apply should resize to >= 44px');
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
node klic-figma-toolkit/build-toolkit.mjs && node klic-figma-toolkit/run-smoke-test-mock.mjs
```
Expected: FAIL — `fixTargetSize should propose a Tier C fix`.

- [ ] **Step 3: providers 등록 (15-fix-engine.js)**

```javascript
var COMMAND_MIN_TARGET = 44;

/* ── Provider: fixTargetSize (Tier C) ── */
commandRegisterFixProvider('fixTargetSize', 'C', async function (payload) {
  var node = await commandGetNodeById(payload.nodeId);
  if (!node || typeof node.resize !== 'function') return false;
  node.resize(Math.max(node.width, COMMAND_MIN_TARGET), Math.max(node.height, COMMAND_MIN_TARGET));
  return true;
});

/* ── Provider: fixContrast (Tier C) — 보수적: 통과하는 흑/백으로 전경 교체 ── */
commandRegisterFixProvider('fixContrast', 'C', async function (payload) {
  var node = await commandGetNodeById(payload.nodeId);
  if (!node || !Array.isArray(node.fills)) return false;
  var next = node.fills.slice();
  var idx = payload.paintIndex || 0;
  if (!next[idx] || next[idx].type !== 'SOLID') return false;
  next[idx] = Object.assign({}, next[idx], { color: payload.nextColor });
  node.fills = next;
  return true;
});
```

- [ ] **Step 4: 디스크립터 수집 확장 (commandGatherFixDescriptors)**

```javascript
  // Tier C: 타깃 크기
  for (var s = 0; s < nodes.length; s++) {
    var sn = nodes[s];
    if (commandIsLikelyInteractiveNode(sn) && (sn.width < COMMAND_MIN_TARGET || sn.height < COMMAND_MIN_TARGET)) {
      queue.push({
        id: commandNextFixId(), providerId: 'fixTargetSize', tier: 'C',
        label: 'Resize "' + (sn.name || sn.id) + '" → ' + COMMAND_MIN_TARGET + 'px+',
        preview: { before: sn.width + '×' + sn.height, after: '≥' + COMMAND_MIN_TARGET + 'px' },
        payload: { nodeId: sn.id },
      });
    }
  }
```

> `commandIsLikelyInteractiveNode`·`COMMAND_MIN_TARGET` 사용. `fixContrast` 디스크립터는 KWCAG 감사 결과(대비 미달 항목)에서 전경/배경색을 읽어 통과하는 흑/백을 `nextColor`로 계산해 부착 — KWCAG 감사 항목 구조를 `runKwcagKrdsAudit`에서 확인 후 동일 패턴으로 추가. (테스트는 fixTargetSize로 C 경로를 검증하므로 fixContrast 디스크립터 부착은 동일 루프에 추가하되 회귀는 후속.)

- [ ] **Step 5: 재빌드 + 테스트 통과 확인**

```bash
node klic-figma-toolkit/build-toolkit.mjs && node klic-figma-toolkit/run-smoke-test-mock.mjs
```
Expected: PASS.

- [ ] **Step 6: 커밋**

```bash
git add klic-figma-toolkit/src/code/15-fix-engine.js klic-figma-toolkit/code.js klic-figma-toolkit/run-smoke-test-mock.mjs
git commit -m "feat: fixTargetSize·fixContrast(C) provider + 항목별 적용 (addFocusState는 v1 제외)"
```

---

## Task 6: suggestKrdsName (C·제안) + AB 안전 가드 회귀

**Files:**
- Modify: `klic-figma-toolkit/src/code/15-fix-engine.js`
- Modify: `klic-figma-toolkit/run-smoke-test-mock.mjs`

**Interfaces:**
- Produces: provider `suggestKrdsName` (tier `'C-suggest'`); payload `{ nodeId, nextName }`

KRDS 용어 매핑 v1은 보수적인 소형 사전(예: `로그인→login-area`, `검색→search-area`, `목록→list-area`)으로 시작. 판단형이라 **절대 AB 일괄 금지** — 안전 가드를 테스트로 강제한다.

- [ ] **Step 1: 실패하는 테스트 작성 (안전 가드 핵심)**

```javascript
// ── Batch Auto-Fix: KRDS suggestion is per-item ONLY ──
const krdsNode = figma.createFrame();
krdsNode.name = '로그인';
page.appendChild(krdsNode);
page.selection = [krdsNode];

await figma.ui.onmessage({ type: 'command-collect-fixes', scope: 'selection', options: { scanLimit: 100 } });
const krdsPreview = latestMessage('command-fixes-preview');
const krdsItem = krdsPreview.items.find((it) => it.providerId === 'suggestKrdsName');
assert(krdsItem, 'suggestKrdsName should propose a KRDS naming suggestion');
assert(krdsItem.tier === 'C-suggest', 'KRDS suggestion must be tier C-suggest');
assert(krdsPreview.counts.suggestion >= 1, 'preview counts should track suggestions separately');

// 안전 가드: AB 일괄은 제안을 절대 적용하지 않음
const beforeName = krdsNode.name;
await figma.ui.onmessage({ type: 'command-apply-fixes', tier: 'AB' });
assert(krdsNode.name === beforeName, 'AB batch must NEVER apply C-suggest (KRDS) renames');

// 항목별 명시 적용만 허용
await figma.ui.onmessage({ type: 'command-apply-fixes', ids: [krdsItem.id] });
assert(krdsNode.name !== beforeName, 'KRDS suggestion should apply only via explicit per-item approval');
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
node klic-figma-toolkit/build-toolkit.mjs && node klic-figma-toolkit/run-smoke-test-mock.mjs
```
Expected: FAIL — `suggestKrdsName should propose a KRDS naming suggestion`.

- [ ] **Step 3: provider + 사전 + 디스크립터 (15-fix-engine.js)**

```javascript
/* ── Provider: suggestKrdsName (Tier C-suggest) — 항목별 승인 전용 ── */
var COMMAND_KRDS_TERMS = {
  '로그인': 'login-area', '검색': 'search-area', '목록': 'list-area',
  '상세': 'detail-area', '신청': 'apply-area', '안내': 'guide-area',
};

commandRegisterFixProvider('suggestKrdsName', 'C-suggest', async function (payload) {
  var node = await commandGetNodeById(payload.nodeId);
  if (!node) return false;
  node.name = payload.nextName;
  return true;
});
```

`commandGatherFixDescriptors`의 노드 루프 안(명명 분기와 함께) 추가:

```javascript
    var krdsKey = Object.keys(COMMAND_KRDS_TERMS).filter(function (k) { return rawName.indexOf(k) >= 0; })[0];
    if (krdsKey) {
      queue.push({
        id: commandNextFixId(), providerId: 'suggestKrdsName', tier: 'C-suggest',
        label: 'KRDS 제안: "' + rawName + '" → "' + COMMAND_KRDS_TERMS[krdsKey] + '"',
        preview: { before: rawName, after: COMMAND_KRDS_TERMS[krdsKey] },
        payload: { nodeId: nd.id, nextName: COMMAND_KRDS_TERMS[krdsKey] },
      });
    }
```

> AB 가드는 이미 `commandApplyFixes`가 `tier==='A'||tier==='B'`만 필터하므로 `C-suggest`는 자동 제외된다. 본 Task의 테스트가 이를 회귀로 고정한다.

- [ ] **Step 4: 재빌드 + 테스트 통과 확인**

```bash
node klic-figma-toolkit/build-toolkit.mjs && node klic-figma-toolkit/run-smoke-test-mock.mjs
```
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add klic-figma-toolkit/src/code/15-fix-engine.js klic-figma-toolkit/code.js klic-figma-toolkit/run-smoke-test-mock.mjs
git commit -m "feat: suggestKrdsName(C-suggest) + AB 일괄 안전 가드 회귀"
```

---

## Task 7: UI Fix 섹션

**Files:**
- Modify: `klic-figma-toolkit/src/ui/index.html` (Fix 섹션 DOM)
- Modify: `klic-figma-toolkit/src/ui/styles.css` (스타일)
- Modify: `klic-figma-toolkit/src/ui/i18n.js` (EN/KO 키)
- Modify: `klic-figma-toolkit/src/ui/app.js` (수집/프리뷰/적용 로직)
- Modify: `klic-figma-toolkit/run-ui-roundtrip-smoke.mjs` (UI DOM 회귀)

**Interfaces:**
- Consumes: 메시지 `command-fixes-preview`·`command-fixes-applied` (Task 1), 포스트 `command-collect-fixes`·`command-apply-fixes`
- 기존 UI 패턴: `t(key)` i18n, `parent.postMessage({pluginMessage:{...}},'*')`, `window.onmessage` 핸들러, `data-i18n` 속성

- [ ] **Step 1: 실패하는 UI 회귀 테스트 작성**

`run-ui-roundtrip-smoke.mjs`에 추가 (기존 i18n/DOM 검증 패턴 따라):

```javascript
assert(ui.includes('command-collect-fixes'), 'ui.html is missing Fix scan trigger');
assert(ui.includes('command-fixes-preview'), 'ui.html is missing fixes preview handler');
assert(ui.includes('command-apply-fixes'), 'ui.html is missing fixes apply trigger');
assert(ui.includes('fix-batch-apply'), 'ui.html is missing AB batch apply button');
assert(ui.includes("'command.fixBatchApply'") || ui.includes('command.fixBatchApply'), 'i18n missing fix batch label');
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
node klic-figma-toolkit/build-toolkit.mjs && node klic-figma-toolkit/run-ui-roundtrip-smoke.mjs
```
Expected: FAIL — `ui.html is missing Fix scan trigger`.

- [ ] **Step 3: DOM 추가 (index.html — Command Center 인스펙터 영역 내)**

기존 인스펙터 섹션 구조를 따라 추가:

```html
<section class="fix-section" id="fix-section">
  <h3 data-i18n="command.fixTitle">Auto-Fix</h3>
  <button class="btn" id="fix-scan" data-i18n="command.fixScan">Scan for fixes</button>
  <div class="fix-counts" id="fix-counts"></div>
  <button class="btn btn-primary" id="fix-batch-apply" data-i18n="command.fixBatchApply" disabled>Apply safe fixes (A+B)</button>
  <ul class="fix-c-list" id="fix-c-list"></ul>
</section>
```

- [ ] **Step 4: 스타일 추가 (styles.css)**

```css
  .fix-section { display: flex; flex-direction: column; gap: 8px; padding: 12px; border: 1px solid #303030; border-radius: 8px; }
  .fix-counts { display: flex; gap: 6px; flex-wrap: wrap; }
  .fix-counts .chip { background: #202020; border-radius: 999px; padding: 3px 8px; font-size: 11px; color: #ddd; }
  .fix-c-list { list-style: none; display: flex; flex-direction: column; gap: 6px; }
  .fix-c-list li { display: flex; justify-content: space-between; align-items: center; background: #1b1b1b; border-radius: 6px; padding: 8px; font-size: 11px; }
```

- [ ] **Step 5: i18n 키 추가 (i18n.js — en 과 ko 양쪽)**

en 블록:
```javascript
    'command.fixTitle': 'Auto-Fix',
    'command.fixScan': 'Scan for fixes',
    'command.fixBatchApply': 'Apply safe fixes (A+B)',
    'command.fixApplyItem': 'Apply',
    'command.fixApplied': (n) => `✅ ${n} fixes applied — Ctrl+Z to undo all`,
```
ko 블록:
```javascript
    'command.fixTitle': '자동 수리',
    'command.fixScan': '수리 항목 스캔',
    'command.fixBatchApply': '안전 수리 일괄 적용 (A+B)',
    'command.fixApplyItem': '적용',
    'command.fixApplied': (n) => `✅ 수리 ${n}건 적용 — Ctrl+Z로 전체 취소`,
```

- [ ] **Step 6: app.js 로직 추가**

```javascript
document.getElementById('fix-scan').addEventListener('click', function () {
  parent.postMessage({ pluginMessage: { type: 'command-collect-fixes', scope: commandCurrentScope(), options: commandScanOptions() } }, '*');
});
document.getElementById('fix-batch-apply').addEventListener('click', function () {
  parent.postMessage({ pluginMessage: { type: 'command-apply-fixes', tier: 'AB' } }, '*');
});

function commandRenderFixPreview(msg) {
  var counts = msg.counts || {};
  var countsEl = document.getElementById('fix-counts');
  countsEl.innerHTML = '';
  ['A', 'B', 'C', 'suggestion'].forEach(function (k) {
    if (!counts[k]) return;
    var chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = k + ': ' + counts[k];
    countsEl.appendChild(chip);
  });
  var batchBtn = document.getElementById('fix-batch-apply');
  batchBtn.disabled = !((counts.A || 0) + (counts.B || 0));

  var list = document.getElementById('fix-c-list');
  list.innerHTML = '';
  (msg.items || []).filter(function (it) { return it.tier === 'C' || it.tier === 'C-suggest'; }).forEach(function (it) {
    var li = document.createElement('li');
    var label = document.createElement('span');
    label.textContent = it.label;
    var btn = document.createElement('button');
    btn.className = 'btn';
    btn.textContent = t('command.fixApplyItem');
    btn.addEventListener('click', function () {
      parent.postMessage({ pluginMessage: { type: 'command-apply-fixes', ids: [it.id] } }, '*');
    });
    li.appendChild(label);
    li.appendChild(btn);
    list.appendChild(li);
  });
}
```

`window.onmessage` 핸들러(기존 message 라우팅 switch)에 추가:
```javascript
    case 'command-fixes-preview': return commandRenderFixPreview(msg);
    case 'command-fixes-applied':
      commandSetStatus(t('command.fixApplied', msg.applied));
      parent.postMessage({ pluginMessage: { type: 'command-collect-fixes', scope: commandCurrentScope(), options: commandScanOptions() } }, '*');
      return;
```

> **검증 필요**: `commandCurrentScope()`·`commandScanOptions()`·`commandSetStatus()` — 기존 app.js에 동등 헬퍼가 있으면 그 이름을 사용하고, 없으면 기존 Command Center 스캔 트리거(`command-refresh` 보내는 코드)에서 scope/options를 어떻게 구성하는지 그대로 복사. 메시지 라우팅 switch의 정확한 위치도 기존 `command-snapshot` case 근처에서 확인.

- [ ] **Step 7: 재빌드 + UI 회귀 통과 확인**

```bash
node klic-figma-toolkit/build-toolkit.mjs && node klic-figma-toolkit/run-ui-roundtrip-smoke.mjs
```
Expected: PASS.

- [ ] **Step 8: 커밋**

```bash
git add klic-figma-toolkit/src/ui/ klic-figma-toolkit/ui.html klic-figma-toolkit/run-ui-roundtrip-smoke.mjs
git commit -m "feat: Command Center Fix 섹션 UI (일괄 A+B · 항목별 C) + EN/KO i18n"
```

---

## Task 8: 통합 계약 + 전체 프리플라이트 + 런타임 증거

**Files:**
- Modify: `klic-figma-toolkit/verify-integration.mjs`
- Modify: `klic-figma-toolkit/run-completion-audit.mjs` (선택: 신규 기능 체크 추가)

**Interfaces:** 없음 (검증 전용)

- [ ] **Step 1: verify-integration에 계약 추가**

`expectedPluginMessages` 배열에 추가:
```javascript
  'command-collect-fixes',
  'command-apply-fixes',
```
`expectedUiMessages` 배열에 추가:
```javascript
  'command-fixes-preview',
  'command-fixes-applied',
```
함수 존재 체크 배열(`for (const fnName of [...])`)에 추가:
```javascript
  'commandRegisterFixProvider',
  'commandCollectFixes',
  'commandApplyFixes',
  'commandGatherFixDescriptors',
```
신규 단언 추가 (파일 끝 `console.log` 직전):
```javascript
assert(code.includes("commandRegisterFixProvider('bindRawColor'"), 'bindRawColor provider not registered');
assert(code.includes("commandRegisterFixProvider('renameDefaultName'"), 'renameDefaultName provider not registered');
assert(code.includes("commandRegisterFixProvider('consolidateDuplicateToken'"), 'consolidateDuplicateToken provider not registered');
assert(code.includes("commandRegisterFixProvider('suggestKrdsName'"), 'suggestKrdsName provider not registered');
assert(code.includes('figma.commitUndo'), 'fix apply path must call figma.commitUndo');
assert(ui.includes('command-collect-fixes') && ui.includes('fix-batch-apply'), 'ui missing fix controls');
for (const key of ['command.fixTitle', 'command.fixScan', 'command.fixBatchApply', 'command.fixApplyItem', 'command.fixApplied']) {
  assert(enI18n.includes(`'${key}'`), `en i18n missing ${key}`);
  assert(koI18n.includes(`'${key}'`), `ko i18n missing ${key}`);
}
```

- [ ] **Step 2: 전체 프리플라이트 실행**

```bash
node klic-figma-toolkit/run-local-verification.mjs
```
Expected: PASS — `KLIC local verification passed.` (build --check, integration, ui roundtrip, mock runtime 전부 통과)

- [ ] **Step 3: 커밋**

```bash
git add klic-figma-toolkit/verify-integration.mjs
git commit -m "test: batch auto-fix 통합 계약 (메시지·provider·commitUndo·i18n) 검증"
```

- [ ] **Step 4: 실 Figma 런타임 검증 (수동)**

1. Figma 데스크탑 → Import plugin from manifest → `klic-figma-toolkit/manifest.json`
2. 원시 색상/기본명/중복 토큰이 있는 파일에서 Command Center → **Scan for fixes**
3. 카운트 칩 확인 → **Apply safe fixes (A+B)** → 캔버스 반영 확인 → **Ctrl+Z 한 번으로 전체 롤백되는지 확인** (commitUndo 검증)
4. C 항목 개별 적용 + Ctrl+Z 확인
5. **Task 4 SPIKE 결과 기록**: `variable.remove()` 거동 — 바인딩 노드 존재 시 안전한지. 위험하면 consolidateDuplicateToken을 "삭제 안 함" 모드로 축소하고 재빌드/재테스트
6. 기존 스모크 테스트 재실행 → 증거 JSON 복사 → `figma-smoke-evidence.json` 갱신
7. 완료 감사:
```bash
node klic-figma-toolkit/run-completion-audit.mjs --runtime-evidence figma-smoke-evidence.json
```
Expected: PASS — `Completion audit passed.`

- [ ] **Step 5: 최종 커밋**

```bash
git add figma-smoke-evidence.json
git commit -m "test: batch auto-fix 실 Figma 런타임 증거 갱신"
```

---

## Self-Review 결과

**Spec coverage:**
- §3 안전 등급 → Task 1(엔진 필터)·Task 6(AB 가드 회귀) ✓
- §4 provider 카탈로그 → bindRawColor(T2)·trimNodeName/renameDefaultName(T3)·normalizeTokenCase(미할당 ⚠️)·consolidateDuplicateToken(T4)·fixContrast/fixTargetSize(T5)·suggestKrdsName(T6) — **normalizeTokenCase는 v1 미할당**. 토큰명 케이스 정규화는 renameDefaultName과 동일 패턴이므로 후속 또는 Task 3 확장으로 처리 (v1 핵심 가치엔 불필요, YAGNI). 스펙 §2 범위 외 노트에 준함.
- §5 아키텍처(디스크립터·엔진·빌드 순서) → Task 1 ✓
- §6 undo(commitUndo) → Task 1 Step 2 회귀 + Task 8 런타임 ✓
- §7 UI → Task 7 ✓
- §8 테스트 → 각 Task TDD + Task 8 ✓
- §10 리스크: 변수삭제 spike → Task 4 / variant → Task 5 v1 제외 / commitUndo → Task 1 ✓

**Placeholder scan:** "검증 필요" 노트는 placeholder가 아니라 기존 코드 필드명 확인 지시(실행자가 grep으로 즉시 해소). 모든 코드 스텝에 실 코드 포함.

**Type consistency:** provider payload 시그니처는 `commandApplySingleColorBinding({nodeId,property,paintIndex,variableId})`와 일치. `commandRegisterFixProvider(id,tier,applyFn)`·`commandFixQueue` 항목 형태 `{id,providerId,tier,label,preview,payload}` 전 Task 일관.

**알려진 미할당:** `normalizeTokenCase` provider (v1 YAGNI 제외, 후속), `addFocusState` (spike 미해결, v1 제외 — Task 5 노트).
