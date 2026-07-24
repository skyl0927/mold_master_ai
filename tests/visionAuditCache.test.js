const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  loadReusableVisionAuditItems
} = require('../visionAuditCache');

const writeAudit = (root, name, items, generatedAt) => {
  const packetRoot = path.join(root, name);
  fs.mkdirSync(packetRoot, { recursive: true });
  fs.writeFileSync(path.join(packetRoot, 'vision-audit.json'), JSON.stringify({
    schemaVersion: 1,
    generatedAt,
    packetRoot,
    policy: { persistence: 'none' },
    items
  }), 'utf8');
  return packetRoot;
};

test('Vision audit cache reuses only completed observations and prefers the newest packet', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vision-audit-cache-'));
  const hash = 'a'.repeat(64);
  writeAudit(root, 'vision-human-review-packet-20260724010000', [{
    contentSha256: hash,
    relativePath: 'old.png',
    status: 'completed',
    observation: { defect_type: '백화', confidence: 0.7 }
  }, {
    contentSha256: 'b'.repeat(64),
    relativePath: 'failed.png',
    status: 'failed',
    observation: { defect_type: '플래시' }
  }], '2026-07-24T01:00:00.000Z');
  writeAudit(root, 'vision-human-review-packet-20260724020000', [{
    contentSha256: hash,
    relativePath: 'new.png',
    status: 'completed',
    observation: { defect_type: '밀핀 백화', confidence: 0.82 }
  }], '2026-07-24T02:00:00.000Z');

  const cache = loadReusableVisionAuditItems({ artifactRoot: root });

  assert.equal(cache.size, 1);
  assert.equal(cache.get(hash).observation.defect_type, '밀핀 백화');
  assert.match(cache.get(hash).sourceAuditPath, /20260724020000/);
  fs.rmSync(root, { recursive: true, force: true });
});

test('Vision audit cache excludes the packet currently being written', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vision-audit-current-'));
  const packetRoot = writeAudit(root, 'vision-human-review-packet-20260724030000', [{
    contentSha256: 'c'.repeat(64),
    relativePath: 'current.png',
    status: 'completed',
    observation: { defect_type: '싱크' }
  }], '2026-07-24T03:00:00.000Z');

  const cache = loadReusableVisionAuditItems({
    artifactRoot: root,
    excludePacketRoot: packetRoot
  });

  assert.equal(cache.size, 0);
  fs.rmSync(root, { recursive: true, force: true });
});
