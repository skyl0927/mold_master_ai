const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildVisionPendingHitlReviewGuide
} = require('../visionPendingHitlReviewGuide');

const decisionTemplate = {
  contractVersion: 'common-agent-hitl-review-decisions/v1',
  templateVersion: 'common-agent-hitl-review-decisions-template/v1',
  status: 'template_ready',
  decisions: [
    {
      queueId: 'pending-hitl-001',
      contentSha256: 'a'.repeat(64),
      defectType: '싱크',
      defectClass: 'sink',
      action: 'pending',
      approvedDefectType: '싱크',
      allowedActions: ['approve_candidate', 'mark_needs_review', 'reject_candidate', 'request_recapture'],
      evidence: {
        sourceLabel: '싱크',
        visionSuggestedLabel: '싱크',
        visionConfidence: 0.83,
        visionSummary: '리브 주변 함몰이 관찰됨',
        reviewReasons: ['Source and Vision agree on sink.', 'Vision confidence is 83%.']
      },
      source: {
        sourceKind: 'web-case',
        relativePath: 'web-case/02-Sink-marks.jpg'
      }
    },
    {
      queueId: 'pending-hitl-002',
      contentSha256: 'b'.repeat(64),
      defectType: '플래시',
      defectClass: 'flash',
      action: 'pending',
      approvedDefectType: '플래시',
      allowedActions: ['approve_candidate', 'mark_needs_review', 'reject_candidate', 'request_recapture'],
      evidence: {
        sourceLabel: '플래시',
        visionSuggestedLabel: '플래시',
        visionConfidence: 0.74,
        visionSummary: '분할면 경계 외부 얇은 잉여 수지가 관찰됨',
        reviewReasons: ['Source and Vision agree on flash.', 'Vision confidence is 74%.']
      },
      source: {
        sourceKind: 'knowledge-card',
        relativePath: 'knowledge-card/flash.png'
      }
    }
  ]
};

test('builds a no-write review guide for pending high-confidence HITL candidates', () => {
  const guide = buildVisionPendingHitlReviewGuide({
    generatedAt: '2026-07-27T14:10:00.000Z',
    decisionTemplate,
    sourceArtifacts: {
      decisionTemplate: 'artifacts/common-agent-hitl-review-decisions-template.json'
    }
  });

  assert.equal(guide.contractVersion, 'vision-pending-hitl-review-guide/v1');
  assert.equal(guide.status, 'action_required');
  assert.equal(guide.serviceWritesPerformed, false);
  assert.equal(guide.policy.autoApplyAllowed, false);
  assert.equal(guide.policy.allowGraphPromotion, false);
  assert.equal(guide.policy.allowReferenceLearning, false);
  assert.equal(guide.summary.queueItems, 2);
  assert.equal(guide.summary.sourceVisionAgreements, 2);
  assert.equal(guide.summary.confidenceReviewRequired, 1);
  assert.equal(guide.summary.averageVisionConfidence, 0.785);

  const first = guide.items[0];
  assert.equal(first.queueId, 'pending-hitl-001');
  assert.equal(first.defectType, '싱크');
  assert.deepEqual(first.riskFlags, [
    'source_vision_agreement',
    'human_confirmation_required'
  ]);
  assert.equal(first.evidenceCard.sourceLabel, '싱크');
  assert.equal(first.evidenceCard.visionSuggestedLabel, '싱크');
  assert.equal(first.evidenceCard.visionConfidencePercent, 83);
  assert.match(first.decisionChecklistKo[0], /원본 이미지/);
  assert.match(first.decisionChecklistKo[1], /제조 이미지/);
  assert.equal(first.prefillDecisionDraft.action, 'pending');
  assert.equal(first.prefillDecisionDraft.approvedDefectType, '싱크');
  assert.equal(first.prefillDecisionDraft.manufacturingImageConfirmed, false);

  const second = guide.items[1];
  assert.deepEqual(second.riskFlags, [
    'source_vision_agreement',
    'confidence_review_required',
    'human_confirmation_required'
  ]);
  assert.match(second.suggestedReviewPathKo, /74%/);
  assert.match(second.suggestedReviewPathKo, /자동 승인하지 마세요/);
  assert.equal(guide.sources.decisionTemplate, 'artifacts/common-agent-hitl-review-decisions-template.json');
});

test('fails closed when pending HITL decision template is missing', () => {
  const guide = buildVisionPendingHitlReviewGuide({
    decisionTemplate: null
  });

  assert.equal(guide.status, 'missing_decision_template');
  assert.equal(guide.summary.queueItems, 0);
  assert.deepEqual(guide.items, []);
  assert.match(guide.recommendedAction, /vision:hitl:decision-template/);
  assert.equal(guide.policy.allowGraphPromotion, false);
});

test('returns clear guide when there are no pending HITL decisions', () => {
  const guide = buildVisionPendingHitlReviewGuide({
    decisionTemplate: {
      contractVersion: 'common-agent-hitl-review-decisions/v1',
      templateVersion: 'common-agent-hitl-review-decisions-template/v1',
      status: 'clear',
      decisions: []
    }
  });

  assert.equal(guide.status, 'clear');
  assert.equal(guide.summary.queueItems, 0);
  assert.deepEqual(guide.items, []);
  assert.match(guide.recommendedAction, /검토 대상 없음/);
});
