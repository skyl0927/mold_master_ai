const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildVisionApprovedLabelConflictReviewGuide
} = require('../visionApprovedLabelConflictReviewGuide');

const decisionTemplate = {
  contractVersion: 'vision-approved-label-conflict-decisions/v1',
  templateVersion: 'vision-approved-label-conflict-decisions-template/v1',
  status: 'template_ready',
  decisions: [
    {
      conflictId: 'conflict-001',
      contentHash: 'a'.repeat(64),
      affectedCaseIds: ['approved-image-a', 'approved-image-b'],
      candidateLabels: ['제팅', '플로우마크'],
      conflictType: 'same_hash_multi_label',
      evidence: {
        caseEvidence: [
          {
            caseId: 'approved-image-a',
            fixtureFound: true,
            manifestListed: true,
            manifestStatus: 'active',
            fixtureFile: 'image-a.json',
            fileName: 'same.png',
            expectedDefectType: '제팅',
            expectedDefectClass: 'jetting',
            captureProtocol: {
              imageKind: 'physical_product',
              availableViews: ['defect_closeup'],
              roiConfirmed: true
            },
            sourceReview: {
              priorObservationDefectType: '제팅',
              originalVisionDefectType: '제팅',
              priorObservationSummary: '게이트 유입 후 뱀형 유동 흔적이 관찰됩니다.'
            },
            humanReviewFocusKo: '동일 이미지 hash에서 제팅과 플로우마크 중 지배 결함을 확인하세요.'
          },
          {
            caseId: 'approved-image-b',
            fixtureFound: true,
            manifestListed: false,
            manifestStatus: '',
            fixtureFile: '',
            fileName: 'same.png',
            expectedDefectType: '플로우마크',
            expectedDefectClass: 'flow_mark',
            captureProtocol: {
              imageKind: 'physical_product',
              availableViews: [],
              roiConfirmed: false
            },
            sourceReview: {
              priorObservationDefectType: '플로우마크',
              originalVisionDefectType: '흐름 자국',
              priorObservationSummary: '표면의 반복적인 유동 방향성 띠가 지배적입니다.'
            },
            humanReviewFocusKo: '동일 이미지 hash에서 제팅과 플로우마크 중 지배 결함을 확인하세요.'
          }
        ]
      }
    },
    {
      conflictId: 'conflict-002',
      contentHash: '',
      affectedCaseIds: ['approved-image-c'],
      candidateLabels: ['수축', '백화'],
      conflictType: 'single_record_multi_label',
      evidence: {
        caseEvidence: [
          {
            caseId: 'approved-image-c',
            fixtureFound: true,
            manifestListed: true,
            manifestStatus: 'needs_review',
            fixtureFile: 'image-c.json',
            expectedDefectType: '수축',
            expectedDefectClass: 'other:수축',
            captureProtocol: {
              imageKind: 'unknown',
              availableViews: [],
              roiConfirmed: false
            },
            sourceReview: {
              priorObservationDefectType: '수축',
              originalVisionDefectType: '백화',
              priorObservationSummary: 'ROI 내부에 흐린 유백색 변색이 관찰됩니다.'
            },
            humanReviewFocusKo: '승인 라벨과 기존 비전 관찰 중 Graph 학습에 남길 정답 라벨을 확인하세요.'
          }
        ]
      }
    }
  ]
};

test('builds a no-write HITL review guide from enriched label conflict decisions', () => {
  const guide = buildVisionApprovedLabelConflictReviewGuide({
    generatedAt: '2026-07-27T12:40:00.000Z',
    decisionTemplate,
    sourceArtifacts: {
      decisionTemplate: 'artifacts/vision-approved-label-conflict-decisions-template.json'
    }
  });

  assert.equal(guide.contractVersion, 'vision-approved-label-conflict-review-guide/v1');
  assert.equal(guide.status, 'action_required');
  assert.equal(guide.serviceWritesPerformed, false);
  assert.equal(guide.policy.autoApplyAllowed, false);
  assert.equal(guide.policy.allowGraphPromotion, false);
  assert.equal(guide.policy.allowReferenceLearning, false);
  assert.equal(guide.summary.conflicts, 2);
  assert.equal(guide.summary.evidenceCases, 3);
  assert.equal(guide.summary.manifestUnlistedCases, 1);
  assert.equal(guide.summary.captureProtocolRiskCases, 2);

  const first = guide.items[0];
  assert.equal(first.conflictId, 'conflict-001');
  assert.deepEqual(first.riskFlags, [
    'same_hash_multi_label',
    'manifest_unlisted_fixture',
    'capture_protocol_incomplete'
  ]);
  assert.deepEqual(first.labelEvidence.map(item => item.label), ['제팅', '플로우마크']);
  assert.equal(first.labelEvidence[0].expectedLabelCases[0], 'approved-image-a');
  assert.equal(first.labelEvidence[0].visionLabelCases[0], 'approved-image-a');
  assert.equal(first.labelEvidence[1].expectedLabelCases[0], 'approved-image-b');
  assert.equal(first.evidenceMatrix[1].manifestListed, false);
  assert.match(first.decisionChecklistKo[0], /동일 hash/);
  assert.equal(first.prefillDecisionDraft.action, 'pending');
  assert.equal(first.prefillDecisionDraft.selectedLabel, '');

  const second = guide.items[1];
  assert.deepEqual(second.riskFlags, [
    'approved_vs_vision_disagreement',
    'capture_protocol_incomplete'
  ]);
  assert.equal(second.labelEvidence.find(item => item.label === '백화').visionLabelCases[0], 'approved-image-c');
  assert.match(second.suggestedReviewPathKo, /자동으로 keep_label/);
  assert.equal(guide.sources.decisionTemplate, 'artifacts/vision-approved-label-conflict-decisions-template.json');
});

test('fails closed when decision template evidence is missing', () => {
  const guide = buildVisionApprovedLabelConflictReviewGuide({
    decisionTemplate: null
  });

  assert.equal(guide.status, 'missing_decision_template');
  assert.equal(guide.summary.conflicts, 0);
  assert.deepEqual(guide.items, []);
  assert.match(guide.recommendedAction, /decision-template/);
  assert.equal(guide.policy.allowGraphPromotion, false);
});

test('returns clear guide when there are no label conflict decisions', () => {
  const guide = buildVisionApprovedLabelConflictReviewGuide({
    decisionTemplate: {
      contractVersion: 'vision-approved-label-conflict-decisions/v1',
      templateVersion: 'vision-approved-label-conflict-decisions-template/v1',
      status: 'clear',
      decisions: []
    }
  });

  assert.equal(guide.status, 'clear');
  assert.equal(guide.summary.conflicts, 0);
  assert.deepEqual(guide.items, []);
  assert.match(guide.recommendedAction, /라벨 충돌 없음/);
});
