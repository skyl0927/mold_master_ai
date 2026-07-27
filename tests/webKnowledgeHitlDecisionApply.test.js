const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  applyWebKnowledgeHitlDecisionVerificationReport
} = require('../webKnowledgeHitlDecisionApply');
const {
  cardContentSha256,
  createWebKnowledgeCardReviewLedger
} = require('../webKnowledgeCardReviewLedger');

const source = {
  publisher: 'BASF Performance Materials',
  title: 'Injection-Molding Problems',
  sourceUrl: 'https://download.basf.com/example.pdf#page=20',
  pageNumber: 20,
  retrievedAt: '2026-07-24T00:00:00.000Z',
  reuseMode: 'citation_only',
  license: 'Copyrighted technical reference; citation only',
  contentSha256: 'a'.repeat(64)
};

const card = (index, overrides = {}) => ({
  schemaVersion: 1,
  caseId: `web-case-${String(index).padStart(3, '0')}`,
  sourceKind: 'technical_guide',
  defectName: index === 1 ? '싱크' : index === 2 ? '플래시' : '웰드라인',
  defectClass: index === 1 ? 'sink' : index === 2 ? 'flash' : 'weld_line',
  problem: '사출 성형품 외관 결함이 발생한다.',
  phenomenon: '문헌 또는 이미지에서 결함 현상이 확인된다.',
  causes: [{
    text: '공정 조건 또는 금형 상태가 적정 범위를 벗어났다.',
    actions: ['조건과 금형 상태를 점검한다.']
  }],
  checkItems: ['공정 조건과 금형 상태를 확인한다.'],
  actions: ['검증된 범위 내에서 조건을 조정한다.'],
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

const createLedger = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'web-hitl-apply-'));
  const filePath = path.join(root, 'decisions.json');
  return {
    filePath,
    ledger: createWebKnowledgeCardReviewLedger({ filePath })
  };
};

const updateFor = (target, overrides = {}) => ({
  caseId: target.caseId,
  sourceContentSha256: cardContentSha256(target),
  decision: 'approved',
  confirmed: true,
  reviewer: 'common-agent-reviewer',
  reviewerComment: '원문 근거와 현장 적용 가능성을 사람이 확인함',
  defectName: target.defectName,
  problem: target.problem,
  phenomenon: target.phenomenon,
  causeCandidates: target.causes.map(cause => cause.text),
  causeLabels: ['금형 상태'],
  checkItems: ['공정 조건과 금형 상태를 확인한다.'],
  actions: ['검증된 범위 내에서 조건을 조정한다.'],
  decidedAt: '2026-07-27T16:00:00.000Z',
  ...overrides
});

const readyReport = (cards, overrides = {}) => ({
  schemaVersion: 1,
  contractVersion: 'web-knowledge-hitl-decision-verification-report/v1',
  generatedAt: '2026-07-27T16:05:00.000Z',
  status: 'ready_for_local_hitl_import',
  serviceWritesPerformed: false,
  policy: {
    requiresHumanReview: true,
    autoApplyAllowed: false,
    allowCentralIngestion: false,
    allowGraphPromotion: false,
    allowModelTraining: false
  },
  importPlan: {
    localLedgerUpdates: [
      updateFor(cards[0]),
      updateFor(cards[1], {
        decision: 'needs_changes',
        reviewerComment: '현장 적용 조건 보강이 필요함',
        causeCandidates: [],
        causeLabels: [],
        checkItems: [],
        actions: [],
        decidedAt: '2026-07-27T16:01:00.000Z'
      }),
      updateFor(cards[2], {
        decision: 'rejected',
        reviewerComment: '근거와 결함 분류가 일치하지 않음',
        causeCandidates: [],
        causeLabels: [],
        checkItems: [],
        actions: [],
        decidedAt: '2026-07-27T16:02:00.000Z'
      })
    ],
    centralIngestionAllowed: false,
    graphPromotionAllowed: false,
    modelTrainingAllowed: false
  },
  sources: {
    decisionPacket: 'artifacts/common-agent-web-knowledge-hitl-decisions.json',
    collectionRoot: 'artifacts/web-injection-defect-cases-20260724T081612',
    reviewLedger: null
  },
  ...overrides
});

test('dry-run plans verified Web Case HITL ledger updates without writing', () => {
  const cards = [card(1), card(2), card(3)];
  const { ledger } = createLedger();
  const report = applyWebKnowledgeHitlDecisionVerificationReport({
    generatedAt: '2026-07-27T16:10:00.000Z',
    verificationReport: readyReport(cards),
    collection: { cards, rootPath: 'artifacts/web-injection-defect-cases-20260724T081612' },
    ledger,
    apply: false
  });

  assert.equal(report.contractVersion, 'web-knowledge-hitl-decision-apply-report/v1');
  assert.equal(report.status, 'dry_run_ready');
  assert.equal(report.applyRequested, false);
  assert.equal(report.serviceWritesPerformed, false);
  assert.equal(report.localLedgerWritesPerformed, false);
  assert.equal(report.policy.allowCentralIngestion, false);
  assert.equal(report.policy.allowGraphPromotion, false);
  assert.equal(report.summary.plannedUpdates, 3);
  assert.equal(report.summary.appliedUpdates, 0);
  assert.equal(report.summary.approvedCards, 1);
  assert.equal(report.summary.needsChangesCards, 1);
  assert.equal(report.summary.rejectedCards, 1);
  assert.equal(ledger.all().length, 0);
});

test('explicit apply writes verified decisions to the local HITL ledger only', () => {
  const cards = [card(1), card(2), card(3)];
  const { ledger } = createLedger();
  const report = applyWebKnowledgeHitlDecisionVerificationReport({
    verificationReport: readyReport(cards),
    collection: { cards },
    ledger,
    apply: true
  });

  assert.equal(report.status, 'applied');
  assert.equal(report.applyRequested, true);
  assert.equal(report.serviceWritesPerformed, false);
  assert.equal(report.localLedgerWritesPerformed, true);
  assert.equal(report.summary.appliedUpdates, 3);
  assert.equal(ledger.summary(cards).approved, 1);
  assert.equal(ledger.summary(cards).needsChanges, 1);
  assert.equal(ledger.summary(cards).rejected, 1);
  assert.equal(ledger.get(cards[0]).reviewedAt, '2026-07-27T16:00:00.000Z');
});

test('fails closed when the verification report is not ready for local import', () => {
  const cards = [card(1)];
  const { ledger } = createLedger();
  const report = applyWebKnowledgeHitlDecisionVerificationReport({
    verificationReport: readyReport(cards, {
      status: 'awaiting_human_review',
      importPlan: { localLedgerUpdates: [] }
    }),
    collection: { cards },
    ledger,
    apply: true
  });

  assert.equal(report.status, 'not_ready_for_apply');
  assert.equal(report.localLedgerWritesPerformed, false);
  assert.equal(report.summary.plannedUpdates, 0);
  assert.equal(ledger.all().length, 0);
});

test('fails closed when an import target hash does not match the current card', () => {
  const cards = [card(1), card(2), card(3)];
  const { ledger } = createLedger();
  const report = applyWebKnowledgeHitlDecisionVerificationReport({
    verificationReport: readyReport(cards, {
      importPlan: {
        localLedgerUpdates: [
          updateFor(cards[0]),
          updateFor(cards[1], { sourceContentSha256: 'b'.repeat(64) })
        ],
        centralIngestionAllowed: false,
        graphPromotionAllowed: false,
        modelTrainingAllowed: false
      }
    }),
    collection: { cards },
    ledger,
    apply: true
  });

  assert.equal(report.status, 'apply_target_mismatch');
  assert.equal(report.localLedgerWritesPerformed, false);
  assert.equal(report.summary.invalidTargets, 1);
  assert.deepEqual(report.invalidTargets.map(item => item.code), ['source_content_hash_mismatch']);
  assert.equal(ledger.all().length, 0);
});
