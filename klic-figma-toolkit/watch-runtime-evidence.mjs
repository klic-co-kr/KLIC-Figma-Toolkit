import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(root, '..');
const targetPath = path.resolve(process.cwd(), process.argv[2] || 'figma-smoke-evidence.json');
const timeoutMs = Number(process.argv[3] || 10 * 60 * 1000);
const start = Date.now();

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hasJsonFile(filePath) {
  if (!fs.existsSync(filePath)) return false;
  const stat = fs.statSync(filePath);
  if (!stat.isFile() || stat.size === 0) return false;
  try {
    JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return true;
  } catch (err) {
    return false;
  }
}

console.log(`Waiting for Figma smoke evidence JSON: ${targetPath}`);
console.log('Save the copied evidence JSON to that path. Press Ctrl+C to stop.');

while (Date.now() - start < timeoutMs) {
  if (hasJsonFile(targetPath)) {
    console.log(`\nEvidence file detected: ${targetPath}`);
    const result = spawnSync('node', [
      'klic-figma-toolkit/run-completion-audit.mjs',
      '--runtime-evidence',
      targetPath,
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: 'pipe',
    });
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    process.exit(result.status || 0);
  }
  await delay(1000);
}

console.error(`Timed out waiting for evidence JSON: ${targetPath}`);
process.exit(2);
