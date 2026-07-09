import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const uiPath = path.join(root, 'ui.html');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function findChrome() {
  const candidates = [
    process.env.CHROME_BIN,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/microsoft-edge',
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate)) || '';
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForExit(child) {
  if (child.exitCode !== null) return Promise.resolve();
  return new Promise((resolve) => child.once('exit', resolve));
}

async function removeDirWithRetry(dir) {
  for (let i = 0; i < 10; i++) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
      return;
    } catch (err) {
      await delay(100);
    }
  }
  console.warn(`KLIC UI visual smoke warning: could not remove temporary Chrome profile ${dir}`);
}

async function waitForJson(port, chrome) {
  const url = `http://127.0.0.1:${port}/json/list`;
  for (let i = 0; i < 60; i++) {
    if (chrome.exitCode !== null) break;
    try {
      const response = await fetch(url);
      if (response.ok) {
        const pages = await response.json();
        const page = pages.find((item) => item.type === 'page' && item.webSocketDebuggerUrl);
        if (page) return page;
      }
    } catch (err) {
      // Chrome is still starting.
    }
    await delay(100);
  }
  throw new Error('Chrome DevTools endpoint did not become available');
}

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    ws.addEventListener('open', () => resolve(ws), { once: true });
    ws.addEventListener('error', () => reject(new Error('Cannot connect to Chrome DevTools WebSocket')), { once: true });
  });
}

function createCdp(ws) {
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(`${message.error.message || 'CDP error'} (${message.error.code || 'unknown'})`));
    else resolve(message.result || {});
  });

  return function send(method, params = {}) {
    const messageId = ++id;
    ws.send(JSON.stringify({ id: messageId, method, params }));
    return new Promise((resolve, reject) => {
      pending.set(messageId, { resolve, reject });
    });
  };
}

async function run() {
  const chromeBin = findChrome();
  if (!chromeBin) {
    console.log('KLIC UI visual smoke skipped: Chrome binary not found.');
    return;
  }

  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'klic-chrome-profile-'));
  const port = 43000 + (process.pid % 10000);
  const screenshotArgIndex = process.argv.indexOf('--screenshot');
  const screenshotPath = screenshotArgIndex >= 0 ? path.resolve(process.cwd(), process.argv[screenshotArgIndex + 1] || '') : '';
  const chrome = spawn(chromeBin, [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--hide-scrollbars',
    '--window-size=720,1200',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    'about:blank',
  ], {
    stdio: ['ignore', 'ignore', 'pipe'],
  });

  let stderr = '';
  chrome.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  try {
    const page = await waitForJson(port, chrome);
    const ws = await connect(page.webSocketDebuggerUrl);
    const send = createCdp(ws);
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', {
      width: 720,
      height: 1200,
      deviceScaleFactor: 1,
      mobile: false,
    });
    const fileUrl = new URL(`file://${uiPath}`).href;
    await send('Page.navigate', { url: fileUrl });
    await send('Runtime.evaluate', {
      awaitPromise: true,
      expression: `
        new Promise((resolve) => {
          const wait = () => {
            if (document.readyState === 'complete' && typeof switchTool === 'function') resolve(true);
            else setTimeout(wait, 50);
          };
          wait();
        })
      `,
    });
    await send('Runtime.evaluate', {
      awaitPromise: true,
      expression: `
        switchTool('command');
        setLang('en');
        document.body.offsetHeight;
        true;
      `,
    });
    const commandResult = await send('Runtime.evaluate', {
      returnByValue: true,
      expression: `
        (() => {
          const rect = (el) => {
            const r = el.getBoundingClientRect();
            return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height, text: el.textContent.trim() };
          };
          const overlaps = (a, b) => {
            const x = Math.min(a.right, b.right) - Math.max(a.left, b.left);
            const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
            return x > 0.5 && y > 0.5;
          };
          const steps = [...document.querySelectorAll('#command-pipeline .pipeline-step')];
          const guidedSteps = [...document.querySelectorAll('#guided-workflow .guided-step')];
          const problems = [];
          for (let i = 0; i < steps.length; i++) {
            for (let j = i + 1; j < steps.length; j++) {
              if (overlaps(rect(steps[i]), rect(steps[j]))) problems.push({ stepIndex: i, otherStepIndex: j, type: 'pipeline-step-overlap' });
            }
          }
          return {
            activePane: document.querySelector('.tool-pane.active')?.id || '',
            projectType: document.getElementById('command-project-type')?.value || '',
            tablePreset: document.getElementById('table-preset')?.value || '',
            summary: document.getElementById('command-pipeline-summary')?.textContent.trim() || '',
            stepCount: steps.length,
            stepTitles: steps.map((step) => step.querySelector('.pipeline-step-title')?.textContent.trim() || ''),
            guidedStepCount: guidedSteps.length,
            guidedOverflow: guidedSteps.some((step) => step.scrollWidth > step.clientWidth + 1 || step.scrollHeight > step.clientHeight + 1),
            commandSideOverflow: [...document.querySelectorAll('.command-side .btn, .command-side .side-chip, .command-side h3')]
              .some((el) => el.scrollWidth > el.clientWidth + 1),
            problems,
            pipelineRect: rect(document.getElementById('command-pipeline')),
          };
        })()
      `,
    });
    const commandValue = commandResult.result?.value;
    assert(commandValue, 'Command visual smoke did not return pipeline metrics');
    assert(commandValue.activePane === 'pane-command', `Command pane is not active: ${commandValue.activePane}`);
    assert(commandValue.projectType === 'public-education', `default project type should be public-education, got ${commandValue.projectType}`);
    assert(commandValue.tablePreset === 'krds', `public/education preset should initialize table preset to krds, got ${commandValue.tablePreset}`);
    assert(commandValue.stepCount === 4, `Project Pipeline should render 4 steps, got ${commandValue.stepCount}`);
    assert(commandValue.guidedStepCount === 5, `Guided Workflow should render 5 tool steps, got ${commandValue.guidedStepCount}`);
    assert(commandValue.guidedOverflow === false, 'Guided Workflow controls should not overflow their containers');
    assert(commandValue.commandSideOverflow === false, 'Command Center side controls should not overflow their containers');
    for (const title of ['Setup', 'Generate', 'QA', 'Handoff']) {
      assert(commandValue.stepTitles.includes(title), `Project Pipeline is missing ${title}`);
    }
    assert(commandValue.problems.length === 0, `Project Pipeline has overlapping layout boxes: ${JSON.stringify(commandValue.problems)}`);

    const workspaceResult = await send('Runtime.evaluate', {
      returnByValue: true,
      expression: `
        (() => {
          const checks = {};
          switchTool('qa');
          checks.qaPane = document.querySelector('.tool-pane.active')?.id || '';
          checks.qaActions = [...document.querySelectorAll('#pane-qa button')].map((el) => el.id).filter(Boolean);
          checks.qaResultList = !!document.getElementById('qa-result-list');
          switchTool('handoff');
          checks.handoffPane = document.querySelector('.tool-pane.active')?.id || '';
          checks.handoffActions = [...document.querySelectorAll('#pane-handoff button')].map((el) => el.id).filter(Boolean);
          checks.handoffResultList = !!document.getElementById('handoff-result-list');
          switchTool('style');
          checks.stylePane = document.querySelector('.tool-pane.active')?.id || '';
          checks.styleBindingList = !!document.getElementById('style-binding-list');
          return checks;
        })()
      `,
    });
    const workspaceValue = workspaceResult.result?.value;
    assert(workspaceValue?.qaPane === 'pane-qa', `QA tool tab should activate pane-qa, got ${workspaceValue?.qaPane}`);
    assert(workspaceValue.qaActions.includes('command-kwcag-krds-audit'), 'QA pane should expose KWCAG/KRDS audit');
    assert(workspaceValue.qaActions.includes('command-component-qa'), 'QA pane should expose Component QA');
    assert(workspaceValue.qaActions.includes('command-token-governance'), 'QA pane should expose Token Governance');
    assert(workspaceValue.qaResultList === true, 'QA pane should include qa-result-list');
    assert(workspaceValue.handoffPane === 'pane-handoff', `Handoff tool tab should activate pane-handoff, got ${workspaceValue.handoffPane}`);
    assert(workspaceValue.handoffActions.includes('command-export-tokens'), 'Handoff pane should expose token export');
    assert(workspaceValue.handoffActions.includes('command-run-smoke-test'), 'Handoff pane should expose smoke test');
    assert(workspaceValue.handoffActions.includes('command-open-folder-maker'), 'Handoff pane should expose Folder Maker');
    assert(workspaceValue.handoffResultList === true, 'Handoff pane should include handoff-result-list');
    assert(workspaceValue.styleBindingList === true, 'Style pane should include style-binding-list');

    await send('Runtime.evaluate', {
      awaitPromise: true,
      expression: `
        switchTool('style');
        document.body.offsetHeight;
        true;
      `,
    });
    const langResult = await send('Runtime.evaluate', {
      returnByValue: true,
      expression: `
        (() => {
          document.getElementById('lang-ko').click();
          return {
            lang: document.documentElement.lang,
            koActive: document.getElementById('lang-ko').classList.contains('active'),
            enActive: document.getElementById('lang-en').classList.contains('active'),
            styleTitle: document.querySelector('#pane-style .panel-title')?.textContent.trim() || '',
            parseButton: document.getElementById('style-parse')?.textContent.trim() || '',
          };
        })()
      `,
    });
    const langValue = langResult.result?.value;
    assert(langValue?.lang === 'ko', `language click should switch document lang to ko, got ${langValue?.lang}`);
    assert(langValue.koActive === true && langValue.enActive === false, 'language click should switch active language button');
    assert(langValue.styleTitle === '스타일 가이드 변수 생성기', `language click should localize Style Guide title, got ${langValue.styleTitle}`);
    assert(langValue.parseButton === '분석하기', `language click should localize Style Guide actions, got ${langValue.parseButton}`);

    const result = await send('Runtime.evaluate', {
      returnByValue: true,
      expression: `
        (() => {
          const rows = [...document.querySelectorAll('#style-semantic-prev .semantic-row')];
          const chips = [...document.querySelectorAll('#style-semantic-prev .semantic-chip')];
          const swatches = [...document.querySelectorAll('#style-semantic-prev .semantic-swatch')];
          const labels = [...document.querySelectorAll('#style-semantic-prev .semantic-chip-label')].map((el) => el.textContent.trim());
          const names = [...document.querySelectorAll('#style-semantic-prev .semantic-name')].map((el) => el.textContent.trim());
          const rect = (el) => {
            const r = el.getBoundingClientRect();
            return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height, text: el.textContent.trim() };
          };
          const overlaps = (a, b) => {
            const x = Math.min(a.right, b.right) - Math.max(a.left, b.left);
            const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
            return x > 0.5 && y > 0.5;
          };
          const problems = [];
          rows.forEach((row, rowIndex) => {
            const name = row.querySelector('.semantic-name');
            const rowChips = [...row.querySelectorAll('.semantic-chip')];
            if (name) {
              const nameRect = rect(name);
              rowChips.forEach((chip, chipIndex) => {
                if (overlaps(nameRect, rect(chip))) problems.push({ rowIndex, chipIndex, type: 'name-chip-overlap' });
              });
            }
            for (let i = 0; i < rowChips.length; i++) {
              for (let j = i + 1; j < rowChips.length; j++) {
                if (overlaps(rect(rowChips[i]), rect(rowChips[j]))) problems.push({ rowIndex, chipIndex: i, otherChipIndex: j, type: 'chip-chip-overlap' });
              }
            }
          });
          return {
            activePane: document.querySelector('.tool-pane.active')?.id || '',
            rowCount: rows.length,
            chipCount: chips.length,
            swatchCount: swatches.length,
            names,
            labels,
            problems,
            previewRect: rect(document.querySelector('#style-semantic-prev')),
          };
        })()
      `,
    });

    const value = result.result?.value;
    assert(value, 'Visual smoke did not return layout metrics');
    assert(value.activePane === 'pane-style', `Style pane is not active: ${value.activePane}`);
    assert(value.rowCount === 4, `semantic preview should render 4 rows, got ${value.rowCount}`);
    assert(value.chipCount === 16, `semantic preview should render 16 chips, got ${value.chipCount}`);
    assert(value.swatchCount === 16, `semantic preview should render 16 swatches, got ${value.swatchCount}`);
    for (const name of ['Semantic/Danger', 'Semantic/Warning', 'Semantic/Success', 'Semantic/Info']) {
      assert(value.names.includes(name), `semantic preview is missing ${name}`);
    }
    for (const label of ['Base', 'BG', 'Line', 'Text']) {
      assert(value.labels.includes(label), `semantic preview is missing ${label}`);
    }
    assert(value.problems.length === 0, `semantic preview has overlapping layout boxes: ${JSON.stringify(value.problems)}`);

    if (screenshotPath) {
      const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
      fs.writeFileSync(screenshotPath, Buffer.from(shot.data, 'base64'));
    }

    ws.close();
    console.log('KLIC UI visual smoke test passed.');
    console.log(JSON.stringify({
      activePane: value.activePane,
      rowCount: value.rowCount,
      chipCount: value.chipCount,
      swatchCount: value.swatchCount,
      problems: value.problems.length,
    }, null, 2));
  } finally {
    if (chrome.exitCode === null) {
      chrome.kill('SIGTERM');
      await Promise.race([waitForExit(chrome), delay(1000)]);
    }
    if (chrome.exitCode === null) {
      chrome.kill('SIGKILL');
      await Promise.race([waitForExit(chrome), delay(1000)]);
    }
    await removeDirWithRetry(profileDir);
    if (chrome.exitCode !== null && chrome.exitCode !== 0 && stderr) {
      process.stderr.write(stderr);
    }
  }
}

run().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
