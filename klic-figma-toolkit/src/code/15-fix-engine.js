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
    var scope = msg.scope || 'selection';
    var options = msg.options || {};
    var snapshot = await collectCommandSnapshot(scope, options);
    var nodes = commandLastScanNodes;
    var colorVariables = await commandGetLocalColorVariables();
    commandGatherFixDescriptors(snapshot, nodes, colorVariables, commandFixQueue);
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

var commandFixIdSeq = 0;
function commandNextFixId() {
  commandFixIdSeq++;
  return 'fix-' + commandFixIdSeq;
}

function commandGatherFixDescriptors(snapshot, nodes, colorVariables, queue) {
  nodes = nodes || [];
  queue = queue || [];
  colorVariables = colorVariables || [];
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
          matchType: item.matchType,
        },
      });
    }
  }
  for (var n = 0; n < nodes.length; n++) {
    var nd = nodes[n];
    var rawName = nd.name || '';
    var trimmed = commandTrimNodeName(rawName);
    // "At most one name descriptor per node" convention:
    //   trim (A) > rename (B) > KRDS suggestion (C-suggest).
    // KRDS suggestion is judgment-bearing (mistranslation risk) so it lives in
    // its own tier 'C-suggest' and is NEVER applied by the AB batch — only the
    // trim/rename branches attach a name descriptor, KRDS attaches its own
    // independent descriptor only when no trim/rename fired on this node.
    var nameDescriptorAttached = false;
    if (trimmed !== rawName) {
      queue.push({
        id: commandNextFixId(), providerId: 'trimNodeName', tier: 'A',
        label: 'Trim "' + rawName + '"',
        preview: { before: rawName, after: trimmed },
        payload: { nodeId: nd.id, nextName: trimmed },
      });
      nameDescriptorAttached = true;
    // Rename only if no trim needed — avoids two descriptors for one node
    } else if (COMMAND_DEFAULT_NAME_RE.test(rawName)) {
      var suggested = commandSuggestSemanticName(nd);
      queue.push({
        id: commandNextFixId(), providerId: 'renameDefaultName', tier: 'B',
        label: 'Rename "' + rawName + '" → "' + suggested + '"',
        preview: { before: rawName, after: suggested },
        payload: { nodeId: nd.id, nextName: suggested },
      });
      nameDescriptorAttached = true;
    }
    // KRDS suggestion: separate descriptor, tier 'C-suggest'. Attached only when
    // no deterministic name fix (trim/rename) already claimed this node, so a
    // single node never gets two competing name descriptors. Independent of the
    // AB filter — always excluded from batch apply by its tier.
    if (!nameDescriptorAttached) {
      var krdsKey = Object.keys(COMMAND_KRDS_TERMS).filter(function (k) { return rawName.indexOf(k) >= 0; })[0];
      if (krdsKey) {
        queue.push({
          id: commandNextFixId(), providerId: 'suggestKrdsName', tier: 'C-suggest',
          label: 'KRDS 제안: "' + rawName + '" → "' + COMMAND_KRDS_TERMS[krdsKey] + '"',
          preview: { before: rawName, after: COMMAND_KRDS_TERMS[krdsKey] },
          payload: { nodeId: nd.id, nextName: COMMAND_KRDS_TERMS[krdsKey] },
        });
      }
    }
  }
  // 중복 색상값 토큰 통합
  var byHex = {};
  for (var c = 0; c < colorVariables.length; c++) {
    var cv = colorVariables[c];
    if (!cv.hex) continue;
    (byHex[cv.hex] = byHex[cv.hex] || []).push(cv);
  }
  var boundRefs = commandFindBoundNodeRefs(nodes);
  for (var hex in byHex) {
    if (byHex[hex].length < 2) continue;
    var group = byHex[hex].slice().sort(function (a, b) { return a.name.length - b.name.length; });
    var canonical = group[0];
    for (var d = 1; d < group.length; d++) {
      var dup = group[d];
      var dupRefs = boundRefs.filter(function (r) { return r.variableId === dup.id; });
      if (dupRefs.length === 0) continue; // 바인딩된 노드 없으면 긴급 수정 불필요
      queue.push({
        id: commandNextFixId(), providerId: 'consolidateDuplicateToken', tier: 'B',
        label: 'Rebind ' + dup.name + ' usage → ' + canonical.name + ' (duplicate kept; remove manually)',
        preview: { before: dup.name + ' (' + hex + ')', after: canonical.name + ' [rebind only — duplicate variable kept for manual removal]' },
        payload: {
          duplicateVariableId: dup.id, canonicalVariableId: canonical.id,
          boundNodeRefs: dupRefs,
        },
      });
    }
  }
  // ── Tier C: 타깃 크기 (fixTargetSize) ──
  // commandIsLikelyInteractiveNode + width/height < 44 → resize 제안.
  for (var t = 0; t < nodes.length; t++) {
    var tn = nodes[t];
    if (typeof tn.width !== 'number' || typeof tn.height !== 'number') continue;
    if (!commandIsLikelyInteractiveNode(tn)) continue;
    if (tn.width >= COMMAND_MIN_TARGET && tn.height >= COMMAND_MIN_TARGET) continue;
    queue.push({
      id: commandNextFixId(), providerId: 'fixTargetSize', tier: 'C',
      label: 'Resize "' + (tn.name || tn.id) + '" → ' + COMMAND_MIN_TARGET + 'px+',
      preview: { before: Math.round(tn.width) + '×' + Math.round(tn.height), after: '≥' + COMMAND_MIN_TARGET + 'px' },
      payload: { nodeId: tn.id },
    });
  }

  // ── Tier C: 텍스트 대비 (fixContrast) ──
  // snapshot 이 KWCAG 감사 결과를 노출하지 않으므로 (collectCommandSnapshot 는 색상 바인딩
  // 미리보기만 생성) nodes 에서 직접 저대비 텍스트를 도출한다 — runKwcagKrdsAudit 와 동일 알고리즘,
  // 동일 헬퍼(commandSolidPaintColor·commandFindBackgroundColor·commandContrastRatio) 재사용.
  // 전경을 흑/백 중 4.5:1 통과 쪽으로 교체할 수 있을 때만 디스크립터 부착.
  for (var f = 0; f < nodes.length; f++) {
    var fn = nodes[f];
    if (fn.type !== 'TEXT') continue;
    var fg = commandSolidPaintColor(fn.fills);
    if (!fg) continue;
    var bg = commandFindBackgroundColor(fn);
    var fgRatio = commandContrastRatio(fg, bg);
    if (fgRatio >= COMMAND_TEXT_CONTRAST_MIN) continue; // 이미 통과
    var chosen = commandChooseContrastColor(bg);
    if (!chosen) continue; // 흑/백 어느 쪽도 통과 못 함 — 자동 수정 불가
    var cpIndex = -1;
    for (var pi = 0; pi < fn.fills.length; pi++) {
      if (fn.fills[pi] && fn.fills[pi].type === 'SOLID' && fn.fills[pi].visible !== false) { cpIndex = pi; break; }
    }
    if (cpIndex < 0) continue;
    queue.push({
      id: commandNextFixId(), providerId: 'fixContrast', tier: 'C',
      label: 'Fix contrast "' + (fn.name || fn.id) + '" → ' + commandRoundRatio(fgRatio) + ':1 → ≥' + COMMAND_TEXT_CONTRAST_MIN + ':1',
      preview: { before: commandColorToHex(fg) + ' on ' + commandColorToHex(bg), after: (chosen === COMMAND_BLACK ? '#000000' : '#FFFFFF') },
      payload: { nodeId: fn.id, paintIndex: cpIndex, nextColor: chosen },
    });
  }

  return queue;
}

function commandFindBoundNodeRefs(nodes) {
  nodes = nodes || [];
  var refs = [];
  for (var i = 0; i < nodes.length; i++) {
    var nd = nodes[i];
    // fills 스캔
    var fills = nd.fills;
    if (Array.isArray(fills)) {
      for (var p = 0; p < fills.length; p++) {
        var bvF = fills[p].boundVariables;
        if (bvF && bvF.color && bvF.color.id) {
          refs.push({ nodeId: nd.id, property: 'fills', paintIndex: p, variableId: bvF.color.id });
        }
      }
    }
    // strokes 스캔 (fills 와 동일한 boundVariables.color.id 패턴)
    var strokes = nd.strokes;
    if (Array.isArray(strokes)) {
      for (var s = 0; s < strokes.length; s++) {
        var bvS = strokes[s].boundVariables;
        if (bvS && bvS.color && bvS.color.id) {
          refs.push({ nodeId: nd.id, property: 'strokes', paintIndex: s, variableId: bvS.color.id });
        }
      }
    }
    // effects 바인딩은 v1 범위 외 (구조가 fills/strokes 와 다름)
  }
  return refs;
}

async function commandApplyFixes(msg) {
  var applied = 0;
  var skipped = 0;
  var attempted = false;
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
      attempted = true;
      var item = targets[i];
      var provider = commandFixProviders[item.providerId];
      if (!provider) { skipped++; continue; }
      var ok = await provider.apply(item.payload);
      if (ok) applied++; else skipped++;
    }
    figma.ui.postMessage({ type: 'command-fixes-applied', applied: applied, skipped: skipped, tier: msg.tier || 'items' });
  } catch (err) {
    figma.ui.postMessage({ type: 'command-error', message: err.message || String(err) });
  } finally {
    if (attempted) figma.commitUndo();
  }
}

/* ── Provider: bindRawColor (Tier A) ── */
commandRegisterFixProvider('bindRawColor', 'A', async function (payload) {
  return await commandApplySingleColorBinding(payload);
});

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

/* ── Provider: suggestKrdsName (Tier C-suggest) — 항목별 승인 전용 ──
   KRDS/공공데이터 용어 매핑은 판단형(judgment-bearing)이며 오역 위험이 있다.
   잘못된 용어를 일괄 적용하면 파일 전체로 전파되므로, 절대 AB 일괄 경로로
   적용되지 않도록 tier 'C-suggest' 로 분리한다. commandApplyFixes 의
   tier:'AB' 필터(tier==='A'||tier==='B')가 자동 제외하며, 항목별
   command-apply-fixes {ids:[...]} 로만 적용된다. */
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

/* ── Provider: consolidateDuplicateToken (Tier B) ──
   v1 안전 방침 (스펙 §10):
   - variable.remove() 안전성은 실제 Figma 환경에서 미검증 (Task 8 spike 대기 중).
   - fills 외에 strokes 바인딩은 탐지하지만 effects 등 기타 속성은 v1 범위 외.
   - 바인딩된 노드가 strokes 등 아직 완전히 탐지되지 않은 곳에 있을 수 있으므로
     중복 변수를 삭제하면 데이터 손실 위험이 있음.
   따라서 v1은 다음 동작만 수행:
     1. 탐지된 boundNodeRefs 의 모든 노드를 canonical 변수로 재바인딩.
     2. 재바인딩이 하나라도 실패하면 즉시 false 반환 (아무것도 커밋하지 않음).
     3. 중복 변수는 삭제하지 않음 — 사용자가 Figma 변수 패널에서 수동으로 제거할 것.
   remove() 재활성화는 Task 8 spike 에서 실제 Figma 환경 안전성 확인 후 수행. */
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
    if (!ok) return false; // 재바인딩 실패 시 중단 — 변수 삭제 절대 금지 (안전)
  }
  // NOTE: duplicate.remove() 는 의도적으로 호출하지 않음.
  // Task 8 spike 완료 전까지 중복 변수는 보존. 사용자가 수동으로 정리할 것.
  return true;
});

/* ── Provider: fixTargetSize (Tier C) ──
   KRDS 최소 터치 타깃 44px. 보수적 v1: 양 축을 max(current, 44) 로 키운다. */
var COMMAND_MIN_TARGET = 44;
commandRegisterFixProvider('fixTargetSize', 'C', async function (payload) {
  var node = await commandGetNodeById(payload.nodeId);
  if (!node || typeof node.resize !== 'function') return false;
  var nextW = Math.max(typeof node.width === 'number' ? node.width : COMMAND_MIN_TARGET, COMMAND_MIN_TARGET);
  var nextH = Math.max(typeof node.height === 'number' ? node.height : COMMAND_MIN_TARGET, COMMAND_MIN_TARGET);
  node.resize(nextW, nextH);
  return true;
});

/* ── Provider: fixContrast (Tier C) ──
   보수적/결정적 근사 (스펙 §10): 전경을 검정 또는 흰색 중 4.5:1 을 통과하는 쪽으로 교체.
   둘 다 통과하면 더 높은 대비 쪽을 선택 (결정적·예측 가능).
   payload.nextColor 는 {r,g,b} (0..1). */
commandRegisterFixProvider('fixContrast', 'C', async function (payload) {
  var node = await commandGetNodeById(payload.nodeId);
  if (!node || !Array.isArray(node.fills)) return false;
  var idx = typeof payload.paintIndex === 'number' ? payload.paintIndex : 0;
  var next = node.fills.slice();
  if (!next[idx] || next[idx].type !== 'SOLID') return false;
  next[idx] = Object.assign({}, next[idx], { color: payload.nextColor });
  node.fills = next;
  return true;
});

/* fixContrast 보조: 배경 대비 통과하는 흑/백을 선택. 둘 다 통과 시 더 높은 대비 쪽 (결정적).
   4.5:1 미충족 시 null 반환 (fix 제안 불가). */
var COMMAND_TEXT_CONTRAST_MIN = 4.5;
var COMMAND_BLACK = { r: 0, g: 0, b: 0 };
var COMMAND_WHITE = { r: 1, g: 1, b: 1 };
function commandChooseContrastColor(background) {
  if (!background) return null;
  var blackRatio = commandContrastRatio(COMMAND_BLACK, background);
  var whiteRatio = commandContrastRatio(COMMAND_WHITE, background);
  var blackPass = blackRatio >= COMMAND_TEXT_CONTRAST_MIN;
  var whitePass = whiteRatio >= COMMAND_TEXT_CONTRAST_MIN;
  if (!blackPass && !whitePass) return null; // 어느 쪽도 통과 못 함 — 자동 수정 불가
  if (blackPass && whitePass) {
    // 둘 다 통과 — 결정적 선택: 더 높은 대비 쪽
    return blackRatio >= whiteRatio ? COMMAND_BLACK : COMMAND_WHITE;
  }
  return blackPass ? COMMAND_BLACK : COMMAND_WHITE;
}

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
