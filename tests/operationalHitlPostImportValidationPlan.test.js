const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildOperationalHitlPostImportValidationPlan
} = require('../operationalHitlPostImportValidationPlan');

const sha = value => String(value).repeat(64).slice(0, 64);

const readyImportPackage = {
  schemaVersion: 1,
  contractVersion: 'operational-hitl-common-agent-import-package/v1',
  generatedAt: '2026-07-27T14:00:00.000Z',
  status: 'ready_for_common_agent_review',
  manualImportAllowed: true,
  serviceWritesPerformed: false,
  payloads: {
    labelConflictResolutions: [{
      conflictId: 'conflict-001',
      contentHash: sha('a'),
      affectedCaseIds: ['approved-image-a', 'approved-image-b'],
      candidateLabels: ['백화', '웰드라인'],
      selectedLabel: '백화',
      reviewerId: 'quality-lead-01',
      reviewComment: '동일 이미지 재확인 결과 리브 주변 백화가 맞습니다.',
      decidedAt: '2026-07-27T13:50:00.000Z'
    }],
    visionApprovalCandidates: [{
      queueId: 'pending-hitl-001',
      contentSha256: sha('b'),
      defectType: '싱크',
      defectClass: 'sink',
      reviewerId: 'vision-reviewer-01',
      reviewComment: '원본 이미지와 싱크 라벨을 사람이 확인함',
      decidedAt: '2026-07-27T13:51:00.000Z'
    }],
    webKnowledgeLedgerUpdates: [{
      caseId: 'web-case-001',
      sourceContentSha256: sha('c'),
      decision: 'approved',
      defectName: '웰드라인',
      problem: '사출 성형품에 선형 접합 흔적이 발생한다.',
      phenomenon: '유동 선단이 합류한 부위에 희미한 선이 보인다.',
      causeCandidates: ['수지 온도 또는 금형 온도가 낮아 유동 선단 융착이 부족하다.'],
      causeLabels: ['사출 조건', '금형 온도'],
      checkItems: ['금형 온도와 수지 온도를 확인한다.'],
      actions: ['금형 온도와 수지 온도를 검증 범위 내에서 상향한다.'],
      reviewer: 'web-reviewer-01',
      reviewerComment: '원문 근거와 현장 적용 가능성을 확인함',
      decidedAt: '2026-07-27T13:52:00.000Z'
    }],
    graphKnowledgeCandidates: [{
      sourceQueue: 'web_knowledge_hitl',
      commonAgentAction: 'stage_graph_knowledge_candidate',
      caseId: 'web-case-001',
      sourceContentSha256: sha('c'),
      defectName: '웰드라인',
      problem: '사출 성형품에 선형 접합 흔적이 발생한다.',
      phenomenon: '유동 선단이 합류한 부위에 희미한 선이 보인다.',
      rootCauseCandidates: ['수지 온도 또는 금형 온도가 낮아 유동 선단 융착이 부족하다.'],
      causeLabels: ['사출 조건', '금형 온도'],
      checkItems: ['금형 온도와 수지 온도를 확인한다.'],
      countermeasures: ['금형 온도와 수지 온도를 검증 범위 내에서 상향한다.'],
      reviewerId: 'web-reviewer-01',
      reviewComment: '원문 근거와 현장 적용 가능성을 확인함',
      decidedAt: '2026-07-27T13:52:00.000Z',
      provenance: {
        sourceVerificationArtifact: 'artifacts/web-verification.json'
      }
    }],
    nonLearningDispositionRecords: []
  },
  sources: {
    labelConflictVerification: 'artifacts/label-verification.json',
    visionHitlVerification: 'artifacts/vision-verification.json',
    webKnowledgeVerification: 'artifacts/web-verification.json'
  }
};

test('builds post-import Mold Master validation cases from approved HITL payloads', () => {
  const plan = buildOperationalHitlPostImportValidationPlan({
    generatedAt: '2026-07-27T14:10:00.000Z',
    importPackage: readyImportPackage,
    sourceArtifacts: {
      importPackage: 'artifacts/operational-hitl-common-agent-import-package.json'
    }
  });

  assert.equal(plan.contractVersion, 'operational-hitl-post-import-validation-plan/v1');
  assert.equal(plan.status, 'ready_for_post_import_validation');
  assert.equal(plan.deliveryMode, 'artifact_only');
  assert.equal(plan.serviceWritesPerformed, false);
  assert.equal(plan.policy.validationOnly, true);
  assert.equal(plan.policy.allowGraphPromotion, false);
  assert.equal(plan.policy.allowModelTraining, false);
  assert.equal(plan.summary.totalTestCases, 3);
  assert.equal(plan.summary.graphRagCases, 1);
  assert.equal(plan.summary.visionRoundtripCases, 1);
  assert.equal(plan.summary.labelConflictCases, 1);
  assert.equal(plan.summary.minimumPassRate, 85);

  const graphCase = plan.testCases.find(item => item.testType === 'graph_rag_answer_grounding');
  assert.equal(graphCase.id, 'graph-web-case-001');
  assert.match(graphCase.questionKo, /웰드라인/);
  assert.equal(graphCase.commonAgentRequest.filters.evidence_policy, 'graph_approved_only');
  assert.equal(graphCase.commonAgentRequest.filters.include_reasoning_paths, true);
  assert.deepEqual(graphCase.expectedEvidenceKeywords, [
    '웰드라인',
    '수지 온도 또는 금형 온도가 낮아 유동 선단 융착이 부족하다.',
    '금형 온도와 수지 온도를 검증 범위 내에서 상향한다.'
  ]);
  assert.ok(graphCase.acceptanceCriteria.includes('답변에는 Graph 근거 citation 또는 reasoning path가 1개 이상 있어야 한다.'));
  assert.equal(graphCase.provenance.sourceVerificationArtifact, 'artifacts/web-verification.json');

  const visionCase = plan.testCases.find(item => item.testType === 'vision_label_roundtrip');
  assert.equal(visionCase.expectedLabel, '싱크');
  assert.equal(visionCase.expectedDefectClass, 'sink');
  assert.equal(visionCase.contentSha256, sha('b'));

  const labelCase = plan.testCases.find(item => item.testType === 'label_conflict_resolution_roundtrip');
  assert.equal(labelCase.expectedLabel, '백화');
  assert.deepEqual(labelCase.rejectedLabels, ['웰드라인']);
});

test('blocks validation case generation until the Common Agent import package is ready', () => {
  const plan = buildOperationalHitlPostImportValidationPlan({
    importPackage: {
      ...readyImportPackage,
      status: 'blocked_pending_hitl_verification',
      manualImportAllowed: false,
      payloads: {
        labelConflictResolutions: [],
        visionApprovalCandidates: [],
        webKnowledgeLedgerUpdates: [],
        graphKnowledgeCandidates: [],
        nonLearningDispositionRecords: []
      }
    }
  });

  assert.equal(plan.status, 'blocked_import_package_not_ready');
  assert.equal(plan.summary.totalTestCases, 0);
  assert.deepEqual(plan.testCases, []);
  assert.equal(plan.blockingImportPackageStatus, 'blocked_pending_hitl_verification');
  assert.match(plan.recommendedAction, /Common Agent import package/);
});

test('fails closed when the import package artifact is missing', () => {
  const plan = buildOperationalHitlPostImportValidationPlan({
    importPackage: null
  });

  assert.equal(plan.status, 'missing_import_package');
  assert.equal(plan.summary.missingArtifacts, 1);
  assert.equal(plan.summary.totalTestCases, 0);
  assert.equal(plan.policy.automaticServiceWritesAllowed, false);
});
