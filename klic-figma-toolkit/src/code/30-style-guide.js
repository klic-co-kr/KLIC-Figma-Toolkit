/* ═══════════════════════════════════════════════════════════════════════════
   MODULE: STYLE GUIDE VARIABLE GENERATOR
   ═══════════════════════════════════════════════════════════════════════════ */

/* ─── Font search ────────────────────────────────────────────────────── */
var styleFontFamiliesCache = null;
var styleFontFamiliesInflight = null;

async function styleGetFontFamilies() {
  if (styleFontFamiliesCache) return styleFontFamiliesCache;
  if (styleFontFamiliesInflight) return styleFontFamiliesInflight;
  styleFontFamiliesInflight = figma.listAvailableFontsAsync().then(function (all) {
    var seen = {};
    var families = [];
    for (var i = 0; i < all.length; i++) {
      var fam = all[i].fontName.family;
      if (!seen[fam]) {
        seen[fam] = true;
        families.push(fam);
      }
    }
    families.sort();
    styleFontFamiliesCache = families;
    styleFontFamiliesInflight = null;
    return families;
  }).catch(function (err) {
    styleFontFamiliesInflight = null;
    throw err;
  });
  return styleFontFamiliesInflight;
}

async function searchFonts(query, requestId) {
  try {
    var cached = !!styleFontFamiliesCache;
    var families = await styleGetFontFamilies();
    var lower = (query || '').toLowerCase();
    var results = [];
    for (var i = 0; i < families.length; i++) {
      if (!lower || families[i].toLowerCase().indexOf(lower) >= 0) results.push(families[i]);
    }
    figma.ui.postMessage({ type: 'style-font-result', families: results.slice(0, 40), requestId: requestId, cached: cached });
  } catch (e) {
    figma.ui.postMessage({ type: 'style-font-result', families: [], requestId: requestId });
  }
}

/* ─── Variables creation ──────────────────────────────────────────────── */
function hexToFigmaColor(hex) {
  var h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16) / 255,
    g: parseInt(h.slice(2, 4), 16) / 255,
    b: parseInt(h.slice(4, 6), 16) / 255,
  };
}

async function getOrCreateCollection(name) {
  return (await commandGetLocalVariableCollections()).find(function (c) { return c.name === name; })
    || figma.variables.createVariableCollection(name);
}

async function setColorVar(collection, name, hex) {
  var modeId = collection.defaultModeId;
  var existing = (await commandGetLocalVariables())
    .find(function (v) { return v.name === name && v.variableCollectionId === collection.id; });
  var v = existing || figma.variables.createVariable(name, collection, 'COLOR');
  v.setValueForMode(modeId, hexToFigmaColor(hex));
}

async function setFloatVar(collection, name, value) {
  var modeId = collection.defaultModeId;
  var existing = (await commandGetLocalVariables())
    .find(function (v) { return v.name === name && v.variableCollectionId === collection.id; });
  var v = existing || figma.variables.createVariable(name, collection, 'FLOAT');
  v.setValueForMode(modeId, value);
}

async function createVariables(data) {
  var total = 0;
  for (var colorData of Object.values(data.brand)) total += Object.keys(colorData.scale).length;
  total += Object.keys(data.gray.scale).length;
  for (var sem of Object.values(data.semantic)) total += Object.keys(sem).length;
  total += data.spacing.length + data.radius.length;

  var done = 0;
  function report(name) {
    done++;
    figma.ui.postMessage({ type: 'style-progress', current: done, total: total, name: name });
  }

  try {
    var brandCol = await getOrCreateCollection('컬러/브랜드');
    for (var colorName of Object.keys(data.brand)) {
      var colorData2 = data.brand[colorName];
      for (var step of Object.keys(colorData2.scale)) {
        await setColorVar(brandCol, colorName + '/' + step, colorData2.scale[step]);
        report(colorName + '/' + step);
      }
    }

    var grayCol = await getOrCreateCollection('컬러/그레이');
    for (var step2 of Object.keys(data.gray.scale)) {
      await setColorVar(grayCol, 'Gray/' + step2, data.gray.scale[step2]);
      report('Gray/' + step2);
    }

    var semanticCol = await getOrCreateCollection('컬러/시맨틱');
    var variantLabel = { base: 'Base', background: 'Background', line: 'Line', text: 'Text' };
    for (var cn of Object.keys(data.semantic)) {
      var variants = data.semantic[cn];
      for (var variant of Object.keys(variants)) {
        await setColorVar(semanticCol, cn + '/' + (variantLabel[variant] || variant), variants[variant]);
        report(cn + '/' + variant);
      }
    }

    var spacingCol = await getOrCreateCollection('여백(Spacing)');
    for (var sv of data.spacing) {
      await setFloatVar(spacingCol, 'spacing-' + sv, sv);
      report('spacing-' + sv);
    }

    var radiusCol = await getOrCreateCollection('둥글기(Radius)');
    for (var rv of data.radius) {
      await setFloatVar(radiusCol, 'radius-' + rv, rv);
      report('radius-' + rv);
    }

    figma.ui.postMessage({ type: 'style-done', count: total });
  } catch (err) {
    figma.ui.postMessage({ type: 'style-error', message: err.message });
  }
}

/* ─── Style Guide Board Drawing ───────────────────────────────────────── */
var SG_STEPS = [5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 100];

function sgRgb(hex) {
  var h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16) / 255,
    g: parseInt(h.slice(2, 4), 16) / 255,
    b: parseInt(h.slice(4, 6), 16) / 255,
  };
}

function sgLum(hex) {
  var c = sgRgb(hex);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}

async function drawStyleGuide(data, meta) {
  try {
    figma.ui.postMessage({ type: 'style-draw-progress', msg: 'Loading fonts...' });

    var allFonts = await figma.listAvailableFontsAsync();

    var fontMap = {};
    for (var fmi = 0; fmi < allFonts.length; fmi++) {
      var fn = allFonts[fmi].fontName;
      if (!fontMap[fn.family]) fontMap[fn.family] = {};
      fontMap[fn.family][fn.style] = true;
    }

    function findFamily(name) {
      var lower = name.toLowerCase();
      for (var fam in fontMap) { if (fam.toLowerCase() === lower) return fam; }
      for (var fam2 in fontMap) { if (fam2.toLowerCase().indexOf(lower) === 0) return fam2; }
      return null;
    }

    async function loadFamily(family) {
      var styles = fontMap[family];
      if (!styles || !styles['Regular']) return null;
      await figma.loadFontAsync({ family: family, style: 'Regular' });
      var regular = { family: family, style: 'Regular' };
      var medium = regular, semibold = regular, bold = regular, extrabold = regular;
      for (var mi2 of ['Medium', 'DemiBold']) {
        if (styles[mi2]) { await figma.loadFontAsync({ family: family, style: mi2 }); medium = { family: family, style: mi2 }; break; }
      }
      for (var si2 of ['SemiBold', 'Semi Bold']) {
        if (styles[si2]) { await figma.loadFontAsync({ family: family, style: si2 }); semibold = { family: family, style: si2 }; break; }
      }
      for (var bi2 of ['Bold']) {
        if (styles[bi2]) { await figma.loadFontAsync({ family: family, style: bi2 }); bold = { family: family, style: bi2 }; break; }
      }
      for (var ei2 of ['ExtraBold', 'Extra Bold', 'Heavy']) {
        if (styles[ei2]) { await figma.loadFontAsync({ family: family, style: ei2 }); extrabold = { family: family, style: ei2 }; break; }
      }
      return { regular: regular, medium: medium, semibold: semibold, bold: bold, extrabold: extrabold };
    }

    var F = null;

    if (data.fontFamily) {
      var preferred = findFamily(data.fontFamily);
      if (preferred) F = await loadFamily(preferred);
    }

    if (!F) {
      var fallbacks = ['Inter', 'Roboto', 'Noto Sans', 'SF Pro Text', 'Helvetica Neue'];
      for (var fbi = 0; fbi < fallbacks.length; fbi++) {
        var fb = findFamily(fallbacks[fbi]);
        if (fb) { F = await loadFamily(fb); if (F) break; }
      }
    }

    if (!F) {
      for (var fam3 in fontMap) {
        if (fontMap[fam3]['Regular']) { F = await loadFamily(fam3); if (F) break; }
      }
    }

    if (!F) {
      figma.ui.postMessage({ type: 'style-error', message: 'No usable font found.' });
      return;
    }

    figma.ui.postMessage({ type: 'style-draw-progress', msg: 'Font loaded: ' + F.regular.family + ' ' + F.regular.style });

    figma.ui.postMessage({ type: 'style-draw-progress', msg: 'Creating text styles...' });
    function weightToFKey(w) {
      return w >= 700 ? 'bold' : w >= 500 ? 'medium' : 'regular';
    }
    var TS_DEF;
    if (data.typeSizes && data.typeSizes.length) {
      TS_DEF = data.typeSizes.map(function (ts) {
        var fk = weightToFKey(ts.weight);
        return { name: ts.name, size: ts.size, fKey: fk, info: ts.size + ' / ' + ts.weight };
      });
    } else {
      TS_DEF = [
        { name: 'Display', size: 48, fKey: 'bold', info: '48 / Bold' },
        { name: 'H1', size: 40, fKey: 'bold', info: '40 / Bold' },
        { name: 'H2', size: 32, fKey: 'bold', info: '32 / Bold' },
        { name: 'H3', size: 24, fKey: 'bold', info: '24 / Bold' },
        { name: 'Body Large', size: 18, fKey: 'regular', info: '18 / Regular' },
        { name: 'Body', size: 16, fKey: 'regular', info: '16 / Regular' },
        { name: 'Body Small', size: 14, fKey: 'regular', info: '14 / Regular' },
        { name: 'Caption', size: 12, fKey: 'regular', info: '12 / Regular' },
        { name: 'Caption SM', size: 11, fKey: 'regular', info: '11 / Regular' },
      ];
    }
    var existTs = await commandGetLocalTextStyles();
    for (var tsi = 0; tsi < TS_DEF.length; tsi++) {
      var td = TS_DEF[tsi];
      var found = null;
      for (var fi2 = 0; fi2 < existTs.length; fi2++) {
        if (existTs[fi2].name === td.name) { found = existTs[fi2]; break; }
      }
      var ts = found || figma.createTextStyle();
      ts.name = td.name;
      ts.fontName = F[td.fKey] || F.regular;
      ts.fontSize = td.size;
      ts.lineHeight = { unit: 'PERCENT', value: 150 };
    }

    figma.ui.postMessage({ type: 'style-draw-progress', msg: 'Building board...' });

    var BOARD_W = 1200;
    var PAD = 64;
    var INNER_W = BOARD_W - PAD * 2;

    var board = figma.createFrame();
    board.name = 'Style Guide Board';
    board.layoutMode = 'VERTICAL';
    board.primaryAxisSizingMode = 'AUTO';
    board.counterAxisSizingMode = 'FIXED';
    board.resize(BOARD_W, 100);
    board.paddingTop = PAD;
    board.paddingRight = PAD;
    board.paddingBottom = PAD;
    board.paddingLeft = PAD;
    board.itemSpacing = 40;
    board.fills = [{ type: 'SOLID', color: { r: 0.978, g: 0.976, b: 0.993 } }];
    board.cornerRadius = 16;
    figma.currentPage.appendChild(board);
    board.x = 200;
    board.y = 200;

    function mkText(chars, size, fKey, col) {
      var t = figma.createText();
      t.fontName = F[fKey] || F.regular;
      t.characters = String(chars);
      t.fontSize = size;
      t.fills = [{ type: 'SOLID', color: col || { r: 0.08, g: 0.08, b: 0.14 } }];
      return t;
    }

    function mkRect(w, h, col, corner, strokeCol) {
      var r = figma.createRectangle();
      r.resize(w, h);
      r.fills = [{ type: 'SOLID', color: col }];
      if (corner) r.cornerRadius = corner;
      if (strokeCol) {
        r.strokes = [{ type: 'SOLID', color: strokeCol }];
        r.strokeWeight = 1;
      }
      return r;
    }

    function hBox(name, gap, align) {
      var f = figma.createFrame();
      f.name = name;
      f.layoutMode = 'HORIZONTAL';
      f.primaryAxisSizingMode = 'AUTO';
      f.counterAxisSizingMode = 'AUTO';
      f.itemSpacing = gap || 8;
      f.counterAxisAlignItems = align || 'CENTER';
      f.fills = [];
      return f;
    }

    function vBox(name, gap) {
      var f = figma.createFrame();
      f.name = name;
      f.layoutMode = 'VERTICAL';
      f.primaryAxisSizingMode = 'AUTO';
      f.counterAxisSizingMode = 'AUTO';
      f.itemSpacing = gap || 4;
      f.counterAxisAlignItems = 'CENTER';
      f.fills = [];
      return f;
    }

    function labelBox(text, w) {
      var f = figma.createFrame();
      f.name = 'label';
      f.layoutMode = 'HORIZONTAL';
      f.primaryAxisSizingMode = 'FIXED';
      f.counterAxisSizingMode = 'AUTO';
      f.counterAxisAlignItems = 'CENTER';
      f.resize(w, 36);
      f.fills = [];
      f.appendChild(mkText(text, 12, 'medium', { r: 0.35, g: 0.35, b: 0.42 }));
      return f;
    }

    function sectionDivider() {
      var r = mkRect(INNER_W, 1, { r: 0.86, g: 0.86, b: 0.91 });
      r.name = 'divider';
      return r;
    }

    var _vcache = {
      cols: await commandGetLocalVariableCollections(),
      vars: await commandGetLocalVariables(),
    };
    function getVar(colName, vName) {
      var col = null;
      for (var i = 0; i < _vcache.cols.length; i++) {
        if (_vcache.cols[i].name === colName) { col = _vcache.cols[i]; break; }
      }
      if (!col) return null;
      for (var j = 0; j < _vcache.vars.length; j++) {
        if (_vcache.vars[j].name === vName && _vcache.vars[j].variableCollectionId === col.id) return _vcache.vars[j];
      }
      return null;
    }
    function varFill(hex, v) {
      var fill = { type: 'SOLID', color: sgRgb(hex) };
      if (v) fill.boundVariables = { color: { type: 'VARIABLE_ALIAS', id: v.id } };
      return fill;
    }

    function colorScaleRow(name, scale, collection) {
      var SW = 42, GAP = 5;
      var row = hBox('color/' + name, 12, 'MIN');
      row.appendChild(labelBox(name, 100));

      var swatchRow = hBox('swatches', GAP, 'MIN');
      SG_STEPS.forEach(function (step) {
        var hex = scale[step];
        var isLight = sgLum(hex) > 0.82;
        var cell = vBox('swatch-' + step, 3);

        var sw = mkRect(SW, SW, sgRgb(hex), 6,
          isLight ? { r: 0.8, g: 0.8, b: 0.86 } : null);
        sw.name = String(step);
        var cv = collection ? getVar(collection, name + '/' + step) : null;
        if (cv) sw.fills = [varFill(hex, cv)];

        var lbl = mkText(String(step), 9, 'regular', { r: 0.55, g: 0.55, b: 0.63 });
        cell.appendChild(sw);
        cell.appendChild(lbl);
        swatchRow.appendChild(cell);
      });

      row.appendChild(swatchRow);
      return row;
    }

    function semanticRow(name, variants) {
      var CW = 72, CH = 44;
      var VNAMES = { base: 'Base', background: 'BG', line: 'Line', text: 'Text' };
      var row = hBox('semantic/' + name, 12, 'MIN');
      row.appendChild(labelBox(name, 100));

      var chips = hBox('chips', 8, 'MIN');
      var keys = Object.keys(variants);
      for (var ki = 0; ki < keys.length; ki++) {
        var key = keys[ki];
        var hex = variants[key];
        var isLight = sgLum(hex) > 0.82;
        var cell = vBox('chip-' + key, 4);
        var sw = mkRect(CW, CH, sgRgb(hex), 8,
          isLight ? { r: 0.8, g: 0.8, b: 0.86 } : null);
        sw.name = VNAMES[key] || key;
        var SEMVARNAMES = { base: 'Base', background: 'Background', line: 'Line', text: 'Text' };
        var semv = getVar('컬러/시맨틱', name + '/' + (SEMVARNAMES[key] || key));
        if (semv) sw.fills = [varFill(hex, semv)];
        var lbl = mkText(VNAMES[key] || key, 9, 'regular', { r: 0.5, g: 0.5, b: 0.58 });
        cell.appendChild(sw);
        cell.appendChild(lbl);
        chips.appendChild(cell);
      }
      row.appendChild(chips);
      return row;
    }

    function spacingSection(spacing) {
      var wrap = figma.createFrame();
      wrap.name = 'spacing-items';
      wrap.layoutMode = 'HORIZONTAL';
      wrap.primaryAxisSizingMode = 'AUTO';
      wrap.counterAxisSizingMode = 'AUTO';
      wrap.itemSpacing = 24;
      wrap.fills = [];
      try { wrap.layoutWrap = 'WRAP'; } catch (e) { }

      spacing.forEach(function (val) {
        var item = hBox('sp-' + val, 6, 'CENTER');
        var numLbl = mkText(String(val), 11, 'medium', { r: 0.35, g: 0.35, b: 0.46 });
        var pxLbl = mkText('px', 9, 'regular', { r: 0.6, g: 0.6, b: 0.66 });
        var bar = mkRect(val, 18, { r: 0.25, g: 0.54, b: 0.96 }, 4);
        bar.name = val + 'px';
        var spv = getVar('여백(Spacing)', 'spacing-' + val);
        if (spv) { try { bar.setBoundVariable('width', spv); } catch (e) { } }
        item.appendChild(numLbl);
        item.appendChild(pxLbl);
        item.appendChild(bar);
        wrap.appendChild(item);
      });
      return wrap;
    }

    function radiusSection(radius) {
      var wrap = figma.createFrame();
      wrap.name = 'radius-items';
      wrap.layoutMode = 'HORIZONTAL';
      wrap.primaryAxisSizingMode = 'AUTO';
      wrap.counterAxisSizingMode = 'AUTO';
      wrap.itemSpacing = 20;
      wrap.fills = [];
      try { wrap.layoutWrap = 'WRAP'; } catch (e) { }

      radius.forEach(function (val) {
        var cell = vBox('radius-' + val, 6);
        var SIZE = 56;
        var r = figma.createRectangle();
        r.name = val + 'px';
        r.resize(SIZE, SIZE);
        r.cornerRadius = Math.min(val, SIZE / 2);
        r.fills = [{ type: 'SOLID', color: { r: 0.25, g: 0.54, b: 0.96 }, opacity: 0.1 }];
        r.strokes = [{ type: 'SOLID', color: { r: 0.25, g: 0.54, b: 0.96 } }];
        r.strokeWeight = 1.5;
        var rrv = getVar('둥글기(Radius)', 'radius-' + val);
        if (rrv) {
          try {
            r.setBoundVariable('topLeftRadius', rrv);
            r.setBoundVariable('topRightRadius', rrv);
            r.setBoundVariable('bottomRightRadius', rrv);
            r.setBoundVariable('bottomLeftRadius', rrv);
          } catch (e) { }
        }
        var lbl = mkText(val + 'px', 10, 'medium', { r: 0.35, g: 0.35, b: 0.46 });
        cell.appendChild(r);
        cell.appendChild(lbl);
        wrap.appendChild(cell);
      });
      return wrap;
    }

    function typographySection() {
      var outer = figma.createFrame();
      outer.name = 'typography-items';
      outer.layoutMode = 'VERTICAL';
      outer.primaryAxisSizingMode = 'AUTO';
      outer.counterAxisSizingMode = 'AUTO';
      outer.counterAxisAlignItems = 'MIN';
      outer.itemSpacing = 32;
      outer.fills = [];

      var sizeBlock = figma.createFrame();
      sizeBlock.name = 'font-size-scale';
      sizeBlock.layoutMode = 'VERTICAL';
      sizeBlock.primaryAxisSizingMode = 'AUTO';
      sizeBlock.counterAxisSizingMode = 'AUTO';
      sizeBlock.counterAxisAlignItems = 'MIN';
      sizeBlock.itemSpacing = 8;
      sizeBlock.fills = [];
      sizeBlock.appendChild(mkText('Font Size Scale', 11, 'medium', { r: 0.5, g: 0.5, b: 0.58 }));
      [10, 11, 12, 13, 14, 16, 18, 20, 24, 28, 32, 36, 40, 48].forEach(function (sz) {
        var row = hBox('size-' + sz, 16, 'CENTER');
        row.appendChild(labelBox(sz + 'px', 48));
        row.appendChild(mkText('가나다 AaBbCc 123', sz, 'regular', { r: 0, g: 0, b: 0 }));
        sizeBlock.appendChild(row);
      });
      outer.appendChild(sizeBlock);

      var typeBlock = figma.createFrame();
      typeBlock.name = 'type-system';
      typeBlock.layoutMode = 'VERTICAL';
      typeBlock.primaryAxisSizingMode = 'AUTO';
      typeBlock.counterAxisSizingMode = 'AUTO';
      typeBlock.counterAxisAlignItems = 'MIN';
      typeBlock.itemSpacing = 10;
      typeBlock.fills = [];
      typeBlock.appendChild(mkText('Type System', 11, 'medium', { r: 0.5, g: 0.5, b: 0.58 }));
      TS_DEF.forEach(function (t) {
        var row = hBox('type-' + t.name, 16, 'CENTER');
        row.appendChild(labelBox(t.name, 100));
        row.appendChild(labelBox(t.info, 112));
        row.appendChild(mkText('가나다 The quick brown fox', t.size, t.fKey, { r: 0, g: 0, b: 0 }));
        typeBlock.appendChild(row);
      });
      outer.appendChild(typeBlock);
      return outer;
    }

    function buttonSection() {
      var white = { r: 1, g: 1, b: 1 };
      var gScale = data.gray ? data.gray.scale : {};
      var g20h = gScale[20] || '#d1d3d9';
      var g50h = gScale[50] || '#686d78';
      var g60h = gScale[60] || '#565b67';

      function deriveFontSize(h) { return h <= 32 ? 12 : h <= 44 ? 14 : 16; }
      function derivePad(h) { return h <= 40 ? 16 : h <= 48 ? 20 : 24; }
      function weightFont(fw) {
        var w = +fw || 400;
        if (w <= 400) return F.regular;
        if (w <= 500) return F.medium || F.regular;
        if (w <= 650) return F.semibold || F.medium || F.regular;
        if (w <= 750) return F.bold || F.regular;
        return F.extrabold || F.bold || F.regular;
      }

      var SIZES = data.buttonSizes
        ? data.buttonSizes.map(function (sz) {
          return { name: sz.name, h: sz.h, px: derivePad(sz.h), fs: sz.fs || deriveFontSize(sz.h), fw: sz.fw || 400 };
        })
        : [
          { name: 'S', h: 32, px: 12, fs: 12, fw: 400 },
          { name: 'M', h: 40, px: 16, fs: 14, fw: 400 },
          { name: 'L', h: 48, px: 24, fs: 16, fw: 400 },
        ];

      function bFill(hex, colName, vName) {
        return varFill(hex, colName ? getVar(colName, vName) : null);
      }

      function drawBtn(btnName, sz, bgFill, textCol, strokeFill) {
        var btn = figma.createFrame();
        btn.name = btnName;
        btn.layoutMode = 'HORIZONTAL';
        btn.paddingLeft = sz.px;
        btn.paddingRight = sz.px;
        btn.primaryAxisAlignItems = 'CENTER';
        btn.counterAxisAlignItems = 'CENTER';
        btn.cornerRadius = 6;
        btn.fills = bgFill ? [bgFill] : [];
        if (strokeFill) {
          btn.strokes = [strokeFill];
          btn.strokeWeight = 1;
          btn.strokeAlign = 'INSIDE';
        }
        var lbl = figma.createText();
        lbl.fontName = weightFont(sz.fw);
        lbl.characters = 'Button';
        lbl.fontSize = sz.fs;
        lbl.fills = [{ type: 'SOLID', color: textCol }];
        btn.appendChild(lbl);
        btn.primaryAxisSizingMode = 'AUTO';
        btn.counterAxisSizingMode = 'FIXED';
        btn.resize(btn.width, sz.h);
        return btn;
      }

      function makeTypeBlock(typeName, states) {
        var block = figma.createFrame();
        block.name = typeName;
        block.layoutMode = 'VERTICAL';
        block.primaryAxisSizingMode = 'AUTO';
        block.counterAxisSizingMode = 'AUTO';
        block.counterAxisAlignItems = 'MIN';
        block.itemSpacing = 10;
        block.fills = [];
        block.appendChild(mkText(typeName, 11, 'medium', { r: 0.45, g: 0.45, b: 0.52 }));
        states.forEach(function (state) {
          var row = hBox(state.name, 10, 'CENTER');
          row.appendChild(labelBox(state.name, 72));
          SIZES.forEach(function (sz) {
            row.appendChild(drawBtn(typeName + '/' + sz.name + '/' + state.name, sz, state.bg, state.text, state.stroke));
          });
          block.appendChild(row);
        });
        return block;
      }

      function makeBrandGroup(brandName) {
        var sc = (data.brand[brandName] || {}).scale || {};
        var h5 = sc[5] || '#f3eefe';
        var h10 = sc[10] || '#ddeefa';
        var h50 = sc[50] || '#18a0fb';
        var h60 = sc[60] || '#0d7fcf';
        var bc = '컬러/브랜드';

        var group = figma.createFrame();
        group.name = brandName;
        group.layoutMode = 'VERTICAL';
        group.primaryAxisSizingMode = 'AUTO';
        group.counterAxisSizingMode = 'AUTO';
        group.counterAxisAlignItems = 'MIN';
        group.itemSpacing = 20;
        group.fills = [];
        group.appendChild(mkText(brandName, 13, 'bold', { r: 0.18, g: 0.18, b: 0.24 }));

        group.appendChild(makeTypeBlock('Primary', [
          { name: 'Default', bg: bFill(h50, bc, brandName + '/50'), text: white, stroke: null },
          { name: 'Hover', bg: bFill(h60, bc, brandName + '/60'), text: white, stroke: null },
          { name: 'Disabled', bg: bFill(h5, bc, brandName + '/5'), text: sgRgb(g50h), stroke: null },
        ]));

        group.appendChild(makeTypeBlock('Secondary', [
          { name: 'Default', bg: { type: 'SOLID', color: white }, text: sgRgb(h50), stroke: bFill(h50, bc, brandName + '/50') },
          { name: 'Hover', bg: bFill(h10, bc, brandName + '/10'), text: sgRgb(h60), stroke: bFill(h60, bc, brandName + '/60') },
          { name: 'Disabled', bg: { type: 'SOLID', color: white }, text: sgRgb(g50h), stroke: bFill(h5, bc, brandName + '/5') },
        ]));

        return group;
      }

      function makeGrayGroup() {
        var gc = '컬러/그레이';
        var group = figma.createFrame();
        group.name = 'Gray';
        group.layoutMode = 'VERTICAL';
        group.primaryAxisSizingMode = 'AUTO';
        group.counterAxisSizingMode = 'AUTO';
        group.counterAxisAlignItems = 'MIN';
        group.itemSpacing = 20;
        group.fills = [];
        group.appendChild(mkText('Gray', 13, 'bold', { r: 0.18, g: 0.18, b: 0.24 }));
        group.appendChild(makeTypeBlock('Gray', [
          { name: 'Default', bg: bFill(g50h, gc, 'Gray/50'), text: white, stroke: null },
          { name: 'Hover', bg: bFill(g60h, gc, 'Gray/60'), text: white, stroke: null },
          { name: 'Disabled', bg: bFill(g20h, gc, 'Gray/20'), text: sgRgb(g50h), stroke: null },
        ]));
        return group;
      }

      var outer = figma.createFrame();
      outer.name = 'buttons-section';
      outer.layoutMode = 'VERTICAL';
      outer.primaryAxisSizingMode = 'AUTO';
      outer.counterAxisSizingMode = 'AUTO';
      outer.counterAxisAlignItems = 'MIN';
      outer.itemSpacing = 40;
      outer.fills = [];

      Object.keys(data.brand || {}).forEach(function (brandName) {
        outer.appendChild(makeBrandGroup(brandName));
      });

      outer.appendChild(makeGrayGroup());

      return outer;
    }

    function inputSection() {
      var white = { r: 1, g: 1, b: 1 };
      var gSc2 = data.gray ? data.gray.scale : {};
      var ig10h = gSc2[10] || '#e8e8eb';
      var ig20h = gSc2[20] || '#d1d3d9';
      var ig30h = gSc2[30] || '#b0b3bc';
      var igc = '컬러/그레이';
      var iFB = Object.keys(data.brand || {})[0] || '';
      var iFsc = iFB && data.brand[iFB] ? data.brand[iFB].scale : {};
      var ifh5 = iFsc[5] || '#f3eefe';
      var ifh50 = iFsc[50] || '#18a0fb';
      var iFBC = '컬러/브랜드';
      var iDangerHex = '#DC2626';
      if (data.semantic) {
        var iDk = Object.keys(data.semantic).find(function (k) { return k === 'Danger' || k.toLowerCase().endsWith('/danger'); });
        if (iDk) iDangerHex = data.semantic[iDk].base || iDangerHex;
      }

      var IW = data.inputWidth || 280;
      var IR = data.inputRadius != null ? data.inputRadius : 6;
      var ISTATES = data.inputStates || ['Default', 'Hover', 'Focus', 'Disabled'];
      var ICONT = data.inputContents || ['Placeholder', 'Value'];
      var ISIZES = data.inputSizes || [{ name: 'S', h: 32, fs: null, fw: 400 }, { name: 'M', h: 40, fs: null, fw: 400 }];
      function iWeightFont(fw) {
        var w = +fw || 400;
        if (w <= 400) return F.regular;
        if (w <= 500) return F.medium || F.regular;
        if (w <= 650) return F.semibold || F.medium || F.regular;
        if (w <= 750) return F.bold || F.regular;
        return F.extrabold || F.bold || F.regular;
      }

      function drawInput(state, content, sz) {
        var IH = sz.h;
        var iFS = sz.fs || (IH <= 32 ? 12 : 13);
        var bgHex, bgVar = null, borderHex, borderV, textStr, textCol, opacity = 1;
        if (state === 'Default') { bgHex = '#ffffff'; borderHex = ig20h; borderV = getVar(igc, 'Gray/20'); }
        else if (state === 'Hover') { bgHex = '#ffffff'; borderHex = ifh50; borderV = getVar(iFBC, iFB + '/50'); }
        else if (state === 'Focus') { bgHex = ifh5; bgVar = getVar(iFBC, iFB + '/5'); borderHex = ifh50; borderV = getVar(iFBC, iFB + '/50'); }
        else { bgHex = ig10h; borderHex = ig20h; borderV = getVar(igc, 'Gray/20'); opacity = 0.6; }

        if (content === 'Placeholder') { textStr = 'Enter content'; textCol = sgRgb(ig30h); }
        else { textStr = 'Entered value'; textCol = { r: 0.1, g: 0.1, b: 0.15 }; }

        var inp = figma.createFrame();
        inp.name = state + '/' + content;
        inp.layoutMode = 'HORIZONTAL';
        inp.paddingLeft = 12; inp.paddingRight = 12;
        inp.primaryAxisAlignItems = 'MIN'; inp.counterAxisAlignItems = 'CENTER';
        inp.primaryAxisSizingMode = 'FIXED'; inp.counterAxisSizingMode = 'FIXED';
        inp.resize(IW, IH);
        inp.cornerRadius = IR;
        inp.fills = [varFill(bgHex, bgVar)];
        inp.strokes = [varFill(borderHex, borderV)];
        inp.strokeWeight = 1; inp.strokeAlign = 'INSIDE';
        if (opacity < 1) inp.opacity = opacity;
        var t = figma.createText();
        t.fontName = iWeightFont(sz.fw); t.fontSize = iFS; t.characters = textStr;
        t.fills = [{ type: 'SOLID', color: textCol }];
        t.layoutGrow = 1;
        inp.appendChild(t);
        return inp;
      }

      function drawSemanticInput(semName, semColor, sz) {
        var IH = sz.h;
        var iFS = sz.fs || (IH <= 32 ? 12 : 13);
        var messages = { Danger: 'Error message', Warning: 'Warning message', Success: 'Success message', Info: 'Info message' };
        var inp = figma.createFrame();
        inp.name = 'Semantic/' + semName;
        inp.layoutMode = 'HORIZONTAL';
        inp.paddingLeft = 12; inp.paddingRight = 12;
        inp.primaryAxisAlignItems = 'MIN'; inp.counterAxisAlignItems = 'CENTER';
        inp.primaryAxisSizingMode = 'FIXED'; inp.counterAxisSizingMode = 'FIXED';
        inp.resize(IW, IH);
        inp.cornerRadius = IR;
        inp.fills = [{ type: 'SOLID', color: sgRgb(semColor.background || '#fff') }];
        inp.strokes = [{ type: 'SOLID', color: sgRgb(semColor.base || '#999') }];
        inp.strokeWeight = 1; inp.strokeAlign = 'INSIDE';
        var t = figma.createText();
        t.fontName = iWeightFont(sz.fw); t.fontSize = iFS;
        t.characters = messages[semName] || semName;
        t.fills = [{ type: 'SOLID', color: sgRgb(semColor.text || '#333') }];
        t.layoutGrow = 1;
        inp.appendChild(t);
        return inp;
      }

      var outer = figma.createFrame();
      outer.name = 'input-section';
      outer.layoutMode = 'VERTICAL';
      outer.primaryAxisSizingMode = 'AUTO';
      outer.counterAxisSizingMode = 'AUTO';
      outer.counterAxisAlignItems = 'MIN';
      outer.itemSpacing = 24;
      outer.fills = [];

      ISIZES.forEach(function (sz) {
        var sizeGroup = figma.createFrame();
        sizeGroup.name = 'Input ' + sz.name + ' (' + sz.h + 'px)';
        sizeGroup.layoutMode = 'VERTICAL';
        sizeGroup.primaryAxisSizingMode = 'AUTO';
        sizeGroup.counterAxisSizingMode = 'AUTO';
        sizeGroup.counterAxisAlignItems = 'MIN';
        sizeGroup.itemSpacing = 10;
        sizeGroup.fills = [];
        sizeGroup.appendChild(mkText('Input ' + sz.name + ' (' + sz.h + 'px)', 13, 'medium', { r: 0.35, g: 0.35, b: 0.42 }));
        ISTATES.forEach(function (state) {
          var row = hBox(state, 16, 'CENTER');
          row.appendChild(labelBox(state, 80));
          ICONT.forEach(function (content) { row.appendChild(drawInput(state, content, sz)); });
          sizeGroup.appendChild(row);
        });
        outer.appendChild(sizeGroup);
      });

      if (data.semantic && Object.keys(data.semantic).length > 0) {
        var defSz = ISIZES[ISIZES.length - 1];
        var semGroup = figma.createFrame();
        semGroup.name = 'Semantic Inputs';
        semGroup.layoutMode = 'VERTICAL';
        semGroup.primaryAxisSizingMode = 'AUTO';
        semGroup.counterAxisSizingMode = 'AUTO';
        semGroup.counterAxisAlignItems = 'MIN';
        semGroup.itemSpacing = 10;
        semGroup.fills = [];
        semGroup.appendChild(mkText('Semantic Inputs', 13, 'medium', { r: 0.35, g: 0.35, b: 0.42 }));
        ['Danger', 'Warning', 'Success', 'Info'].forEach(function (semName) {
          var semKey = Object.keys(data.semantic).find(function (k) { return k === semName || k.toLowerCase().endsWith('/' + semName.toLowerCase()); });
          if (!semKey) return;
          var row = hBox(semName, 16, 'CENTER');
          row.appendChild(labelBox(semName, 80));
          row.appendChild(drawSemanticInput(semName, data.semantic[semKey], defSz));
          semGroup.appendChild(row);
        });
        outer.appendChild(semGroup);
      }

      return outer;
    }

    figma.ui.postMessage({ type: 'style-draw-progress', msg: 'Drawing color palette...' });

    board.appendChild(mkText('Colors', 20, 'bold'));
    board.appendChild(sectionDivider());
    board.appendChild(mkText('Brand Colors', 11, 'medium', { r: 0.5, g: 0.5, b: 0.58 }));
    var brandNames = Object.keys(data.brand);
    for (var bi = 0; bi < brandNames.length; bi++) {
      board.appendChild(colorScaleRow(brandNames[bi], data.brand[brandNames[bi]].scale, '컬러/브랜드'));
    }
    board.appendChild(mkText('Gray Scale', 11, 'medium', { r: 0.5, g: 0.5, b: 0.58 }));
    board.appendChild(colorScaleRow('Gray', data.gray.scale, '컬러/그레이'));
    board.appendChild(mkText('Semantic Colors', 11, 'medium', { r: 0.5, g: 0.5, b: 0.58 }));
    var semNames = Object.keys(data.semantic);
    for (var si = 0; si < semNames.length; si++) {
      board.appendChild(semanticRow(semNames[si], data.semantic[semNames[si]]));
    }

    figma.ui.postMessage({ type: 'style-draw-progress', msg: 'Drawing spacing system...' });
    board.appendChild(mkText('Spacing', 20, 'bold'));
    board.appendChild(sectionDivider());
    board.appendChild(spacingSection(data.spacing));

    figma.ui.postMessage({ type: 'style-draw-progress', msg: 'Drawing radius system...' });
    board.appendChild(mkText('Radius', 20, 'bold'));
    board.appendChild(sectionDivider());
    board.appendChild(radiusSection(data.radius));

    figma.ui.postMessage({ type: 'style-draw-progress', msg: 'Drawing typography...' });
    board.appendChild(mkText('Typography', 20, 'bold'));
    board.appendChild(sectionDivider());
    board.appendChild(typographySection());

    figma.ui.postMessage({ type: 'style-draw-progress', msg: 'Drawing button system...' });
    board.appendChild(mkText('Buttons', 20, 'bold'));
    board.appendChild(sectionDivider());
    board.appendChild(buttonSection());

    figma.ui.postMessage({ type: 'style-draw-progress', msg: 'Drawing input system...' });
    board.appendChild(mkText('Input', 20, 'bold'));
    board.appendChild(sectionDivider());
    board.appendChild(inputSection());

    figma.viewport.scrollAndZoomIntoView([board]);
    tagKlicNode(board, 'style-guide-board', Object.assign({ source: 'style-guide-generator' }, normalizeStyleMeta(meta)));
    figma.ui.postMessage({ type: 'style-draw-done', textStyleCount: TS_DEF.length, fontFamily: F.regular.family });

  } catch (err) {
    figma.ui.postMessage({ type: 'style-error', message: err.message || String(err) });
  }
}

/* ─── Component generation ──────────────────────────────────────────────── */
async function createComponents(data, meta) {
  var componentStage = 'initializing';
  try {
    componentStage = 'loading fonts';
    figma.ui.postMessage({ type: 'style-comp-progress', msg: 'Loading fonts...' });

    var allFonts = await figma.listAvailableFontsAsync();
    var fontMap = {};
    for (var i = 0; i < allFonts.length; i++) {
      var fn = allFonts[i].fontName;
      if (!fontMap[fn.family]) fontMap[fn.family] = {};
      fontMap[fn.family][fn.style] = true;
    }
    function findFam(name) {
      var lo = name.toLowerCase();
      for (var f in fontMap) { if (f.toLowerCase() === lo) return f; }
      for (var f2 in fontMap) { if (f2.toLowerCase().indexOf(lo) === 0) return f2; }
      return null;
    }
    async function loadFam(family) {
      var st = fontMap[family];
      if (!st || !st['Regular']) return null;
      await figma.loadFontAsync({ family: family, style: 'Regular' });
      var reg = { family: family, style: 'Regular' };
      var med = reg, semi = reg, bld = reg, xbld = reg;
      for (var m of ['Medium', 'DemiBold']) {
        if (st[m]) { await figma.loadFontAsync({ family: family, style: m }); med = { family: family, style: m }; break; }
      }
      for (var s of ['SemiBold', 'Semi Bold']) {
        if (st[s]) { await figma.loadFontAsync({ family: family, style: s }); semi = { family: family, style: s }; break; }
      }
      for (var b of ['Bold']) {
        if (st[b]) { await figma.loadFontAsync({ family: family, style: b }); bld = { family: family, style: b }; break; }
      }
      for (var e of ['ExtraBold', 'Extra Bold', 'Heavy']) {
        if (st[e]) { await figma.loadFontAsync({ family: family, style: e }); xbld = { family: family, style: e }; break; }
      }
      return { regular: reg, medium: med, semibold: semi, bold: bld, extrabold: xbld };
    }
    var F = null;
    if (data.fontFamily) { var pf = findFam(data.fontFamily); if (pf) F = await loadFam(pf); }
    if (!F) {
      for (var fb of ['Inter', 'Roboto', 'Noto Sans', 'SF Pro Text']) {
        var ff = findFam(fb); if (ff) { F = await loadFam(ff); if (F) break; }
      }
    }
    if (!F) { figma.ui.postMessage({ type: 'style-error', message: 'Font not found.' }); return; }

    componentStage = 'preparing Components page';
    var compPage = null;
    var localPages = await commandGetLocalPages();
    for (var pi = 0; pi < localPages.length; pi++) {
      if (localPages[pi].name === '📦 Components') { compPage = localPages[pi]; break; }
    }
    if (!compPage) { compPage = figma.createPage(); compPage.name = '📦 Components'; }

    componentStage = 'loading local variables';
    var _vc = {
      cols: await commandGetLocalVariableCollections(),
      vars: await commandGetLocalVariables(),
    };
    function gv(colName, vName) {
      var col = _vc.cols.find(function (c) { return c.name === colName; });
      if (!col) return null;
      return _vc.vars.find(function (v) { return v.name === vName && v.variableCollectionId === col.id; }) || null;
    }
    function vf(hex, v) {
      var c = hexToFigmaColor(hex);
      if (!v) return { type: 'SOLID', color: c };
      return { type: 'SOLID', color: c, boundVariables: { color: { type: 'VARIABLE_ALIAS', id: v.id } } };
    }
    function bf(hex, col, name) { return vf(hex, col ? gv(col, name) : null); }

    var bKeys = Object.keys(data.brand || {});
    var gSc = data.gray ? data.gray.scale : {};
    var g10h = gSc[10] || '#e8e8eb';
    var g20h = gSc[20] || '#d1d3d9';
    var g30h = gSc[30] || '#b0b3bc';
    var g50h = gSc[50] || '#686d78';
    var g60h = gSc[60] || '#565b67';
    var white = { r: 1, g: 1, b: 1 };
    var GC = '컬러/그레이';
    var BGSET = { r: 0.97, g: 0.97, b: 0.99 };

    function deriveFontSize(h) { return h <= 32 ? 12 : h <= 44 ? 14 : 16; }
    function derivePad(h) { return h <= 40 ? 16 : h <= 48 ? 20 : 24; }
    function weightFont(fw) {
      var w = +fw || 400;
      if (w <= 400) return F.regular;
      if (w <= 500) return F.medium || F.regular;
      if (w <= 650) return F.semibold || F.medium || F.regular;
      if (w <= 750) return F.bold || F.regular;
      return F.extrabold || F.bold || F.regular;
    }
    function styleSet(s, name, x, y) {
      s.name = name;
      s.fills = [{ type: 'SOLID', color: BGSET }];
      s.paddingTop = s.paddingRight = s.paddingBottom = s.paddingLeft = 24;
      s.itemSpacing = 16;
      try { s.counterAxisSpacing = 12; } catch (e) { }
      s.x = x; s.y = y;
    }

    var BSIZES = data.buttonSizes
      ? data.buttonSizes.map(function (sz) {
        return { name: sz.name, h: sz.h, px: derivePad(sz.h), fs: sz.fs || deriveFontSize(sz.h), fw: sz.fw || 400 };
      })
      : [
        { name: 'S', h: 32, px: 12, fs: 12, fw: 400 },
        { name: 'M', h: 40, px: 16, fs: 14, fw: 400 },
        { name: 'L', h: 48, px: 24, fs: 16, fw: 400 },
      ];
    var BSTATES = data.buttonStates || ['Default', 'Hover', 'Disabled'];
    var BTYPES = data.buttonTypes || ['Primary', 'Secondary', 'Gray'];
    var BRADIUS = data.buttonRadius != null ? data.buttonRadius : 6;

    var brandTypes = BTYPES.filter(function (t) { return t !== 'Gray' && t !== 'Ghost'; });
    var includeGray = BTYPES.indexOf('Gray') !== -1 || BTYPES.indexOf('Ghost') !== -1;

    componentStage = 'creating Button components';
    figma.ui.postMessage({ type: 'style-comp-progress', msg: 'Creating Button components...' });

    var btnSets = [];
    var curX = 0;

    var buttonIconSizes = data.buttonIconSizes || {};
    var iconSizeMap = {};
    BSIZES.forEach(function (sz) {
      iconSizeMap[sz.name] = buttonIconSizes[sz.name] || (sz.h <= 36 ? 18 : 24);
    });
    var iconCompMap = {};
    BSIZES.forEach(function (sz) {
      var iSize = iconSizeMap[sz.name];
      if (!iconCompMap[iSize]) {
        var ic = figma.createComponent();
        ic.name = 'Icon/' + iSize;
        ic.resize(iSize, iSize);
        ic.cornerRadius = iSize <= 18 ? 3 : 4;
        ic.fills = [{ type: 'SOLID', color: hexToFigmaColor(g20h) }];
        compPage.appendChild(ic);
        iconCompMap[iSize] = ic;
      }
    });
    var icX = 0;
    Object.keys(iconCompMap).forEach(function (k) {
      iconCompMap[k].x = icX; iconCompMap[k].y = -100; icX += iconCompMap[k].width + 24;
    });

    var ICON_POSITIONS = ['None', 'Left', 'Right'];

    bKeys.forEach(function (brandName) {
      var sc = (data.brand[brandName] || {}).scale || {};
      var h5 = sc[5] || '#f3eefe';
      var h10 = sc[10] || '#ddeefa';
      var h50 = sc[50] || '#18a0fb'; var h60 = sc[60] || '#0d7fcf';
      var BC = '컬러/브랜드';

      function btnColors(typeName, stateName) {
        if (typeName === 'Primary') {
          if (stateName === 'Default') return { bg: bf(h50, BC, brandName + '/50'), text: white };
          if (stateName === 'Hover') return { bg: bf(h60, BC, brandName + '/60'), text: white };
          if (stateName === 'Disabled') return { bg: bf(h5, BC, brandName + '/5'), text: hexToFigmaColor(g50h) };
        }
        if (typeName === 'Secondary') {
          if (stateName === 'Default') return { bg: { type: 'SOLID', color: white }, text: hexToFigmaColor(h50), stroke: bf(h50, BC, brandName + '/50') };
          if (stateName === 'Hover') return { bg: bf(h10, BC, brandName + '/10'), text: hexToFigmaColor(h60), stroke: bf(h60, BC, brandName + '/60') };
          if (stateName === 'Disabled') return { bg: { type: 'SOLID', color: white }, text: hexToFigmaColor(g50h), stroke: bf(h5, BC, brandName + '/5') };
        }
        return null;
      }

      var comps = [];
      brandTypes.forEach(function (typeName) {
        BSTATES.forEach(function (stateName) {
          BSIZES.forEach(function (sz) {
            ICON_POSITIONS.forEach(function (iconPos) {
              var col = btnColors(typeName, stateName);
              if (!col) return;
              var iSize = iconSizeMap[sz.name];
              var c = figma.createComponent();
              c.name = 'Size=' + sz.name + ', Type=' + typeName + ', State=' + stateName + ', Icon=' + iconPos;
              c.layoutMode = 'HORIZONTAL';
              c.paddingLeft = sz.px; c.paddingRight = sz.px;
              c.primaryAxisAlignItems = 'CENTER'; c.counterAxisAlignItems = 'CENTER';
              if (iconPos !== 'None') c.itemSpacing = iSize <= 18 ? 6 : 8;
              c.cornerRadius = BRADIUS;
              c.fills = [col.bg];
              if (col.stroke) { c.strokes = [col.stroke]; c.strokeWeight = 1; c.strokeAlign = 'INSIDE'; }
              if (iconPos === 'Left') {
                var instBL = iconCompMap[iSize].createInstance();
                try { instBL.layoutSizingHorizontal = 'FIXED'; instBL.layoutSizingVertical = 'FIXED'; } catch (e) { }
                c.appendChild(instBL);
              }
              var t = figma.createText();
              t.fontName = weightFont(sz.fw); t.characters = 'Button'; t.fontSize = sz.fs;
              t.fills = [{ type: 'SOLID', color: col.text }];
              c.appendChild(t);
              if (iconPos === 'Right') {
                var instBR = iconCompMap[iSize].createInstance();
                try { instBR.layoutSizingHorizontal = 'FIXED'; instBR.layoutSizingVertical = 'FIXED'; } catch (e) { }
                c.appendChild(instBR);
              }
              c.primaryAxisSizingMode = 'AUTO'; c.counterAxisSizingMode = 'FIXED';
              c.resize(c.width, sz.h);
              compPage.appendChild(c);
              comps.push(c);
            });
          });
        });
      });

      var set = figma.combineAsVariants(comps, compPage);
      set.name = brandName + ' Button';
      set.fills = [{ type: 'SOLID', color: BGSET }];
      set.paddingTop = set.paddingRight = set.paddingBottom = set.paddingLeft = 24;
      set.itemSpacing = 16; set.counterAxisSpacing = 16;
      set.x = curX; set.y = 0;
      curX += set.width + 60;
      btnSets.push(set);
    });

    if (includeGray) {
      var grayComps = [];
      BSTATES.forEach(function (stateName) {
        var textCol = stateName === 'Disabled' ? hexToFigmaColor(g50h) : white;
        var bgFill = stateName === 'Default' ? bf(g50h, GC, 'Gray/50')
          : stateName === 'Hover' ? bf(g60h, GC, 'Gray/60')
            : bf(g20h, GC, 'Gray/20');
        BSIZES.forEach(function (sz) {
          ICON_POSITIONS.forEach(function (iconPos) {
            var iSize = iconSizeMap[sz.name];
            var c = figma.createComponent();
            c.name = 'Size=' + sz.name + ', State=' + stateName + ', Icon=' + iconPos;
            c.layoutMode = 'HORIZONTAL';
            c.paddingLeft = sz.px; c.paddingRight = sz.px;
            c.primaryAxisAlignItems = 'CENTER'; c.counterAxisAlignItems = 'CENTER';
            if (iconPos !== 'None') c.itemSpacing = iSize <= 18 ? 6 : 8;
            c.cornerRadius = BRADIUS;
            c.fills = [bgFill];
            if (iconPos === 'Left') {
              var instGL = iconCompMap[iSize].createInstance();
              try { instGL.layoutSizingHorizontal = 'FIXED'; instGL.layoutSizingVertical = 'FIXED'; } catch (e) { }
              c.appendChild(instGL);
            }
            var t = figma.createText();
            t.fontName = weightFont(sz.fw); t.characters = 'Button'; t.fontSize = sz.fs;
            t.fills = [{ type: 'SOLID', color: textCol }];
            c.appendChild(t);
            if (iconPos === 'Right') {
              var instGR = iconCompMap[iSize].createInstance();
              try { instGR.layoutSizingHorizontal = 'FIXED'; instGR.layoutSizingVertical = 'FIXED'; } catch (e) { }
              c.appendChild(instGR);
            }
            c.primaryAxisSizingMode = 'AUTO'; c.counterAxisSizingMode = 'FIXED';
            c.resize(c.width, sz.h);
            compPage.appendChild(c);
            grayComps.push(c);
          });
        });
      });
      var graySet = figma.combineAsVariants(grayComps, compPage);
      graySet.name = 'Gray Button';
      graySet.fills = [{ type: 'SOLID', color: BGSET }];
      graySet.paddingTop = graySet.paddingRight = graySet.paddingBottom = graySet.paddingLeft = 24;
      graySet.itemSpacing = 16; graySet.counterAxisSpacing = 16;
      graySet.x = curX; graySet.y = 0;
      btnSets.push(graySet);
    }

    componentStage = 'creating Input components';
    figma.ui.postMessage({ type: 'style-comp-progress', msg: 'Creating Input components...' });

    var INPUT_W = data.inputWidth || 280;
    var IRADIUS = data.inputRadius != null ? data.inputRadius : 6;
    var INPUT_SIZES = data.inputSizes || [{ name: 'S', h: 32, fs: null, fw: 400 }, { name: 'M', h: 40, fs: null, fw: 400 }];
    var INPUT_STATES = data.inputStates || ['Default', 'Hover', 'Focus', 'Disabled'];
    var INPUT_CONTENTS = data.inputContents || ['Placeholder', 'Value', 'Error'];

    var firstBrand = bKeys[0] || '';
    var fsc = firstBrand && data.brand[firstBrand] ? data.brand[firstBrand].scale : {};
    var fh5 = fsc[5] || '#f3eefe'; var fh50 = fsc[50] || '#18a0fb';
    var FBC = '컬러/브랜드';
    var dangerHex = '#DC2626';
    if (data.semantic) {
      var dangerKey = Object.keys(data.semantic).find(function (k) { return k === 'Danger' || k.toLowerCase().endsWith('/danger'); });
      if (dangerKey) dangerHex = data.semantic[dangerKey].base || dangerHex;
    }

    var inputComps = [];
    INPUT_SIZES.forEach(function (sz) {
      var inputFS = sz.fs || deriveFontSize(sz.h);
      INPUT_CONTENTS.forEach(function (content) {
        INPUT_STATES.forEach(function (state) {
          var bgHex, bgVar = null, borderHex, borderV, textStr, textCol, opacity = 1;
          if (state === 'Default') { bgHex = '#ffffff'; borderHex = g20h; borderV = gv(GC, 'Gray/20'); }
          else if (state === 'Hover') { bgHex = '#ffffff'; borderHex = fh50; borderV = gv(FBC, firstBrand + '/50'); }
          else if (state === 'Focus') { bgHex = fh5; bgVar = gv(FBC, firstBrand + '/5'); borderHex = fh50; borderV = gv(FBC, firstBrand + '/50'); }
          else { bgHex = g10h; borderHex = g20h; borderV = gv(GC, 'Gray/20'); opacity = 0.6; }

          if (content === 'Placeholder') { textStr = 'Enter content'; textCol = hexToFigmaColor(g30h); }
          else { textStr = 'Entered value'; textCol = { r: 0.1, g: 0.1, b: 0.15 }; }

          var c = figma.createComponent();
          c.name = 'Size=' + sz.name + ', Content=' + content + ', State=' + state;
          c.layoutMode = 'HORIZONTAL';
          c.paddingLeft = 12; c.paddingRight = 12;
          c.primaryAxisAlignItems = 'MIN'; c.counterAxisAlignItems = 'CENTER';
          c.primaryAxisSizingMode = 'FIXED'; c.counterAxisSizingMode = 'FIXED';
          c.resize(INPUT_W, sz.h);
          c.cornerRadius = IRADIUS;
          c.fills = [vf(bgHex, bgVar)];
          c.strokes = [vf(borderHex, borderV)]; c.strokeWeight = 1; c.strokeAlign = 'INSIDE';
          if (opacity < 1) c.opacity = opacity;
          var t = figma.createText();
          t.fontName = weightFont(sz.fw); t.fontSize = inputFS; t.characters = textStr;
          t.fills = [{ type: 'SOLID', color: textCol }];
          t.layoutGrow = 1;
          c.appendChild(t);
          compPage.appendChild(c);
          inputComps.push(c);
        });
      });
    });

    var semInputComps = [];
    if (data.semantic) {
      var semOrder = ['Danger', 'Warning', 'Success', 'Info'];
      var semMessages = { Danger: 'Error message', Warning: 'Warning message', Success: 'Success message', Info: 'Info message' };
      INPUT_SIZES.forEach(function (sz) {
        var sFS = sz.fs || deriveFontSize(sz.h);
        semOrder.forEach(function (semName) {
          var semKey = Object.keys(data.semantic).find(function (k) { return k === semName || k.toLowerCase().endsWith('/' + semName.toLowerCase()); });
          if (!semKey) return;
          var sc = data.semantic[semKey];
          var c = figma.createComponent();
          c.name = 'Size=' + sz.name + ', Semantic=' + semName;
          c.layoutMode = 'HORIZONTAL';
          c.paddingLeft = 12; c.paddingRight = 12;
          c.primaryAxisAlignItems = 'MIN'; c.counterAxisAlignItems = 'CENTER';
          c.primaryAxisSizingMode = 'FIXED'; c.counterAxisSizingMode = 'FIXED';
          c.resize(INPUT_W, sz.h);
          c.cornerRadius = IRADIUS;
          c.fills = [{ type: 'SOLID', color: hexToFigmaColor(sc.background || '#fff') }];
          c.strokes = [{ type: 'SOLID', color: hexToFigmaColor(sc.base || '#999') }];
          c.strokeWeight = 1; c.strokeAlign = 'INSIDE';
          var t = figma.createText();
          t.fontName = F.regular; t.fontSize = sFS;
          t.characters = semMessages[semName] || semName;
          t.fills = [{ type: 'SOLID', color: hexToFigmaColor(sc.text || '#333') }];
          t.layoutGrow = 1;
          c.appendChild(t);
          compPage.appendChild(c);
          semInputComps.push(c);
        });
      });
    }

    var totalBtnVariants = 0;
    btnSets.forEach(function (s) { totalBtnVariants += s.children ? s.children.length : 0; });

    var maxBtnY = 0;
    btnSets.forEach(function (s) { var b = s.y + s.height; if (b > maxBtnY) maxBtnY = b; });

    var inputSet = figma.combineAsVariants(inputComps, compPage);
    styleSet(inputSet, 'Input', 0, maxBtnY + 80);
    try { inputSet.counterAxisSpacing = 12; } catch (e) { }

    var semInputSet = null;
    if (semInputComps.length > 0) {
      semInputSet = figma.combineAsVariants(semInputComps, compPage);
      styleSet(semInputSet, 'Semantic Input', 0, inputSet.y + inputSet.height + 80);
      try { semInputSet.counterAxisSpacing = 12; } catch (e) { }
    }

    function createSelectComponents(y) {
      var comps = [];
      INPUT_SIZES.forEach(function (sz) {
        INPUT_STATES.forEach(function (state) {
          var c = figma.createComponent();
          c.name = 'Size=' + sz.name + ', State=' + state;
          c.layoutMode = 'HORIZONTAL';
          c.paddingLeft = 12; c.paddingRight = 12;
          c.primaryAxisAlignItems = 'MIN'; c.counterAxisAlignItems = 'CENTER';
          c.primaryAxisSizingMode = 'FIXED'; c.counterAxisSizingMode = 'FIXED';
          c.resize(INPUT_W, sz.h);
          c.cornerRadius = IRADIUS;
          c.itemSpacing = 8;
          c.fills = [vf(state === 'Focus' ? (bKeys[0] && data.brand[bKeys[0]].scale[5] || '#f3f7ff') : '#ffffff', state === 'Focus' && bKeys[0] ? gv('컬러/브랜드', bKeys[0] + '/5') : null)];
          c.strokes = [vf(state === 'Disabled' ? g20h : (bKeys[0] && data.brand[bKeys[0]].scale[50] || g20h), state === 'Disabled' ? gv(GC, 'Gray/20') : null)];
          c.strokeWeight = 1; c.strokeAlign = 'INSIDE';
          if (state === 'Disabled') c.opacity = 0.6;
          var label = figma.createText();
          label.fontName = weightFont(sz.fw); label.fontSize = sz.fs || deriveFontSize(sz.h);
          label.characters = state === 'Default' ? 'Select option' : state;
          label.fills = [{ type: 'SOLID', color: hexToFigmaColor(g60h) }];
          label.layoutGrow = 1;
          var arrow = figma.createText();
          arrow.fontName = F.regular; arrow.fontSize = 12; arrow.characters = 'v';
          arrow.fills = [{ type: 'SOLID', color: hexToFigmaColor(g50h) }];
          c.appendChild(label); c.appendChild(arrow);
          compPage.appendChild(c);
          comps.push(c);
        });
      });
      var set = figma.combineAsVariants(comps, compPage);
      styleSet(set, 'Select', 420, y);
      return set;
    }

    function createBadgeComponents(y) {
      var semOrder = ['Danger', 'Warning', 'Success', 'Info'];
      var comps = [];
      var badgeSizes = [{ name: 'S', h: 22, fs: 11, px: 8 }, { name: 'M', h: 28, fs: 12, px: 10 }];
      var badgeTypes = [{ name: 'Neutral', bg: g10h, text: g60h }];
      semOrder.forEach(function (semName) {
        var semKey = data.semantic && Object.keys(data.semantic).find(function (k) { return k === semName || k.toLowerCase().endsWith('/' + semName.toLowerCase()); });
        if (semKey) {
          var sc = data.semantic[semKey];
          badgeTypes.push({ name: semName, bg: sc.background || '#ffffff', text: sc.text || sc.base || '#333333' });
        }
      });
      badgeTypes.forEach(function (type) {
        badgeSizes.forEach(function (sz) {
          var c = figma.createComponent();
          c.name = 'Type=' + type.name + ', Size=' + sz.name;
          c.layoutMode = 'HORIZONTAL';
          c.paddingLeft = sz.px; c.paddingRight = sz.px;
          c.primaryAxisAlignItems = 'CENTER'; c.counterAxisAlignItems = 'CENTER';
          c.counterAxisSizingMode = 'FIXED';
          c.resize(80, sz.h);
          c.cornerRadius = Math.round(sz.h / 2);
          c.fills = [vf(type.bg, null)];
          var t = figma.createText();
          t.fontName = F.medium || F.regular; t.fontSize = sz.fs; t.characters = type.name;
          t.fills = [{ type: 'SOLID', color: hexToFigmaColor(type.text) }];
          c.appendChild(t);
          compPage.appendChild(c);
          comps.push(c);
        });
      });
      var set = figma.combineAsVariants(comps, compPage);
      styleSet(set, 'Badge', 840, y);
      return set;
    }

    function createTableComponent(y) {
      var c = figma.createComponent();
      c.name = 'Table Component';
      c.layoutMode = 'VERTICAL';
      c.primaryAxisSizingMode = 'AUTO';
      c.counterAxisSizingMode = 'AUTO';
      c.itemSpacing = 1;
      c.fills = [vf(g20h, gv(GC, 'Gray/20'))];
      function row(name, fillHex, font) {
        var r = figma.createFrame();
        r.name = name; r.layoutMode = 'HORIZONTAL'; r.itemSpacing = 1;
        r.primaryAxisSizingMode = 'AUTO'; r.counterAxisSizingMode = 'AUTO'; r.fills = [];
        ['Column A', 'Column B', 'Column C'].forEach(function (txt) {
          var cell = figma.createFrame();
          cell.layoutMode = 'HORIZONTAL'; cell.primaryAxisSizingMode = 'FIXED'; cell.counterAxisSizingMode = 'FIXED';
          cell.resize(120, 42); cell.paddingLeft = 12; cell.paddingRight = 12;
          cell.primaryAxisAlignItems = 'MIN'; cell.counterAxisAlignItems = 'CENTER';
          cell.fills = [vf(fillHex, null)];
          var t = figma.createText();
          t.fontName = font; t.fontSize = 12; t.characters = txt;
          t.fills = [{ type: 'SOLID', color: hexToFigmaColor(g60h) }];
          cell.appendChild(t); r.appendChild(cell);
        });
        return r;
      }
      c.appendChild(row('Header', g10h, F.semibold || F.medium || F.regular));
      c.appendChild(row('Row', '#ffffff', F.regular));
      compPage.appendChild(c);
      c.x = 1260; c.y = y;
      return c;
    }

    componentStage = 'creating Select, Badge, and Table components';
    await commandSetCurrentPage(compPage);
    var allInputSets = semInputSet ? [inputSet, semInputSet] : [inputSet];
    var extraStartY = (semInputSet ? semInputSet.y + semInputSet.height : inputSet.y + inputSet.height) + 80;
    var selectSet = createSelectComponents(extraStartY);
    var badgeSet = createBadgeComponents(extraStartY);
    var tableComponent = createTableComponent(extraStartY);
    var extraSets = [selectSet, badgeSet, tableComponent];
    btnSets.forEach(function (set) { tagKlicNode(set, 'component-factory', Object.assign({ component: set.name }, normalizeStyleMeta(meta))); });
    allInputSets.forEach(function (set) { tagKlicNode(set, 'component-factory', Object.assign({ component: set.name }, normalizeStyleMeta(meta))); });
    extraSets.forEach(function (set) { tagKlicNode(set, 'component-factory', Object.assign({ component: set.name }, normalizeStyleMeta(meta))); });
    figma.viewport.scrollAndZoomIntoView(btnSets.concat(allInputSets).concat(extraSets));

    figma.ui.postMessage({
      type: 'style-comp-done',
      btnVariantCount: totalBtnVariants,
      inputVariantCount: inputComps.length + semInputComps.length,
      extraComponentCount: extraSets.length,
    });

  } catch (err) {
    figma.ui.postMessage({ type: 'style-error', message: 'Component generation failed during ' + componentStage + ': ' + (err.message || String(err)) });
  }
}
