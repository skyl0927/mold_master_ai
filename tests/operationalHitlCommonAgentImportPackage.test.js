const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildOperationalHitlCommonAgentImportPackage
} = require('../operationalHitlCommonAgentImportPackage');

const hash = value => String(value).padStart(64, value);

const readyLabelConflictReport = {
  schemaVersion: 1,
  contractVersion: 'vision-approved-label-conflict-decision-verification-report/v1',
  generatedAt: '2026-07-27T13:00:00.000Z',
  status: 'ready_for_manual_import',
  serviceWritesPerformed: false,
  importPlan: {
    resolvedLabelConflicts: [{
      conflictId: 'conflict-001',
      contentHash: hash('a'),
      action: 'keep_label',
      affectedCaseIds: ['approved-image-a', 'approved-image-b'],
      candidateLabels: ['백화', '웰드라인'],
      selectedLabel: '백화',
      reviewerId: 'quality-lead-01',
      reviewComment: '동일 이미지 재확인 결과 리브 주변 백화가 맞습니다.',
      decidedAt: '2026-07-27T12:50:00.000Z',
      requiresManualImport: true,
      graphPromotionAllowed: false,
      referenceLearningAllowed: false
    }],
    needsReviewConflicts: [],
    rejectedConflicts: [],
    recaptureRequests: []
  },
  summary: {
    resolvedLabelConflicts: 1,
    needsReviewConflicts: 0,
    rejectedConflicts: 0,
    recaptureRequests: 0
  },
  sources: {
    decisionPacket: 'artifacts/label-conflict-decisions.json'
  }
};

const readyVisionHitlReport = {
  schemaVersion: 1,
  contractVersion: 'vision-pending-hitl-decision-verification-report/v1',
  generatedAt: '2026-07-27T13:05:00.000Z',
  status: 'ready_for_manual_import',
  serviceWritesPerformed: false,
  importPlan: {
    approvalCandidates: [{
      queueId: 'pending-hitl-001',
      contentSha256: hash('b'),
      action: 'approve_candidate',
      defectType: '싱크',
      defectClass: 'sink',
      reviewerId: 'vision-reviewer-01',
      reviewComment: '원본 이미지와 싱크 라벨을 사람이 확인함',
      decidedAt: '2026-07-27T12:10:00.000Z',
      requiresManualImport: true,
      graphPromotionAllowed: false,
      referenceLearningAllowed: false
    }],
    needsReviewItems: [{
      queueId: 'pending-hitl-002',
      contentSha256: hash('c'),
      action: 'mark_needs_review',
      defectType: '플래시',
      defectClass: 'flash',
      reviewerId: 'vision-reviewer-01',
      reviewComment: '파팅라인 주변인지 추가 검토가 필요함',
      decidedAt: '2026-07-27T12:11:00.000Z'
    }],
    rejectedCandidates: [],
    recaptureRequests: []
  },
  summary: {
    approvalCandidates: 1,
    needsReviewItems: 1,
    rejectedCandidates: 0,
    recaptureRequests: 0
  },
  sources: {
    decisionPacket: 'artifacts/common-agent-hitl-decisions.json'
  }
};

const readyWebKnowledgeReport = {
  schemaVersion: 1,
  contractVersion: 'web-knowledge-hitl-decision-verification-report/v1',
  generatedAt: '2026-07-27T13:10:00.000Z',
  status: 'ready_for_local_hitl_import',
  serviceWritesPerformed: false,
  importPlan: {
    localLedgerUpdates: [
      {
        caseId: 'web-case-001',
        sourceContentSha256: hash('d'),
        decision: 'approved',
        confirmed: true,
        reviewer: 'web-reviewer-01',
        reviewerComment: '원문 근거와 현장 적용 가능성을 확인함',
        defectName: '웰드라인',
        problem: '사출 성형품에 선형 접합 흔적이 발생한다.',
        phenomenon: '유동 선단이 합류한 부위에 희미한 선이 보인다.',
        causeCandidates: ['수지 온도 또는 금형 온도가 낮아 유동 선단 융착이 부족하다.'],
        causeLabels: ['사출 조건', '금형 온도'],
        checkItems: ['금형 온도와 수지 온도를 확인한다.'],
        actions: ['금형 온도와 수지 온도를 검증 범위 내에서 상향한다.'],
        decidedAt: '2026-07-27T13:01:00.000Z'
      },
      {
        caseId: 'web-case-002',
        sourceContentSha256: hash('e'),
        decision: 'needs_changes',
        confirmed: true,
        reviewer: 'web-reviewer-01',
        reviewerComment: '현장 적용 조건 보강이 필요함',
        defectName: '플래시',
        problem: '사출 성형품 외곽에 얇은 버가 생긴다.',
        phenomenon: '',
        causeCandidates: [],
        causeLabels: [],
        checkItems: [],
        actions: [],
        decidedAt: '2026-07-27T13:02:00.000Z'
      }
    ],
    centralIngestionAllowed: false,
    graphPromotionAllowed: false,
    modelTrainingAllowed: false
  },
  summary: {
    approvedCards: 1,
    needsChangesCards: 1,
    rejectedCards: 0
  },
  sources: {
    decisionPacket: 'artifacts/common-agent-web-knowledge-hitl-decisions.json'
  }
};

test('packages only fully verified HITL outputs for Common Agent human import review', () => {
  const packet = buildOperationalHitlCommonAgentImportPackage({
    generatedAt: '2026-07-27T13:30:00.000Z',
    labelConflictVerification: readyLabelConflictReport,
    visionHitlVerification: readyVisionHitlReport,
    webKnowledgeVerification: readyWebKnowledgeReport,
    sourceArtifacts: {
      labelConflictVerification: 'artifacts/label-verification.json',
      visionHitlVerification: 'artifacts/vision-verification.json',
      webKnowledgeVerification: 'artifacts/web-verification.json'
    }
  });

  assert.equal(packet.contractVersion, 'operational-hitl-common-agent-import-package/v1');
  assert.equal(packet.status, 'ready_for_common_agent_review');
  assert.equal(packet.deliveryMode, 'artifact_only');
  assert.equal(packet.manualImportAllowed, true);
  assert.equal(packet.serviceWritesPerformed, false);
  assert.equal(packet.policy.automaticServiceWritesAllowed, false);
  assert.equal(packet.policy.allowGraphPromotion, false);
  assert.equal(packet.policy.allowReferenceLearning, false);
  assert.equal(packet.policy.allowModelTraining, false);
  assert.equal(packet.summary.sourceReportsReady, 3);
  assert.equal(packet.summary.blockingReports, 0);
  assert.equal(packet.summary.labelConflictResolutions, 1);
  assert.equal(packet.summary.visionApprovalCandidates, 1);
  assert.equal(packet.summary.webKnowledgeLedgerUpdates, 2);
  assert.equal(packet.summary.graphKnowledgeCandidates, 1);
  assert.equal(packet.summary.nonLearningDispositionRecords, 2);

  assert.equal(packet.payloads.labelConflictResolutions[0].selectedLabel, '백화');
  assert.equal(packet.payloads.visionApprovalCandidates[0].defectClass, 'sink');
  assert.equal(packet.payloads.webKnowledgeLedgerUpdates.length, 2);
  assert.equal(packet.payloads.graphKnowledgeCandidates[0].defectName, '웰드라인');
  assert.deepEqual(packet.payloads.graphKnowledgeCandidates[0].countermeasures, [
    '금형 온도와 수지 온도를 검증 범위 내에서 상향한다.'
  ]);
  assert.equal(packet.payloads.graphKnowledgeCandidates[0].graphPromotionAllowed, false);
  assert.equal(packet.payloads.graphKnowledgeCandidates[0].provenance.sourceVerificationArtifact, 'artifacts/web-verification.json');
  assert.equal(packet.commonAgentReviewRequest.requiresHumanReview, true);
  assert.equal(packet.commonAgentReviewRequest.requestedAction, 'manual_hitl_import_review');
});

test('fails closed and emits no payload when any verification report is still pending', () => {
  const packet = buildOperationalHitlCommonAgentImportPackage({
    labelConflictVerification: {
      ...readyLabelConflictReport,
      status: 'awaiting_human_review'
    },
    visionHitlVerification: readyVisionHitlReport,
    webKnowledgeVerification: readyWebKnowledgeReport
  });

  assert.equal(packet.status, 'blocked_pending_hitl_verification');
  assert.equal(packet.manualImportAllowed, false);
  assert.equal(packet.summary.blockingReports, 1);
  assert.deepEqual(packet.payloads.labelConflictResolutions, []);
  assert.deepEqual(packet.payloads.visionApprovalCandidates, []);
  assert.deepEqual(packet.payloads.webKnowledgeLedgerUpdates, []);
  assert.deepEqual(packet.payloads.graphKnowledgeCandidates, []);
  assert.equal(packet.blockingReports[0].queueCode, 'label_conflicts');
  assert.equal(packet.blockingReports[0].status, 'awaiting_human_review');
  assert.match(packet.recommendedAction, /HITL 판정/);
});

test('fails closed when required verification evidence is missing', () => {
  const packet = buildOperationalHitlCommonAgentImportPackage({
    labelConflictVerification: readyLabelConflictReport,
    visionHitlVerification: null,
    webKnowledgeVerification: readyWebKnowledgeReport
  });

  assert.equal(packet.status, 'blocked_missing_verification_reports');
  assert.equal(packet.manualImportAllowed, false);
  assert.equal(packet.summary.missingReports, 1);
  assert.deepEqual(packet.missingReportCodes, ['vision_hitl']);
  assert.deepEqual(packet.payloads.graphKnowledgeCandidates, []);
});
