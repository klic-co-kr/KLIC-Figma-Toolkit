figma.showUI(__html__, { width: 340, height: 720 });

// ── Helpers ───────────────────────────────────────────────────────────────

function hexToColor(hex) {
  var h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16) / 255,
    g: parseInt(h.slice(2, 4), 16) / 255,
    b: parseInt(h.slice(4, 6), 16) / 255,
  };
}

function toHex(r, g, b) {
  return '#' + [r, g, b].map(function(c) {
    return Math.round(Math.min(1, Math.max(0, c)) * 255).toString(16).padStart(2, '0');
  }).join('');
}

function findVar(colName, varName) {
  var cols = figma.variables.getLocalVariableCollections();
  var vars = figma.variables.getLocalVariables();
  var col  = cols.find(function(c) { return c.name === colName; });
  if (!col) return null;
  return vars.find(function(v) { return v.name === varName && v.variableCollectionId === col.id; }) || null;
}

function getVarHex(v) {
  if (!v) return null;
  var modeId = Object.keys(v.valuesByMode)[0];
  var val    = v.valuesByMode[modeId];
  if (!val || typeof val.r !== 'number') return null;
  return toHex(val.r, val.g, val.b);
}

function makeFill(hex, v) {
  var fill = { type: 'SOLID', color: hexToColor(hex) };
  if (v) fill.boundVariables = { color: { type: 'VARIABLE_ALIAS', id: v.id } };
  return fill;
}

// ── Main ──────────────────────────────────────────────────────────────────

figma.ui.onmessage = async function(msg) {
  if (msg.type === 'ready') {
    try {
      var _cols   = figma.variables.getLocalVariableCollections();
      var _vars   = figma.variables.getLocalVariables('COLOR');
      var varList = _vars.map(function(v) {
        var col    = _cols.find(function(c) { return c.id === v.variableCollectionId; });
        var modeId = Object.keys(v.valuesByMode)[0];
        var val    = v.valuesByMode[modeId];
        if (!val || typeof val.r !== 'number') return null;
        var hex = '#' + ['r', 'g', 'b'].map(function(k) {
          return Math.round(Math.min(1, Math.max(0, val[k])) * 255).toString(16).padStart(2, '0');
        }).join('');
        return { id: v.id, name: v.name, collection: col ? col.name : '기타', hex: hex };
      }).filter(Boolean);
      figma.ui.postMessage({ type: 'variables', variables: varList });
    } catch(e) {}
    return;
  }
  if (msg.type !== 'generate-table') return;

  try {
    // ── 폰트 로드: Pretendard → Inter fallback ──
    var fontReg  = { family: 'Inter', style: 'Regular' };
    var fontBold = { family: 'Inter', style: 'Semi Bold' };
    try {
      await figma.loadFontAsync({ family: 'Pretendard', style: 'Regular' });
      await figma.loadFontAsync({ family: 'Pretendard', style: 'SemiBold' });
      fontReg  = { family: 'Pretendard', style: 'Regular' };
      fontBold = { family: 'Pretendard', style: 'SemiBold' };
    } catch(e) {
      await figma.loadFontAsync(fontReg);
      try {
        await figma.loadFontAsync(fontBold);
      } catch(e2) {
        fontBold = { family: 'Inter', style: 'Bold' };
        await figma.loadFontAsync(fontBold);
      }
    }

    var headerRows = msg.headerRows || [];
    var bodyRows   = msg.bodyRows   || [];
    var footerRows = msg.footerRows || [];
    var striped    = msg.striped;
    var paddingV   = msg.paddingV   || 12;
    var paddingH   = msg.paddingH   || 16;
    var minColW    = msg.minColW    || 0;
    var fontSize   = msg.fontSize   || 18;
    var minRowH    = msg.minRowH    || 0;
    var tableWidth = msg.tableWidth || 0;
    var clrs       = msg.colors     || {};

    var allRows = headerRows.concat(bodyRows).concat(footerRows);
    var numCols = allRows.reduce(function(m, r) { return Math.max(m, r.length); }, 0);
    if (numCols === 0) {
      figma.ui.postMessage({ type: 'error', message: '데이터가 없습니다.' });
      return;
    }

    // ── 색상 설정 ──
    function makeColorFill(cfg, fallbackHex) {
      var hex  = (cfg && cfg.hex && /^#[0-9a-fA-F]{6}$/.test(cfg.hex)) ? cfg.hex : fallbackHex;
      var fill = { type: 'SOLID', color: hexToColor(hex) };
      if (cfg && cfg.varId) {
        try {
          var v = figma.variables.getVariableById(cfg.varId);
          if (v) fill.boundVariables = { color: { type: 'VARIABLE_ALIAS', id: cfg.varId } };
        } catch(e) {}
      }
      return fill;
    }

    var borderFill   = makeColorFill(clrs.border,   '#D5D5D5');
    var headerBgFill = makeColorFill(clrs.headerBg, '#f7f7f7');
    var footerBgFill = makeColorFill(clrs.footerBg, '#f7f7f7');
    var altBgFill    = makeColorFill(clrs.altBg,    '#f8fafc');
    var cellBgFill   = makeColorFill(clrs.cellBg,   '#ffffff');

    // 본문 텍스트: Gray/90 자동 감지
    var bodyTextVar = findVar('컬러/그레이', 'Gray/90');
    var bodyTextHex = getVarHex(bodyTextVar) || '#1e293b';

    // ── 열 너비 계산 ──
    var rawWidths = [];
    for (var ci = 0; ci < numCols; ci++) {
      var maxW = 0;
      allRows.forEach(function(row) {
        var lines = (row[ci] || '').split('\n');
        lines.forEach(function(line) {
          var w = 0;
          for (var k = 0; k < line.length; k++) {
            var code = line.charCodeAt(k);
            var isFullWidth = (code >= 0xAC00 && code <= 0xD7AF)
                           || (code >= 0x3000 && code <= 0x9FFF)
                           || (code >= 0xFF00 && code <= 0xFFEF);
            w += isFullWidth ? fontSize : fontSize * 0.6;
          }
          if (w > maxW) maxW = w;
        });
      });
      rawWidths.push(Math.ceil(maxW) + paddingH * 2 + 8);
    }

    var colWidths;
    if (tableWidth > 0) {
      var totalRaw = rawWidths.reduce(function(a, b) { return a + b; }, 0) || 1;
      colWidths = rawWidths.map(function(w) {
        return Math.max(minColW, Math.round(tableWidth * w / totalRaw));
      });
    } else {
      colWidths = rawWidths.map(function(w) {
        return Math.min(320, Math.max(minColW, w));
      });
    }

    // ── 테이블 프레임 ──
    var table = figma.createFrame();
    table.name = '테이블';
    table.layoutMode = 'VERTICAL';
    table.primaryAxisSizingMode  = 'AUTO';
    table.counterAxisSizingMode  = 'AUTO';
    table.itemSpacing   = 1;
    table.paddingTop    = 1; table.paddingBottom = 1;
    table.paddingLeft   = 0; table.paddingRight  = 0;
    table.fills         = [borderFill];
    table.clipsContent  = true;

    // ── 행 생성 헬퍼 ──
    function buildRow(rowData, rowName, cellFill, font) {
      var rowCells = [];
      var rowFrame = figma.createFrame();
      rowFrame.name = rowName;
      rowFrame.layoutMode = 'HORIZONTAL';
      rowFrame.primaryAxisSizingMode = 'AUTO';
      rowFrame.counterAxisSizingMode = 'AUTO';
      rowFrame.itemSpacing = 1;
      rowFrame.fills = [];

      for (var ci = 0; ci < numCols; ci++) {
        var cellText = rowData[ci] !== undefined ? String(rowData[ci]) : '';

        var cell = figma.createFrame();
        cell.name = rowName + '-' + ci;
        cell.layoutMode = 'HORIZONTAL';
        cell.paddingTop    = paddingV; cell.paddingBottom = paddingV;
        cell.paddingLeft   = paddingH; cell.paddingRight  = paddingH;
        cell.primaryAxisAlignItems  = 'MIN';
        cell.counterAxisAlignItems  = 'CENTER';
        cell.primaryAxisSizingMode  = 'FIXED';
        cell.counterAxisSizingMode  = 'AUTO';
        cell.resize(colWidths[ci], 10);
        cell.fills = [cellFill];

        var t = figma.createText();
        t.fontName   = font;
        t.fontSize   = fontSize;
        t.lineHeight = { unit: 'PERCENT', value: 150 };
        t.characters = cellText || ' ';
        t.textAlignHorizontal = 'CENTER';
        t.textAutoResize = 'HEIGHT';
        t.resize(colWidths[ci] - paddingH * 2, t.height);
        t.fills = [makeFill(bodyTextHex, bodyTextVar)];

        cell.appendChild(t);
        rowFrame.appendChild(cell);
        rowCells.push(cell);
      }

      // 행 높이 통일: 가장 높은 셀 기준, minRowH 이상
      var maxH = minRowH;
      rowCells.forEach(function(c) { if (c.height > maxH) maxH = c.height; });
      if (maxH > 0) {
        rowFrame.counterAxisSizingMode = 'FIXED';
        rowFrame.resize(rowFrame.width, maxH);
        rowCells.forEach(function(c) { c.layoutSizingVertical = 'FILL'; });
      }

      return rowFrame;
    }

    // ── 헤더 행 ──
    headerRows.forEach(function(rowData, i) {
      table.appendChild(buildRow(rowData, '헤더 ' + (i + 1), headerBgFill, fontBold));
    });

    // ── 바디 행 ──
    bodyRows.forEach(function(rowData, i) {
      var fill = (striped && i % 2 === 1) ? altBgFill : cellBgFill;
      table.appendChild(buildRow(rowData, '행 ' + (i + 1), fill, fontReg));
    });

    // ── 푸터 행 ──
    footerRows.forEach(function(rowData, i) {
      table.appendChild(buildRow(rowData, '푸터 ' + (i + 1), footerBgFill, fontBold));
    });

    // ── 뷰포트 중앙 배치 ──
    var vc = figma.viewport.center;
    table.x = Math.round(vc.x - table.width  / 2);
    table.y = Math.round(vc.y - table.height / 2);

    figma.currentPage.appendChild(table);
    figma.currentPage.selection = [table];
    figma.viewport.scrollAndZoomIntoView([table]);

    figma.ui.postMessage({ type: 'done', rows: allRows.length, cols: numCols });

  } catch(err) {
    figma.ui.postMessage({ type: 'error', message: err.message || String(err) });
  }
};
