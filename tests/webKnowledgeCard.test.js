const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildCollectionSummary,
  deduplicateKnowledgeCards,
  extractBasfDefectLinks,
  parseBasfTroubleshootingPage,
  toTacitKnowledgeTemplate,
  validateKnowledgeCard,
  validateSourceProvenance
} = require('../webKnowledgeCard');

const APPROVED_SOURCE = {
  publisher: 'Wikimedia Commons',
  title: 'Defek terbakar.png',
  sourceUrl: 'https://commons.wikimedia.org/wiki/File:Defek_terbakar.png',
  retrievedAt: '2026-07-24T00:00:00.000Z',
  license: 'CC BY-SA 4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
  author: 'Example Author',
  contentSha256: 'a'.repeat(64)
};

const knowledgeCard = overrides => ({
  schemaVersion: 1,
  caseId: 'web-case-burn-001',
  sourceKind: 'licensed_image',
  defectName: 'Diesel effect/Burning',
  defectClass: 'burn',
  problem: '충전 말단 또는 리브 주변에 탄화 흔적이 발생한다.',
  phenomenon: '압축된 공기가 빠져나가지 못해 국부적으로 검게 탄 흔적이 나타난다.',
  causes: [
    {
      text: '금형 벤트가 오염되거나 부족하다.',
      actions: ['벤트를 청소하고 충전 말단의 배기 구조를 보강한다.']
    }
  ],
  checkItems: ['충전 말단 벤트의 막힘과 깊이를 확인한다.'],
  actions: ['충전 말단의 사출 속도를 낮춘다.'],
  evidence: [APPROVED_SOURCE],
  review: {
    status: 'candidate',
    requiresHumanReview: true,
    autoApprovalAllowed: false
  },
  ...overrides
});

test('source provenance requires an allowlisted host, stable hash, and reusable license', () => {
  const accepted = validateSourceProvenance(APPROVED_SOURCE);
  assert.equal(accepted.valid, true);
  assert.deepEqual(accepted.errors, []);

  const rejected = validateSourceProvenance({
    ...APPROVED_SOURCE,
    sourceUrl: 'https://images.example.invalid/burn.png',
    license: 'All rights reserved',
    licenseUrl: '',
    contentSha256: 'not-a-hash'
  });
  assert.equal(rejected.valid, false);
  assert.ok(rejected.errors.includes('source_host_not_allowed'));
  assert.ok(rejected.errors.includes('license_not_reusable'));
  assert.ok(rejected.errors.includes('content_sha256_invalid'));
});

test('BASF landing page links become distinct troubleshooting page descriptors', () => {
  const html = `
    <a href="https://download.basf.com/guide.pdf?view#page=4">Weld line</a>
    <a href="https://download.basf.com/guide.pdf?view#page=10">Diesel effect/Burning</a>
    <a href="https://download.basf.com/guide.pdf?view#page=14">Sink marks</a>
  `;
  const links = extractBasfDefectLinks(html);
  assert.deepEqual(
    links.map(item => [item.title, item.pageNumber]),
    [
      ['Weld line', 4],
      ['Diesel effect/Burning', 10],
      ['Sink marks', 14]
    ]
  );
});

test('BASF two-column PDF layout preserves causes and their matching recommendations', () => {
  const items = [
    { str: 'Description', transform: [1, 0, 0, 1, 73, 380] },
    { str: 'Black discoloration occurs at the end of fill.', transform: [1, 0, 0, 1, 73, 363] },
    { str: 'Causes', transform: [1, 0, 0, 1, 73, 309] },
    { str: 'Recommendations', transform: [1, 0, 0, 1, 258, 309] },
    { str: 'The injection speed is too high.', transform: [1, 0, 0, 1, 73, 291] },
    { str: '•', transform: [1, 0, 0, 1, 258, 291] },
    { str: 'Reduce the injection speed near the end of fill.', transform: [1, 0, 0, 1, 263, 291] },
    { str: 'The venting channels are clogged.', transform: [1, 0, 0, 1, 73, 250] },
    { str: '•', transform: [1, 0, 0, 1, 258, 250] },
    { str: 'Clean and improve the mold vents.', transform: [1, 0, 0, 1, 263, 250] },
    { str: '03', transform: [1, 0, 0, 1, 43, 428] },
    { str: 'DIESEL EFFECT/BURNING', transform: [1, 0, 0, 1, 63, 428] }
  ];

  const parsed = parseBasfTroubleshootingPage(items);
  assert.equal(parsed.description, 'Black discoloration occurs at the end of fill.');
  assert.deepEqual(parsed.causes, [
    {
      text: 'The injection speed is too high.',
      actions: ['Reduce the injection speed near the end of fill.']
    },
    {
      text: 'The venting channels are clogged.',
      actions: ['Clean and improve the mold vents.']
    }
  ]);
});

test('BASF recommendation parser removes section headings without dropping adjacent actions', () => {
  const items = [
    { str: 'Description', transform: [1, 0, 0, 1, 73, 380] },
    { str: 'A visible weld line forms.', transform: [1, 0, 0, 1, 73, 363] },
    { str: 'Causes', transform: [1, 0, 0, 1, 73, 309] },
    { str: 'Recommendations', transform: [1, 0, 0, 1, 258, 309] },
    { str: 'Two melt fronts meet.', transform: [1, 0, 0, 1, 73, 291] },
    { str: 'PROCESSING CHANGES', transform: [1, 0, 0, 1, 258, 291] },
    { str: '•', transform: [1, 0, 0, 1, 258, 275] },
    { str: 'Increase the melt temperature.', transform: [1, 0, 0, 1, 263, 275] },
    { str: '•', transform: [1, 0, 0, 1, 258, 259] },
    { str: 'Clean the venting channels.', transform: [1, 0, 0, 1, 263, 259] },
    { str: 'MOLD-RELATED SOLUTIONS', transform: [1, 0, 0, 1, 258, 248] },
    { str: '•', transform: [1, 0, 0, 1, 258, 232] },
    { str: 'Improve mold venting.', transform: [1, 0, 0, 1, 263, 232] }
  ];

  const parsed = parseBasfTroubleshootingPage(items);
  assert.deepEqual(parsed.causes[0].actions, [
    'Increase the melt temperature.',
    'Clean the venting channels.',
    'Improve mold venting.'
  ]);
  assert.ok(parsed.causes[0].actions.every(action => !/SOLUTIONS|CHANGES/.test(action)));
});

test('knowledge cards remain candidates and retain evidence lineage in Common Agent template', () => {
  const card = knowledgeCard();
  assert.equal(validateKnowledgeCard(card).valid, true);

  const template = toTacitKnowledgeTemplate([card], {
    documentId: 'doc-web-cases-001',
    generatedAt: '2026-07-24T00:00:00.000Z'
  });
  assert.equal(template.items.length, 1);
  assert.equal(template.items[0].problem, card.problem);
  assert.equal(template.items[0].cause_candidates[0], card.causes[0].text);
  assert.equal(template.items[0].actions[0], card.causes[0].actions[0]);
  assert.equal(template.items[0].metadata.review_status, 'candidate');
  assert.equal(template.items[0].metadata.auto_approval_allowed, false);
  assert.equal(template.items[0].metadata.evidence[0].content_sha256, 'a'.repeat(64));
});

test('deduplication excludes repeated evidence hashes and reports a 40-card target gap', () => {
  const first = knowledgeCard();
  const duplicate = knowledgeCard({
    caseId: 'web-case-burn-duplicate',
    evidence: [{ ...APPROVED_SOURCE }]
  });
  const independent = knowledgeCard({
    caseId: 'web-case-flash-001',
    defectName: 'Flash',
    defectClass: 'flash',
    evidence: [{
      ...APPROVED_SOURCE,
      title: 'Defek burr.png',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Defek_burr.png',
      contentSha256: 'b'.repeat(64)
    }]
  });

  const result = deduplicateKnowledgeCards([first, duplicate, independent]);
  assert.equal(result.cards.length, 2);
  assert.equal(result.excluded.length, 1);
  assert.equal(result.excluded[0].reason, 'duplicate_evidence_hash');

  const summary = buildCollectionSummary(result.cards, { targetCards: 40 });
  assert.equal(summary.totalCards, 2);
  assert.equal(summary.additionalCardsRequired, 38);
  assert.equal(summary.autoApproved, 0);
  assert.equal(summary.graphPromoted, 0);
});
