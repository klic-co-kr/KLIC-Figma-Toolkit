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
