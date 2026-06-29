figma.showUI(__html__, { width: 440, height: 600, title: '메뉴 페이지 생성기' });

figma.ui.onmessage = async (msg) => {
  if (msg.type === 'generate') {
    await generatePages(msg.menuData);
  } else if (msg.type === 'cancel') {
    figma.closePlugin();
  }
};

function findNode(parent, name) {
  return (
    parent.findOne(n => n.name === name) ||
    parent.findOne(n => n.name === `[${name}]`) ||
    parent.findOne(n => n.name.replace(/[\[\]]/g, '').trim() === name.trim())
  );
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

async function generatePages(menuData) {
  const page = figma.currentPage;

  const template =
    page.findOne(n => n.name === 'sub_page') ||
    page.findOne(n => n.name === '[sub_page]');

  if (!template) {
    figma.ui.postMessage({
      type: 'error',
      message: '[sub_page] 프레임을 현재 페이지에서 찾을 수 없습니다.\n레이어 이름을 확인해 주세요.'
    });
    return;
  }

  const templateParent = template.parent;
  const parentHasAutoLayout =
    'layoutMode' in templateParent && templateParent.layoutMode !== 'NONE';

  const GAP = 40;
  // 가로 배치: 원본 오른쪽부터 X축으로 나열
  let currentX = template.x + template.width + GAP;

  for (let i = 0; i < menuData.length; i++) {
    const { name, path } = menuData[i];

    const clone = template.clone();
    clone.name = `sub_page_${name}`;
    templateParent.appendChild(clone);

    if (!parentHasAutoLayout) {
      clone.x = currentX;
      clone.y = template.y;
      currentX += clone.width + GAP;
    }

    await updateTextIn('페이지정보', clone, name);
    await updateTextIn('페이지 경로', clone, path);

    figma.ui.postMessage({ type: 'progress', current: i + 1, total: menuData.length });
  }

  figma.viewport.scrollAndZoomIntoView([template]);
  figma.ui.postMessage({ type: 'done', count: menuData.length });
}
