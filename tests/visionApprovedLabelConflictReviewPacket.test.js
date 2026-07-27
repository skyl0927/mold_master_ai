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

test('enriches conflicts with approved fixture evidence for HITL review', () => {
  const packet = buildVisionApprovedLabelConflictReviewPacket({
    generatedAt: '2026-07-27T12:35:00.000Z',
    readinessAudit,
    approvedManifest: {
      cases: [
        {
          id: 'approved-image-a',
          file: 'image-a.json',
          status: 'active',
          tags: ['approved-image', 'capture-needs_views']
        },
        {
          id: 'approved-image-b',
          file: 'image-b.json',
          status: 'needs_review',
          tags: ['approved-image', 'vision-label-conflict']
        }
      ]
    },
    fixturesByCaseId: {
      'approved-image-a': {
        id: 'approved-image-a',
        title: '제팅 approved image',
        fileName: 'same.png',
        contentHash: 'a'.repeat(64),
        captureProtocol: {
          imageKind: 'physical_product',
          availableViews: ['defect_closeup'],
          roiConfirmed: true
        },
        expected: {
          defectType: '제팅',
          defectClass: 'jetting'
        },
        sourceReview: {
          reviewStatus: 'approved',
          priorObservationDefectType: '제팅',
          originalVisionDefectType: '제팅',
          priorObservationSummary: '게이트 유입 후 뱀형 유동 흔적이 관찰됩니다.'
        }
      },
      'approved-image-b': {
        id: 'approved-image-b',
        title: '플로우마크 approved image',
        fileName: 'same.png',
        contentHash: 'a'.repeat(64),
        captureProtocol: {
          imageKind: 'physical_product',
          availableViews: [],
          roiConfirmed: false
        },
        expected: {
          defectType: '플로우마크',
          defectClass: 'flow_mark'
        },
        sourceReview: {
          reviewStatus: 'approved',
          priorObservationDefectType: '플로우마크',
          originalVisionDefectType: '흐름 자국',
          priorObservationSummary: '표면의 반복적인 유동 방향성 띠가 지배적입니다.'
        }
      },
      'approved-image-c': {
        id: 'approved-image-c',
        title: '플래시 approved image',
        fileName: 'orphan.png',
        contentHash: 'c'.repeat(64),
        expected: {
          defectType: '플래시',
          defectClass: 'flash'
        },
        sourceReview: {
          reviewStatus: 'approved',
          priorObservationDefectType: '플래시',
          originalVisionDefectType: '표면 결함',
          priorObservationSummary: '파팅라인 주변 얇은 잉여 수지가 관찰됩니다.'
        }
      }
    },
    approvedFixtureRoot: 'eval/vision-approved'
  });

  const firstConflict = packet.conflicts[0];
  assert.equal(firstConflict.reviewEvidenceStatus, 'fixture_evidence_ready');
  assert.equal(firstConflict.caseEvidence.length, 2);
  assert.equal(firstConflict.caseEvidence[0].caseId, 'approved-image-a');
  assert.equal(firstConflict.caseEvidence[0].manifestStatus, 'active');
  assert.equal(firstConflict.caseEvidence[0].manifestListed, true);
  assert.equal(firstConflict.caseEvidence[0].fixtureFile, 'image-a.json');
  assert.deepEqual(firstConflict.caseEvidence[0].manifestTags, ['approved-image', 'capture-needs_views']);
  assert.equal(firstConflict.caseEvidence[0].fixtureFound, true);
  assert.equal(firstConflict.caseEvidence[0].expectedDefectType, '제팅');
  assert.equal(firstConflict.caseEvidence[0].expectedDefectClass, 'jetting');
  assert.equal(firstConflict.caseEvidence[0].captureProtocol.imageKind, 'physical_product');
  assert.equal(firstConflict.caseEvidence[0].captureProtocol.roiConfirmed, true);
  assert.equal(firstConflict.caseEvidence[0].sourceReview.originalVisionDefectType, '제팅');
  assert.match(firstConflict.caseEvidence[0].sourceReview.priorObservationSummary, /뱀형 유동 흔적/);
  assert.match(firstConflict.caseEvidence[0].humanReviewFocusKo, /동일 이미지 hash/);
  assert.equal(packet.conflicts[1].reviewEvidenceStatus, 'fixture_evidence_ready');
  assert.equal(packet.conflicts[1].caseEvidence[0].manifestListed, false);
  assert.equal(packet.conflicts[1].caseEvidence[0].fixtureFound, true);
  assert.equal(packet.summary.evidenceReadyCases, 3);
  assert.equal(packet.summary.evidenceMissingCases, 0);
  assert.equal(packet.summary.manifestUnlistedCases, 1);
  assert.equal(packet.sources.approvedFixtureRoot, 'eval/vision-approved');
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
