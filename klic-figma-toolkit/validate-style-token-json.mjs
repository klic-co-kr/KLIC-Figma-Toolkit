import fs from 'node:fs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readInput() {
  const filePath = process.argv[2];
  assert(filePath, 'Usage: node klic-figma-toolkit/validate-style-token-json.mjs path/to/style.tokens.json');
  return fs.readFileSync(filePath, 'utf8');
}

function requireObject(value, name) {
  assert(value && typeof value === 'object' && !Array.isArray(value), `${name} must be an object.`);
  return value;
}

function sameHex(a, b) {
  return String(a || '').toUpperCase() === String(b || '').toUpperCase();
}

function validateStyleTokenPayload(payload) {
  const data = requireObject(payload.data || payload, 'data');
  const brand = requireObject(data.brand, 'data.brand');
  const semantic = requireObject(data.semantic, 'data.semantic');
  const gray = requireObject(data.gray, 'data.gray');
  const grayScale = requireObject(gray.scale, 'data.gray.scale');

  for (const name of ['Primary', 'Secondary', 'Accent']) {
    const color = requireObject(brand[name], `data.brand.${name}`);
    const scale = requireObject(color.scale, `data.brand.${name}.scale`);
    assert(typeof color.hex === 'string' && /^#[0-9A-Fa-f]{6}$/.test(color.hex), `data.brand.${name}.hex must be a hex color.`);
    assert(Object.keys(scale).length === 12, `data.brand.${name}.scale must contain 12 steps.`);
    assert(sameHex(scale['50'], color.hex), `data.brand.${name}.scale[50] must equal the source hex.`);
  }

  for (const name of ['Semantic/Danger', 'Semantic/Warning', 'Semantic/Success', 'Semantic/Info']) {
    const variants = requireObject(semantic[name], `data.semantic.${name}`);
    for (const key of ['base', 'background', 'line', 'text']) {
      assert(typeof variants[key] === 'string' && /^#[0-9A-Fa-f]{6}$/.test(variants[key]), `${name}.${key} must be a hex color.`);
    }
  }

  assert(Object.keys(grayScale).length === 12, 'data.gray.scale must contain 12 steps.');
  assert(Array.isArray(data.spacing) && data.spacing.includes(2) && data.spacing.includes(120), 'data.spacing must include the expected scale.');
  assert(Array.isArray(data.radius) && data.radius.includes(2) && data.radius.includes(99999), 'data.radius must include the expected scale.');
  assert(Array.isArray(data.typeSizes) && data.typeSizes.length === 6, 'data.typeSizes must include 6 typography entries.');
  assert(Array.isArray(data.buttonSizes) && data.buttonSizes.length === 3, 'data.buttonSizes must include 3 entries.');
  assert(Array.isArray(data.buttonTypes) && data.buttonTypes.includes('Primary'), 'data.buttonTypes must include Primary.');
  assert(Array.isArray(data.buttonStates) && data.buttonStates.includes('Disabled'), 'data.buttonStates must include Disabled.');
  assert(data.buttonRadius === 6, 'data.buttonRadius must be 6.');
  assert(Array.isArray(data.inputSizes) && data.inputSizes.length === 2, 'data.inputSizes must include 2 entries.');
  assert(data.inputWidth === 280, 'data.inputWidth must be 280.');
  assert(data.inputRadius === 6, 'data.inputRadius must be 6.');
  assert(Array.isArray(data.inputStates) && data.inputStates.includes('Focus'), 'data.inputStates must include Focus.');
  assert(Array.isArray(data.inputContents) && data.inputContents.includes('Value'), 'data.inputContents must include Value.');
  assert(data.fontFamily === 'Pretendard', 'data.fontFamily must be Pretendard.');
  assert(data.total === 89, `data.total must be 89, got ${data.total}.`);

  if (payload.data) {
    assert(payload.sourceName === 'style-guide-viewer_ver2.md', 'sourceName must be style-guide-viewer_ver2.md.');
    assert(typeof payload.md === 'string' && payload.md.includes('# 스타일 가이드'), 'export payload must include source md.');
    const meta = requireObject(payload.meta, 'meta');
    assert(typeof meta.styleMdHash === 'string' && meta.styleMdHash, 'meta.styleMdHash is required.');
    assert(typeof meta.styleMdLength === 'number' && meta.styleMdLength > 0, 'meta.styleMdLength is required.');
  }

  return {
    sourceName: payload.sourceName || 'direct-data',
    brandCount: Object.keys(brand).length,
    semanticCount: Object.keys(semantic).length,
    spacingCount: data.spacing.length,
    radiusCount: data.radius.length,
    total: data.total,
  };
}

try {
  const payload = JSON.parse(readInput());
  const summary = validateStyleTokenPayload(payload);
  console.log('KLIC style token JSON validation passed.');
  console.log(JSON.stringify(summary, null, 2));
} catch (err) {
  console.error(`KLIC style token JSON validation failed: ${err.message || String(err)}`);
  process.exit(1);
}
