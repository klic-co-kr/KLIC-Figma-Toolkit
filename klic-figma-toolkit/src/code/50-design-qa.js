/* ═══════════════════════════════════════════════════════════════════════════
   MODULE: DESIGN QA DIFF
   Capture a selected Figma frame (design source of truth) + an implementation
   screenshot, let the designer label divergences, commit a persistent board.
   Namespace: qa-*
   ═══════════════════════════════════════════════════════════════════════════ */

var QA_ALLOWED_TYPES = { FRAME: 1, COMPONENT: 1, COMPONENT_SET: 1, GROUP: 1, SECTION: 1 };
var QA_FIGMA_IMAGE_MAX_EDGE = 4096;

function qaExportScaleForSize(width, height) {
  var w = Math.max(1, Number(width) || 1);
  var h = Math.max(1, Number(height) || 1);
  var edge = Math.max(w, h);
  return edge > QA_FIGMA_IMAGE_MAX_EDGE ? QA_FIGMA_IMAGE_MAX_EDGE / edge : 1;
}

function qaScaledDimension(size, scale) {
  return Math.max(1, Math.round((Number(size) || 1) * scale));
}

function qaMapNormalized(norm, size) {
  var raw = Number(norm);
  var n = raw === raw ? Math.max(0, Math.min(1, raw)) : 0;
  return Math.round(n * size);
}

function qaKind(label) {
  if (label && label.kind === 'point') return 'point';
  if (label && label.kind === 'arrow') return 'arrow';
  return 'rect';
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
    var scale = qaExportScaleForSize(node.width, node.height);
    var bytes = await node.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: scale } });
    figma.ui.postMessage({
      type: 'qa-rasterize-result',
      bytes: bytes,
      width: qaScaledDimension(node.width, scale),
      height: qaScaledDimension(node.height, scale),
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

function qaPointCallout(index) {
  var marker = figma.createEllipse();
  marker.name = 'QA Point ' + (index + 1);
  marker.fills = [{ type: 'SOLID', color: { r: 1, g: 0.21, b: 0.21 }, opacity: 0.08 }];
  marker.strokes = [{ type: 'SOLID', color: { r: 1, g: 0.21, b: 0.21 } }];
  marker.strokeWeight = 2;
  return marker;
}

function qaArrowLine(index, name, x1, y1, x2, y2) {
  var line = figma.createLine();
  line.name = 'QA Arrow ' + (index + 1) + ' ' + name;
  line.strokes = [{ type: 'SOLID', color: { r: 1, g: 0.21, b: 0.21 } }];
  line.strokeWeight = 2;
  var dx = x2 - x1;
  var dy = y2 - y1;
  var len = Math.max(1, Math.sqrt(dx * dx + dy * dy));
  line.resize(len, 0);
  line.x = x1;
  line.y = y1;
  line.rotation = Math.atan2(dy, dx) * 180 / Math.PI;
  return line;
}

function qaCaption(index, label, x, y) {
  var caption = figma.createText();
  caption.fontName = { family: 'Inter', style: 'Bold' };
  caption.fontSize = 12;
  caption.characters = (index + 1) + '. ' + qaKind(label) + ' · ' + (label.category || 'other') + (label.note ? ' - ' + label.note : '');
  caption.fills = [{ type: 'SOLID', color: { r: 0.1, g: 0.1, b: 0.13 } }];
  caption.x = x;
  caption.y = y;
  return caption;
}

async function qaCommitBoard(msg) {
  try {
    var designNode = await figma.getNodeByIdAsync(msg.designNodeId);
    if (!designNode || designNode.type === 'PAGE') {
      figma.ui.postMessage({ type: 'qa-commit-result', error: 'design-unreachable' });
      return;
    }
    if (msg.designH <= 0 || msg.designW <= 0 || msg.implH <= 0 || msg.implW <= 0) {
      figma.ui.postMessage({ type: 'qa-commit-result', error: 'invalid-dimensions' });
      return;
    }
    var exportScale = qaExportScaleForSize(designNode.width, designNode.height);
    var designBytes = await designNode.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: exportScale } });
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
      var kind = qaKind(label);
      if (kind === 'point') {
        var pointX = implRect.x + qaMapNormalized(label.x, implW);
        var pointY = implRect.y + qaMapNormalized(label.y, implH);
        var point = qaPointCallout(i);
        point.resize(16, 16);
        point.x = pointX - 8;
        point.y = pointY - 8;
        board.appendChild(point);
        board.appendChild(qaCaption(i, label, point.x, point.y + 20));
      } else if (kind === 'arrow') {
        var x1 = implRect.x + qaMapNormalized(label.x, implW);
        var y1 = implRect.y + qaMapNormalized(label.y, implH);
        var x2 = implRect.x + qaMapNormalized(label.x2, implW);
        var y2 = implRect.y + qaMapNormalized(label.y2, implH);
        var shaft = qaArrowLine(i, 'shaft', x1, y1, x2, y2);
        board.appendChild(shaft);
        var angle = Math.atan2(y2 - y1, x2 - x1);
        var head = 12;
        board.appendChild(qaArrowLine(i, 'head-a', x2, y2, x2 - Math.cos(angle - Math.PI / 6) * head, y2 - Math.sin(angle - Math.PI / 6) * head));
        board.appendChild(qaArrowLine(i, 'head-b', x2, y2, x2 - Math.cos(angle + Math.PI / 6) * head, y2 - Math.sin(angle + Math.PI / 6) * head));
        board.appendChild(qaCaption(i, label, Math.min(x1, x2), Math.max(y1, y2) + 8));
      } else {
        var box = qaLabelCallout(i);
        var bw = qaMapNormalized(label.w, implW);
        var bh = qaMapNormalized(label.h, implH);
        box.resize(bw, bh);
        box.x = implRect.x + qaMapNormalized(label.x, implW);
        box.y = implRect.y + qaMapNormalized(label.y, implH);
        board.appendChild(box);
        board.appendChild(qaCaption(i, label, box.x, box.y + bh + 4));
      }
    });

    figma.currentPage.appendChild(board);
    tagKlicNode(board, 'qa-diff', {
      designNodeId: msg.designNodeId,
      implImageHash: implImage.hash,
      labelCount: labels.length,
      categories: labels.map(function (l) { return l.category || 'other'; }),
      kinds: labels.map(function (l) { return qaKind(l); }),
    });
    figma.viewport.scrollAndZoomIntoView([board]);
    figma.ui.postMessage({ type: 'qa-commit-result', boardId: board.id, labelCount: labels.length });
  } catch (err) {
    figma.ui.postMessage({ type: 'qa-commit-result', error: 'encode-failed', message: err.message || String(err) });
  }
}
