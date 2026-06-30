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
    if (trimmed !== rawName) {
      queue.push({
        id: commandNextFixId(), providerId: 'trimNodeName', tier: 'A',
        label: 'Trim "' + rawName + '"',
        preview: { before: rawName, after: trimmed },
        payload: { nodeId: nd.id, nextName: trimmed },
      });
    // Rename only if no trim needed — avoids two descriptors for one node
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
        label: 'Merge "' + dup.name + '" → "' + canonical.name + '"',
        preview: { before: dup.name + ' (' + hex + ')', after: canonical.name },
        payload: {
          duplicateVariableId: dup.id, canonicalVariableId: canonical.id,
          boundNodeRefs: dupRefs,
        },
      });
    }
  }
  return queue;
}

function commandFindBoundNodeRefs(nodes) {
  nodes = nodes || [];
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

/* ── Provider: consolidateDuplicateToken (Tier B) ──
   순서: 모든 바인딩 노드를 canonical 로 재바인딩 → 그 후 duplicate.remove()
   재바인딩 실패 시 삭제하지 않음 (스펙 §10 안전 순서 강제) */
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
