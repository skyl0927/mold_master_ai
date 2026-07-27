const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildVisionApprovedLabelConflictDecisionTemplate
} = require('../visionApprovedLabelConflictDecisionTemplate');
const {
  buildVisionApprovedLabelConflictDecisionVerificationReport
} = require('../visionApprovedLabelConflictDecisionVerification');

const conflictPacket = {
  contractVersion: 'vision-approved-label-conflict-review-packet/v1',
  generatedAt: '2026-07-27T12:00:00.000Z',
  status: 'action_required',
  totalConflicts: 2,
  conflicts: [
    {
      conflictId: 'conflict-001',
      contentHash: 'a'.repeat(64),
      affectedCaseIds: ['approved-image-a', 'approved-image-b'],
      candidateLabels: ['백화', '웰드라인'],
      conflictType: 'same_hash_multi_label',
      decisionOptions: [
        { action: 'keep_label', label: '백화' },
        { action: 'keep_label', label: '웰드라인' },
        { action: 'mark_needs_review' },
        { action: 'reject_conflicting_cases' },
        { action: 'request_recapture' }
      ],
      caseEvidence: [
        {
          caseId: 'approved-image-a',
          fixtureFound: true,
          manifestListed: true,
          manifestStatus: 'active',
          fixtureFile: 'image-a.json',
          fileName: 'same.png',
          expectedDefectType: '백화',
          expectedDefectClass: 'whitening',
          sourceReview: {
            originalVisionDefectType: '백화',
            priorObservationSummary: '리브 주변 유백색 응력 흔적입니다.'
          },
          humanReviewFocusKo: '동일 이미지 hash에서 백화와 웰드라인 중 지배 결함을 확인하세요.'
        }
      ]
    },
    {
      conflictId: 'conflict-002',
      contentHash: '',
      affectedCaseIds: ['approved-image-c'],
      candidateLabels: ['플래시', '표면 결함'],
      conflictType: 'single_record_multi_label',
      decisionOptions: [
        { action: 'keep_label', label: '플래시' },
        { action: 'keep_label', label: '표면 결함' },
        { action: 'request_recapture' }
      ]
    }
  ]
};

test('builds a no-write decision template for approved label conflicts', () => {
  const template = buildVisionApprovedLabelConflictDecisionTemplate({
    generatedAt: '2026-07-27T12:30:00.000Z',
    conflictPacket,
    sourceArtifacts: {
      conflictPacket: 'artifacts/vision-approved-label-conflict-review-packet.json'
    }
  });

  assert.equal(template.contractVersion, 'vision-approved-label-conflict-decisions/v1');
  assert.equal(template.templateVersion, 'vision-approved-label-conflict-decisions-template/v1');
  assert.equal(template.status, 'template_ready');
  assert.equal(template.serviceWritesPerformed, false);
  assert.equal(template.policy.autoApplyAllowed, false);
  assert.equal(template.policy.allowGraphPromotion, false);
  assert.equal(template.policy.allowReferenceLearning, false);
  assert.equal(template.summary.conflicts, 2);
  assert.equal(template.summary.decisionsPrepared, 2);
  assert.deepEqual(template.summary.conflictsByType, {
    same_hash_multi_label: 1,
    single_record_multi_label: 1
  });

  assert.deepEqual(template.decisions[0].candidateLabels, ['백화', '웰드라인']);
  assert.deepEqual(template.decisions[0].allowedActions, [
    'keep_label',
    'mark_needs_review',
    'reject_conflicting_cases',
    'request_recapture'
  ]);
  assert.equal(template.decisions[0].selectedLabel, '');
  assert.equal(template.decisions[0].imageSetConfirmed, false);
  assert.equal(template.decisions[0].labelConfirmed, false);
  assert.equal(template.decisions[0].reviewerGuidance.includes('자동 승격'), true);
  assert.equal(template.decisions[0].evidence.caseEvidence.length, 1);
  assert.equal(template.decisions[0].evidence.caseEvidence[0].caseId, 'approved-image-a');
  assert.equal(template.decisions[0].evidence.caseEvidence[0].manifestListed, true);
  assert.equal(template.decisions[0].evidence.caseEvidence[0].fixtureFile, 'image-a.json');
  assert.equal(template.decisions[0].evidence.caseEvidence[0].expectedDefectType, '백화');
  assert.match(template.decisions[0].evidence.caseEvidence[0].humanReviewFocusKo, /지배 결함/);
  assert.match(template.decisions[0].reviewerGuidance, /fixture 근거/);
  assert.equal(template.sources.conflictPacket, 'artifacts/vision-approved-label-conflict-review-packet.json');
});

test('verifies human conflict decisions and produces a manual import plan only', () => {
  const report = buildVisionApprovedLabelConflictDecisionVerificationReport({
    generatedAt: '2026-07-27T13:00:00.000Z',
    conflictPacket,
    decisionPacket: {
      contractVersion: 'vision-approved-label-conflict-decisions/v1',
      reviewer: {
        id: 'quality-lead-01',
        name: '품질 담당자'
      },
      reviewedAt: '2026-07-27T12:55:00.000Z',
      decisions: [
        {
          conflictId: 'conflict-001',
          contentHash: 'a'.repeat(64),
          affectedCaseIds: ['approved-image-a', 'approved-image-b'],
          action: 'keep_label',
          selectedLabel: '백화',
          imageSetConfirmed: true,
          labelConfirmed: true,
          decidedAt: '2026-07-27T12:50:00.000Z',
          reviewComment: '동일 이미지 재확인 결과 리브 주변 백화가 맞습니다.'
        },
        {
          conflictId: 'conflict-002',
          contentHash: '',
          affectedCaseIds: ['approved-image-c'],
          action: 'request_recapture',
          requestedViews: ['정면', '측면'],
          decidedAt: '2026-07-27T12:51:00.000Z',
          reviewComment: '단일 이미지로 플래시와 표면 결함 구분이 어려워 재촬영합니다.'
        }
      ]
    },
    sourceArtifacts: {
      conflictPacket: 'packet.json',
      decisionPacket: 'decisions.json'
    }
  });

  assert.equal(report.contractVersion, 'vision-approved-label-conflict-decision-verification-report/v1');
  assert.equal(report.status, 'ready_for_manual_import');
  assert.equal(report.serviceWritesPerformed, false);
  assert.equal(report.policy.allowGraphPromotion, false);
  assert.equal(report.summary.conflicts, 2);
  assert.equal(report.summary.acceptedDecisions, 2);
  assert.equal(report.summary.invalidDecisions, 0);
  assert.equal(report.summary.resolvedLabelConflicts, 1);
  assert.equal(report.summary.recaptureRequests, 1);
  assert.deepEqual(report.pendingConflicts, []);

  assert.equal(report.importPlan.resolvedLabelConflicts[0].selectedLabel, '백화');
  assert.equal(report.importPlan.resolvedLabelConflicts[0].requiresManualImport, true);
  assert.equal(report.importPlan.resolvedLabelConflicts[0].graphPromotionAllowed, false);
  assert.equal(report.importPlan.resolvedLabelConflicts[0].referenceLearningAllowed, false);
  assert.deepEqual(report.importPlan.recaptureRequests[0].requestedViews, ['정면', '측면']);
  assert.equal(report.sources.decisionPacket, 'decisions.json');
});

test('rejects unsupported labels and keeps graph/reference writes blocked', () => {
  const report = buildVisionApprovedLabelConflictDecisionVerificationReport({
    conflictPacket,
    decisionPacket: {
      reviewer: {
        id: 'quality-lead-01'
      },
      decisions: [{
        conflictId: 'conflict-001',
        contentHash: 'a'.repeat(64),
        affectedCaseIds: ['approved-image-a', 'approved-image-b'],
        action: 'keep_label',
        selectedLabel: '수축',
        imageSetConfirmed: true,
        labelConfirmed: true,
        decidedAt: '2026-07-27T12:50:00.000Z',
        reviewComment: '후보에 없는 라벨을 잘못 선택한 케이스입니다.'
      }]
    }
  });

  assert.equal(report.status, 'invalid_decisions');
  assert.equal(report.summary.invalidDecisions, 1);
  assert.equal(report.invalidDecisions[0].code, 'selected_label_not_in_candidates');
  assert.equal(report.policy.allowGraphPromotion, false);
  assert.equal(report.policy.allowReferenceLearning, false);
  assert.deepEqual(report.importPlan.resolvedLabelConflicts, []);
});

test('waits for remaining human decisions when only part of conflicts are resolved', () => {
  const report = buildVisionApprovedLabelConflictDecisionVerificationReport({
    conflictPacket,
    decisionPacket: {
      reviewer: {
        id: 'quality-lead-01'
      },
      decisions: [{
        conflictId: 'conflict-001',
        contentHash: 'a'.repeat(64),
        affectedCaseIds: ['approved-image-a', 'approved-image-b'],
        action: 'mark_needs_review',
        decidedAt: '2026-07-27T12:50:00.000Z',
        reviewComment: '두 라벨 근거가 모두 부족하여 재검토로 돌립니다.'
      }]
    }
  });

  assert.equal(report.status, 'partial_human_review');
  assert.equal(report.summary.acceptedDecisions, 1);
  assert.equal(report.summary.pendingConflicts, 1);
  assert.deepEqual(report.pendingConflicts.map(item => item.conflictId), ['conflict-002']);
});
