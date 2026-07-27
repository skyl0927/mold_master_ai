const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildVisionPendingHitlAuthorizationBridge
} = require('../visionPendingHitlAuthorizationBridge');
const {
  AUTHORIZATION_STATEMENT,
  computeVisionPacketDigest,
  validateVisionHitlAuthorization
} = require('../visionHitlAuthorization');

const hashA = 'a'.repeat(64);
const hashB = 'b'.repeat(64);
const hashC = 'c'.repeat(64);

const candidate = ({ hash, relativePath, defectType, defectClass }) => ({
  relativePath,
  contentSha256: hash,
  defectType,
  defectClass,
  reviewPriority: 1,
  reviewBucket: 'agreement_high_confidence',
  labelEvidence: {
    sourceLabel: defectType,
    visionSuggestedLabel: defectType,
    visionConfidence: 0.93,
    conflict: false
  },
  sourceLineage: {
    packetSourceKind: 'web-case',
    webCaseId: `case-${defectClass}`
  }
});

const manifest = {
  schemaVersion: 1,
  generatedAt: '2026-07-24T08:18:12.829Z',
  candidates: [
    candidate({
      hash: hashA,
      relativePath: 'web-case/sink.jpg',
      defectType: '싱크',
      defectClass: 'sink'
    }),
    candidate({
      hash: hashB,
      relativePath: 'web-case/flash.jpg',
      defectType: '플래시',
      defectClass: 'flash'
    })
  ]
};

const readyReport = {
  schemaVersion: 1,
  contractVersion: 'vision-pending-hitl-decision-verification-report/v1',
  generatedAt: '2026-07-27T13:00:00.000Z',
  status: 'ready_for_manual_import',
  serviceWritesPerformed: false,
  summary: {
    queueItems: 3,
    approvalCandidates: 1,
    needsReviewItems: 1,
    rejectedCandidates: 1,
    recaptureRequests: 0
  },
  importPlan: {
    approvalCandidates: [{
      queueId: 'pending-hitl-001',
      contentSha256: hashA,
      action: 'approve_candidate',
      defectType: '싱크',
      defectClass: 'sink',
      reviewerId: 'reviewer-01',
      reviewComment: '원본 이미지와 싱크 라벨을 사람이 확인함',
      decidedAt: '2026-07-27T12:10:00.000Z',
      requiresManualImport: true,
      graphPromotionAllowed: false,
      referenceLearningAllowed: false
    }],
    needsReviewItems: [{
      queueId: 'pending-hitl-002',
      contentSha256: hashB,
      action: 'mark_needs_review',
      defectType: '플래시',
      defectClass: 'flash',
      reviewerId: 'reviewer-01',
      reviewComment: '파팅라인 주변인지 추가 검토가 필요함',
      decidedAt: '2026-07-27T12:11:00.000Z'
    }],
    rejectedCandidates: [{
      queueId: 'pending-hitl-003',
      contentSha256: hashC,
      action: 'reject_candidate',
      defectType: '웰드라인',
      defectClass: 'weld_line',
      reviewerId: 'reviewer-01',
      reviewComment: '원본 이미지 근거가 부족하여 반려함',
      decidedAt: '2026-07-27T12:12:00.000Z'
    }],
    recaptureRequests: []
  },
  sources: {
    queuePacket: 'artifacts/vision-pending-hitl-review-queue-packet.json',
    decisionPacket: 'artifacts/common-agent-hitl-decisions.json'
  }
};

test('builds a live approval authorization from verified approval decisions only', () => {
  const bridge = buildVisionPendingHitlAuthorizationBridge({
    generatedAt: '2026-07-27T13:05:00.000Z',
    decisionVerificationReport: readyReport,
    reviewManifest: manifest,
    packetRoot: 'artifacts/vision-human-review-packet-20260724081812'
  });

  assert.equal(bridge.contractVersion, 'vision-pending-hitl-authorization-bridge/v1');
  assert.equal(bridge.status, 'ready_for_live_approval');
  assert.equal(bridge.serviceWritesPerformed, false);
  assert.equal(bridge.policy.autoApplyAllowed, false);
  assert.equal(bridge.policy.allowGraphPromotion, false);
  assert.equal(bridge.summary.approvalTargets, 1);
  assert.equal(bridge.summary.needsReviewItems, 1);
  assert.equal(bridge.summary.rejectedCandidates, 1);
  assert.match(bridge.recommendedAction, /vision:hitl:approve/);

  const authorization = bridge.authorization;
  assert.equal(authorization.authorizationStatement, AUTHORIZATION_STATEMENT);
  assert.equal(authorization.packetDigest, computeVisionPacketDigest(manifest));
  assert.equal(authorization.authorizedBy, 'reviewer-01');
  assert.equal(authorization.authorizedAt, '2026-07-27T12:10:00.000Z');
  assert.equal(authorization.targets.length, 1);
  assert.equal(authorization.targets[0].relativePath, 'web-case/sink.jpg');
  assert.equal(authorization.targets[0].contentSha256, hashA);
  assert.equal(authorization.targets[0].decision, 'approve');
  assert.equal(authorization.targets[0].manufacturingImageConfirmed, true);
  assert.equal(authorization.targets[0].labelConfirmed, true);
  assert.equal(authorization.targets[0].approvedDefectType, '싱크');
  assert.equal(bridge.nonApprovalDecisions.needsReviewItems.length, 1);
  assert.equal(bridge.nonApprovalDecisions.rejectedCandidates.length, 1);

  const validated = validateVisionHitlAuthorization({
    authorization,
    manifest,
    datasetItems: []
  });
  assert.equal(validated.targets.length, 1);
  assert.equal(validated.targets[0].defectClass, 'sink');
});

test('fails closed until the decision verification report is fully ready', () => {
  const bridge = buildVisionPendingHitlAuthorizationBridge({
    decisionVerificationReport: {
      ...readyReport,
      status: 'awaiting_human_review',
      importPlan: {
        approvalCandidates: [],
        needsReviewItems: [],
        rejectedCandidates: [],
        recaptureRequests: []
      }
    },
    reviewManifest: manifest,
    packetRoot: 'artifacts/vision-human-review-packet-20260724081812'
  });

  assert.equal(bridge.status, 'not_ready_for_manual_import');
  assert.equal(bridge.authorization, null);
  assert.equal(bridge.summary.blockingStatus, 'awaiting_human_review');
  assert.match(bridge.recommendedAction, /vision:hitl:verify-decisions/);
});

test('blocks authorization when an approved decision is not bound to the review manifest', () => {
  const bridge = buildVisionPendingHitlAuthorizationBridge({
    decisionVerificationReport: {
      ...readyReport,
      importPlan: {
        ...readyReport.importPlan,
        approvalCandidates: [{
          ...readyReport.importPlan.approvalCandidates[0],
          contentSha256: hashC
        }]
      }
    },
    reviewManifest: manifest,
    packetRoot: 'artifacts/vision-human-review-packet-20260724081812'
  });

  assert.equal(bridge.status, 'authorization_target_mismatch');
  assert.equal(bridge.authorization, null);
  assert.equal(bridge.invalidTargets.length, 1);
  assert.equal(bridge.invalidTargets[0].contentSha256, hashC);
  assert.match(bridge.recommendedAction, /review packet/);
});

test('reports no approval work when reviewed decisions contain only non-approval actions', () => {
  const bridge = buildVisionPendingHitlAuthorizationBridge({
    decisionVerificationReport: {
      ...readyReport,
      summary: {
        ...readyReport.summary,
        approvalCandidates: 0
      },
      importPlan: {
        ...readyReport.importPlan,
        approvalCandidates: []
      }
    },
    reviewManifest: manifest,
    packetRoot: 'artifacts/vision-human-review-packet-20260724081812'
  });

  assert.equal(bridge.status, 'no_approval_candidates');
  assert.equal(bridge.authorization, null);
  assert.equal(bridge.summary.approvalTargets, 0);
  assert.equal(bridge.nonApprovalDecisions.needsReviewItems.length, 1);
  assert.equal(bridge.nonApprovalDecisions.rejectedCandidates.length, 1);
});
