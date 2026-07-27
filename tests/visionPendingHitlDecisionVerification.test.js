const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildVisionPendingHitlDecisionVerificationReport
} = require('../visionPendingHitlDecisionVerification');

const hashA = 'a'.repeat(64);
const hashB = 'b'.repeat(64);
const hashC = 'c'.repeat(64);
const hashD = 'd'.repeat(64);

const queueItem = ({ queueId, contentSha256, defectType, defectClass }) => ({
  queueId,
  commonAgentAction: 'review_high_confidence_candidate',
  defectType,
  defectClass,
  contentSha256,
  payload: {
    contentSha256,
    defectType,
    defectClass,
    graphPromotionAllowed: false,
    referenceLearningAllowed: false
  },
  allowedDecisions: [
    { action: 'approve_candidate' },
    { action: 'mark_needs_review' },
    { action: 'reject_candidate' },
    { action: 'request_recapture' }
  ]
});

const queuePacket = {
  schemaVersion: 1,
  contractVersion: 'vision-pending-hitl-review-queue-packet/v1',
  status: 'action_required',
  serviceWritesPerformed: false,
  items: [
    queueItem({
      queueId: 'pending-hitl-001',
      contentSha256: hashA,
      defectType: '싱크',
      defectClass: 'sink'
    }),
    queueItem({
      queueId: 'pending-hitl-002',
      contentSha256: hashB,
      defectType: '플래시',
      defectClass: 'flash'
    }),
    queueItem({
      queueId: 'pending-hitl-003',
      contentSha256: hashC,
      defectType: '흑점/탄화',
      defectClass: 'burn'
    })
  ]
};

const baseDecisionPacket = {
  schemaVersion: 1,
  contractVersion: 'common-agent-hitl-review-decisions/v1',
  reviewer: {
    id: 'reviewer-01',
    name: '품질 검토자'
  },
  decisions: []
};

test('verifies reviewed pending HITL decisions into a no-write manual import plan', () => {
  const report = buildVisionPendingHitlDecisionVerificationReport({
    generatedAt: '2026-07-27T13:00:00.000Z',
    queuePacket,
    decisionPacket: {
      ...baseDecisionPacket,
      decisions: [
        {
          queueId: 'pending-hitl-001',
          contentSha256: hashA,
          action: 'approve_candidate',
          approvedDefectType: '싱크',
          manufacturingImageConfirmed: true,
          labelConfirmed: true,
          reviewComment: '원본 이미지와 싱크 라벨을 사람이 확인함',
          decidedAt: '2026-07-27T12:10:00.000Z'
        },
        {
          queueId: 'pending-hitl-002',
          contentSha256: hashB,
          action: 'mark_needs_review',
          reviewComment: '파팅라인 주변인지 추가 검토가 필요함',
          decidedAt: '2026-07-27T12:11:00.000Z'
        },
        {
          queueId: 'pending-hitl-003',
          contentSha256: hashC,
          action: 'request_recapture',
          reviewComment: '탄화 여부 확인을 위해 결함 근접 재촬영 필요',
          requestedViews: ['defect_closeup', 'oblique_light'],
          decidedAt: '2026-07-27T12:12:00.000Z'
        }
      ]
    },
    sourceArtifacts: {
      queuePacket: 'artifacts/vision-pending-hitl-review-queue-packet.json',
      decisionPacket: 'artifacts/common-agent-hitl-decisions.json'
    }
  });

  assert.equal(report.contractVersion, 'vision-pending-hitl-decision-verification-report/v1');
  assert.equal(report.status, 'ready_for_manual_import');
  assert.equal(report.serviceWritesPerformed, false);
  assert.equal(report.policy.autoApplyAllowed, false);
  assert.equal(report.policy.allowGraphPromotion, false);
  assert.equal(report.policy.allowReferenceLearning, false);
  assert.equal(report.summary.queueItems, 3);
  assert.equal(report.summary.decisionsReceived, 3);
  assert.equal(report.summary.acceptedDecisions, 3);
  assert.equal(report.summary.invalidDecisions, 0);
  assert.equal(report.summary.pendingQueueItems, 0);
  assert.equal(report.summary.approvalCandidates, 1);
  assert.equal(report.summary.needsReviewItems, 1);
  assert.equal(report.summary.recaptureRequests, 1);
  assert.equal(report.acceptedDecisions[0].action, 'approve_candidate');
  assert.equal(report.acceptedDecisions[0].defectClass, 'sink');
  assert.equal(report.importPlan.approvalCandidates[0].contentSha256, hashA);
  assert.equal(report.importPlan.approvalCandidates[0].graphPromotionAllowed, false);
  assert.deepEqual(report.importPlan.recaptureRequests[0].requestedViews, [
    'defect_closeup',
    'oblique_light'
  ]);
  assert.equal(report.sources.queuePacket, 'artifacts/vision-pending-hitl-review-queue-packet.json');
});

test('fails closed when decisions are missing, duplicated, or not bound to queue items', () => {
  const report = buildVisionPendingHitlDecisionVerificationReport({
    queuePacket,
    decisionPacket: {
      ...baseDecisionPacket,
      decisions: [
        {
          queueId: 'pending-hitl-001',
          contentSha256: hashA,
          action: 'approve_candidate',
          approvedDefectType: '플래시',
          manufacturingImageConfirmed: true,
          labelConfirmed: true,
          reviewComment: '잘못된 라벨 변경 시도',
          decidedAt: '2026-07-27T12:10:00.000Z'
        },
        {
          queueId: 'pending-hitl-001',
          contentSha256: hashA,
          action: 'reject_candidate',
          reviewComment: '중복 판정',
          decidedAt: '2026-07-27T12:11:00.000Z'
        },
        {
          queueId: 'pending-hitl-999',
          contentSha256: hashD,
          action: 'approve_candidate',
          approvedDefectType: '백화',
          manufacturingImageConfirmed: true,
          labelConfirmed: true,
          reviewComment: '큐에 없는 판정',
          decidedAt: '2026-07-27T12:12:00.000Z'
        }
      ]
    }
  });

  assert.equal(report.status, 'invalid_decisions');
  assert.equal(report.summary.acceptedDecisions, 0);
  assert.equal(report.summary.invalidDecisions, 3);
  assert.deepEqual(
    report.invalidDecisions.map(item => item.code),
    ['approved_label_class_mismatch', 'duplicate_decision', 'unknown_queue_item']
  );
  assert.equal(report.policy.autoApplyAllowed, false);
});

test('reports partial human review when only some queue items have valid decisions', () => {
  const report = buildVisionPendingHitlDecisionVerificationReport({
    queuePacket,
    decisionPacket: {
      ...baseDecisionPacket,
      decisions: [{
        queueId: 'pending-hitl-002',
        contentSha256: hashB,
        action: 'reject_candidate',
        reviewComment: '이미지 품질과 라벨 근거가 부족함',
        decidedAt: '2026-07-27T12:11:00.000Z'
      }]
    }
  });

  assert.equal(report.status, 'partial_human_review');
  assert.equal(report.summary.acceptedDecisions, 1);
  assert.equal(report.summary.pendingQueueItems, 2);
  assert.deepEqual(report.pendingQueueItems.map(item => item.queueId), [
    'pending-hitl-001',
    'pending-hitl-003'
  ]);
});

test('fails closed when no decision packet is available yet', () => {
  const report = buildVisionPendingHitlDecisionVerificationReport({
    queuePacket,
    decisionPacket: null
  });

  assert.equal(report.status, 'awaiting_human_review');
  assert.equal(report.summary.queueItems, 3);
  assert.equal(report.summary.decisionsReceived, 0);
  assert.equal(report.summary.pendingQueueItems, 3);
  assert.deepEqual(report.acceptedDecisions, []);
  assert.match(report.recommendedAction, /Common Agent HITL 판정/);
});
