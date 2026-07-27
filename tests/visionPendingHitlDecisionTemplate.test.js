const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildVisionPendingHitlDecisionTemplate
} = require('../visionPendingHitlDecisionTemplate');

const hashA = 'a'.repeat(64);
const hashB = 'b'.repeat(64);

const queuePacket = {
  schemaVersion: 1,
  contractVersion: 'vision-pending-hitl-review-queue-packet/v1',
  status: 'action_required',
  serviceWritesPerformed: false,
  summary: {
    pendingHighConfidence: 2,
    pendingByClass: {
      sink: 1,
      flash: 1
    }
  },
  items: [
    {
      queueId: 'pending-hitl-001',
      defectType: '싱크',
      defectClass: 'sink',
      contentSha256: hashA,
      sourceKind: 'web-case',
      relativePath: 'web-case/sink.jpg',
      evidence: {
        sourceLabel: '싱크',
        visionSuggestedLabel: '싱크',
        visionConfidence: 0.83,
        visionSummary: '리브 주변 함몰이 관찰됨',
        reviewReasons: ['Source and Vision agree on sink.']
      },
      allowedDecisions: [
        { action: 'approve_candidate' },
        { action: 'mark_needs_review' },
        { action: 'reject_candidate' },
        { action: 'request_recapture' }
      ]
    },
    {
      queueId: 'pending-hitl-002',
      defectType: '플래시',
      defectClass: 'flash',
      contentSha256: hashB,
      sourceKind: 'knowledge-card',
      relativePath: 'knowledge-card/flash.png',
      evidence: {
        sourceLabel: '플래시',
        visionSuggestedLabel: '플래시',
        visionConfidence: 0.74,
        visionSummary: '분할면 경계 외부 얇은 잉여 수지가 관찰됨',
        reviewReasons: ['Source and Vision agree on flash.']
      },
      allowedDecisions: [
        { action: 'approve_candidate' },
        { action: 'mark_needs_review' },
        { action: 'reject_candidate' },
        { action: 'request_recapture' }
      ]
    }
  ]
};

test('builds a fillable Common Agent HITL decision template from pending queue items', () => {
  const template = buildVisionPendingHitlDecisionTemplate({
    generatedAt: '2026-07-27T14:00:00.000Z',
    queuePacket,
    sourceArtifacts: {
      queuePacket: 'artifacts/vision-pending-hitl-review-queue-packet.json'
    }
  });

  assert.equal(template.contractVersion, 'common-agent-hitl-review-decisions/v1');
  assert.equal(template.templateVersion, 'common-agent-hitl-review-decisions-template/v1');
  assert.equal(template.status, 'template_ready');
  assert.equal(template.serviceWritesPerformed, false);
  assert.equal(template.policy.autoApplyAllowed, false);
  assert.equal(template.policy.allowGraphPromotion, false);
  assert.equal(template.summary.queueItems, 2);
  assert.equal(template.summary.decisionsPrepared, 2);
  assert.deepEqual(template.summary.pendingByClass, { sink: 1, flash: 1 });
  assert.equal(template.reviewer.id, '');
  assert.equal(template.reviewedAt, '');
  assert.match(template.verification.command, /vision:hitl:verify-decisions/);
  assert.equal(template.decisions.length, 2);
  assert.equal(template.decisions[0].queueId, 'pending-hitl-001');
  assert.equal(template.decisions[0].contentSha256, hashA);
  assert.equal(template.decisions[0].action, 'pending');
  assert.equal(template.decisions[0].approvedDefectType, '싱크');
  assert.equal(template.decisions[0].manufacturingImageConfirmed, false);
  assert.equal(template.decisions[0].labelConfirmed, false);
  assert.equal(template.decisions[0].reviewComment, '');
  assert.deepEqual(template.decisions[0].allowedActions, [
    'approve_candidate',
    'mark_needs_review',
    'reject_candidate',
    'request_recapture'
  ]);
  assert.deepEqual(template.decisions[0].requiredFieldsByAction.approve_candidate, [
    'action',
    'approvedDefectType',
    'manufacturingImageConfirmed',
    'labelConfirmed',
    'reviewer.id',
    'decidedAt',
    'reviewComment'
  ]);
  assert.equal(template.decisions[0].evidence.visionSummary, '리브 주변 함몰이 관찰됨');
  assert.equal(template.sources.queuePacket, 'artifacts/vision-pending-hitl-review-queue-packet.json');
});

test('returns clear when the pending HITL queue has no items', () => {
  const template = buildVisionPendingHitlDecisionTemplate({
    queuePacket: {
      ...queuePacket,
      status: 'clear',
      summary: {
        pendingHighConfidence: 0
      },
      items: []
    }
  });

  assert.equal(template.status, 'clear');
  assert.equal(template.summary.queueItems, 0);
  assert.deepEqual(template.decisions, []);
  assert.match(template.recommendedAction, /검토 대상 없음/);
});

test('fails closed when the pending HITL queue packet is missing', () => {
  const template = buildVisionPendingHitlDecisionTemplate({
    queuePacket: null
  });

  assert.equal(template.status, 'missing_queue_packet');
  assert.equal(template.summary.queueItems, 0);
  assert.deepEqual(template.decisions, []);
  assert.equal(template.policy.autoApplyAllowed, false);
  assert.match(template.recommendedAction, /vision:hitl:pending-packet/);
});
