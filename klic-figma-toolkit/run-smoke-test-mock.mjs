import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const code = fs.readFileSync(path.join(root, 'code.js'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

let idCounter = 1;
function nextId(prefix) {
  return `${prefix}:${idCounter++}`;
}

const nodeMap = new Map();

class BaseNode {
  constructor(type) {
    this.id = nextId(type);
    this.type = type;
    this.name = type;
    this.width = 0;
    this.height = 0;
    this._pluginData = {};
    nodeMap.set(this.id, this);
  }

  setPluginData(key, value) {
    this._pluginData[key] = value;
  }

  getPluginData(key) {
    return this._pluginData[key] || '';
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
  }

  clone() {
    const cloned = new this.constructor();
    cloned.name = this.name;
    cloned.width = this.width;
    cloned.height = this.height;
    cloned.x = this.x;
    cloned.y = this.y;
    cloned.fills = Array.isArray(this.fills) ? JSON.parse(JSON.stringify(this.fills)) : this.fills;
    cloned.strokes = Array.isArray(this.strokes) ? JSON.parse(JSON.stringify(this.strokes)) : this.strokes;
    return cloned;
  }
}

class ContainerNode extends BaseNode {
  constructor(type) {
    super(type);
    this.children = [];
  }

  appendChild(node) {
    if (node.parent && node.parent.children) {
      node.parent.children = node.parent.children.filter((child) => child !== node);
    }
    node.parent = this;
    this.children.push(node);
  }

  findAll(predicate) {
    const out = [];
    const visit = (node) => {
      if (predicate(node)) out.push(node);
      if ('children' in node) node.children.forEach(visit);
    };
    this.children.forEach(visit);
    return out;
  }

  findOne(predicate) {
    return this.findAll(predicate)[0] || null;
  }

  clone() {
    const cloned = super.clone();
    this.children.forEach((child) => cloned.appendChild(child.clone()));
    return cloned;
  }
}

class PageNode extends ContainerNode {
  constructor() {
    super('PAGE');
    this.selection = [];
    this.name = 'Page 1';
  }
}

class RectangleNode extends BaseNode {
  constructor() {
    super('RECTANGLE');
    this.fills = [];
    this.strokes = [];
  }
}

class FrameNode extends ContainerNode {
  constructor() {
    super('FRAME');
    this.fills = [];
    this.strokes = [];
  }
}

class ComponentNode extends FrameNode {
  constructor() {
    super();
    this.type = 'COMPONENT';
    this.name = 'Component';
  }

  createInstance() {
    const instance = new InstanceNode(this);
    instance.resize(this.width, this.height);
    return instance;
  }
}

class InstanceNode extends FrameNode {
  constructor(mainComponent) {
    super();
    this.type = 'INSTANCE';
    this.name = `${mainComponent.name} Instance`;
    this.mainComponent = mainComponent;
  }
}

class ComponentSetNode extends FrameNode {
  constructor() {
    super();
    this.type = 'COMPONENT_SET';
    this.name = 'Component Set';
  }
}

class TextNode extends BaseNode {
  constructor() {
    super('TEXT');
    this.characters = '';
    this.fills = [];
    this.fontName = { family: 'Inter', style: 'Regular' };
  }

  clone() {
    const cloned = super.clone();
    cloned.characters = this.characters;
    cloned.fontName = this.fontName;
    return cloned;
  }
}

class VariableCollection {
  constructor(name) {
    this.id = nextId('collection');
    this.name = name;
    this.defaultModeId = `${this.id}:mode`;
  }
}

class Variable {
  constructor(name, collection, resolvedType) {
    this.id = nextId('variable');
    this.name = name;
    this.variableCollectionId = collection.id;
    this.resolvedType = resolvedType;
    this.valuesByMode = {};
  }

  setValueForMode(modeId, value) {
    this.valuesByMode[modeId] = value;
  }

  remove() {
    this.removed = true;
    const idx = variables.indexOf(this);
    if (idx >= 0) variables.splice(idx, 1);
  }
}

const page = new PageNode();
const rootNode = { children: [page] };
const collections = [];
const variables = [];
const postedMessages = [];
const resizeCalls = [];

const figma = {
  currentPage: page,
  root: rootNode,
  viewport: {
    center: { x: 400, y: 300 },
    scrollAndZoomIntoView() {},
  },
  ui: {
    onmessage: null,
    postMessage(message) {
      postedMessages.push(message);
    },
    resize(width, height) {
      resizeCalls.push({ width, height });
    },
  },
  showUI() {},
  commitUndoCount: 0,
  commitUndo() {
    this.commitUndoCount++;
  },
  createRectangle() {
    return new RectangleNode();
  },
  createFrame() {
    return new FrameNode();
  },
  createComponent() {
    return new ComponentNode();
  },
  createPage() {
    const newPage = new PageNode();
    newPage.name = `Page ${rootNode.children.length + 1}`;
    rootNode.children.push(newPage);
    return newPage;
  },
  combineAsVariants(components, parent) {
    const set = new ComponentSetNode();
    components.forEach((component) => set.appendChild(component));
    set.resize(
      Math.max(160, ...components.map((component) => component.width || 0)),
      Math.max(40, components.reduce((sum, component) => sum + (component.height || 40), 0)),
    );
    parent.appendChild(set);
    return set;
  },
  createText() {
    return new TextNode();
  },
  loadFontAsync() {
    return Promise.resolve();
  },
  listAvailableFontsAsync() {
    return Promise.resolve([
      { fontName: { family: 'Inter', style: 'Regular' } },
      { fontName: { family: 'Inter', style: 'Medium' } },
      { fontName: { family: 'Inter', style: 'SemiBold' } },
      { fontName: { family: 'Inter', style: 'Bold' } },
    ]);
  },
  getLocalPagesAsync() {
    return Promise.resolve(rootNode.children);
  },
  setCurrentPageAsync(nextPage) {
    figma.currentPage = nextPage;
    return Promise.resolve();
  },
  getNodeById(id) {
    return nodeMap.get(id) || null;
  },
  getNodeByIdAsync(id) {
    return Promise.resolve(nodeMap.get(id) || null);
  },
  variables: {
    getLocalVariableCollectionsAsync() {
      return Promise.resolve(collections);
    },
    createVariableCollection(name) {
      const collection = new VariableCollection(name);
      collections.push(collection);
      return collection;
    },
    getLocalVariablesAsync(type) {
      return Promise.resolve(type ? variables.filter((variable) => variable.resolvedType === type) : variables);
    },
    createVariable(name, collection, resolvedType) {
      const variable = new Variable(name, collection, resolvedType);
      variables.push(variable);
      return variable;
    },
    getVariableByIdAsync(id) {
      return Promise.resolve(variables.find((variable) => variable.id === id) || null);
    },
    setBoundVariableForPaint(paint, field, variable) {
      return {
        ...paint,
        boundVariables: {
          ...(paint.boundVariables || {}),
          [field]: { type: 'VARIABLE_ALIAS', id: variable.id },
        },
      };
    },
  },
};

const context = vm.createContext({
  figma,
  __html__: '<html></html>',
  console,
  Math,
  Date,
  JSON,
  Object,
  Array,
  String,
  Number,
  Boolean,
  parseInt,
  parseFloat,
  setTimeout,
  Promise,
});

vm.runInContext(code, context, { filename: 'code.js' });

assert(typeof figma.ui.onmessage === 'function', 'figma.ui.onmessage was not registered');

await figma.ui.onmessage({ type: 'ui-resize', size: 'wide' });
assert(resizeCalls.at(-1)?.width === 960 && resizeCalls.at(-1)?.height === 860, 'ui-resize wide preset did not resize the plugin UI');
assert(postedMessages.some((message) => message.type === 'ui-resized' && message.size === 'wide'), 'ui-resize did not post ui-resized acknowledgement');

await figma.ui.onmessage({ type: 'command-open-folder-maker' });
assert(postedMessages.some((message) => message.type === 'command-folder-maker-fallback'), 'command-open-folder-maker did not post the Folder Maker fallback message');

await figma.ui.onmessage({ type: 'command-run-smoke-test' });

const result = postedMessages.find((message) => message.type === 'command-smoke-test-result');
assert(result, 'command-smoke-test-result was not posted');
assert(result.passed === true, `smoke test failed: ${result.message || 'unknown'}`);
assert(result.evidence, 'smoke test result should include machine-readable evidence');
assert(result.evidence.passCount === 11 && result.evidence.failCount === 0, 'smoke evidence should include pass/fail counts');
assert(result.evidence.nodeId === result.nodeId && result.evidence.reportNodeId === result.reportNodeId, 'smoke evidence should include created node ids');
assert(result.evidence.componentSetId && result.evidence.componentInstanceId, 'smoke evidence should include component runtime artifact ids');
assert(result.evidence.generatedAt, 'smoke evidence should include generatedAt timestamp');
assert(result.evidence.runtime?.kind === 'mock-runtime', 'mock smoke evidence should be marked as mock-runtime');
assert(result.evidence.runtime?.editorType === 'mock', 'mock smoke evidence should expose mock editorType');
const evidenceOutFlagIndex = process.argv.indexOf('--write-evidence');
if (evidenceOutFlagIndex >= 0) {
  const evidenceOutPath = process.argv[evidenceOutFlagIndex + 1];
  assert(evidenceOutPath, '--write-evidence requires a file path');
  fs.writeFileSync(evidenceOutPath, JSON.stringify(result.evidence, null, 2));
}

const checks = result.smokeChecks || [];
for (const checkName of [
  'Create local COLOR variable',
  'Create selectable test node',
  'Detect RGB exact token match',
  'Apply RGB exact binding',
  'Verify boundVariables.color',
  'Export token data available',
  'Create component node',
  'Create component instance',
  'Combine component variants',
  'Create report board with pluginData',
  'Persist smoke-test pluginData',
]) {
  const check = checks.find((item) => item.name === checkName);
  assert(check && check.passed, `smoke check failed or missing: ${checkName}`);
}

const rect = figma.getNodeById(result.nodeId);
assert(rect, 'smoke-test rectangle was not created');
assert(rect.fills[0].boundVariables?.color?.id === result.variableId, 'rectangle fill was not bound to smoke variable');
assert(rect.getPluginData('klic.meta').includes('smokeTestPassed'), 'smoke-test rectangle is missing pluginData');
const smokeReport = figma.getNodeById(result.reportNodeId);
assert(smokeReport, 'smoke-test report board was not created');
const reportText = smokeReport.children.filter((child) => child.type === 'TEXT').map((child) => child.characters).join('\n');
assert(reportText.includes('Create local COLOR variable'), 'smoke-test report board should list detailed runtime checks');
assert(reportText.includes('Combine component variants'), 'smoke-test report board should list component runtime checks');
assert(reportText.includes('Runtime smoke test: passed'), 'smoke-test report board should show pass/fail status');
assert(smokeReport.getPluginData('klic.meta').includes('failCount'), 'smoke-test report board pluginData should persist evidence counts');

await figma.ui.onmessage({ type: 'table-ready' });
const tableVariables = postedMessages.find((message) => message.type === 'table-variables');
assert(tableVariables, 'table-ready did not post table-variables');
assert(
  tableVariables.variables.some((variable) => variable.name === 'Smoke/Primary' && variable.collection === 'KLIC Smoke Test'),
  'table-ready did not expose async local COLOR variables',
);

const tableGenerateMessageStart = postedMessages.length;
await figma.ui.onmessage({
  type: 'table-generate',
  headerRows: [['Name', 'Amount', 'Status']],
  bodyRows: [['Alpha', '1200', 'Ready']],
  footerRows: [],
  striped: false,
  paddingV: 8,
  paddingH: 12,
  minColW: 72,
  fontSize: 14,
  minRowH: 36,
  tableWidth: 600,
  colors: {},
  columnAlignments: ['left', 'right', 'center'],
  meta: {
    tableConfig: {
      preset: 'compact',
      columnAlignments: ['left', 'right', 'center'],
    },
    diagnostics: { warningCount: 0 },
  },
});
const tableGenerateMessages = postedMessages.slice(tableGenerateMessageStart);
const generatedTableDone = tableGenerateMessages.find((message) => message.type === 'table-done');
const generatedTableError = tableGenerateMessages.find((message) => message.type === 'table-error');
assert(generatedTableDone, `table-generate should create a table with inferred column alignment: ${generatedTableError?.message || 'no response posted'}`);
const generatedTables = page.children.filter((child) => child.name === 'Table');
const generatedTable = generatedTables.at(-1);
assert(generatedTable, 'table-generate should append a Table frame to the current page');
const generatedTableTexts = generatedTable.findAll((node) => node.type === 'TEXT');
assert(generatedTableTexts.some((node) => node.characters === 'Alpha' && node.textAlignHorizontal === 'LEFT'), 'table-generate should left-align text columns');
assert(generatedTableTexts.some((node) => node.characters === '1200' && node.textAlignHorizontal === 'RIGHT'), 'table-generate should right-align numeric columns');
assert(generatedTableTexts.some((node) => node.characters === 'Ready' && node.textAlignHorizontal === 'CENTER'), 'table-generate should center-align status columns');
const generatedTableMeta = JSON.parse(generatedTable.getPluginData('klic.meta'));
assert(generatedTableMeta.tableConfig?.preset === 'compact', 'table-generate should preserve preset metadata in pluginData');
assert(generatedTableMeta.tableConfig?.columnAlignments?.join(',') === 'left,right,center', 'table-generate should preserve column alignment metadata in pluginData');

const styleData = {
  brand: {
    Blue: { scale: { 50: '#1188EE' } },
  },
  gray: { scale: { 90: '#1E293B' } },
  semantic: {
    Success: { base: '#15803D' },
  },
  spacing: [8],
  radius: [4],
};
await figma.ui.onmessage({ type: 'style-create-variables', data: styleData });
const styleDone = postedMessages.find((message) => message.type === 'style-done');
assert(styleDone && styleDone.count === 5, 'style-create-variables did not finish against async variable APIs');
assert(
  variables.some((variable) => variable.name === 'Blue/50' && variable.resolvedType === 'COLOR'),
  'style-create-variables did not create async COLOR variables',
);
assert(
  variables.some((variable) => variable.name === 'spacing-8' && variable.resolvedType === 'FLOAT'),
  'style-create-variables did not create async FLOAT variables',
);

function latestMessage(type) {
  return postedMessages.filter((message) => message.type === type).at(-1);
}

await figma.ui.onmessage({
  type: 'style-create-components',
  data: {
    ...styleData,
    buttonTypes: ['Primary', 'Gray'],
    buttonStates: ['Default', 'Hover'],
    buttonSizes: [{ name: 'S', h: 32, fs: 12, fw: 400 }],
    buttonIconSizes: { S: 18 },
    inputSizes: [{ name: 'S', h: 32, fs: 12, fw: 400 }],
    inputStates: ['Default', 'Focus'],
    inputContents: ['Placeholder', 'Value'],
  },
  meta: { sourceName: 'mock-component-regression' },
});
const componentDone = latestMessage('style-comp-done');
const componentError = latestMessage('style-error');
assert(componentDone, `style-create-components did not finish in mock runtime: ${componentError?.message || 'no error posted'}`);
assert(componentDone.btnVariantCount > 0, 'style-create-components should create button variants');
assert(componentDone.inputVariantCount > 0, 'style-create-components should create input variants');
assert(
  rootNode.children.some((mockPage) => mockPage.name === '📦 Components'),
  'style-create-components should create or reuse the Components page through async page APIs',
);
figma.currentPage = page;

const menuTemplatePage = figma.createPage();
menuTemplatePage.name = 'Menu Template';
const menuTemplate = figma.createFrame();
menuTemplate.name = '[sub_page]';
menuTemplate.resize(320, 180);
const menuTitleBox = figma.createFrame();
menuTitleBox.name = '페이지정보';
const menuTitleText = figma.createText();
menuTitleText.characters = 'Template title';
menuTitleBox.appendChild(menuTitleText);
menuTemplate.appendChild(menuTitleBox);
const menuPathBox = figma.createFrame();
menuPathBox.name = '페이지 경로';
const menuPathText = figma.createText();
menuPathText.characters = 'Template path';
menuPathBox.appendChild(menuPathText);
menuTemplate.appendChild(menuPathBox);
menuTemplatePage.appendChild(menuTemplate);
figma.currentPage = page;
await figma.ui.onmessage({
  type: 'menu-generate',
  menuData: [{ name: '공지사항', path: '알림마당 > 공지사항' }],
  meta: { sourceName: 'mock-menu-template-page', diagnostics: { warningCount: 3 } },
});
const menuDone = latestMessage('menu-done');
const menuError = latestMessage('menu-error');
assert(menuDone, `menu-generate should find [sub_page] on another local page: ${menuError?.message || 'no error posted'}`);
const generatedMenuFrame = menuTemplatePage.children.find((child) => child.name === 'sub_page_공지사항');
assert(generatedMenuFrame, 'menu-generate should append the generated page next to the source template');
assert(generatedMenuFrame.findOne((node) => node.type === 'TEXT' && node.characters === '공지사항'), 'menu-generate should update 페이지정보 text in cloned frame');
assert(generatedMenuFrame.findOne((node) => node.type === 'TEXT' && node.characters === '알림마당 > 공지사항'), 'menu-generate should update 페이지 경로 text in cloned frame');
const generatedMenuMeta = JSON.parse(generatedMenuFrame.getPluginData('klic.meta'));
assert(generatedMenuMeta.diagnostics?.warningCount === 3, 'menu-generate should preserve diagnostic warning counts in pluginData');
rootNode.children = rootNode.children.filter((mockPage) => mockPage !== menuTemplatePage);
figma.currentPage = page;

const selectableMenuTemplate = figma.createFrame();
selectableMenuTemplate.name = 'Custom Menu Template';
selectableMenuTemplate.resize(240, 120);
const selectableTitleBox = figma.createFrame();
selectableTitleBox.name = '페이지정보';
selectableTitleBox.appendChild(figma.createText());
selectableMenuTemplate.appendChild(selectableTitleBox);
page.appendChild(selectableMenuTemplate);
page.selection = [selectableMenuTemplate];
const registerMessageStart = postedMessages.length;
await figma.ui.onmessage({ type: 'menu-register-template' });
const registerMessages = postedMessages.slice(registerMessageStart);
const registeredTemplateMessage = registerMessages.find((message) => message.type === 'menu-template-registered');
const registerError = registerMessages.find((message) => message.type === 'menu-error');
assert(registeredTemplateMessage, `menu-register-template should register the selected frame: ${registerError?.message || 'no response posted'}`);
assert(selectableMenuTemplate.name === '[sub_page]', 'menu-register-template should rename the selected frame to [sub_page]');
assert(selectableMenuTemplate.getPluginData('klic.meta').includes('menu-template'), 'menu-register-template should tag the selected frame as a menu template');
page.children = page.children.filter((child) => child !== selectableMenuTemplate);
page.selection = [];

const fallbackMessageStart = postedMessages.length;
await figma.ui.onmessage({
  type: 'menu-generate',
  menuData: [{ name: 'FAQ', path: '고객센터 > FAQ' }],
  meta: { sourceName: 'mock-menu-fallback-template' },
});
const fallbackMessages = postedMessages.slice(fallbackMessageStart);
const fallbackMenuDone = fallbackMessages.find((message) => message.type === 'menu-done');
const fallbackMenuError = fallbackMessages.find((message) => message.type === 'menu-error');
assert(fallbackMenuDone && fallbackMenuDone.count === 1, `menu-generate should create a fallback [sub_page] template when missing: ${fallbackMenuError?.message || 'no error posted'}`);
const fallbackTemplate = page.children.find((child) => child.name === '[sub_page]');
assert(fallbackTemplate, 'menu-generate should create a fallback [sub_page] frame on the current page');
const fallbackGeneratedFrame = page.children.find((child) => child.name === 'sub_page_FAQ');
assert(fallbackGeneratedFrame, 'menu-generate should create pages from the fallback template');
assert(fallbackGeneratedFrame.findOne((node) => node.type === 'TEXT' && node.characters === 'FAQ'), 'fallback generated page should update 페이지정보 text');
assert(fallbackGeneratedFrame.findOne((node) => node.type === 'TEXT' && node.characters === '고객센터 > FAQ'), 'fallback generated page should update 페이지 경로 text');

const blueVar = variables.find((variable) => variable.name === 'Blue/50' && variable.resolvedType === 'COLOR');
assert(blueVar, 'Blue/50 variable is missing before RGB/OKLCH regression checks');

const alphaExactRect = figma.createRectangle();
alphaExactRect.name = 'KLIC Alpha Exact Regression';
alphaExactRect.fills = [{ type: 'SOLID', color: { r: 0.0666666667, g: 0.5333333333, b: 0.9333333333 }, opacity: 0.5 }];
page.appendChild(alphaExactRect);

const oklchRect = figma.createRectangle();
oklchRect.name = 'KLIC OKLCH Regression';
oklchRect.fills = [{ type: 'SOLID', color: { r: 0.0705882353, g: 0.537254902, b: 0.9254901961 } }];
page.appendChild(oklchRect);
page.selection = [alphaExactRect, oklchRect];

await figma.ui.onmessage({
  type: 'command-preview-color-bindings',
  scope: 'selection',
  options: {
    scanLimit: 100,
    oklchThreshold: 0.08,
    collectionPriority: '컬러/브랜드',
  },
});
const bindingPreview = latestMessage('command-bindings-preview');
assert(bindingPreview, 'command-preview-color-bindings did not post a preview');
assert(
  !bindingPreview.items.some((item) => item.nodeId === alphaExactRect.id && item.matchType === 'rgb-exact'),
  'RGB exact matching should not auto-select semi-transparent paints',
);
const oklchItem = bindingPreview.items.find((item) => item.nodeId === oklchRect.id && item.matchType === 'oklch-suggested');
assert(oklchItem, 'near RGB paint did not produce an OKLCH suggestion');
assert(oklchItem.variableId === blueVar.id, 'OKLCH suggestion did not respect collection priority');
assert(oklchItem.oklchDelta && typeof oklchItem.oklchDelta.l === 'number', 'OKLCH suggestion is missing designer-facing delta details');

await figma.ui.onmessage({
  type: 'command-apply-color-bindings',
  scope: 'selection',
  changes: [oklchItem],
  options: { includeOklchApply: false },
});
const skippedApply = latestMessage('command-apply-result');
assert(skippedApply && skippedApply.applied === 0 && skippedApply.skipped === 1, 'OKLCH apply should be skipped without explicit opt-in');
assert(!oklchRect.fills[0].boundVariables?.color, 'OKLCH suggestion was bound without explicit opt-in');

await figma.ui.onmessage({
  type: 'command-apply-color-bindings',
  scope: 'selection',
  changes: [oklchItem],
  options: { includeOklchApply: true },
});
const optedInApply = latestMessage('command-apply-result');
assert(optedInApply && optedInApply.applied === 1, 'OKLCH apply should work with explicit opt-in');
assert(oklchRect.fills[0].boundVariables?.color?.id === blueVar.id, 'OKLCH opt-in apply did not bind the suggested variable');

const accessibilityFrame = figma.createFrame();
accessibilityFrame.name = 'KLIC Accessibility Regression';
accessibilityFrame.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
page.appendChild(accessibilityFrame);
const lowContrastText = figma.createText();
lowContrastText.name = 'Low contrast label';
lowContrastText.characters = 'Low contrast label';
lowContrastText.fontSize = 14;
lowContrastText.fills = [{ type: 'SOLID', color: { r: 0.72, g: 0.72, b: 0.72 } }];
accessibilityFrame.appendChild(lowContrastText);
const lowContrastIcon = figma.createRectangle();
lowContrastIcon.name = 'Low contrast icon';
lowContrastIcon.resize(24, 24);
lowContrastIcon.fills = [{ type: 'SOLID', color: { r: 0.82, g: 0.82, b: 0.82 } }];
accessibilityFrame.appendChild(lowContrastIcon);
const smallButton = figma.createFrame();
smallButton.name = 'Small Button';
smallButton.resize(32, 32);
smallButton.fills = [{ type: 'SOLID', color: { r: 0.05, g: 0.45, b: 0.9 } }];
accessibilityFrame.appendChild(smallButton);
page.selection = [accessibilityFrame];
await figma.ui.onmessage({ type: 'command-kwcag-krds-audit', scope: 'selection', options: { scanLimit: 100 } });
const kwcagKrdsAudit = latestMessage('command-kwcag-krds-audit-result');
assert(kwcagKrdsAudit, 'command-kwcag-krds-audit did not post KWCAG/KRDS results');
assert(kwcagKrdsAudit.summary?.issueCount >= 1, 'KWCAG/KRDS audit should detect at least one contrast issue');
assert(kwcagKrdsAudit.summary.standard === 'KWCAG 2.2 + KRDS', 'KWCAG/KRDS audit should expose the applied standard');
const contrastIssue = kwcagKrdsAudit.issues.find((issue) => issue.nodeId === lowContrastText.id && issue.type === 'kwcag-text-contrast');
assert(contrastIssue, 'KWCAG/KRDS audit should report low text contrast');
assert(contrastIssue.rule === 'KWCAG 2.2 텍스트 콘텐츠의 명도 대비 / KRDS 4.5:1 text label contrast', 'KWCAG/KRDS issue should include the Korean rule mapping');
assert(contrastIssue.contrastRatio < contrastIssue.requiredRatio, 'KWCAG/KRDS issue should include failing contrast ratio');
const nonTextIssue = kwcagKrdsAudit.issues.find((issue) => issue.nodeId === lowContrastIcon.id && issue.type === 'kwcag-non-text-contrast');
assert(nonTextIssue, 'KWCAG/KRDS audit should report low non-text contrast');
assert(nonTextIssue.requiredRatio === 3, 'KWCAG/KRDS non-text contrast should require 3:1');
const targetIssue = kwcagKrdsAudit.issues.find((issue) => issue.nodeId === smallButton.id && issue.type === 'krds-target-size');
assert(targetIssue, 'KWCAG/KRDS audit should report small interactive target size');
assert(targetIssue.minSize === 44, 'KRDS target size should require 44px minimum');

const brokenComponent = figma.createComponent();
brokenComponent.name = 'Broken Button';
brokenComponent.resize(120, 40);
const brokenLabel = figma.createText();
brokenLabel.name = 'Label';
brokenLabel.characters = 'Broken';
brokenComponent.appendChild(brokenLabel);
page.appendChild(brokenComponent);
const loneVariant = figma.createComponent();
loneVariant.name = 'State=Only';
loneVariant.resize(120, 40);
page.appendChild(loneVariant);
const incompleteSet = figma.combineAsVariants([loneVariant], page);
incompleteSet.name = 'Incomplete Button';
page.selection = [brokenComponent, incompleteSet];
await figma.ui.onmessage({ type: 'command-component-qa', scope: 'selection', options: { scanLimit: 100 } });
const componentQa = latestMessage('command-component-qa-result');
assert(componentQa, 'command-component-qa did not post component QA results');
assert(componentQa.summary?.issueCount >= 4, 'component QA should detect naming, coverage, focus-state, and auto-layout issues');
assert(componentQa.issues.some((issue) => issue.nodeId === brokenComponent.id && issue.type === 'component-naming'), 'component QA should report missing variant naming');
assert(componentQa.issues.some((issue) => issue.nodeId === brokenComponent.id && issue.type === 'component-focus-state'), 'component QA should report missing KWCAG/KRDS focus state coverage');
assert(componentQa.issues.some((issue) => issue.nodeId === brokenComponent.id && issue.type === 'component-autolayout'), 'component QA should report missing interactive component auto-layout');
assert(componentQa.issues.some((issue) => issue.nodeId === incompleteSet.id && issue.type === 'component-set-coverage'), 'component QA should report component sets with fewer than two variants');

const governanceCollection = collections.find((collectionItem) => collectionItem.name === '컬러/브랜드');
const duplicateToken = figma.variables.createVariable('Blue/Duplicate', governanceCollection, 'COLOR');
duplicateToken.setValueForMode(governanceCollection.defaultModeId, { r: 0.0666666667, g: 0.5333333333, b: 0.9333333333 });
const flatToken = figma.variables.createVariable('FlatToken', governanceCollection, 'COLOR');
flatToken.setValueForMode(governanceCollection.defaultModeId, { r: 0.1, g: 0.1, b: 0.1 });
await figma.ui.onmessage({ type: 'command-token-governance' });
const tokenGovernance = latestMessage('command-token-governance-result');
assert(tokenGovernance, 'command-token-governance did not post token governance results');
assert(tokenGovernance.summary?.issueCount >= 2, 'token governance should detect duplicate and naming issues');
assert(tokenGovernance.issues.some((issue) => issue.type === 'token-duplicate-value' && issue.hex === '#1188EE'), 'token governance should report duplicate color values');
assert(tokenGovernance.issues.some((issue) => issue.type === 'token-naming' && issue.name === 'FlatToken'), 'token governance should report flat token naming');

const menuNode = figma.createFrame();
menuNode.name = 'KLIC Menu Provenance Regression';
menuNode.setPluginData('klic.meta', JSON.stringify({
  tool: 'menu-page',
  sourceName: '메뉴샘플.csv',
  selectedCategories: ['콘텐츠'],
  rowCount: 25,
  selectedCount: 14,
}));
page.appendChild(menuNode);

const styleNode = figma.createFrame();
styleNode.name = 'KLIC Style Provenance Regression';
styleNode.setPluginData('klic.meta', JSON.stringify({
  tool: 'style-guide',
  styleMdHash: 'abc123',
  styleMdLength: 2048,
  fontFamily: 'Pretendard',
}));
page.appendChild(styleNode);

const tableNode = figma.createFrame();
tableNode.name = 'KLIC Table Provenance Regression';
tableNode.setPluginData('klic.meta', JSON.stringify({
  tool: 'table-builder',
  tableConfig: { striped: true, headerRows: 1, bodyRows: 3 },
  diagnostics: { warningCount: 2 },
}));
page.appendChild(tableNode);

page.selection = [];
await figma.ui.onmessage({ type: 'command-refresh', scope: 'page', options: { scanLimit: 500 } });
const provenanceSnapshot = latestMessage('command-snapshot');
assert(provenanceSnapshot?.data?.provenanceSummary, 'Command Center snapshot is missing provenanceSummary');
assert(provenanceSnapshot.data.provenanceSummary.tools['menu-page'] >= 1, 'provenanceSummary does not count menu-page nodes');
assert(provenanceSnapshot.data.provenanceSummary.tools['style-guide'] === 1, 'provenanceSummary does not count style-guide nodes');
assert(provenanceSnapshot.data.provenanceSummary.tools['table-builder'] >= 2, 'provenanceSummary does not count table-builder nodes');
assert(provenanceSnapshot.data.provenanceSummary.diagnosticWarnings >= 2, 'provenanceSummary does not count diagnostic warning totals');
assert(provenanceSnapshot.data.provenanceSummary.sources['메뉴샘플.csv'] === 1, 'provenanceSummary does not expose menu CSV sources');
assert(provenanceSnapshot.data.provenanceSummary.categories['콘텐츠'] === 1, 'provenanceSummary does not expose selected menu categories');
assert(provenanceSnapshot.data.provenanceSummary.styleMdHashes.abc123 === 1, 'provenanceSummary does not expose style MD hashes');
assert(provenanceSnapshot.data.provenanceSummary.tableConfigs >= 2, 'provenanceSummary does not count table configs');

await figma.ui.onmessage({ type: 'command-export-tokens' });
const handoffExport = latestMessage('command-handoff-export');
assert(handoffExport, 'command-export-tokens did not post handoff export');
assert(handoffExport.summary?.diagnosticWarnings >= 2, 'handoff export summary should include diagnostic warning totals');
const handoffJson = JSON.parse(handoffExport.json);
assert(Array.isArray(handoffJson.tokens) && handoffJson.tokens.length > 0, 'handoff export JSON should include tokens array');
assert(handoffJson.audit && handoffJson.audit.nodeCount >= 1, 'handoff export JSON should include audit metrics');
assert(handoffJson.audit.provenanceSummary?.sources?.['메뉴샘플.csv'] === 1, 'handoff export JSON should include provenance summary');
assert(Array.isArray(handoffJson.audit.previewItems), 'handoff export JSON should include binding preview items');
assert(handoffExport.css.includes('--'), 'handoff export CSS should include CSS variables');
assert(handoffExport.dtcgJson, 'handoff export should include DTCG JSON');
const dtcgJson = JSON.parse(handoffExport.dtcgJson);
assert(dtcgJson.$schema && dtcgJson.$schema.includes('designtokens.org'), 'DTCG JSON should include design tokens schema');
assert(dtcgJson.color?.['KLIC Smoke Test']?.Smoke?.Primary?.$type === 'color', 'DTCG JSON should group color tokens by collection/path');
assert(dtcgJson.color['KLIC Smoke Test'].Smoke.Primary.$value === '#12A0FB', 'DTCG JSON should preserve token hex value');
assert(handoffJson.dtcg && handoffJson.dtcg.format === 'DTCG', 'handoff export JSON should reference DTCG payload metadata');
assert(handoffExport.summary && handoffExport.summary.tokenCount === handoffJson.tokens.length, 'handoff export should include machine-readable summary');

// ── Batch Auto-Fix: engine skeleton ──
page.children = [];  // Clear all nodes to ensure empty fix queue
page.selection = [];
figma.commitUndoCount = 0;
await figma.ui.onmessage({ type: 'command-collect-fixes', scope: 'page', options: { scanLimit: 500 } });
const fixesPreview = latestMessage('command-fixes-preview');
assert(fixesPreview, 'command-collect-fixes did not post command-fixes-preview');
assert(typeof fixesPreview.counts === 'object', 'fixes preview should include counts object');

await figma.ui.onmessage({ type: 'command-apply-fixes', tier: 'AB' });
const fixesApplied = latestMessage('command-fixes-applied');
assert(fixesApplied, 'command-apply-fixes did not post command-fixes-applied');
assert(figma.commitUndoCount === 0, 'empty-queue apply must NOT push an undo entry (no work attempted)');

// ── Batch Auto-Fix: bindRawColor (Tier A) ──
const fixVar = figma.variables.createVariable('Fix/Primary', collections[0], 'COLOR');
fixVar.valuesByMode[collections[0].defaultModeId] = { r: 0.2, g: 0.4, b: 0.8 };
const rawRect = figma.createRectangle();
rawRect.name = 'Raw Fill Rect';
rawRect.fills = [{ type: 'SOLID', color: { r: 0.2, g: 0.4, b: 0.8 }, opacity: 1 }];
page.appendChild(rawRect);
page.selection = [rawRect];

await figma.ui.onmessage({ type: 'command-collect-fixes', scope: 'selection', options: { scanLimit: 100 } });
const bindPreview = latestMessage('command-fixes-preview');
assert(bindPreview.counts.A >= 1, 'bindRawColor should contribute a Tier A fix for an exact-match raw color');
const bindItem = bindPreview.items.find((it) => it.providerId === 'bindRawColor');
assert(bindItem, 'preview should include a bindRawColor item');

await figma.ui.onmessage({ type: 'command-apply-fixes', tier: 'AB' });
assert(rawRect.fills[0].boundVariables && rawRect.fills[0].boundVariables.color, 'bindRawColor should bind the matching variable to the paint');

// ── Batch Auto-Fix: name normalization (Tier A/B) ──
const trimNode = figma.createFrame();
trimNode.name = '  Spaced   Name  ';
page.appendChild(trimNode);
const defaultNode = figma.createRectangle();
defaultNode.name = 'Rectangle 5';
page.appendChild(defaultNode);
page.selection = [trimNode, defaultNode];

await figma.ui.onmessage({ type: 'command-collect-fixes', scope: 'selection', options: { scanLimit: 100 } });
const namePreview = latestMessage('command-fixes-preview');
const trimItem = namePreview.items.find((it) => it.providerId === 'trimNodeName');
const renameItem = namePreview.items.find((it) => it.providerId === 'renameDefaultName');
assert(trimItem, 'trimNodeName should propose a fix for a node with extra whitespace');
assert(renameItem, 'renameDefaultName should propose a fix for a default-named node');
assert(trimItem.tier === 'A', 'trimNodeName is Tier A');
assert(renameItem.tier === 'B', 'renameDefaultName is Tier B');

await figma.ui.onmessage({ type: 'command-apply-fixes', tier: 'AB' });
assert(trimNode.name === 'Spaced Name', 'trimNodeName should collapse whitespace');
assert(defaultNode.name !== 'Rectangle 5', 'renameDefaultName should rename the default-named node');

// ── Batch Auto-Fix: consolidateDuplicateToken (Tier B) ──
// v1 posture: rebind-only — do NOT remove() the duplicate (Task 8 spike pending).
// Canonical has shorter name, duplicate has longer name (heuristic: shorter = canonical).
// State reset: pop-loop so closures referencing `variables` see the cleared array.
while (variables.length) variables.pop();
page.children = [];
page.selection = [];
figma.commitUndoCount = 0;

// Recreate the collection since we cleared variables (collections still intact).
const canonicalVar = figma.variables.createVariable('Blue', collections[0], 'COLOR');
canonicalVar.valuesByMode[collections[0].defaultModeId] = { r: 0.1, g: 0.3, b: 0.9 };
const dupVar = figma.variables.createVariable('Blue/Duplicate', collections[0], 'COLOR');
dupVar.valuesByMode[collections[0].defaultModeId] = { r: 0.1, g: 0.3, b: 0.9 };
const dupBoundRect = figma.createRectangle();
dupBoundRect.fills = [figma.variables.setBoundVariableForPaint({ type: 'SOLID', color: { r: 0.1, g: 0.3, b: 0.9 }, opacity: 1 }, 'color', dupVar)];
page.appendChild(dupBoundRect);
page.selection = [];

await figma.ui.onmessage({ type: 'command-collect-fixes', scope: 'page', options: { scanLimit: 500 } });
const dupPreview = latestMessage('command-fixes-preview');
const dupItem = dupPreview.items.find((it) => it.providerId === 'consolidateDuplicateToken' && it.preview && it.preview.before.includes('Blue/Duplicate'));
assert(dupItem, 'consolidateDuplicateToken should propose a fix for duplicate color values');

await figma.ui.onmessage({ type: 'command-apply-fixes', tier: 'AB' });
// v1: rebind must succeed — bound rect should point to canonical
assert(dupBoundRect.fills[0].boundVariables.color.id === canonicalVar.id, 'consolidate should rebind node to the canonical variable');
// v1: must NOT delete the duplicate — remove() is deferred to Task 8 spike
assert(dupVar.removed !== true, 'v1 must NOT delete the duplicate variable — rebind only; remove manually via Figma variables panel');

// ── Negative-path: rebind failure must not claim success and must not delete duplicate ──
// Reset state for a clean negative-path scenario.
while (variables.length) variables.pop();
page.children = [];
page.selection = [];
figma.commitUndoCount = 0;

const canon2 = figma.variables.createVariable('Red', collections[0], 'COLOR');
canon2.valuesByMode[collections[0].defaultModeId] = { r: 0.9, g: 0.1, b: 0.1 };
const dup2 = figma.variables.createVariable('Red/Duplicate', collections[0], 'COLOR');
dup2.valuesByMode[collections[0].defaultModeId] = { r: 0.9, g: 0.1, b: 0.1 };
const dup2BoundRect = figma.createRectangle();
dup2BoundRect.fills = [figma.variables.setBoundVariableForPaint({ type: 'SOLID', color: { r: 0.9, g: 0.1, b: 0.1 }, opacity: 1 }, 'color', dup2)];
page.appendChild(dup2BoundRect);
page.selection = [];

await figma.ui.onmessage({ type: 'command-collect-fixes', scope: 'page', options: { scanLimit: 500 } });
const negPreview = latestMessage('command-fixes-preview');
const negItem = negPreview.items.find((it) => it.providerId === 'consolidateDuplicateToken' && it.preview && it.preview.before.includes('Red/Duplicate'));
assert(negItem, 'negative-path: consolidateDuplicateToken should propose a fix for the Red/Duplicate scenario');

// Sabotage: remove the bound node from nodeMap so commandGetNodeById returns null → rebind returns false.
nodeMap.delete(dup2BoundRect.id);

const negApplyStart = postedMessages.length;
await figma.ui.onmessage({ type: 'command-apply-fixes', ids: [negItem.id] });
const negApplied = postedMessages.slice(negApplyStart).find((m) => m.type === 'command-fixes-applied');
assert(negApplied, 'negative-path: command-apply-fixes should still post command-fixes-applied even on failure');
assert(negApplied.applied === 0 && negApplied.skipped === 1, 'negative-path: provider should return false when rebind fails — applied=0, skipped=1');
// v1 safety: even on failure, duplicate must not be deleted
assert(dup2.removed !== true, 'negative-path: failed rebind must not delete the duplicate variable');

// ── Batch Auto-Fix: Tier C per-item (fixTargetSize) ──
// Tier C providers must NEVER be touched by the AB batch path (structural guard,
// hardened by Task 6). This block verifies the C path end-to-end via fixTargetSize.
page.children = [];
page.selection = [];
figma.commitUndoCount = 0;

const smallBtn = figma.createFrame();
smallBtn.name = 'Tiny Button';
smallBtn.resize(24, 24);
page.appendChild(smallBtn);
page.selection = [smallBtn];

await figma.ui.onmessage({ type: 'command-collect-fixes', scope: 'selection', options: { scanLimit: 100 } });
const cPreview = latestMessage('command-fixes-preview');
const sizeItem = cPreview.items.find((it) => it.providerId === 'fixTargetSize');
assert(sizeItem, 'fixTargetSize should propose a Tier C fix for an undersized target');
assert(sizeItem.tier === 'C', 'fixTargetSize is Tier C');

// AB batch must NOT touch Tier C items (safety guard — Task 6 hardens further)
await figma.ui.onmessage({ type: 'command-apply-fixes', tier: 'AB' });
assert(smallBtn.width === 24, 'AB batch must NOT apply Tier C fixes');

// Per-item apply
await figma.ui.onmessage({ type: 'command-apply-fixes', ids: [sizeItem.id] });
assert(smallBtn.width >= 44, 'fixTargetSize per-item apply should resize to >= 44px');
assert(smallBtn.height >= 44, 'fixTargetSize per-item apply should resize height to >= 44px');

// ── Batch Auto-Fix: Tier C per-item (fixContrast) ──
// fixContrast swaps the foreground fill to whichever of black/white passes 4.5:1.
// Background = white frame fill (set via parent), foreground = mid-gray text →
// black must pass, white must not. Provider should pick black.
page.children = [];
page.selection = [];
figma.commitUndoCount = 0;

const contrastFrame = figma.createFrame();
contrastFrame.name = 'Contrast Host';
contrastFrame.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
page.appendChild(contrastFrame);
const lowText = figma.createText();
lowText.name = 'Faint Text';
lowText.characters = 'faint';
lowText.fills = [{ type: 'SOLID', color: { r: 0.75, g: 0.75, b: 0.75 } }];
contrastFrame.appendChild(lowText);
page.selection = [lowText];

await figma.ui.onmessage({ type: 'command-collect-fixes', scope: 'selection', options: { scanLimit: 100 } });
const fcPreview = latestMessage('command-fixes-preview');
const contrastItem = fcPreview.items.find((it) => it.providerId === 'fixContrast');
assert(contrastItem, 'fixContrast should propose a Tier C fix for low-contrast text');
assert(contrastItem.tier === 'C', 'fixContrast is Tier C');
// preview.after exposes the chosen replacement color (human-readable) — white bg + mid-gray
// text → black is the only color that passes 4.5:1, so the deterministic pick is #000000.
assert(contrastItem.preview && contrastItem.preview.after === '#000000', 'fixContrast should choose #000000 against a white background');

// AB batch must NOT touch Tier C
await figma.ui.onmessage({ type: 'command-apply-fixes', tier: 'AB' });
assert(lowText.fills[0].color.r === 0.75, 'AB batch must NOT apply Tier C fixContrast');

// Per-item apply: foreground should now be the chosen black/white
await figma.ui.onmessage({ type: 'command-apply-fixes', ids: [contrastItem.id] });
const appliedColor = lowText.fills[0].color;
const isBlack = appliedColor.r === 0 && appliedColor.g === 0 && appliedColor.b === 0;
const isWhite = appliedColor.r === 1 && appliedColor.g === 1 && appliedColor.b === 1;
assert(isBlack || isWhite, 'fixContrast per-item apply should swap foreground to black or white');

// ── Batch Auto-Fix: suggestKrdsName (Tier C-suggest) — per-item ONLY ──
// KRDS/public-data term mapping is judgment-bearing and carries mistranslation
// risk, so it MUST NEVER be applied by the AB batch path (tier filter already
// excludes 'C-suggest'); it is applied ONLY via explicit per-item approval.
// This block is the core safety-guard regression for Task 6.
page.children = [];
page.selection = [];
figma.commitUndoCount = 0;

const krdsNode = figma.createFrame();
krdsNode.name = '로그인';
page.appendChild(krdsNode);
page.selection = [krdsNode];

await figma.ui.onmessage({ type: 'command-collect-fixes', scope: 'selection', options: { scanLimit: 100 } });
const krdsPreview = latestMessage('command-fixes-preview');
const krdsItem = krdsPreview.items.find((it) => it.providerId === 'suggestKrdsName');
assert(krdsItem, 'suggestKrdsName should propose a KRDS naming suggestion');
assert(krdsItem.tier === 'C-suggest', 'KRDS suggestion must be tier C-suggest');
assert(krdsPreview.counts.suggestion >= 1, 'preview counts should track suggestions separately');

// Safety guard: AB batch must NEVER apply C-suggest (KRDS) renames
const beforeName = krdsNode.name;
await figma.ui.onmessage({ type: 'command-apply-fixes', tier: 'AB' });
assert(krdsNode.name === beforeName, 'AB batch must NEVER apply C-suggest (KRDS) renames');

// Per-item explicit apply is the only allowed path
await figma.ui.onmessage({ type: 'command-apply-fixes', ids: [krdsItem.id] });
assert(krdsNode.name !== beforeName, 'KRDS suggestion should apply only via explicit per-item approval');
assert(krdsNode.name === 'login-area', 'KRDS provider should rename 로그인 → login-area');

console.log('Mock Figma runtime smoke test passed.');
