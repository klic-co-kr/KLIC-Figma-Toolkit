import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(root, '..');

function run(label, command, args) {
  console.log(`\n[${label}] ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status}`);
  }
}

function runExpectFailure(label, command, args, expectedText) {
  console.log(`\n[${label}] ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status === 0) {
    throw new Error(`${label} unexpectedly passed`);
  }
  const output = `${result.stdout || ''}${result.stderr || ''}`;
  if (expectedText && !output.includes(expectedText)) {
    throw new Error(`${label} failed for the wrong reason; missing expected text: ${expectedText}`);
  }
}

function runWithInput(label, command, args, input) {
  console.log(`\n[${label}] ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: 'pipe',
    input,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status}`);
  }
}

function runWithInputExpectFailure(label, command, args, input, expectedText) {
  console.log(`\n[${label}] ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: 'pipe',
    input,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status === 0) {
    throw new Error(`${label} unexpectedly passed`);
  }
  const output = `${result.stdout || ''}${result.stderr || ''}`;
  if (expectedText && !output.includes(expectedText)) {
    throw new Error(`${label} failed for the wrong reason; missing expected text: ${expectedText}`);
  }
}

function runUiScriptSyntaxCheck() {
  const htmlPath = path.join(root, 'ui.html');
  const html = fs.readFileSync(htmlPath, 'utf8');
  const match = html.match(/<script>([\s\S]*)<\/script>/);
  if (!match) throw new Error('ui.html script tag missing');
  new Function(match[1]);
  console.log('ui.html script syntax check passed.');
}

function runNodeLauncherChecks() {
  const rootLauncherPath = path.join(repoRoot, 'KLIC-START.cmd');
  const rootLauncher = fs.readFileSync(rootLauncherPath, 'utf8');
  const macRootLauncherPath = path.join(repoRoot, 'KLIC-START.sh');
  const macRootLauncher = fs.readFileSync(macRootLauncherPath, 'utf8');
  const completionAudit = fs.readFileSync(path.join(root, 'run-completion-audit.mjs'), 'utf8');
  const rootLauncherNeedles = [
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
  ];
  for (const needle of rootLauncherNeedles) {
    if (!rootLauncher.includes(needle)) throw new Error(`KLIC-START.cmd is missing: ${needle}`);
  }
  const macRootLauncherNeedles = [
    'run-local-verification.mjs',
    'capture-runtime-evidence.sh',
    'run-completion-audit.sh',
    'watch-runtime-evidence.mjs',
    'watch-runtime-clipboard.sh',
    'watch-runtime-http.sh',
    'RUNTIME_CHECKLIST.md',
    'brew install node',
    'https://nodejs.org/',
    'https://www.figma.com/downloads/',
    'open -Ra Figma',
    'Figma desktop profile:',
    'Privacy & Security > Accessibility',
    '--preflight',
    '--capture-clipboard',
    '--audit <path>',
    '--watch-file <path>',
    '--watch-clipboard',
    '--watch-http',
    '--runtime-acceptance',
    '--wait-accessibility-runtime',
    '--open-accessibility',
    '--open-checklist',
    'wait_for_accessibility_runtime',
    'KLIC accessibility wait:',
    'After enabling Accessibility, run ./KLIC-START.sh --check, then rerun ./KLIC-START.sh --wait-accessibility-runtime',
    'run_runtime_acceptance',
    'open_figma_desktop',
    'Figma desktop: open request sent',
    'open_figma_design_file',
    'FigmaAgent design file open:',
    '/figma/desktop/open-url',
    'https://www.figma.com/design/new',
    'check_figma_agent_open_url',
    'FigmaAgent URL-open check:',
    'try_run_figma_plugin_menu',
    'run_runtime_acceptance_watchers',
    'KLIC runtime acceptance: watching localhost HTTP and clipboard evidence.',
    'KLIC auto menu launch skipped',
    'open any Figma design file first',
    'Run Runtime Smoke Evidence',
    'open_accessibility_settings',
    'Privacy_Accessibility',
    'Accessibility permission:',
    'accessibility_any_granted_clients',
    'Accessibility permission: no grants found in user TCC database',
    'accessibility_controller_hint',
    'Accessibility controller hint:',
    'apple_events_any_clients',
    'AppleEvents permission:',
  ];
  for (const needle of macRootLauncherNeedles) {
    if (!macRootLauncher.includes(needle)) throw new Error(`KLIC-START.sh is missing: ${needle}`);
  }
  const macMenuBody = (macRootLauncher.match(/run_menu\(\) \{[\s\S]*?read -r -p "Select: "/) || [])[0] || '';
  const macMenuNeedles = [
    '6. Watch localhost HTTP for Figma smoke evidence and audit',
    '7. Open runtime checklist',
    '8. Check Node.js and Figma desktop readiness',
    '9. Open macOS Accessibility privacy settings',
    '10. Run guided Figma runtime acceptance',
    '11. Wait for Accessibility, then run runtime acceptance',
  ];
  for (const needle of macMenuNeedles) {
    if (!macMenuBody.includes(needle)) throw new Error(`KLIC-START.sh interactive menu is missing: ${needle}`);
  }
  const completionAuditNeedles = [
    'tries to open a new Figma design file through FigmaAgent',
    'If FigmaAgent does not open a design file',
    'If Accessibility settings are already open, use ./KLIC-START.sh --wait-accessibility-runtime',
  ];
  for (const needle of completionAuditNeedles) {
    if (!completionAudit.includes(needle)) throw new Error(`run-completion-audit.mjs runtime guidance is missing: ${needle}`);
  }

  const launchers = [
    'run-local-verification.cmd',
    'run-completion-audit.cmd',
    'capture-runtime-evidence.cmd',
    'validate-smoke-evidence.cmd',
    'validate-style-token-json.cmd',
    'watch-runtime-evidence.cmd',
    'watch-runtime-clipboard.cmd',
  ];
  for (const launcher of launchers) {
    const filePath = path.join(root, launcher);
    const text = fs.readFileSync(filePath, 'utf8');
    if (!text.includes('where node')) throw new Error(`${launcher} does not check whether Node.js is installed.`);
    if (!text.includes('winget install OpenJS.NodeJS.LTS')) throw new Error(`${launcher} is missing Windows Node.js install guidance.`);
    if (!text.includes('https://nodejs.org/')) throw new Error(`${launcher} is missing Node.js download guidance.`);
  }

  const macLaunchers = [
    'capture-runtime-evidence.sh',
    'run-completion-audit.sh',
    'watch-runtime-clipboard.sh',
    'watch-runtime-http.sh',
  ];
  for (const launcher of macLaunchers) {
    const filePath = path.join(root, launcher);
    const text = fs.readFileSync(filePath, 'utf8');
    if (!text.startsWith('#!/usr/bin/env bash')) throw new Error(`${launcher} is missing a bash shebang.`);
    if (!text.includes('command -v node')) throw new Error(`${launcher} does not check whether Node.js is installed.`);
    if (!text.includes('brew install node')) throw new Error(`${launcher} is missing Homebrew Node.js install guidance.`);
    if (!text.includes('https://nodejs.org/')) throw new Error(`${launcher} is missing Node.js download guidance.`);
  }
  console.log('Node.js launcher guidance check passed.');
}

function runWindowsCmdSmokeChecks() {
  const probe = spawnSync('cmd.exe', ['/c', 'ver'], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  if (probe.error && probe.error.code === 'ENOENT') {
    console.log('Windows CMD smoke checks skipped: cmd.exe not found.');
    return;
  }
  if (probe.status !== 0) {
    throw new Error(`cmd.exe probe failed with exit code ${probe.status}`);
  }

  run('root launcher cmd smoke', 'cmd.exe', ['/c', 'echo 0| KLIC-START.cmd']);
  run('folder maker gui cmd smoke', 'cmd.exe', ['/c', 'folder-maker\\folder-maker-gui.cmd -SmokeTest']);
  run('folder maker bridge cmd smoke', 'cmd.exe', ['/c', 'folder-maker\\folder-maker-bridge.cmd -SmokeTest']);
  run('folder maker protocol installer dry run', 'cmd.exe', ['/c', 'folder-maker\\install-protocol.cmd --dry-run']);

  function toWindowsPath(filePath) {
    const match = filePath.match(/^\/mnt\/([a-zA-Z])\/(.*)$/);
    if (match) return `${match[1].toUpperCase()}:\\${match[2].replace(/\//g, '\\')}`;
    return filePath;
  }

  const caseDir = path.join(root, '.cmd-smoke');
  const csvPath = path.join(caseDir, 'folders.csv');
  const templatePath = path.join(caseDir, 'template.fig');
  const outDir = path.join(caseDir, 'out');
  fs.rmSync(caseDir, { recursive: true, force: true });
  fs.mkdirSync(caseDir, { recursive: true });
  fs.writeFileSync(csvPath, 'template,school,systemid\nT999,Cmd Smoke School,SYS999\n');
  fs.writeFileSync(templatePath, 'fig template smoke payload');
  try {
    run('folder maker create cmd smoke', 'cmd.exe', [
      '/c',
      `folder-maker\\folder-create.cmd -CsvPath "${toWindowsPath(csvPath)}" -OutDir "${toWindowsPath(outDir)}" -CopyFile "${toWindowsPath(templatePath)}" -RenameCopyToFolder -Execute`,
    ]);
    const copiedFile = path.join(outDir, 'T999_Cmd Smoke School_SYS999', 'T999_Cmd Smoke School_SYS999.fig');
    if (!fs.existsSync(copiedFile)) throw new Error(`Folder Maker CMD smoke did not copy template file: ${copiedFile}`);
  } finally {
    fs.rmSync(caseDir, { recursive: true, force: true });
  }
}

function runMacShellSmokeChecks() {
  if (process.platform === 'win32') {
    console.log('macOS/Linux shell smoke checks skipped: Windows platform.');
    return;
  }
  run('capture runtime evidence sh help', 'bash', ['klic-figma-toolkit/capture-runtime-evidence.sh', '--help']);
  run('completion audit sh help', 'bash', ['klic-figma-toolkit/run-completion-audit.sh', '--help']);
  run('clipboard watcher sh help', 'bash', ['klic-figma-toolkit/watch-runtime-clipboard.sh', '--help']);
  run('http receiver sh help', 'bash', ['klic-figma-toolkit/watch-runtime-http.sh', '--help']);
  run('root launcher sh help', 'bash', ['KLIC-START.sh', '--help']);
  run('root launcher sh readiness check', 'bash', ['KLIC-START.sh', '--check']);
}

function resolvePowerShellCommand() {
  for (const command of ['powershell.exe', 'pwsh']) {
    const probe = spawnSync(command, ['-NoProfile', '-Command', '$PSVersionTable.PSVersion.ToString()'], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: 'pipe',
    });
    if (probe.error && probe.error.code === 'ENOENT') continue;
    return command;
  }
  return null;
}

function runPowerShellScript(label, scriptPath) {
  const command = resolvePowerShellCommand();
  if (!command) {
    console.log(`\n[${label}] skipped: PowerShell not found.`);
    return;
  }
  const args = command === 'powershell.exe'
    ? ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath]
    : ['-NoProfile', '-File', scriptPath];
  run(label, command, args);
}

const evidencePath = path.join(os.tmpdir(), `klic-smoke-evidence-${process.pid}.json`);
const capturedMixedEvidencePath = path.join(os.tmpdir(), `klic-captured-mixed-evidence-${process.pid}.json`);
const styleTokenPath = path.join(os.tmpdir(), `klic-style-tokens-${process.pid}.json`);

function styleHashText(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  return Math.abs(hash).toString(16);
}

function extractStyleGuideParser() {
  const htmlPath = path.join(root, 'ui.html');
  const ui = fs.readFileSync(htmlPath, 'utf8');
  const parserMatch = ui.match(/function hexToHsl[\s\S]*?\nfunction renderSwatchRow/);
  if (!parserMatch) throw new Error('style guide parser block is missing or malformed');
  const parserBlock = parserMatch[0].replace(/\nfunction renderSwatchRow$/, '');
  const processMatch = ui.match(/function styleProcessData\(parsed\) \{[\s\S]*?\n\}/);
  if (!processMatch) throw new Error('style guide process function is missing or malformed');
  return Function(`${parserBlock}\n${processMatch[0]}\nreturn { parseMD, styleProcessData };`)();
}

function writeStyleTokenPayloadFromMd(filePath) {
  const mdPath = path.resolve(repoRoot, 'style-guide-viewer_ver2.md');
  const md = fs.readFileSync(mdPath, 'utf8');
  const { parseMD, styleProcessData } = extractStyleGuideParser();
  const parsed = parseMD(md);
  const data = styleProcessData(parsed);
  const payload = {
    sourceName: 'style-guide-viewer_ver2.md',
    md,
    meta: { styleMdHash: styleHashText(md), styleMdLength: md.length, fontFamily: data.fontFamily },
    data,
  };
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
}

function createForgedRuntimeEvidenceFixture() {
  const checks = [
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
  ].map((name) => ({ name, passed: true, detail: 'fixture' }));
  return {
    passed: true,
    passCount: checks.length,
    failCount: 0,
    nodeId: 'RECTANGLE:fixture',
    reportNodeId: 'FRAME:fixture-report',
    variableId: 'variable:fixture',
    componentSetId: 'COMPONENT_SET:fixture',
    componentInstanceId: 'INSTANCE:fixture',
    generatedAt: new Date().toISOString(),
    checks,
    runtime: {
      kind: 'figma-plugin',
      editorType: 'figma',
      apiVersion: '1.0.0',
      pluginId: 'com.klic.figma-toolkit',
    },
  };
}

try {
  run('integration', 'node', ['klic-figma-toolkit/verify-integration.mjs']);
  run('source split', 'node', ['klic-figma-toolkit/run-source-split-check.mjs']);
  run('ui roundtrip', 'node', ['klic-figma-toolkit/run-ui-roundtrip-smoke.mjs']);
  run('ui visual smoke', 'node', ['klic-figma-toolkit/run-ui-visual-smoke.mjs']);
  run('mock runtime', 'node', ['klic-figma-toolkit/run-smoke-test-mock.mjs']);
  run('mock evidence export', 'node', ['klic-figma-toolkit/run-smoke-test-mock.mjs', '--write-evidence', evidencePath]);
  run('smoke evidence validator', 'node', ['klic-figma-toolkit/validate-smoke-evidence.mjs', evidencePath]);
  runExpectFailure(
    'mock evidence rejection for completion',
    'node',
    ['klic-figma-toolkit/validate-smoke-evidence.mjs', '--require-figma-runtime', evidencePath],
    'not from a real Figma plugin runtime',
  );
  const forgedFixture = createForgedRuntimeEvidenceFixture();
  runWithInputExpectFailure(
    'forged runtime evidence rejection',
    'node',
    ['klic-figma-toolkit/capture-runtime-evidence.mjs', '--stdin', '--skip-audit', '--out', capturedMixedEvidencePath],
    `figma · API 1.0.0\nClipboard helper text\n${JSON.stringify(forgedFixture, null, 2)}\nend`,
    'fixture',
  );
  runPowerShellScript('folder maker parser', 'folder-maker/Test-FolderMaker.ps1');
  writeStyleTokenPayloadFromMd(styleTokenPath);
  run('style token validator', 'node', ['klic-figma-toolkit/validate-style-token-json.mjs', styleTokenPath]);
  run('code syntax', 'node', ['--check', 'klic-figma-toolkit/code.js']);
  run('evidence validator syntax', 'node', ['--check', 'klic-figma-toolkit/validate-smoke-evidence.mjs']);
  run('style token validator syntax', 'node', ['--check', 'klic-figma-toolkit/validate-style-token-json.mjs']);
  run('toolkit build syntax', 'node', ['--check', 'klic-figma-toolkit/build-toolkit.mjs']);
  run('source split check syntax', 'node', ['--check', 'klic-figma-toolkit/run-source-split-check.mjs']);
  run('ui roundtrip syntax', 'node', ['--check', 'klic-figma-toolkit/run-ui-roundtrip-smoke.mjs']);
  run('ui visual smoke syntax', 'node', ['--check', 'klic-figma-toolkit/run-ui-visual-smoke.mjs']);
  run('completion audit syntax', 'node', ['--check', 'klic-figma-toolkit/run-completion-audit.mjs']);
  run('runtime evidence watcher syntax', 'node', ['--check', 'klic-figma-toolkit/watch-runtime-evidence.mjs']);
  run('runtime evidence clipboard watcher syntax', 'node', ['--check', 'klic-figma-toolkit/watch-runtime-clipboard.mjs']);
  run('runtime evidence HTTP receiver syntax', 'node', ['--check', 'klic-figma-toolkit/watch-runtime-http.mjs']);
  run('runtime evidence capture syntax', 'node', ['--check', 'klic-figma-toolkit/capture-runtime-evidence.mjs']);
  run('runtime evidence HTTP receiver self-test', 'node', ['klic-figma-toolkit/watch-runtime-http.mjs', '--self-test']);
  runUiScriptSyntaxCheck();
  runNodeLauncherChecks();
  runWindowsCmdSmokeChecks();
  runMacShellSmokeChecks();
  console.log('\nKLIC local verification passed.');
} finally {
  if (fs.existsSync(evidencePath)) fs.unlinkSync(evidencePath);
  if (fs.existsSync(capturedMixedEvidencePath)) fs.unlinkSync(capturedMixedEvidencePath);
  if (fs.existsSync(styleTokenPath)) fs.unlinkSync(styleTokenPath);
}
