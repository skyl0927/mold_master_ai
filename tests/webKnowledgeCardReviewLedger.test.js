const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  cardContentSha256,
  createWebKnowledgeCardReviewLedger
} = require('../webKnowledgeCardReviewLedger');

const source = {
  publisher: 'BASF Performance Materials',
  title: 'Injection-Molding Problems - Flash',
  sourceUrl: 'https://download.basf.com/example.pdf#page=20',
  pageNumber: 20,
  retrievedAt: '2026-07-24T00:00:00.000Z',
  reuseMode: 'citation_only',
  license: 'Copyrighted technical reference; citation only',
  contentSha256: 'a'.repeat(64)
};

const card = overrides => ({
  schemaVersion: 1,
  caseId: 'web-basf-20-flash',
  sourceKind: 'technical_guide',
  defectName: '플래시',
  defectClass: 'flash',
  problem: '파팅 라인 주변에 플래시가 발생한다.',
  phenomenon: '금형 맞춤면을 따라 얇은 수지 돌출이 보인다.',
  causes: [{
    text: 'Clamping force is too low.',
    actions: ['Increase clamping force within the validated process window.']
  }],
  checkItems: [],
  actions: ['Inspect the parting line for damage.'],
  evidence: [source],
  review: {
    status: 'candidate',
    requiresHumanReview: true,
    autoApprovalAllowed: false,
    graphPromoted: false
  },
  metadata: {
    visionBenchmarkEligible: false
  },
  ...overrides
});

const approvedInput = target => ({
  decision: 'approved',
  confirmed: true,
  sourceContentSha256: cardContentSha256(target),
  reviewer: 'HITL reviewer',
  reviewerComment: '원문 근거와 현장 적용 범위를 확인함.',
  defectName: '플래시',
  problem: '파팅 라인 주변에 플래시가 발생한다.',
  phenomenon: '금형 맞춤면을 따라 얇은 수지 돌출이 관찰된다.',
  causeCandidates: ['형체력이 부족하다.'],
  causeLabels: ['형체력 부족'],
  checkItems: ['형체력 설정값과 실제값을 확인한다.'],
  actions: ['형체력을 검증된 공정 범위 내에서 상향한다.']
});

const createLedger = now => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'web-card-ledger-'));
  return createWebKnowledgeCardReviewLedger({
    filePath: path.join(root, 'decisions.json'),
    now
  });
};

test('new cards start pending and expose deterministic review suggestions', () => {
  const ledger = createLedger();
  const target = card();
  const queue = ledger.queue([target]);

  assert.equal(queue.length, 1);
  assert.equal(queue[0].decision, 'pending');
  assert.equal(queue[0].isCurrent, true);
  assert.ok(queue[0].suggestedCauseLabels.includes('형체력'));
  assert.ok(queue[0].suggestedCheckItems.length > 0);
});

test('weld-line melt-front wording produces a flow-front cause label', () => {
  const ledger = createLedger();
  const target = card({
    causes: [{
      text: 'Two or more melt fronts meet during filling.',
      actions: ['Move the weld line or improve the melt-front temperature.']
    }]
  });
  const [queueItem] = ledger.queue([target]);
  assert.ok(queueItem.suggestedCauseLabels.includes('유동 선단'));
});

test('approval requires source hash, explicit confirmation, comment, and complete fields', () => {
  const ledger = createLedger();
  const target = card();

  assert.throws(
    () => ledger.set(target, { ...approvedInput(target), confirmed: false }),
    /explicit human confirmation/i
  );
  assert.throws(
    () => ledger.set(target, { ...approvedInput(target), sourceContentSha256: 'b'.repeat(64) }),
    /source content hash/i
  );
  assert.throws(
    () => ledger.set(target, { ...approvedInput(target), checkItems: [] }),
    /check item/i
  );
  assert.throws(
    () => ledger.set(target, { ...approvedInput(target), reviewerComment: '' }),
    /reviewer comment/i
  );
});

test('source mutation invalidates a previous approval', () => {
  const target = card();
  const ledger = createLedger(() => new Date('2026-07-24T01:00:00.000Z'));
  ledger.set(target, approvedInput(target));

  assert.equal(ledger.get(target).isCurrent, true);
  const changed = card({ phenomenon: '수정된 현상 설명' });
  const stale = ledger.get(changed);
  assert.equal(stale.decision, 'approved');
  assert.equal(stale.isCurrent, false);
  assert.equal(ledger.summary([changed]).approved, 0);
  assert.equal(ledger.summary([changed]).stale, 1);
});

test('approved cards export as one-card Common Agent candidate templates', () => {
  const first = card();
  const second = card({
    caseId: 'web-basf-21-short-shot',
    defectName: '미성형',
    defectClass: 'short_shot'
  });
  const ledger = createLedger(() => new Date('2026-07-24T02:00:00.000Z'));
  ledger.set(first, approvedInput(first));
  ledger.set(second, {
    decision: 'rejected',
    confirmed: true,
    sourceContentSha256: cardContentSha256(second),
    reviewer: 'HITL reviewer',
    reviewerComment: '사진과 결함 분류가 일치하지 않음.'
  });

  const exports = ledger.buildApprovedTemplates([first, second], {
    generatedAt: '2026-07-24T03:00:00.000Z'
  });

  assert.equal(exports.length, 1);
  assert.equal(exports[0].items.length, 1);
  assert.equal(exports[0].items[0].item_id, first.caseId);
  assert.equal(exports[0].items[0].reviewer_comment, '원문 근거와 현장 적용 범위를 확인함.');
  assert.equal(exports[0].items[0].problem, '파팅 라인 주변에 플래시가 발생한다.');
  assert.equal(exports[0].items[0].phenomenon, '금형 맞춤면을 따라 얇은 수지 돌출이 관찰된다.');
  assert.deepEqual(exports[0].items[0].cause_candidates, ['형체력이 부족하다.']);
  assert.deepEqual(exports[0].items[0].cause_labels, ['형체력 부족']);
  assert.deepEqual(exports[0].items[0].check_items, ['형체력 설정값과 실제값을 확인한다.']);
  assert.deepEqual(exports[0].items[0].actions, ['형체력을 검증된 공정 범위 내에서 상향한다.']);
  assert.equal(exports[0].metadata.review_status, 'candidate');
  assert.equal(exports[0].metadata.local_hitl_approved, true);
  assert.equal(exports[0].metadata.graph_promotion_allowed_before_review, false);
});

test('ledger persists reviewed Korean descriptions separately from immutable source cards', () => {
  const target = card();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'web-card-ledger-persist-'));
  const filePath = path.join(root, 'decisions.json');
  const first = createWebKnowledgeCardReviewLedger({
    filePath,
    now: () => new Date('2026-07-24T04:00:00.000Z')
  });
  first.set(target, approvedInput(target));

  const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  assert.equal(payload.version, 2);
  assert.equal(payload.decisions.length, 1);
  assert.equal(payload.decisions[0].caseId, target.caseId);
  assert.equal(payload.decisions[0].problem, '파팅 라인 주변에 플래시가 발생한다.');
  assert.equal(payload.decisions[0].phenomenon, '금형 맞춤면을 따라 얇은 수지 돌출이 관찰된다.');
  assert.deepEqual(payload.decisions[0].causeCandidates, ['형체력이 부족하다.']);

  const reopened = createWebKnowledgeCardReviewLedger({ filePath });
  assert.equal(reopened.get(target).decision, 'approved');
  assert.equal(reopened.get(target).isCurrent, true);
  assert.equal(reopened.get(target).phenomenon, '금형 맞춤면을 따라 얇은 수지 돌출이 관찰된다.');
});

test('legacy approvals without translated descriptions keep source text during export', () => {
  const target = card();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'web-card-ledger-legacy-'));
  const filePath = path.join(root, 'decisions.json');
  fs.writeFileSync(filePath, JSON.stringify({
    version: 1,
    decisions: [{
      caseId: target.caseId,
      sourceContentSha256: cardContentSha256(target),
      decision: 'approved',
      reviewer: 'legacy reviewer',
      reviewerComment: '기존 승인 기록',
      defectName: '플래시',
      causeLabels: ['형체력'],
      checkItems: ['형체력을 확인한다.'],
      actions: ['형체력을 조정한다.'],
      reviewedAt: '2026-07-24T04:00:00.000Z'
    }]
  }), 'utf8');

  const ledger = createWebKnowledgeCardReviewLedger({ filePath });
  const [template] = ledger.buildApprovedTemplates([target]);

  assert.equal(template.items[0].problem, target.problem);
  assert.equal(template.items[0].phenomenon, target.phenomenon);
  assert.deepEqual(template.items[0].cause_candidates, target.causes.map(cause => cause.text));
});
