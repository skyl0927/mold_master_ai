const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildOperationalHitlReviewerWorksheet
} = require('../operationalHitlReviewerWorksheet');

const inputReviewPacket = () => ({
  contractVersion: 'operational-hitl-decision-input-review-packet/v1',
  status: 'awaiting_human_input',
  serviceWritesPerformed: false,
  summary: {
    totalTemplateItems: 59,
    totalPendingActions: 59,
    targetDecisionInputsMissing: 56,
    firstQueueCode: 'vision_label_conflicts',
    sectionCount: 3
  },
  reviewOrder: [
    {
      priority: 1,
      queueCode: 'vision_label_conflicts',
      titleKo: '승인 이미지 라벨 충돌 판정',
      owner: 'quality_hitl',
      targetPending: 4,
      nextActionKo: '라벨 충돌 decision file에서 action과 필수 확인 필드를 채운 뒤 verify-decisions로 검증하세요.'
    },
    {
      priority: 2,
      queueCode: 'vision_pending_hitl',
      titleKo: 'Vision pending HITL 판정',
      owner: 'quality_hitl',
      targetPending: 12,
      nextActionKo: 'Vision HITL decision file에서 제조 이미지 확인과 라벨 확정 필드를 채운 뒤 verify-decisions로 검증하세요.'
    },
    {
      priority: 3,
      queueCode: 'web_knowledge_hitl',
      titleKo: 'Web Knowledge HITL 승인',
      owner: 'knowledge_owner',
      targetPending: 40,
      nextActionKo: 'Web Case decision file에서 승인/보완/반려 action과 승인 근거 필드를 채운 뒤 verify-decisions로 검증하세요.'
    }
  ],
  sections: [
    {
      queueCode: 'vision_label_conflicts',
      titleKo: '승인 이미지 라벨 충돌 판정',
      owner: 'quality_hitl',
      status: 'awaiting_human_input',
      sourceArtifact: 'artifacts/vision-approved-label-conflict-decisions-template.json',
      preparedDecisionItems: 4,
      targetPending: 4,
      pendingActions: 4,
      allowedActions: [
        'keep_label',
        'mark_needs_review',
        'reject_conflicting_cases',
        'request_recapture'
      ],
      requiredFields: [
        'action',
        'selectedLabel',
        'imageSetConfirmed',
        'labelConfirmed',
        'reviewer.id',
        'decidedAt',
        'reviewComment',
        'requestedViews'
      ],
      decisionIdentifierField: 'conflictId',
      decisionIdsPreview: ['conflict-001', 'conflict-002', 'conflict-003', 'conflict-004'],
      decisionIdsTruncated: 0,
      verificationCommand: 'npm run vision:label-conflicts:verify-decisions -- --decisions <filled-vision-label-conflict-decisions.json>',
      nextActionKo: '라벨 충돌 decision file에서 action과 필수 확인 필드를 채운 뒤 verify-decisions로 검증하세요.'
    },
    {
      queueCode: 'vision_pending_hitl',
      titleKo: 'Vision pending HITL 판정',
      owner: 'quality_hitl',
      status: 'awaiting_human_input',
      sourceArtifact: 'artifacts/common-agent-hitl-review-decisions-template.json',
      preparedDecisionItems: 12,
      targetPending: 12,
      pendingActions: 12,
      allowedActions: [
        'approve_candidate',
        'mark_needs_review',
        'reject_candidate',
        'request_recapture'
      ],
      requiredFields: [
        'action',
        'approvedDefectType',
        'manufacturingImageConfirmed',
        'labelConfirmed',
        'reviewer.id',
        'decidedAt',
        'reviewComment',
        'requestedViews'
      ],
      decisionIdentifierField: 'queueId',
      decisionIdsPreview: [
        'pending-hitl-001',
        'pending-hitl-002',
        'pending-hitl-003'
      ],
      decisionIdsTruncated: 9,
      verificationCommand: 'npm run vision:hitl:verify-decisions -- --decisions <filled-common-agent-hitl-decisions.json>',
      nextActionKo: 'Vision HITL decision file에서 제조 이미지 확인과 라벨 확정 필드를 채운 뒤 verify-decisions로 검증하세요.'
    }
  ],
  humanGatedCommands: [
    'npm run vision:label-conflicts:verify-decisions -- --decisions <filled-vision-label-conflict-decisions.json>',
    'npm run vision:hitl:verify-decisions -- --decisions <filled-common-agent-hitl-decisions.json>',
    'npm run knowledge:web:hitl:verify-decisions -- --decisions <filled-web-knowledge-hitl-decisions.json>'
  ],
  recommendedAction: 'vision_label_conflicts부터 decision file을 채우고 검증하세요.'
});

test('builds a Korean Markdown worksheet for human HITL review without writes', () => {
  const worksheet = buildOperationalHitlReviewerWorksheet({
    generatedAt: '2026-07-27T13:20:00.000Z',
    inputReviewPacket: inputReviewPacket(),
    sourceArtifacts: {
      inputReviewPacket: 'artifacts/operational-hitl-decision-input-review-packet.json'
    }
  });

  assert.equal(worksheet.contractVersion, 'operational-hitl-reviewer-worksheet/v1');
  assert.equal(worksheet.status, 'ready_for_human_review');
  assert.equal(worksheet.serviceWritesPerformed, false);
  assert.equal(worksheet.policy.autoApplyAllowed, false);
  assert.equal(worksheet.policy.allowGraphPromotion, false);
  assert.equal(worksheet.policy.allowReferenceLearning, false);
  assert.equal(worksheet.policy.allowModelTraining, false);
  assert.equal(worksheet.summary.targetDecisionInputsMissing, 56);
  assert.equal(worksheet.summary.firstQueueCode, 'vision_label_conflicts');
  assert.equal(worksheet.summary.nextReviewQueueCode, 'vision_label_conflicts');
  assert.equal(worksheet.summary.nextReviewDecisionId, 'conflict-001');
  assert.equal(worksheet.summary.nextReviewSourceArtifact, 'artifacts/vision-approved-label-conflict-decisions-template.json');
  assert.equal(worksheet.summary.worksheetSectionCount, 2);
  assert.ok(worksheet.summary.markdownLineCount > 20);
  assert.deepEqual(worksheet.nextReviewCursor, {
    queueCode: 'vision_label_conflicts',
    titleKo: '승인 이미지 라벨 충돌 판정',
    owner: 'quality_hitl',
    decisionIdentifierField: 'conflictId',
    decisionId: 'conflict-001',
    sourceArtifact: 'artifacts/vision-approved-label-conflict-decisions-template.json',
    verificationCommand: 'npm run vision:label-conflicts:verify-decisions -- --decisions <filled-vision-label-conflict-decisions.json>',
    requiredFields: [
      'action',
      'selectedLabel',
      'imageSetConfirmed',
      'labelConfirmed',
      'reviewer.id',
      'decidedAt',
      'reviewComment',
      'requestedViews'
    ],
    allowedActions: [
      'keep_label',
      'mark_needs_review',
      'reject_conflicting_cases',
      'request_recapture'
    ],
    nextActionKo: '라벨 충돌 decision file에서 action과 필수 확인 필드를 채운 뒤 verify-decisions로 검증하세요.'
  });
  assert.equal(worksheet.nextReviewSlip.titleKo, '다음 HITL 판정: vision_label_conflicts / conflict-001');
  assert.equal(worksheet.nextReviewSlip.queueCode, 'vision_label_conflicts');
  assert.equal(worksheet.nextReviewSlip.decisionId, 'conflict-001');
  assert.deepEqual(worksheet.nextReviewSlip.operatorInstructionsKo, [
    'source file에서 conflict-001 항목을 찾으세요.',
    '원본 이미지/텍스트 근거를 확인하고 allowed action 중 하나만 선택하세요.',
    'required fields를 모두 채운 뒤 verification command를 실행하세요.',
    '검증이 ready가 되기 전에는 Graph, Reference, Model 학습에 반영하지 마세요.'
  ]);
  assert.equal(worksheet.nextReviewSlip.safetyNoticeKo, 'Artifact-only 안내입니다. 자동 적용, Graph 승격, Reference 학습, Model 학습은 모두 금지됩니다.');
  assert.equal(worksheet.summary.reviewSlipQueueCount, 7);
  assert.equal(worksheet.summary.reviewSlipQueuePreviewLimit, 10);
  assert.equal(worksheet.reviewSlipQueue.length, 7);
  assert.deepEqual(worksheet.reviewSlipQueue.slice(0, 5).map(slip => [
    slip.slipNumber,
    slip.queueCode,
    slip.decisionId
  ]), [
    [1, 'vision_label_conflicts', 'conflict-001'],
    [2, 'vision_label_conflicts', 'conflict-002'],
    [3, 'vision_label_conflicts', 'conflict-003'],
    [4, 'vision_label_conflicts', 'conflict-004'],
    [5, 'vision_pending_hitl', 'pending-hitl-001']
  ]);
  assert.equal(worksheet.reviewSlipQueue[4].sourceArtifact, 'artifacts/common-agent-hitl-review-decisions-template.json');
  assert.deepEqual(worksheet.reviewChecklist, [
    '원본 이미지 또는 원문 근거 확인',
    'action을 pending에서 허용 action 중 하나로 변경',
    'reviewer.id 또는 reviewerId 입력',
    'decidedAt 또는 reviewedAt 입력',
    'reviewComment 8자 이상 입력',
    '검증 명령 실행 후 ready 상태 확인'
  ]);
  assert.match(worksheet.markdown, /# Operational HITL Reviewer Worksheet/);
  assert.match(worksheet.markdown, /남은 입력: 56/);
  assert.match(worksheet.markdown, /## Next HITL Review Cursor/);
  assert.match(worksheet.markdown, /## Next HITL Review Slip/);
  assert.match(worksheet.markdown, /## HITL Review Slip Queue/);
  assert.match(worksheet.markdown, /decision id: conflict-001/);
  assert.match(worksheet.markdown, /1\. vision_label_conflicts \/ conflict-001/);
  assert.match(worksheet.markdown, /5\. vision_pending_hitl \/ pending-hitl-001/);
  assert.match(worksheet.markdown, /source file에서 conflict-001 항목을 찾으세요/);
  assert.match(worksheet.markdown, /Graph, Reference, Model 학습에 반영하지 마세요/);
  assert.match(worksheet.markdown, /1\. vision_label_conflicts/);
  assert.match(worksheet.markdown, /필수 필드: action, selectedLabel, imageSetConfirmed/);
  assert.match(worksheet.markdown, /결정 ID 미리보기: conflict-001, conflict-002/);
  assert.match(worksheet.markdown, /추가 미표시: 9/);
  assert.match(worksheet.markdown, /Graph\/Reference\/Model 승격 금지/);
  assert.match(worksheet.markdown, /npm run vision:hitl:verify-decisions/);
  assert.equal(worksheet.sources.inputReviewPacket, 'artifacts/operational-hitl-decision-input-review-packet.json');
  assert.match(worksheet.recommendedAction, /vision_label_conflicts/);
});

test('fails closed when the input review packet is missing', () => {
  const worksheet = buildOperationalHitlReviewerWorksheet({
    generatedAt: '2026-07-27T13:21:00.000Z'
  });

  assert.equal(worksheet.status, 'missing_evidence');
  assert.equal(worksheet.serviceWritesPerformed, false);
  assert.equal(worksheet.summary.missingArtifacts, 1);
  assert.equal(worksheet.summary.markdownLineCount, 0);
  assert.equal(worksheet.markdown, '');
  assert.deepEqual(worksheet.reviewChecklist, []);
  assert.equal(worksheet.nextReviewSlip, null);
  assert.deepEqual(worksheet.reviewSlipQueue, []);
  assert.match(worksheet.recommendedAction, /operational:hitl:decision-review-packet/);
});
