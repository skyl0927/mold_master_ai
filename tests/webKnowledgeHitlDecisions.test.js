const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildWebKnowledgeHitlDecisionTemplate
} = require('../webKnowledgeHitlDecisionTemplate');
const {
  buildWebKnowledgeHitlDecisionVerificationReport
} = require('../webKnowledgeHitlDecisionVerification');

const hash = value => String(value).padStart(64, '0');

const card = index => ({
  caseId: `web-case-${String(index).padStart(3, '0')}`,
  sourceKind: index % 2 === 0 ? 'licensed_image' : 'technical_guide',
  defectName: index % 2 === 0 ? '플래시' : '싱크',
  defectClass: index % 2 === 0 ? 'flash' : 'sink',
  problem: '사출 성형품 외관 결함이 발생한다.',
  phenomenon: '문헌 또는 이미지에서 결함 현상이 확인된다.',
  causes: [{
    text: '공정 조건 또는 금형 상태가 적정 범위를 벗어났다.',
    actions: ['조건과 금형 상태를 점검한다.']
  }],
  evidence: [{
    publisher: 'BASF',
    title: `case ${index}`,
    sourceUrl: 'https://download.basf.com/example.pdf',
    license: 'Copyrighted technical reference; citation only'
  }]
});

const queueItem = (index, overrides = {}) => ({
  card: card(index),
  sourceContentSha256: hash(index),
  decision: 'pending',
  isCurrent: true,
  suggestedCauseLabels: ['금형 상태'],
  suggestedCheckItems: ['금형 손상 여부를 확인한다.'],
  suggestedActions: ['금형 상태를 보수한다.'],
  ...overrides
});

const approvedDecision = index => ({
  caseId: `web-case-${String(index).padStart(3, '0')}`,
  sourceContentSha256: hash(index),
  action: 'approve_card',
  confirmed: true,
  reviewerId: 'reviewer-01',
  reviewComment: '원문 근거와 현장 적용 가능성을 확인함',
  decidedAt: '2026-07-27T15:00:00.000Z',
  reviewedDefectName: index % 2 === 0 ? '플래시' : '싱크',
  reviewedProblem: '사출 성형품 외관 결함이 발생한다.',
  reviewedPhenomenon: '문헌 또는 이미지에서 결함 현상이 확인된다.',
  causeCandidates: ['공정 조건 또는 금형 상태가 적정 범위를 벗어났다.'],
  causeLabels: ['금형 상태'],
  checkItems: ['금형 손상 여부를 확인한다.'],
  actions: ['금형 상태를 보수한다.']
});

test('builds a no-write Web Case HITL decision template for unresolved cards', () => {
  const template = buildWebKnowledgeHitlDecisionTemplate({
    generatedAt: '2026-07-27T15:00:00.000Z',
    reviewQueue: [
      queueItem(1, { decision: 'approved' }),
      queueItem(2),
      queueItem(3, { decision: 'approved', isCurrent: false })
    ],
    targetCardCount: 40,
    sourceArtifacts: {
      collectionRoot: 'artifacts/web-injection-defect-cases-20260724T081612'
    }
  });

  assert.equal(template.contractVersion, 'common-agent-web-knowledge-hitl-decisions-template/v1');
  assert.equal(template.status, 'template_ready');
  assert.equal(template.serviceWritesPerformed, false);
  assert.equal(template.policy.autoApplyAllowed, false);
  assert.equal(template.summary.totalCards, 3);
  assert.equal(template.summary.currentApprovedCards, 1);
  assert.equal(template.summary.decisionsPrepared, 2);
  assert.deepEqual(
    template.decisions.map(item => item.caseId),
    ['web-case-002', 'web-case-003']
  );
  assert.ok(template.decisions.every(item => item.action === 'pending'));
  assert.ok(template.decisions.every(item => item.allowedActions.includes('approve_card')));
  assert.equal(template.decisions[0].reviewedDefectName, '플래시');
  assert.deepEqual(template.decisions[0].suggestedCauseLabels, ['금형 상태']);
});

test('verifies completed Web Case HITL decisions into a local ledger import plan without writes', () => {
  const report = buildWebKnowledgeHitlDecisionVerificationReport({
    generatedAt: '2026-07-27T15:10:00.000Z',
    reviewQueue: [queueItem(1), queueItem(2), queueItem(3)],
    decisionPacket: {
      schemaVersion: 1,
      contractVersion: 'common-agent-web-knowledge-hitl-decisions/v1',
      reviewer: {
        id: 'reviewer-01'
      },
      decisions: [
        approvedDecision(1),
        {
          caseId: 'web-case-002',
          sourceContentSha256: hash(2),
          action: 'mark_needs_changes',
          reviewerId: 'reviewer-01',
          reviewComment: '현장 적용 조건을 보강해야 함',
          decidedAt: '2026-07-27T15:11:00.000Z'
        },
        {
          caseId: 'web-case-003',
          sourceContentSha256: hash(3),
          action: 'reject_card',
          reviewerId: 'reviewer-01',
          reviewComment: '근거와 결함 분류가 일치하지 않음',
          decidedAt: '2026-07-27T15:12:00.000Z'
        }
      ]
    },
    sourceArtifacts: {
      decisionPacket: 'artifacts/common-agent-web-knowledge-hitl-decisions.json'
    }
  });

  assert.equal(report.contractVersion, 'web-knowledge-hitl-decision-verification-report/v1');
  assert.equal(report.status, 'ready_for_local_hitl_import');
  assert.equal(report.serviceWritesPerformed, false);
  assert.equal(report.policy.autoApplyAllowed, false);
  assert.equal(report.summary.acceptedDecisions, 3);
  assert.equal(report.summary.approvedCards, 1);
  assert.equal(report.summary.needsChangesCards, 1);
  assert.equal(report.summary.rejectedCards, 1);
  assert.equal(report.summary.pendingQueueItems, 0);
  assert.equal(report.importPlan.localLedgerUpdates.length, 3);
  assert.deepEqual(
    report.importPlan.localLedgerUpdates.map(item => item.decision),
    ['approved', 'needs_changes', 'rejected']
  );
  assert.equal(report.importPlan.localLedgerUpdates[0].confirmed, true);
  assert.equal(report.importPlan.centralIngestionAllowed, false);
  assert.equal(report.sources.decisionPacket, 'artifacts/common-agent-web-knowledge-hitl-decisions.json');
});

test('fails closed for duplicate, stale, or incomplete approval decisions', () => {
  const report = buildWebKnowledgeHitlDecisionVerificationReport({
    reviewQueue: [queueItem(1), queueItem(2)],
    decisionPacket: {
      schemaVersion: 1,
      contractVersion: 'common-agent-web-knowledge-hitl-decisions/v1',
      reviewer: { id: 'reviewer-01' },
      decisions: [
        {
          ...approvedDecision(1),
          sourceContentSha256: hash(9)
        },
        {
          ...approvedDecision(1),
          reviewComment: '중복 판정'
        },
        {
          ...approvedDecision(2),
          actions: []
        }
      ]
    }
  });

  assert.equal(report.status, 'invalid_decisions');
  assert.equal(report.summary.acceptedDecisions, 0);
  assert.equal(report.summary.invalidDecisions, 3);
  assert.deepEqual(
    report.invalidDecisions.map(item => item.code),
    [
      'source_content_hash_mismatch',
      'duplicate_decision',
      'approved_actions_missing'
    ]
  );
  assert.equal(report.importPlan.localLedgerUpdates.length, 0);
});

test('reports awaiting human review when no completed decisions are provided', () => {
  const report = buildWebKnowledgeHitlDecisionVerificationReport({
    reviewQueue: [queueItem(1), queueItem(2)],
    decisionPacket: {
      schemaVersion: 1,
      contractVersion: 'common-agent-web-knowledge-hitl-decisions-template/v1',
      decisions: [{
        caseId: 'web-case-001',
        sourceContentSha256: hash(1),
        action: 'pending'
      }]
    }
  });

  assert.equal(report.status, 'awaiting_human_review');
  assert.equal(report.summary.pendingQueueItems, 2);
  assert.deepEqual(report.acceptedDecisions, []);
  assert.match(report.recommendedAction, /HITL 판정/);
});
