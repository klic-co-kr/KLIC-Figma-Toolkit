/* ═══════════════════════════════════════════════════════════════════════════
   MODULE: COMMAND CENTER
   MVP scope: SOLID color audit, exact variable matching, KLIC provenance.
   ═══════════════════════════════════════════════════════════════════════════ */

var KLIC_PLUGIN_DATA_KEY = 'klic.meta';
var commandScanToken = 0;
var commandLastScanNodes = [];

function tagKlicNode(node, tool, meta) {
  if (!node || typeof node.setPluginData !== 'function') return;
  var payload = {
    tool: tool,
    version: '0.1.0',
    generatedAt: new Date().toISOString(),
  };
  meta = meta || {};
  Object.keys(meta).forEach(function (key) { payload[key] = meta[key]; });
  node.setPluginData('klic.meta', JSON.stringify(payload));
}

function normalizeStyleMeta(meta) {
  meta = meta || {};
  return {
    styleMdHash: meta.styleMdHash || '',
    styleMdLength: meta.styleMdLength || 0,
    fontFamily: meta.fontFamily || '',
  };
}

function normalizeDiagnosticsMeta(diagnostics) {
  diagnostics = diagnostics || {};
  return {
    total: diagnostics.total || diagnostics.rows || 0,
    warningCount: diagnostics.warningCount || 0,
    duplicateNames: diagnostics.duplicateNames || 0,
    duplicatePaths: diagnostics.duplicatePaths || 0,
    emptyNames: diagnostics.emptyNames || 0,
    deepPaths: diagnostics.deepPaths || 0,
    longNames: diagnostics.longNames || 0,
    inconsistentRows: diagnostics.inconsistentRows || 0,
    emptyHeaderCells: diagnostics.emptyHeaderCells || 0,
    longCells: diagnostics.longCells || 0,
  };
}

function normalizeMenuMeta(meta) {
  meta = meta || {};
  return {
    sourceName: meta.sourceName || 'manual',
    selectedCategories: meta.selectedCategories || [],
    rowCount: meta.rowCount || 0,
    selectedCount: meta.selectedCount || 0,
    diagnostics: normalizeDiagnosticsMeta(meta.diagnostics),
  };
}

function commandColorToHex(color) {
  return '#' + ['r', 'g', 'b'].map(function (key) {
    return Math.round(Math.min(1, Math.max(0, color[key])) * 255)
      .toString(16)
      .padStart(2, '0');
  }).join('').toUpperCase();
}

function commandRelativeLuminance(color) {
  var r = commandLinearizeSrgb(color.r);
  var g = commandLinearizeSrgb(color.g);
  var b = commandLinearizeSrgb(color.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function commandContrastRatio(foreground, background) {
  var l1 = commandRelativeLuminance(foreground);
  var l2 = commandRelativeLuminance(background);
  var lighter = Math.max(l1, l2);
  var darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function commandRoundRatio(value) {
  return Math.round(value * 100) / 100;
}

function commandSolidPaintColor(paints) {
  if (!Array.isArray(paints)) return null;
  for (var i = 0; i < paints.length; i++) {
    var paint = paints[i];
    if (paint && paint.type === 'SOLID' && paint.visible !== false && paint.color) {
      return paint.color;
    }
  }
  return null;
}

function commandFindBackgroundColor(node) {
  var cur = node && node.parent;
  while (cur) {
    var color = commandSolidPaintColor(cur.fills);
    if (color) return color;
    cur = cur.parent;
  }
  return { r: 1, g: 1, b: 1 };
}

function commandIsLikelyInteractiveNode(node) {
  if (!node || !node.name) return false;
  return /button|btn|link|tab|tag|chip|select|checkbox|radio|toggle|switch|input|field|버튼|링크|탭|태그|체크|라디오|토글|스위치|입력|셀렉트/i.test(node.name);
}

function commandHasFocusStateText(value) {
  if (!value) return false;
  return /focus|focused|focus-visible|keyboard focus|포커스/i.test(String(value));
}

function commandComponentHasFocusState(node) {
  if (!node) return false;
  if (commandHasFocusStateText(node.name)) return true;
  if (node.variantProperties) {
    var keys = Object.keys(node.variantProperties);
    for (var i = 0; i < keys.length; i++) {
      if (commandHasFocusStateText(keys[i]) || commandHasFocusStateText(node.variantProperties[keys[i]])) return true;
    }
  }
  if (node.children) {
    for (var j = 0; j < node.children.length; j++) {
      if (commandComponentHasFocusState(node.children[j])) return true;
    }
  }
  return false;
}

function commandShouldAuditNonTextContrast(node) {
  if (!node || node.type === 'TEXT' || node.type === 'PAGE') return false;
  if (!('fills' in node) && !('strokes' in node)) return false;
  return node.type === 'RECTANGLE'
    || node.type === 'ELLIPSE'
    || node.type === 'POLYGON'
    || node.type === 'VECTOR'
    || node.type === 'COMPONENT'
    || node.type === 'INSTANCE'
    || commandIsLikelyInteractiveNode(node);
}

function commandPaintOpacity(paint) {
  return typeof paint.opacity === 'number' ? paint.opacity : 1;
}

function commandLinearizeSrgb(value) {
  return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
}

function commandRgbToOklch(color) {
  var r = commandLinearizeSrgb(color.r);
  var g = commandLinearizeSrgb(color.g);
  var b = commandLinearizeSrgb(color.b);
  var l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  var m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  var s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
  var lRoot = Math.cbrt(l);
  var mRoot = Math.cbrt(m);
  var sRoot = Math.cbrt(s);
  var okL = 0.2104542553 * lRoot + 0.7936177850 * mRoot - 0.0040720468 * sRoot;
  var okA = 1.9779984951 * lRoot - 2.4285922050 * mRoot + 0.4505937099 * sRoot;
  var okB = 0.0259040371 * lRoot + 0.7827717662 * mRoot - 0.8086757660 * sRoot;
  return {
    l: okL,
    c: Math.sqrt(okA * okA + okB * okB),
    h: Math.atan2(okB, okA),
  };
}

function commandOklchDistance(a, b) {
  var hueDelta = Math.abs(a.h - b.h);
  hueDelta = Math.min(hueDelta, Math.PI * 2 - hueDelta);
  var chromaScale = Math.max(a.c, b.c, 0.02);
  var dl = a.l - b.l;
  var dc = a.c - b.c;
  var dh = hueDelta * chromaScale;
  return Math.sqrt(dl * dl + dc * dc + dh * dh);
}

function commandResolveVariableHex(variable, variableById, seen) {
  if (!variable || variable.resolvedType !== 'COLOR') return null;
  seen = seen || {};
  if (seen[variable.id]) return null;
  seen[variable.id] = true;
  var modeIds = Object.keys(variable.valuesByMode || {});
  for (var i = 0; i < modeIds.length; i++) {
    var value = variable.valuesByMode[modeIds[i]];
    if (value && typeof value.r === 'number' && typeof value.g === 'number' && typeof value.b === 'number') {
      return commandColorToHex(value);
    }
    if (value && value.type === 'VARIABLE_ALIAS' && variableById && variableById[value.id]) {
      var resolved = commandResolveVariableHex(variableById[value.id], variableById, seen);
      if (resolved) return resolved;
    }
  }
  return null;
}

function commandGetVariableHex(variable) {
  var variableById = {};
  variableById[variable.id] = variable;
  return commandResolveVariableHex(variable, variableById, {});
}

async function commandGetLocalColorVariables() {
  var collections = await commandGetLocalVariableCollections();
  var variables = await commandGetLocalVariables('COLOR');
  var collectionMap = {};
  var variableById = {};
  collections.forEach(function (collection) { collectionMap[collection.id] = collection.name; });
  variables.forEach(function (variable) { variableById[variable.id] = variable; });
  return variables.map(function (variable) {
    return {
      id: variable.id,
      name: variable.name,
      collection: collectionMap[variable.variableCollectionId] || 'Other',
      hex: commandResolveVariableHex(variable, variableById, {}),
      ref: variable,
    };
  }).filter(function (variable) { return !!variable.hex; });
}

async function commandGetLocalVariableCollections() {
  if (figma.variables.getLocalVariableCollectionsAsync) {
    return await figma.variables.getLocalVariableCollectionsAsync();
  }
  return figma.variables.getLocalVariableCollections();
}

async function commandGetLocalVariables(type) {
  if (figma.variables.getLocalVariablesAsync) {
    return await figma.variables.getLocalVariablesAsync(type);
  }
  return figma.variables.getLocalVariables(type);
}

async function commandGetLocalTextStyles() {
  if (figma.getLocalTextStylesAsync) {
    return await figma.getLocalTextStylesAsync();
  }
  return figma.getLocalTextStyles();
}

async function commandGetLocalPages() {
  if (typeof figma.getLocalPagesAsync === 'function') {
    return await figma.getLocalPagesAsync();
  }
  if (typeof figma.loadAllPagesAsync === 'function') {
    await figma.loadAllPagesAsync();
  }
  return figma.root.children;
}

async function commandSetCurrentPage(page) {
  if (typeof figma.setCurrentPageAsync === 'function') {
    await figma.setCurrentPageAsync(page);
    return;
  }
  figma.currentPage = page;
}

function commandSortVariablesByPriority(variables, collectionPriority) {
  var priority = (collectionPriority || '').split(',')
    .map(function (item) { return item.trim(); })
    .filter(Boolean);
  return variables.slice().sort(function (a, b) {
    var ai = priority.indexOf(a.collection);
    var bi = priority.indexOf(b.collection);
    if (ai === -1) ai = 999;
    if (bi === -1) bi = 999;
    if (ai !== bi) return ai - bi;
    return (a.collection + '/' + a.name).localeCompare(b.collection + '/' + b.name);
  });
}

function commandFindNearestOklchVariable(color, variables) {
  var target = commandRgbToOklch(color);
  var best = null;
  variables.forEach(function (variable) {
    var rgb = hexToFigmaColor(variable.hex);
    var source = commandRgbToOklch(rgb);
    var distance = commandOklchDistance(target, source);
    if (!best || distance < best.distance) {
      best = { variable: variable, distance: distance, sourceOklch: source, targetOklch: target };
    }
  });
  return best;
}

function commandTokenPathParts(value) {
  return String(value || 'Other')
    .split(/[\/]+/g)
    .map(function (part) { return part.trim(); })
    .filter(Boolean);
}

function commandSetDtcgToken(root, pathParts, token) {
  var cur = root;
  pathParts.forEach(function (part, index) {
    if (index === pathParts.length - 1) {
      cur[part] = token;
      return;
    }
    if (!cur[part]) cur[part] = {};
    cur = cur[part];
  });
}

function commandCreateDtcgColorTokens(tokens) {
  var out = {
    $schema: 'https://www.designtokens.org/TR/2025.10/format/',
    $description: 'KLIC Figma Toolkit DTCG color token export',
    color: {},
  };
  tokens.forEach(function (token) {
    var path = [token.collection || 'Local'].concat(commandTokenPathParts(token.name));
    commandSetDtcgToken(out.color, path, {
      $type: 'color',
      $value: token.hex,
      $extensions: {
        'com.klic.figma-toolkit': {
          collection: token.collection,
          name: token.name,
        },
      },
    });
  });
  return out;
}

function commandRoundOklch(value) {
  return Math.round(value * 1000) / 1000;
}

function commandOklchDelta(target, source, distance) {
  var hueDelta = Math.abs(target.h - source.h);
  hueDelta = Math.min(hueDelta, Math.PI * 2 - hueDelta);
  return {
    l: commandRoundOklch(target.l - source.l),
    c: commandRoundOklch(target.c - source.c),
    h: commandRoundOklch(hueDelta),
    distance: commandRoundOklch(distance),
  };
}

function commandCollectNodes(root) {
  var out = [];
  function visit(node) {
    out.push(node);
    if ('children' in node) {
      node.children.forEach(visit);
    }
  }
  visit(root);
  return out;
}

async function commandCollectNodesLimited(roots, scanLimit, token) {
  var out = [];
  var stack = roots.slice().reverse();
  var processed = 0;
  var truncated = false;
  while (stack.length > 0) {
    if (token !== commandScanToken) throw new Error('Scan cancelled.');
    var node = stack.pop();
    out.push(node);
    processed++;
    if (out.length >= scanLimit) {
      truncated = stack.length > 0 || ('children' in node && node.children.length > 0);
      break;
    }
    if ('children' in node) {
      for (var i = node.children.length - 1; i >= 0; i--) stack.push(node.children[i]);
    }
    if (processed % 250 === 0) {
      figma.ui.postMessage({ type: 'command-progress', scanned: out.length, scanLimit: scanLimit });
      await new Promise(function (resolve) { setTimeout(resolve, 0); });
    }
  }
  return { nodes: out, scanTruncated: truncated, scanLimit: scanLimit };
}

async function commandGetScanNodes(scope, scanLimit, token) {
  var selection = figma.currentPage.selection || [];
  if (scope === 'selection' && selection.length > 0) {
    return commandCollectNodesLimited(selection, scanLimit, token);
  }
  if (selection.length > 0 && scope !== 'page') {
    return commandCollectNodesLimited(selection, scanLimit, token);
  }
  return commandCollectNodesLimited(figma.currentPage.children, scanLimit, token);
}

function commandPaintIsBound(paint) {
  return !!(paint && paint.boundVariables && paint.boundVariables.color);
}

function commandReadKlicMeta(node) {
  if (!node || typeof node.getPluginData !== 'function') return null;
  var raw = node.getPluginData(KLIC_PLUGIN_DATA_KEY);
  if (!raw) return null;
  try {
    var parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (err) {
    return null;
  }
}

function commandCreateProvenanceSummary() {
  return {
    tools: {},
    sources: {},
    categories: {},
    styleMdHashes: {},
    tableConfigs: 0,
    diagnosticWarnings: 0,
  };
}

function commandIncrementSummary(bucket, key) {
  if (!key) return;
  bucket[key] = (bucket[key] || 0) + 1;
}

function commandAddProvenance(summary, meta) {
  if (!meta) return;
  commandIncrementSummary(summary.tools, meta.tool || 'unknown');
  commandIncrementSummary(summary.sources, meta.sourceName);
  commandIncrementSummary(summary.styleMdHashes, meta.styleMdHash);
  if (Array.isArray(meta.selectedCategories)) {
    meta.selectedCategories.forEach(function (category) {
      commandIncrementSummary(summary.categories, category);
    });
  }
  if (meta.tableConfig) summary.tableConfigs++;
  if (meta.diagnostics && typeof meta.diagnostics.warningCount === 'number') {
    summary.diagnosticWarnings += meta.diagnostics.warningCount;
  }
}

function commandAnalyzePaints(node, property, variablesByHex, variables, items, counts, options) {
  if (!(property in node)) return;
  var paints = node[property];
  if (!Array.isArray(paints)) return;

  paints.forEach(function (paint, index) {
    if (!paint || paint.type !== 'SOLID' || paint.visible === false) return;
    counts.solidPaints++;
    var isBound = commandPaintIsBound(paint);
    if (isBound) counts.boundPaints++;
    else {
      counts.unboundPaints++;
      if (property === 'fills') counts.rawFills++;
      if (property === 'strokes') counts.rawStrokes++;
    }
    var hex = commandColorToHex(paint.color);
    var exact = variablesByHex[hex] || [];
    var opacity = commandPaintOpacity(paint);
    if (!isBound && exact.length > 0 && opacity === 1) {
      counts.exactMatches++;
      items.push({
        id: node.id + ':' + property + ':' + index,
        nodeId: node.id,
        nodeName: node.name,
        nodeType: node.type,
        property: property,
        paintIndex: index,
        hex: hex,
        opacity: opacity,
        variableId: exact[0].id,
        variableName: exact[0].collection + '/' + exact[0].name,
        matchType: 'rgb-exact',
        matchLabel: 'RGB exact',
      });
    } else if (!isBound && exact.length === 0 && opacity === 1 && variables.length > 0) {
      var nearest = commandFindNearestOklchVariable(paint.color, variables);
      if (nearest && nearest.distance <= options.oklchThreshold) {
        counts.oklchSuggestions++;
        items.push({
          id: node.id + ':' + property + ':' + index,
          nodeId: node.id,
          nodeName: node.name,
          nodeType: node.type,
          property: property,
          paintIndex: index,
          hex: hex,
          opacity: opacity,
          variableId: nearest.variable.id,
          variableName: nearest.variable.collection + '/' + nearest.variable.name,
          matchType: 'oklch-suggested',
          matchLabel: 'OKLCH suggested',
          distance: commandRoundOklch(nearest.distance),
          targetOklch: {
            l: commandRoundOklch(nearest.targetOklch.l),
            c: commandRoundOklch(nearest.targetOklch.c),
            h: commandRoundOklch(nearest.targetOklch.h),
          },
          variableOklch: {
            l: commandRoundOklch(nearest.sourceOklch.l),
            c: commandRoundOklch(nearest.sourceOklch.c),
            h: commandRoundOklch(nearest.sourceOklch.h),
          },
          oklchDelta: commandOklchDelta(nearest.targetOklch, nearest.sourceOklch, nearest.distance),
        });
      }
    }
  });
}

async function collectCommandSnapshot(scope, options) {
  options = options || {};
  options.scanLimit = Math.max(50, Math.min(10000, parseInt(options.scanLimit, 10) || 2000));
  options.oklchThreshold = Math.max(0, Math.min(0.5, parseFloat(options.oklchThreshold) || 0.08));
  options.collectionPriority = options.collectionPriority || '';
  var token = ++commandScanToken;
  var scan = await commandGetScanNodes(scope || 'selection', options.scanLimit, token);
  var nodes = scan.nodes;
  commandLastScanNodes = nodes;
  var variables = commandSortVariablesByPriority(await commandGetLocalColorVariables(), options.collectionPriority);
  var variablesByHex = {};
  variables.forEach(function (variable) {
    if (!variablesByHex[variable.hex]) variablesByHex[variable.hex] = [];
    variablesByHex[variable.hex].push(variable);
  });

  var counts = {
    nodeCount: nodes.length,
    solidPaints: 0,
    boundPaints: 0,
    unboundPaints: 0,
    rawFills: 0,
    rawStrokes: 0,
    exactMatches: 0,
    oklchSuggestions: 0,
    generatedKlicNodes: 0,
    localColorVariables: variables.length,
  };
  var items = [];
  var provenanceSummary = commandCreateProvenanceSummary();

  nodes.forEach(function (node) {
    var meta = commandReadKlicMeta(node);
    if (meta) {
      counts.generatedKlicNodes++;
      commandAddProvenance(provenanceSummary, meta);
    }
    commandAnalyzePaints(node, 'fills', variablesByHex, variables, items, counts, options);
    commandAnalyzePaints(node, 'strokes', variablesByHex, variables, items, counts, options);
  });

  var healthScore = counts.solidPaints === 0
    ? 100
    : Math.max(0, Math.round(100 - (counts.unboundPaints / counts.solidPaints) * 55));

  return {
    scope: scope || 'selection',
    scanLimit: scan.scanLimit,
    scanTruncated: scan.scanTruncated,
    healthScore: healthScore,
    nodeCount: counts.nodeCount,
    rawFills: counts.rawFills,
    rawStrokes: counts.rawStrokes,
    boundPaints: counts.boundPaints,
    unboundPaints: counts.unboundPaints,
    exactMatches: counts.exactMatches,
    oklchSuggestions: counts.oklchSuggestions,
    localColorVariables: counts.localColorVariables,
    generatedKlicNodes: counts.generatedKlicNodes,
    provenanceSummary: provenanceSummary,
    previewItems: items.slice(0, 100),
  };
}

async function refreshCommandCenter(msg) {
  try {
    var snapshot = await collectCommandSnapshot(msg.scope || 'selection', msg.options || {});
    figma.ui.postMessage({ type: 'command-snapshot', data: snapshot });
  } catch (err) {
    figma.ui.postMessage({ type: 'command-error', message: err.message || String(err) });
  }
}

async function previewColorBindings(msg) {
  try {
    var snapshot = await collectCommandSnapshot(msg.scope || 'selection', msg.options || {});
    figma.ui.postMessage({ type: 'command-bindings-preview', items: snapshot.previewItems, data: snapshot });
  } catch (err) {
    figma.ui.postMessage({ type: 'command-error', message: err.message || String(err) });
  }
}

async function runKwcagKrdsAudit(msg) {
  try {
    var options = (msg && msg.options) || {};
    options.scanLimit = Math.max(50, Math.min(10000, parseInt(options.scanLimit, 10) || 2000));
    var token = ++commandScanToken;
    var scan = await commandGetScanNodes((msg && msg.scope) || 'selection', options.scanLimit, token);
    var issues = [];
    var textNodeCount = 0;
    var nonTextNodeCount = 0;
    var targetNodeCount = 0;
    scan.nodes.forEach(function (node) {
      if (!node) return;
      if (node.type === 'TEXT') {
        textNodeCount++;
        var textColor = commandSolidPaintColor(node.fills);
        if (!textColor) return;
        var backgroundColor = commandFindBackgroundColor(node);
        var ratio = commandContrastRatio(textColor, backgroundColor);
        var requiredRatio = 4.5;
        if (ratio < requiredRatio) {
          issues.push({
            type: 'kwcag-text-contrast',
            severity: 'error',
            standard: 'KWCAG 2.2 + KRDS',
            rule: 'KWCAG 2.2 텍스트 콘텐츠의 명도 대비 / KRDS 4.5:1 text label contrast',
            nodeId: node.id,
            nodeName: node.name,
            nodeType: node.type,
            textSample: (node.characters || '').slice(0, 80),
            foreground: commandColorToHex(textColor),
            background: commandColorToHex(backgroundColor),
            contrastRatio: commandRoundRatio(ratio),
            requiredRatio: requiredRatio,
            recommendation: '텍스트와 배경 간 명도 대비를 4.5:1 이상으로 조정하세요.',
          });
        }
        return;
      }

      if (commandShouldAuditNonTextContrast(node)) {
        nonTextNodeCount++;
        var fg = commandSolidPaintColor(node.fills) || commandSolidPaintColor(node.strokes);
        if (fg) {
          var bg = commandFindBackgroundColor(node);
          var nonTextRatio = commandContrastRatio(fg, bg);
          if (nonTextRatio < 3) {
            issues.push({
              type: 'kwcag-non-text-contrast',
              severity: 'warning',
              standard: 'KWCAG 2.2 + KRDS',
              rule: 'KWCAG 2.2 색에 무관한 콘텐츠 인식 / KRDS 3:1 non-text contrast',
              nodeId: node.id,
              nodeName: node.name,
              nodeType: node.type,
              foreground: commandColorToHex(fg),
              background: commandColorToHex(bg),
              contrastRatio: commandRoundRatio(nonTextRatio),
              requiredRatio: 3,
              recommendation: '아이콘, 컨트롤 경계, 상태 표시 등 비텍스트 요소는 인접 배경과 3:1 이상 대비가 필요합니다.',
            });
          }
        }
      }

      if (commandIsLikelyInteractiveNode(node) && typeof node.width === 'number' && typeof node.height === 'number') {
        targetNodeCount++;
        if (node.width < 44 || node.height < 44) {
          issues.push({
            type: 'krds-target-size',
            severity: 'warning',
            standard: 'KWCAG 2.2 + KRDS',
            rule: 'KRDS 조작 가능 / 터치 타깃 44px 이상',
            nodeId: node.id,
            nodeName: node.name,
            nodeType: node.type,
            width: commandRoundRatio(node.width),
            height: commandRoundRatio(node.height),
            minSize: 44,
            recommendation: '버튼, 탭, 태그, 입력 컨트롤 등 조작 가능한 요소는 최소 44×44px 이상으로 설계하세요.',
          });
        }
      }
    });
    figma.ui.postMessage({
      type: 'command-kwcag-krds-audit-result',
      summary: {
        standard: 'KWCAG 2.2 + KRDS',
        scope: (msg && msg.scope) || 'selection',
        scannedNodes: scan.nodes.length,
        scannedTextNodes: textNodeCount,
        scannedNonTextNodes: nonTextNodeCount,
        scannedTargetNodes: targetNodeCount,
        issueCount: issues.length,
        scanTruncated: scan.scanTruncated,
      },
      issues: issues.slice(0, 100),
    });
  } catch (err) {
    figma.ui.postMessage({ type: 'command-error', message: err.message || String(err) });
  }
}

async function runComponentQa(msg) {
  try {
    var options = (msg && msg.options) || {};
    options.scanLimit = Math.max(50, Math.min(10000, parseInt(options.scanLimit, 10) || 2000));
    var token = ++commandScanToken;
    var scan = await commandGetScanNodes((msg && msg.scope) || 'selection', options.scanLimit, token);
    var issues = [];
    var componentCount = 0;
    var componentSetCount = 0;
    scan.nodes.forEach(function (node) {
      if (!node) return;
      if (node.type === 'COMPONENT_SET') {
        componentSetCount++;
        var variantCount = node.children ? node.children.filter(function (child) { return child.type === 'COMPONENT'; }).length : 0;
        var isInteractiveSet = commandIsLikelyInteractiveNode(node);
        if (variantCount < 2) {
          issues.push({
            type: 'component-set-coverage',
            severity: 'error',
            nodeId: node.id,
            nodeName: node.name,
            nodeType: node.type,
            variantCount: variantCount,
            rule: 'Component set must contain at least two variants',
            recommendation: '상태, 크기, 타입 중 최소 두 개 이상의 variant를 포함하도록 component set을 보강하세요.',
          });
        }
        if (isInteractiveSet && !commandComponentHasFocusState(node)) {
          issues.push({
            type: 'component-focus-state',
            severity: 'warning',
            nodeId: node.id,
            nodeName: node.name,
            nodeType: node.type,
            rule: 'KWCAG 2.2 focus visibility / KRDS keyboard focus state coverage',
            recommendation: '버튼, 링크, 탭, 입력 컴포넌트는 Focus 또는 Focused 상태 variant를 포함해 키보드 포커스 표시를 설계하세요.',
          });
        }
        return;
      }
      if (node.type !== 'COMPONENT') return;
      componentCount++;
      var parentIsSet = node.parent && node.parent.type === 'COMPONENT_SET';
      var isInteractiveComponent = commandIsLikelyInteractiveNode(node);
      var hasVariantName = node.name.indexOf('=') >= 0;
      if (!parentIsSet && isInteractiveComponent && !hasVariantName) {
        issues.push({
          type: 'component-naming',
          severity: 'warning',
          nodeId: node.id,
          nodeName: node.name,
          nodeType: node.type,
          rule: 'Interactive component variants should use Property=Value naming',
          recommendation: '예: Size=M, State=Default, Type=Primary처럼 variant property가 보이는 이름을 사용하세요.',
        });
      }
      if (!parentIsSet && isInteractiveComponent && !commandComponentHasFocusState(node)) {
        issues.push({
          type: 'component-focus-state',
          severity: 'warning',
          nodeId: node.id,
          nodeName: node.name,
          nodeType: node.type,
          rule: 'KWCAG 2.2 focus visibility / KRDS keyboard focus state coverage',
          recommendation: '인터랙티브 컴포넌트는 Focus 또는 Focused 상태를 별도 variant로 제공해 포커스 가시성을 검토할 수 있게 하세요.',
        });
      }
      if (isInteractiveComponent && node.children && node.children.length > 0 && !node.layoutMode) {
        issues.push({
          type: 'component-autolayout',
          severity: 'warning',
          nodeId: node.id,
          nodeName: node.name,
          nodeType: node.type,
          rule: 'Interactive components should use auto layout',
          recommendation: '버튼, 입력, 탭 같은 반복 컴포넌트는 padding/gap/정렬을 auto layout으로 관리하세요.',
        });
      }
    });
    figma.ui.postMessage({
      type: 'command-component-qa-result',
      summary: {
        standard: 'KLIC Component QA',
        scope: (msg && msg.scope) || 'selection',
        scannedNodes: scan.nodes.length,
        componentCount: componentCount,
        componentSetCount: componentSetCount,
        issueCount: issues.length,
        scanTruncated: scan.scanTruncated,
      },
      issues: issues.slice(0, 100),
    });
  } catch (err) {
    figma.ui.postMessage({ type: 'command-error', message: err.message || String(err) });
  }
}

async function runTokenGovernance() {
  try {
    var variables = await commandGetLocalColorVariables();
    var issues = [];
    var byHex = {};
    variables.forEach(function (variable) {
      if (!byHex[variable.hex]) byHex[variable.hex] = [];
      byHex[variable.hex].push(variable);
      if (variable.name.indexOf('/') < 0) {
        issues.push({
          type: 'token-naming',
          severity: 'warning',
          collection: variable.collection,
          name: variable.name,
          hex: variable.hex,
          rule: 'Token names should use path naming',
          recommendation: '예: Primary/50, Semantic/Danger/Base처럼 그룹/역할/단계가 드러나는 경로형 이름을 사용하세요.',
        });
      }
    });
    Object.keys(byHex).forEach(function (hex) {
      var group = byHex[hex];
      if (group.length < 2) return;
      issues.push({
        type: 'token-duplicate-value',
        severity: 'warning',
        hex: hex,
        count: group.length,
        tokens: group.map(function (variable) { return variable.collection + '/' + variable.name; }),
        rule: 'Duplicate color token values should be reviewed',
        recommendation: '같은 색상값이 여러 토큰에 있으면 alias, semantic role, deprecation 여부를 검토하세요.',
      });
    });
    figma.ui.postMessage({
      type: 'command-token-governance-result',
      summary: {
        standard: 'KLIC Token Governance',
        tokenCount: variables.length,
        duplicateGroups: Object.keys(byHex).filter(function (hex) { return byHex[hex].length > 1; }).length,
        issueCount: issues.length,
      },
      issues: issues.slice(0, 100),
    });
  } catch (err) {
    figma.ui.postMessage({ type: 'command-error', message: err.message || String(err) });
  }
}

function cancelCommandScan() {
  commandScanToken++;
  figma.ui.postMessage({ type: 'command-progress', cancelled: true });
}

async function commandGetNodeById(nodeId) {
  if (figma.getNodeByIdAsync) return await figma.getNodeByIdAsync(nodeId);
  return figma.getNodeById(nodeId);
}

async function commandGetVariableById(variableId) {
  if (figma.variables.getVariableByIdAsync) return await figma.variables.getVariableByIdAsync(variableId);
  return figma.variables.getVariableById(variableId);
}

async function applyColorBindings(msg) {
  var changes = msg.changes || [];
  var applied = 0;
  var skipped = 0;
  try {
    for (var i = 0; i < changes.length; i++) {
      var change = changes[i];
      var includeOklchApply = !!(msg.options && msg.options.includeOklchApply);
      if (change.matchType && change.matchType !== 'rgb-exact' && !(includeOklchApply && change.matchType === 'oklch-suggested')) { skipped++; continue; }
      var node = await commandGetNodeById(change.nodeId);
      var variable = await commandGetVariableById(change.variableId);
      if (!node || !variable || !(change.property in node)) { skipped++; continue; }
      var paints = node[change.property];
      if (!Array.isArray(paints) || !paints[change.paintIndex] || paints[change.paintIndex].type !== 'SOLID') {
        skipped++;
        continue;
      }
      var nextPaints = paints.slice();
      if (figma.variables.setBoundVariableForPaint) {
        nextPaints[change.paintIndex] = figma.variables.setBoundVariableForPaint(nextPaints[change.paintIndex], 'color', variable);
      } else {
        nextPaints[change.paintIndex] = Object.assign({}, nextPaints[change.paintIndex], {
          boundVariables: { color: { type: 'VARIABLE_ALIAS', id: variable.id } },
        });
      }
      node[change.property] = nextPaints;
      applied++;
    }
    figma.ui.postMessage({ type: 'command-apply-result', applied: applied, skipped: skipped });
    await refreshCommandCenter({ scope: msg.scope || 'selection', options: msg.options || {} });
  } catch (err) {
    figma.ui.postMessage({ type: 'command-error', message: err.message || String(err) });
  }
}

async function commandApplySingleColorBinding(change) {
  var node = await commandGetNodeById(change.nodeId);
  var variable = await commandGetVariableById(change.variableId);
  if (!node || !variable || !(change.property in node)) return false;
  var paints = node[change.property];
  if (!Array.isArray(paints) || !paints[change.paintIndex] || paints[change.paintIndex].type !== 'SOLID') return false;
  var nextPaints = paints.slice();
  if (figma.variables.setBoundVariableForPaint) {
    nextPaints[change.paintIndex] = figma.variables.setBoundVariableForPaint(nextPaints[change.paintIndex], 'color', variable);
  } else {
    nextPaints[change.paintIndex] = Object.assign({}, nextPaints[change.paintIndex], {
      boundVariables: { color: { type: 'VARIABLE_ALIAS', id: variable.id } },
    });
  }
  node[change.property] = nextPaints;
  return true;
}

async function exportCommandTokens() {
  try {
    var variables = await commandGetLocalColorVariables();
    var tokens = variables.map(function (v) {
      return { collection: v.collection, name: v.name, hex: v.hex };
    });
    var snapshot = await collectCommandSnapshot('page', {
      scanLimit: 2000,
      oklchThreshold: 0.08,
    });
    var audit = {
      healthScore: snapshot.healthScore,
      nodeCount: snapshot.nodeCount,
      rawFills: snapshot.rawFills,
      rawStrokes: snapshot.rawStrokes,
      boundPaints: snapshot.boundPaints,
      unboundPaints: snapshot.unboundPaints,
      exactMatches: snapshot.exactMatches,
      oklchSuggestions: snapshot.oklchSuggestions,
      generatedKlicNodes: snapshot.generatedKlicNodes,
      provenanceSummary: snapshot.provenanceSummary,
      previewItems: snapshot.previewItems,
    };
    var payload = {
      generatedAt: new Date().toISOString(),
      tokenCount: tokens.length,
      tokens: tokens,
      dtcg: {
        format: 'DTCG',
        schema: 'https://www.designtokens.org/TR/2025.10/format/',
        tokenRoot: 'color',
      },
      audit: audit,
    };
    var json = JSON.stringify(payload, null, 2);
    var dtcgJson = JSON.stringify(commandCreateDtcgColorTokens(tokens), null, 2);
    var css = ':root {\n' + variables.map(function (v) {
      var name = (v.collection + '-' + v.name).toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      return '  --' + name + ': ' + v.hex + ';';
    }).join('\n') + '\n}';
    figma.ui.postMessage({
      type: 'command-handoff-export',
      json: json,
      dtcgJson: dtcgJson,
      css: css,
      count: variables.length,
      summary: {
        tokenCount: tokens.length,
        healthScore: audit.healthScore,
        unboundPaints: audit.unboundPaints,
        generatedKlicNodes: audit.generatedKlicNodes,
        diagnosticWarnings: audit.provenanceSummary && audit.provenanceSummary.diagnosticWarnings || 0,
      },
    });
  } catch (err) {
    figma.ui.postMessage({ type: 'command-error', message: err.message || String(err) });
  }
}

async function createCommandReportBoard(msg) {
  try {
    var snapshot = await collectCommandSnapshot((msg && msg.scope) || 'page', (msg && msg.options) || {});
    await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
    await figma.loadFontAsync({ family: 'Inter', style: 'Bold' });
    var board = figma.createFrame();
    board.name = 'KLIC Design System Report';
    board.layoutMode = 'VERTICAL';
    board.primaryAxisSizingMode = 'AUTO';
    board.counterAxisSizingMode = 'AUTO';
    board.paddingTop = 32; board.paddingRight = 32; board.paddingBottom = 32; board.paddingLeft = 32;
    board.itemSpacing = 14;
    board.fills = [{ type: 'SOLID', color: { r: 0.98, g: 0.98, b: 0.99 } }];
    function reportText(text, size, bold) {
      var t = figma.createText();
      t.fontName = { family: 'Inter', style: bold ? 'Bold' : 'Regular' };
      t.fontSize = size;
      t.characters = text;
      t.fills = [{ type: 'SOLID', color: { r: 0.1, g: 0.1, b: 0.13 } }];
      return t;
    }
    board.appendChild(reportText('KLIC Design System Report', 24, true));
    board.appendChild(reportText('Health: ' + snapshot.healthScore + ' / Nodes: ' + snapshot.nodeCount, 14, false));
    board.appendChild(reportText('Raw fills: ' + snapshot.rawFills + ' · Raw strokes: ' + snapshot.rawStrokes, 14, false));
    board.appendChild(reportText('RGB exact: ' + snapshot.exactMatches + ' · OKLCH suggestions: ' + snapshot.oklchSuggestions, 14, false));
    board.appendChild(reportText('KLIC generated nodes: ' + snapshot.generatedKlicNodes, 14, false));
    var provenanceTools = Object.keys(snapshot.provenanceSummary.tools || {}).map(function (key) {
      return key + ' ' + snapshot.provenanceSummary.tools[key];
    }).join(' · ');
    var provenanceSources = Object.keys(snapshot.provenanceSummary.sources || {}).map(function (key) {
      return key + ' ' + snapshot.provenanceSummary.sources[key];
    }).join(' · ');
    board.appendChild(reportText('Provenance: ' + (provenanceTools || 'none'), 14, false));
    if (provenanceSources) board.appendChild(reportText('Sources: ' + provenanceSources, 14, false));
    figma.currentPage.appendChild(board);
    tagKlicNode(board, 'handoff-report', { snapshot: snapshot });
    figma.viewport.scrollAndZoomIntoView([board]);
    figma.ui.postMessage({ type: 'command-report-created', nodeId: board.id, snapshot: snapshot });
  } catch (err) {
    figma.ui.postMessage({ type: 'command-error', message: err.message || String(err) });
  }
}

var KLIC_SMOKE_EVIDENCE_RECEIVER_URL = 'http://127.0.0.1:51337/klic-figma-smoke-evidence';

async function commandPostSmokeEvidence(evidence) {
  if (typeof fetch !== 'function') throw new Error('fetch is not available in this Figma runtime.');
  var res = await fetch(KLIC_SMOKE_EVIDENCE_RECEIVER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(evidence),
  });
  if (!res || !res.ok) {
    throw new Error('Local smoke evidence receiver rejected the evidence.');
  }
  return true;
}

async function commandMaybeRunLocalSmokeEvidence() {
  if (typeof fetch !== 'function') return false;
  try {
    var ready = await fetch(KLIC_SMOKE_EVIDENCE_RECEIVER_URL, { method: 'GET' });
    if (!ready || !ready.ok) return false;
    await runCommandSmokeTest({ postToLocalhost: true });
    return true;
  } catch (err) {
    return false;
  }
}

async function runCommandSmokeTest(options) {
  options = options || {};
  try {
    var smokeChecks = [];
    function addSmokeCheck(name, passed, detail) {
      smokeChecks.push({ name: name, passed: !!passed, detail: detail || '' });
    }

    var collection = (await commandGetLocalVariableCollections())
      .find(function (c) { return c.name === 'KLIC Smoke Test'; })
      || figma.variables.createVariableCollection('KLIC Smoke Test');
    var existing = (await commandGetLocalVariables('COLOR'))
      .find(function (v) { return v.name === 'Smoke/Primary' && v.variableCollectionId === collection.id; });
    var variable = existing || figma.variables.createVariable('Smoke/Primary', collection, 'COLOR');
    var smokeColor = { r: 0.0705882353, g: 0.6274509804, b: 0.9843137255 };
    variable.setValueForMode(collection.defaultModeId, smokeColor);
    addSmokeCheck('Create local COLOR variable', !!variable.id, variable.name);

    var rect = figma.createRectangle();
    rect.name = 'KLIC Smoke Test Rect';
    rect.resize(160, 96);
    rect.fills = [{ type: 'SOLID', color: smokeColor }];
    rect.x = Math.round(figma.viewport.center.x - 80);
    rect.y = Math.round(figma.viewport.center.y - 48);
    figma.currentPage.appendChild(rect);
    figma.currentPage.selection = [rect];
    addSmokeCheck('Create selectable test node', figma.currentPage.selection[0] && figma.currentPage.selection[0].id === rect.id, rect.id);

    var before = await collectCommandSnapshot('selection', {
      scanLimit: 100,
      oklchThreshold: 0.08,
      collectionPriority: 'KLIC Smoke Test',
    });
    var exactItem = before.previewItems.find(function (item) {
      return item.nodeId === rect.id && item.matchType === 'rgb-exact';
    });
    addSmokeCheck('Detect RGB exact token match', !!exactItem, exactItem && exactItem.variableName);
    if (!exactItem) throw new Error('Smoke test did not find RGB exact match.');

    var applied = await commandApplySingleColorBinding(exactItem);
    addSmokeCheck('Apply RGB exact binding', applied, variable.id);
    if (!applied) throw new Error('Smoke test binding apply failed.');
    var afterPaint = rect.fills[0];
    var smokeTestPassed = !!(afterPaint && afterPaint.boundVariables && afterPaint.boundVariables.color);
    addSmokeCheck('Verify boundVariables.color', smokeTestPassed, rect.id);

    var localTokens = await commandGetLocalColorVariables();
    var smokeExportPassed = localTokens.some(function (token) {
      return token.collection === 'KLIC Smoke Test' && token.name === 'Smoke/Primary' && token.hex === commandColorToHex(smokeColor);
    });
    addSmokeCheck('Export token data available', smokeExportPassed, String(localTokens.length));

    var componentA = figma.createComponent();
    componentA.name = 'State=Default';
    componentA.resize(120, 40);
    componentA.cornerRadius = 6;
    componentA.fills = [{ type: 'SOLID', color: smokeColor }];
    figma.currentPage.appendChild(componentA);
    addSmokeCheck('Create component node', componentA.type === 'COMPONENT' && !!componentA.id, componentA.id);

    var componentInstance = componentA.createInstance();
    componentInstance.name = 'KLIC Smoke Button Instance';
    componentInstance.x = rect.x + 190;
    componentInstance.y = rect.y;
    figma.currentPage.appendChild(componentInstance);
    addSmokeCheck('Create component instance', componentInstance.type === 'INSTANCE' && !!componentInstance.id, componentInstance.id);

    var componentB = figma.createComponent();
    componentB.name = 'State=Hover';
    componentB.resize(120, 40);
    componentB.cornerRadius = 6;
    componentB.fills = [{ type: 'SOLID', color: { r: 0.0352941176, g: 0.4705882353, b: 0.8 } }];
    figma.currentPage.appendChild(componentB);
    var smokeComponentSet = figma.combineAsVariants([componentA, componentB], figma.currentPage);
    smokeComponentSet.name = 'KLIC Smoke Button';
    smokeComponentSet.x = rect.x + 190;
    smokeComponentSet.y = rect.y + 70;
    var componentSetPassed = smokeComponentSet
      && smokeComponentSet.type === 'COMPONENT_SET'
      && smokeComponentSet.children
      && smokeComponentSet.children.length >= 2;
    addSmokeCheck('Combine component variants', componentSetPassed, smokeComponentSet && smokeComponentSet.id);
    tagKlicNode(smokeComponentSet, 'runtime-smoke-component-set', { smokeComponentSetPassed: componentSetPassed });

    await figma.loadFontAsync({ family: 'Inter', style: 'Regular' }).catch(function () {});
    await figma.loadFontAsync({ family: 'Inter', style: 'Bold' }).catch(function () {});
    var report = figma.createFrame();
    report.name = 'KLIC Smoke Test Report';
    report.layoutMode = 'VERTICAL';
    report.primaryAxisSizingMode = 'AUTO';
    report.counterAxisSizingMode = 'AUTO';
    report.paddingTop = report.paddingRight = report.paddingBottom = report.paddingLeft = 20;
    report.itemSpacing = 8;
    report.fills = [{ type: 'SOLID', color: { r: 0.98, g: 0.98, b: 0.99 } }];
    function smokeReportText(text, size, bold) {
      var t = figma.createText();
      t.fontName = { family: 'Inter', style: bold ? 'Bold' : 'Regular' };
      t.fontSize = size;
      t.characters = text;
      t.fills = [{ type: 'SOLID', color: { r: 0.1, g: 0.1, b: 0.13 } }];
      return t;
    }
    report.appendChild(smokeReportText('Runtime smoke test: ' + (smokeTestPassed ? 'passed' : 'failed'), 14, true));
    report.appendChild(smokeReportText('Generated: ' + new Date().toISOString(), 11, false));
    smokeChecks.forEach(function (check) {
      report.appendChild(smokeReportText((check.passed ? 'OK' : 'FAIL') + ' · ' + check.name + (check.detail ? ' · ' + check.detail : ''), 12, false));
    });
    figma.currentPage.appendChild(report);
    tagKlicNode(report, 'runtime-smoke-report', { smokeTestPassed: smokeTestPassed, smokeChecks: smokeChecks });
    var smokeReportPassed = report.getPluginData(KLIC_PLUGIN_DATA_KEY).indexOf('runtime-smoke-report') >= 0;
    addSmokeCheck('Create report board with pluginData', smokeReportPassed, report.id);

    var smokeRuntime = {
      kind: (figma.editorType === 'figma' && figma.apiVersion) ? 'figma-plugin' : 'mock-runtime',
      editorType: figma.editorType || 'mock',
      apiVersion: figma.apiVersion || 'mock',
      pluginId: figma.pluginId || null,
    };

    var preliminaryEvidence = {
      generatedAt: new Date().toISOString(),
      runtime: smokeRuntime,
      passed: false,
      passCount: smokeChecks.filter(function (check) { return check.passed; }).length,
      failCount: smokeChecks.filter(function (check) { return !check.passed; }).length,
      nodeId: rect.id,
      reportNodeId: report.id,
      variableId: variable.id,
      componentSetId: smokeComponentSet.id,
      componentInstanceId: componentInstance.id,
      checks: smokeChecks,
    };

    tagKlicNode(rect, 'runtime-smoke-test', {
      smokeTestPassed: smokeTestPassed,
      smokeExportPassed: smokeExportPassed,
      smokeReportPassed: smokeReportPassed,
      smokePluginDataPassed: true,
      smokeEvidence: preliminaryEvidence,
      smokeChecks: smokeChecks,
    });
    var smokePluginDataPassed = rect.getPluginData(KLIC_PLUGIN_DATA_KEY).indexOf('smokeTestPassed') >= 0;
    addSmokeCheck('Persist smoke-test pluginData', smokePluginDataPassed, rect.id);

    var allPassed = smokeChecks.every(function (check) { return check.passed; });
    var smokeEvidence = {
      generatedAt: preliminaryEvidence.generatedAt,
      runtime: smokeRuntime,
      passed: allPassed,
      passCount: smokeChecks.filter(function (check) { return check.passed; }).length,
      failCount: smokeChecks.filter(function (check) { return !check.passed; }).length,
      nodeId: rect.id,
      reportNodeId: report.id,
      variableId: variable.id,
      componentSetId: smokeComponentSet.id,
      componentInstanceId: componentInstance.id,
      checks: smokeChecks,
    };
    tagKlicNode(report, 'runtime-smoke-report', {
      smokeTestPassed: smokeTestPassed,
      smokeChecks: smokeChecks,
      smokeEvidence: smokeEvidence,
      passCount: smokeEvidence.passCount,
      failCount: smokeEvidence.failCount,
    });
    tagKlicNode(rect, 'runtime-smoke-test', {
      smokeTestPassed: smokeTestPassed,
      smokeExportPassed: smokeExportPassed,
      smokeReportPassed: smokeReportPassed,
      smokePluginDataPassed: smokePluginDataPassed,
      smokeEvidence: smokeEvidence,
      smokeChecks: smokeChecks,
    });
    figma.viewport.scrollAndZoomIntoView([rect]);
    figma.ui.postMessage({
      type: 'command-smoke-test-result',
      passed: allPassed,
      smokeChecks: smokeChecks,
      evidence: smokeEvidence,
      before: before,
      nodeId: rect.id,
      reportNodeId: report.id,
      variableId: variable.id,
    });
    if (options.postToLocalhost) {
      try {
        await commandPostSmokeEvidence(smokeEvidence);
        figma.notify('KLIC smoke evidence sent to local audit receiver.');
      } catch (postErr) {
        figma.notify('KLIC smoke evidence was generated, but local receiver capture failed.');
        figma.ui.postMessage({ type: 'command-error', message: postErr.message || String(postErr) });
      }
    }
  } catch (err) {
    figma.ui.postMessage({ type: 'command-smoke-test-result', passed: false, message: err.message || String(err) });
  }
}
