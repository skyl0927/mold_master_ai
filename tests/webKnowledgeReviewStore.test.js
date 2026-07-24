const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  findLatestWebKnowledgeCollection,
  loadWebKnowledgeCollection
} = require('../webKnowledgeReviewStore');

const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');

const createCard = evidence => ({
  schemaVersion: 1,
  caseId: 'web-store-test',
  sourceKind: 'licensed_image',
  defectName: '플래시',
  defectClass: 'flash',
  problem: '플래시 발생',
  phenomenon: '파팅 라인 돌출',
  causes: [{ text: '형체력 부족', actions: ['형체력 확인'] }],
  checkItems: ['형체력 확인'],
  actions: ['조건 조정'],
  evidence: [evidence],
  review: {
    status: 'candidate',
    requiresHumanReview: true,
    autoApprovalAllowed: false,
    graphPromoted: false
  },
  metadata: {
    visionBenchmarkEligible: false
  }
});

const createCollection = (parent, name, bytes = Buffer.from('image')) => {
  const root = path.join(parent, name);
  fs.mkdirSync(path.join(root, 'images'), { recursive: true });
  fs.writeFileSync(path.join(root, 'images', 'case.png'), bytes);
  fs.writeFileSync(path.join(root, 'cards.json'), JSON.stringify([
    createCard({
      publisher: 'Wikimedia Commons',
      title: 'case.png',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:case.png',
      assetUrl: 'https://upload.wikimedia.org/wikipedia/commons/case.png',
      downloadUrl: 'https://upload.wikimedia.org/wikipedia/commons/case.png',
      localFile: 'images/case.png',
      retrievedAt: '2026-07-24T00:00:00.000Z',
      reuseMode: 'licensed_copy',
      license: 'CC0',
      licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
      contentSha256: sha256(bytes)
    })
  ], null, 2));
  return root;
};

test('latest complete collection is selected and image hashes are verified', () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'web-collection-'));
  createCollection(parent, 'web-injection-defect-cases-20260724T010000');
  const latest = createCollection(parent, 'web-injection-defect-cases-20260724T020000');

  assert.equal(findLatestWebKnowledgeCollection({ artifactsRoot: parent }), latest);
  const loaded = loadWebKnowledgeCollection(latest);
  assert.equal(loaded.cards.length, 1);
  assert.equal(loaded.integrity.valid, true);
  assert.equal(loaded.integrity.verifiedImages, 1);
});

test('configured collection must contain cards.json', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'web-collection-empty-'));
  assert.throws(
    () => findLatestWebKnowledgeCollection({ configuredRoot: root }),
    /cards\.json/i
  );
});

test('image path traversal and hash mismatch are rejected', () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'web-collection-bad-'));
  const root = createCollection(parent, 'web-injection-defect-cases-20260724T030000');
  const cardsPath = path.join(root, 'cards.json');
  const cards = JSON.parse(fs.readFileSync(cardsPath, 'utf8'));

  cards[0].evidence[0].localFile = '../outside.png';
  fs.writeFileSync(cardsPath, JSON.stringify(cards));
  assert.throws(() => loadWebKnowledgeCollection(root), /outside collection root/i);

  cards[0].evidence[0].localFile = 'images/case.png';
  cards[0].evidence[0].contentSha256 = 'b'.repeat(64);
  fs.writeFileSync(cardsPath, JSON.stringify(cards));
  assert.throws(() => loadWebKnowledgeCollection(root), /hash mismatch/i);
});
