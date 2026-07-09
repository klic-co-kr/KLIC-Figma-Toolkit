function safeStorageGet(key) {
  try {
    const storage = (typeof window !== 'undefined' && window.localStorage)
      || (typeof localStorage !== 'undefined' && localStorage);
    return storage && storage.getItem(key);
  } catch (err) {
    return null;
  }
}
function safeStorageSet(key, value) {
  try {
    const storage = (typeof window !== 'undefined' && window.localStorage)
      || (typeof localStorage !== 'undefined' && localStorage);
    if (storage) storage.setItem(key, value);
  } catch (err) {
    // Figma can block iframe storage in some desktop contexts; language still changes in-memory.
  }
}

const UI_SIZE_PRESETS = {
  compact: { width: 560, height: 720 },
  default: { width: 720, height: 820 },
  wide: { width: 960, height: 860 },
};
let uiSize = UI_SIZE_PRESETS[safeStorageGet('klic.uiSize')] ? safeStorageGet('klic.uiSize') : 'default';
let LANG = safeStorageGet('klic.lang') || ((navigator.language || '').toLowerCase().startsWith('ko') ? 'ko' : 'en');
function t(key, ...args) {
  const v = (I18N[LANG] && I18N[LANG][key] != null) ? I18N[LANG][key] : I18N.en[key];
  if (typeof v === 'function') return v(...args);
  return v != null ? v : key;
}

function applyLang() {
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
  document.querySelectorAll('[data-i18n-html]').forEach(el => { el.innerHTML = t(el.dataset.i18nHtml); });
  document.querySelectorAll('[data-i18n-title]').forEach(el => { el.title = t(el.dataset.i18nTitle); });
  document.querySelectorAll('[data-i18n-aria]').forEach(el => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
  document.documentElement.lang = LANG;
  const langEn = document.getElementById('lang-en');
  const langKo = document.getElementById('lang-ko');
  langEn.classList.toggle('active', LANG === 'en');
  langKo.classList.toggle('active', LANG === 'ko');
  langEn.setAttribute('aria-pressed', String(LANG === 'en'));
  langKo.setAttribute('aria-pressed', String(LANG === 'ko'));
  applyUiSizeState();
  // re-render dynamic bits that depend on language
  commandRenderDynamicI18n();
  menuRenderFilterTags();
  menuUpdateCount();
  tableRefreshDetected();
  uxChecklistRender();
}
function setLang(l) {
  LANG = I18N[l] ? l : 'en';
  safeStorageSet('klic.lang', LANG);
  applyLang();
}

function applyUiSizeState() {
  Object.keys(UI_SIZE_PRESETS).forEach(size => {
    const btn = document.getElementById('size-' + size);
    if (btn) {
      btn.classList.toggle('active', uiSize === size);
      btn.setAttribute('aria-pressed', String(uiSize === size));
    }
  });
}

function resizeUi(size) {
  uiSize = UI_SIZE_PRESETS[size] ? size : 'default';
  safeStorageSet('klic.uiSize', uiSize);
  applyUiSizeState();
  parent.postMessage({ pluginMessage: { type: 'ui-resize', size: uiSize } }, '*');
}

/* ═══════════════════════════════════════════════════════════════════════════
   Tool tab switching
   ═══════════════════════════════════════════════════════════════════════════ */
function switchTool(tool) {
  ['command', 'menu', 'style', 'table', 'qa', 'handoff', 'designqa'].forEach(k => {
    document.getElementById('tool-' + k).classList.toggle('active', tool === k);
    document.getElementById('pane-' + k).classList.toggle('active', tool === k);
  });
  if (tool === 'table' && !tableVarsLoaded) {
    parent.postMessage({ pluginMessage: { type: 'table-ready' } }, '*');
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   MODULE: COMMAND CENTER
   ═══════════════════════════════════════════════════════════════════════════ */
let commandScope = 'selection';
let commandPreviewItems = [];
let commandLastSnapshot = null;
let commandLastPreviewItems = [];
const FOLDER_MAKER_PROTOCOL_URL = 'klic-folder-maker://open';
const FOLDER_MAKER_BRIDGE_URL = 'http://localhost:39573/open-folder-maker';
const FOLDER_MAKER_BRIDGE_COMMAND = 'D:\\DEV\\KLIC-Figma\\folder-maker\\folder-maker-bridge.cmd';
const FOLDER_MAKER_GUI_COMMAND = 'D:\\DEV\\KLIC-Figma\\folder-maker\\folder-maker-gui.cmd';

function commandGetOptions() {
  return {
    scanLimit: parseInt(document.getElementById('command-scan-limit').value, 10) || 2000,
    oklchThreshold: parseFloat(document.getElementById('command-oklch-threshold').value) || 0.08,
    collectionPriority: document.getElementById('command-collection-priority').value || '',
    includeOklchApply: document.getElementById('command-include-oklch-apply').checked,
  };
}

function commandGetProjectPreset(presetId) {
  const presets = {
    'public-education': {
      id: 'public-education',
      tablePreset: 'krds',
      accessibility: 'KWCAG/KRDS',
      collectionPriority: '컬러/브랜드, 컬러/시맨틱, 컬러/그레이',
      summaryKey: 'command.pipelineSummary',
    },
    'saas-admin': {
      id: 'saas-admin',
      tablePreset: 'admin',
      accessibility: 'KWCAG/KRDS',
      collectionPriority: '컬러/시맨틱, 컬러/브랜드, 컬러/그레이',
      summaryKey: 'command.projectSaasAdmin',
    },
    corporate: {
      id: 'corporate',
      tablePreset: 'report',
      accessibility: 'KWCAG/KRDS',
      collectionPriority: '컬러/브랜드, 컬러/그레이, 컬러/시맨틱',
      summaryKey: 'command.projectCorporate',
    },
  };
  return presets[presetId] || presets['public-education'];
}
function commandApplyProjectPreset(presetId) {
  const preset = commandGetProjectPreset(presetId);
  const projectType = document.getElementById('command-project-type');
  if (projectType) projectType.value = preset.id;
  const priority = document.getElementById('command-collection-priority');
  if (priority) priority.value = preset.collectionPriority;
  const tablePreset = document.getElementById('table-preset');
  if (tablePreset) {
    tablePreset.value = preset.tablePreset;
    if (typeof tableApplyPreset === 'function') tableApplyPreset(preset.tablePreset);
  }
  commandRenderProjectPipeline(preset.id);
}

function commandBuildPipelineSteps(presetId) {
  const preset = commandGetProjectPreset(presetId);
  return [
    { id: 'setup', titleKey: 'command.pipelineStepSetup', statusKey: 'command.pipelinePending', items: ['command.pipelineItemStyle', 'command.pipelineItemVariables', 'command.pipelineItemComponents'] },
    { id: 'generation', titleKey: 'command.pipelineStepGeneration', statusKey: 'command.pipelinePending', items: ['command.pipelineItemCsv', 'command.pipelineItemTemplate', 'command.pipelineItemPages'] },
    { id: 'qa', titleKey: 'command.pipelineStepQa', statusKey: 'command.pipelinePending', items: ['command.pipelineItemScan', 'command.pipelineItemAccessibility', 'command.pipelineItemComponentQa'] },
    { id: 'handoff', titleKey: 'command.pipelineStepHandoff', statusKey: 'command.pipelinePending', items: ['command.pipelineItemTokens', 'command.pipelineItemReport', 'command.pipelineItemPackage'] },
  ].map(step => Object.assign({ presetId: preset.id }, step));
}
function commandRenderProjectPipeline(presetId) {
  const preset = commandGetProjectPreset(presetId || (document.getElementById('command-project-type') && document.getElementById('command-project-type').value));
  const summary = document.getElementById('command-pipeline-summary');
  if (summary) summary.textContent = preset.id === 'public-education' ? t('command.pipelineSummary') : `${t(preset.summaryKey)} · ${preset.accessibility}`;
  const pipeline = document.getElementById('command-pipeline');
  if (!pipeline) return;
  pipeline.innerHTML = commandBuildPipelineSteps(preset.id).map(step => `
    <div class="pipeline-step" data-step="${commandEscape(step.id)}">
      <div class="pipeline-step-head">
        <span class="pipeline-step-title">${commandEscape(t(step.titleKey))}</span>
        <span class="pipeline-status">${commandEscape(t(step.statusKey))}</span>
      </div>
      <div class="pipeline-items">
        ${step.items.map(itemKey => `<span class="pipeline-item">${commandEscape(t(itemKey))}</span>`).join('')}
      </div>
    </div>
  `).join('');
}

function commandEscape(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function commandSetText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function commandGetBindingList(mode) {
  const activePane = document.querySelector('.tool-pane.active');
  const activeId = activePane ? activePane.id : '';
  let targetId = 'command-binding-list';
  if (mode === 'binding') targetId = 'style-binding-list';
  else if (mode === 'qa') targetId = 'qa-result-list';
  else if (mode === 'handoff' || mode === 'evidence') targetId = 'handoff-result-list';
  else if (activeId === 'pane-style') targetId = 'style-binding-list';
  else if (activeId === 'pane-qa') targetId = 'qa-result-list';
  else if (activeId === 'pane-handoff') targetId = 'handoff-result-list';
  const list = document.getElementById(targetId) || document.getElementById('command-binding-list');
  if (list) list.classList.toggle('evidence-mode', mode === 'evidence');
  return list;
}

function commandRefresh(scope) {
  commandScope = scope || commandScope;
  parent.postMessage({ pluginMessage: { type: 'command-refresh', scope: commandScope, options: commandGetOptions() } }, '*');
}

function commandPreviewBindings() {
  parent.postMessage({ pluginMessage: { type: 'command-preview-color-bindings', scope: commandScope, options: commandGetOptions() } }, '*');
}

function commandApplyBindings() {
  const selected = [...document.querySelectorAll('.command-binding-check:checked')]
    .map(input => commandPreviewItems[parseInt(input.dataset.index)])
    .filter(Boolean);
  parent.postMessage({ pluginMessage: { type: 'command-apply-color-bindings', scope: commandScope, changes: selected, options: commandGetOptions() } }, '*');
}

function commandRunKwcagKrdsAudit() {
  parent.postMessage({ pluginMessage: { type: 'command-kwcag-krds-audit', scope: commandScope, options: commandGetOptions() } }, '*');
}

function commandRunComponentQa() {
  parent.postMessage({ pluginMessage: { type: 'command-component-qa', scope: commandScope, options: commandGetOptions() } }, '*');
}

function commandRunTokenGovernance() {
  parent.postMessage({ pluginMessage: { type: 'command-token-governance' } }, '*');
}

function commandCancelScan() {
  parent.postMessage({ pluginMessage: { type: 'command-cancel-scan' } }, '*');
}

function commandExportTokens() {
  parent.postMessage({ pluginMessage: { type: 'command-export-tokens' } }, '*');
}

function commandCreateReportBoard() {
  parent.postMessage({ pluginMessage: { type: 'command-create-report-board', scope: commandScope, options: commandGetOptions() } }, '*');
}

function commandRunSmokeTest() {
  parent.postMessage({ pluginMessage: { type: 'command-run-smoke-test' } }, '*');
}

async function commandOpenFolderMaker() {
  parent.postMessage({ pluginMessage: { type: 'command-open-folder-maker' } }, '*');
}

function commandTryOpenFolderMakerProtocol() {
  try {
    const a = document.createElement('a');
    a.href = FOLDER_MAKER_PROTOCOL_URL;
    a.target = '_blank';
    a.rel = 'noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } catch (err) {
    try { window.open(FOLDER_MAKER_PROTOCOL_URL, '_blank'); } catch (ignore) {}
  }
}

async function commandCopyText(button, text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (err) {
    commandCopySmokeEvidenceWithExecCommand(text);
  }
  if (button) button.textContent = t('command.copiedFolderMakerCommand');
}

function commandCopyFolderMakerBridgeCommand(button) {
  return commandCopyText(button, `"${FOLDER_MAKER_BRIDGE_COMMAND}"`);
}

function commandCopyFolderMakerCommand(button) {
  return commandCopyText(button, `"${FOLDER_MAKER_GUI_COMMAND}"`);
}

function commandRenderFolderMakerFallback(url, message) {
  const list = commandGetBindingList('handoff');
  const bridgeCommand = `"${FOLDER_MAKER_BRIDGE_COMMAND}"`;
  const guiCommand = `"${FOLDER_MAKER_GUI_COMMAND}"`;
  list.innerHTML = `
    <div class="hint">${commandEscape(message || t('command.folderMakerOpened'))}</div>
    <div class="smoke-evidence-panel">
      <div class="smoke-evidence-head">
        <div>
          <div class="smoke-evidence-runtime">${commandEscape(url || FOLDER_MAKER_PROTOCOL_URL)}</div>
          <div class="smoke-evidence-status">${commandEscape(t('command.folderMakerFallbackTitle'))}</div>
        </div>
        <div class="smoke-evidence-actions">
          <button class="btn" id="command-copy-folder-maker-bridge-command" onclick="commandCopyFolderMakerBridgeCommand(this)">${t('command.copyFolderMakerBridgeCommand')}</button>
          <button class="btn" id="command-copy-folder-maker-command" onclick="commandCopyFolderMakerCommand(this)">${t('command.copyFolderMakerCommand')}</button>
        </div>
      </div>
      <pre class="smoke-evidence-json" style="min-height:96px;max-height:180px">${commandEscape(bridgeCommand + '\n' + guiCommand)}</pre>
    </div>
  `;
}

function commandRenderSnapshot(data) {
  if (!data) return;
  commandLastSnapshot = data;
  const provenance = data.provenanceSummary || {};
  const tools = provenance.tools || {};
  const sources = provenance.sources || {};
  const topTools = Object.entries(tools).slice(0, 3).map(([name, count]) => `${name} ${count}`).join(' · ');
  const topSources = Object.entries(sources).slice(0, 2).map(([name, count]) => `${name} ${count}`).join(' · ');
  commandSetText('command-health-score', data.healthScore);
  commandSetText('command-raw-fills', data.rawFills);
  commandSetText('command-raw-strokes', data.rawStrokes);
  commandSetText('command-exact-matches', data.exactMatches);
  commandSetText('command-klic-nodes', data.generatedKlicNodes);
  commandSetText('command-issue-raw', t('command.snapshotRaw', data.unboundPaints, data.nodeCount));
  commandSetText('command-issue-match', t('command.snapshotMatch', data.exactMatches, data.oklchSuggestions || 0, data.localColorVariables));
  commandSetText('command-issue-generated', t('command.snapshotGenerated', data.generatedKlicNodes, data.scope, data.scanTruncated, topTools, topSources, provenance.diagnosticWarnings || 0));
}

function commandRenderBindingPreview(items) {
  commandPreviewItems = items || [];
  commandLastPreviewItems = commandPreviewItems;
  const list = commandGetBindingList('binding');
  if (!commandPreviewItems.length) {
    list.innerHTML = `<div class="hint">${t('command.emptyPreview')}</div>`;
    return;
  }
  list.innerHTML = commandPreviewItems.map((item, index) => `
    <label class="binding-item">
      <input class="command-binding-check" type="checkbox" data-index="${index}" ${item.matchType === 'rgb-exact' ? 'checked' : ''}>
      <span class="binding-hex">${commandEscape(item.hex)}</span>
      <span>
        <span>${commandEscape(item.nodeName)} · ${commandEscape(item.property)}[${item.paintIndex}] · ${commandEscape(item.matchLabel || 'RGB exact')}</span>
        <span class="binding-target">${commandEscape(item.variableName)}</span>
        ${item.oklchDelta ? `<span class="binding-target">${commandEscape(t('command.oklchDelta', item.oklchDelta.l, item.oklchDelta.c, item.oklchDelta.h, item.oklchDelta.distance))}</span>` : ''}
      </span>
    </label>
  `).join('');
}

function commandRenderKwcagKrdsAudit(msg) {
  const list = commandGetBindingList('qa');
  const summary = msg.summary || {};
  const issues = msg.issues || [];
  const title = issues.length
    ? t('command.kwcagKrdsIssues', summary.issueCount || issues.length, summary.standard || 'KWCAG/KRDS', summary.scannedTextNodes || 0)
    : t('command.kwcagKrdsPassed', summary.standard || 'KWCAG/KRDS', summary.scannedTextNodes || 0);
  const rows = issues.map(issue => `
    <div class="command-issue">
      <div class="${issue.severity === 'error' ? 'severity-red' : 'severity-yellow'}"></div>
      <span>
        ${commandEscape(issue.nodeName || issue.nodeId)} · ${commandEscape(issue.rule || issue.type)} ·
        ${commandEscape(String(issue.contrastRatio))}:1 / ${commandEscape(String(issue.requiredRatio))}:1
        <span class="binding-target">${commandEscape(issue.foreground)} on ${commandEscape(issue.background)}${issue.textSample ? ' · ' + commandEscape(issue.textSample) : ''}</span>
      </span>
      <div class="quick-action">KWCAG</div>
    </div>
  `).join('');
  list.innerHTML = `<div class="${issues.length ? 'status error' : 'hint'}">${commandEscape(title)}</div>${rows ? `<div class="command-issues" style="margin-top:8px">${rows}</div>` : ''}`;
}

function commandRenderComponentQa(msg) {
  const list = commandGetBindingList('qa');
  const summary = msg.summary || {};
  const issues = msg.issues || [];
  const title = issues.length
    ? t('command.componentQaIssues', summary.issueCount || issues.length, summary.componentCount || 0, summary.componentSetCount || 0)
    : t('command.componentQaPassed', summary.componentCount || 0, summary.componentSetCount || 0);
  const rows = issues.map(issue => `
    <div class="command-issue">
      <div class="${issue.severity === 'error' ? 'severity-red' : 'severity-yellow'}"></div>
      <span>
        ${commandEscape(issue.nodeName || issue.nodeId)} · ${commandEscape(issue.rule || issue.type)}
        <span class="binding-target">${commandEscape(issue.recommendation || '')}</span>
      </span>
      <div class="quick-action">QA</div>
    </div>
  `).join('');
  list.innerHTML = `<div class="${issues.length ? 'status error' : 'hint'}">${commandEscape(title)}</div>${rows ? `<div class="command-issues" style="margin-top:8px">${rows}</div>` : ''}`;
}

function commandRenderTokenGovernance(msg) {
  const list = commandGetBindingList('qa');
  const summary = msg.summary || {};
  const issues = msg.issues || [];
  const title = issues.length
    ? t('command.tokenGovernanceIssues', summary.issueCount || issues.length, summary.tokenCount || 0, summary.duplicateGroups || 0)
    : t('command.tokenGovernancePassed', summary.tokenCount || 0);
  const rows = issues.map(issue => `
    <div class="command-issue">
      <div class="${issue.severity === 'error' ? 'severity-red' : 'severity-yellow'}"></div>
      <span>
        ${commandEscape(issue.name || issue.hex || issue.type)} · ${commandEscape(issue.rule || issue.type)}
        <span class="binding-target">${commandEscape(issue.tokens ? issue.tokens.join(' · ') : (issue.collection ? issue.collection + '/' + issue.name : ''))}${issue.recommendation ? ' · ' + commandEscape(issue.recommendation) : ''}</span>
      </span>
      <div class="quick-action">Token</div>
    </div>
  `).join('');
  list.innerHTML = `<div class="${issues.length ? 'status error' : 'hint'}">${commandEscape(title)}</div>${rows ? `<div class="command-issues" style="margin-top:8px">${rows}</div>` : ''}`;
}

function commandRenderDynamicI18n() {
  commandRenderProjectPipeline();
  if (commandLastSnapshot) commandRenderSnapshot(commandLastSnapshot);
  if (commandLastPreviewItems && commandLastPreviewItems.length) commandRenderBindingPreview(commandLastPreviewItems);
  commandGuidedRender();
}

async function commandCopySmokeEvidence(button) {
  const text = commandGetSmokeEvidenceText();
  if (!text) return;
  const status = document.getElementById('command-smoke-evidence-status');
  try {
    await navigator.clipboard.writeText(text);
    if (status) status.textContent = t('command.copiedEvidence');
  } catch (err) {
    if (commandCopySmokeEvidenceWithExecCommand(text)) {
      if (status) status.textContent = t('command.copiedEvidence');
      return;
    }
    commandSelectSmokeEvidence();
    if (status) status.textContent = t('command.copyFallback');
  }
}

function commandGetSmokeEvidenceText() {
  const jsonNode = document.getElementById('command-smoke-evidence-json');
  if (jsonNode) return jsonNode.textContent || '';
  const textarea = document.getElementById('command-smoke-evidence');
  return textarea ? textarea.value : '';
}

function commandCopySmokeEvidenceWithExecCommand(text) {
  if (!document.execCommand) return false;
  const scratch = document.createElement('textarea');
  scratch.value = text;
  scratch.setAttribute('readonly', 'readonly');
  scratch.className = 'smoke-evidence-hidden';
  document.body.appendChild(scratch);
  scratch.focus();
  scratch.select();
  scratch.setSelectionRange(0, scratch.value.length);
  try {
    return document.execCommand('copy');
  } catch (err) {
    return false;
  } finally {
    document.body.removeChild(scratch);
  }
}

function commandSelectSmokeEvidence(button) {
  const jsonNode = document.getElementById('command-smoke-evidence-json');
  const textarea = document.getElementById('command-smoke-evidence');
  const status = document.getElementById('command-smoke-evidence-status');
  if (jsonNode && window.getSelection && document.createRange) {
    jsonNode.focus();
    const range = document.createRange();
    range.selectNodeContents(jsonNode);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  } else if (textarea) {
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
  }
  if (status) status.textContent = t('command.selectedEvidence');
}

function commandDownloadSmokeEvidence(button) {
  const text = commandGetSmokeEvidenceText();
  const status = document.getElementById('command-smoke-evidence-status');
  if (!text) return;
  try {
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'figma-smoke-evidence.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    if (status) status.textContent = t('command.downloadedEvidence');
  } catch (err) {
    commandSelectSmokeEvidence();
    if (status) status.textContent = t('command.downloadFallback');
  }
}

function commandRenderSmokeChecks(msg) {
  const checks = msg.smokeChecks || [];
  const rows = checks.map(check => `
    <div class="command-issue">
      <div class="${check.passed ? 'severity-green' : 'severity-red'}"></div>
      <span>${commandEscape(check.name)}${check.detail ? ' · ' + commandEscape(check.detail) : ''}</span>
      <div class="quick-action">${check.passed ? 'OK' : 'FAIL'}</div>
    </div>
  `).join('');
  const runtime = msg.evidence && msg.evidence.runtime;
  const runtimeText = runtime
    ? `${commandEscape(runtime.kind || 'unknown')} · ${commandEscape(runtime.editorType || 'unknown')} · API ${commandEscape(runtime.apiVersion || 'unknown')}`
    : '';
  const evidenceJson = msg.evidence ? commandEscape(JSON.stringify(msg.evidence, null, 2)) : '';
  const evidence = msg.evidence ? `
    <div class="smoke-evidence-panel">
      <div class="smoke-evidence-head">
        <div>
          <div class="smoke-evidence-runtime">smoke-evidence.json${runtimeText ? ' · ' + runtimeText : ''}</div>
          <div class="smoke-evidence-status" id="command-smoke-evidence-status">${t('command.selectedEvidence')}</div>
        </div>
        <div class="smoke-evidence-actions">
          <button class="btn" id="command-copy-smoke-evidence" onclick="commandCopySmokeEvidence(this)">${t('command.copyEvidence')}</button>
          <button class="btn" id="command-select-smoke-evidence" onclick="commandSelectSmokeEvidence(this)">${t('command.selectEvidence')}</button>
          <button class="btn" id="command-download-smoke-evidence" onclick="commandDownloadSmokeEvidence(this)">${t('command.downloadEvidence')}</button>
        </div>
      </div>
      <pre id="command-smoke-evidence-json" class="smoke-evidence-json" tabindex="0">${evidenceJson}</pre>
      <textarea id="command-smoke-evidence" class="smoke-evidence-hidden" readonly>${evidenceJson}</textarea>
    </div>
  ` : '';
  return `<div class="${msg.passed ? 'hint' : 'status error'}">${msg.passed ? t('command.smokePassed') : commandEscape(t('command.smokeFailed', msg.message))}</div>${rows ? `<div class="command-issues" style="margin-top:8px">${rows}</div>` : ''}${evidence}`;
}

let commandGuidedPhase = 'idle';
let commandGuidedStatusKey = 'command.guidedReady';

function commandGuidedRender() {
  const button = document.getElementById('command-guided-run');
  if (button) button.textContent = t(commandGuidedPhase === 'done' ? 'command.guidedRerun' : 'command.guidedRun');
  if (commandGuidedPhase !== 'idle') {
    const status = document.querySelector('#guided-step-command .guided-status');
    if (status) status.textContent = t(commandGuidedStatusKey);
  }
}

function commandGuidedSetStep(tool, state, statusKey) {
  const step = document.getElementById('guided-step-' + tool);
  if (!step) return;
  step.classList.remove('active', 'done', 'error');
  if (state) step.classList.add(state);
  const status = step.querySelector('.guided-status');
  if (status) {
    status.dataset.i18n = statusKey;
    status.textContent = t(statusKey);
  }
}

function commandGuidedSetPhase(phase, statusKey) {
  commandGuidedPhase = phase;
  commandGuidedStatusKey = statusKey;
  commandGuidedSetStep('command', phase === 'done' ? 'done' : (phase === 'error' ? 'error' : 'active'), statusKey);
  const button = document.getElementById('command-guided-run');
  if (button) {
    button.disabled = phase !== 'idle' && phase !== 'done' && phase !== 'error';
    button.textContent = t(phase === 'done' ? 'command.guidedRerun' : 'command.guidedRun');
  }
}

function commandGuidedCollectFixes() {
  commandGuidedSetPhase('fixes', 'command.guidedFixes');
  parent.postMessage({ pluginMessage: { type: 'command-collect-fixes', scope: 'page', options: commandGetOptions() } }, '*');
}

function commandGuidedRunAudit() {
  commandGuidedSetPhase('kwcag', 'command.guidedKwcag');
  parent.postMessage({ pluginMessage: { type: 'command-kwcag-krds-audit', scope: 'page', options: commandGetOptions() } }, '*');
}

function commandGuidedStart() {
  switchTool('command');
  commandScope = 'page';
  const includeOklch = document.getElementById('command-include-oklch-apply');
  if (includeOklch) includeOklch.checked = false;
  commandGuidedSetPhase('refresh', 'command.guidedRefreshing');
  parent.postMessage({ pluginMessage: { type: 'command-refresh', scope: 'page', options: commandGetOptions() } }, '*');
}

function commandGuidedOpenTool(tool) {
  switchTool(tool);
  commandGuidedSetStep(tool, 'active', 'command.guidedInProgress');
  if (tool === 'style') styleParseCurrentMd(false);
  if (tool === 'menu') menuSwitchInput('url');
  if (tool === 'table') tableSwitchTab('unified');
}

function commandGuidedFail() {
  if (commandGuidedPhase !== 'idle' && commandGuidedPhase !== 'done') {
    commandGuidedSetPhase('error', 'command.guidedFailed');
  }
}

document.getElementById('command-refresh-selection').addEventListener('click', () => commandRefresh('selection'));
document.getElementById('command-refresh-page').addEventListener('click', () => commandRefresh('page'));
document.getElementById('command-cancel-scan').addEventListener('click', commandCancelScan);
document.getElementById('command-preview-bindings').addEventListener('click', commandPreviewBindings);
document.getElementById('command-kwcag-krds-audit').addEventListener('click', commandRunKwcagKrdsAudit);
document.getElementById('command-component-qa').addEventListener('click', commandRunComponentQa);
document.getElementById('command-token-governance').addEventListener('click', commandRunTokenGovernance);
document.getElementById('command-apply-bindings').addEventListener('click', commandApplyBindings);
document.getElementById('command-run-smoke-test').addEventListener('click', commandRunSmokeTest);
document.getElementById('command-export-tokens').addEventListener('click', commandExportTokens);
document.getElementById('command-create-report-board').addEventListener('click', commandCreateReportBoard);
document.getElementById('command-open-folder-maker').addEventListener('click', commandOpenFolderMaker);
document.getElementById('command-project-type').addEventListener('change', (event) => commandApplyProjectPreset(event.target.value));
document.getElementById('command-guided-run').addEventListener('click', commandGuidedStart);
document.querySelectorAll('.guided-step[data-tool]').forEach(step => {
  step.addEventListener('click', () => {
    const tool = step.dataset.tool;
    if (tool === 'command') commandGuidedStart();
    else commandGuidedOpenTool(tool);
  });
});

/* ── Auto-Fix section (Task 7): scan + AB batch apply + per-item apply ──
   Reuses the same scope/options helpers as commandRefresh so the fix engine
   sees the identical scope (selection|page) and scan limits as a normal scan.
   Status feedback flows through commandGetBindingList() — same surface every
   other Command Center result uses (no separate setStatus helper exists). */
document.getElementById('fix-scan').addEventListener('click', function () {
  parent.postMessage({ pluginMessage: { type: 'command-collect-fixes', scope: commandScope, options: commandGetOptions() } }, '*');
});
document.getElementById('fix-batch-apply').addEventListener('click', function () {
  parent.postMessage({ pluginMessage: { type: 'command-apply-fixes', tier: 'AB' } }, '*');
});

function commandRenderFixPreview(msg) {
  const counts = msg.counts || {};
  const countsEl = document.getElementById('fix-counts');
  if (countsEl) countsEl.innerHTML = '';
  ['A', 'B', 'C', 'suggestion'].forEach(function (k) {
    if (!counts[k]) return;
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = k + ': ' + counts[k];
    if (countsEl) countsEl.appendChild(chip);
  });
  const batchBtn = document.getElementById('fix-batch-apply');
  if (batchBtn) batchBtn.disabled = !((counts.A || 0) + (counts.B || 0));

  const list = document.getElementById('fix-c-list');
  if (!list) return;
  list.innerHTML = '';
  (msg.items || []).filter(function (it) { return it.tier === 'C' || it.tier === 'C-suggest'; }).forEach(function (it) {
    const li = document.createElement('li');
    const label = document.createElement('span');
    label.className = 'fix-label';
    label.textContent = it.label;
    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.textContent = t('command.fixApplyItem');
    btn.addEventListener('click', function () {
      parent.postMessage({ pluginMessage: { type: 'command-apply-fixes', ids: [it.id] } }, '*');
    });
    li.appendChild(label);
    li.appendChild(btn);
    list.appendChild(li);
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   MODULE: MENU  (data stays Korean — DEFAULT_MENU)
   ═══════════════════════════════════════════════════════════════════════════ */
const DEFAULT_MENU = [
  { name: "인사말",            path: "공제회 소개 > 인사말" },
  { name: "연혁",              path: "공제회 소개 > 연혁" },
  { name: "기관소개",          path: "공제회 소개 > 기관소개" },
  { name: "조직도",            path: "공제회 소개 > 조직도" },
  { name: "오시는 길",         path: "공제회 소개 > 오시는 길" },
  { name: "시도공제회 연락처", path: "공제회 소개 > 시도공제회 연락처" },
  { name: "공제급여",          path: "보상업무 > 공제급여" },
  { name: "학교폭력",          path: "보상업무 > 학교폭력" },
  { name: "상담지원",          path: "보상업무 > 상담지원" },
  { name: "교원보호공제",      path: "보상업무 > 교원보호공제" },
  { name: "여행자공제",        path: "보상업무 > 여행자공제" },
  { name: "소방점검",          path: "학교소방사업 > 소방점검" },
  { name: "소방공사업",        path: "학교소방사업 > 소방공사업" },
  { name: "예방사업 소개",     path: "예방사업 > 예방사업 소개" },
  { name: "예방자료",          path: "예방사업 > 예방자료" },
  { name: "신청하기",          path: "예방사업 > 신청하기" },
  { name: "공지사항",          path: "알림마당 > 공지사항" },
  { name: "자주하는 질문",     path: "알림마당 > 자주하는 질문" },
  { name: "인사채용",          path: "알림마당 > 인사채용" },
  { name: "보상업무",          path: "자료실 > 보상업무" },
  { name: "소방업무",          path: "자료실 > 소방업무" },
];

let menuData = [];
let menuExcludeKeywords = [];
let menuCsvData = null;
let menuLevelCols = [];
let menuSourceName = '';
const MENU_MAX_SOURCE_BYTES = 2 * 1024 * 1024;
const MENU_MAX_ITEMS = 500;

const MENU_SAMPLE_CSV = `1차,2차,3차,4차,url,분류
직무발명제도란?,한눈에 보는 직무발명제도,,,https://kipa.org/ip-job/intro/intro01.jsp,콘텐츠
,개요,,,https://kipa.org/ip-job/intro/intro02.jsp,콘텐츠
,목적 및 취지,,,https://kipa.org/ip-job/intro/intro03.jsp,콘텐츠
,관련 발명진흥법 및 시행령,발명진흥법,,https://kipa.org/ip-job/intro/intro05.jsp,콘텐츠
,,시행령,,https://kipa.org/ip-job/intro/intro05_2.jsp,콘텐츠
도입방법,도입방법 안내,,,https://kipa.org/ip-job/method/method01.jsp,콘텐츠
,신고 · 승계 절차,,,https://kipa.org/ip-job/method/method02.jsp,콘텐츠
,직무발명 권리관계,,,https://kipa.org/ip-job/method/method03.jsp,콘텐츠
,직무발명 보상,,,https://kipa.org/ip-job/method/method04.jsp,콘텐츠
,제도 도입 혜택,,,https://kipa.org/ip-job/method/method05.jsp,콘텐츠
자료실,직무발명제도 영상자료,,,https://kipa.org/ip-job/data/data01.jsp,게시판(동영상)
,직무발명제도 자료,,,https://kipa.org/ip-job/data/data02.jsp,게시판(갤러리)
,직무발명 보상규정 표준모델,,,https://kipa.org/ip-job/data/data03.jsp,게시판(일반)
,국내 · 해외 사례 및 판례,,,https://kipa.org/ip-job/data/data04.jsp,게시판(일반)
,공무원 직무발명제도,,,https://kipa.org/ip-job/data/data06.jsp,게시판(일반)
,직무발명보상 우수기업 인증로고,,,https://kipa.org/ip-job/data09.jsp,게시판(일반)
지원사업 안내,직무발명보상 우수기업 인증제,,,https://kipa.org/ip-job/presentation/presentation01.jsp,콘텐츠
,직무발명제도 컨설팅 프로그램,,,https://kipa.org/ip-job/presentation/presentation02.jsp,콘텐츠
,직무발명제도 설명회,,,https://kipa.org/ip-job/presentation/presentation03.jsp,콘텐츠
,인증유효기업,,,https://kipa.org/ip-job/presentation/presentation05.jsp,게시판(일반)
고객센터,사업공고 및 안내,,,https://kipa.org/ip-job/center/center01.jsp,게시판(일반)
,온라인 상담코너,,,https://kipa.org/ip-job/center/center02.jsp,게시판(Q&A)
,자주 묻는 질문,,,https://kipa.org/ip-job/center/center03.jsp,게시판(FAQ)
,오프라인 상담,,,https://kipa.org/ip-job/center/offline.jsp,콘텐츠`;

function menuSwitchInput(tab) {
  document.getElementById('menu-tab-url').classList.toggle('active', tab === 'url');
  document.getElementById('menu-tab-html').classList.toggle('active', tab === 'html');
  document.getElementById('menu-panel-url').classList.toggle('active', tab === 'url');
  document.getElementById('menu-panel-html').classList.toggle('active', tab === 'html');
}

function menuSetStatus(msg, type = 'idle') {
  const el = document.getElementById('menu-fetch-status');
  el.textContent = msg;
  el.className = 'status ' + type;
}
function menuSetHtmlStatus(msg, type = 'idle') {
  const el = document.getElementById('menu-html-status');
  el.textContent = msg;
  el.className = 'status ' + type;
}

function menuIsExcluded(item) {
  if (!menuExcludeKeywords.length) return false;
  const target = (item.name + ' ' + item.path).toLowerCase();
  return menuExcludeKeywords.some(kw => target.includes(kw.toLowerCase()));
}
function menuAnalyzeData(data) {
  const rows = Array.isArray(data) ? data : [];
  const nameCounts = {};
  const pathCounts = {};
  const summary = {
    total: rows.length,
    duplicateNames: 0,
    duplicatePaths: 0,
    emptyNames: 0,
    deepPaths: 0,
    longNames: 0,
  };
  rows.forEach(item => {
    const name = String((item && item.name) || '').trim();
    const path = String((item && item.path) || '').trim();
    if (!name) summary.emptyNames++;
    if (name.length > 30) summary.longNames++;
    if (path.split('>').map(part => part.trim()).filter(Boolean).length > 4) summary.deepPaths++;
    if (name) nameCounts[name] = (nameCounts[name] || 0) + 1;
    if (path) pathCounts[path] = (pathCounts[path] || 0) + 1;
  });
  summary.duplicateNames = Object.keys(nameCounts).filter(name => nameCounts[name] > 1).length;
  summary.duplicatePaths = Object.keys(pathCounts).filter(path => pathCounts[path] > 1).length;
  return summary;
}
function menuRenderDiagnostics(data) {
  const el = document.getElementById('menu-diagnostics');
  if (!el) return;
  const summary = menuAnalyzeData(data);
  const selected = document.querySelectorAll('.menu-item-check:checked').length;
  const labels = {
    total: t('menu.diagTotal', summary.total),
    selected: t('menu.diagSelected', selected),
    duplicateNames: t('menu.diagDuplicateNames', summary.duplicateNames),
    duplicatePaths: t('menu.diagDuplicatePaths', summary.duplicatePaths),
    emptyNames: t('menu.diagEmptyNames', summary.emptyNames),
    deepPaths: t('menu.diagDeepPaths', summary.deepPaths),
    longNames: t('menu.diagLongNames', summary.longNames),
    clean: t('menu.diagClean'),
  };
  const warnings = [
    ['duplicateNames', summary.duplicateNames],
    ['duplicatePaths', summary.duplicatePaths],
    ['emptyNames', summary.emptyNames],
    ['deepPaths', summary.deepPaths],
    ['longNames', summary.longNames],
  ].filter(([, count]) => count > 0);
  const chips = [
    `<span class="diagnostic-chip">${labels.total}</span>`,
    `<span class="diagnostic-chip">${labels.selected}</span>`,
  ].concat(warnings.length
    ? warnings.map(([key]) => `<span class="diagnostic-chip warn">${labels[key]}</span>`)
    : [`<span class="diagnostic-chip ok">${labels.clean}</span>`]);
  el.innerHTML = chips.join('');
}
function menuRenderFilterTags() {
  document.getElementById('menu-filter-tags').innerHTML = menuExcludeKeywords.map((kw, i) =>
    `<span class="filter-tag">${commandEscape(kw)}<span class="remove" onclick="menuRemoveKeyword(${i})">×</span></span>`
  ).join('');
}
function menuAddKeyword() {
  const input = document.getElementById('menu-filter');
  const kw = input.value.trim();
  if (!kw || menuExcludeKeywords.includes(kw)) { input.value = ''; return; }
  menuExcludeKeywords.push(kw);
  input.value = '';
  menuRenderFilterTags();
  menuApplyKeywordFilter();
}
function menuRemoveKeyword(idx) {
  menuExcludeKeywords.splice(idx, 1);
  menuRenderFilterTags();
  menuApplyKeywordFilter();
}
function menuApplyKeywordFilter() {
  document.querySelectorAll('.menu-item-check').forEach(cb => {
    const idx = parseInt(cb.dataset.index);
    const item = menuData[idx];
    if (!item) return;
    cb.checked = !menuIsExcluded(item);
  });
  menuUpdateCount();
}
function menuGetChecked() {
  return [...document.querySelectorAll('.menu-item-check')]
    .filter(cb => cb.checked)
    .map(cb => menuData[parseInt(cb.dataset.index)]);
}
function menuUpdateCount() {
  const all = [...document.querySelectorAll('.menu-item-check')];
  const checked = all.filter(cb => cb.checked).length;
  document.getElementById('menu-count').textContent =
    all.length ? t('menu.count', all.length, checked) : t('menu.total', 0);
  document.getElementById('menu-generate').disabled = checked === 0;
  document.querySelectorAll('label.menu-item').forEach(item => {
    const cb = item.querySelector('.menu-item-check');
    if (cb) item.classList.toggle('excluded', !cb.checked);
  });
  menuRenderDiagnostics(menuData);
}
function menuToggleAll(checked) {
  document.querySelectorAll('.menu-item-check').forEach(cb => { cb.checked = checked; });
  menuUpdateCount();
}

function parseMenuFromHTML(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const out = [];
  function getLinkText(el) {
    const clone = el.cloneNode(true);
    clone.querySelectorAll('.blind, .sr-only, .hidden, .ico, .icon, img, em').forEach(e => e.remove());
    return clone.textContent.trim().replace(/\s+/g, ' ');
  }
  function getAnchor(li) {
    return li.querySelector(':scope > a')
      || li.querySelector(':scope > strong > a')
      || li.querySelector(':scope > span > a')
      || li.querySelector(':scope > div > a')
      || li.querySelector(':scope > p > a');
  }
  function findSubUl(li) {
    const direct = li.querySelector(':scope > ul');
    if (direct && direct.querySelectorAll(':scope > li').length > 0) return direct;
    for (const child of li.children) {
      if (/^(DIV|SECTION|ARTICLE|NAV)$/.test(child.tagName)) {
        const ul = child.querySelector(':scope > ul') || child.querySelector('ul');
        if (ul && ul.querySelectorAll('li').length > 0) return ul;
      }
    }
    return null;
  }
  const selectors = [
    '#gnb', '.gnb', '#gnb-wrap', '.gnb-wrap', '#gnbWrap', '.gnbWrap',
    '#nav', '.nav', '#topnav', '.topnav', '#top-nav', '.top-nav',
    '#header-nav', '.header-nav', '#lnb', '.lnb',
    '#navigation', '.navigation', '#main-nav', '.main-nav',
    '#menu', '.menu', 'header nav', 'nav',
  ];
  let navRoot = null;
  for (const sel of selectors) {
    const el = doc.querySelector(sel);
    if (el && el.querySelectorAll('li').length >= 3) { navRoot = el; break; }
  }
  if (!navRoot) {
    let best = null, bestCount = 0;
    doc.querySelectorAll('ul').forEach(ul => {
      const cnt = ul.querySelectorAll('li').length;
      if (cnt > bestCount && cnt < 200) { bestCount = cnt; best = ul; }
    });
    navRoot = best;
  }
  if (!navRoot) return null;

  function extractItems(ul, pathParts) {
    ul.querySelectorAll(':scope > li').forEach(li => {
      const a = getAnchor(li);
      if (!a) return;
      const name = getLinkText(a);
      if (!name || name.length > 50) return;
      const newPath = [...pathParts, name];
      const subUl = findSubUl(li);
      if (subUl) {
        extractItems(subUl, newPath);
      } else {
        out.push({ name, path: newPath.join(' > ') });
      }
    });
  }
  const topUl = navRoot.tagName === 'UL' ? navRoot : navRoot.querySelector('ul');
  if (topUl) extractItems(topUl, []);
  return out.length > 0 ? out : null;
}

function menuApplyData(data) {
  menuData = data.slice(0, MENU_MAX_ITEMS);
  menuRenderList(menuData);
  menuApplyKeywordFilter();
}
function menuRenderList(data) {
  const sectionMap = {};
  data.forEach((m, idx) => {
    const sec = m.path.split(' > ')[0];
    if (!sectionMap[sec]) sectionMap[sec] = [];
    sectionMap[sec].push({ ...m, originalIndex: idx });
  });
  let html = '';
  for (const [sec, items] of Object.entries(sectionMap)) {
    html += `<div class="menu-group-label">${commandEscape(sec)}</div>`;
    items.forEach(m => {
      html += `
        <label class="menu-item">
          <input type="checkbox" class="menu-item-check" data-index="${m.originalIndex}" checked onchange="menuUpdateCount()">
          <span class="menu-name">${commandEscape(m.name)}</span>
          <span class="menu-path">${commandEscape(m.path)}</span>
        </label>`;
    });
  }
  document.getElementById('menu-list').innerHTML =
    html || `<div style="color:#555;text-align:center;padding:20px 0;">${t('menu.emptyParsed')}</div>`;
}
function menuShowResult(msg, type) {
  const el = document.getElementById('menu-result');
  el.textContent = msg;
  el.className = 'result ' + type;
  el.style.display = 'block';
}

/* ── CSV parsing (menu) ── */
function menuParseCSVRow(line) {
  const result = []; let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { if (inQ && line[i + 1] === '"') { cur += '"'; i++; } else { inQ = !inQ; } }
    else if (c === ',' && !inQ) { result.push(cur.trim()); cur = ''; }
    else { cur += c; }
  }
  result.push(cur.trim()); return result;
}
function menuParseCSV(text) {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim());
  if (lines.length < 2) return null;
  const headers = menuParseCSVRow(lines[0]);
  const rows = lines.slice(1).map(l => {
    const vals = menuParseCSVRow(l);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (vals[i] || '').trim(); });
    return obj;
  }).filter(r => Object.values(r).some(v => v));
  return { headers, rows };
}
function menuDetectCol(headers, patterns) {
  return headers.find(h => patterns.some(p => h.toLowerCase().includes(p.toLowerCase()))) || '';
}
function menuDetectLevelCols(headers) {
  const cols = [];
  for (let n = 1; n <= 5; n++) {
    const col = headers.find(h => h.includes(`${n}차`) || h.toLowerCase() === `level${n}` || h === `${n}단계`);
    if (col) cols.push(col);
  }
  return cols;
}
function menuFillSelectOptions(id, headers, includeNone = false) {
  const sel = document.getElementById(id);
  sel.innerHTML = (includeNone ? '<option value="">--</option>' : '')
    + headers.map(h => `<option value="${commandEscape(h)}">${commandEscape(h)}</option>`).join('');
}
function menuRenderCatChips(rows, categoryCol) {
  const el = document.getElementById('menu-cat-chips');
  if (!categoryCol) { el.innerHTML = `<span style="font-size:11px;color:#555">${t('menu.noCategoryCol')}</span>`; return; }
  const values = [...new Set(rows.map(r => r[categoryCol]).filter(v => v))].sort();
  const defaultOn = ['콘텐츠', '컨텐츠', 'content'];
  el.innerHTML = values.map(v => {
    const count = rows.filter(r => r[categoryCol] === v).length;
    const checked = defaultOn.some(d => v.toLowerCase().includes(d)) ? 'checked' : '';
    const safeValue = commandEscape(v);
    return `<div class="cat-chip">
      <input type="checkbox" id="menu-cat_${safeValue}" value="${safeValue}" ${checked}>
      <label for="menu-cat_${safeValue}">${safeValue} (${count})</label>
    </div>`;
  }).join('');
}
function menuUpdatePathMode() {
  document.getElementById('menu-path-col-row').style.display =
    document.getElementById('menu-path-mode').value === 'single' ? 'flex' : 'none';
}
function menuFillDownLevelCols(rows, cols) {
  const lastVals = {};
  cols.forEach(c => lastVals[c] = '');
  return rows.map(row => {
    const newRow = { ...row };
    let lowestIdx = cols.length;
    cols.forEach((c, i) => { if (row[c] && row[c].trim() && i < lowestIdx) lowestIdx = i; });
    if (lowestIdx < cols.length) {
      for (let i = lowestIdx + 1; i < cols.length; i++) {
        if (!row[cols[i]] || !row[cols[i]].trim()) lastVals[cols[i]] = '';
      }
    }
    cols.forEach(c => {
      if (row[c] && row[c].trim()) { lastVals[c] = row[c]; newRow[c] = row[c]; }
      else { newRow[c] = lastVals[c]; }
    });
    return newRow;
  });
}
function menuBuildFromCSV() {
  if (!menuCsvData) return [];
  const categoryCol = document.getElementById('menu-category-col').value;
  const pathMode = document.getElementById('menu-path-mode').value;
  const pathCol = document.getElementById('menu-path-col').value;
  const selectedCats = [...document.querySelectorAll('#menu-cat-chips input:checked')].map(cb => cb.value);
  let rows = menuCsvData.rows;
  if (pathMode === 'levels' && menuLevelCols.length > 0) {
    rows = menuFillDownLevelCols(rows, menuLevelCols);
  }
  if (categoryCol && selectedCats.length > 0) {
    rows = rows.filter(r => selectedCats.includes(r[categoryCol]));
  }
  return rows.map(row => {
    let name, path;
    if (pathMode === 'levels' && menuLevelCols.length > 0) {
      const filled = menuLevelCols.map(c => row[c]).filter(v => v && v.trim());
      if (filled.length === 0) return null;
      name = filled[filled.length - 1];
      path = filled.join(' > ');
    } else if (pathMode === 'single' && pathCol && row[pathCol]) {
      name = row[document.getElementById('menu-name-col').value] || '';
      path = row[pathCol];
    } else {
      name = row[document.getElementById('menu-name-col').value] || '';
      path = name;
    }
    if (!name) return null;
    return { name, path };
  }).filter(Boolean);
}
function menuApplyParsedCSV(parsed, fileName) {
  menuCsvData = parsed;
  if (!menuCsvData) { alert(t('menu.csvFail')); return false; }
  menuCsvData.rows = menuCsvData.rows.slice(0, MENU_MAX_ITEMS);
  menuLevelCols = menuDetectLevelCols(menuCsvData.headers);
  menuFillSelectOptions('menu-name-col', menuCsvData.headers);
  menuFillSelectOptions('menu-path-col', menuCsvData.headers, true);
  menuFillSelectOptions('menu-category-col', menuCsvData.headers, true);
  document.getElementById('menu-name-col').value = menuDetectCol(menuCsvData.headers, ['메뉴명', '메뉴', '페이지명', '페이지', 'name', 'menu']);
  document.getElementById('menu-category-col').value = menuDetectCol(menuCsvData.headers, ['분류', '유형', '타입', '구분', 'type', 'category']);
  menuRenderCatChips(menuCsvData.rows, document.getElementById('menu-category-col').value);
  document.getElementById('menu-mapping').style.display = 'block';
  if (fileName) document.getElementById('menu-csv-name').textContent = fileName;
  menuSourceName = fileName || '';
  return true;
}
function menuLoadCSVFile(file) {
  if (file.size > MENU_MAX_SOURCE_BYTES) {
    menuSetStatus(t('menu.fetchFail'), 'error');
    return;
  }
  const encoding = document.getElementById('menu-encoding').value;
  const reader = new FileReader();
  reader.onload = (ev) => {
    menuApplyParsedCSV(menuParseCSV(ev.target.result), file.name);
  };
  reader.readAsText(file, encoding);
}
function menuToggleExcel() {
  const sec = document.getElementById('menu-excel-section');
  const isOpen = sec.style.display !== 'none';
  sec.style.display = isOpen ? 'none' : 'block';
  document.getElementById('menu-excel-toggle').textContent =
    isOpen ? t('menu.excelToggleCollapsed') : t('menu.excelToggleExpanded');
}

/* ── Menu events ── */
document.getElementById('menu-fetch').addEventListener('click', async () => {
  const url = document.getElementById('menu-url').value.trim();
  if (!url) return;
  const btn = document.getElementById('menu-fetch');
  btn.disabled = true;
  menuSetStatus(t('menu.fetching'));
  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') throw new Error('Unsupported URL protocol');
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const declaredLength = Number(res.headers.get('content-length') || 0);
    if (declaredLength > MENU_MAX_SOURCE_BYTES) throw new Error('Response too large');
    const html = await res.text();
    if (html.length > MENU_MAX_SOURCE_BYTES) throw new Error('Response too large');
    const parsed = parseMenuFromHTML(html);
    if (parsed && parsed.length > 0) {
      menuSourceName = url;
      menuApplyData(parsed);
      menuSetStatus(t('menu.fetchOk', parsed.length), 'ok');
    } else {
      menuSetStatus(t('menu.fetchFail'), 'error');
      menuSwitchInput('html');
    }
  } catch (e) {
    menuSetStatus(t('menu.cors'), 'error');
    menuSwitchInput('html');
  } finally {
    btn.disabled = false;
  }
});
document.getElementById('menu-parse').addEventListener('click', () => {
  const html = document.getElementById('menu-html-input').value.trim();
  if (!html) { menuSetHtmlStatus(t('menu.htmlEmpty'), 'error'); return; }
  if (html.length > MENU_MAX_SOURCE_BYTES) { menuSetHtmlStatus(t('menu.fetchFail'), 'error'); return; }
  const parsed = parseMenuFromHTML(html);
  if (parsed && parsed.length > 0) {
    menuSourceName = 'html-source';
    menuApplyData(parsed);
    menuSetHtmlStatus(t('menu.parseOk', parsed.length), 'ok');
  } else {
    menuSetHtmlStatus(t('menu.parseFail'), 'error');
    menuApplyData(DEFAULT_MENU);
  }
});
document.getElementById('menu-csv-file').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  document.getElementById('menu-csv-name').textContent = file.name;
  menuLoadCSVFile(file);
});
document.getElementById('menu-sample-csv').addEventListener('click', () => {
  const applied = menuApplyParsedCSV(menuParseCSV(MENU_SAMPLE_CSV), '메뉴샘플.csv');
  if (!applied) return;
  const data = menuBuildFromCSV();
  menuApplyData(data);
  menuSetStatus(t('menu.csvOk', data.length), 'ok');
});
document.getElementById('menu-encoding').addEventListener('change', () => {
  const input = document.getElementById('menu-csv-file');
  if (input.files[0]) menuLoadCSVFile(input.files[0]);
});
document.getElementById('menu-category-col').addEventListener('change', () => {
  if (menuCsvData) menuRenderCatChips(menuCsvData.rows, document.getElementById('menu-category-col').value);
});
document.getElementById('menu-path-mode').addEventListener('change', menuUpdatePathMode);
document.getElementById('menu-apply-csv').addEventListener('click', () => {
  const data = menuBuildFromCSV();
  if (data.length === 0) { alert(t('menu.csvNoCategory')); return; }
  menuApplyData(data);
  menuSetStatus(t('menu.csvOk', data.length), 'ok');
  document.getElementById('menu-excel-section').style.display = 'none';
  document.getElementById('menu-excel-toggle').textContent = t('menu.excelToggleCollapsed');
});
document.getElementById('menu-filter-add').addEventListener('click', menuAddKeyword);
document.getElementById('menu-filter').addEventListener('keydown', (e) => { if (e.key === 'Enter') menuAddKeyword(); });
document.getElementById('menu-register-template').addEventListener('click', () => {
  parent.postMessage({ pluginMessage: { type: 'menu-register-template' } }, '*');
});
document.getElementById('menu-generate').addEventListener('click', () => {
  const selected = menuGetChecked();
  if (selected.length === 0) return;
  const selectedCategories = [...document.querySelectorAll('#menu-cat-chips input:checked')].map(cb => cb.value);
  const diagnostics = menuAnalyzeData(selected);
  diagnostics.warningCount = diagnostics.duplicateNames
    + diagnostics.duplicatePaths
    + diagnostics.emptyNames
    + diagnostics.deepPaths
    + diagnostics.longNames;
  document.getElementById('menu-generate').disabled = true;
  document.getElementById('menu-result').style.display = 'none';
  document.getElementById('menu-progress-wrap').style.display = 'block';
  document.getElementById('menu-progress-bar').value = 0;
  document.getElementById('menu-progress-label').textContent = t('menu.starting');
  parent.postMessage({
    pluginMessage: {
      type: 'menu-generate',
      menuData: selected,
      meta: {
        sourceName: menuSourceName || 'manual',
        selectedCategories,
        rowCount: menuCsvData ? menuCsvData.rows.length : selected.length,
        selectedCount: selected.length,
        diagnostics,
      },
    }
  }, '*');
});
document.getElementById('menu-cancel').addEventListener('click', () => {
  parent.postMessage({ pluginMessage: { type: 'cancel' } }, '*');
});

/* ═══════════════════════════════════════════════════════════════════════════
   MODULE: STYLE GUIDE
   ═══════════════════════════════════════════════════════════════════════════ */
const STYLE_GUIDE_VIEWER_MD = `# 스타일 가이드

[Pretendard]

## Colors

- **Brand Colors**: Primary(\`#7426EB\`), Secondary(\`#0B204B\`), Accent(\`#FAB937\`)
- **Semantic/Danger**: Base(\`#DE3412\`), BG(\`#FDEFEC\`), Line(\`#FCDFD9\`), Text(\`#BD2C0F\`)
- **Semantic/Warning**: Base(\`#9E6A00\`), BG(\`#FFF3DB\`), Line(\`#FFE0A3\`), Text(\`#8A5C00\`)
- **Semantic/Success**: Base(\`#228738\`), BG(\`#EAF6EC\`), Line(\`#D8EEDD\`), Text(\`#267337\`)
- **Semantic/Info**: Base(\`#0B78CB\`), BG(\`#E7F4FE\`), Line(\`#D3EBFD\`), Text(\`#096AB3\`)

## Typography

- **Sizes**: 본문(18px/400), 본문강조(20px/600), 타이틀1(40px/800), 타이틀2(32px/700), 타이틀3(24px/700), 최소 텍스트(16px/400)

## Spacing & Radius

- **Spacing (여백)**: 최소 단위 2px, 4px / 기본 단위 8px ~ 120px (8의 배수)
- **Radius (둥글기)**: 최소 단위 2px, 4px / 기본 단위 8px ~ 40px (8의 배수) / 최대 단위 99999px

## Button

- **Sizes**: S(40px/17px/400), M(48px/18px/600), L(56px/18px/800)
- **Types**: Primary, Secondary, Gray
- **States**: Default, Hover, Disabled
- **Radius**: 6px
- **Icon Sizes**: S(18px), M(24px), L(24px)

## Input

- **Sizes**: S(40px/17px/400), M(48px/18px/600)
- **Width**: 280px
- **Radius**: 6px
- **States**: Default, Hover, Focus, Disabled
- **Contents**: Placeholder, Value`;

function hexToHsl(hex) {
  const h = hex.replace('#', '');
  let r = parseInt(h.slice(0, 2), 16) / 255, g = parseInt(h.slice(2, 4), 16) / 255, b = parseInt(h.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let hh, s, l = (max + min) / 2;
  if (max === min) { hh = s = 0; }
  else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: hh = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: hh = ((b - r) / d + 2) / 6; break;
      case b: hh = ((r - g) / d + 4) / 6; break;
    }
  }
  return { h: hh * 360, s: s * 100, l: l * 100 };
}
function hslToHex(h, s, l) {
  h /= 360; s /= 100; l /= 100;
  let r, g, b;
  if (s === 0) { r = g = b = l; }
  else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    const hue2 = (tt) => {
      if (tt < 0) tt += 1; if (tt > 1) tt -= 1;
      if (tt < 1 / 6) return p + (q - p) * 6 * tt;
      if (tt < 1 / 2) return q;
      if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
      return p;
    };
    r = hue2(h + 1 / 3); g = hue2(h); b = hue2(h - 1 / 3);
  }
  const x = v => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0');
  return '#' + x(r) + x(g) + x(b);
}
const STEPS = [5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 100];
function generateColorScale(baseHex) {
  const { h, s, l } = hexToHsl(baseHex);
  const scale = {};
  STEPS.forEach(step => {
    let newL, newS;
    if (step === 50) { newL = l; newS = s; }
    else if (step < 50) { const tt = (50 - step) / 50; newL = l + (97 - l) * tt; newS = s * (1 - tt * 0.85); }
    else { const tt = (step - 50) / 50; newL = l * (1 - tt * 0.88); newS = s * (1 - tt * 0.3); }
    scale[step] = hslToHex(h, Math.max(0, Math.min(100, newS)), Math.max(0, Math.min(100, newL)));
  });
  return scale;
}
function generateGrayScale() {
  const scale = {};
  const ls = { 5: 95, 10: 91, 20: 82, 30: 69, 40: 56, 50: 44, 60: 34, 70: 24, 80: 16, 90: 10, 95: 7, 100: 4 };
  STEPS.forEach(step => { scale[step] = hslToHex(220, 6, ls[step]); });
  return scale;
}
function generateSemanticVariants(baseHex) {
  const { h, s, l } = hexToHsl(baseHex);
  return {
    base: baseHex,
    background: hslToHex(h, Math.min(s * 0.18, 100), 96),
    line: hslToHex(h, Math.min(s * 0.45, 100), 84),
    text: hslToHex(h, Math.min(s * 0.9, 100), Math.max(l * 0.55, 18)),
  };
}

function parseMD(text) {
  const result = { brandColors: {}, semanticColors: {}, spacing: [], radius: [], fontFamily: null };
  const colorPat = /([A-Za-z][\w]*(?:\/[\w]+)*)\(`#([A-Fa-f0-9]{6})`\)/g;
  const fontMatch = text.match(/^\[([^\]]+)\]/m);
  if (fontMatch) result.fontFamily = fontMatch[1].trim();
  let section = '';
  text.split('\n').forEach(line => {
    if (/^##\s/.test(line)) { section = line.replace(/^#+\s*/, '').trim().toLowerCase(); return; }
    colorPat.lastIndex = 0;
    if (line.match(/Brand\s*Colors?/i)) {
      let m; while ((m = colorPat.exec(line)) !== null) result.brandColors[m[1]] = '#' + m[2];
    } else if (/\*\*Semantic\/(\w+)\*\*/.test(line)) {
      const nameMatch = line.match(/\*\*Semantic\/(\w+)\*\*/);
      const semKey = 'Semantic/' + nameMatch[1];
      const varMap = { base: 'base', bg: 'background', line: 'line', text: 'text' };
      colorPat.lastIndex = 0; let m; const variants = {};
      while ((m = colorPat.exec(line)) !== null) { const vk = varMap[m[1].toLowerCase()]; if (vk) variants[vk] = '#' + m[2]; }
      if (Object.keys(variants).length > 0) result.semanticColors[semKey] = variants;
    } else if (line.match(/Semantic/i) && line.includes('#')) {
      colorPat.lastIndex = 0; let m;
      while ((m = colorPat.exec(line)) !== null) result.semanticColors[m[1]] = '#' + m[2];
    } else if (line.match(/Spacing|여백/) && line.includes('최소 단위')) {
      const m = line.match(/최소 단위 (\d+)px,\s*(\d+)px.*?기본 단위 (\d+)px\s*~\s*(\d+)px.*?(\d+)의 배수/);
      if (m) { result.spacing.push(+m[1], +m[2]); for (let v = +m[3]; v <= +m[4]; v += +m[5]) result.spacing.push(v); }
      const maxS = line.match(/최대 단위 (\d+)px/); if (maxS) result.spacing.push(+maxS[1]);
    } else if (line.match(/Radius|둥글기/) && line.includes('최소 단위')) {
      const m = line.match(/최소 단위 (\d+)px,\s*(\d+)px.*?기본 단위 (\d+)px\s*~\s*(\d+)px.*?(\d+)의 배수/);
      if (m) { result.radius.push(+m[1], +m[2]); for (let v = +m[3]; v <= +m[4]; v += +m[5]) result.radius.push(v); }
      const maxR = line.match(/최대 단위 (\d+)px/); if (maxR) result.radius.push(+maxR[1]);
    } else if (/Sizes/i.test(line) && line.includes('px/') && section === 'typography') {
      const sizePart = line.replace(/.*Sizes[^:]*:\s*/i, '');
      const sizeMatches = [...sizePart.matchAll(/([가-힣a-zA-Z][가-힣a-zA-Z0-9\s]*?)\s*\((\d+)px\/(\d+)\)/g)];
      if (sizeMatches.length) result.typeSizes = sizeMatches.map(m => ({ name: m[1].trim(), size: +m[2], weight: +m[3] }));
    }
    if (section === 'button') {
      if (/Sizes/i.test(line) && line.includes('px')) {
        const m3 = [...line.matchAll(/([A-Za-z]+)\((\d+)px\/(\d+)px\/(\d+)\)/g)];
        if (m3.length) result.buttonSizes = m3.map(m => ({ name: m[1], h: +m[2], fs: +m[3], fw: +m[4] }));
        else {
          const m2 = [...line.matchAll(/([A-Za-z]+)\((\d+)px\/(\d+)px\)/g)];
          if (m2.length) result.buttonSizes = m2.map(m => ({ name: m[1], h: +m[2], fs: null, fw: 400 }));
        }
      } else if (/\bTypes\b/i.test(line)) { result.buttonTypes = line.replace(/.*Types[^:]*:\s*/i, '').split(',').map(s => s.trim()).filter(Boolean); }
      else if (/\bStates\b/i.test(line)) { result.buttonStates = line.replace(/.*States[^:]*:\s*/i, '').split(',').map(s => s.trim()).filter(Boolean); }
      else if (/\bRadius\b/i.test(line)) { const m = line.match(/(\d+)px/); if (m) result.buttonRadius = +m[1]; }
      else if (/\bIcon\s*Sizes\b/i.test(line)) { const ms = [...line.matchAll(/([A-Za-z]+)\((\d+)px\)/g)]; if (ms.length) result.buttonIconSizes = ms.reduce((o, m) => { o[m[1]] = +m[2]; return o; }, {}); }
    }
    if (section === 'input') {
      if (/\bSizes\b/i.test(line)) {
        const m3 = [...line.matchAll(/([A-Za-z]+)\((\d+)px\/(\d+)px\/(\d+)\)/g)];
        if (m3.length) result.inputSizes = m3.map(m => ({ name: m[1], h: +m[2], fs: +m[3], fw: +m[4] }));
        else { const m1 = [...line.matchAll(/([A-Za-z]+)\((\d+)px\)/g)]; if (m1.length) result.inputSizes = m1.map(m => ({ name: m[1], h: +m[2], fs: null, fw: 400 })); }
      } else if (/\bHeight\b/i.test(line)) { const m = line.match(/(\d+)px/); if (m) result.inputHeight = +m[1]; }
      else if (/\bWidth\b/i.test(line)) { const m = line.match(/(\d+)px/); if (m) result.inputWidth = +m[1]; }
      else if (/\bRadius\b/i.test(line)) { const m = line.match(/(\d+)px/); if (m) result.inputRadius = +m[1]; }
      else if (/\bStates\b/i.test(line)) { result.inputStates = line.replace(/.*States[^:]*:\s*/i, '').split(',').map(s => s.trim()).filter(Boolean); }
      else if (/\bContents\b/i.test(line)) { result.inputContents = line.replace(/.*Contents[^:]*:\s*/i, '').split(',').map(s => s.trim()).filter(Boolean); }
    }
  });
  return result;
}

function renderSwatchRow(name, scale) {
  const swatches = STEPS.map(step => {
    const isBase = step === 50;
    return `<div class="swatch${isBase ? ' base-mark' : ''}" style="background:${scale[step]}" data-tip="${step}: ${scale[step]}"></div>`;
  }).join('');
  return `<div class="color-row"><span class="color-name">${name}</span><div class="swatches">${swatches}</div></div>`;
}
function renderStylePreview(parsed, processed) {
  document.getElementById('style-brand-prev').innerHTML =
    Object.entries(processed.brand).map(([name, d]) => renderSwatchRow(name, d.scale)).join('');
  document.getElementById('style-gray-prev').innerHTML = renderSwatchRow('Gray', processed.gray.scale);
  document.getElementById('style-semantic-prev').innerHTML =
    Object.entries(processed.semantic).map(([name, v]) => `
      <div class="semantic-row">
        <span class="semantic-name">${name}</span>
        <div class="semantic-chips">
          ${Object.entries(v).map(([k, hex]) => `
            <div class="semantic-chip">
              <div class="semantic-swatch" style="background:${hex}"></div>
              <span class="semantic-chip-label">${{ base: 'Base', background: 'BG', line: 'Line', text: 'Text' }[k] || k}</span>
            </div>`).join('')}
        </div>
      </div>`).join('');
  document.getElementById('style-spacing-prev').innerHTML = parsed.spacing.map(v => `<span class="chip">${v}</span>`).join('');
  document.getElementById('style-radius-prev').innerHTML = parsed.radius.map(v => `<span class="chip">${v}</span>`).join('');
}

let styleProcessed = null;
let styleSelectedFont = null;
let styleLastFile = null;
let styleFontSearchSeq = 0;

function styleHashText(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  return Math.abs(hash).toString(16);
}

function styleBuildMeta() {
  const md = document.getElementById('style-md').value || '';
  return {
    styleMdHash: styleHashText(md),
    styleMdLength: md.length,
    fontFamily: styleProcessed && styleProcessed.fontFamily,
  };
}

function styleProcessData(parsed) {
  const brand = {};
  for (const [name, hex] of Object.entries(parsed.brandColors)) brand[name] = { hex, scale: generateColorScale(hex) };
  const semantic = {};
  for (const [name, val] of Object.entries(parsed.semanticColors)) {
    semantic[name] = (typeof val === 'object') ? val : generateSemanticVariants(val);
  }
  let total = 0;
  for (const d of Object.values(brand)) total += Object.keys(d.scale).length;
  total += STEPS.length;
  for (const v of Object.values(semantic)) total += Object.keys(v).length;
  total += parsed.spacing.length + parsed.radius.length;
  return {
    brand, semantic, gray: { scale: generateGrayScale() },
    spacing: parsed.spacing, radius: parsed.radius, total,
    fontFamily: parsed.fontFamily || null, typeSizes: parsed.typeSizes || null,
    buttonSizes: parsed.buttonSizes || null, buttonTypes: parsed.buttonTypes || null,
    buttonStates: parsed.buttonStates || null, buttonRadius: parsed.buttonRadius || null,
    buttonIconSizes: parsed.buttonIconSizes || null,
    inputSizes: parsed.inputSizes || null, inputHeight: parsed.inputHeight || null,
    inputWidth: parsed.inputWidth || null, inputRadius: parsed.inputRadius || null,
    inputStates: parsed.inputStates || null, inputContents: parsed.inputContents || null,
  };
}

function styleApplyFont(fam) {
  styleSelectedFont = fam;
  document.getElementById('style-font-input').value = fam;
  document.getElementById('style-font-label').textContent = t('style.fontSel', fam);
  if (styleProcessed) styleProcessed.fontFamily = fam;
  document.querySelectorAll('.font-result-item').forEach(el => el.classList.toggle('active', el.dataset.fam === fam));
}

function styleRenderFontSearching() {
  const container = document.getElementById('style-font-results');
  container.title = '';
  container.innerHTML = `<div class="font-result-item" style="color:#555;cursor:default">${t('style.searching')}</div>`;
}

function styleRenderFontResults(families, cached) {
  const container = document.getElementById('style-font-results');
  container.title = cached ? t('style.searchCached') : '';
  if (!families.length) {
    container.innerHTML = `<div class="font-result-item" style="color:#555;cursor:default">${t('style.noResult')}</div>`;
    return;
  }
  container.innerHTML = families.map(fam =>
    `<div class="font-result-item${styleSelectedFont === fam ? ' active' : ''}" data-fam="${commandEscape(fam)}">${commandEscape(fam)}</div>`
  ).join('');
  container.querySelectorAll('.font-result-item[data-fam]').forEach(el => {
    el.addEventListener('click', () => styleApplyFont(el.dataset.fam));
  });
}

function styleParseCurrentMd(showLoadedMessage = false) {
  const text = document.getElementById('style-md').value.trim();
  if (!text) { alert(t('style.mdEmpty')); return false; }
  const parsed = parseMD(text);
  const brandCount = Object.keys(parsed.brandColors).length;
  const semanticCount = Object.keys(parsed.semanticColors).length;
  if (brandCount === 0 && semanticCount === 0) { alert(t('style.noColor')); return false; }
  styleProcessed = styleProcessData(parsed);
  renderStylePreview(parsed, styleProcessed);
  if (styleProcessed.fontFamily && !styleSelectedFont) styleApplyFont(styleProcessed.fontFamily);
  document.getElementById('style-preview').style.display = 'flex';
  document.getElementById('style-gen-section').style.display = 'block';
  const fontInfo = styleProcessed.fontFamily ? t('style.summaryFont', styleProcessed.fontFamily) : '';
  document.getElementById('style-summary').textContent =
    t('style.summary', styleProcessed.total, brandCount, semanticCount, parsed.spacing.length, parsed.radius.length) + fontInfo;
  const result = document.getElementById('style-result');
  result.style.display = showLoadedMessage ? 'block' : 'none';
  if (showLoadedMessage) result.textContent = t('style.sampleLoaded');
  return true;
}

function styleLoadEmbeddedMd() {
  document.getElementById('style-md').value = STYLE_GUIDE_VIEWER_MD;
  const label = document.getElementById('style-file-name');
  label.textContent = 'style-guide-viewer_ver2.md';
  label.style.display = 'block';
  styleLastFile = null;
  document.getElementById('style-reload').style.display = 'none';
  styleParseCurrentMd(true);
}

function styleRenderImportedData(data, sourceName, md) {
  if (!data || !data.brand || !data.semantic || !data.gray) throw new Error('Invalid style token JSON');
  styleProcessed = data;
  if (data.fontFamily) styleApplyFont(data.fontFamily);
  if (md) document.getElementById('style-md').value = md;
  renderStylePreview({ spacing: data.spacing || [], radius: data.radius || [] }, data);
  document.getElementById('style-preview').style.display = 'flex';
  document.getElementById('style-gen-section').style.display = 'block';
  const brandCount = Object.keys(data.brand || {}).length;
  const semanticCount = Object.keys(data.semantic || {}).length;
  const fontInfo = data.fontFamily ? t('style.summaryFont', data.fontFamily) : '';
  document.getElementById('style-summary').textContent =
    t('style.summary', data.total || 0, brandCount, semanticCount, (data.spacing || []).length, (data.radius || []).length) + fontInfo;
  const label = document.getElementById('style-file-name');
  label.textContent = sourceName || 'style-guide-viewer_ver2.tokens.json';
  label.style.display = 'block';
  const result = document.getElementById('style-result');
  result.style.display = 'block';
  result.textContent = t('style.jsonImported');
}

function styleImportJsonFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const payload = JSON.parse(ev.target.result);
      styleRenderImportedData(payload.data || payload, file.name, payload.md || '');
    } catch (err) {
      alert(t('style.jsonImportFail'));
    }
  };
  reader.readAsText(file);
}

function styleDownloadText(filename, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

document.getElementById('style-font-search').addEventListener('click', () => {
  const q = document.getElementById('style-font-input').value.trim();
  styleFontSearchSeq++;
  styleRenderFontSearching();
  parent.postMessage({ pluginMessage: { type: 'style-search-fonts', query: q, requestId: styleFontSearchSeq } }, '*');
});
document.getElementById('style-font-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') document.getElementById('style-font-search').click(); });

function styleLoadMdFile(file) {
  if (!file) return;
  styleLastFile = file;
  const reader = new FileReader();
  reader.onload = (ev) => {
    document.getElementById('style-md').value = ev.target.result;
    const label = document.getElementById('style-file-name');
    label.textContent = '📄 ' + file.name;
    label.style.display = 'block';
    document.getElementById('style-reload').style.display = 'inline-block';
    document.getElementById('style-parse').click();
  };
  reader.readAsText(file, 'UTF-8');
}
document.getElementById('style-file-input').addEventListener('change', (e) => styleLoadMdFile(e.target.files[0]));
document.getElementById('style-json-input').addEventListener('change', (e) => styleImportJsonFile(e.target.files[0]));
document.getElementById('style-reload').addEventListener('click', () => { if (styleLastFile) styleLoadMdFile(styleLastFile); });
document.getElementById('style-load-sample').addEventListener('click', styleLoadEmbeddedMd);
document.getElementById('style-export-md').addEventListener('click', () => {
  const md = document.getElementById('style-md').value || STYLE_GUIDE_VIEWER_MD;
  styleDownloadText('style-guide-viewer_ver2.md', md, 'text/markdown;charset=utf-8');
});
document.getElementById('style-export-json').addEventListener('click', () => {
  if (!styleProcessed && !styleParseCurrentMd(false)) { alert(t('style.exportNeedParse')); return; }
  const payload = {
    sourceName: 'style-guide-viewer_ver2.md',
    md: document.getElementById('style-md').value || STYLE_GUIDE_VIEWER_MD,
    meta: styleBuildMeta(),
    data: styleProcessed,
  };
  styleDownloadText('style-guide-viewer_ver2.tokens.json', JSON.stringify(payload, null, 2), 'application/json;charset=utf-8');
});

document.getElementById('style-parse').addEventListener('click', () => {
  styleParseCurrentMd(false);
});
document.getElementById('style-generate').addEventListener('click', () => {
  if (!styleProcessed) return;
  document.getElementById('style-generate').disabled = true;
  document.getElementById('style-result').style.display = 'none';
  document.getElementById('style-progress-wrap').style.display = 'block';
  document.getElementById('style-progress-bar').value = 0;
  parent.postMessage({ pluginMessage: { type: 'style-create-variables', data: styleProcessed, meta: styleBuildMeta() } }, '*');
});
document.getElementById('style-draw').addEventListener('click', () => {
  if (!styleProcessed) return;
  if (styleSelectedFont) styleProcessed.fontFamily = styleSelectedFont;
  ['style-draw', 'style-generate', 'style-comp'].forEach(id => document.getElementById(id).disabled = true);
  document.getElementById('style-result').style.display = 'none';
  document.getElementById('style-progress-wrap').style.display = 'block';
  document.getElementById('style-progress-bar').value = 0;
  parent.postMessage({ pluginMessage: { type: 'style-draw', data: styleProcessed, meta: styleBuildMeta() } }, '*');
});
document.getElementById('style-comp').addEventListener('click', () => {
  if (!styleProcessed) return;
  if (styleSelectedFont) styleProcessed.fontFamily = styleSelectedFont;
  ['style-comp', 'style-draw', 'style-generate'].forEach(id => document.getElementById(id).disabled = true);
  document.getElementById('style-result').style.display = 'none';
  document.getElementById('style-progress-wrap').style.display = 'block';
  document.getElementById('style-progress-bar').value = 30;
  parent.postMessage({ pluginMessage: { type: 'style-create-components', data: styleProcessed, meta: styleBuildMeta() } }, '*');
});
document.getElementById('style-cancel').addEventListener('click', () => {
  parent.postMessage({ pluginMessage: { type: 'cancel' } }, '*');
});
styleLoadEmbeddedMd();

/* ═══════════════════════════════════════════════════════════════════════════
   MODULE: TABLE
   ═══════════════════════════════════════════════════════════════════════════ */
let tableColorVarMap = {};
const TABLE_COLOR_KEYS = ['border', 'headerBg', 'footerBg', 'altBg', 'cellBg'];
const TABLE_DEFAULTS = { border: 'D5D5D5', headerBg: 'f7f7f7', footerBg: 'f7f7f7', altBg: 'f8fafc', cellBg: 'ffffff' };
let tableTab = 'unified';
let tableVarsLoaded = false;

function tableSwitchTab(tab) {
  tableTab = tab;
  ['unified', 'split', 'html'].forEach(k => {
    const K = k.charAt(0).toUpperCase() + k.slice(1);
    document.getElementById('table-tab-' + k).className = 'sub-tab' + (tab === k ? ' active' : '');
    document.getElementById('table-pane-' + k).className = 'sub-panel' + (tab === k ? ' active' : '');
  });
  tableUpdateBtn();
}
function tableToggleAdv() {
  const isOpen = document.getElementById('table-adv-panel').classList.contains('open');
  document.getElementById('table-adv-panel').className = 'adv-panel' + (isOpen ? '' : ' open');
  document.getElementById('table-adv-toggle').className = 'adv-toggle' + (isOpen ? '' : ' open');
}

function tableBuildColorRows() {
  const container = document.getElementById('table-color-rows');
  container.innerHTML = TABLE_COLOR_KEYS.map(key => `
    <div class="color-row-t">
      <span class="color-label-t" data-colorkey="${key}">${t('table.colorLabels')[key]}</span>
      <select class="var-sel" id="table-${key}-var" onchange="tableOnVarChange('${key}')"><option value="">${t('table.directInput')}</option></select>
      <div class="hex-wrap"><span class="hash">#</span><input class="hex-in" type="text" id="table-${key}-hex" value="${TABLE_DEFAULTS[key]}" maxlength="6" oninput="tableOnHexInput('${key}')"></div>
      <span class="swatch-t" id="table-${key}-swatch"></span>
    </div>
  `).join('');
}
function tableUpdateSwatch(key) {
  const hex = document.getElementById('table-' + key + '-hex').value;
  const el = document.getElementById('table-' + key + '-swatch');
  el.style.background = /^[0-9a-fA-F]{6}$/.test(hex) ? '#' + hex : '#444';
}
function tableOnVarChange(key) {
  const varId = document.getElementById('table-' + key + '-var').value;
  const hexEl = document.getElementById('table-' + key + '-hex');
  if (varId && tableColorVarMap[varId]) { hexEl.value = tableColorVarMap[varId].hex.replace('#', ''); hexEl.disabled = true; }
  else { hexEl.disabled = false; }
  tableUpdateSwatch(key);
}
function tableOnHexInput(key) {
  document.getElementById('table-' + key + '-var').value = '';
  tableUpdateSwatch(key);
}
function tableGetColorConfig(key) {
  const varId = document.getElementById('table-' + key + '-var').value || null;
  const rawHex = document.getElementById('table-' + key + '-hex').value;
  const hex = /^[0-9a-fA-F]{6}$/.test(rawHex) ? '#' + rawHex : null;
  return { varId, hex };
}
function tableGetPresetConfig(preset) {
  const defaultColors = { border: 'D5D5D5', headerBg: 'f7f7f7', footerBg: 'f7f7f7', altBg: 'f8fafc', cellBg: 'ffffff' };
  const presets = {
    default: { tableWidth: 1400, paddingV: 12, paddingH: 16, minColW: 0, fontSize: 18, minRowH: 48, colors: defaultColors },
    krds: { tableWidth: 1200, paddingV: 14, paddingH: 18, minColW: 96, fontSize: 16, minRowH: 52, colors: { border: 'D5D5D5', headerBg: 'F7F7F7', footerBg: 'F7F7F7', altBg: 'F8FAFC', cellBg: 'FFFFFF' } },
    admin: { tableWidth: 1280, paddingV: 10, paddingH: 14, minColW: 88, fontSize: 15, minRowH: 44, colors: { border: 'CBD5E1', headerBg: 'EEF2F7', footerBg: 'F1F5F9', altBg: 'F8FAFC', cellBg: 'FFFFFF' } },
    report: { tableWidth: 1400, paddingV: 13, paddingH: 18, minColW: 100, fontSize: 16, minRowH: 52, colors: { border: 'D6D3D1', headerBg: 'F5F5F4', footerBg: 'F5F5F4', altBg: 'FAFAF9', cellBg: 'FFFFFF' } },
    compact: { tableWidth: 960, paddingV: 8, paddingH: 12, minColW: 72, fontSize: 14, minRowH: 36, colors: { border: 'CBD5E1', headerBg: 'F1F5F9', footerBg: 'F1F5F9', altBg: 'F8FAFC', cellBg: 'FFFFFF' } },
  };
  return presets[preset] || presets.default;
}
function tableApplyPreset(preset) {
  const config = tableGetPresetConfig(preset);
  document.getElementById('table-width').value = config.tableWidth;
  document.getElementById('table-pad-v').value = config.paddingV;
  document.getElementById('table-pad-h').value = config.paddingH;
  document.getElementById('table-min-col-w').value = config.minColW || '';
  document.getElementById('table-font-size').value = config.fontSize;
  document.getElementById('table-min-row-h').value = config.minRowH;
  TABLE_COLOR_KEYS.forEach(key => {
    const varEl = document.getElementById('table-' + key + '-var');
    const hexEl = document.getElementById('table-' + key + '-hex');
    if (varEl) varEl.value = '';
    if (hexEl && config.colors[key]) {
      hexEl.disabled = false;
      hexEl.value = config.colors[key];
    }
    tableUpdateSwatch(key);
  });
  tableUpdateBtn();
}
const TABLE_AUTO_DEFAULTS = [
  { key: 'border', matcher: v => v.name === 'Gray/20' },
  { key: 'altBg', matcher: v => v.name === 'Gray/5' },
  { key: 'headerBg', matcher: v => v.name === 'Primary/5' },
];
function tablePopulateVariables(variables) {
  tableVarsLoaded = true;
  const groups = {};
  variables.forEach(v => {
    const col = v.collection || 'Other';
    if (!groups[col]) groups[col] = [];
    groups[col].push(v);
    tableColorVarMap[v.id] = v;
  });
  TABLE_COLOR_KEYS.forEach(key => {
    const sel = document.getElementById('table-' + key + '-var');
    Object.keys(groups).forEach(colName => {
      const grp = document.createElement('optgroup');
      grp.label = colName;
      groups[colName].forEach(v => {
        const opt = document.createElement('option');
        opt.value = v.id; opt.textContent = v.name;
        grp.appendChild(opt);
      });
      sel.appendChild(grp);
    });
  });
  TABLE_AUTO_DEFAULTS.forEach(d => {
    const found = variables.find(d.matcher);
    if (found) { document.getElementById('table-' + d.key + '-var').value = found.id; tableOnVarChange(d.key); }
  });
}

function parseHTMLTable(html) {
  if (!html.trim()) return null;
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const table = doc.querySelector('table');
  if (!table) return null;
  function extractRows(container) {
    return Array.from(container.querySelectorAll('tr')).map(row =>
      Array.from(row.querySelectorAll('th, td')).map(cell => cell.textContent.trim())
    ).filter(r => r.length > 0);
  }
  const thead = table.querySelector('thead');
  const tbody = table.querySelector('tbody');
  const tfoot = table.querySelector('tfoot');
  if (thead || tbody || tfoot) {
    return { headerRows: thead ? extractRows(thead) : [], bodyRows: tbody ? extractRows(tbody) : [], footerRows: tfoot ? extractRows(tfoot) : [] };
  }
  const allRows = extractRows(table);
  const firstTr = table.querySelector('tr');
  const isHeader = firstTr && firstTr.querySelectorAll('th').length > 0 && firstTr.querySelectorAll('td').length === 0;
  return { headerRows: isHeader ? allRows.slice(0, 1) : [], bodyRows: isHeader ? allRows.slice(1) : allRows, footerRows: [] };
}
function parseTableData(raw) {
  if (!raw.trim()) return [];
  raw = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rows = []; let row = []; let cell = ''; let quoted = false; let i = 0;
  while (i < raw.length) {
    const c = raw[i];
    if (quoted) {
      if (c === '"' && raw[i + 1] === '"') { cell += '"'; i += 2; }
      else if (c === '"') { quoted = false; i++; }
      else { cell += c; i++; }
    } else {
      if (c === '"' && cell === '') { quoted = true; i++; }
      else if (c === '\t') { row.push(cell); cell = ''; i++; }
      else if (c === '\n') { row.push(cell); cell = ''; if (row.some(x => x.trim())) rows.push(row); row = []; i++; }
      else { cell += c; i++; }
    }
  }
  row.push(cell);
  if (row.some(x => x.trim())) rows.push(row);
  return rows;
}
function tableAnalyzeRows(parts) {
  const headerRows = (parts && parts.headerRows) || [];
  const bodyRows = (parts && parts.bodyRows) || [];
  const footerRows = (parts && parts.footerRows) || [];
  const allRows = headerRows.concat(bodyRows).concat(footerRows);
  const columns = allRows.reduce((max, row) => Math.max(max, row.length), 0);
  let emptyHeaderCells = 0;
  let longCells = 0;
  let inconsistentRows = 0;
  allRows.forEach(row => {
    if (columns > 0 && row.length !== columns) inconsistentRows++;
    row.forEach(cell => {
      if (String(cell || '').length > 40) longCells++;
    });
  });
  headerRows.forEach(row => {
    row.forEach(cell => {
      if (!String(cell || '').trim()) emptyHeaderCells++;
    });
  });
  return {
    rows: allRows.length,
    columns,
    headerRows: headerRows.length,
    bodyRows: bodyRows.length,
    footerRows: footerRows.length,
    inconsistentRows,
    emptyHeaderCells,
    longCells,
  };
}
function tableRenderDiagnostics(parts) {
  const el = document.getElementById('table-diagnostics');
  if (!el) return;
  const summary = tableAnalyzeRows(parts);
  const labels = {
    shape: t('table.diagShape', summary.rows, summary.columns),
    split: t('table.diagSplit', summary.headerRows, summary.bodyRows, summary.footerRows),
    inconsistentRows: t('table.diagInconsistentRows', summary.inconsistentRows),
    emptyHeaderCells: t('table.diagEmptyHeaderCells', summary.emptyHeaderCells),
    longCells: t('table.diagLongCells', summary.longCells),
    idle: t('table.diagIdle'),
    clean: t('table.diagClean'),
  };
  if (!summary.rows) {
    el.innerHTML = `<span class="diagnostic-chip">${labels.idle}</span>`;
    return;
  }
  const warnings = [
    ['inconsistentRows', summary.inconsistentRows],
    ['emptyHeaderCells', summary.emptyHeaderCells],
    ['longCells', summary.longCells],
  ].filter(([, count]) => count > 0);
  const chips = [
    `<span class="diagnostic-chip">${labels.shape}</span>`,
    `<span class="diagnostic-chip">${labels.split}</span>`,
  ].concat(warnings.length
    ? warnings.map(([key]) => `<span class="diagnostic-chip warn">${labels[key]}</span>`)
    : [`<span class="diagnostic-chip ok">${labels.clean}</span>`]);
  el.innerHTML = chips.join('');
}
function tableGetCurrentParts() {
  if (tableTab === 'unified') {
    const allRows = parseTableData(document.getElementById('table-paste-unified').value);
    const headerRows = [];
    const footerRows = [];
    if (document.getElementById('table-has-header').checked && allRows.length > 0) headerRows.push(allRows.shift());
    if (document.getElementById('table-has-footer').checked && allRows.length > 0) footerRows.push(allRows.pop());
    return { headerRows, bodyRows: allRows, footerRows };
  }
  if (tableTab === 'split') {
    return {
      headerRows: parseTableData(document.getElementById('table-paste-header').value),
      bodyRows: parseTableData(document.getElementById('table-paste-body').value),
      footerRows: parseTableData(document.getElementById('table-paste-footer').value),
    };
  }
  return parseHTMLTable(document.getElementById('table-paste-html').value)
    || { headerRows: [], bodyRows: [], footerRows: [] };
}
function tableInferColumnAlignments(parts) {
  const headerRows = (parts && parts.headerRows) || [];
  const bodyRows = (parts && parts.bodyRows) || [];
  const footerRows = (parts && parts.footerRows) || [];
  const allRows = headerRows.concat(bodyRows).concat(footerRows);
  const headers = headerRows[0] || [];
  const numCols = allRows.reduce((max, row) => Math.max(max, row.length), 0);
  const numericRe = /^[-+]?((\d{1,3}(,\d{3})+)|\d+)(\.\d+)?%?$/;
  const statusRe = /^(ready|done|active|inactive|pending|failed?|success|complete|완료|대기|진행|실패|성공|사용|미사용|승인|반려)$/i;
  return Array.from({ length: numCols }, (_, ci) => {
    const header = String(headers[ci] || '').trim().toLowerCase();
    const values = bodyRows.map(row => String(row[ci] || '').trim()).filter(Boolean);
    const numericCount = values.filter(value => numericRe.test(value)).length;
    const statusCount = values.filter(value => statusRe.test(value)).length;
    const isStatusHeader = /status|state|상태|진행|여부|결과/.test(header);
    if (values.length && numericCount / values.length >= 0.7) return 'right';
    if (isStatusHeader || (values.length && statusCount / values.length >= 0.7)) return 'center';
    return 'left';
  });
}
function tableUpdateDetected(taId, infoId) {
  const rows = parseTableData(document.getElementById(taId).value);
  const info = document.getElementById(infoId);
  if (!rows.length) { info.textContent = t('table.detectIdle'); info.className = 'detected idle'; }
  else { const cols = rows.reduce((m, r) => Math.max(m, r.length), 0); info.textContent = t('table.detectOk', rows.length, cols); info.className = 'detected ok'; }
  tableUpdateBtn();
}
function tableRefreshDetected() {
  if (!document.getElementById('table-det-unified')) return;
  tableUpdateDetected('table-paste-unified', 'table-det-unified');
  tableUpdateDetected('table-paste-body', 'table-det-body');
  tableUpdateHtmlDetected();
}
function tableUpdateHtmlDetected() {
  const html = document.getElementById('table-paste-html').value;
  const info = document.getElementById('table-det-html');
  const parsed = parseHTMLTable(html);
  if (!parsed) { info.textContent = html.trim() ? t('table.detectHtmlFail') : t('table.detectHtmlIdle'); info.className = 'detected idle'; }
  else {
    const all = parsed.headerRows.concat(parsed.bodyRows).concat(parsed.footerRows);
    const cols = all.reduce((m, r) => Math.max(m, r.length), 0);
    let parts = '';
    if (parsed.headerRows.length) parts += t('table.hPart', parsed.headerRows.length);
    parts += t('table.bPart', parsed.bodyRows.length);
    if (parsed.footerRows.length) parts += t('table.fPart', parsed.footerRows.length);
    info.textContent = t('table.detectHtmlOk', parts, '', '', cols);
    info.className = 'detected ok';
  }
  tableUpdateBtn();
}
function tableUpdateBtn() {
  const parts = tableGetCurrentParts();
  const hasData = parts.headerRows.length + parts.bodyRows.length + parts.footerRows.length > 0;
  document.getElementById('table-generate').disabled = !hasData;
  tableRenderDiagnostics(parts);
}
function tableBindTa(taId, infoId, isHtml) {
  const el = document.getElementById(taId);
  const fn = isHtml ? tableUpdateHtmlDetected : () => tableUpdateDetected(taId, infoId);
  el.addEventListener('input', fn);
  el.addEventListener('paste', () => setTimeout(fn, 10));
}
tableBindTa('table-paste-unified', 'table-det-unified', false);
tableBindTa('table-paste-header', 'table-det-header', false);
tableBindTa('table-paste-body', 'table-det-body', false);
tableBindTa('table-paste-footer', 'table-det-footer', false);
tableBindTa('table-paste-html', 'table-det-html', true);
document.getElementById('table-preset').addEventListener('change', (e) => tableApplyPreset(e.target.value));

document.getElementById('table-generate').addEventListener('click', () => {
  const btn = document.getElementById('table-generate');
  const status = document.getElementById('table-status');
  btn.disabled = true;
  btn.textContent = t('table.generating');
  status.textContent = ''; status.className = 'status';
  let headerRows, bodyRows, footerRows, striped;
  if (tableTab === 'unified') {
    const allRows = parseTableData(document.getElementById('table-paste-unified').value);
    striped = document.getElementById('table-striped').checked;
    headerRows = []; footerRows = [];
    if (document.getElementById('table-has-header').checked && allRows.length > 0) headerRows = [allRows.shift()];
    if (document.getElementById('table-has-footer').checked && allRows.length > 0) footerRows = [allRows.pop()];
    bodyRows = allRows;
  } else if (tableTab === 'split') {
    headerRows = parseTableData(document.getElementById('table-paste-header').value);
    bodyRows = parseTableData(document.getElementById('table-paste-body').value);
    footerRows = parseTableData(document.getElementById('table-paste-footer').value);
    striped = document.getElementById('table-striped-split').checked;
  } else {
    const parsed = parseHTMLTable(document.getElementById('table-paste-html').value);
    if (!parsed) return;
    headerRows = parsed.headerRows; bodyRows = parsed.bodyRows; footerRows = parsed.footerRows;
    striped = document.getElementById('table-striped-html').checked;
  }
  const tableConfig = {
    inputMode: tableTab,
    preset: document.getElementById('table-preset').value || 'default',
    striped,
    paddingV: parseInt(document.getElementById('table-pad-v').value) || 12,
    paddingH: parseInt(document.getElementById('table-pad-h').value) || 16,
    minColW: parseInt(document.getElementById('table-min-col-w').value) || 0,
    fontSize: parseInt(document.getElementById('table-font-size').value) || 18,
    minRowH: parseInt(document.getElementById('table-min-row-h').value) || 0,
    tableWidth: parseInt(document.getElementById('table-width').value) || 0,
    colors: {
      border: tableGetColorConfig('border'), headerBg: tableGetColorConfig('headerBg'),
      footerBg: tableGetColorConfig('footerBg'), altBg: tableGetColorConfig('altBg'),
      cellBg: tableGetColorConfig('cellBg'),
    },
  };
  const diagnostics = tableAnalyzeRows({ headerRows, bodyRows, footerRows });
  const columnAlignments = tableInferColumnAlignments({ headerRows, bodyRows, footerRows });
  diagnostics.warningCount = diagnostics.inconsistentRows + diagnostics.emptyHeaderCells + diagnostics.longCells;
  tableConfig.diagnostics = diagnostics;
  tableConfig.columnAlignments = columnAlignments;
  parent.postMessage({
    pluginMessage: {
      type: 'table-generate', headerRows, bodyRows, footerRows, striped,
      paddingV: tableConfig.paddingV,
      paddingH: tableConfig.paddingH,
      minColW: tableConfig.minColW,
      fontSize: tableConfig.fontSize,
      minRowH: tableConfig.minRowH,
      tableWidth: tableConfig.tableWidth,
      colors: tableConfig.colors,
      columnAlignments,
      meta: { tableConfig, diagnostics },
    }
  }, '*');
});

/* ═══════════════════════════════════════════════════════════════════════════
   MODULE: KLIC UI/UX CHECKLIST
   ═══════════════════════════════════════════════════════════════════════════ */
const UX_CHECKLIST_STORAGE_KEY = 'klic.uxChecklist.v1';
const UX_CHECKLIST_CATEGORIES = ['accessibility', 'design-system', 'responsive', 'interaction', 'content', 'handoff'];
const UX_CHECKLIST_DEFAULTS = [
  ['ux.default.contrast', 'accessibility', true],
  ['ux.default.target', 'accessibility', true],
  ['ux.default.keyboard', 'accessibility', true],
  ['ux.default.tokens', 'design-system', true],
  ['ux.default.components', 'design-system', true],
  ['ux.default.responsive', 'responsive', true],
  ['ux.default.navigation', 'interaction', true],
  ['ux.default.forms', 'interaction', true],
  ['ux.default.tables', 'content', true],
  ['ux.default.states', 'interaction', true],
  ['ux.default.copy', 'content', false],
  ['ux.default.qaDiff', 'handoff', true],
  ['ux.default.handoff', 'handoff', true],
];

function uxChecklistDefaultItems() {
  return UX_CHECKLIST_DEFAULTS.map((item, index) => ({
    id: 'klic-default-' + (index + 1),
    titleKey: item[0],
    category: item[1],
    required: item[2],
    done: false,
  }));
}

function uxChecklistLoad() {
  const raw = safeStorageGet(UX_CHECKLIST_STORAGE_KEY);
  if (!raw) return uxChecklistDefaultItems();
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return uxChecklistDefaultItems();
    return parsed.filter(item => item && typeof item.id === 'string' && UX_CHECKLIST_CATEGORIES.includes(item.category)).slice(0, 200);
  } catch (err) {
    return uxChecklistDefaultItems();
  }
}

let uxChecklistItems = uxChecklistLoad();
let uxChecklistFilter = 'all';
let uxChecklistEditingId = '';

function uxChecklistSave() {
  safeStorageSet(UX_CHECKLIST_STORAGE_KEY, JSON.stringify(uxChecklistItems));
}

function uxChecklistTitle(item) {
  return item.title || t(item.titleKey || '');
}

function uxChecklistPopulateCategories() {
  document.querySelectorAll('[data-ux-category-select]').forEach(select => {
    const current = select.value;
    select.innerHTML = '';
    UX_CHECKLIST_CATEGORIES.forEach(category => {
      const option = document.createElement('option');
      option.value = category;
      option.textContent = t('ux.category.' + category);
      select.appendChild(option);
    });
    select.value = UX_CHECKLIST_CATEGORIES.includes(current) ? current : UX_CHECKLIST_CATEGORIES[0];
  });
}

function uxChecklistSetFilter(filter) {
  uxChecklistFilter = ['all', 'open', 'done'].includes(filter) ? filter : 'all';
  uxChecklistRender();
}

function uxChecklistToggle(id, done) {
  const item = uxChecklistItems.find(entry => entry.id === id);
  if (!item) return;
  item.done = !!done;
  uxChecklistSave();
  uxChecklistRender();
}

function uxChecklistDelete(id) {
  const item = uxChecklistItems.find(entry => entry.id === id);
  if (!item || !confirm(t('ux.deleteConfirm', uxChecklistTitle(item)))) return;
  uxChecklistItems = uxChecklistItems.filter(entry => entry.id !== id);
  uxChecklistSave();
  uxChecklistRender();
}

function uxChecklistAdd() {
  const titleInput = document.getElementById('ux-new-title');
  const title = titleInput.value.trim().slice(0, 120);
  if (!title || uxChecklistItems.length >= 200) return;
  uxChecklistItems.push({
    id: 'ux-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7),
    title,
    category: document.getElementById('ux-new-category').value,
    required: document.getElementById('ux-new-required').checked,
    done: false,
  });
  titleInput.value = '';
  uxChecklistSave();
  uxChecklistRender();
  titleInput.focus();
}

function uxChecklistSaveEdit(id, row) {
  const item = uxChecklistItems.find(entry => entry.id === id);
  const title = row.querySelector('[data-edit-title]').value.trim().slice(0, 120);
  if (!item || !title) return;
  item.title = title;
  delete item.titleKey;
  item.category = row.querySelector('[data-edit-category]').value;
  item.required = row.querySelector('[data-edit-required]').checked;
  uxChecklistEditingId = '';
  uxChecklistSave();
  uxChecklistRender();
}

function uxChecklistCreateIconButton(symbol, titleKey, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'ux-icon-btn';
  button.textContent = symbol;
  button.title = t(titleKey);
  button.setAttribute('aria-label', t(titleKey));
  button.addEventListener('click', onClick);
  return button;
}

function uxChecklistRenderEdit(item, container) {
  const edit = document.createElement('div');
  edit.className = 'ux-edit-row';
  const title = document.createElement('input');
  title.type = 'text';
  title.maxLength = 120;
  title.value = uxChecklistTitle(item);
  title.setAttribute('data-edit-title', '');
  const category = document.createElement('select');
  category.setAttribute('data-edit-category', '');
  UX_CHECKLIST_CATEGORIES.forEach(value => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = t('ux.category.' + value);
    option.selected = value === item.category;
    category.appendChild(option);
  });
  const required = document.createElement('label');
  required.className = 'ux-required';
  const requiredCheck = document.createElement('input');
  requiredCheck.type = 'checkbox';
  requiredCheck.checked = !!item.required;
  requiredCheck.setAttribute('data-edit-required', '');
  const requiredText = document.createElement('span');
  requiredText.textContent = t('ux.required');
  required.appendChild(requiredCheck);
  required.appendChild(requiredText);
  edit.appendChild(title);
  edit.appendChild(category);
  edit.appendChild(required);
  edit.appendChild(uxChecklistCreateIconButton('✓', 'ux.save', () => uxChecklistSaveEdit(item.id, edit)));
  edit.appendChild(uxChecklistCreateIconButton('×', 'ux.cancel', () => { uxChecklistEditingId = ''; uxChecklistRender(); }));
  container.appendChild(edit);
  setTimeout(() => title.focus(), 0);
}

function uxChecklistRender() {
  const list = document.getElementById('ux-checklist-list');
  if (!list) return;
  uxChecklistPopulateCategories();
  document.querySelectorAll('.ux-filter').forEach(button => button.classList.toggle('active', button.dataset.filter === uxChecklistFilter));
  const done = uxChecklistItems.filter(item => item.done).length;
  const total = uxChecklistItems.length;
  document.getElementById('ux-progress').value = total ? Math.round(done / total * 100) : 0;
  document.getElementById('ux-progress-text').textContent = t('ux.progress', done, total);
  const visible = uxChecklistItems.filter(item => uxChecklistFilter === 'all' || (uxChecklistFilter === 'done' ? item.done : !item.done));
  list.innerHTML = '';
  visible.forEach(item => {
    const row = document.createElement('div');
    row.className = 'ux-check-item' + (item.done ? ' done' : '');
    const check = document.createElement('input');
    check.type = 'checkbox';
    check.checked = !!item.done;
    check.setAttribute('aria-label', uxChecklistTitle(item));
    check.addEventListener('change', () => uxChecklistToggle(item.id, check.checked));
    const copy = document.createElement('div');
    copy.className = 'ux-item-copy';
    const title = document.createElement('div');
    title.className = 'ux-item-title';
    title.textContent = uxChecklistTitle(item);
    const meta = document.createElement('div');
    meta.className = 'ux-item-meta';
    const category = document.createElement('span');
    category.textContent = t('ux.category.' + item.category);
    meta.appendChild(category);
    if (item.required) {
      const required = document.createElement('span');
      required.className = 'ux-item-required';
      required.textContent = t('ux.required');
      meta.appendChild(required);
    }
    copy.appendChild(title);
    copy.appendChild(meta);
    const actions = document.createElement('div');
    actions.className = 'ux-item-actions';
    actions.appendChild(uxChecklistCreateIconButton('✎', 'ux.edit', () => { uxChecklistEditingId = item.id; uxChecklistRender(); }));
    actions.appendChild(uxChecklistCreateIconButton('×', 'ux.delete', () => uxChecklistDelete(item.id)));
    row.appendChild(check);
    row.appendChild(copy);
    row.appendChild(actions);
    if (uxChecklistEditingId === item.id) uxChecklistRenderEdit(item, row);
    list.appendChild(row);
  });
  document.getElementById('ux-empty').style.display = visible.length ? 'none' : 'block';
}

document.getElementById('ux-add').addEventListener('click', uxChecklistAdd);
document.getElementById('ux-new-title').addEventListener('keydown', event => { if (event.key === 'Enter') uxChecklistAdd(); });
document.querySelectorAll('.ux-filter').forEach(button => button.addEventListener('click', () => uxChecklistSetFilter(button.dataset.filter)));
document.getElementById('ux-reset').addEventListener('click', () => {
  if (!confirm(t('ux.resetConfirm'))) return;
  uxChecklistItems = uxChecklistDefaultItems();
  uxChecklistEditingId = '';
  uxChecklistSave();
  uxChecklistRender();
});

/* ═══════════════════════════════════════════════════════════════════════════
   Unified message router (code.js → ui)
   ═══════════════════════════════════════════════════════════════════════════ */
window.onmessage = (event) => {
  const msg = event.data.pluginMessage;
  if (!msg) return;

  if (msg.type === 'ui-resized') {
    uiSize = UI_SIZE_PRESETS[msg.size] ? msg.size : 'default';
    safeStorageSet('klic.uiSize', uiSize);
    applyUiSizeState();
    return;
  }

  /* ── Command Center ── */
  if (msg.type === 'command-progress') {
    const list = commandGetBindingList('qa');
    list.innerHTML = `<div class="hint">${msg.cancelled ? t('command.cancelled') : t('command.progress', msg.scanned || 0, msg.scanLimit || 0)}</div>`;
    return;
  }
  if (msg.type === 'command-snapshot') {
    commandRenderSnapshot(msg.data);
    if (msg.data && msg.data.previewItems) commandRenderBindingPreview(msg.data.previewItems);
    if (commandGuidedPhase === 'refresh') {
      commandGuidedSetPhase('bindings', 'command.guidedBindings');
      parent.postMessage({ pluginMessage: { type: 'command-preview-color-bindings', scope: 'page', options: commandGetOptions() } }, '*');
    }
    return;
  }
  if (msg.type === 'command-fixes-preview') {
    commandRenderFixPreview(msg);
    if (commandGuidedPhase === 'fixes') {
      const counts = msg.counts || {};
      if ((counts.A || 0) + (counts.B || 0) > 0) {
        commandGuidedSetPhase('apply-fixes', 'command.guidedApplyingFixes');
        parent.postMessage({ pluginMessage: { type: 'command-apply-fixes', tier: 'AB' } }, '*');
      } else {
        commandGuidedRunAudit();
      }
    }
    return;
  }
  if (msg.type === 'command-fixes-applied') {
    const list = commandGetBindingList();
    list.innerHTML = `<div class="hint">${t('command.fixApplied', msg.applied || 0)}</div>`;
    if (commandGuidedPhase === 'apply-fixes') commandGuidedRunAudit();
    // Re-scan so counts/chips reflect the post-apply state (mirrors command-refresh).
    parent.postMessage({ pluginMessage: { type: 'command-collect-fixes', scope: commandScope, options: commandGetOptions() } }, '*');
    return;
  }
  if (msg.type === 'command-bindings-preview') {
    commandRenderSnapshot(msg.data);
    commandRenderBindingPreview(msg.items || []);
    if (commandGuidedPhase === 'bindings') {
      const exact = (msg.items || []).filter(item => item.matchType === 'rgb-exact');
      if (exact.length) {
        commandGuidedSetPhase('apply-bindings', 'command.guidedApplyingBindings');
        const options = commandGetOptions();
        options.includeOklchApply = false;
        parent.postMessage({ pluginMessage: { type: 'command-apply-color-bindings', scope: 'page', changes: exact, options } }, '*');
      } else {
        commandGuidedCollectFixes();
      }
    }
    return;
  }
  if (msg.type === 'command-apply-result') {
    const list = commandGetBindingList('binding');
    list.innerHTML = `<div class="hint">${t('command.applied', msg.applied || 0, msg.skipped || 0)}</div>`;
    if (commandGuidedPhase === 'apply-bindings') commandGuidedCollectFixes();
    return;
  }
  if (msg.type === 'command-kwcag-krds-audit-result') {
    commandRenderKwcagKrdsAudit(msg);
    if (commandGuidedPhase === 'kwcag') {
      commandGuidedSetPhase('component-qa', 'command.guidedComponentQa');
      parent.postMessage({ pluginMessage: { type: 'command-component-qa', scope: 'page', options: commandGetOptions() } }, '*');
    }
    return;
  }
  if (msg.type === 'command-component-qa-result') {
    commandRenderComponentQa(msg);
    if (commandGuidedPhase === 'component-qa') commandGuidedSetPhase('done', 'command.guidedComplete');
    return;
  }
  if (msg.type === 'command-token-governance-result') {
    commandRenderTokenGovernance(msg);
    return;
  }
  if (msg.type === 'command-smoke-test-result') {
    const list = commandGetBindingList('evidence');
    list.innerHTML = commandRenderSmokeChecks(msg);
    return;
  }
  if (msg.type === 'command-handoff-export') {
    const list = commandGetBindingList('handoff');
    const summary = msg.summary
      ? t('command.exportSummary', msg.summary.healthScore, msg.summary.unboundPaints, msg.summary.generatedKlicNodes, msg.summary.diagnosticWarnings || 0)
      : '';
    list.innerHTML = `<div class="hint">${t('command.exported', msg.count || 0)}${summary ? ' · ' + commandEscape(summary) : ''}</div><textarea rows="8" style="width:100%;margin-top:8px">${commandEscape(msg.css || '')}\n\n/* handoff.json */\n${commandEscape(msg.json || '')}\n\n/* dtcg.tokens.json */\n${commandEscape(msg.dtcgJson || '')}</textarea>`;
    return;
  }
  if (msg.type === 'command-report-created') {
    const list = commandGetBindingList('handoff');
    list.innerHTML = `<div class="hint">${t('command.reportCreated')}</div>`;
    return;
  }
  if (msg.type === 'command-folder-maker-opened') {
    commandRenderFolderMakerFallback(msg.url || FOLDER_MAKER_BRIDGE_URL);
    return;
  }
  if (msg.type === 'command-folder-maker-fallback') {
    commandRenderFolderMakerFallback(FOLDER_MAKER_BRIDGE_URL, t('command.folderMakerBridgeMissing'));
    return;
  }
  if (msg.type === 'command-error') {
    const list = commandGetBindingList();
    list.innerHTML = `<div class="status error">${commandEscape(t('command.error', msg.message || 'Unknown error'))}</div>`;
    commandGuidedFail();
    return;
  }

  /* ── Table ── */
  if (msg.type === 'table-variables') { tablePopulateVariables(msg.variables || []); return; }
  if (msg.type === 'table-done') {
    const btn = document.getElementById('table-generate');
    const status = document.getElementById('table-status');
    tableUpdateBtn(); btn.textContent = t('table.generate');
    status.textContent = t('table.done', msg.rows, msg.cols);
    status.className = 'status ok';
    commandGuidedSetStep('table', 'done', 'command.guidedComplete');
    return;
  }
  if (msg.type === 'table-error') {
    const btn = document.getElementById('table-generate');
    const status = document.getElementById('table-status');
    tableUpdateBtn(); btn.textContent = t('table.generate');
    status.textContent = t('table.errPrefix') + msg.message;
    status.className = 'status error';
    return;
  }

  /* ── Menu ── */
  if (msg.type === 'menu-progress') {
    const pct = Math.round((msg.current / msg.total) * 100);
    document.getElementById('menu-progress-bar').value = pct;
    document.getElementById('menu-progress-label').textContent = t('menu.progress', msg.current, msg.total);
    return;
  }
  if (msg.type === 'menu-done') {
    document.getElementById('menu-generate').disabled = false;
    document.getElementById('menu-progress-wrap').style.display = 'none';
    menuShowResult(t('menu.done', msg.count), 'success');
    commandGuidedSetStep('menu', 'done', 'command.guidedComplete');
    return;
  }
  if (msg.type === 'menu-template-registered') {
    menuShowResult(t('menu.templateRegistered'), 'success');
    return;
  }
  if (msg.type === 'menu-error') {
    document.getElementById('menu-generate').disabled = false;
    document.getElementById('menu-progress-wrap').style.display = 'none';
    menuShowResult('❌ ' + msg.message, 'error');
    return;
  }

  /* ── Style ── */
  if (msg.type === 'style-font-result') {
    if (msg.requestId && msg.requestId !== styleFontSearchSeq) return;
    styleRenderFontResults(msg.families || [], msg.cached);
    return;
  }
  if (msg.type === 'style-progress') {
    const pct = Math.round((msg.current / msg.total) * 100);
    document.getElementById('style-progress-bar').value = pct;
    document.getElementById('style-progress-name').textContent = msg.name;
    return;
  }
  if (msg.type === 'style-draw-progress' || msg.type === 'style-comp-progress') {
    document.getElementById('style-progress-bar').value = msg.type === 'style-comp-progress' ? 60 : 50;
    document.getElementById('style-progress-name').textContent = msg.msg;
    return;
  }
  if (msg.type === 'style-done' || msg.type === 'style-draw-done' || msg.type === 'style-comp-done') {
    ['style-generate', 'style-draw', 'style-comp'].forEach(id => document.getElementById(id).disabled = false);
    document.getElementById('style-progress-wrap').style.display = 'none';
    const el = document.getElementById('style-result');
    if (msg.type === 'style-done') el.textContent = t('style.varsDone', msg.count);
    else if (msg.type === 'style-draw-done') el.textContent = t('style.boardDone', msg.textStyleCount || 9, msg.fontFamily ? t('style.summaryFont', msg.fontFamily) : '');
    else el.textContent = t('style.compDone', msg.btnVariantCount, msg.inputVariantCount);
    el.className = 'result success'; el.style.display = 'block';
    if (msg.type === 'style-done') commandGuidedSetStep('style', 'done', 'command.guidedComplete');
    return;
  }
  if (msg.type === 'style-error') {
    ['style-generate', 'style-draw', 'style-comp'].forEach(id => document.getElementById(id).disabled = false);
    document.getElementById('style-progress-wrap').style.display = 'none';
    const el = document.getElementById('style-result');
    el.textContent = t('style.errPrefix') + msg.message;
    el.className = 'result error'; el.style.display = 'block';
    return;
  }

  /* ── Design QA Diff ── */
  if (msg.type === 'qa-rasterize-result') {
    qaRenderRasterResult(msg);
    if (!msg.error) commandGuidedSetStep('designqa', 'active', 'command.guidedInProgress');
    return;
  }
  if (msg.type === 'qa-commit-result') {
    qaRenderCommitResult(msg);
    if (!msg.error) commandGuidedSetStep('designqa', 'active', 'command.guidedCopyNote');
    return;
  }
};

/* ═══════════════════════════════════════════════════════════════════════════
   Init
   ═══════════════════════════════════════════════════════════════════════════ */
tableBuildColorRows();
TABLE_COLOR_KEYS.forEach(k => tableUpdateSwatch(k));
commandApplyProjectPreset('public-education');
applyLang();

/* ═══════════════════════════════════════════════════════════════════════════
   MODULE: DESIGN QA DIFF
   ═══════════════════════════════════════════════════════════════════════════ */
let qaDesign = null;        // { bytes:Uint8Array, width, height, nodeId }
let qaImpl = null;          // { bytes:Uint8Array, width, height }
let qaLabels = [];
let qaDrawing = null;       // active drag { x0,y0,x1,y1 } in display px

const QA_CATEGORIES = ['color', 'spacing', 'typography', 'missing', 'extra', 'alignment', 'other'];
const QA_MAX_AGENT_IMAGE_EDGE = 1568;

function qaNormalizeRect(rect, dispW, dispH) {
  return {
    x: Math.max(0, Math.min(1, rect.x / dispW)),
    y: Math.max(0, Math.min(1, rect.y / dispH)),
    w: Math.max(0, Math.min(1, rect.w / dispW)),
    h: Math.max(0, Math.min(1, rect.h / dispH)),
  };
}

function qaBytesToObjectUrl(bytes) {
  const blob = new Blob([bytes], { type: 'image/png' });
  return URL.createObjectURL(blob);
}

let qaDesignObjectUrl = '';
let qaImplObjectUrl = '';

function qaReplaceObjectUrl(img, bytes, currentUrl) {
  if (currentUrl) URL.revokeObjectURL(currentUrl);
  const nextUrl = qaBytesToObjectUrl(bytes);
  img.src = nextUrl;
  return nextUrl;
}

function qaPlanImageScale(width, height) {
  const w = Math.max(1, Math.round(Number(width) || 1));
  const h = Math.max(1, Math.round(Number(height) || 1));
  const edge = Math.max(w, h);
  if (edge <= QA_MAX_AGENT_IMAGE_EDGE) return { width: w, height: h, factor: 1 };
  const factor = QA_MAX_AGENT_IMAGE_EDGE / edge;
  return {
    width: Math.max(1, Math.round(w * factor)),
    height: Math.max(1, Math.round(h * factor)),
    factor,
  };
}

function qaCanvasToPngBytes(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('png encode failed'));
        return;
      }
      blob.arrayBuffer().then((buf) => resolve(new Uint8Array(buf)), reject);
    }, 'image/png');
  });
}

function qaSetImplImage(bytes, width, height) {
  qaImpl = { bytes, width, height };
  qaImplObjectUrl = qaReplaceObjectUrl(document.getElementById('qa-impl-img'), bytes, qaImplObjectUrl);
  qaResetImplLabels();
  qaUpdateAgentNote();
}

function qaSetImplImageResult(message) {
  const result = document.getElementById('qa-result');
  if (result) result.textContent = message;
}

function qaResetImplLabels() {
  qaLabels = [];
  qaRenderLabels();
  qaRedrawOverlay();
}

function qaSanitizeAgentNoteText(value) {
  return String(value == null ? '' : value).replace(/```/g, "'''");
}

function qaClamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function qaPixelCoord(value, size) {
  const max = Math.max(1, Math.round(Number(size) || 1));
  return Math.min(max - 1, Math.max(0, Math.round(qaClamp01(value) * max)));
}

function qaPixelPoint(label, imgW, imgH) {
  return {
    x: qaPixelCoord(label && label.x, imgW),
    y: qaPixelCoord(label && label.y, imgH),
  };
}

function qaPixelRect(label, imgW, imgH) {
  const width = Math.max(1, Math.round(Number(imgW) || 1));
  const height = Math.max(1, Math.round(Number(imgH) || 1));
  const x = qaClamp01(label && label.x);
  const y = qaClamp01(label && label.y);
  const w = qaClamp01(label && label.w);
  const h = qaClamp01(label && label.h);
  const x1 = qaPixelCoord(x, width);
  const y1 = qaPixelCoord(y, height);
  const x2 = qaPixelCoord(Math.min(1, x + w), width);
  const y2 = qaPixelCoord(Math.min(1, y + h), height);
  return {
    x1: Math.min(x1, x2),
    y1: Math.min(y1, y2),
    x2: Math.max(x1, x2),
    y2: Math.max(y1, y2),
  };
}

function qaPixelArrow(label, imgW, imgH) {
  const start = qaPixelPoint(label, imgW, imgH);
  return {
    x1: start.x,
    y1: start.y,
    x2: qaPixelCoord(label && label.x2, imgW),
    y2: qaPixelCoord(label && label.y2, imgH),
  };
}

function qaEncodeAgentNote(design, impl, labels) {
  const implW = Math.max(0, Math.round((impl && impl.width) || 0));
  const implH = Math.max(0, Math.round((impl && impl.height) || 0));
  const designW = Math.max(0, Math.round((design && design.width) || 0));
  const designH = Math.max(0, Math.round((design && design.height) || 0));
  const designId = design && design.nodeId ? design.nodeId : 'not-captured';
  const lines = [
    '```klic-qa-note v1',
    'source: KLIC Figma Toolkit Design QA',
    'design-node: ' + designId + ' ' + designW + 'x' + designH,
    'size: ' + implW + 'x' + implH,
    'scale: 1 image px = 1 uploaded image px',
    'coordinate-space: implementation image pixels, origin top-left',
  ];
  const items = labels || [];
  if (!items.length) {
    lines.push('labels: none');
  }
  items.forEach((label, i) => {
    const kind = label && label.kind === 'point' ? 'point' : label && label.kind === 'arrow' ? 'arrow' : 'rect';
    const category = qaSanitizeAgentNoteText(label && label.category ? label.category : 'other').replace(/"/g, "'");
    if (kind === 'point') {
      const p = qaPixelPoint(label, implW || 1, implH || 1);
      lines.push('[' + (i + 1) + '] point (' + p.x + ',' + p.y + ') "' + category + '"');
    } else if (kind === 'arrow') {
      const a = qaPixelArrow(label, implW || 1, implH || 1);
      lines.push('[' + (i + 1) + '] arrow (' + a.x1 + ',' + a.y1 + ')->(' + a.x2 + ',' + a.y2 + ') "' + category + '"');
    } else {
      const r = qaPixelRect(label, implW || 1, implH || 1);
      lines.push('[' + (i + 1) + '] rect (' + r.x1 + ',' + r.y1 + ')-(' + r.x2 + ',' + r.y2 + ') "' + category + '"');
    }
    const note = qaSanitizeAgentNoteText((label && label.note) || '').replace(/\s+$/, '');
    if (note) {
      note.split(/\r?\n/).forEach((line) => {
        lines.push('    ' + line);
      });
    }
  });
  lines.push('hint: Match each [n] to the numbered point/rect/arrow marker in the KLIC Design QA board or overlay. Coordinates are implementation screenshot pixels.');
  lines.push('```');
  return lines.join('\n') + '\n';
}

function qaUpdateAgentNote() {
  const textarea = document.getElementById('qa-agent-note');
  if (!textarea) return '';
  const text = qaEncodeAgentNote(qaDesign, qaImpl, qaLabels);
  textarea.value = text;
  return text;
}

function qaSelectAgentNote() {
  const textarea = document.getElementById('qa-agent-note');
  const result = document.getElementById('qa-result');
  if (!textarea) return;
  textarea.focus();
  textarea.select();
  if (result) result.textContent = t('designqa.noteSelected');
}

function qaCopyAgentNote() {
  const text = qaUpdateAgentNote();
  const result = document.getElementById('qa-result');
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      if (result) result.textContent = t('designqa.noteCopied');
    }).catch(() => qaSelectAgentNote());
  } else {
    qaSelectAgentNote();
  }
}

function qaRenderLabels() {
  const list = document.getElementById('qa-label-list');
  list.innerHTML = '';
  qaLabels.forEach((label, i) => {
    const row = document.createElement('div');
    row.className = 'fix-c-item';
    const num = document.createElement('strong');
    num.textContent = (i + 1) + '. ' + (label.kind || 'rect') + ' ';
    const note = document.createElement('input');
    note.type = 'text'; note.className = 'grow'; note.value = label.note || '';
    note.setAttribute('data-i18n-ph', 'designqa.notePh');
    note.placeholder = t('designqa.notePh');
    note.addEventListener('input', () => { label.note = note.value; qaUpdateAgentNote(); });
    const cat = document.createElement('select');
    cat.className = 'col-select';
    QA_CATEGORIES.forEach(c => {
      const o = document.createElement('option');
      o.value = c; o.textContent = t('designqa.cat.' + c);
      if (label.category === c) o.selected = true;
      cat.appendChild(o);
    });
    cat.addEventListener('change', () => { label.category = cat.value; qaUpdateAgentNote(); });
    const del = document.createElement('button');
    del.className = 'link-btn'; del.textContent = '×';
    del.title = t('designqa.removeLabel');
    del.setAttribute('aria-label', t('designqa.removeLabel'));
    del.addEventListener('click', () => { qaLabels.splice(i, 1); qaRedrawOverlay(); qaRenderLabels(); });
    row.appendChild(num); row.appendChild(note); row.appendChild(cat); row.appendChild(del);
    list.appendChild(row);
  });
  qaUpdateAgentNote();
}

function qaRedrawOverlay() {
  const canvas = document.getElementById('qa-label-overlay');
  const img = document.getElementById('qa-impl-img');
  if (!img.naturalWidth) return;
  const dispW = img.clientWidth, dispH = img.clientHeight;
  canvas.width = dispW; canvas.height = dispH;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, dispW, dispH);
  const colors = ['#E63636', '#2563EB', '#16A34A', '#9333EA', '#D97706', '#0891B2', '#525252'];
  qaLabels.forEach((label, i) => {
    const color = colors[i % colors.length];
    const x = label.x * dispW, y = label.y * dispH;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    if (label.kind === 'point') {
      ctx.beginPath();
      ctx.arc(x, y, 7, 0, Math.PI * 2);
      ctx.stroke();
      qaDrawOverlayBadge(ctx, x + 14, y - 14, i, color);
    } else if (label.kind === 'arrow') {
      const x2 = label.x2 * dispW, y2 = label.y2 * dispH;
      qaDrawOverlayArrow(ctx, x, y, x2, y2, color);
      qaDrawOverlayBadge(ctx, x + 14, y - 14, i, color);
    } else {
      const w = label.w * dispW, h = label.h * dispH;
      ctx.strokeRect(x, y, w, h);
      qaDrawOverlayBadge(ctx, x, y - 16, i, color);
    }
  });
}

function qaDrawOverlayBadge(ctx, x, y, index, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, 24, 16);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 12px Inter, sans-serif';
  ctx.fillText(String(index + 1), x + 4, y + 12);
}

function qaDrawOverlayArrow(ctx, x1, y1, x2, y2, color) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const head = 10;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - Math.cos(angle - Math.PI / 6) * head, y2 - Math.sin(angle - Math.PI / 6) * head);
  ctx.lineTo(x2 - Math.cos(angle + Math.PI / 6) * head, y2 - Math.sin(angle + Math.PI / 6) * head);
  ctx.closePath();
  ctx.fill();
}

function qaInitOverlay() {
  const canvas = document.getElementById('qa-label-overlay');
  const img = document.getElementById('qa-impl-img');
  const stage = document.getElementById('qa-impl-stage');
  const scope = () => qaImpl && img.naturalWidth;
  function pos(evt) {
    const r = canvas.getBoundingClientRect();
    return { x: Math.max(0, Math.min(r.width, evt.clientX - r.left)), y: Math.max(0, Math.min(r.height, evt.clientY - r.top)) };
  }
  canvas.addEventListener('mousedown', (evt) => {
    if (!scope(evt)) return;
    qaDrawing = { ...pos(evt), shift: evt.shiftKey };
  });
  window.addEventListener('mousemove', (evt) => {
    if (!qaDrawing) return;
    const p = pos(evt);
    const ctx = canvas.getContext('2d');
    qaRedrawOverlay();
    ctx.strokeStyle = '#E63636'; ctx.lineWidth = 2;
    const x = Math.min(qaDrawing.x, p.x), y = Math.min(qaDrawing.y, p.y), w = Math.abs(p.x - qaDrawing.x), h = Math.abs(p.y - qaDrawing.y);
    if (qaDrawing.shift || evt.shiftKey) qaDrawOverlayArrow(ctx, qaDrawing.x, qaDrawing.y, p.x, p.y, '#E63636');
    else ctx.strokeRect(x, y, w, h);
  });
  window.addEventListener('mouseup', (evt) => {
    if (!qaDrawing) return;
    const start = qaDrawing;
    const p = pos(evt);
    const r = canvas.getBoundingClientRect();
    const x = Math.min(start.x, p.x), y = Math.min(start.y, p.y), w = Math.abs(p.x - start.x), h = Math.abs(p.y - start.y);
    qaDrawing = null;
    if (w < 6 && h < 6) {
      qaLabels.push({ id: 'l' + Date.now(), kind: 'point', x: qaClamp01(p.x / r.width), y: qaClamp01(p.y / r.height), note: '', category: 'other' });
    } else if (start.shift || evt.shiftKey) {
      qaLabels.push({
        id: 'l' + Date.now(),
        kind: 'arrow',
        x: qaClamp01(start.x / r.width),
        y: qaClamp01(start.y / r.height),
        x2: qaClamp01(p.x / r.width),
        y2: qaClamp01(p.y / r.height),
        note: '',
        category: 'other',
      });
    } else {
      const norm = qaNormalizeRect({ x, y, w, h }, r.width, r.height);
      qaLabels.push({ id: 'l' + Date.now(), kind: 'rect', x: norm.x, y: norm.y, w: norm.w, h: norm.h, note: '', category: 'other' });
    }
    qaRedrawOverlay();
    qaRenderLabels();
  });
  img.addEventListener('load', qaRedrawOverlay);
  window.addEventListener('resize', qaRedrawOverlay);
  stage.addEventListener('dragover', (e) => e.preventDefault());
  stage.addEventListener('drop', (e) => {
    e.preventDefault();
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) qaLoadImplFile(file);
  });
}

function qaLoadImplFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
  file.arrayBuffer().then((buf) => {
    const bytes = new Uint8Array(buf);
    const probe = new Image();
    const probeUrl = qaBytesToObjectUrl(bytes);
    probe.onload = () => {
      URL.revokeObjectURL(probeUrl);
      const plan = qaPlanImageScale(probe.naturalWidth, probe.naturalHeight);
      if (plan.factor === 1) {
        qaSetImplImage(bytes, plan.width, plan.height);
        qaSetImplImageResult(t('designqa.implLoaded', plan.width, plan.height));
        return;
      }
      const canvas = document.createElement('canvas');
      canvas.width = plan.width;
      canvas.height = plan.height;
      canvas.getContext('2d').drawImage(probe, 0, 0, plan.width, plan.height);
      qaCanvasToPngBytes(canvas).then((scaledBytes) => {
        qaSetImplImage(scaledBytes, plan.width, plan.height);
        qaSetImplImageResult(t('designqa.implScaled', probe.naturalWidth, probe.naturalHeight, plan.width, plan.height));
      }).catch(() => {
        document.getElementById('qa-result').textContent = t('designqa.errEncodeFailed');
      });
    };
    probe.onerror = () => {
      URL.revokeObjectURL(probeUrl);
      document.getElementById('qa-result').textContent = t('designqa.errEncodeFailed');
    };
    probe.src = probeUrl;
  });
}

function qaRenderRasterResult(msg) {
  const hint = document.getElementById('qa-design-hint');
  const img = document.getElementById('qa-design-img');
  if (msg.error) {
    if (msg.error === 'encode-failed') {
      hint.textContent = t('designqa.errEncodeFailed');
    } else if (msg.error === 'no-selection' || msg.error === 'page-not-allowed' || msg.error === 'unsupported-type') {
      hint.textContent = t('designqa.noDesign');
    } else {
      hint.textContent = t('designqa.errDefault');
    }
    return;
  }
  qaDesign = { bytes: msg.bytes, width: msg.width, height: msg.height, nodeId: msg.nodeId };
  qaDesignObjectUrl = qaReplaceObjectUrl(img, msg.bytes, qaDesignObjectUrl);
  hint.textContent = msg.width + ' × ' + msg.height;
  qaUpdateAgentNote();
}

function qaRenderCommitResult(msg) {
  const result = document.getElementById('qa-result');
  if (msg.error === 'design-unreachable') {
    result.textContent = t('designqa.errDesignUnreachable');
  } else if (msg.error) {
    result.textContent = t('designqa.errDefault');
  } else {
    result.textContent = t('designqa.committed') + ' (' + (msg.labelCount || 0) + ')';
    qaLabels = [];
    qaRenderLabels();
    qaRedrawOverlay();
    qaUpdateAgentNote();
  }
}

document.getElementById('qa-capture').addEventListener('click', () => {
  parent.postMessage({ pluginMessage: { type: 'qa-rasterize-request' } }, '*');
});
document.getElementById('qa-impl-file').addEventListener('change', (e) => {
  const file = e.target.files && e.target.files[0];
  if (file) qaLoadImplFile(file);
});
const qaUrlInput = document.getElementById('qa-url');
qaUrlInput.addEventListener('change', () => {
  const frame = document.getElementById('qa-url-frame');
  const blocked = document.getElementById('qa-url-blocked');
  const url = qaUrlInput.value.trim();
  if (!url) { frame.style.display = 'none'; blocked.style.display = 'none'; return; }
  frame.style.display = 'block';
  blocked.style.display = 'none';
  frame.onload = () => { blocked.style.display = 'none'; };
  frame.onerror = () => { blocked.style.display = 'block'; };
  frame.src = url;
});
document.getElementById('qa-commit').addEventListener('click', () => {
  const result = document.getElementById('qa-result');
  if (!qaDesign) { result.textContent = t('designqa.noDesign'); return; }
  if (!qaImpl) { result.textContent = t('designqa.noImpl'); return; }
  parent.postMessage({
    pluginMessage: {
      type: 'qa-commit-board',
      designNodeId: qaDesign.nodeId,
      designW: qaDesign.width, designH: qaDesign.height,
      implBytes: qaImpl.bytes, implW: qaImpl.width, implH: qaImpl.height,
      labels: qaLabels.map(l => ({ id: l.id, kind: l.kind || 'rect', x: l.x, y: l.y, x2: l.x2, y2: l.y2, w: l.w, h: l.h, note: l.note, category: l.category })),
    },
  }, '*');
  result.textContent = '';
});
document.getElementById('qa-copy-note').addEventListener('click', () => {
  qaCopyAgentNote();
  commandGuidedSetStep('designqa', 'done', 'command.guidedComplete');
});
qaInitOverlay();
qaUpdateAgentNote();
