import fs from 'node:fs';
import crypto from 'node:crypto';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(root, '..');
const receiverPath = '/klic-figma-smoke-evidence';
const clientToken = '784d084535ea34a6d54538d37fcc26455e8854cb691f66b3ac368e6aeadfcc95';

function printHelp() {
  console.log(`Usage:
  node klic-figma-toolkit/watch-runtime-http.mjs [--out figma-smoke-evidence.json]

Starts the local HTTP receiver used by the Figma plugin runtime smoke command.
When the KLIC plugin opens or runs "Run Runtime Smoke Evidence", it can POST
validated Figma runtime smoke evidence to:
  http://127.0.0.1:51337/klic-figma-smoke-evidence

Options:
  --out <path>       Output JSON path. Default: figma-smoke-evidence.json
  --host <host>      Host to bind. Default: 127.0.0.1
  --port <port>      Port to bind. Default: 51337
  --timeout-ms <n>   Wait time before exiting. Default: 600000
  --skip-audit       Save and validate evidence, but do not run completion audit
  --self-test        Run an HTTP receiver self-test without running audit
`);
}

function parseArgs(argv) {
  const args = {
    out: path.resolve(process.cwd(), 'figma-smoke-evidence.json'),
    host: '127.0.0.1',
    port: 51337,
    timeoutMs: 10 * 60 * 1000,
    skipAudit: false,
    selfTest: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--out') {
      args.out = path.resolve(process.cwd(), argv[++i] || '');
    } else if (arg === '--host') {
      args.host = argv[++i] || '';
    } else if (arg === '--port') {
      args.port = Number(argv[++i]);
    } else if (arg === '--timeout-ms') {
      args.timeoutMs = Number(argv[++i]);
    } else if (arg === '--skip-audit') {
      args.skipAudit = true;
    } else if (arg === '--self-test') {
      args.selfTest = true;
      args.skipAudit = true;
      args.port = 0;
      args.timeoutMs = Math.min(args.timeoutMs, 5000);
      args.out = path.join(os.tmpdir(), `klic-http-evidence-self-test-${process.pid}.json`);
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!args.out) throw new Error('--out requires a path.');
  if (!args.host) throw new Error('--host requires a value.');
  if (!Number.isInteger(args.port) || args.port < 0 || args.port > 65535) {
    throw new Error('--port requires an integer from 0 to 65535.');
  }
  if (!Number.isFinite(args.timeoutMs) || args.timeoutMs <= 0) {
    throw new Error('--timeout-ms requires a positive number.');
  }
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

function validateAndSaveEvidence(evidence, targetPath, challenge) {
  const tempPath = path.join(os.tmpdir(), `klic-runtime-http-evidence-${process.pid}.json`);
  fs.writeFileSync(tempPath, `${JSON.stringify(evidence, null, 2)}\n`);
  try {
    const validation = run('node', [
      'klic-figma-toolkit/validate-smoke-evidence.mjs',
      '--require-figma-runtime',
      '--challenge',
      challenge,
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

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(payload));
}

function createSelfTestEvidence(challenge) {
  const checkNames = [
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
  ];
  return {
    generatedAt: new Date().toISOString(),
    runtime: {
      kind: 'figma-plugin',
      editorType: 'figma',
      apiVersion: '1.0.0',
      pluginId: 'com.klic.figma-toolkit',
    },
    passed: true,
    passCount: checkNames.length,
    failCount: 0,
    nodeId: '10:20',
    reportNodeId: '10:21',
    variableId: 'VariableID:10:22',
    componentSetId: '10:23',
    componentInstanceId: '10:24',
    receiverChallenge: challenge,
    checks: checkNames.map((name) => ({ name, passed: true, detail: name })),
  };
}

async function postSelfTestEvidence(port, host, challenge) {
  const unauthorized = await fetch(`http://${host}:${port}${receiverPath}`);
  if (unauthorized.status !== 403) {
    throw new Error(`HTTP receiver accepted an unauthenticated request with status ${unauthorized.status}.`);
  }
  const ready = await fetch(`http://${host}:${port}${receiverPath}`, {
    headers: { 'X-KLIC-Client': clientToken },
  });
  const readyData = await ready.json();
  if (!ready.ok || readyData.challenge !== challenge) {
    throw new Error('HTTP receiver did not return its challenge to the authenticated client.');
  }
  const res = await fetch(`http://${host}:${port}${receiverPath}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-KLIC-Client': clientToken },
    body: JSON.stringify(createSelfTestEvidence(challenge)),
  });
  if (!res.ok) {
    throw new Error(`HTTP self-test POST failed with status ${res.status}: ${await res.text()}`);
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

let resolveDone;
const done = new Promise((resolve) => {
  resolveDone = resolve;
});
let completed = false;
const receiverChallenge = crypto.randomBytes(32).toString('hex');
let challengeConsumed = false;

function finish(result) {
  if (completed) return;
  completed = true;
  resolveDone(result);
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    sendJson(res, 403, { error: 'browser_origin_not_allowed' });
    return;
  }
  if (req.url !== receiverPath) {
    sendJson(res, 404, { error: 'not_found' });
    return;
  }
  if (req.headers['x-klic-client'] !== clientToken) {
    sendJson(res, 403, { error: 'invalid_client' });
    return;
  }
  if (req.method === 'GET') {
    sendJson(res, 200, { ready: true, receiver: 'klic-runtime-smoke-evidence', challenge: receiverChallenge });
    return;
  }
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'method_not_allowed' });
    return;
  }
  if (challengeConsumed) {
    sendJson(res, 409, { error: 'challenge_already_used' });
    return;
  }

  let body = '';
  req.setEncoding('utf8');
  req.on('data', (chunk) => {
    body += chunk;
    if (body.length > 1024 * 1024) {
      req.destroy(new Error('Evidence payload is larger than 1 MB.'));
    }
  });
  req.on('error', (err) => {
    console.error(`KLIC HTTP evidence receiver failed while reading request: ${err.message || String(err)}`);
  });
  req.on('end', () => {
    try {
      const evidence = JSON.parse(body);
      validateAndSaveEvidence(evidence, args.out, receiverChallenge);
      challengeConsumed = true;
      sendJson(res, 200, { saved: true, out: args.out });
      console.log(`Saved validated Figma smoke evidence: ${args.out}`);
      finish({ status: 0 });
    } catch (err) {
      const message = err.message || String(err);
      console.error(`KLIC HTTP evidence receiver rejected payload: ${message}`);
      sendJson(res, 400, { error: message });
    }
  });
});

try {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(args.port, args.host, resolve);
  });
} catch (err) {
  console.error(`KLIC HTTP evidence receiver failed to start: ${err.message || String(err)}`);
  process.exit(1);
}

server.on('error', (err) => {
  finish({ status: 1, message: `KLIC HTTP evidence receiver failed: ${err.message || String(err)}` });
});

const address = server.address();
const boundPort = typeof address === 'object' && address ? address.port : args.port;
console.log(`KLIC HTTP evidence receiver listening at http://${args.host}:${boundPort}${receiverPath}`);
console.log('In Figma desktop, open any design file, then run Plugins > Development > KLIC Figma Toolkit.');
console.log('The plugin will auto-run smoke evidence while this receiver is ready.');

const timeout = setTimeout(() => {
  finish({ status: 2, message: `Timed out waiting for Figma smoke evidence POST after ${args.timeoutMs} ms.` });
}, args.timeoutMs);

if (args.selfTest) {
  postSelfTestEvidence(boundPort, args.host, receiverChallenge).catch((err) => {
    finish({ status: 1, message: err.message || String(err) });
  });
}

const result = await done;
clearTimeout(timeout);
await new Promise((resolve) => server.close(resolve));

if (result.message) {
  console.error(result.message);
}
if (result.status !== 0) {
  process.exit(result.status);
}

if (args.selfTest) {
  if (!fs.existsSync(args.out)) {
    console.error(`HTTP receiver self-test did not write evidence: ${args.out}`);
    process.exit(1);
  }
  fs.unlinkSync(args.out);
  console.log('KLIC HTTP evidence receiver self-test passed.');
  process.exit(0);
}

if (!args.skipAudit) {
  const audit = run('node', [
    'klic-figma-toolkit/run-completion-audit.mjs',
    '--runtime-evidence',
    args.out,
    '--runtime-challenge',
    receiverChallenge,
  ], { stdio: 'inherit' });
  process.exit(audit.status || 0);
}
