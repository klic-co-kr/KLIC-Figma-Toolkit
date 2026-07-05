import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(root, '..');

function parseArgs(argv) {
  const args = {
    out: path.resolve(process.cwd(), 'figma-smoke-evidence.json'),
    timeoutMs: 10 * 60 * 1000,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--out') {
      args.out = path.resolve(process.cwd(), argv[++i] || '');
    } else if (arg === '--timeout-ms') {
      args.timeoutMs = Number(argv[++i] || args.timeoutMs);
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!args.out) throw new Error('--out requires a path.');
  return args;
}

function printHelp() {
  console.log(`Usage:
  node klic-figma-toolkit/watch-runtime-clipboard.mjs [--out figma-smoke-evidence.json]

Waits for Figma smoke evidence JSON to appear on the clipboard. When found,
it validates the JSON with the shared runtime evidence validator, saves it, and
runs the completion audit.
`);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: options.stdio || 'pipe',
    input: options.input,
  });
}

function readClipboardWith(command, args) {
  const result = run(command, args);
  if (result.status === 0 && result.stdout) return result.stdout;
  return '';
}

function readClipboard() {
  const powershell = readClipboardWith('powershell.exe', [
    '-NoProfile',
    '-Command',
    '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Get-Clipboard -Raw',
  ]);
  if (powershell.trim()) return powershell;

  if (process.platform === 'darwin') {
    const pbpaste = readClipboardWith('pbpaste', []);
    if (pbpaste.trim()) return pbpaste;
  }

  const wlPaste = readClipboardWith('wl-paste', ['--no-newline']);
  if (wlPaste.trim()) return wlPaste;

  const xclip = readClipboardWith('xclip', ['-selection', 'clipboard', '-out']);
  if (xclip.trim()) return xclip;

  return '';
}

function extractJson(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

function validateFigmaEvidence(evidence) {
  const tempPath = path.join(path.dirname(args.out), `.klic-clipboard-evidence-${process.pid}.json`);
  try {
    fs.mkdirSync(path.dirname(tempPath), { recursive: true });
    fs.writeFileSync(tempPath, `${JSON.stringify(evidence, null, 2)}\n`);
    const validation = run('node', [
      'klic-figma-toolkit/validate-smoke-evidence.mjs',
      '--require-figma-runtime',
      tempPath,
    ]);
    return validation.status === 0;
  } finally {
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
  }
}

let args;
try {
  args = parseArgs(process.argv.slice(2));
} catch (err) {
  console.error(err.message || String(err));
  process.exit(1);
}

if (args.help) {
  printHelp();
  process.exit(0);
}

console.log('Waiting for validated Figma smoke evidence JSON on the clipboard...');
console.log('In Figma: Command Center -> Run smoke test -> Copy evidence JSON');

const start = Date.now();
while (Date.now() - start < args.timeoutMs) {
  const evidence = extractJson(readClipboard());
  if (validateFigmaEvidence(evidence)) {
    fs.mkdirSync(path.dirname(args.out), { recursive: true });
    fs.writeFileSync(args.out, `${JSON.stringify(evidence, null, 2)}\n`);
    console.log(`Saved validated Figma smoke evidence: ${args.out}`);
    const audit = run('node', [
      'klic-figma-toolkit/run-completion-audit.mjs',
      '--runtime-evidence',
      args.out,
    ], { stdio: 'inherit' });
    process.exit(audit.status || 0);
  }
  await delay(1000);
}

console.error('Timed out waiting for real Figma smoke evidence JSON on the clipboard.');
process.exit(2);
