import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(root, '..');
const uiPath = path.join(root, 'ui.html');
const styleGuidePath = path.join(repoRoot, 'style-guide-viewer_ver2.md');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

class FakeClassList {
  constructor() {
    this.names = new Set();
  }

  toggle(name, enabled) {
    if (enabled) this.names.add(name);
    else this.names.delete(name);
  }

  contains(name) {
    return this.names.has(name);
  }
}

class FakeElement {
  constructor(id = '') {
    this.id = id;
    this.dataset = {};
    this.style = {};
    this.classList = new FakeClassList();
    this.value = '';
    this.textContent = '';
    this.innerHTML = '';
    this.placeholder = '';
    this.title = '';
    this.attributes = {};
    this.disabled = false;
    this.checked = false;
  }

  addEventListener() {}

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  getAttribute(name) {
    return this.attributes[name];
  }

  querySelectorAll() {
    return [];
  }
}

function makeDocument() {
  const byId = new Map();
  const groups = new Map([
    ['[data-i18n]', []],
    ['[data-i18n-ph]', []],
    ['[data-i18n-html]', []],
    ['[data-i18n-title]', []],
    ['[data-i18n-aria]', []],
    ['.font-result-item', []],
  ]);

  function getElementById(id) {
    if (!byId.has(id)) byId.set(id, new FakeElement(id));
    return byId.get(id);
  }

  function addDataElement(selector, datasetKey, key) {
    const el = new FakeElement();
    el.dataset[datasetKey] = key;
    groups.get(selector).push(el);
    return el;
  }

  return {
    byId,
    documentElement: { lang: '' },
    getElementById,
    querySelectorAll(selector) {
      return groups.get(selector) || [];
    },
    addDataElement,
  };
}

function extractScript(ui) {
  const match = ui.match(/<script>([\s\S]*)<\/script>/);
  assert(match, 'ui.html script tag missing');
  return match[1];
}

function extractEmbeddedStyleGuide(ui) {
  const match = ui.match(/const STYLE_GUIDE_VIEWER_MD = `([\s\S]*?)`;\n\nfunction hexToHsl/);
  assert(match, 'STYLE_GUIDE_VIEWER_MD literal is missing or malformed');
  return Function(`return \`${match[1]}\`;`)();
}

function createI18nHarness(script) {
  const match = script.match(/const I18N = [\s\S]*?function resizeUi\(size\) \{[\s\S]*?\n\}/);
  assert(match, 'i18n block is missing or malformed');
  const document = makeDocument();
  const storage = new Map();
  const localStorage = {
    getItem(key) {
      return storage.has(key) ? storage.get(key) : null;
    },
    setItem(key, value) {
      storage.set(key, String(value));
    },
  };

  const exportJsonLabel = document.addDataElement('[data-i18n]', 'i18n', 'style.exportJson');
  const importJsonLabel = document.addDataElement('[data-i18n]', 'i18n', 'style.importJson');
  const mdPlaceholder = document.addDataElement('[data-i18n-ph]', 'i18nPh', 'style.mdPh');
  const csvHint = document.addDataElement('[data-i18n-html]', 'i18nHtml', 'menu.csvHint');
  const reloadTitle = document.addDataElement('[data-i18n-title]', 'i18nTitle', 'style.reloadTitle');
  const sizeGroup = document.addDataElement('[data-i18n-aria]', 'i18nAria', 'ui.sizeGroup');
  document.getElementById('lang-en');
  document.getElementById('lang-ko');

  const harness = Function(
    'document',
    'localStorage',
    'navigator',
    'commandRenderDynamicI18n',
    'menuRenderFilterTags',
    'menuUpdateCount',
    'tableRefreshDetected',
    `${match[0]}
return { I18N, t, applyLang, setLang, getLang: () => LANG };`,
  )(
    document,
    localStorage,
    { language: 'en-US' },
    () => {},
    () => {},
    () => {},
    () => {},
  );

  return {
    ...harness,
    document,
    localStorage,
    elements: { exportJsonLabel, importJsonLabel, mdPlaceholder, csvHint, reloadTitle, sizeGroup },
  };
}

function createStyleHarness(script, document, t, embeddedMd) {
  const styleBlockMatch = script.match(/function hexToHsl[\s\S]*?\n\nfunction styleImportJsonFile/);
  assert(styleBlockMatch, 'style guide UI block is missing or malformed');
  const styleBlock = styleBlockMatch[0].replace(/\n\nfunction styleImportJsonFile$/, '');
  const requiredIds = [
    'style-md',
    'style-file-name',
    'style-reload',
    'style-brand-prev',
    'style-gray-prev',
    'style-semantic-prev',
    'style-spacing-prev',
    'style-radius-prev',
    'style-font-input',
    'style-font-label',
    'style-preview',
    'style-gen-section',
    'style-summary',
    'style-result',
  ];
  requiredIds.forEach((id) => document.getElementById(id));

  return Function(
    'document',
    'STYLE_GUIDE_VIEWER_MD',
    't',
    'alert',
    `${styleBlock}
return {
  parseMD,
  styleProcessData,
  styleLoadEmbeddedMd,
  styleRenderImportedData,
  styleBuildMeta,
  getStyleProcessed: () => styleProcessed,
};`,
  )(document, embeddedMd, t, (message) => {
    throw new Error(`unexpected alert: ${message}`);
  });
}

function createCommandHarness(script, t) {
  const smokeMatch = script.match(/function commandRenderSmokeChecks\(msg\) \{[\s\S]*?\n\}/);
  assert(smokeMatch, 'command smoke renderer is missing or malformed');
  const snapshotMatch = script.match(/function commandRenderSnapshot\(data\) \{[\s\S]*?\nfunction commandRenderBindingPreview/);
  assert(snapshotMatch, 'command snapshot renderer is missing or malformed');
  const snapshotBlock = snapshotMatch[0].replace(/\nfunction commandRenderBindingPreview$/, '');
  const setTextCalls = {};
  const harness = Function(
    't',
    'setTextCalls',
    `function commandEscape(s) {
  return String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}
function commandSetText(id, value) {
  setTextCalls[id] = String(value);
}
let commandLastSnapshot = null;
${snapshotBlock}
${smokeMatch[0]}
return { commandRenderSmokeChecks, commandRenderSnapshot };`,
  )(t, setTextCalls);
  return { ...harness, setTextCalls };
}

function createProjectPipelineHarness(script) {
  const presetMatch = script.match(/function commandGetProjectPreset\(presetId\) \{[\s\S]*?\nfunction commandApplyProjectPreset/);
  assert(presetMatch, 'commandGetProjectPreset is missing');
  const stepsMatch = script.match(/function commandBuildPipelineSteps\(presetId\) \{[\s\S]*?\nfunction commandRenderProjectPipeline/);
  assert(stepsMatch, 'commandBuildPipelineSteps is missing');
  const presetBlock = presetMatch[0].replace(/\nfunction commandApplyProjectPreset$/, '');
  const stepsBlock = stepsMatch[0].replace(/\nfunction commandRenderProjectPipeline$/, '');
  return Function(`${presetBlock}
${stepsBlock}
return { commandGetProjectPreset, commandBuildPipelineSteps };`)();
}

function createDiagnosticsHarness(script) {
  const menuMatch = script.match(/function menuAnalyzeData\(data\) \{[\s\S]*?\nfunction menuRenderDiagnostics/);
  assert(menuMatch, 'menuAnalyzeData is missing');
  const tableMatch = script.match(/function tableAnalyzeRows\(parts\) \{[\s\S]*?\nfunction tableRenderDiagnostics/);
  assert(tableMatch, 'tableAnalyzeRows is missing');
  const menuBlock = menuMatch[0].replace(/\nfunction menuRenderDiagnostics$/, '');
  const tableBlock = tableMatch[0].replace(/\nfunction tableRenderDiagnostics$/, '');
  const presetMatch = script.match(/function tableGetPresetConfig\(preset\) \{[\s\S]*?\nfunction tableApplyPreset/);
  assert(presetMatch, 'tableGetPresetConfig is missing');
  const alignmentMatch = script.match(/function tableInferColumnAlignments\(parts\) \{[\s\S]*?\nfunction tableUpdateDetected/);
  assert(alignmentMatch, 'tableInferColumnAlignments is missing');
  const presetBlock = presetMatch[0].replace(/\nfunction tableApplyPreset$/, '');
  const alignmentBlock = alignmentMatch[0].replace(/\nfunction tableUpdateDetected$/, '');
  return Function(`${menuBlock}
${tableBlock}
${presetBlock}
${alignmentBlock}
return { menuAnalyzeData, tableAnalyzeRows, tableGetPresetConfig, tableInferColumnAlignments };`)();
}

const ui = fs.readFileSync(uiPath, 'utf8');
const styleGuideMd = fs.readFileSync(styleGuidePath, 'utf8');
const script = extractScript(ui);
const embeddedMd = extractEmbeddedStyleGuide(ui);
assert(embeddedMd.trim() === styleGuideMd.trim(), 'embedded style-guide-viewer_ver2.md does not match source md');
assert(ui.includes('id="size-compact"') && ui.includes('id="size-default"') && ui.includes('id="size-wide"'), 'UI size preset buttons should render');
assert(script.includes('function resizeUi') && script.includes("type: 'ui-resize'"), 'UI size preset buttons should send ui-resize messages');
assert(script.includes("safeStorageSet('klic.uiSize', uiSize)"), 'UI size selection should persist through safe storage');
assert(script.includes("msg.type === 'ui-resized'"), 'UI should handle ui-resized acknowledgements');
assert(ui.includes('id="command-project-type"'), 'Command Center should render a project type preset selector');
assert(ui.includes('id="command-pipeline"'), 'Command Center should render the Project Pipeline status board');
assert(ui.includes('id="tool-qa"') && ui.includes('id="pane-qa"'), 'QA should be promoted to a top-level tool tab');
assert(ui.includes('id="tool-handoff"') && ui.includes('id="pane-handoff"'), 'Handoff should be promoted to a top-level tool tab');
assert(ui.includes('id="qa-result-list"'), 'QA pane should own the QA result list');
assert(ui.includes('id="handoff-result-list"'), 'Handoff pane should own handoff and smoke result output');
assert(ui.includes('id="style-binding-list"'), 'Style Guide should own variable binding preview output');
const commandPaneHtml = (ui.match(/<div class="tool-pane active" id="pane-command">[\s\S]*?<!-- ════════════════════════════════════════════════════════════════════\n       PANE: MENU PAGE GENERATOR/) || [''])[0];
assert(commandPaneHtml, 'Command Center pane markup should be extractable');
assert(!commandPaneHtml.includes('id="command-kwcag-krds-audit"'), 'Command Center should not own KWCAG/KRDS audit controls');
assert(!commandPaneHtml.includes('id="command-export-tokens"'), 'Command Center should not own handoff export controls');
assert(ui.includes('value="public-education" selected'), 'public/education preset should be the default project type');
// Command Center Auto-Fix section (Task 7): scan trigger, preview handler, batch + per-item apply
assert(ui.includes('command-collect-fixes'), 'ui.html is missing Fix scan trigger');
assert(ui.includes('command-fixes-preview'), 'ui.html is missing fixes preview handler');
assert(ui.includes('command-apply-fixes'), 'ui.html is missing fixes apply trigger');
assert(ui.includes('id="fix-batch-apply"'), 'ui.html is missing AB batch apply button');
assert(ui.includes('id="fix-scan"'), 'ui.html is missing Fix scan button');
assert(ui.includes('id="fix-c-list"'), 'ui.html is missing per-item C fix list');
assert(ui.includes("'command.fixBatchApply'") || ui.includes('command.fixBatchApply'), 'i18n missing fix batch label');
assert(ui.includes("data-i18n=\"command.pipelineTitle\""), 'Project Pipeline title should be localized');
assert(script.includes("commandApplyProjectPreset('public-education')"), 'public/education preset should be applied during UI initialization');
assert(script.includes('styleFontSearchSeq'), 'Style font search should track request sequence');
assert(script.includes('styleRenderFontResults'), 'Style font search should render results through a helper');
assert(script.includes('requestId: styleFontSearchSeq'), 'Style font search should send requestId');
assert(script.includes('msg.requestId !== styleFontSearchSeq'), 'Style font search should ignore stale results');
assert(script.includes("'style.searchCached'"), 'i18n missing style.searchCached key');
assert(!script.includes("const labels = LANG === 'ko'"), 'diagnostic summary labels should use i18n keys instead of LANG branches');
for (const key of ['menu.diagTotal', 'menu.diagClean', 'table.diagShape', 'table.diagClean']) {
  assert(script.includes(`'${key}'`), `i18n missing diagnostic key: ${key}`);
}

const i18n = createI18nHarness(script);
i18n.applyLang();
assert(i18n.document.documentElement.lang === 'en', 'initial UI language should default to en');
assert(i18n.elements.exportJsonLabel.textContent === 'Export JSON', 'English style.exportJson label did not render');
assert(i18n.elements.importJsonLabel.textContent === 'Import JSON', 'English style.importJson label did not render');
assert(i18n.elements.mdPlaceholder.placeholder.includes('Select an MD file'), 'English style.mdPh placeholder did not render');
assert(i18n.elements.csvHint.innerHTML.includes('CSV UTF-8'), 'English data-i18n-html content did not render');
assert(i18n.elements.reloadTitle.title === 'Reload last selected file', 'English data-i18n-title content did not render');
assert(i18n.elements.sizeGroup.attributes['aria-label'] === 'Panel size', 'English data-i18n-aria content did not render');
assert(i18n.document.getElementById('lang-en').attributes['aria-pressed'] === 'true', 'English language button should expose aria-pressed=true');
assert(i18n.document.getElementById('lang-ko').attributes['aria-pressed'] === 'false', 'Korean language button should expose aria-pressed=false while English is active');
assert(i18n.document.getElementById('size-default').attributes['aria-pressed'] === 'true', 'Default size button should expose aria-pressed=true');
assert(i18n.document.getElementById('size-compact').attributes['aria-pressed'] === 'false', 'Compact size button should expose aria-pressed=false by default');
assert(i18n.t('designqa.removeLabel') === 'Remove label', 'English designqa.removeLabel did not render');
assert(i18n.t('designqa.implLoaded', 320, 200) === 'Implementation screenshot loaded at 320 x 200. Existing labels cleared.', 'English designqa.implLoaded did not render');
assert(i18n.t('designqa.implScaled', 5000, 3000, 1568, 941) === 'Implementation screenshot resized from 5000 x 3000 to 1568 x 941. Existing labels cleared.', 'English designqa.implScaled did not render');

i18n.setLang('ko');
assert(i18n.localStorage.getItem('klic.lang') === 'ko', 'language selection was not persisted');
assert(i18n.document.documentElement.lang === 'ko', 'document lang did not switch to ko');
assert(i18n.elements.exportJsonLabel.textContent === 'JSON 내보내기', 'Korean style.exportJson label did not render');
assert(i18n.elements.importJsonLabel.textContent === 'JSON 가져오기', 'Korean style.importJson label did not render');
assert(i18n.elements.mdPlaceholder.placeholder.includes('MD 파일'), 'Korean style.mdPh placeholder did not render');
assert(i18n.elements.sizeGroup.attributes['aria-label'] === '패널 크기', 'Korean data-i18n-aria content did not render');
assert(i18n.document.getElementById('lang-en').attributes['aria-pressed'] === 'false', 'English language button should expose aria-pressed=false after Korean switch');
assert(i18n.document.getElementById('lang-ko').attributes['aria-pressed'] === 'true', 'Korean language button should expose aria-pressed=true after Korean switch');
assert(i18n.t('designqa.removeLabel') === '라벨 삭제', 'Korean designqa.removeLabel did not render');
assert(i18n.t('designqa.implLoaded', 320, 200) === '구현 스크린샷을 320 x 200 크기로 불러왔습니다. 기존 라벨은 초기화했습니다.', 'Korean designqa.implLoaded did not render');
assert(i18n.t('designqa.implScaled', 5000, 3000, 1568, 941) === '구현 스크린샷을 5000 x 3000에서 1568 x 941로 축소했습니다. 기존 라벨은 초기화했습니다.', 'Korean designqa.implScaled did not render');

const styleDocument = makeDocument();
const styleHarness = createStyleHarness(script, styleDocument, i18n.t, embeddedMd);
styleHarness.styleLoadEmbeddedMd();
const loadedData = styleHarness.getStyleProcessed();
assert(styleDocument.getElementById('style-md').value.trim() === styleGuideMd.trim(), 'embedded MD was not loaded into the Style Guide textarea');
assert(styleDocument.getElementById('style-file-name').textContent === 'style-guide-viewer_ver2.md', 'embedded MD source label was not rendered');
assert(styleDocument.getElementById('style-preview').style.display === 'flex', 'style preview was not shown after embedded MD load');
assert(styleDocument.getElementById('style-gen-section').style.display === 'block', 'style generation controls were not shown after embedded MD load');
assert(styleDocument.getElementById('style-summary').textContent.includes('89'), 'style summary does not include the expected token count');
assert(styleDocument.getElementById('style-summary').textContent.includes('Pretendard'), 'style summary does not include the parsed font');
assert(styleDocument.getElementById('style-result').textContent === 'style-guide-viewer_ver2.md를 불러왔습니다.', 'embedded MD load did not render localized result text');
assert(loadedData && loadedData.total === 89, `embedded MD produced unexpected token total: ${loadedData && loadedData.total}`);
assert(Object.keys(loadedData.brand).join(',') === 'Primary,Secondary,Accent', 'embedded MD did not produce expected brand tokens');
const semanticPreviewHtml = styleDocument.getElementById('style-semantic-prev').innerHTML;
assert((semanticPreviewHtml.match(/class="semantic-row"/g) || []).length === 4, 'semantic preview should render four semantic rows');
assert((semanticPreviewHtml.match(/class="semantic-swatch"/g) || []).length === 16, 'semantic preview should render sixteen semantic swatches');
for (const name of ['Semantic/Danger', 'Semantic/Warning', 'Semantic/Success', 'Semantic/Info']) {
  assert(semanticPreviewHtml.includes(name), `semantic preview should render ${name}`);
}
for (const label of ['Base', 'BG', 'Line', 'Text']) {
  assert(semanticPreviewHtml.includes(`>${label}</span>`), `semantic preview should render ${label} labels`);
}

const commandHarness = createCommandHarness(script, i18n.t);
const smokeHtml = commandHarness.commandRenderSmokeChecks({
  passed: true,
  smokeChecks: [{ name: 'Create local COLOR variable', passed: true, detail: 'OK' }],
  evidence: {
    passed: true,
    passCount: 8,
    failCount: 0,
    nodeId: 'RECTANGLE:4',
    reportNodeId: 'FRAME:5',
    variableId: 'variable:3',
    runtime: {
      kind: 'figma-plugin',
      editorType: 'figma',
      apiVersion: '1.0.0',
      pluginId: 'com.klic.figma-toolkit',
    },
  },
});
assert(smokeHtml.includes('id="command-copy-smoke-evidence"'), 'smoke evidence copy button should render');
assert(smokeHtml.includes('id="command-select-smoke-evidence"'), 'smoke evidence select button should render');
assert(smokeHtml.includes('id="command-download-smoke-evidence"'), 'smoke evidence download button should render');
assert(smokeHtml.includes('id="command-smoke-evidence-status"'), 'smoke evidence status should render outside the JSON textarea');
assert(smokeHtml.includes('id="command-smoke-evidence-json"'), 'smoke evidence JSON pre block should render for safe manual selection');
assert(smokeHtml.includes('class="smoke-evidence-json"'), 'smoke evidence JSON should use the expanded JSON viewer class');
assert(smokeHtml.includes('id="command-smoke-evidence"'), 'smoke evidence textarea should render with a stable id');
assert(smokeHtml.includes('evidence JSON 복사'), 'smoke evidence copy button should render localized text');
assert(smokeHtml.includes('JSON 다운로드'), 'smoke evidence download button should render localized text');
assert(smokeHtml.includes('figma-plugin · figma · API 1.0.0'), 'smoke evidence runtime badge should render');
assert(smokeHtml.includes('&quot;passCount&quot;: 8'), 'smoke evidence textarea should include escaped evidence JSON');
commandHarness.commandRenderSnapshot({
  healthScore: 92,
  rawFills: 1,
  rawStrokes: 2,
  exactMatches: 3,
  oklchSuggestions: 1,
  localColorVariables: 8,
  generatedKlicNodes: 4,
  scope: 'page',
  scanTruncated: false,
  unboundPaints: 2,
  nodeCount: 10,
  provenanceSummary: {
    tools: { 'menu-page': 2, 'table-builder': 1 },
    sources: { '메뉴샘플.csv': 1 },
    diagnosticWarnings: 5,
  },
});
assert(commandHarness.setTextCalls['command-issue-generated'].includes('진단 경고 5개'), 'Command Center snapshot should show diagnostic warning totals');

const pipelineHarness = createProjectPipelineHarness(script);
const defaultPreset = pipelineHarness.commandGetProjectPreset('public-education');
assert(defaultPreset.id === 'public-education', 'public/education should be a first-class project preset');
assert(defaultPreset.tablePreset === 'krds', 'public/education preset should default tables to KRDS density');
assert(defaultPreset.accessibility === 'KWCAG/KRDS', 'public/education preset should enable KWCAG/KRDS policy');
const fallbackPreset = pipelineHarness.commandGetProjectPreset('unknown');
assert(fallbackPreset.id === 'public-education', 'unknown project preset should fall back to public/education');
const pipelineSteps = pipelineHarness.commandBuildPipelineSteps('public-education');
assert(pipelineSteps.length === 4, 'Project Pipeline should expose setup, generation, QA, and handoff steps');
assert(pipelineSteps.map(step => step.id).join(',') === 'setup,generation,qa,handoff', 'Project Pipeline steps should follow the agreed workflow order');
assert(pipelineSteps.every(step => step.items.length >= 3), 'each Project Pipeline step should list concrete work items');

const diagnostics = createDiagnosticsHarness(script);
const menuDiagnostics = diagnostics.menuAnalyzeData([
  { name: '공지사항', path: '알림마당 > 공지사항' },
  { name: '공지사항', path: '고객센터 > 공지사항' },
  { name: 'FAQ', path: '고객센터 > FAQ' },
  { name: '', path: '고객센터 > 빈 메뉴' },
  { name: '매우 긴 메뉴명을 가진 페이지 항목 테스트입니다 추가 설명', path: 'A > B > C > D > E' },
  { name: 'FAQ Copy', path: '고객센터 > FAQ' },
]);
assert(menuDiagnostics.total === 6, 'menu diagnostics should count all rows');
assert(menuDiagnostics.duplicateNames === 1, 'menu diagnostics should count duplicate names by duplicated groups');
assert(menuDiagnostics.duplicatePaths === 1, 'menu diagnostics should count duplicate paths by duplicated groups');
assert(menuDiagnostics.emptyNames === 1, 'menu diagnostics should count empty names');
assert(menuDiagnostics.deepPaths === 1, 'menu diagnostics should count paths deeper than 4 levels');
assert(menuDiagnostics.longNames === 1, 'menu diagnostics should count names longer than 30 chars');

const tableDiagnostics = diagnostics.tableAnalyzeRows({
  headerRows: [['Name', '', 'Status']],
  bodyRows: [['A', '10', 'Ready'], ['B', 'This is a very long cell value that should be flagged', '']],
  footerRows: [['Total', '10']],
});
assert(tableDiagnostics.rows === 4, 'table diagnostics should count header/body/footer rows');
assert(tableDiagnostics.columns === 3, 'table diagnostics should use max column count');
assert(tableDiagnostics.inconsistentRows === 1, 'table diagnostics should count rows with fewer cells than max');
assert(tableDiagnostics.emptyHeaderCells === 1, 'table diagnostics should count empty header cells');
assert(tableDiagnostics.longCells === 1, 'table diagnostics should count long cells');
const compactPreset = diagnostics.tableGetPresetConfig('compact');
assert(compactPreset.paddingV === 8 && compactPreset.fontSize === 14, 'compact preset should reduce density');
const inferredAlignments = diagnostics.tableInferColumnAlignments({
  headerRows: [['Name', 'Amount', 'Status']],
  bodyRows: [['Alpha', '1200', 'Ready'], ['Beta', '3,400', 'Done']],
  footerRows: [],
});
assert(inferredAlignments.join(',') === 'left,right,center', 'table alignment detection should infer text, numeric, and status columns');

const exportedPayload = {
  sourceName: 'style-guide-viewer_ver2.md',
  md: styleDocument.getElementById('style-md').value,
  meta: styleHarness.styleBuildMeta(),
  data: loadedData,
};
assert(exportedPayload.meta.styleMdLength === exportedPayload.md.length, 'style export meta does not preserve textarea MD length');
assert(exportedPayload.meta.fontFamily === 'Pretendard', 'style export meta does not preserve font family');

const importDocument = makeDocument();
const importHarness = createStyleHarness(script, importDocument, i18n.t, embeddedMd);
importHarness.styleRenderImportedData(exportedPayload.data, exportedPayload.sourceName, exportedPayload.md);
assert(importDocument.getElementById('style-md').value.trim() === styleGuideMd.trim(), 'style JSON import did not restore source MD');
assert(importDocument.getElementById('style-file-name').textContent === 'style-guide-viewer_ver2.md', 'style JSON import did not restore source name');
assert(importDocument.getElementById('style-preview').style.display === 'flex', 'style preview was not shown after JSON import');
assert(importDocument.getElementById('style-gen-section').style.display === 'block', 'style generation controls were not shown after JSON import');
assert(importDocument.getElementById('style-summary').textContent.includes('총 89개'), 'style JSON import did not render localized summary');
assert(importDocument.getElementById('style-result').textContent === '스타일 토큰 JSON을 가져왔습니다.', 'style JSON import did not render localized result text');
assert(importHarness.getStyleProcessed().total === 89, 'style JSON import did not restore processed token data');

// ── Design QA Diff panel ──
assert(ui.includes('id="tool-designqa"') && ui.includes('id="pane-designqa"'), 'Design QA should be a top-level tool tab');
assert(ui.includes('id="qa-capture"'), 'Design QA should expose a capture button');
assert(ui.includes('id="qa-impl-file"'), 'Design QA should expose an implementation upload input');
assert(ui.includes('id="qa-commit"'), 'Design QA should expose a commit button');
assert(ui.includes('id="qa-copy-note"'), 'Design QA should expose a copy-agent-note button');
assert(ui.includes('id="qa-agent-note"'), 'Design QA should expose a copyable agent-note textarea');
assert(ui.includes('id="qa-label-overlay"'), 'Design QA should render a label overlay canvas');
assert(script.includes("'designqa.title'"), 'i18n missing designqa.title key');
assert(script.includes("'designqa.cat.color'"), 'i18n missing designqa category key');
assert(script.includes("qaNormalizeRect"), 'Design QA should expose a pure qaNormalizeRect helper');
assert(script.includes("qaEncodeAgentNote"), 'Design QA should expose a pure qaEncodeAgentNote helper');
assert(script.includes("qaPlanImageScale"), 'Design QA should expose a pure qaPlanImageScale helper');
assert(script.includes("qaSanitizeAgentNoteText"), 'Design QA should expose a pure qaSanitizeAgentNoteText helper');
assert(script.includes("qaResetImplLabels"), 'Design QA should reset labels when a new implementation screenshot is loaded');
assert(!script.includes("del.title = 'Remove'"), 'Design QA remove button title should be localized');

const qaMathHarness = (() => {
  const m = script.match(/function qaNormalizeRect\(rect, dispW, dispH\) \{[\s\S]*?\n\}/);
  assert(m, 'qaNormalizeRect is missing or malformed');
  return Function(`${m[0]}\nreturn { qaNormalizeRect };`)();
})();
const qaNorm = qaMathHarness.qaNormalizeRect({ x: 50, y: 100, w: 25, h: 50 }, 200, 400);
assert(qaNorm.x === 0.25 && qaNorm.y === 0.25 && qaNorm.w === 0.125 && qaNorm.h === 0.125, 'qaNormalizeRect should convert px to normalized 0..1');

function extractFunctionBlock(source, name) {
  const start = source.indexOf(`function ${name}`);
  assert(start >= 0, `${name} is missing`);
  const braceStart = source.indexOf('{', start);
  let depth = 0;
  for (let i = braceStart; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`${name} is malformed`);
}

const qaNoteHarness = (() => {
  const edgeMatch = script.match(/const QA_MAX_AGENT_IMAGE_EDGE = \d+;/);
  assert(edgeMatch, 'QA_MAX_AGENT_IMAGE_EDGE constant is missing');
  const names = ['qaSanitizeAgentNoteText', 'qaPlanImageScale', 'qaClamp01', 'qaPixelCoord', 'qaPixelPoint', 'qaPixelRect', 'qaPixelArrow', 'qaEncodeAgentNote'];
  const blocks = names.map((name) => extractFunctionBlock(script, name)).join('\n');
  return Function(`${edgeMatch[0]}\n${blocks}\nreturn { qaSanitizeAgentNoteText, qaPlanImageScale, qaPixelRect, qaEncodeAgentNote };`)();
})();
const qaSmallScale = qaNoteHarness.qaPlanImageScale(640, 400);
assert(qaSmallScale.width === 640 && qaSmallScale.height === 400 && qaSmallScale.factor === 1, 'qaPlanImageScale should keep images within the agent image edge unchanged');
const qaLargeScale = qaNoteHarness.qaPlanImageScale(5000, 3000);
assert(qaLargeScale.width === 1568 && qaLargeScale.height === 941 && qaLargeScale.factor < 1, 'qaPlanImageScale should downscale oversized images to the 1568px long edge');
assert(qaNoteHarness.qaSanitizeAgentNoteText('bad ``` fence') === "bad ''' fence", 'qaSanitizeAgentNoteText should prevent fenced-block injection');
const qaRect = qaNoteHarness.qaPixelRect({ x: 0.25, y: 0.5, w: 0.2, h: 0.1 }, 320, 200);
assert(qaRect.x1 === 80 && qaRect.y1 === 100 && qaRect.x2 === 144 && qaRect.y2 === 120, 'qaPixelRect should map normalized labels to implementation pixels');
const qaNote = qaNoteHarness.qaEncodeAgentNote(
  { nodeId: '42:1', width: 640, height: 400 },
  { width: 320, height: 200 },
  [
    { kind: 'point', x: 0.1, y: 0.2, note: 'small icon', category: 'typography' },
    { kind: 'rect', x: 0.25, y: 0.5, w: 0.2, h: 0.1, note: 'wrong color', category: 'color' },
    { kind: 'arrow', x: 0.7, y: 0.1, x2: 0.8, y2: 0.4, note: 'move ``` down', category: 'spacing' },
  ],
);
assert(qaNote.includes('```klic-qa-note v1'), 'qaEncodeAgentNote should use the KLIC agent-note fence');
assert(qaNote.includes('design-node: 42:1 640x400'), 'qaEncodeAgentNote should include design node context');
assert(qaNote.includes('size: 320x200'), 'qaEncodeAgentNote should include implementation coordinate size');
assert(qaNote.includes('[1] point (32,40) "typography"'), 'qaEncodeAgentNote should emit numbered point coordinates in implementation pixels');
assert(qaNote.includes('[2] rect (80,100)-(144,120) "color"'), 'qaEncodeAgentNote should emit numbered rect coordinates in implementation pixels');
assert(qaNote.includes('[3] arrow (224,20)->(256,80) "spacing"'), 'qaEncodeAgentNote should emit numbered arrow coordinates in implementation pixels');
assert(qaNote.includes('    wrong color'), 'qaEncodeAgentNote should indent label notes');
assert(qaNote.includes("    move ''' down"), 'qaEncodeAgentNote should sanitize and indent arrow notes');
assert((qaNote.match(/```/g) || []).length === 2, 'qaEncodeAgentNote should only contain opening and closing fences');

console.log('KLIC UI i18n and style import/export roundtrip smoke test passed.');
