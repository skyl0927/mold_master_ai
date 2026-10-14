const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const packageJson = require('../package.json');

test('packaged main and external evaluation scripts have their protected transport dependencies', () => {
  const files = packageJson.build.files;
  assert(files.includes('commonAgentChildTransport.js'), 'Packaged main cannot load its child broker');
  for (const name of ['scriptCommonAgentFetch.js', 'commonAgentTransport.js', 'commonAgentChildTransport.js']) {
    assert(packageJson.build.extraResources.some(resource => resource.from === name && resource.to === name), `External script cannot resolve ${name}`);
  }
});

test('packaged evaluation scripts use parent-owned advanced IPC and cannot override the broker marker', () => {
  const main = fs.readFileSync(path.join(__dirname, '../main.js'), 'utf8');
  const spawn = main.split('const runBundledNodeScript =')[1].split('// --- MOBILE SERVER STATE')[0];
  assert(spawn.includes("serialization: 'advanced'"));
  assert(spawn.includes("'pipe', 'pipe', 'ipc'"));
  assert(spawn.indexOf('MOLD_MASTER_COMMON_AGENT_BROKER') > spawn.indexOf('...envOverrides'));
  assert(spawn.includes('attachChildBroker'));
});

test('external resource scripts contain their complete local require dependency closure', () => {
  const root = path.resolve(__dirname, '..');
  const resources = new Map();
  for (const resource of packageJson.build.extraResources) {
    const source = path.join(root, resource.from);
    if (fs.statSync(source).isFile()) resources.set(resource.to, source);
    else for (const item of resource.filter) {
      assert(!/[*?]/.test(item), 'Explicit resource filters are required by this closure audit');
      resources.set(path.posix.join(resource.to, item), path.join(source, item));
    }
  }
  const missing = [];
  for (const [target, source] of resources) {
    if (!source.endsWith('.js')) continue;
    for (const match of fs.readFileSync(source, 'utf8').matchAll(/require\(\s*['"](\.\.?\/[^'"]+)['"]\s*\)/g)) {
      const required = path.posix.normalize(path.posix.join(path.posix.dirname(target), match[1]));
      if (![required, `${required}.js`, `${required}/index.js`].some(file => resources.has(file))) {
        missing.push({from:target, required});
      }
    }
  }
  assert.deepEqual(missing, [], 'Packaged external scripts cannot resolve all local dependencies');
});
