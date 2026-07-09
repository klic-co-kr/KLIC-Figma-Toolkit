/* ═══════════════════════════════════════════════════════════════════════════
   MODULE: MENU PAGE GENERATOR
   ═══════════════════════════════════════════════════════════════════════════ */

function findNode(parent, name) {
  return (
    parent.findOne(n => n.name === name) ||
    parent.findOne(n => n.name === `[${name}]`) ||
    parent.findOne(n => n.name.replace(/[\[\]]/g, '').trim() === name.trim())
  );
}

function isMenuTemplateNode(node) {
  if (!node || !node.name) return false;
  return node.name.replace(/[\[\]]/g, '').trim().toLowerCase() === 'sub_page';
}

function findContainingPage(node) {
  var cur = node;
  while (cur && cur.type !== 'PAGE') cur = cur.parent;
  return cur || null;
}

async function findMenuTemplate() {
  var currentTemplate = figma.currentPage.findOne(isMenuTemplateNode);
  if (currentTemplate) {
    return {
      template: currentTemplate,
      page: figma.currentPage,
    };
  }

  var pages = await commandGetLocalPages();
  for (var i = 0; i < pages.length; i++) {
    var page = pages[i];
    if (page === figma.currentPage) continue;
    var template = page.findOne(isMenuTemplateNode);
    if (template) {
      return {
        template: template,
        page: findContainingPage(template) || page,
      };
    }
  }

  return null;
}

function registerSelectedMenuTemplate() {
  try {
    var selection = figma.currentPage.selection || [];
    var template = selection.find(function (node) {
      return node && typeof node.clone === 'function' && 'children' in node;
    });
    if (!template) {
      figma.ui.postMessage({
        type: 'menu-error',
        message: 'Select one frame, component, or instance to register as [sub_page].',
      });
      return;
    }
    template.name = '[sub_page]';
    tagKlicNode(template, 'menu-template', { source: 'selection-template' });
    figma.ui.postMessage({
      type: 'menu-template-registered',
      nodeId: template.id,
      nodeName: template.name,
    });
  } catch (err) {
    figma.ui.postMessage({ type: 'menu-error', message: err.message || String(err) });
  }
}

async function createDefaultMenuTemplate() {
  var titleFont = { family: 'Inter', style: 'Bold' };
  var bodyFont = { family: 'Inter', style: 'Regular' };
  await figma.loadFontAsync(titleFont);
  await figma.loadFontAsync(bodyFont);

  var template = figma.createFrame();
  template.name = '[sub_page]';
  template.resize(360, 220);
  template.x = figma.viewport.center.x - 180;
  template.y = figma.viewport.center.y - 110;
  template.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
  template.strokes = [{ type: 'SOLID', color: { r: 0.82, g: 0.84, b: 0.88 } }];
  template.cornerRadius = 16;

  var titleBox = figma.createFrame();
  titleBox.name = '페이지정보';
  titleBox.resize(300, 44);
  titleBox.x = 30;
  titleBox.y = 62;
  titleBox.fills = [];

  var titleText = figma.createText();
  titleText.name = '페이지명';
  titleText.fontName = titleFont;
  titleText.fontSize = 28;
  titleText.characters = '페이지명';
  titleText.x = 0;
  titleText.y = 0;
  titleBox.appendChild(titleText);
  template.appendChild(titleBox);

  var pathBox = figma.createFrame();
  pathBox.name = '페이지 경로';
  pathBox.resize(300, 28);
  pathBox.x = 30;
  pathBox.y = 122;
  pathBox.fills = [];

  var pathText = figma.createText();
  pathText.name = '경로';
  pathText.fontName = bodyFont;
  pathText.fontSize = 14;
  pathText.characters = '1차 > 2차 > 3차';
  pathText.x = 0;
  pathText.y = 0;
  pathText.fills = [{ type: 'SOLID', color: { r: 0.39, g: 0.45, b: 0.55 } }];
  pathBox.appendChild(pathText);
  template.appendChild(pathBox);

  tagKlicNode(template, 'menu-template', { source: 'menu-generator-fallback-template' });
  figma.currentPage.appendChild(template);

  return {
    template: template,
    page: figma.currentPage,
    createdFallback: true,
  };
}

async function loadFonts(textNode) {
  if (textNode.fontName !== figma.mixed) {
    await figma.loadFontAsync(textNode.fontName);
  } else {
    const len = textNode.characters.length;
    const seen = new Set();
    for (let i = 0; i < len; i++) {
      const font = textNode.getRangeFontName(i, i + 1);
      const key = JSON.stringify(font);
      if (!seen.has(key)) {
        seen.add(key);
        await figma.loadFontAsync(font);
      }
    }
  }
}

async function updateTextIn(containerName, parent, newText) {
  const container = findNode(parent, containerName);
  if (!container) return;
  const textNode = ('children' in container)
    ? container.findOne(n => n.type === 'TEXT')
    : (container.type === 'TEXT' ? container : null);
  if (!textNode) return;
  await loadFonts(textNode);
  textNode.characters = newText;
}

async function generatePages(menuData, meta) {
  var createdNodes = [];
  try {
    if (!Array.isArray(menuData) || menuData.length === 0) throw new Error('No menu data.');
    if (menuData.length > 500) throw new Error('Menu generation is limited to 500 pages per run.');
    menuData.forEach(function (item) {
      if (!item || typeof item.name !== 'string' || typeof item.path !== 'string') throw new Error('Invalid menu item.');
      if (item.name.length > 200 || item.path.length > 2000) throw new Error('Menu name or path is too long.');
    });
    const templateInfo = await findMenuTemplate() || await createDefaultMenuTemplate();

    const template = templateInfo.template;
    if (templateInfo.page && templateInfo.page !== figma.currentPage) {
      await commandSetCurrentPage(templateInfo.page);
    }

    const templateParent = template.parent;
    const parentHasAutoLayout =
      'layoutMode' in templateParent && templateParent.layoutMode !== 'NONE';

    const GAP = 40;
    let currentX = template.x + template.width + GAP;

    for (let i = 0; i < menuData.length; i++) {
      const { name, path } = menuData[i];

      const clone = template.clone();
      createdNodes.push(clone);
      clone.name = `sub_page_${name}`;
      tagKlicNode(clone, 'menu-page', Object.assign({
        source: 'menu-generator',
        menuName: name,
        path: path,
      }, normalizeMenuMeta(meta)));
      templateParent.appendChild(clone);

      if (!parentHasAutoLayout) {
        clone.x = currentX;
        clone.y = template.y;
        currentX += clone.width + GAP;
      }

      await updateTextIn('페이지정보', clone, name);
      await updateTextIn('페이지 경로', clone, path);

      figma.ui.postMessage({ type: 'menu-progress', current: i + 1, total: menuData.length });
    }

    figma.viewport.scrollAndZoomIntoView([template]);
    figma.ui.postMessage({ type: 'menu-done', count: menuData.length });
  } catch (err) {
    createdNodes.reverse().forEach(function (node) {
      if (node && typeof node.remove === 'function' && !node.removed) node.remove();
    });
    figma.ui.postMessage({ type: 'menu-error', message: err.message || String(err) });
  }
}
