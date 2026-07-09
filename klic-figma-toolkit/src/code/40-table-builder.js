/* ═══════════════════════════════════════════════════════════════════════════
   MODULE: TABLE GENERATOR
   ═══════════════════════════════════════════════════════════════════════════ */

function tHexToColor(hex) {
  var h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16) / 255,
    g: parseInt(h.slice(2, 4), 16) / 255,
    b: parseInt(h.slice(4, 6), 16) / 255,
  };
}

function tToHex(r, g, b) {
  return '#' + [r, g, b].map(function (c) {
    return Math.round(Math.min(1, Math.max(0, c)) * 255).toString(16).padStart(2, '0');
  }).join('');
}

async function tFindVar(colName, varName) {
  var cols = await commandGetLocalVariableCollections();
  var vars = await commandGetLocalVariables();
  var col = cols.find(function (c) { return c.name === colName; });
  if (!col) return null;
  return vars.find(function (v) { return v.name === varName && v.variableCollectionId === col.id; }) || null;
}

function tGetVarHex(v) {
  if (!v) return null;
  var modeId = Object.keys(v.valuesByMode)[0];
  var val = v.valuesByMode[modeId];
  if (!val || typeof val.r !== 'number') return null;
  return tToHex(val.r, val.g, val.b);
}

function tMakeFill(hex, v) {
  var fill = { type: 'SOLID', color: tHexToColor(hex) };
  if (v) fill.boundVariables = { color: { type: 'VARIABLE_ALIAS', id: v.id } };
  return fill;
}

async function sendTableVariables() {
  try {
    var _cols = await commandGetLocalVariableCollections();
    var _vars = await commandGetLocalVariables('COLOR');
    var varList = _vars.map(function (v) {
      var col = _cols.find(function (c) { return c.id === v.variableCollectionId; });
      var modeId = Object.keys(v.valuesByMode)[0];
      var val = v.valuesByMode[modeId];
      if (!val || typeof val.r !== 'number') return null;
      var hex = '#' + ['r', 'g', 'b'].map(function (k) {
        return Math.round(Math.min(1, Math.max(0, val[k])) * 255).toString(16).padStart(2, '0');
      }).join('');
      return { id: v.id, name: v.name, collection: col ? col.name : 'Other', hex: hex };
    }).filter(Boolean);
    figma.ui.postMessage({ type: 'table-variables', variables: varList });
  } catch (e) {
    figma.ui.postMessage({ type: 'table-error', message: e.message || String(e) });
  }
}

async function generateTable(msg) {
  try {
    if (!msg || typeof msg !== 'object') throw new Error('Invalid table request.');
    var fontReg = { family: 'Inter', style: 'Regular' };
    var fontBold = { family: 'Inter', style: 'Semi Bold' };
    try {
      await figma.loadFontAsync({ family: 'Pretendard', style: 'Regular' });
      await figma.loadFontAsync({ family: 'Pretendard', style: 'SemiBold' });
      fontReg = { family: 'Pretendard', style: 'Regular' };
      fontBold = { family: 'Pretendard', style: 'SemiBold' };
    } catch (e) {
      await figma.loadFontAsync(fontReg);
      try {
        await figma.loadFontAsync(fontBold);
      } catch (e2) {
        fontBold = { family: 'Inter', style: 'Bold' };
        await figma.loadFontAsync(fontBold);
      }
    }

    var headerRows = msg.headerRows || [];
    var bodyRows = msg.bodyRows || [];
    var footerRows = msg.footerRows || [];
    var striped = msg.striped;
    var paddingV = msg.paddingV || 12;
    var paddingH = msg.paddingH || 16;
    var minColW = msg.minColW || 0;
    var fontSize = msg.fontSize || 18;
    var minRowH = msg.minRowH || 0;
    var tableWidth = msg.tableWidth || 0;
    var clrs = msg.colors || {};
    var columnAlignments = Array.isArray(msg.columnAlignments) ? msg.columnAlignments : [];

    var allRows = headerRows.concat(bodyRows).concat(footerRows);
    if (allRows.some(function (row) { return !Array.isArray(row); })) throw new Error('Invalid table row.');
    var numCols = allRows.reduce(function (m, r) { return Math.max(m, r.length); }, 0);
    if (numCols === 0) {
      figma.ui.postMessage({ type: 'table-error', message: 'No data.' });
      return;
    }
    if (allRows.length > 500) throw new Error('Table generation is limited to 500 rows.');
    if (numCols > 50) throw new Error('Table generation is limited to 50 columns.');
    if (allRows.some(function (row) { return row.some(function (cell) { return String(cell == null ? '' : cell).length > 10000; }); })) {
      throw new Error('Table cells are limited to 10,000 characters.');
    }
    paddingV = Math.max(0, Math.min(64, Number(paddingV) || 12));
    paddingH = Math.max(0, Math.min(96, Number(paddingH) || 16));
    minColW = Math.max(0, Math.min(1000, Number(minColW) || 0));
    fontSize = Math.max(1, Math.min(256, Number(fontSize) || 18));
    minRowH = Math.max(0, Math.min(2000, Number(minRowH) || 0));
    tableWidth = Math.max(0, Math.min(100000, Number(tableWidth) || 0));

    async function makeColorFill(cfg, fallbackHex) {
      var hex = (cfg && cfg.hex && /^#[0-9a-fA-F]{6}$/.test(cfg.hex)) ? cfg.hex : fallbackHex;
      var fill = { type: 'SOLID', color: tHexToColor(hex) };
      if (cfg && cfg.varId) {
        try {
          var v = await commandGetVariableById(cfg.varId);
          if (v) fill.boundVariables = { color: { type: 'VARIABLE_ALIAS', id: cfg.varId } };
        } catch (e) { }
      }
      return fill;
    }

    var borderFill = await makeColorFill(clrs.border, '#D5D5D5');
    var headerBgFill = await makeColorFill(clrs.headerBg, '#f7f7f7');
    var footerBgFill = await makeColorFill(clrs.footerBg, '#f7f7f7');
    var altBgFill = await makeColorFill(clrs.altBg, '#f8fafc');
    var cellBgFill = await makeColorFill(clrs.cellBg, '#ffffff');

    var bodyTextVar = await tFindVar('컬러/그레이', 'Gray/90');
    var bodyTextHex = tGetVarHex(bodyTextVar) || '#1e293b';

    var rawWidths = [];
    for (var ci = 0; ci < numCols; ci++) {
      var maxW = 0;
      allRows.forEach(function (row) {
        var lines = (row[ci] || '').split('\n');
        lines.forEach(function (line) {
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
      var totalRaw = rawWidths.reduce(function (a, b) { return a + b; }, 0) || 1;
      colWidths = rawWidths.map(function (w) {
        return Math.max(paddingH * 2 + 1, minColW, Math.round(tableWidth * w / totalRaw));
      });
    } else {
      colWidths = rawWidths.map(function (w) {
        return Math.max(paddingH * 2 + 1, Math.min(320, Math.max(minColW, w)));
      });
    }

    var table = figma.createFrame();
    table.name = 'Table';
    table.layoutMode = 'VERTICAL';
    table.primaryAxisSizingMode = 'AUTO';
    table.counterAxisSizingMode = 'AUTO';
    table.itemSpacing = 1;
    table.paddingTop = 1; table.paddingBottom = 1;
    table.paddingLeft = 0; table.paddingRight = 0;
    table.fills = [borderFill];
    table.clipsContent = true;

    function buildRow(rowData, rowName, cellFill, font) {
      var rowCells = [];
      var rowFrame = figma.createFrame();
      rowFrame.name = rowName;
      rowFrame.layoutMode = 'HORIZONTAL';
      rowFrame.primaryAxisSizingMode = 'AUTO';
      rowFrame.counterAxisSizingMode = 'AUTO';
      rowFrame.itemSpacing = 1;
      rowFrame.fills = [];

      for (var ci2 = 0; ci2 < numCols; ci2++) {
        var cellText = rowData[ci2] !== undefined ? String(rowData[ci2]) : '';

        var cell = figma.createFrame();
        cell.name = rowName + '-' + ci2;
        cell.layoutMode = 'HORIZONTAL';
        cell.paddingTop = paddingV; cell.paddingBottom = paddingV;
        cell.paddingLeft = paddingH; cell.paddingRight = paddingH;
        cell.primaryAxisAlignItems = 'MIN';
        cell.counterAxisAlignItems = 'CENTER';
        cell.primaryAxisSizingMode = 'FIXED';
        cell.counterAxisSizingMode = 'AUTO';
        cell.resize(colWidths[ci2], 10);
        cell.fills = [cellFill];

        var t = figma.createText();
        t.fontName = font;
        t.fontSize = fontSize;
        t.lineHeight = { unit: 'PERCENT', value: 150 };
        t.characters = cellText || ' ';
        var colAlign = columnAlignments[ci2] || 'center';
        t.textAlignHorizontal = colAlign === 'right' ? 'RIGHT' : (colAlign === 'left' ? 'LEFT' : 'CENTER');
        t.textAutoResize = 'HEIGHT';
        t.resize(colWidths[ci2] - paddingH * 2, t.height);
        t.fills = [tMakeFill(bodyTextHex, bodyTextVar)];

        cell.appendChild(t);
        rowFrame.appendChild(cell);
        rowCells.push(cell);
      }

      var maxH = minRowH;
      rowCells.forEach(function (c) { if (c.height > maxH) maxH = c.height; });
      if (maxH > 0) {
        rowFrame.counterAxisSizingMode = 'FIXED';
        rowFrame.resize(rowFrame.width, maxH);
        rowCells.forEach(function (c) { c.layoutSizingVertical = 'FILL'; });
      }

      return rowFrame;
    }

    headerRows.forEach(function (rowData, i) {
      table.appendChild(buildRow(rowData, 'Header ' + (i + 1), headerBgFill, fontBold));
    });

    bodyRows.forEach(function (rowData, i) {
      var fill = (striped && i % 2 === 1) ? altBgFill : cellBgFill;
      table.appendChild(buildRow(rowData, 'Row ' + (i + 1), fill, fontReg));
    });

    footerRows.forEach(function (rowData, i) {
      table.appendChild(buildRow(rowData, 'Footer ' + (i + 1), footerBgFill, fontBold));
    });

    var vc = figma.viewport.center;
    table.x = Math.round(vc.x - table.width / 2);
    table.y = Math.round(vc.y - table.height / 2);

    figma.currentPage.appendChild(table);
    tagKlicNode(table, 'table-builder', Object.assign({
      source: 'table-generator',
      rows: allRows.length,
      cols: numCols,
      tableConfig: msg.meta && msg.meta.tableConfig,
    }, msg.meta || {}));
    figma.currentPage.selection = [table];
    figma.viewport.scrollAndZoomIntoView([table]);

    figma.ui.postMessage({ type: 'table-done', rows: allRows.length, cols: numCols });

  } catch (err) {
    figma.ui.postMessage({ type: 'table-error', message: err.message || String(err) });
  }
}
