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
