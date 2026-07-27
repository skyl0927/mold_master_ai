const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildVisionPendingHitlNonApprovalWorklist
} = require('../visionPendingHitlNonApprovalWorklist');

const hashA = 'a'.repeat(64);
const hashB = 'b'.repeat(64);
const hashC = 'c'.repeat(64);
const hashD = 'd'.repeat(64);

const acceptedDecision = overrides => ({
  queueId: 'pending-hitl-001',
  contentSha256: hashA,
  action: 'approve_candidate',
  defectType: '싱크',
  defectClass: 'sink',
  reviewerId: 'reviewer-01',
  reviewComment: '원본 이미지와 라벨을 확인함',
  decidedAt: '2026-07-27T13:00:00.000Z',
  graphPromotionAllowed: false,
  referenceLearningAllowed: false,
  modelTrainingAllowed: false,
  ...overrides
});

const readyReport = overrides => ({
  schemaVersion: 1,
  contractVersion: 'vision-pending-hitl-decision-verification-report/v1',
  generatedAt: '2026-07-27T13:10:00.000Z',
  status: 'ready_for_manual_import',
  serviceWritesPerformed: false,
  policy: {
    requiresHumanReview: true,
    autoApplyAllowed: false,
    allowGraphPromotion: false,
    allowReferenceLearning: false,
    allowModelTraining: false
  },
  importPlan: {
    approvalCandidates: [acceptedDecision()],
    needsReviewItems: [
      acceptedDecision({
        queueId: 'pending-hitl-002',
        contentSha256: hashB,
        action: 'mark_needs_review',
        defectType: '플래시',
        defectClass: 'flash',
        reviewComment: '파팅라인 주변인지 추가 확인이 필요함',
        decidedAt: '2026-07-27T13:01:00.000Z'
      })
    ],
    rejectedCandidates: [
      acceptedDecision({
        queueId: 'pending-hitl-003',
        contentSha256: hashC,
        action: 'reject_candidate',
        defectType: '웰드라인',
        defectClass: 'weld_line',
        reviewComment: '원본 이미지 품질과 라벨 근거가 부족함',
        decidedAt: '2026-07-27T13:02:00.000Z'
      })
    ],
    recaptureRequests: [
      acceptedDecision({
        queueId: 'pending-hitl-004',
        contentSha256: hashD,
        action: 'request_recapture',
        defectType: '흑점/탄화',
        defectClass: 'burn',
        reviewComment: '탄화 여부 확인을 위해 추가 시점 촬영 필요',
        requestedViews: ['defect_closeup', 'oblique_light'],
        decidedAt: '2026-07-27T13:03:00.000Z'
      })
    ]
  },
  sources: {
    queuePacket: 'artifacts/vision-pending-hitl-review-queue-packet.json',
    decisionPacket: 'artifacts/common-agent-hitl-decisions.json'
  },
  ...overrides
});

test('builds an artifact-only worklist for non-approval Vision HITL decisions', () => {
  const worklist = buildVisionPendingHitlNonApprovalWorklist({
    generatedAt: '2026-07-27T13:15:00.000Z',
    decisionVerificationReport: readyReport(),
    sourceArtifacts: {
      decisionVerificationReport: 'artifacts/vision-pending-hitl-decision-verification-report.json'
    }
  });

  assert.equal(worklist.contractVersion, 'vision-pending-hitl-non-approval-worklist/v1');
  assert.equal(worklist.status, 'action_required');
  assert.equal(worklist.serviceWritesPerformed, false);
  assert.equal(worklist.localArtifactsWritten, true);
  assert.equal(worklist.policy.autoApplyAllowed, false);
  assert.equal(worklist.policy.allowGraphPromotion, false);
  assert.equal(worklist.policy.allowReferenceLearning, false);
  assert.equal(worklist.summary.totalItems, 3);
  assert.equal(worklist.summary.approvalCandidatesExcluded, 1);
  assert.deepEqual(worklist.summary.itemsByAction, {
    mark_needs_review: 1,
    reject_candidate: 1,
    request_recapture: 1
  });
  assert.deepEqual(
    worklist.items.map(item => item.action),
    ['mark_needs_review', 'reject_candidate', 'request_recapture']
  );
  assert.ok(worklist.items.every(item => item.graphPromotionAllowed === false));
  assert.ok(worklist.items.every(item => item.referenceLearningAllowed === false));
  assert.ok(worklist.items.every(item => item.modelTrainingAllowed === false));
  assert.equal(worklist.items[0].owner, 'quality_hitl');
  assert.equal(worklist.items[1].owner, 'dataset_curator');
  assert.equal(worklist.items[2].owner, 'quality_capture');
  assert.deepEqual(worklist.items[2].requestedViews, ['defect_closeup', 'oblique_light']);
  assert.equal(worklist.commonAgentHandoff.items.length, 3);
  assert.equal(worklist.commonAgentHandoff.policy.allowGraphPromotion, false);
  assert.equal(
    worklist.sources.decisionVerificationReport,
    'artifacts/vision-pending-hitl-decision-verification-report.json'
  );
});

test('returns clear when a ready report contains only approval candidates', () => {
  const worklist = buildVisionPendingHitlNonApprovalWorklist({
    decisionVerificationReport: readyReport({
      importPlan: {
        approvalCandidates: [acceptedDecision()],
        needsReviewItems: [],
        rejectedCandidates: [],
        recaptureRequests: []
      }
    })
  });

  assert.equal(worklist.status, 'clear');
  assert.equal(worklist.summary.totalItems, 0);
  assert.equal(worklist.summary.approvalCandidatesExcluded, 1);
  assert.deepEqual(worklist.items, []);
  assert.match(worklist.recommendedAction, /authorization bridge/);
});

test('fails closed when the decision verification report is not ready', () => {
  const worklist = buildVisionPendingHitlNonApprovalWorklist({
    decisionVerificationReport: readyReport({
      status: 'awaiting_human_review',
      importPlan: {
        approvalCandidates: [],
        needsReviewItems: [],
        rejectedCandidates: [],
        recaptureRequests: []
      }
    })
  });

  assert.equal(worklist.status, 'not_ready_for_non_approval_worklist');
  assert.equal(worklist.summary.totalItems, 0);
  assert.equal(worklist.summary.blockingStatus, 'awaiting_human_review');
  assert.equal(worklist.commonAgentHandoff.items.length, 0);
});

test('fails closed when the verification report contract is missing', () => {
  const worklist = buildVisionPendingHitlNonApprovalWorklist({
    decisionVerificationReport: null
  });

  assert.equal(worklist.status, 'missing_decision_verification_report');
  assert.equal(worklist.summary.totalItems, 0);
  assert.equal(worklist.policy.allowModelTraining, false);
  assert.match(worklist.recommendedAction, /vision:hitl:verify-decisions/);
});
