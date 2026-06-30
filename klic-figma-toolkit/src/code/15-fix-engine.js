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
    var token = ++commandScanToken;
    var scanLimit = Math.max(50, Math.min(10000, parseInt(options.scanLimit, 10) || 2000));
    var scan = await commandGetScanNodes(scope, scanLimit, token);
    var nodes = scan.nodes || [];
    commandGatherFixDescriptors(snapshot, nodes, commandFixQueue);
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

function commandGatherFixDescriptors(snapshot, nodes, queue) {
  nodes = nodes || [];
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
  return queue;
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
