const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  loadLatestOperationalStatusBundle,
  shouldAdoptOperationalStatusBundle
} = require('../latestOperationalStatusBundle');

const writeBundle = (root, name, generatedAt, extra = {}) => {
  fs.mkdirSync(root, { recursive: true });
  const filePath = path.join(root, name);
  fs.writeFileSync(filePath, JSON.stringify({
    contractVersion: 'operational-status-bundle/v1',
    generatedAt,
    status: 'awaiting_human_hitl',
    serviceWritesPerformed: false,
    ...extra
  }), 'utf8');
  return filePath;
};

test('selects the newest valid bundle by generatedAt across configured roots', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mold-master-status-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const firstRoot = path.join(root, 'first');
  const secondRoot = path.join(root, 'second');
  writeBundle(firstRoot, 'operational-status-bundle-z.json', '2026-08-20T00:00:00.000Z');
  const expectedPath = writeBundle(
    secondRoot,
    'operational-status-bundle-a.json',
    '2026-08-25T00:00:00.000Z'
  );

  const result = loadLatestOperationalStatusBundle({ roots: [firstRoot, secondRoot] });

  assert.equal(result.status, 'success');
  assert.match(result.summary, /2026-08-25/);
  assert.deepEqual(result.next_actions, []);
  assert.deepEqual(result.artifacts, [expectedPath]);
  assert.equal(result.sourcePath, expectedPath);
  assert.equal(result.bundle.generatedAt, '2026-08-25T00:00:00.000Z');
  assert.equal(result.readOnly, true);
});

test('skips malformed, oversized, and contract-mismatched candidates', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mold-master-status-invalid-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'operational-status-bundle-malformed.json'), '{', 'utf8');
  writeBundle(root, 'operational-status-bundle-wrong.json', '2026-08-25T00:00:00.000Z', {
    contractVersion: 'operational-status-bundle/v0'
  });
  writeBundle(root, 'operational-status-bundle-large.json', '2026-08-26T00:00:00.000Z', {
    payload: 'x'.repeat(2048)
  });

  const result = loadLatestOperationalStatusBundle({ roots: [root], maxBytes: 512 });

  assert.equal(result.status, 'warning');
  assert.equal(result.bundle, null);
  assert.equal(result.sourcePath, null);
  assert.match(result.summary, /유효한 최신 운영 상태 번들 없음/);
  assert.deepEqual(result.next_actions, ['Settings에서 Status Bundle JSON을 직접 등록']);
  assert.deepEqual(result.artifacts, []);
  assert.equal(result.rejectedCandidates, 3);
});

test('adopts only a supported bundle that is newer than the locally stored bundle', () => {
  const current = {
    contractVersion: 'operational-status-bundle/v1',
    generatedAt: '2026-08-24T12:00:00.000Z'
  };
  const newer = {
    contractVersion: 'operational-status-bundle/v1',
    generatedAt: '2026-08-25T00:00:00.000Z'
  };

  assert.equal(shouldAdoptOperationalStatusBundle(current, newer), true);
  assert.equal(shouldAdoptOperationalStatusBundle(newer, current), false);
  assert.equal(shouldAdoptOperationalStatusBundle(current, { ...current }), false);
  assert.equal(shouldAdoptOperationalStatusBundle(null, newer), true);
  assert.equal(shouldAdoptOperationalStatusBundle(current, {
    ...newer,
    contractVersion: 'operational-status-bundle/v0'
  }), false);
  assert.equal(shouldAdoptOperationalStatusBundle(current, {
    ...newer,
    generatedAt: 'not-a-date'
  }), false);
});
