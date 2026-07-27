const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildVisionPendingHitlReviewQueuePacket
} = require('../visionPendingHitlReviewQueuePacket');

const highConfidenceCandidate = overrides => ({
  relativePath: 'web-case/02-Sink-marks.jpg',
  defectType: '싱크',
  defectClass: 'sink',
  contentSha256: 'a'.repeat(64),
  reviewBucket: 'agreement_high_confidence',
  reviewDecision: 'unreviewed',
  reviewPriority: 1,
  reviewReasons: [
    'Source and Vision agree on sink.',
    'Vision confidence is 83%.'
  ],
  labelEvidence: {
    sourceLabel: '싱크',
    visionSuggestedLabel: '싱크',
    visionConfidence: 0.83,
    visionSummary: 'sink mark visible',
    conflict: false
  },
  sourceLineage: {
    packetSourceKind: 'web-case',
    sourceDocumentId: 'doc-web-1'
  },
  ...overrides
});

const reviewPacket = {
  schemaVersion: 1,
  generatedAt: '2026-07-27T12:00:00.000Z',
  policy: {
    persistence: 'none',
    approval: 'human_required',
    graphPromotion: 'disabled_until_common_agent_approval'
  },
  summary: {
    candidates: 4
  },
  candidates: [
    highConfidenceCandidate(),
    highConfidenceCandidate({
      relativePath: 'knowledge-card/flash.png',
      defectType: '플래시',
      defectClass: 'flash',
      contentSha256: 'b'.repeat(64),
      labelEvidence: {
        sourceLabel: '플래시',
        visionSuggestedLabel: '플래시',
        visionConfidence: 0.7,
        conflict: false
      },
      sourceLineage: {
        packetSourceKind: 'knowledge-card'
      }
    }),
    highConfidenceCandidate({
      relativePath: 'already-approved.png',
      defectType: '백화',
      defectClass: 'whitening',
      contentSha256: 'c'.repeat(64),
      labelEvidence: {
        sourceLabel: '백화',
        visionSuggestedLabel: '백화',
        visionConfidence: 0.9,
        conflict: false
      },
      sourceLineage: {
        packetSourceKind: 'knowledge-card'
      }
    }),
    {
      relativePath: 'class-conflict.png',
      defectType: '미성형',
      defectClass: 'short_shot',
      contentSha256: 'd'.repeat(64),
      reviewBucket: 'class_conflict',
      reviewDecision: 'unreviewed',
      labelEvidence: {
        visionConfidence: 0.9,
        conflict: true
      }
    }
  ]
};

test('builds a Common Agent-ready queue for unresolved high-confidence HITL candidates', () => {
  const packet = buildVisionPendingHitlReviewQueuePacket({
    generatedAt: '2026-07-27T12:30:00.000Z',
    reviewPacket,
    approvedManifest: {
      cases: [{
        id: 'approved-image-c',
        status: 'active',
        contentHash: 'c'.repeat(64)
      }]
    },
    postHitlVerificationReport: {
      preflight: {
        unresolvedHighConfidence: 2
      }
    },
    sourceArtifacts: {
      reviewPacket: 'artifacts/vision-human-review-packet/vision-candidates.json',
      approvedManifest: 'eval/vision-approved/manifest.json',
      postHitlVerificationReport: 'artifacts/post-hitl-verification-report.json'
    }
  });

  assert.equal(packet.contractVersion, 'vision-pending-hitl-review-queue-packet/v1');
  assert.equal(packet.status, 'action_required');
  assert.equal(packet.serviceWritesPerformed, false);
  assert.equal(packet.policy.requiresHumanReview, true);
  assert.equal(packet.policy.automaticApprovalAllowed, false);
  assert.equal(packet.policy.allowGraphPromotion, false);
  assert.equal(packet.policy.allowReferenceLearning, false);
  assert.equal(packet.summary.pendingHighConfidence, 2);
  assert.equal(packet.summary.resolvedHighConfidence, 1);
  assert.equal(packet.summary.skippedNonHighConfidence, 1);
  assert.deepEqual(packet.summary.pendingByClass, {
    sink: 1,
    flash: 1
  });
  assert.equal(packet.items.length, 2);
  assert.equal(packet.items[0].queueId, 'pending-hitl-001');
  assert.equal(packet.items[0].commonAgentAction, 'review_high_confidence_candidate');
  assert.deepEqual(
    packet.items[0].allowedDecisions.map(decision => decision.action),
    ['approve_candidate', 'mark_needs_review', 'reject_candidate', 'request_recapture']
  );
  assert.equal(packet.items[0].payload.contentSha256, 'a'.repeat(64));
  assert.equal(packet.items[0].payload.graphPromotionAllowed, false);
  assert.equal(packet.items[0].payload.referenceLearningAllowed, false);
  assert.equal(packet.commonAgentReviewRequest.itemCount, 2);
  assert.equal(packet.commonAgentReviewRequest.reviewType, 'pending_high_confidence_vision_hitl');
  assert.equal(packet.sources.reviewPacket, 'artifacts/vision-human-review-packet/vision-candidates.json');
  assert.equal(packet.sources.approvedManifest, 'eval/vision-approved/manifest.json');
  assert.match(packet.recommendedAction, /고신뢰 합의 후보 2건/);
});

test('returns clear when every high-confidence candidate is already represented in approved data', () => {
  const packet = buildVisionPendingHitlReviewQueuePacket({
    reviewPacket: {
      ...reviewPacket,
      candidates: [
        highConfidenceCandidate({
          contentSha256: 'e'.repeat(64)
        })
      ]
    },
    approvedManifest: {
      approvedHashes: ['e'.repeat(64)]
    }
  });

  assert.equal(packet.status, 'clear');
  assert.equal(packet.summary.pendingHighConfidence, 0);
  assert.equal(packet.summary.resolvedHighConfidence, 1);
  assert.deepEqual(packet.items, []);
  assert.match(packet.recommendedAction, /미해결 고신뢰 후보 없음/);
});

test('fails closed when the review packet is missing', () => {
  const packet = buildVisionPendingHitlReviewQueuePacket({
    reviewPacket: null,
    approvedManifest: {
      cases: []
    }
  });

  assert.equal(packet.status, 'missing_review_packet');
  assert.equal(packet.summary.pendingHighConfidence, 0);
  assert.deepEqual(packet.items, []);
  assert.equal(packet.policy.automaticApprovalAllowed, false);
  assert.match(packet.recommendedAction, /vision:review-packet/);
});
