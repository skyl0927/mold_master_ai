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
  assert.deepEqual(hook.RUNTIME_FILES, ['commonAgentTransport.js', 'commonAgentChildTransport.js',
    'shared/defect-taxonomy.js', 'visionCaptureProtocol.js']);
});

test('relative package destinations are rejected before any file is written', async () => {
  await assert.rejects(hook({appOutDir:'relative-output'}), /Absolute package/);
});

test('external resources declare CommonJS independently of the installation parent', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mold-master-package-mirror-'));
  t.after(() => {
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
    assert(path.basename(root).startsWith('mold-master-package-mirror-'));
    fs.rmSync(root, {recursive:true, force:true});
  });
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({type:'module'}));
  await hook({appOutDir:path.join(root, 'portable-app')});
  const metadataPath = path.join(root, 'portable-app/resources/package.json');
  assert(fs.existsSync(metadataPath), 'Portable child scripts inherit the host ESM mode');
  assert.deepEqual(JSON.parse(fs.readFileSync(metadataPath, 'utf8')), {private:true, type:'commonjs'});
});

test('post-archive mirror copies only the four source-exact runtime helpers', async t => {
  assert.equal(typeof hook, 'function');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mold-master-package-mirror-'));
  t.after(() => {
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
    assert(path.basename(root).startsWith('mold-master-package-mirror-'));
    fs.rmSync(root, {recursive:true, force:true});
  });
  await hook({appOutDir:root});
  const resources = path.join(root, 'resources');
  assert.deepEqual(fs.readdirSync(resources).sort(), ['commonAgentChildTransport.js', 'commonAgentTransport.js', 'shared', 'visionCaptureProtocol.js']);
  assert.deepEqual(fs.readdirSync(path.join(resources, 'shared')), ['defect-taxonomy.js']);
  for (const file of hook.RUNTIME_FILES) {
    assert.deepEqual(fs.readFileSync(path.join(resources, file)), fs.readFileSync(path.join(__dirname, '..', file)));
  }
});
