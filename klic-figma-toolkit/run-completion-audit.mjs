import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(root, '..');

function parseArgs(argv) {
  const args = { runtimeEvidence: '', skipLocal: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--runtime-evidence') {
      args.runtimeEvidence = argv[++i] || '';
    } else if (arg === '--skip-local') {
      args.skipLocal = true;
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function run(label, command, args) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  return {
    label,
    command: `${command} ${args.join(' ')}`,
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

function read(relPath) {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
}

function hasAll(text, needles) {
  return needles.every((needle) => text.includes(needle));
}

function add(checks, id, requirement, evidence, passed, missing = '') {
  checks.push({ id, requirement, evidence, status: passed ? 'PASS' : 'MISSING', missing });
}

function printChecklist(checks) {
  console.log('\nPrompt-to-artifact completion audit');
  for (const check of checks) {
    console.log(`- [${check.status}] ${check.id}: ${check.requirement}`);
    console.log(`  Evidence: ${check.evidence}`);
    if (check.status !== 'PASS' && check.missing) console.log(`  Missing: ${check.missing}`);
  }
}

function printHelp() {
  console.log(`Usage:
  node klic-figma-toolkit/run-completion-audit.mjs --runtime-evidence path/to/smoke-evidence.json

This is stricter than local preflight. It runs local verification and then validates
the smoke evidence copied from the real Figma desktop runtime.

Options:
  --runtime-evidence <path>  JSON copied from the Command Center runtime smoke test
  --skip-local              Skip local preflight rerun, for debugging only
`);
}

let args;
try {
  args = parseArgs(process.argv.slice(2));
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

if (args.help) {
  printHelp();
  process.exit(0);
}

const manifest = JSON.parse(read('klic-figma-toolkit/manifest.json'));
const code = read('klic-figma-toolkit/code.js');
const ui = read('klic-figma-toolkit/ui.html');
const verifier = read('klic-figma-toolkit/verify-integration.mjs');
const localRunner = read('klic-figma-toolkit/run-local-verification.mjs');
const mockRuntime = read('klic-figma-toolkit/run-smoke-test-mock.mjs');
const sourceSplitCheck = read('klic-figma-toolkit/run-source-split-check.mjs');
const buildToolkit = read('klic-figma-toolkit/build-toolkit.mjs');
const uiI18nSource = read('klic-figma-toolkit/src/ui/i18n.js');
const uiAppSource = read('klic-figma-toolkit/src/ui/app.js');
const codeCommandSource = read('klic-figma-toolkit/src/code/10-command-center.js');
const codeMenuSource = read('klic-figma-toolkit/src/code/20-menu-generator.js');
const codeStyleSource = read('klic-figma-toolkit/src/code/30-style-guide.js');
const codeTableSource = read('klic-figma-toolkit/src/code/40-table-builder.js');
const uiRoundtrip = read('klic-figma-toolkit/run-ui-roundtrip-smoke.mjs');
const uiVisualSmoke = read('klic-figma-toolkit/run-ui-visual-smoke.mjs');
const styleValidator = read('klic-figma-toolkit/validate-style-token-json.mjs');
const runtimeEvidenceCapture = read('klic-figma-toolkit/capture-runtime-evidence.mjs');
const localVerificationCmd = read('klic-figma-toolkit/run-local-verification.cmd');
const completionAuditCmd = read('klic-figma-toolkit/run-completion-audit.cmd');
const runtimeEvidenceCmd = read('klic-figma-toolkit/capture-runtime-evidence.cmd');
const smokeEvidenceValidatorCmd = read('klic-figma-toolkit/validate-smoke-evidence.cmd');
const styleTokenValidatorCmd = read('klic-figma-toolkit/validate-style-token-json.cmd');
const runtimeEvidenceWatcherCmd = read('klic-figma-toolkit/watch-runtime-evidence.cmd');
const runtimeEvidenceClipboardWatcherCmd = read('klic-figma-toolkit/watch-runtime-clipboard.cmd');
const rootLauncherCmd = read('KLIC-START.cmd');
const runtimeChecklist = read('klic-figma-toolkit/RUNTIME_CHECKLIST.md');
const folderMakerScript = read('folder-maker/Create-Folders.ps1');
const folderMakerGui = read('folder-maker/Folder-Maker-GUI.ps1');
const folderMakerReadme = read('folder-maker/README.md');
const folderMakerTest = read('folder-maker/Test-FolderMaker.ps1');
const folderMakerCmd = read('folder-maker/폴더생성.cmd');
const folderMakerGuiCmd = read('folder-maker/폴더생성-GUI.cmd');
const folderMakerAsciiCmd = read('folder-maker/folder-create.cmd');
const folderMakerAsciiGuiCmd = read('folder-maker/folder-maker-gui.cmd');
const folderMakerBridge = read('folder-maker/Folder-Maker-Bridge.ps1');
const folderMakerBridgeCmd = read('folder-maker/folder-maker-bridge.cmd');
const folderMakerProtocolInstaller = read('folder-maker/install-protocol.cmd');
const folderMakerProtocolUninstaller = read('folder-maker/uninstall-protocol.cmd');
const sampleCsvExists = fs.existsSync(path.join(repoRoot, '메뉴샘플.csv'));
const styleGuideExists = fs.existsSync(path.join(repoRoot, 'style-guide-viewer_ver2.md'));

const checks = [];

add(
  checks,
  'integrated-toolkit',
  'Command Center, Menu Page, Style Guide, Table Builder, QA, and Handoff are integrated in one KLIC Figma Toolkit plugin with Command Center acting as an overview hub.',
  'manifest.json, ui.html tab labels, code.js message handlers, verify-integration.mjs expectedPluginMessages',
  manifest.name === 'KLIC Figma Toolkit'
    && manifest.main === 'code.js'
    && manifest.ui === 'ui.html'
    && hasAll(ui, ['Command Center', 'Menu Page', 'Style Guide', 'Table Builder', 'id="tool-qa"', 'id="tool-handoff"', 'id="pane-qa"', 'id="pane-handoff"', 'id="style-binding-list"', 'id="qa-result-list"', 'id="handoff-result-list"'])
    && hasAll(verifier, ['QA should be a top-level tool tab', 'Handoff should be a top-level tool tab'])
    && hasAll(verifier, ['expectedPluginMessages', 'expectedUiMessages']),
  'Integrated UI or message contract is incomplete.',
);

add(
  checks,
  'figma-manifest-runtime-contract',
  'Manifest targets the Figma editor, uses dynamic-page document loading, allows user-entered menu extraction URLs, and showUI opens the integrated panel.',
  'manifest.json documentAccess/networkAccess/editorType and code.js figma.showUI contract',
  Array.isArray(manifest.editorType)
    && manifest.editorType.includes('figma')
    && manifest.documentAccess === 'dynamic-page'
    && manifest.networkAccess?.allowedDomains?.includes('*')
    && manifest.networkAccess?.reasoning?.includes('menu extraction')
    && code.includes('figma.showUI(__html__')
    && code.includes("title: 'KLIC Figma Toolkit'"),
  'Manifest or showUI contract does not match the runtime checklist.',
);

add(
  checks,
  'source-split-i18n-build',
  'Large Figma plugin files are split into maintainable source modules, with i18n isolated and generated code.js/ui.html kept in sync by a build check.',
  'build-toolkit.mjs, run-source-split-check.mjs, src/ui/i18n.js, src/ui/app.js, src/code module files, run-local-verification.mjs source split gate',
  hasAll(buildToolkit, [
    'src/ui/i18n.js',
    'src/ui/app.js',
    'src/code/10-command-center.js',
    '--check',
  ])
    && hasAll(sourceSplitCheck, [
      'source split file is missing',
      'i18n source must include English and Korean dictionaries',
      'KLIC source split check passed',
    ])
    && hasAll(uiI18nSource, ['const I18N = {', 'en:', 'ko:', "'command.title'", "'table.preset'"])
    && hasAll(uiAppSource, ['function safeStorageGet', 'function switchTool', 'window.onmessage'])
    && hasAll(codeCommandSource, ['MODULE: COMMAND CENTER', 'function collectCommandSnapshot'])
    && hasAll(codeMenuSource, ['MODULE: MENU PAGE GENERATOR', 'function registerSelectedMenuTemplate'])
    && hasAll(codeStyleSource, ['MODULE: STYLE GUIDE VARIABLE GENERATOR', 'function createVariables'])
    && hasAll(codeTableSource, ['MODULE: TABLE GENERATOR', 'async function generateTable'])
    && hasAll(code, ['Generated by klic-figma-toolkit/build-toolkit.mjs'])
    && hasAll(ui, ['Generated by klic-figma-toolkit/build-toolkit.mjs'])
    && hasAll(localRunner, ['source split', 'run-source-split-check.mjs', 'toolkit build syntax']),
  'Source split, i18n isolation, generated-file markers, or preflight gates are incomplete.',
);

add(
  checks,
  'project-pipeline-command-center',
  'Command Center exposes a workflow-first Project Pipeline with public/education as the default preset, KRDS table defaults, four production stages, and localized EN/KO labels.',
  'src/ui/index.html Project Pipeline DOM, src/ui/app.js commandGetProjectPreset/commandBuildPipelineSteps/commandRenderProjectPipeline, src/ui/i18n.js command.pipeline keys, run-ui-roundtrip-smoke.mjs pipeline assertions',
  hasAll(ui, [
    'id="command-project-type"',
    'id="command-pipeline"',
    'value="public-education" selected',
    'data-i18n="command.pipelineTitle"',
  ])
    && hasAll(uiAppSource, [
      'function commandGetProjectPreset',
      'function commandBuildPipelineSteps',
      'function commandRenderProjectPipeline',
      "commandApplyProjectPreset('public-education')",
      "tablePreset: 'krds'",
      "id: 'setup'",
      "id: 'generation'",
      "id: 'qa'",
      "id: 'handoff'",
    ])
    && hasAll(uiI18nSource, [
      "'command.pipelineTitle'",
      "'command.projectPublicEducation'",
      "'command.pipelineStepSetup'",
      "'command.pipelineStepHandoff'",
      "'command.pipelineItemAccessibility'",
      "'command.pipelineItemPackage'",
      '공공기관/교육청',
    ])
    && hasAll(uiRoundtrip, [
      'Command Center should render the Project Pipeline status board',
      'public/education preset should be applied during UI initialization',
      'public/education preset should default tables to KRDS density',
      'Project Pipeline should expose setup, generation, QA, and handoff steps',
    ]),
  'Project Pipeline preset UI, workflow logic, localization, or regression coverage is incomplete.',
);

add(
  checks,
  'menu-sample-csv',
  '메뉴샘플.csv is embedded and parsed with fill-down level columns for default menu generation.',
  '메뉴샘플.csv, MENU_SAMPLE_CSV, verify-integration.mjs contentRows length/path assertions',
  sampleCsvExists
    && ui.includes('MENU_SAMPLE_CSV')
    && hasAll(verifier, ['sample CSV should produce 14 default content menu pages', 'sample CSV fill-down path for 시행령 is incorrect']),
  'Menu sample CSV is missing or not covered by parser verification.',
);

add(
  checks,
  'menu-page-generator-diagnostics-template',
  'Menu Page Generator provides diagnostics, cross-page or fallback [sub_page] template handling, and selected-frame template registration.',
  'ui.html menuAnalyzeData/menu-diagnostics/register button, code.js template discovery/registerSelectedMenuTemplate, run-ui-roundtrip-smoke.mjs diagnostics, run-smoke-test-mock.mjs cross-page/fallback/register regressions',
  hasAll(ui, [
    'id="menu-diagnostics"',
    'function menuAnalyzeData',
    'function menuRenderDiagnostics',
    'menu-register-template',
    'menu-template-registered',
  ])
    && hasAll(code, [
      'function findMenuTemplate',
      'function createDefaultMenuTemplate',
      'function registerSelectedMenuTemplate',
      "case 'menu-register-template'",
      "type: 'menu-template-registered'",
    ])
    && hasAll(uiRoundtrip, [
      'menu diagnostics should count duplicate names by duplicated groups',
      'menu diagnostics should count paths deeper than 4 levels',
    ])
    && hasAll(mockRuntime, [
      'menu-generate should find [sub_page] on another local page',
      'menu-register-template should register the selected frame',
      'menu-generate should create a fallback [sub_page] template when missing',
    ]),
  'Menu diagnostics or template registration/fallback coverage is incomplete.',
);

add(
  checks,
  'table-builder-diagnostics-presets-alignment',
  'Table Builder provides diagnostics, professional density presets, inferred column alignment, and generated Figma TextNode alignment metadata.',
  'ui.html tableAnalyzeRows/tableGetPresetConfig/tableInferColumnAlignments, code.js columnAlignments textAlignHorizontal, run-ui-roundtrip-smoke.mjs helper tests, run-smoke-test-mock.mjs generated table alignment regression',
  hasAll(ui, [
    'id="table-diagnostics"',
    'id="table-preset"',
    'function tableAnalyzeRows',
    'function tableGetPresetConfig',
    'function tableApplyPreset',
    'function tableInferColumnAlignments',
    'columnAlignments',
  ])
    && hasAll(code, [
      'var columnAlignments',
      "textAlignHorizontal = colAlign === 'right'",
      "'LEFT'",
      "'RIGHT'",
      "'CENTER'",
    ])
    && hasAll(uiRoundtrip, [
      'compact preset should reduce density',
      'table alignment detection should infer text, numeric, and status columns',
      'table diagnostics should count rows with fewer cells than max',
    ])
    && hasAll(mockRuntime, [
      'table-generate should left-align text columns',
      'table-generate should right-align numeric columns',
      'table-generate should center-align status columns',
      'table-generate should preserve preset metadata in pluginData',
    ]),
  'Table diagnostics, presets, alignment, or generated-node coverage is incomplete.',
);

add(
  checks,
  'command-center-data-connection',
  'Command Center connects to Figma selection/page data, async variables, provenance, token export, and report board creation.',
  'code.js collect/preview/apply/export/report handlers, run-smoke-test-mock.mjs async variable/provenance/handoff assertions',
  hasAll(code, [
    'collectCommandSnapshot',
    'previewColorBindings',
    'applyColorBindings',
    'exportCommandTokens',
    'createCommandReportBoard',
    'commandGetLocalVariableCollections',
  ])
    && hasAll(mockRuntime, [
      'getLocalVariableCollectionsAsync',
      'Command Center snapshot is missing provenanceSummary',
      'handoff export JSON should include tokens array',
      'handoff export JSON should include audit metrics',
    ]),
  'Command Center data flow or mock runtime coverage is incomplete.',
);

add(
  checks,
  'dtcg-token-export',
  'Command Center exports color tokens in DTCG/W3C Design Tokens JSON alongside CSS and handoff JSON.',
  'code.js commandCreateDtcgColorTokens/dtcgJson, ui.html export textarea, run-smoke-test-mock.mjs DTCG assertions',
  hasAll(code, [
    'function commandCreateDtcgColorTokens',
    'https://www.designtokens.org/TR/2025.10/format/',
    '$type',
    '$value',
    'dtcgJson',
  ])
    && hasAll(ui, ['dtcg.tokens.json', 'msg.dtcgJson'])
    && hasAll(mockRuntime, [
      'DTCG JSON should include design tokens schema',
      'DTCG JSON should group color tokens by collection/path',
      'DTCG JSON should preserve token hex value',
    ]),
  'DTCG token export or regression coverage is incomplete.',
);

add(
  checks,
  'rgb-oklch-policy',
  'RGB exact matching is apply-safe, semi-transparent paints are not auto-bound, and OKLCH suggestions expose deltas with explicit opt-in for apply.',
  'code.js matchType/oklchDelta/includeOklchApply and run-smoke-test-mock.mjs RGB/OKLCH regression assertions',
  hasAll(code, ['rgb-exact', 'oklch-suggested', 'commandPaintOpacity', 'oklchDelta', 'includeOklchApply'])
    && hasAll(mockRuntime, [
      'RGB exact matching should not auto-select semi-transparent paints',
      'OKLCH suggestion is missing designer-facing delta details',
      'OKLCH apply should be skipped without explicit opt-in',
      'OKLCH apply should work with explicit opt-in',
    ]),
  'RGB/OKLCH matching policy is not fully covered.',
);

add(
  checks,
  'kwcag-krds-audit',
  'Command Center can run a Korean accessibility audit aligned to KWCAG 2.2 and KRDS text contrast, non-text contrast, and target-size guidance.',
  'code.js runKwcagKrdsAudit/contrast helpers, ui.html KWCAG/KRDS audit control, run-smoke-test-mock.mjs low-contrast regression',
  hasAll(code, [
    'function runKwcagKrdsAudit',
    'KWCAG 2.2 + KRDS',
    'KWCAG 2.2 텍스트 콘텐츠의 명도 대비',
    'KRDS 4.5:1 text label contrast',
    'KRDS 3:1 non-text contrast',
    '터치 타깃 44px 이상',
    'commandContrastRatio',
  ])
    && hasAll(ui, [
      'command-kwcag-krds-audit',
      'commandRenderKwcagKrdsAudit',
      'command.kwcagKrdsAudit',
    ])
    && hasAll(mockRuntime, [
      'KWCAG/KRDS audit should report low text contrast',
      'KWCAG/KRDS audit should report low non-text contrast',
      'KWCAG/KRDS audit should report small interactive target size',
      'KWCAG 2.2 텍스트 콘텐츠의 명도 대비',
    ]),
  'KWCAG/KRDS audit implementation or regression coverage is incomplete.',
);

add(
  checks,
  'component-qa',
  'Command Center can audit component quality for variant coverage, naming, KWCAG/KRDS focus-state coverage, and interactive auto-layout hygiene.',
  'code.js runComponentQa, ui.html Component QA control, run-smoke-test-mock.mjs broken component and focus-state regression',
  hasAll(code, [
    'function runComponentQa',
    'component-set-coverage',
    'component-naming',
    'component-focus-state',
    'KWCAG 2.2 focus visibility / KRDS keyboard focus state coverage',
    'component-autolayout',
  ])
    && hasAll(ui, [
      'command-component-qa',
      'commandRenderComponentQa',
      'command.componentQa',
    ])
    && hasAll(mockRuntime, [
      'component QA should detect naming, coverage, focus-state, and auto-layout issues',
      'component QA should report missing variant naming',
      'component QA should report missing KWCAG/KRDS focus state coverage',
      'component QA should report component sets with fewer than two variants',
    ]),
  'Component QA implementation or regression coverage is incomplete.',
);

add(
  checks,
  'token-governance',
  'Command Center can audit token governance risks including duplicate color values and flat naming.',
  'code.js runTokenGovernance, ui.html Token Governance control, run-smoke-test-mock.mjs duplicate/flat token regression',
  hasAll(code, [
    'function runTokenGovernance',
    'token-duplicate-value',
    'token-naming',
    'Duplicate color token values should be reviewed',
  ])
    && hasAll(ui, [
      'command-token-governance',
      'commandRenderTokenGovernance',
      'command.tokenGovernance',
    ])
    && hasAll(mockRuntime, [
      'token governance should detect duplicate and naming issues',
      'token governance should report duplicate color values',
      'token governance should report flat token naming',
    ]),
  'Token Governance implementation or regression coverage is incomplete.',
);

add(
  checks,
  'i18n',
  'UI i18n covers static labels, placeholders, HTML/title localized content, language persistence, and dynamic rerenders.',
  'ui.html I18N/applyLang/setLang/safeStorage, verify-integration.mjs i18n key checks, run-ui-roundtrip-smoke.mjs EN/KO DOM checks, run-ui-visual-smoke.mjs language click checks',
  hasAll(ui, ['const I18N', 'safeStorageGet', 'safeStorageSet', 'document.documentElement.lang', 'commandRenderDynamicI18n'])
    && hasAll(verifier, ['data-i18n(?:-ph|-html|-title)?', 'en i18n dictionary is missing key', 'ko i18n dictionary is missing key'])
    && hasAll(uiRoundtrip, ['English style.exportJson label did not render', 'Korean style.exportJson label did not render'])
    && hasAll(uiVisualSmoke, ['language click should switch document lang to ko', 'language click should localize Style Guide title']),
  'i18n implementation or DOM-level i18n verification is incomplete.',
);

add(
  checks,
  'style-guide-viewer-ver2-import-export',
  'style-guide-viewer_ver2.md is embedded, auto-loaded, parsed into 89 tokens, exported as JSON with MD/meta/data, and import restores the working preview.',
  'style-guide-viewer_ver2.md, STYLE_GUIDE_VIEWER_MD, validate-style-token-json.mjs, run-ui-roundtrip-smoke.mjs',
  styleGuideExists
    && ui.includes('STYLE_GUIDE_VIEWER_MD')
    && hasAll(ui, ['styleLoadEmbeddedMd();', 'style-export-json', 'style-json-input', 'styleRenderImportedData'])
    && hasAll(styleValidator, ['Primary', 'Semantic/Danger', 'buttonSizes', 'inputSizes', 'total'])
    && hasAll(uiRoundtrip, [
      'embedded MD produced unexpected token total',
      'style export meta does not preserve textarea MD length',
      'style JSON import did not render localized summary',
    ]),
  'Style guide ver2 import/export roundtrip or validator coverage is incomplete.',
);

add(
  checks,
  'style-semantic-visual-layout',
  'Style Guide semantic color preview renders Danger/Warning/Success/Info with Base/BG/Line/Text without visual overlap at the plugin panel width.',
  'ui.html semantic grid CSS, run-ui-roundtrip-smoke.mjs semantic structure checks, run-ui-visual-smoke.mjs Chrome bounding-box overlap checks',
  hasAll(ui, ['.semantic-row', 'grid-template-columns: repeat(4, minmax(44px, 1fr))', 'overflow-wrap: anywhere'])
    && hasAll(uiRoundtrip, ['semantic preview should render four semantic rows', 'semantic preview should render sixteen semantic swatches'])
    && hasAll(uiVisualSmoke, ['semantic preview has overlapping layout boxes', "switchTool('style')", 'Page.captureScreenshot']),
  'Semantic color preview layout is not covered by visual overlap verification.',
);

add(
  checks,
  'component-factory-dynamic-page',
  'Style Guide component generation creates component variants through dynamic-page-safe page APIs and has a regression test for the not-a-function failure path.',
  'code.js commandGetLocalPages/commandSetCurrentPage wrappers, verify-integration.mjs direct-access guards, run-smoke-test-mock.mjs style-create-components regression',
  hasAll(code, [
    'function commandGetLocalPages',
    'figma.getLocalPagesAsync',
    'function commandSetCurrentPage',
    'figma.setCurrentPageAsync',
    'await commandGetLocalPages()',
    'await commandSetCurrentPage(compPage)',
    'Component generation failed during',
  ])
    && hasAll(verifier, [
      'Component generation should use async page APIs under dynamic-page documentAccess',
      'direct figma.root.children calls should be isolated to the async page wrapper fallback',
      'direct figma.currentPage assignment should be isolated to the async page wrapper fallback',
    ])
    && hasAll(mockRuntime, [
      'style-create-components did not finish in mock runtime',
      'style-create-components should create button variants',
      'style-create-components should create or reuse the Components page through async page APIs',
    ]),
  'Component factory dynamic-page fix or regression coverage is incomplete.',
);

add(
  checks,
  'folder-maker-batch-utility',
  'Folder Maker can parse messy CSV/TSV inputs and safely create integration-project folders named template_school_system with GUI buttons, sample CSV, dry-run, execute, Figma/template file copy, duplicate detection, existing-folder skip, and logs.',
  'folder-maker/Create-Folders.ps1, folder-maker/Folder-Maker-GUI.ps1, folder-maker/폴더생성.cmd, folder-maker/폴더생성-GUI.cmd, folder-maker/folder-create.cmd, folder-maker/folder-maker-gui.cmd, folder-maker/Folder-Maker-Bridge.ps1, folder-maker/folder-maker-bridge.cmd, folder-maker/install-protocol.cmd, folder-maker/uninstall-protocol.cmd, folder-maker/sample.csv, folder-maker/Test-FolderMaker.ps1, folder-maker/README.md',
  fs.existsSync(path.join(repoRoot, 'folder-maker/sample.csv'))
    && hasAll(folderMakerScript, [
      'function Parse-FolderCsv',
      'function Read-TextFileAutoEncoding',
      'function Detect-Delimiter',
      'function ConvertTo-SafeName',
      'DUPLICATE_IN_CSV',
      'MISSING_REQUIRED_FIELD',
      'DRY_RUN',
      'Copy-TemplateFileToFolder',
      'RenameCopyToFolder',
      'OverwriteCopy',
      'FILE_EXISTS',
      '_folder-maker-logs',
      'ConvertFrom-Csv',
    ])
    && hasAll(folderMakerTest, [
      'tab-english.tsv',
      'no-header.csv',
      'duplicate.csv',
      'template.fig',
      'should copy and rename template file',
      'Folder-Maker-GUI.ps1',
      'Folder Maker parser tests passed',
    ])
    && hasAll(folderMakerCmd, [
      'powershell',
      'Create-Folders.ps1',
    ])
    && hasAll(folderMakerGui, [
      'Select CSV',
      'Select Folder',
      'Select File',
      'Open sample CSV',
      'Use sample CSV',
      'Save sample as',
      'Preview',
      'Create Folders',
      'Open output folder',
      'Rename copied file to folder name',
      'Overwrite existing copied file',
      'SmokeTest',
    ])
    && hasAll(folderMakerGuiCmd, [
      'powershell',
      'Folder-Maker-GUI.ps1',
    ])
    && hasAll(folderMakerAsciiCmd, [
      'powershell',
      'Create-Folders.ps1',
    ])
    && hasAll(folderMakerAsciiGuiCmd, [
      'powershell',
      'Folder-Maker-GUI.ps1',
    ])
    && hasAll(folderMakerBridge, [
      'HttpListener',
      'http://127.0.0.1:39573/',
      '/open-folder-maker',
      'Start-Process',
      'folder-maker-gui.cmd',
      'SmokeTest',
    ])
    && hasAll(folderMakerBridgeCmd, [
      'powershell',
      'Folder-Maker-Bridge.ps1',
    ])
    && hasAll(folderMakerProtocolInstaller, [
      'PROTOCOL=klic-folder-maker',
      'HKCU\\Software\\Classes\\%PROTOCOL%',
      'URL Protocol',
      'folder-maker-gui.cmd',
      '--dry-run',
    ])
    && hasAll(folderMakerProtocolUninstaller, [
      'reg delete',
      'klic-folder-maker',
      '--dry-run',
    ])
    && hasAll(folderMakerReadme, [
      '폴더생성-GUI.cmd',
      '--copy-file',
      '--rename-copy-to-folder',
      'UTF-8',
      'CP949',
      '헤더가 없으면',
      'Open sample CSV',
      'Select File',
      'Save sample as',
      'Open output folder',
      '쉼표, 탭, 세미콜론, 파이프',
      'DUPLICATE_IN_CSV',
      '--TemplateColumn',
      'folder-maker-bridge.cmd',
      'http://localhost:39573',
      'install-protocol.cmd',
    ]),
  'Folder Maker parser, safety checks, tests, or documentation are incomplete.',
);

add(
  checks,
  'figma-folder-maker-bridge',
  'Command Center exposes a Folder Maker button that calls a local-only localhost bridge, so users can upload CSV in the GUI and run the existing script from buttons.',
  'klic-figma-toolkit/ui.html, klic-figma-toolkit/code.js, folder-maker/Folder-Maker-Bridge.ps1, folder-maker/folder-maker-bridge.cmd',
  hasAll(ui, [
    'command-open-folder-maker',
    'command.folderMakerGuide',
    'command.folderMakerOpened',
    'FOLDER_MAKER_BRIDGE_URL',
    'http://localhost:39573/open-folder-maker',
    'fetch(FOLDER_MAKER_BRIDGE_URL',
    'FOLDER_MAKER_BRIDGE_COMMAND',
    'folder-maker-bridge.cmd',
  ])
    && hasAll(code, [
      "case 'command-open-folder-maker'",
      'function openFolderMaker',
      'command-folder-maker-fallback',
    ])
    && !code.includes('figma.openExternal')
    && hasAll(verifier, [
      'command-open-folder-maker',
      'FOLDER_MAKER_BRIDGE_URL',
      'folder-maker-bridge.cmd',
    ])
    && hasAll(folderMakerBridge, [
      'HttpListener',
      'http://localhost:39573/',
      '/open-folder-maker',
      'Start-Process',
      'folder-maker-gui.cmd',
    ])
    && hasAll(mockRuntime, [
      'command-open-folder-maker',
      'command-folder-maker-fallback',
    ])
    && hasAll(localRunner, [
      'folder maker bridge cmd smoke',
      'folder-maker-bridge.cmd -SmokeTest',
    ]),
  'Figma-to-Folder-Maker local protocol bridge or tests are incomplete.',
);

add(
  checks,
  'local-preflight',
  'Local preflight runs integration checks, UI roundtrip, visual smoke, mock Figma runtime including component generation, smoke evidence validation, forged runtime evidence rejection, folder-maker parser tests, style token validation, syntax checks, and Node.js launcher guidance checks.',
  'run-local-verification.mjs',
  hasAll(localRunner, [
    'verify-integration.mjs',
    'run-ui-roundtrip-smoke.mjs',
    'run-ui-visual-smoke.mjs',
    'run-smoke-test-mock.mjs',
    'validate-smoke-evidence.mjs',
    'Test-FolderMaker.ps1',
    'validate-style-token-json.mjs',
    'capture-runtime-evidence.mjs',
    'forged runtime evidence rejection',
    'Node.js launcher guidance check passed',
    'runWindowsCmdSmokeChecks',
    'root launcher cmd smoke',
    'folder maker create cmd smoke',
    'ui.html script syntax check passed',
  ]),
  'Local preflight runner does not cover all required gates.',
);

add(
  checks,
  'node-runtime-guidance',
  'Windows command wrappers detect missing Node.js before running validators and print Node.js LTS install guidance, with a root launcher for the full runtime workflow.',
  'KLIC-START.cmd, run-local-verification.cmd, run-completion-audit.cmd, capture-runtime-evidence.cmd, validate-smoke-evidence.cmd, validate-style-token-json.cmd, watch-runtime-evidence.cmd, watch-runtime-clipboard.cmd, RUNTIME_CHECKLIST.md',
  hasAll(localVerificationCmd, [
    'where node',
    'winget install OpenJS.NodeJS.LTS',
    'https://nodejs.org/',
    'run-local-verification.mjs',
  ])
    && hasAll(completionAuditCmd, [
      'where node',
      'winget install OpenJS.NodeJS.LTS',
      'https://nodejs.org/',
      'run-completion-audit.mjs',
    ])
    && hasAll(runtimeEvidenceCmd, [
      'where node',
      'winget install OpenJS.NodeJS.LTS',
      'https://nodejs.org/',
      'capture-runtime-evidence.mjs',
    ])
    && hasAll(smokeEvidenceValidatorCmd, [
      'where node',
      'winget install OpenJS.NodeJS.LTS',
      'https://nodejs.org/',
      'validate-smoke-evidence.mjs',
    ])
    && hasAll(styleTokenValidatorCmd, [
      'where node',
      'winget install OpenJS.NodeJS.LTS',
      'https://nodejs.org/',
      'validate-style-token-json.mjs',
    ])
    && hasAll(runtimeEvidenceWatcherCmd, [
      'where node',
      'winget install OpenJS.NodeJS.LTS',
      'https://nodejs.org/',
      'watch-runtime-evidence.mjs',
    ])
    && hasAll(runtimeEvidenceClipboardWatcherCmd, [
      'where node',
      'winget install OpenJS.NodeJS.LTS',
      'https://nodejs.org/',
      'watch-runtime-clipboard.mjs',
    ])
    && hasAll(rootLauncherCmd, [
      'run-local-verification.cmd',
      'capture-runtime-evidence.cmd',
      'run-completion-audit.cmd',
      'watch-runtime-evidence.cmd',
      'watch-runtime-clipboard.cmd',
      'RUNTIME_CHECKLIST.md',
      'winget install OpenJS.NodeJS.LTS',
      'folder-maker-gui.cmd',
      'folder-maker-bridge.cmd',
      'install-protocol.cmd',
    ])
    && hasAll(runtimeChecklist, [
      'KLIC-START.cmd',
      'Node.js LTS must be installed',
      'winget install OpenJS.NodeJS.LTS',
      'run-local-verification.cmd',
      'run-completion-audit.cmd',
      'capture-runtime-evidence.cmd',
      'validate-smoke-evidence.cmd',
      'validate-style-token-json.cmd',
      'watch-runtime-evidence.cmd',
      'watch-runtime-clipboard.cmd',
    ]),
  'Node.js missing-runtime guidance is incomplete.',
);

let localResult = null;
if (!args.skipLocal) {
  localResult = run('local preflight', 'node', ['klic-figma-toolkit/run-local-verification.mjs']);
  if (localResult.stdout) process.stdout.write(localResult.stdout);
  if (localResult.stderr) process.stderr.write(localResult.stderr);
}

add(
  checks,
  'fresh-local-preflight-result',
  'Fresh local preflight command exits successfully in the current workspace.',
  args.skipLocal ? '--skip-local was used' : 'node klic-figma-toolkit/run-local-verification.mjs',
  !args.skipLocal && localResult?.status === 0,
  'Run local preflight without --skip-local and fix failures.',
);

let runtimeEvidenceResult = null;
const runtimeEvidencePath = args.runtimeEvidence ? path.resolve(repoRoot, args.runtimeEvidence) : '';
if (runtimeEvidencePath && fs.existsSync(runtimeEvidencePath)) {
  runtimeEvidenceResult = run('runtime smoke evidence validator', 'node', [
    'klic-figma-toolkit/validate-smoke-evidence.mjs',
    '--require-figma-runtime',
    runtimeEvidencePath,
  ]);
  if (runtimeEvidenceResult.stdout) process.stdout.write(runtimeEvidenceResult.stdout);
  if (runtimeEvidenceResult.stderr) process.stderr.write(runtimeEvidenceResult.stderr);
}

add(
  checks,
  'actual-figma-runtime-smoke-evidence',
  'Actual Figma desktop run produced copyable smoke evidence JSON and validate-smoke-evidence.mjs accepts it.',
  args.runtimeEvidence
    ? `node klic-figma-toolkit/validate-smoke-evidence.mjs --require-figma-runtime ${args.runtimeEvidence}`
    : 'No --runtime-evidence path provided',
  Boolean(runtimeEvidencePath && fs.existsSync(runtimeEvidencePath) && runtimeEvidenceResult?.status === 0),
  args.runtimeEvidence
    ? 'Runtime evidence file is missing or failed validation.'
    : 'Run the plugin in Figma desktop, click Run smoke test, copy the evidence JSON, then run capture-runtime-evidence.cmd or pass it with --runtime-evidence.',
);

add(
  checks,
  'runtime-checklist',
  'Runtime checklist documents local preflight, Figma import, runtime smoke test, token export audit, Style Guide JSON import/export validation, and component generation manual verification.',
  'RUNTIME_CHECKLIST.md',
  hasAll(runtimeChecklist, [
    'Import plugin from manifest',
    'Run smoke test',
    'Runtime smoke test passed',
    'validate-smoke-evidence.mjs',
    'capture-runtime-evidence.mjs',
    'Node.js LTS must be installed',
    'KWCAG/KRDS audit',
    'KWCAG 2.2 텍스트 콘텐츠의 명도 대비',
    '3:1',
    '44×44px',
    'DTCG JSON',
    'designtokens.org/TR/2025.10/format',
    'Component QA',
    'auto layout',
    'Token governance',
    'duplicate color values',
    'audit.provenanceSummary',
    'validate-style-token-json.mjs',
    'Import JSON',
    'Click `Components`',
    '📦 Components',
  ]),
  'Runtime checklist is missing a required manual/validator gate.',
);

printChecklist(checks);

const missing = checks.filter((check) => check.status !== 'PASS');
if (missing.length > 0) {
  console.log(`\nCompletion audit failed: ${missing.length} requirement(s) missing or unverified.`);
  process.exit(2);
}

console.log('\nCompletion audit passed. Local and actual Figma runtime evidence are both verified.');
