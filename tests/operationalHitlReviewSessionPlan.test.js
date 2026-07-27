const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildOperationalHitlReviewSessionPlan
} = require('../operationalHitlReviewSessionPlan');

const suggestionRow = overrides => ({
  queueCode: 'vision_pending_hitl',
  decisionId: 'pending-hitl-001',
  titleKo: 'Vision pending HITL 판정',
  rowStatus: 'pending',
  currentAction: 'pending',
  newAction: '',
  displayLabel: '싱크',
  recommendedNewAction: 'approve_candidate',
  recommendationConfidence: '0.68',
  recommendationRisk: 'medium',
  recommendationReasonKo: '비전 설명과 결함명이 일치하는 승인 후보입니다.',
  missingReviewFields: '',
  requiredHumanChecksKo: '원본 제조 이미지 여부, ROI/결함 위치, 최종 결함 라벨을 사람이 확인하세요.',
  suggestedReviewComment: '원본 제조 이미지와 결함 라벨을 확인한 뒤 승인 후보로 검토합니다.',
  suggestedApprovedDefectType: '싱크',
  suggestedRequestedViews: '',
  suggestedConfirmed: '',
  suggestedManufacturingImageConfirmed: '',
  suggestedLabelConfirmed: '',
  requiredFields: 'action | approvedDefectType | manufacturingImageConfirmed | labelConfirmed | reviewer.id | decidedAt | reviewComment | requestedViews',
  copyToWorktableInstructionKo: '사람이 추천 내용을 검토한 뒤 원본 worktable CSV의 newAction 및 필수 필드에 필요한 값만 옮겨 적으세요.',
  editablePath: 'C:\\repo\\workspace\\02-vision-pending-hitl.decisions.json',
  verificationCommand: 'npm run vision:hitl:verify-decisions -- --decisions "C:\\repo\\workspace\\02-vision-pending-hitl.decisions.json"',
  ...overrides
});

const suggestionArtifact = rows => ({
  contractVersion: 'operational-hitl-decision-worktable-suggestion/v1',
  status: 'ready_for_human_review',
  serviceWritesPerformed: false,
  summary: {
    totalRows: rows.length,
    pendingRows: rows.length,
    suggestionRows: rows.length
  },
  rows,
  sources: {
    worktableExport: 'C:\\repo\\artifacts\\operational-hitl-decision-worktable-export.json'
  }
});

test('builds a no-write HITL review session plan grouped by review priority', () => {
  const plan = buildOperationalHitlReviewSessionPlan({
    generatedAt: '2026-07-27T16:00:00.000Z',
    worktableSuggestion: suggestionArtifact([
      suggestionRow({
        queueCode: 'web_knowledge_hitl',
        decisionId: 'web-basf-22-jetting',
        displayLabel: '제팅',
        recommendedNewAction: 'approve_card',
        recommendationRisk: 'medium',
        recommendationReasonKo: '필수 도메인 카드 필드가 채워져 있어 승인 후보입니다.',
        suggestedReviewedDefectName: '제팅',
        suggestedReviewedProblem: '게이트 주변에 뱀 모양의 표면 자국이 발생한다.',
        suggestedConfirmed: '',
        requiredFields: 'action | reviewerId | decidedAt | reviewComment | confirmed | reviewedDefectName | reviewedProblem'
      }),
      suggestionRow({
        queueCode: 'vision_label_conflicts',
        decisionId: 'conflict-001',
        displayLabel: '제팅 | 플로우마크',
        recommendedNewAction: 'mark_needs_review',
        recommendationRisk: 'high',
        recommendationReasonKo: '라벨 충돌 항목은 원본 동일 hash와 지배 결함 확인 전까지 needs_review 격리가 안전합니다.',
        suggestedReviewComment: '라벨 충돌이 있어 원본 확인 전까지 학습 후보에서 격리합니다.',
        requiredFields: 'action | selectedLabel | imageSetConfirmed | labelConfirmed | reviewer.id | decidedAt | reviewComment | requestedViews'
      }),
      suggestionRow({
        queueCode: 'vision_pending_hitl',
        decisionId: 'pending-hitl-002',
        displayLabel: '교육용 도식',
        recommendedNewAction: 'request_recapture',
        recommendationRisk: 'high',
        recommendationReasonKo: '비전 설명에 도식/비제조 이미지 위험이 있어 학습 승인보다 재촬영 요청으로 검토하는 것이 안전합니다.',
        suggestedRequestedViews: '제품 전체 정면 | 결함부 근접 | 측면 보조 | 동일 조건 재촬영'
      })
    ]),
    sourceArtifacts: {
      worktableSuggestion: 'C:\\repo\\artifacts\\operational-hitl-decision-worktable-suggestion.json'
    }
  });

  assert.equal(plan.contractVersion, 'operational-hitl-review-session-plan/v1');
  assert.equal(plan.status, 'ready_for_human_review');
  assert.equal(plan.serviceWritesPerformed, false);
  assert.equal(plan.policy.autoPopulateNewActionAllowed, false);
  assert.equal(plan.policy.allowGraphPromotion, false);
  assert.equal(plan.summary.totalRows, 3);
  assert.equal(plan.summary.sessionCount, 3);
  assert.equal(plan.summary.highRiskRows, 2);
  assert.deepEqual(
    plan.sessions.map(session => session.code),
    ['label_conflict_session', 'recapture_session', 'web_card_approval_session']
  );
  assert.equal(plan.sessions[0].rows[0].decisionId, 'conflict-001');
  assert.deepEqual(plan.sessions[0].rows[0].copyableFields, [
    {
      worktableColumn: 'newAction',
      suggestedColumn: 'recommendedNewAction',
      value: 'mark_needs_review'
    },
    {
      worktableColumn: 'reviewComment',
      suggestedColumn: 'suggestedReviewComment',
      value: '라벨 충돌이 있어 원본 확인 전까지 학습 후보에서 격리합니다.'
    }
  ]);
  assert.deepEqual(plan.sessions[0].rows[0].manualConfirmationFields, [
    'selectedLabel',
    'imageSetConfirmed',
    'labelConfirmed',
    'reviewer.id',
    'decidedAt',
    'requestedViews'
  ]);
  assert.ok(plan.sessions[2].rows[0].copyableFields.some(
    field => field.worktableColumn === 'reviewedDefectName' && field.value === '제팅'
  ));
  assert.match(plan.markdown, /Label conflict/);
  assert.match(plan.markdown, /자동 적용 금지/);
  assert.match(plan.recommendedAction, /세션별/);
});

test('returns clear session plan when suggestion artifact has no rows', () => {
  const plan = buildOperationalHitlReviewSessionPlan({
    worktableSuggestion: suggestionArtifact([])
  });

  assert.equal(plan.status, 'clear');
  assert.equal(plan.summary.totalRows, 0);
  assert.deepEqual(plan.sessions, []);
  assert.match(plan.recommendedAction, /추가 HITL 추천 행이 없습니다/);
});

test('fails closed when worktable suggestion evidence is missing', () => {
  const plan = buildOperationalHitlReviewSessionPlan({});

  assert.equal(plan.status, 'missing_evidence');
  assert.equal(plan.serviceWritesPerformed, false);
  assert.equal(plan.summary.missingArtifacts, 1);
  assert.deepEqual(plan.sessions, []);
  assert.match(plan.recommendedAction, /worktable-suggest/);
});
