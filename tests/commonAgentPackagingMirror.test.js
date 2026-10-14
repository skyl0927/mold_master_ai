const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const packageJson = require('../package.json');
const hookPath = path.join(__dirname, '../scripts/package-common-agent-runtime.js');
const hook = fs.existsSync(hookPath) ? require(hookPath) : null;

test('extra resource declarations do not exclude main archive dependencies', () => {
  const overlaps = packageJson.build.extraResources.filter(resource => packageJson.build.files.includes(resource.from));
  assert.deepEqual(overlaps, [], 'electron-builder excludes extraResources sources from app.asar');
});

test('packaging invokes a tested post-archive runtime mirror', () => {
  assert.equal(packageJson.build.afterPack, 'scripts/package-common-agent-runtime.js');
  assert.equal(typeof hook, 'function');
  assert.deepEqual(hook.RUNTIME_FILES, ['commonAgentTransport.js', 'commonAgentChildTransport.js']);
});

test('post-archive mirror copies only the two source-exact runtime helpers', async t => {
  assert.equal(typeof hook, 'function');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mold-master-package-mirror-'));
  t.after(() => {
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
    assert(path.basename(root).startsWith('mold-master-package-mirror-'));
    fs.rmSync(root, {recursive:true, force:true});
  });
  await hook({appOutDir:root});
  const resources = path.join(root, 'resources');
  assert.deepEqual(fs.readdirSync(resources).sort(), [...hook.RUNTIME_FILES].sort());
  for (const file of hook.RUNTIME_FILES) {
    assert.deepEqual(fs.readFileSync(path.join(resources, file)), fs.readFileSync(path.join(__dirname, '..', file)));
  }
});
