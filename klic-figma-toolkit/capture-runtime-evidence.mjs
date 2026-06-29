import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(root, '..');

function printHelp() {
  console.log(`Usage:
  node klic-figma-toolkit/capture-runtime-evidence.mjs [--out figma-smoke-evidence.json]

Reads smoke evidence JSON from the system clipboard, validates that it came from
the Figma plugin runtime format, saves it, and runs the completion audit.

Options:
  --out <path>    Output JSON path. Default: figma-smoke-evidence.json
  --stdin         Read evidence JSON from stdin instead of the clipboard
  --skip-audit    Save and validate evidence, but do not run completion audit
`);
}

function parseArgs(argv) {
  const args = {
    out: path.resolve(process.cwd(), 'figma-smoke-evidence.json'),
    stdin: false,
    skipAudit: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--out') {
      args.out = path.resolve(process.cwd(), argv[++i] || '');
    } else if (arg === '--stdin') {
      args.stdin = true;
    } else if (arg === '--skip-audit') {
      args.skipAudit = true;
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!args.out) throw new Error('--out requires a path.');
  return args;
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
  if (result.status !== 0) return '';
  return result.stdout || '';
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

  throw new Error('Clipboard is empty or could not be read. Use --stdin if clipboard access is blocked.');
}

function extractJson(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) throw new Error('No evidence JSON found.');
  try {
    return JSON.parse(trimmed);
  } catch (err) {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start < 0 || end <= start) {
      throw new Error('Clipboard/stdin does not contain smoke evidence JSON. In Figma, run Command Center -> Run smoke test -> Copy evidence JSON.');
    }
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch (jsonErr) {
      throw new Error(`Clipboard/stdin contains malformed smoke evidence JSON: ${jsonErr.message || String(jsonErr)}`);
    }
  }
}

function writeValidEvidence(evidence, targetPath) {
  const tempPath = path.join(os.tmpdir(), `klic-runtime-evidence-${process.pid}.json`);
  fs.writeFileSync(tempPath, `${JSON.stringify(evidence, null, 2)}\n`);
  try {
    const validation = run('node', [
      'klic-figma-toolkit/validate-smoke-evidence.mjs',
      '--require-figma-runtime',
      tempPath,
    ]);
    if (validation.stdout) process.stdout.write(validation.stdout);
    if (validation.stderr) process.stderr.write(validation.stderr);
    if (validation.status !== 0) {
      throw new Error(`Runtime evidence validation failed with exit code ${validation.status}.`);
    }
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.copyFileSync(tempPath, targetPath);
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

try {
  const input = args.stdin ? fs.readFileSync(0, 'utf8') : readClipboard();
  const evidence = extractJson(input);
  writeValidEvidence(evidence, args.out);
  console.log(`Saved validated Figma smoke evidence: ${args.out}`);

  if (!args.skipAudit) {
    const audit = run('node', [
      'klic-figma-toolkit/run-completion-audit.mjs',
      '--runtime-evidence',
      args.out,
    ], { stdio: 'inherit' });
    process.exit(audit.status || 0);
  }
} catch (err) {
  console.error(`KLIC runtime evidence capture failed: ${err.message || String(err)}`);
  process.exit(1);
}
