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
