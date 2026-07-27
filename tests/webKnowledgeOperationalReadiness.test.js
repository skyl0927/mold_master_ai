const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildWebKnowledgeOperationalReadiness
} = require('../webKnowledgeOperationalReadiness');

const card = index => ({
  caseId: `web-case-${String(index).padStart(3, '0')}`,
  defectClass: index % 2 === 0 ? 'flash' : 'sink'
});

const collection = count => ({
  rootPath: 'artifacts/web-injection-defect-cases-20260724T081612',
  cards: Array.from({ length: count }, (_, index) => card(index + 1)),
  integrity: {
    valid: true,
    cardCount: count,
    verifiedImages: 19
  },
  report: {
    summary: {
      totalCards: count
    }
  }
});

const qualityAudit = overrides => ({
  passed: true,
  collectionRoot: 'artifacts/web-injection-defect-cases-20260724T081612',
  targetCardCount: 40,
  cardCount: 43,
  classCount: 22,
  verifiedImages: 19,
  findingCount: 0,
  findings: [],
  ...overrides
});

const commonAgentValidation = overrides => ({
  collectionRoot: 'artifacts/web-injection-defect-cases-20260724T081612',
  mode: 'non_persisting_template_validation',
  total: 43,
  passed: 43,
  failed: 0,
  minimumQualityScore: 92,
  humanApprovalsCreated: 0,
  centralIngestionsCreated: 0,
  graphPromotionsCreated: 0,
  results: [],
  ...overrides
});

const reviewQueue = ({ approved = 0, rejected = 0, stale = 0, total = 43 } = {}) =>
  Array.from({ length: total }, (_, index) => {
    const oneBased = index + 1;
    const sourceContentSha256 = String(oneBased).padStart(64, '0');
    return {
      card: card(oneBased),
      sourceContentSha256,
      decision: oneBased <= approved
        ? 'approved'
        : oneBased <= approved + rejected
          ? 'rejected'
          : 'pending',
      isCurrent: oneBased > approved + rejected && oneBased <= approved + rejected + stale
        ? false
        : true
    };
  });

const ingestions = ({ ingested = 0, centralApproved = 0 } = {}) =>
  Array.from({ length: ingested }, (_, index) => ({
    caseId: `web-case-${String(index + 1).padStart(3, '0')}`,
    sourceContentSha256: String(index + 1).padStart(64, '0'),
    status: 'succeeded',
    documentId: `doc-${index + 1}`,
    ...(index < centralApproved ? { centralReviewStatus: 'approved' } : {})
  }));

test('reports collection and Common Agent validation ready while HITL approval remains open', () => {
  const readiness = buildWebKnowledgeOperationalReadiness({
    generatedAt: '2026-07-27T14:00:00.000Z',
    collection: collection(43),
    qualityAudit: qualityAudit(),
    commonAgentValidation: commonAgentValidation(),
    reviewQueue: reviewQueue(),
    ingestions: [],
    targetCardCount: 40
  });

  assert.equal(readiness.contractVersion, 'web-knowledge-operational-readiness/v1');
  assert.equal(readiness.status, 'awaiting_hitl_review');
  assert.equal(readiness.serviceWritesPerformed, false);
  assert.equal(readiness.policy.autoApprovalAllowed, false);
  assert.equal(readiness.gates.collection.passed, true);
  assert.equal(readiness.gates.qualityAudit.passed, true);
  assert.equal(readiness.gates.commonAgentValidation.passed, true);
  assert.equal(readiness.gates.localHitl.passed, false);
  assert.equal(readiness.summary.cardCount, 43);
  assert.equal(readiness.summary.approvedHitlCards, 0);
  assert.equal(readiness.summary.hitlApprovalsMissing, 40);
  assert.deepEqual(readiness.blockers.map(item => item.code), ['web_hitl_approvals_missing']);
  assert.match(readiness.recommendedAction, /Web Case HITL/);
  assert.match(readiness.recommendedAction, /knowledge:web:hitl:decision-template/);
});

test('fails closed when quality audit or no-write Common Agent validation is missing', () => {
  const readiness = buildWebKnowledgeOperationalReadiness({
    collection: collection(43),
    qualityAudit: qualityAudit({ passed: false, findingCount: 1 }),
    commonAgentValidation: null,
    reviewQueue: reviewQueue({ approved: 40 }),
    ingestions: ingestions({ ingested: 40, centralApproved: 40 })
  });

  assert.equal(readiness.status, 'action_required');
  assert.equal(readiness.gates.qualityAudit.passed, false);
  assert.equal(readiness.gates.commonAgentValidation.status, 'missing');
  assert.ok(readiness.blockers.some(item => item.code === 'web_quality_audit_failed'));
  assert.ok(readiness.blockers.some(item => item.code === 'common_agent_validation_missing'));
  assert.equal(readiness.readyForCommonAgentLearning, false);
});

test('requires central Common Agent approval after local HITL approval is complete', () => {
  const readiness = buildWebKnowledgeOperationalReadiness({
    collection: collection(43),
    qualityAudit: qualityAudit(),
    commonAgentValidation: commonAgentValidation(),
    reviewQueue: reviewQueue({ approved: 43 }),
    ingestions: ingestions({ ingested: 43, centralApproved: 31 })
  });

  assert.equal(readiness.status, 'awaiting_common_agent_approval');
  assert.equal(readiness.gates.localHitl.passed, true);
  assert.equal(readiness.gates.centralApproval.ingestedCandidates, 43);
  assert.equal(readiness.gates.centralApproval.approvedDocuments, 31);
  assert.equal(readiness.summary.centralApprovalsMissing, 9);
  assert.ok(readiness.blockers.some(item => item.code === 'web_central_approvals_missing'));
});

test('marks web knowledge ready for graph roundtrip after all no-write and human gates pass', () => {
  const readiness = buildWebKnowledgeOperationalReadiness({
    collection: collection(43),
    qualityAudit: qualityAudit(),
    commonAgentValidation: commonAgentValidation(),
    reviewQueue: reviewQueue({ approved: 43 }),
    ingestions: ingestions({ ingested: 43, centralApproved: 43 })
  });

  assert.equal(readiness.status, 'ready_for_graph_roundtrip');
  assert.equal(readiness.readyForCommonAgentLearning, true);
  assert.equal(readiness.readyForGraphRoundtrip, true);
  assert.equal(readiness.blockers.length, 0);
  assert.match(readiness.recommendedAction, /Graph 왕복 검증/);
});
