import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const manifestPath = path.join(root, 'manifest.json');
const codePath = path.join(root, 'code.js');
const runtimeChecklistPath = path.join(root, 'RUNTIME_CHECKLIST.md');
const mockRuntimePath = path.join(root, 'run-smoke-test-mock.mjs');
const sourceSplitCheckPath = path.join(root, 'run-source-split-check.mjs');
const buildToolkitPath = path.join(root, 'build-toolkit.mjs');
const uiRoundtripSmokePath = path.join(root, 'run-ui-roundtrip-smoke.mjs');
const uiVisualSmokePath = path.join(root, 'run-ui-visual-smoke.mjs');
const completionAuditPath = path.join(root, 'run-completion-audit.mjs');
const runtimeEvidenceWatcherPath = path.join(root, 'watch-runtime-evidence.mjs');
const runtimeEvidenceClipboardWatcherPath = path.join(root, 'watch-runtime-clipboard.mjs');
const smokeEvidenceValidatorPath = path.join(root, 'validate-smoke-evidence.mjs');
const styleTokenValidatorPath = path.join(root, 'validate-style-token-json.mjs');
const localVerificationPath = path.join(root, 'run-local-verification.mjs');
const styleGuideViewerPath = path.join(root, '..', 'style-guide-viewer_ver2.md');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const uiPath = path.join(root, manifest.ui);
const mainPath = path.join(root, manifest.main);
const code = fs.readFileSync(codePath, 'utf8');
const sampleCsvPath = path.join(root, '..', '메뉴샘플.csv');
const folderMakerProtocolInstallerPath = path.join(root, '..', 'folder-maker', 'install-protocol.cmd');
const folderMakerProtocolUninstallerPath = path.join(root, '..', 'folder-maker', 'uninstall-protocol.cmd');
const folderMakerBridgePath = path.join(root, '..', 'folder-maker', 'Folder-Maker-Bridge.ps1');
const folderMakerBridgeCmdPath = path.join(root, '..', 'folder-maker', 'folder-maker-bridge.cmd');

assert(manifest.name === 'KLIC Figma Toolkit', `unexpected manifest.name: ${manifest.name}`);
assert(manifest.id === 'com.klic.figma-toolkit', `unexpected manifest.id: ${manifest.id}`);
assert(manifest.api === '1.0.0', `unexpected manifest.api: ${manifest.api}`);
assert(manifest.main === 'code.js', `unexpected manifest.main: ${manifest.main}`);
assert(manifest.ui === 'ui.html', `unexpected manifest.ui: ${manifest.ui}`);
assert(Array.isArray(manifest.editorType) && manifest.editorType.includes('figma'), 'manifest.editorType must include figma');
assert(manifest.documentAccess === 'dynamic-page', 'manifest.documentAccess must be dynamic-page for current Figma plugin loading');
assert(
  manifest.networkAccess
    && Array.isArray(manifest.networkAccess.allowedDomains)
    && manifest.networkAccess.allowedDomains.includes('*')
    && typeof manifest.networkAccess.reasoning === 'string'
    && manifest.networkAccess.reasoning.includes('menu extraction'),
  'manifest.networkAccess.allowedDomains must allow user-entered menu extraction URLs and explain why',
);
assert(fs.existsSync(mainPath), `manifest.main target is missing: ${manifest.main}`);
assert(fs.existsSync(uiPath), `manifest.ui target is missing: ${manifest.ui}`);

const ui = fs.readFileSync(uiPath, 'utf8');
assert(fs.existsSync(runtimeChecklistPath), 'runtime checklist is missing: RUNTIME_CHECKLIST.md');
assert(fs.existsSync(mockRuntimePath), 'mock runtime smoke test is missing: run-smoke-test-mock.mjs');
assert(fs.existsSync(sourceSplitCheckPath), 'source split check is missing: run-source-split-check.mjs');
assert(fs.existsSync(buildToolkitPath), 'toolkit build script is missing: build-toolkit.mjs');
assert(fs.existsSync(uiRoundtripSmokePath), 'UI roundtrip smoke test is missing: run-ui-roundtrip-smoke.mjs');
assert(fs.existsSync(uiVisualSmokePath), 'UI visual smoke test is missing: run-ui-visual-smoke.mjs');
assert(fs.existsSync(completionAuditPath), 'completion audit runner is missing: run-completion-audit.mjs');
assert(fs.existsSync(runtimeEvidenceWatcherPath), 'runtime evidence watcher is missing: watch-runtime-evidence.mjs');
assert(fs.existsSync(runtimeEvidenceClipboardWatcherPath), 'runtime evidence clipboard watcher is missing: watch-runtime-clipboard.mjs');
assert(fs.existsSync(smokeEvidenceValidatorPath), 'smoke evidence validator is missing: validate-smoke-evidence.mjs');
assert(fs.existsSync(styleTokenValidatorPath), 'style token JSON validator is missing: validate-style-token-json.mjs');
assert(fs.existsSync(localVerificationPath), 'local verification runner is missing: run-local-verification.mjs');
assert(fs.existsSync(styleGuideViewerPath), 'style-guide-viewer_ver2.md is missing');
assert(fs.existsSync(folderMakerProtocolInstallerPath), 'Folder Maker protocol installer is missing');
assert(fs.existsSync(folderMakerProtocolUninstallerPath), 'Folder Maker protocol uninstaller is missing');
assert(fs.existsSync(folderMakerBridgePath), 'Folder Maker local bridge script is missing');
assert(fs.existsSync(folderMakerBridgeCmdPath), 'Folder Maker local bridge command wrapper is missing');
const runtimeChecklist = fs.readFileSync(runtimeChecklistPath, 'utf8');
const mockRuntime = fs.readFileSync(mockRuntimePath, 'utf8');
const sourceSplitCheck = fs.readFileSync(sourceSplitCheckPath, 'utf8');
const buildToolkit = fs.readFileSync(buildToolkitPath, 'utf8');
const uiRoundtripSmoke = fs.readFileSync(uiRoundtripSmokePath, 'utf8');
const uiVisualSmoke = fs.readFileSync(uiVisualSmokePath, 'utf8');
const completionAudit = fs.readFileSync(completionAuditPath, 'utf8');
const runtimeEvidenceWatcher = fs.readFileSync(runtimeEvidenceWatcherPath, 'utf8');
const runtimeEvidenceClipboardWatcher = fs.readFileSync(runtimeEvidenceClipboardWatcherPath, 'utf8');
const smokeEvidenceValidator = fs.readFileSync(smokeEvidenceValidatorPath, 'utf8');
const styleTokenValidator = fs.readFileSync(styleTokenValidatorPath, 'utf8');
const localVerification = fs.readFileSync(localVerificationPath, 'utf8');
const styleGuideViewer = fs.readFileSync(styleGuideViewerPath, 'utf8');
const folderMakerProtocolInstaller = fs.readFileSync(folderMakerProtocolInstallerPath, 'utf8');

assert(code.includes("figma.showUI(__html__"), 'code.js does not render the manifest UI with figma.showUI(__html__)');
assert(code.includes('Generated by klic-figma-toolkit/build-toolkit.mjs'), 'code.js should be generated from split source files');
assert(ui.includes('Generated by klic-figma-toolkit/build-toolkit.mjs'), 'ui.html should be generated from split source files');
assert(buildToolkit.includes('src/ui/i18n.js') && buildToolkit.includes('src/code/10-command-center.js'), 'build script should assemble split UI/code sources');
assert(sourceSplitCheck.includes('src/ui/i18n.js') && sourceSplitCheck.includes('const I18N = {'), 'source split check should verify isolated i18n source');
assert(code.includes("title: 'KLIC Figma Toolkit'"), 'figma.showUI title must match the manifest/plugin name');
assert(code.includes('width: 720') && code.includes('height: 820'), 'figma.showUI must use the expected integrated panel size');
assert(code.includes('function resizePluginUi') && code.includes('figma.ui.resize(next.width, next.height)'), 'code.js must support plugin UI resize presets');
assert(ui.includes('<title>KLIC Figma Toolkit</title>'), 'ui.html document title must match the manifest/plugin name');
assert(ui.includes('<span class="brand">KLIC Figma Toolkit</span>'), 'ui.html brand label must match the manifest/plugin name');
assert(ui.includes('function resizeUi') && ui.includes('UI_SIZE_PRESETS') && ui.includes('klic.uiSize'), 'ui.html must expose persisted UI size presets');
assert(ui.includes('id="size-compact"') && ui.includes('id="size-default"') && ui.includes('id="size-wide"'), 'ui.html is missing size preset controls');
assert(!ui.includes('class="command-header"'), 'Command Center should not render a redundant inner product/mode header');
assert(ui.includes('id="tool-qa"') && ui.includes('id="pane-qa"'), 'QA should be a top-level tool tab');
assert(ui.includes('id="tool-handoff"') && ui.includes('id="pane-handoff"'), 'Handoff should be a top-level tool tab');
assert(ui.includes('id="style-binding-list"'), 'Style Guide should own binding result output');
assert(ui.includes('id="qa-result-list"'), 'QA pane should own QA result output');
assert(ui.includes('id="handoff-result-list"'), 'Handoff pane should own handoff result output');
const commandPaneHtml = (ui.match(/<div class="tool-pane active" id="pane-command">[\s\S]*?<!-- ════════════════════════════════════════════════════════════════════\n       PANE: MENU PAGE GENERATOR/) || [''])[0];
assert(commandPaneHtml, 'Command Center pane markup should be extractable');
assert(!commandPaneHtml.includes('id="command-kwcag-krds-audit"'), 'Command Center should not own QA action buttons');
assert(!commandPaneHtml.includes('id="command-export-tokens"'), 'Command Center should not own handoff action buttons');
assert(ui.includes('id="menu-diagnostics"') && ui.includes('function menuAnalyzeData') && ui.includes('function menuRenderDiagnostics'), 'Menu Page diagnostics UI/helpers are missing');
assert(ui.includes('id="table-diagnostics"') && ui.includes('function tableAnalyzeRows') && ui.includes('function tableRenderDiagnostics'), 'Table Builder diagnostics UI/helpers are missing');
assert(ui.includes('id="table-preset"') && ui.includes('function tableGetPresetConfig') && ui.includes('function tableApplyPreset'), 'Table Builder preset UI/helpers are missing');
assert(ui.includes('function tableInferColumnAlignments') && ui.includes('columnAlignments'), 'Table Builder column alignment inference is missing');
assert(ui.includes('diagnostics.warningCount') && ui.includes('meta: { tableConfig, diagnostics }'), 'Menu/Table generation requests should include diagnostic metadata');

function normalizeText(text) {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
}

function extractEmbeddedStyleGuide(uiText) {
  const match = uiText.match(/const STYLE_GUIDE_VIEWER_MD = `([\s\S]*?)`;\n\nfunction hexToHsl/);
  assert(match, 'STYLE_GUIDE_VIEWER_MD literal is missing or malformed');
  return Function(`return \`${match[1]}\`;`)();
}

function extractStyleGuideParser(uiText) {
  const match = uiText.match(/function hexToHsl[\s\S]*?\nfunction renderSwatchRow/);
  assert(match, 'style guide parser block is missing or malformed');
  const parserBlock = match[0].replace(/\nfunction renderSwatchRow$/, '');
  const processMatch = uiText.match(/function styleProcessData\(parsed\) \{[\s\S]*?\n\}/);
  assert(processMatch, 'style guide process function is missing or malformed');
  return Function(`${parserBlock}\n${processMatch[0]}\nreturn { parseMD, styleProcessData };`)();
}

const i18nKeys = Array.from(ui.matchAll(/data-i18n(?:-ph|-html|-title)?="([^"]+)"/g)).map((match) => match[1]);
const enI18n = (ui.match(/en:\s*\{([\s\S]*?)\n\s*\},\n\s*ko:/) || [])[1] || '';
const koI18n = (ui.match(/ko:\s*\{([\s\S]*?)\n\};/) || [])[1] || '';
for (const key of new Set(i18nKeys)) {
  assert(enI18n.includes(`'${key}'`), `en i18n dictionary is missing key: ${key}`);
  assert(koI18n.includes(`'${key}'`), `ko i18n dictionary is missing key: ${key}`);
}
assert(ui.includes('function safeStorageGet') && ui.includes('function safeStorageSet'), 'language persistence should guard blocked localStorage in Figma iframes');
assert(ui.includes('safeStorageGet(\'klic.lang\')') && ui.includes('safeStorageSet(\'klic.lang\', LANG)'), 'language selection is not persisted through the safe storage wrapper');
assert(ui.includes('document.documentElement.lang'), 'language selection does not update the document lang attribute');
assert(ui.includes('commandLastSnapshot') && ui.includes('commandLastPreviewItems'), 'language switching does not retain Command Center dynamic render state');
assert(ui.includes('commandRenderDynamicI18n'), 'language switching does not rerender Command Center dynamic messages');
assert(ui.includes('id="command-project-type"') && ui.includes('id="command-pipeline"'), 'Command Center is missing the Project Pipeline preset/status UI');
assert(ui.includes('function commandGetProjectPreset') && ui.includes('function commandBuildPipelineSteps') && ui.includes('function commandRenderProjectPipeline'), 'Command Center is missing Project Pipeline helpers');
assert(ui.includes('value="public-education" selected') && ui.includes('tablePreset: \'krds\''), 'Project Pipeline should default to public/education with KRDS table preset');
assert(ui.includes("commandApplyProjectPreset('public-education')"), 'Project Pipeline should apply the public/education preset during UI initialization');
assert(ui.includes("'command.pipelineTitle'") && ui.includes("'command.pipelineStepHandoff'"), 'Project Pipeline i18n keys are missing');
for (const checklistText of [
  'Run smoke test',
  'Runtime smoke test passed',
  'RGB exact',
  'OKLCH suggested',
  'Export tokens',
  'audit.provenanceSummary',
  'audit.previewItems',
  'Create report',
]) {
  assert(runtimeChecklist.includes(checklistText), `runtime checklist is missing: ${checklistText}`);
}

for (const label of ['Command Center', 'Menu Page', 'Style Guide', 'Table Builder']) {
  assert(ui.includes(label), `integrated UI is missing section label: ${label}`);
}

const expectedPluginMessages = [
  'ui-resize',
  'command-refresh',
  'command-cancel-scan',
  'command-preview-color-bindings',
  'command-apply-color-bindings',
  'command-kwcag-krds-audit',
  'command-component-qa',
  'command-token-governance',
  'command-run-smoke-test',
  'command-export-tokens',
  'command-create-report-board',
  'command-collect-fixes',
  'command-apply-fixes',
  'menu-generate',
  'menu-register-template',
  'style-create-variables',
  'style-draw',
  'style-create-components',
  'style-search-fonts',
  'table-ready',
  'table-generate',
  'qa-rasterize-request',
  'qa-commit-board',
];

for (const type of expectedPluginMessages) {
  assert(code.includes(`'${type}'`) || code.includes(`"${type}"`), `code.js is missing handler for ${type}`);
  assert(ui.includes(type), `ui.html is missing outgoing mapping for ${type}`);
}

const expectedUiMessages = [
  'ui-resized',
  'command-progress',
  'command-snapshot',
  'command-bindings-preview',
  'command-apply-result',
  'command-kwcag-krds-audit-result',
  'command-component-qa-result',
  'command-token-governance-result',
  'command-smoke-test-result',
  'command-handoff-export',
  'command-report-created',
  'command-error',
  'menu-progress',
  'menu-done',
  'menu-template-registered',
  'menu-error',
  'style-font-result',
  'style-progress',
  'style-done',
  'style-error',
  'style-draw-progress',
  'style-draw-done',
  'style-comp-progress',
  'style-comp-done',
  'table-variables',
  'table-done',
  'table-error',
  'command-fixes-preview',
  'command-fixes-applied',
  'qa-rasterize-result',
  'qa-commit-result',
];

for (const type of expectedUiMessages) {
  assert(code.includes(type), `code.js never posts ${type}`);
  assert(ui.includes(type), `ui.html is missing incoming mapping for ${type}`);
}

for (const fnName of [
  'collectCommandSnapshot',
  'previewColorBindings',
  'applyColorBindings',
  'runKwcagKrdsAudit',
  'runComponentQa',
  'runTokenGovernance',
  'commandContrastRatio',
  'commandFindBackgroundColor',
  'commandShouldAuditNonTextContrast',
  'commandIsLikelyInteractiveNode',
  'tagKlicNode',
  'commandRgbToOklch',
  'commandOklchDistance',
  'commandFindNearestOklchVariable',
  'commandCreateDtcgColorTokens',
  'commandSetDtcgToken',
  'commandGetLocalVariableCollections',
  'commandGetLocalVariables',
  'commandReadKlicMeta',
  'commandCreateProvenanceSummary',
  'commandAddProvenance',
  'commandCollectNodesLimited',
  'commandResolveVariableHex',
  'commandSortVariablesByPriority',
  'exportCommandTokens',
  'createCommandReportBoard',
  'runCommandSmokeTest',
  'commandGetLocalTextStyles',
  'commandGetLocalPages',
  'commandSetCurrentPage',
  'createSelectComponents',
  'createBadgeComponents',
  'createTableComponent',
  'commandRegisterFixProvider',
  'commandCollectFixes',
  'commandApplyFixes',
  'commandGatherFixDescriptors',
  'qaRasterizeSelection',
  'qaCommitBoard',
]) {
  assert(code.includes(`function ${fnName}`), `code.js is missing ${fnName}`);
}

assert(code.includes('matchType') && code.includes('rgb-exact'), 'Command Center does not distinguish RGB exact matches');
assert(code.includes('oklch-suggested'), 'Command Center does not expose OKLCH suggested matches');
assert(code.includes('commandPaintOpacity'), 'Command Center does not account for paint opacity in matching');
assert(code.includes('scanLimit') && code.includes('scanTruncated'), 'Command Center does not expose page scan limit/truncation');
assert(code.includes('includeOklchApply'), 'Command Center does not expose OKLCH apply opt-in');
assert(code.includes('collectionPriority'), 'Command Center does not support collection priority');
assert(code.includes('commandOklchDelta'), 'OKLCH suggestions do not include designer-facing delta calculations');
assert(code.includes('targetOklch') && code.includes('variableOklch') && code.includes('oklchDelta'), 'OKLCH preview items are missing comparison details');
assert(code.includes('provenanceSummary'), 'Command Center snapshots do not expose provenance summaries');
assert(code.includes('selectedCategories') && code.includes('styleMdHashes') && code.includes('tableConfigs'), 'provenance summary does not cover menu/style/table metadata');
assert(code.includes('diagnosticWarnings') && code.includes('normalizeDiagnosticsMeta'), 'provenance summary does not preserve diagnostic warning metadata');
assert(code.includes('tokenCount') && code.includes('previewItems') && code.includes('command-handoff-export'), 'handoff export does not include token and audit payloads');
assert(code.includes('designtokens.org/TR/2025.10/format') && code.includes('dtcgJson'), 'handoff export does not include DTCG design token payloads');
assert((code.match(/figma\.variables\.getLocalVariableCollections\(\)/g) || []).length === 1, 'direct getLocalVariableCollections calls should be isolated to the async wrapper fallback');
assert((code.match(/figma\.variables\.getLocalVariables\(/g) || []).length === 1, 'direct getLocalVariables calls should be isolated to the async wrapper fallback');
assert((code.match(/figma\.variables\.getVariableById\(/g) || []).length === 1, 'direct getVariableById calls should be isolated to the async wrapper fallback');
assert(code.includes('figma.getLocalTextStylesAsync') && code.includes('await commandGetLocalTextStyles()'), 'Style Guide board drawing should use async text style APIs under dynamic-page documentAccess');
assert((code.match(/figma\.getLocalTextStyles\(\)/g) || []).length === 1, 'direct getLocalTextStyles calls should be isolated to the async wrapper fallback');
assert(code.includes('figma.getLocalPagesAsync') && code.includes('await commandGetLocalPages()'), 'Component generation should use async page APIs under dynamic-page documentAccess');
assert(code.includes('figma.setCurrentPageAsync') && code.includes('await commandSetCurrentPage(compPage)'), 'Component generation should switch pages through async page APIs under dynamic-page documentAccess');
assert((code.match(/figma\.root\.children/g) || []).length === 1, 'direct figma.root.children calls should be isolated to the async page wrapper fallback');
assert((code.match(/figma\.currentPage\s*=/g) || []).length === 1, 'direct figma.currentPage assignment should be isolated to the async page wrapper fallback');
assert(mockRuntime.includes('getLocalVariableCollectionsAsync'), 'mock runtime should verify async variable collection APIs');
assert(mockRuntime.includes('getLocalVariablesAsync'), 'mock runtime should verify async local variable APIs');
assert(mockRuntime.includes('getLocalPagesAsync'), 'mock runtime should verify async page APIs');
assert(mockRuntime.includes('setCurrentPageAsync'), 'mock runtime should verify async current-page switching');
assert(mockRuntime.includes('ui-resize wide preset did not resize the plugin UI'), 'mock runtime should verify UI resize handling');
assert(mockRuntime.includes('style-create-components did not finish in mock runtime'), 'mock runtime should cover component generation');
assert(mockRuntime.includes('KWCAG/KRDS audit should report low text contrast'), 'mock runtime should cover KWCAG/KRDS contrast audit');
assert(mockRuntime.includes('KWCAG/KRDS audit should report low non-text contrast'), 'mock runtime should cover KWCAG/KRDS non-text contrast audit');
assert(mockRuntime.includes('KWCAG/KRDS audit should report small interactive target size'), 'mock runtime should cover KRDS target-size audit');
assert(mockRuntime.includes('KWCAG 2.2 텍스트 콘텐츠의 명도 대비'), 'mock runtime should verify Korean KWCAG rule mapping');
assert(code.includes('KRDS 3:1 non-text contrast') && code.includes('터치 타깃 44px 이상'), 'KWCAG/KRDS audit should include non-text contrast and target-size rules');
assert(mockRuntime.includes('component QA should detect naming, coverage, focus-state, and auto-layout issues'), 'mock runtime should cover Component QA regression');
assert(mockRuntime.includes('component QA should report missing KWCAG/KRDS focus state coverage'), 'mock runtime should cover KWCAG/KRDS focus-state component QA');
assert(code.includes('component-set-coverage') && code.includes('component-autolayout') && code.includes('component-naming') && code.includes('component-focus-state'), 'Component QA should cover set coverage, auto-layout, naming, and focus states');
assert(mockRuntime.includes('token governance should detect duplicate and naming issues'), 'mock runtime should cover Token Governance regression');
assert(code.includes('token-duplicate-value') && code.includes('token-naming'), 'Token Governance should cover duplicate values and naming issues');
assert(mockRuntime.includes('smoke-test report board should list detailed runtime checks'), 'mock runtime should cover detailed smoke report board evidence');
assert(mockRuntime.includes('smoke test result should include machine-readable evidence'), 'mock runtime should cover smoke evidence payloads');
assert(mockRuntime.includes('mock smoke evidence should be marked as mock-runtime'), 'mock runtime should verify mock evidence runtime metadata');
assert(code.includes('smokeEvidence') && code.includes('passCount') && code.includes('failCount'), 'smoke test should persist machine-readable evidence');
assert(code.includes('Create component node') && code.includes('Create component instance') && code.includes('Combine component variants'), 'runtime smoke test should cover Figma component APIs');
assert(code.includes('componentSetId') && code.includes('componentInstanceId'), 'runtime smoke evidence should include component artifact ids');
assert(code.includes('figma.editorType') && code.includes('figma.apiVersion') && code.includes('figma-plugin') && code.includes('mock-runtime'), 'smoke test should persist runtime metadata that distinguishes real Figma from mock runtime');
assert(smokeEvidenceValidator.includes('Create local COLOR variable'), 'smoke evidence validator should verify required runtime checks');
assert(smokeEvidenceValidator.includes('Combine component variants') && smokeEvidenceValidator.includes('componentSetId'), 'smoke evidence validator should require component runtime evidence');
assert(smokeEvidenceValidator.includes('passCount') && smokeEvidenceValidator.includes('failCount'), 'smoke evidence validator should verify pass/fail counts');
assert(smokeEvidenceValidator.includes('--require-figma-runtime') && smokeEvidenceValidator.includes('figma-plugin'), 'smoke evidence validator should support requiring real Figma runtime evidence');
assert(smokeEvidenceValidator.includes('fixture artifact ids') && smokeEvidenceValidator.includes('fixture check details'), 'smoke evidence validator should reject forged fixture runtime evidence');
assert(runtimeChecklist.includes('validate-smoke-evidence.mjs'), 'runtime checklist should explain how to validate copied smoke evidence JSON');
assert(styleTokenValidator.includes('Primary') && styleTokenValidator.includes('buttonSizes') && styleTokenValidator.includes('inputSizes'), 'style token validator should verify exported style token structure');
assert(runtimeChecklist.includes('validate-style-token-json.mjs'), 'runtime checklist should explain how to validate exported style token JSON');
for (const localGateText of [
  'verify-integration.mjs',
  'run-ui-roundtrip-smoke.mjs',
  'run-ui-visual-smoke.mjs',
  'run-smoke-test-mock.mjs',
  'run-source-split-check.mjs',
  'run-completion-audit.mjs',
  'watch-runtime-evidence.mjs',
  'watch-runtime-clipboard.mjs',
  'validate-smoke-evidence.mjs',
  'validate-style-token-json.mjs',
  'style-guide-viewer_ver2.md',
  'extractStyleGuideParser',
  'writeStyleTokenPayloadFromMd',
  '--write-evidence',
  'ui roundtrip',
  'ui visual smoke',
  'ui visual smoke syntax',
  'mock evidence rejection for completion',
  'forged runtime evidence rejection',
  'source split',
  '--require-figma-runtime',
  'completion audit syntax',
  'runtime evidence watcher syntax',
  'runtime evidence clipboard watcher syntax',
  'ui.html script syntax check passed',
]) {
  assert(localVerification.includes(localGateText), `local verification runner is missing gate: ${localGateText}`);
}
assert(runtimeEvidenceWatcher.includes('run-completion-audit.mjs') && runtimeEvidenceWatcher.includes('--runtime-evidence'), 'runtime evidence watcher should run completion audit with runtime evidence');
assert(
  runtimeEvidenceClipboardWatcher.includes('validate-smoke-evidence.mjs')
    && runtimeEvidenceClipboardWatcher.includes('--require-figma-runtime')
    && runtimeEvidenceClipboardWatcher.includes('run-completion-audit.mjs'),
  'runtime evidence clipboard watcher should use the shared runtime evidence validator before completion audit',
);
assert(runtimeChecklist.includes('run-local-verification.mjs'), 'runtime checklist should explain the local preflight verification runner');
assert(mockRuntime.includes('table-ready did not expose async local COLOR variables'), 'mock runtime should cover table-ready async variable loading');
assert(mockRuntime.includes('table-generate should right-align numeric columns'), 'mock runtime should cover generated table column alignment');
assert(code.includes('columnAlignments') && code.includes("textAlignHorizontal = colAlign === 'right'"), 'Table Builder should apply per-column text alignment');
assert(mockRuntime.includes('style-create-variables did not finish against async variable APIs'), 'mock runtime should cover style-create-variables async variable loading');
assert(mockRuntime.includes('RGB exact matching should not auto-select semi-transparent paints'), 'mock runtime should cover opacity-safe RGB exact matching');
assert(mockRuntime.includes('OKLCH suggestion is missing designer-facing delta details'), 'mock runtime should cover OKLCH delta details');
assert(mockRuntime.includes('OKLCH apply should be skipped without explicit opt-in'), 'mock runtime should cover OKLCH apply opt-in policy');
assert(mockRuntime.includes('Command Center snapshot is missing provenanceSummary'), 'mock runtime should cover Command Center provenance summaries');
assert(mockRuntime.includes('provenanceSummary does not expose menu CSV sources'), 'mock runtime should cover menu CSV source provenance');
assert(mockRuntime.includes('handoff export JSON should include tokens array'), 'mock runtime should cover professional handoff export payloads');
assert(mockRuntime.includes('handoff export JSON should include audit metrics'), 'mock runtime should cover handoff audit metrics');
assert(mockRuntime.includes('DTCG JSON should include design tokens schema'), 'mock runtime should cover DTCG token export');
assert(uiRoundtripSmoke.includes('style export meta does not preserve textarea MD length'), 'UI roundtrip smoke test should cover style JSON export metadata');
assert(uiRoundtripSmoke.includes('style JSON import did not render localized summary'), 'UI roundtrip smoke test should cover localized style JSON import');
assert(uiRoundtripSmoke.includes('Korean style.exportJson label did not render'), 'UI roundtrip smoke test should cover Korean i18n labels');
assert(uiRoundtripSmoke.includes('semantic preview should render four semantic rows'), 'UI roundtrip smoke test should cover semantic preview row rendering');
assert(uiRoundtripSmoke.includes('semantic preview should render sixteen semantic swatches'), 'UI roundtrip smoke test should cover semantic preview swatch rendering');
assert(uiRoundtripSmoke.includes('smoke evidence copy button should render'), 'UI roundtrip smoke test should cover smoke evidence copy button rendering');
assert(uiRoundtripSmoke.includes('smoke evidence textarea should render with a stable id'), 'UI roundtrip smoke test should cover stable smoke evidence textarea rendering');
assert(uiRoundtripSmoke.includes('smoke evidence runtime badge should render'), 'UI roundtrip smoke test should cover smoke evidence runtime badge rendering');
assert(ui.includes('runtime.kind') && ui.includes('runtime.editorType') && ui.includes('runtime.apiVersion'), 'ui.html should render smoke evidence runtime metadata');
assert(uiVisualSmoke.includes('semantic preview has overlapping layout boxes'), 'UI visual smoke test should detect semantic preview overlap');
assert(uiVisualSmoke.includes('Page.captureScreenshot'), 'UI visual smoke test should support screenshot evidence');
assert(uiVisualSmoke.includes("switchTool('style')"), 'UI visual smoke test should open the Style Guide pane');
assert(uiVisualSmoke.includes("document.getElementById('lang-ko').click()"), 'UI visual smoke test should verify language button clicks');
assert(uiVisualSmoke.includes('language click should localize Style Guide title'), 'UI visual smoke test should cover localized text after language clicks');
assert(/\.semantic-row\s*\{[\s\S]*?display:\s*grid;/.test(ui), 'semantic color rows should use a non-overlapping grid layout');
assert(ui.includes('grid-template-columns: repeat(4, minmax(44px, 1fr))'), 'semantic color chips should use four stable responsive columns');
assert(ui.includes('overflow-wrap: anywhere'), 'semantic color names should wrap instead of overlapping swatches');
assert(completionAudit.includes('Prompt-to-artifact completion audit'), 'completion audit runner should print a prompt-to-artifact checklist');
assert(completionAudit.includes('--runtime-evidence'), 'completion audit runner should require actual Figma runtime evidence');
assert(completionAudit.includes('--require-figma-runtime'), 'completion audit runner should reject mock runtime smoke evidence');
assert(completionAudit.includes('actual-figma-runtime-smoke-evidence'), 'completion audit runner should track actual Figma runtime smoke evidence');
assert(completionAudit.includes('style-semantic-visual-layout'), 'completion audit runner should track semantic visual layout verification');
assert(completionAudit.includes('process.exit(2)'), 'completion audit runner should fail when requirements are missing or unverified');
assert(ui.includes("'command.oklchDelta'") && ui.includes("t('command.oklchDelta'"), 'ui.html does not render OKLCH delta details through i18n');
assert(ui.includes("'command.snapshotGenerated'") && ui.includes("t('command.snapshotGenerated'"), 'ui.html does not render provenance source summaries through i18n');
assert(ui.includes("'command.exportSummary'") && ui.includes("t('command.exportSummary'"), 'ui.html does not render handoff export summary metrics through i18n');
assert(ui.includes("'command.snapshotRaw'") && ui.includes("'command.snapshotMatch'"), 'ui.html does not define localized Command Center snapshot messages');
assert(ui.includes('JSON.stringify(msg.evidence'), 'ui.html does not render copyable smoke evidence JSON');
assert(ui.includes('commandCopySmokeEvidence'), 'ui.html is missing smoke evidence copy action');
assert(ui.includes('navigator.clipboard.writeText'), 'ui.html should copy smoke evidence JSON with the Clipboard API');
assert(ui.includes('commandCopySmokeEvidenceWithExecCommand') && ui.includes("document.execCommand('copy')"), 'ui.html is missing execCommand fallback for blocked clipboard access');
assert(ui.includes('command-smoke-evidence-json') && ui.includes('range.selectNodeContents(jsonNode)'), 'ui.html must select only the JSON node for manual smoke evidence copy');
assert(ui.includes('commandDownloadSmokeEvidence') && ui.includes('figma-smoke-evidence.json'), 'ui.html is missing smoke evidence download action');
assert(ui.includes('binding-list.evidence-mode') && ui.includes("commandGetBindingList('evidence')"), 'ui.html should expand the output area for smoke evidence JSON');
assert(ui.includes('command-smoke-evidence'), 'ui.html should give smoke evidence textarea a stable id');
assert(
  ui.includes("'command.copyEvidence'")
    && ui.includes("'command.selectEvidence'")
    && ui.includes("'command.downloadEvidence'")
    && ui.includes("'command.copyFallback'")
    && ui.includes("'command.downloadFallback'"),
  'smoke evidence copy/download controls are not covered by i18n keys',
);
assert(ui.includes('STYLE_GUIDE_VIEWER_MD'), 'ui.html does not embed style-guide-viewer_ver2.md for automatic import');
assert(
  normalizeText(extractEmbeddedStyleGuide(ui)) === normalizeText(styleGuideViewer),
  'embedded STYLE_GUIDE_VIEWER_MD does not match style-guide-viewer_ver2.md',
);
const { parseMD: parseStyleGuideMd, styleProcessData: processStyleGuideData } = extractStyleGuideParser(ui);
const parsedStyleGuide = parseStyleGuideMd(styleGuideViewer);
const processedStyleGuide = processStyleGuideData(parsedStyleGuide);
assert(parsedStyleGuide.fontFamily === 'Pretendard', 'style-guide-viewer_ver2.md font family was not parsed');
assert(Object.keys(parsedStyleGuide.brandColors).join(',') === 'Primary,Secondary,Accent', 'style-guide-viewer_ver2.md brand colors were not parsed');
assert(Object.keys(parsedStyleGuide.semanticColors).length === 4, 'style-guide-viewer_ver2.md semantic colors were not parsed');
assert(Object.values(parsedStyleGuide.semanticColors).every((value) => ['base', 'background', 'line', 'text'].every((key) => value[key])), 'semantic color variants are incomplete');
assert(parsedStyleGuide.typeSizes.length === 6, 'style-guide-viewer_ver2.md typography sizes were not parsed');
assert(parsedStyleGuide.spacing.length === 17 && parsedStyleGuide.spacing.includes(120), 'style-guide-viewer_ver2.md spacing scale was not parsed');
assert(parsedStyleGuide.radius.length === 8 && parsedStyleGuide.radius.includes(99999), 'style-guide-viewer_ver2.md radius scale was not parsed');
assert(parsedStyleGuide.buttonSizes.length === 3 && parsedStyleGuide.buttonRadius === 6, 'style-guide-viewer_ver2.md button specs were not parsed');
assert(parsedStyleGuide.inputSizes.length === 2 && parsedStyleGuide.inputWidth === 280 && parsedStyleGuide.inputRadius === 6, 'style-guide-viewer_ver2.md input specs were not parsed');
assert(processedStyleGuide.total === 89, `style-guide-viewer_ver2.md processed token total changed unexpectedly: ${processedStyleGuide.total}`);
assert(ui.includes('styleLoadEmbeddedMd();'), 'ui.html does not automatically import the embedded style guide on load');
assert(ui.includes('style-load-sample'), 'ui.html is missing style guide sample import control');
assert(ui.includes('style-export-md'), 'ui.html is missing style guide MD export control');
assert(ui.includes('style-export-json'), 'ui.html is missing style guide JSON export control');
assert(ui.includes('style-json-input') && ui.includes('styleImportJsonFile') && ui.includes('styleRenderImportedData'), 'ui.html is missing style guide JSON import flow');
assert(ui.includes("'style.loadSample'") && ui.includes("'style.exportMd'") && ui.includes("'style.exportJson'") && ui.includes("'style.importJson'"), 'style import/export controls are not covered by i18n keys');
assert(ui.includes("md: document.getElementById('style-md').value"), 'style JSON export does not include source MD for round-trip import');
assert(code.includes('styleMdHash'), 'Style guide provenance does not include MD hash');
assert(code.includes('selectedCategories'), 'Menu provenance does not include selected categories');
assert(code.includes('tableConfig'), 'Table provenance does not include table config');
assert(ui.includes('RGB exact') || ui.includes('RGB 정확'), 'ui.html does not label RGB exact matches');
assert(ui.includes('OKLCH') || code.includes('OKLCH'), 'OKLCH matching is not surfaced in UI/code');
assert(ui.includes('command-scan-limit'), 'ui.html is missing scan limit control');
assert(ui.includes('command-cancel-scan'), 'ui.html is missing cancel scan control');
assert(ui.includes('command-oklch-threshold'), 'ui.html is missing OKLCH threshold control');
assert(ui.includes('command-collection-priority'), 'ui.html is missing collection priority control');
assert(ui.includes('command-include-oklch-apply'), 'ui.html is missing OKLCH apply opt-in');
assert(ui.includes('command-kwcag-krds-audit') && ui.includes('commandRenderKwcagKrdsAudit'), 'ui.html is missing KWCAG/KRDS audit controls');
assert(ui.includes("'command.kwcagKrdsAudit'") && ui.includes("'command.kwcagKrdsIssues'"), 'KWCAG/KRDS audit controls are not covered by i18n keys');
assert(ui.includes('command-component-qa') && ui.includes('commandRenderComponentQa'), 'ui.html is missing Component QA controls');
assert(ui.includes("'command.componentQa'") && ui.includes("'command.componentQaIssues'"), 'Component QA controls are not covered by i18n keys');
assert(ui.includes('command-token-governance') && ui.includes('commandRenderTokenGovernance'), 'ui.html is missing Token Governance controls');
assert(ui.includes("'command.tokenGovernance'") && ui.includes("'command.tokenGovernanceIssues'"), 'Token Governance controls are not covered by i18n keys');
assert(ui.includes('command-export-tokens'), 'ui.html is missing token export control');
assert(ui.includes('command-create-report-board'), 'ui.html is missing report board control');
assert(ui.includes('command-run-smoke-test'), 'ui.html is missing runtime smoke test control');
assert(ui.includes('command-open-folder-maker'), 'ui.html is missing the Folder Maker launcher control');
assert(
  ui.includes("'command.openFolderMaker'")
    && ui.includes("'command.folderMakerGuide'")
    && ui.includes("'command.copyFolderMakerCommand'")
    && ui.includes("'command.folderMakerFallbackTitle'"),
  'Folder Maker launcher is not covered by i18n keys',
);
assert(code.includes("case 'command-open-folder-maker'") && code.includes('function openFolderMaker'), 'code.js is missing the Folder Maker launcher message handler');
assert(!code.includes('figma.openExternal'), 'code.js must not use figma.openExternal for Folder Maker because Figma blocks the custom protocol');
assert(ui.includes('FOLDER_MAKER_BRIDGE_URL') && ui.includes('http://localhost:39573/open-folder-maker'), 'ui.html is missing the local Folder Maker bridge URL');
assert(ui.includes('fetch(FOLDER_MAKER_BRIDGE_URL') && ui.includes('commandRenderFolderMakerFallback'), 'ui.html is missing the Folder Maker bridge launcher and fallback');
assert(ui.includes('FOLDER_MAKER_BRIDGE_COMMAND') && ui.includes('folder-maker-bridge.cmd'), 'ui.html is missing Folder Maker bridge command fallback');
assert(ui.includes('FOLDER_MAKER_GUI_COMMAND') && ui.includes('commandCopyFolderMakerCommand'), 'ui.html is missing Folder Maker GUI command copy fallback');
assert(
  folderMakerProtocolInstaller.includes('PROTOCOL=klic-folder-maker')
    && folderMakerProtocolInstaller.includes('HKCU\\Software\\Classes\\%PROTOCOL%'),
  'Folder Maker protocol installer does not register the expected HKCU protocol',
);
assert(folderMakerProtocolInstaller.includes('folder-maker-gui.cmd'), 'Folder Maker protocol installer does not point to the GUI wrapper');
for (const smokeText of [
  'KLIC Smoke Test',
  'Runtime smoke test: ',
  'smokeTestPassed',
  'smokeExportPassed',
  'smokeReportPassed',
  'smokePluginDataPassed',
  'smokeChecks',
  'componentSetId',
  'Combine component variants',
]) {
  assert(code.includes(smokeText), `code.js is missing runtime smoke test artifact: ${smokeText}`);
}
assert(ui.includes('commandRenderSmokeChecks'), 'ui.html does not render detailed smoke-test checks');

for (const text of [
  'command-refresh-selection',
  'command-refresh-page',
  'command-preview-bindings',
  'command-apply-bindings',
]) {
  assert(ui.includes(text), `ui.html is missing Command Center control: ${text}`);
}

assert(code.includes("setPluginData('klic.meta'"), 'generated KLIC root nodes are not tagged with pluginData');

assert(fs.existsSync(sampleCsvPath), 'menu sample CSV is missing: ../메뉴샘플.csv');
assert(ui.includes('menu-sample-csv'), 'ui.html is missing a sample CSV load action');
assert(ui.includes('MENU_SAMPLE_CSV'), 'ui.html does not embed the menu sample CSV for demo/testing');

function parseCsvRow(line) {
  const result = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQ = !inQ;
      }
    } else if (c === ',' && !inQ) {
      result.push(cur.trim());
      cur = '';
    } else {
      cur += c;
    }
  }
  result.push(cur.trim());
  return result;
}

function parseCsv(text) {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter((line) => line.trim());
  const headers = parseCsvRow(lines[0]);
  const rows = lines.slice(1).map((line) => {
    const vals = parseCsvRow(line);
    const obj = {};
    headers.forEach((header, i) => {
      obj[header] = (vals[i] || '').trim();
    });
    return obj;
  });
  return { headers, rows };
}

function detectLevelCols(headers) {
  const cols = [];
  for (let n = 1; n <= 5; n++) {
    const col = headers.find((header) => header.includes(`${n}차`) || header.toLowerCase() === `level${n}` || header === `${n}단계`);
    if (col) cols.push(col);
  }
  return cols;
}

function fillDownLevelCols(rows, cols) {
  const lastVals = {};
  cols.forEach((col) => { lastVals[col] = ''; });
  return rows.map((row) => {
    const newRow = { ...row };
    let lowestIdx = cols.length;
    cols.forEach((col, i) => {
      if (row[col] && row[col].trim() && i < lowestIdx) lowestIdx = i;
    });
    if (lowestIdx < cols.length) {
      for (let i = lowestIdx + 1; i < cols.length; i++) {
        if (!row[cols[i]] || !row[cols[i]].trim()) lastVals[cols[i]] = '';
      }
    }
    cols.forEach((col) => {
      if (row[col] && row[col].trim()) {
        lastVals[col] = row[col];
        newRow[col] = row[col];
      } else {
        newRow[col] = lastVals[col];
      }
    });
    return newRow;
  });
}

const sampleCsv = fs.readFileSync(sampleCsvPath, 'utf8');
const parsedSample = parseCsv(sampleCsv);
assert(parsedSample.headers.join(',') === '1차,2차,3차,4차,url,분류', `unexpected sample CSV headers: ${parsedSample.headers.join(',')}`);
const sampleLevelCols = detectLevelCols(parsedSample.headers);
assert(sampleLevelCols.join(',') === '1차,2차,3차,4차', `sample CSV level columns were not detected correctly: ${sampleLevelCols.join(',')}`);
const contentRows = fillDownLevelCols(parsedSample.rows, sampleLevelCols)
  .filter((row) => row['분류'] === '콘텐츠')
  .map((row) => {
    const filled = sampleLevelCols.map((col) => row[col]).filter((value) => value && value.trim());
    return { name: filled[filled.length - 1], path: filled.join(' > ') };
  })
  .filter((row) => row.name);
assert(contentRows.length === 14, `sample CSV should produce 14 default content menu pages, got ${contentRows.length}`);
assert(
  contentRows.some((row) => row.name === '시행령' && row.path === '직무발명제도란? > 관련 발명진흥법 및 시행령 > 시행령'),
  'sample CSV fill-down path for 시행령 is incorrect',
);

assert(code.includes("commandRegisterFixProvider('bindRawColor'"), 'bindRawColor provider not registered');
assert(code.includes("commandRegisterFixProvider('renameDefaultName'"), 'renameDefaultName provider not registered');
assert(code.includes("commandRegisterFixProvider('consolidateDuplicateToken'"), 'consolidateDuplicateToken provider not registered');
assert(code.includes("commandRegisterFixProvider('suggestKrdsName'"), 'suggestKrdsName provider not registered');
assert(code.includes('figma.commitUndo'), 'fix apply path must call figma.commitUndo');
assert(ui.includes('command-collect-fixes') && ui.includes('fix-batch-apply'), 'ui missing fix controls');
for (const key of ['command.fixTitle', 'command.fixScan', 'command.fixBatchApply', 'command.fixApplyItem', 'command.fixApplied']) {
  assert(enI18n.includes(`'${key}'`), `en i18n missing ${key}`);
  assert(koI18n.includes(`'${key}'`), `ko i18n missing ${key}`);
}

console.log('KLIC Figma Toolkit integration check passed.');
