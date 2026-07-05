/* ═══════════════════════════════════════════════════════════════════════════
   KLIC Figma Toolkit — merged plugin
   Modules: Menu Page · Style Guide · Table
   Message types are namespaced (menu-*, style-*, table-*) to avoid collisions.
   ═══════════════════════════════════════════════════════════════════════════ */

var KLIC_RUNTIME_SMOKE_COMMAND = 'run-smoke-evidence';

figma.showUI(__html__, { width: 720, height: 820, title: 'KLIC Figma Toolkit' });

if (figma.command === KLIC_RUNTIME_SMOKE_COMMAND) {
  setTimeout(function () {
    runCommandSmokeTest({ postToLocalhost: true });
  }, 0);
} else {
  setTimeout(function () {
    commandMaybeRunLocalSmokeEvidence();
  }, 0);
}

figma.ui.onmessage = async function (msg) {
  if (!msg || !msg.type) return;

  switch (msg.type) {
    case 'ui-resize': return resizePluginUi(msg.size);

    /* ── Command Center ── */
    case 'command-refresh':                return refreshCommandCenter(msg);
    case 'command-cancel-scan':            return cancelCommandScan();
    case 'command-preview-color-bindings': return previewColorBindings(msg);
    case 'command-apply-color-bindings':   return applyColorBindings(msg);
    case 'command-kwcag-krds-audit':       return runKwcagKrdsAudit(msg);
    case 'command-component-qa':           return runComponentQa(msg);
    case 'command-token-governance':       return runTokenGovernance();
    case 'command-run-smoke-test':         return runCommandSmokeTest();
    case 'command-export-tokens':          return exportCommandTokens();
    case 'command-create-report-board':    return createCommandReportBoard(msg);
    case 'command-collect-fixes':          return commandCollectFixes(msg);
    case 'command-apply-fixes':            return commandApplyFixes(msg);
    case 'command-open-folder-maker':      return openFolderMaker();

    /* ── Table ── */
    case 'table-ready':       return sendTableVariables();
    case 'table-generate':    return generateTable(msg);

    /* ── Menu ── */
    case 'menu-generate':     return generatePages(msg.menuData, msg.meta);
    case 'menu-register-template': return registerSelectedMenuTemplate();

    /* ── Style Guide ── */
    case 'style-create-variables':  return createVariables(msg.data, msg.meta);
    case 'style-draw':              return drawStyleGuide(msg.data, msg.meta);
    case 'style-create-components': return createComponents(msg.data, msg.meta);
    case 'style-search-fonts':      return searchFonts(msg.query, msg.requestId);

    /* ── Design QA ── */
    case 'qa-rasterize-request':    return qaRasterizeSelection(msg);
    case 'qa-commit-board':         return qaCommitBoard(msg);

    /* ── Shared ── */
    case 'cancel':            return figma.closePlugin();
  }
};

function resizePluginUi(size) {
  var presets = {
    compact: { width: 560, height: 720 },
    default: { width: 720, height: 820 },
    wide: { width: 960, height: 860 },
  };
  var next = presets[size] || presets.default;
  figma.ui.resize(next.width, next.height);
  figma.ui.postMessage({ type: 'ui-resized', size: presets[size] ? size : 'default', width: next.width, height: next.height });
}

function openFolderMaker() {
  figma.ui.postMessage({ type: 'command-folder-maker-fallback' });
}
