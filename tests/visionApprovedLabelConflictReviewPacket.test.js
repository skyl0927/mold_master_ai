const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildVisionApprovedLabelConflictReviewPacket
} = require('../visionApprovedLabelConflictReviewPacket');

const readinessAudit = {
  contractVersion: 'vision-operational-readiness-audit/v1',
  generatedAt: '2026-07-27T12:00:00.000Z',
  status: 'action_required',
  blockers: [{
    source: 'post_hitl',
    code: 'approved_label_conflicts',
    count: 2,
    conflicts: [
      {
        contentHash: 'a'.repeat(64),
        caseIds: ['approved-image-a', 'approved-image-b'],
        labels: ['제팅', '플로우마크']
      },
      {
        contentHash: '',
        caseIds: ['approved-image-c'],
        labels: ['플래시', '표면 결함']
      }
    ]
  }]
};

test('builds a human-only conflict review packet from readiness audit blockers', () => {
  const packet = buildVisionApprovedLabelConflictReviewPacket({
    generatedAt: '2026-07-27T12:30:00.000Z',
    readinessAudit,
    sourceArtifacts: {
      readinessAudit: 'artifacts/vision-operational-readiness-audit.json'
    }
  });

  assert.equal(packet.contractVersion, 'vision-approved-label-conflict-review-packet/v1');
  assert.equal(packet.status, 'action_required');
  assert.equal(packet.totalConflicts, 2);
  assert.equal(packet.serviceWritesPerformed, false);
  assert.equal(packet.policy.requiresHumanReview, true);
  assert.equal(packet.policy.automaticCorrectionAllowed, false);
  assert.equal(packet.policy.allowGraphPromotion, false);
  assert.equal(packet.policy.allowReferenceLearning, false);
  assert.equal(packet.conflicts[0].conflictId, 'conflict-001');
  assert.equal(packet.conflicts[0].conflictType, 'same_hash_multi_label');
  assert.deepEqual(packet.conflicts[0].candidateLabels, ['제팅', '플로우마크']);
  assert.deepEqual(packet.conflicts[0].affectedCaseIds, ['approved-image-a', 'approved-image-b']);
  assert.deepEqual(
    packet.conflicts[0].decisionOptions.map(option => option.action),
    ['keep_label', 'keep_label', 'mark_needs_review', 'reject_conflicting_cases', 'request_recapture']
  );
  assert.equal(packet.conflicts[1].conflictType, 'single_record_multi_label');
  assert.equal(packet.commonAgentReviewRequest.itemCount, 2);
  assert.equal(packet.sources.readinessAudit, 'artifacts/vision-operational-readiness-audit.json');
});

test('can also build the packet from post-HITL verification reports', () => {
  const packet = buildVisionApprovedLabelConflictReviewPacket({
    postHitlVerificationReport: {
      schemaVersion: 1,
      status: 'waiting_for_human_hitl',
      preflight: {
        conflicts: [{
          contentHash: 'b'.repeat(64),
          caseIds: ['approved-image-d', 'approved-image-e'],
          labels: ['수축', '백화', '수축']
        }]
      }
    }
  });

  assert.equal(packet.status, 'action_required');
  assert.equal(packet.totalConflicts, 1);
  assert.deepEqual(packet.conflicts[0].candidateLabels, ['수축', '백화']);
  assert.equal(packet.conflicts[0].conflictType, 'same_hash_multi_label');
});

test('fails closed with a clear packet when no conflicts are present', () => {
  const packet = buildVisionApprovedLabelConflictReviewPacket({
    readinessAudit: {
      contractVersion: 'vision-operational-readiness-audit/v1',
      blockers: []
    }
  });

  assert.equal(packet.status, 'clear');
  assert.equal(packet.totalConflicts, 0);
  assert.deepEqual(packet.conflicts, []);
  assert.equal(packet.policy.automaticCorrectionAllowed, false);
  assert.match(packet.recommendedAction, /라벨 충돌 없음/);
});
