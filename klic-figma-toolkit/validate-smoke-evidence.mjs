import fs from 'node:fs';

const requiredChecks = [
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

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function includesFixtureMarker(value) {
  return typeof value === 'string' && /\bfixture\b/i.test(value);
}

function parseArgs(argv) {
  const args = { filePath: '', requireFigmaRuntime: false, challenge: '' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--require-figma-runtime') args.requireFigmaRuntime = true;
    else if (argv[i] === '--challenge') args.challenge = argv[++i] || '';
    else if (argv[i].startsWith('--')) throw new Error(`Unknown argument: ${argv[i]}`);
    else if (!args.filePath) args.filePath = argv[i];
    else throw new Error(`Unexpected argument: ${argv[i]}`);
  }
  return args;
}

function readInput(filePath) {
  if (filePath) return fs.readFileSync(filePath, 'utf8');
  return fs.readFileSync(0, 'utf8');
}

function validateEvidence(evidence, options = {}) {
  assert(evidence && typeof evidence === 'object', 'Evidence must be a JSON object.');
  assert(evidence.passed === true, 'Smoke evidence did not pass.');
  assert(Number.isInteger(evidence.passCount), 'Smoke evidence is missing passCount.');
  assert(Number.isInteger(evidence.failCount), 'Smoke evidence is missing failCount.');
  assert(evidence.failCount === 0, `Smoke evidence has ${evidence.failCount} failing checks.`);
  assert(evidence.passCount >= requiredChecks.length, `Smoke evidence passCount is too low: ${evidence.passCount}.`);
  assert(typeof evidence.nodeId === 'string' && evidence.nodeId, 'Smoke evidence is missing nodeId.');
  assert(typeof evidence.reportNodeId === 'string' && evidence.reportNodeId, 'Smoke evidence is missing reportNodeId.');
  assert(typeof evidence.variableId === 'string' && evidence.variableId, 'Smoke evidence is missing variableId.');
  assert(typeof evidence.componentSetId === 'string' && evidence.componentSetId, 'Smoke evidence is missing componentSetId.');
  assert(typeof evidence.componentInstanceId === 'string' && evidence.componentInstanceId, 'Smoke evidence is missing componentInstanceId.');
  assert(typeof evidence.generatedAt === 'string' && evidence.generatedAt, 'Smoke evidence is missing generatedAt.');
  assert(Array.isArray(evidence.checks), 'Smoke evidence is missing checks array.');
  assert(evidence.runtime && typeof evidence.runtime === 'object', 'Smoke evidence is missing runtime metadata.');
  assert(typeof evidence.runtime.kind === 'string' && evidence.runtime.kind, 'Smoke evidence runtime metadata is missing kind.');
  assert(typeof evidence.runtime.editorType === 'string' && evidence.runtime.editorType, 'Smoke evidence runtime metadata is missing editorType.');
  assert(typeof evidence.runtime.apiVersion === 'string' && evidence.runtime.apiVersion, 'Smoke evidence runtime metadata is missing apiVersion.');

  if (options.requireFigmaRuntime) {
    assert(evidence.runtime.kind === 'figma-plugin', `Smoke evidence is not from a real Figma plugin runtime: ${evidence.runtime.kind}.`);
    assert(evidence.runtime.editorType === 'figma', `Smoke evidence editorType is not figma: ${evidence.runtime.editorType}.`);
    assert(evidence.runtime.apiVersion === '1.0.0', `Smoke evidence apiVersion is invalid: ${evidence.runtime.apiVersion}.`);
    assert(evidence.runtime.pluginId === 'com.klic.figma-toolkit', `Smoke evidence pluginId is invalid: ${evidence.runtime.pluginId}.`);
    assert(/^\d+:\d+$/.test(evidence.nodeId), `Smoke evidence nodeId is invalid: ${evidence.nodeId}.`);
    assert(/^\d+:\d+$/.test(evidence.reportNodeId), `Smoke evidence reportNodeId is invalid: ${evidence.reportNodeId}.`);
    assert(/^VariableID:\d+:\d+$/.test(evidence.variableId), `Smoke evidence variableId is invalid: ${evidence.variableId}.`);
    assert(/^\d+:\d+$/.test(evidence.componentSetId), `Smoke evidence componentSetId is invalid: ${evidence.componentSetId}.`);
    assert(/^\d+:\d+$/.test(evidence.componentInstanceId), `Smoke evidence componentInstanceId is invalid: ${evidence.componentInstanceId}.`);
    assert(![
      evidence.nodeId,
      evidence.reportNodeId,
      evidence.variableId,
      evidence.componentSetId,
      evidence.componentInstanceId,
    ].some(includesFixtureMarker), 'Smoke evidence contains fixture artifact ids.');
    assert(!evidence.checks.some((item) => includesFixtureMarker(item?.detail)), 'Smoke evidence contains fixture check details.');
    assert(options.challenge && /^[a-f0-9]{64}$/.test(options.challenge), 'A valid receiver challenge is required for Figma runtime evidence.');
    assert(evidence.receiverChallenge === options.challenge, 'Smoke evidence receiver challenge does not match this capture session.');
    const generatedAt = Date.parse(evidence.generatedAt);
    const ageMs = Date.now() - generatedAt;
    assert(Number.isFinite(generatedAt), 'Smoke evidence generatedAt is not a valid timestamp.');
    assert(ageMs >= -60 * 1000 && ageMs <= 15 * 60 * 1000, 'Smoke evidence is stale or dated in the future.');
  }

  for (const checkName of requiredChecks) {
    const check = evidence.checks.find((item) => item && item.name === checkName);
    assert(check, `Smoke evidence is missing required check: ${checkName}`);
    assert(check.passed === true, `Smoke check did not pass: ${checkName}`);
  }

  return {
    generatedAt: evidence.generatedAt,
    passCount: evidence.passCount,
    failCount: evidence.failCount,
    nodeId: evidence.nodeId,
    reportNodeId: evidence.reportNodeId,
    variableId: evidence.variableId,
    componentSetId: evidence.componentSetId,
    componentInstanceId: evidence.componentInstanceId,
    runtime: evidence.runtime,
  };
}

try {
  const args = parseArgs(process.argv.slice(2));
  const evidence = JSON.parse(readInput(args.filePath));
  const summary = validateEvidence(evidence, { requireFigmaRuntime: args.requireFigmaRuntime, challenge: args.challenge });
  console.log('KLIC smoke evidence validation passed.');
  console.log(JSON.stringify(summary, null, 2));
} catch (err) {
  console.error(`KLIC smoke evidence validation failed: ${err.message || String(err)}`);
  process.exit(1);
}
