const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const packageJson = require('../package.json');
const runtimeRoots = ['main.js', 'preload.js', 'database.js', 'layouts.js'];

const normalize = filePath => filePath.replace(/\\/g, '/');

const resolveLocalModule = (fromFile, request) => {
  const base = path.resolve(path.dirname(fromFile), request);
  return [base, `${base}.js`, path.join(base, 'index.js')]
    .find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) || null;
};

const collectLocalRuntimeFiles = roots => {
  const files = new Set();
  const unresolved = [];

  const visit = relativePath => {
    const absolutePath = path.resolve(root, relativePath);
    if (files.has(absolutePath)) return;
    files.add(absolutePath);

    const source = fs.readFileSync(absolutePath, 'utf8');
    for (const match of source.matchAll(/require\(\s*['"](\.\.?\/[^'"]+)['"]\s*\)/g)) {
      const resolved = resolveLocalModule(absolutePath, match[1]);
      if (!resolved) {
        unresolved.push({ from: normalize(path.relative(root, absolutePath)), request: match[1] });
        continue;
      }
      visit(path.relative(root, resolved));
    }
  };

  roots.forEach(visit);
  return {
    files: [...files].map(file => normalize(path.relative(root, file))).sort(),
    unresolved
  };
};

const isPackaged = (filePath, configuredFiles) => configuredFiles.some(entry => {
  const normalized = normalize(entry);
  return normalized.endsWith('/') ? filePath.startsWith(normalized) : filePath === normalized;
});

test('electron package includes every local main-process runtime dependency', () => {
  const audit = collectLocalRuntimeFiles(runtimeRoots);
  const configuredFiles = packageJson.build?.files || [];
  const omitted = audit.files.filter(file => !isPackaged(file, configuredFiles));

  assert.deepEqual(audit.unresolved, [], 'local runtime require target is missing on disk');
  assert.deepEqual(omitted, [], `package.json build.files omits: ${omitted.join(', ')}`);
});

