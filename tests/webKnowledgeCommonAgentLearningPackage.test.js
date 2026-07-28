const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildWebKnowledgeCommonAgentLearningPackage
} = require('../webKnowledgeCommonAgentLearningPackage');

const sha = value => String(value).repeat(64).slice(0, 64);

const approvedUpdate = (overrides = {}) => ({
  caseId: 'web-case-001',
  sourceContentSha256: sha('a'),
  decision: 'approved',
  confirmed: true,
  reviewer: 'web-reviewer-01',
  reviewerComment: '기술 문서 근거와 현장 적용 가능성을 사람이 확인했습니다.',
  defectName: '웰드라인',
  problem: '사출 성형품 표면에 선형 접합 자국이 발생했습니다.',
  phenomenon: '용융 수지 흐름 선단이 만나는 부분에 흐린 선이 보입니다.',
  causeCandidates: [
    '수지 온도 또는 금형 온도가 낮아 흐름 선단 융착이 부족합니다.'
  ],
  causeLabels: ['사출 조건', '금형 온도'],
  checkItems: [
    '수지 온도, 금형 온도, 게이트 위치와 유동 길이를 확인합니다.'
  ],
  actions: [
    '검증 범위 내에서 수지 온도와 금형 온도를 올리고 게이트 밸런스를 점검합니다.'
  ],
  decidedAt: '2026-07-28T08:00:00.000Z',
  ...overrides
});

const verificationReport = (updates, overrides = {}) => ({
  schemaVersion: 1,
  contractVersion: 'web-knowledge-hitl-decision-verification-report/v1',
  generatedAt: '2026-07-28T08:05:00.000Z',
  status: 'ready_for_local_hitl_import',
  serviceWritesPerformed: false,
  importPlan: {
    localLedgerUpdates: updates,
    centralIngestionAllowed: false,
    graphPromotionAllowed: false,
    modelTrainingAllowed: false
  },
  sources: {
    decisionPacket: 'artifacts/common-agent-web-knowledge-hitl-decisions.json',
    collectionRoot: 'artifacts/web-injection-defect-cases-20260724T081612',
    reviewLedger: 'userData/web-knowledge-review-decisions.json'
  },
  ...overrides
});

const readiness = (overrides = {}) => ({
  schemaVersion: 1,
  contractVersion: 'web-knowledge-operational-readiness/v1',
  generatedAt: '2026-07-28T08:10:00.000Z',
  status: 'awaiting_common_agent_approval',
  serviceWritesPerformed: false,
  readyForCommonAgentLearning: false,
  readyForGraphRoundtrip: false,
  summary: {
    targetCardCount: 40,
    approvedHitlCards: 40,
    centralIngestedCandidates: 12,
    centralApprovedDocuments: 0,
    centralApprovalsMissing: 40
  },
  gates: {
    collection: { passed: true, cardCount: 43 },
    qualityAudit: { passed: true, findingCount: 0 },
    commonAgentValidation: { passed: true, passedCount: 43, failed: 0 },
    localHitl: { passed: true, approved: 40, approvalsMissing: 0 },
    centralApproval: {
      passed: false,
      ingestedCandidates: 12,
      approvedDocuments: 0,
      approvalsMissing: 40
    }
  },
  ...overrides
});

test('packages only approved Web Case HITL rows for Common Agent manual import review', () => {
  const packet = buildWebKnowledgeCommonAgentLearningPackage({
    generatedAt: '2026-07-28T08:20:00.000Z',
    readiness: readiness(),
    verificationReport: verificationReport([
      approvedUpdate(),
      approvedUpdate({
        caseId: 'web-case-002',
        sourceContentSha256: sha('b'),
        decision: 'needs_changes',
        reviewerComment: '원인 근거 보강이 필요합니다.',
        causeCandidates: [],
        causeLabels: [],
        checkItems: [],
        actions: []
      })
    ]),
    sourceArtifacts: {
      readiness: 'artifacts/web-knowledge-operational-readiness.json',
      verificationReport: 'artifacts/web-knowledge-hitl-decision-verification-report.json'
    }
  });

  assert.equal(packet.contractVersion, 'web-knowledge-common-agent-learning-package/v1');
  assert.equal(packet.status, 'ready_for_common_agent_manual_import');
  assert.equal(packet.manualImportAllowed, true);
  assert.equal(packet.readyForGraphRoundtripValidation, false);
  assert.equal(packet.serviceWritesPerformed, false);
  assert.equal(packet.policy.automaticServiceWritesAllowed, false);
  assert.equal(packet.policy.allowGraphPromotion, false);
  assert.equal(packet.policy.allowModelTraining, false);
  assert.equal(packet.summary.approvedSourceRows, 1);
  assert.equal(packet.summary.nonApprovedRows, 1);
  assert.equal(packet.payload.approvedKnowledgeItems.length, 1);
  assert.equal(packet.payload.approvedKnowledgeItems[0].defectName, '웰드라인');
  assert.deepEqual(packet.payload.approvedKnowledgeItems[0].countermeasures, [
    '검증 범위 내에서 수지 온도와 금형 온도를 올리고 게이트 밸런스를 점검합니다.'
  ]);
  assert.equal(packet.payload.tacitKnowledgeTemplate.items.length, 1);
  assert.equal(packet.payload.tacitKnowledgeTemplate.items[0].metadata.local_hitl_status, 'approved');
  assert.equal(packet.payload.graphRoundtripCases[0].commonAgentRequest.filters.evidence_policy, 'graph_approved_only');
  assert.equal(packet.commonAgentReviewRequest.requestedAction, 'manual_candidate_import_review');
});

test('marks package ready for Mold Master graph roundtrip after central Common Agent approval', () => {
  const packet = buildWebKnowledgeCommonAgentLearningPackage({
    readiness: readiness({
      status: 'ready_for_graph_roundtrip',
      readyForCommonAgentLearning: true,
      readyForGraphRoundtrip: true,
      gates: {
        collection: { passed: true, cardCount: 43 },
        qualityAudit: { passed: true, findingCount: 0 },
        commonAgentValidation: { passed: true, passedCount: 43, failed: 0 },
        localHitl: { passed: true, approved: 43, approvalsMissing: 0 },
        centralApproval: {
          passed: true,
          ingestedCandidates: 43,
          approvedDocuments: 43,
          approvalsMissing: 0
        }
      },
      summary: {
        targetCardCount: 40,
        approvedHitlCards: 43,
        centralIngestedCandidates: 43,
        centralApprovedDocuments: 43,
        centralApprovalsMissing: 0
      }
    }),
    verificationReport: verificationReport([approvedUpdate()])
  });

  assert.equal(packet.status, 'ready_for_graph_roundtrip_validation');
  assert.equal(packet.manualImportAllowed, false);
  assert.equal(packet.readyForGraphRoundtripValidation, true);
  assert.equal(packet.summary.graphRoundtripCases, 1);
  assert.equal(packet.commonAgentReviewRequest.requestedAction, 'run_graph_approved_only_roundtrip');
});

test('fails closed until local Web Case HITL approval gate is complete', () => {
  const packet = buildWebKnowledgeCommonAgentLearningPackage({
    readiness: readiness({
      status: 'awaiting_hitl_review',
      gates: {
        collection: { passed: true, cardCount: 43 },
        qualityAudit: { passed: true, findingCount: 0 },
        commonAgentValidation: { passed: true, passedCount: 43, failed: 0 },
        localHitl: { passed: false, approved: 12, approvalsMissing: 28 },
        centralApproval: {
          passed: false,
          ingestedCandidates: 0,
          approvedDocuments: 0,
          approvalsMissing: 40
        }
      },
      summary: {
        targetCardCount: 40,
        approvedHitlCards: 12,
        centralIngestedCandidates: 0,
        centralApprovedDocuments: 0,
        centralApprovalsMissing: 40
      }
    }),
    verificationReport: verificationReport([approvedUpdate()])
  });

  assert.equal(packet.status, 'blocked_local_hitl_incomplete');
  assert.equal(packet.manualImportAllowed, false);
  assert.equal(packet.summary.approvedSourceRows, 0);
  assert.deepEqual(packet.payload.approvedKnowledgeItems, []);
});

test('blocks unsafe or non-ready verification reports without packaging payloads', () => {
  const packet = buildWebKnowledgeCommonAgentLearningPackage({
    readiness: readiness(),
    verificationReport: verificationReport([approvedUpdate()], {
      status: 'awaiting_human_review',
      serviceWritesPerformed: true
    })
  });

  assert.equal(packet.status, 'unsafe_verification_report');
  assert.equal(packet.manualImportAllowed, false);
  assert.deepEqual(packet.payload.graphRoundtripCases, []);
});
