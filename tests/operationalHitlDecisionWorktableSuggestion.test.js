const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildOperationalHitlDecisionWorktableSuggestion
} = require('../operationalHitlDecisionWorktableSuggestion');

const worktableExport = rows => ({
  contractVersion: 'operational-hitl-decision-worktable-export/v1',
  status: 'ready_for_human_edit',
  serviceWritesPerformed: false,
  summary: {
    decisionRowCount: rows.length,
    pendingRowCount: rows.filter(row => row.rowStatus === 'pending').length
  },
  rows
});

const row = overrides => ({
  queueCode: 'vision_pending_hitl',
  decisionId: 'pending-hitl-001',
  titleKo: 'Vision pending HITL 판정',
  owner: 'quality_hitl',
  currentAction: 'pending',
  rowStatus: 'pending',
  newAction: '',
  displayLabel: '싱크 / sink',
  allowedActions: 'approve_candidate | mark_needs_review | reject_candidate | request_recapture',
  requiredFields: 'action | approvedDefectType | manufacturingImageConfirmed | labelConfirmed | reviewer.id | decidedAt | reviewComment | requestedViews',
  reviewFocusKo: '실제 사출 성형품 표면의 두꺼운 리브 주변에서 싱크 형상이 관찰됩니다.',
  approvedDefectType: '싱크',
  reviewedDefectName: '',
  reviewedProblem: '',
  reviewedPhenomenon: '',
  confirmed: '',
  requestedViews: '',
  causeCandidates: '',
  causeLabels: '',
  checkItems: '',
  actions: '',
  editablePath: 'C:\\repo\\workspace\\02-vision-pending-hitl.decisions.json',
  verificationCommand: 'npm run vision:hitl:verify-decisions -- --decisions "C:\\repo\\workspace\\02-vision-pending-hitl.decisions.json"',
  ...overrides
});

test('builds a no-write HITL suggestion draft without mutating importable newAction cells', () => {
  const suggestion = buildOperationalHitlDecisionWorktableSuggestion({
    generatedAt: '2026-07-27T15:00:00.000Z',
    worktableExport: worktableExport([
      row({
        decisionId: 'pending-hitl-001',
        reviewFocusKo: '이미지는 실제 성형품 표면 사진이 아니라 싱크를 설명하는 교육용 도식입니다. 실제 제품 외관의 결함 여부는 본 이미지로 판정할 수 없습니다.'
      }),
      row({
        queueCode: 'web_knowledge_hitl',
        decisionId: 'web-basf-04-weld-line',
        titleKo: 'Web Knowledge HITL 승인',
        owner: 'knowledge_owner',
        displayLabel: '웰드라인',
        allowedActions: 'approve_card | mark_needs_changes | reject_card',
        requiredFields: 'action | reviewerId | decidedAt | reviewComment | confirmed | reviewedDefectName | reviewedProblem | reviewedPhenomenon | causeCandidates | causeLabels | checkItems | actions',
        reviewFocusKo: '원문/이미지 근거와 사출 성형 도메인 적용 가능성을 확인하세요.',
        reviewedDefectName: '웰드라인',
        reviewedProblem: '사출 성형품에서 웰드라인 결함이 발생한다.',
        reviewedPhenomenon: '두 용융 수지 선단이 합류한 위치에 선형 자국이 보인다.',
        causeCandidates: '두 개 이상의 용융 수지 선단이 낮은 온도로 합류한다.',
        causeLabels: '유동 선단 | 금형 온도',
        checkItems: '보압 절환점 확인 | 벤트 청소 상태 확인',
        actions: '수지 온도 상승 | 게이트 위치 검토',
        approvedDefectType: ''
      })
    ]),
    sourceArtifacts: {
      worktableExport: 'C:\\repo\\artifacts\\operational-hitl-decision-worktable-export.json'
    }
  });

  assert.equal(suggestion.contractVersion, 'operational-hitl-decision-worktable-suggestion/v1');
  assert.equal(suggestion.status, 'ready_for_human_review');
  assert.equal(suggestion.serviceWritesPerformed, false);
  assert.equal(suggestion.policy.autoApplyAllowed, false);
  assert.equal(suggestion.policy.autoPopulateNewActionAllowed, false);
  assert.equal(suggestion.summary.totalRows, 2);
  assert.equal(suggestion.summary.suggestionRows, 2);
  assert.equal(suggestion.summary.recaptureSuggestions, 1);
  assert.equal(suggestion.summary.approveCardSuggestions, 1);
  assert.ok(suggestion.rows.every(item => item.newAction === ''));
  assert.equal(suggestion.rows[0].recommendedNewAction, 'request_recapture');
  assert.match(suggestion.rows[0].recommendationReasonKo, /도식|비제조/);
  assert.match(suggestion.rows[0].suggestedRequestedViews, /결함부 근접/);
  assert.equal(suggestion.rows[1].recommendedNewAction, 'approve_card');
  assert.equal(suggestion.rows[1].suggestedConfirmed, '');
  assert.equal(suggestion.rows[1].suggestedCauseLabels, '유동 선단 | 금형 온도');
  assert.match(suggestion.rows[1].requiredHumanChecksKo, /출처/);
  assert.match(suggestion.csv, /recommendedNewAction/);
  assert.match(suggestion.csv, /request_recapture/);
  assert.match(suggestion.markdown, /자동 적용 금지/);
  assert.match(suggestion.recommendedAction, /사람이/);
});

test('suggests approve_candidate only as a human-confirmed candidate for physical-product Vision rows', () => {
  const suggestion = buildOperationalHitlDecisionWorktableSuggestion({
    worktableExport: worktableExport([
      row({
        decisionId: 'pending-hitl-002',
        displayLabel: '웰드라인 / weld_line',
        approvedDefectType: '웰드라인',
        reviewFocusKo: '실제 사출 성형품 표면에서 두 흐름 선단이 합류한 선형 자국이 관찰됩니다.'
      })
    ])
  });

  assert.equal(suggestion.rows[0].recommendedNewAction, 'approve_candidate');
  assert.equal(suggestion.rows[0].suggestedApprovedDefectType, '웰드라인');
  assert.equal(suggestion.rows[0].suggestedManufacturingImageConfirmed, '');
  assert.equal(suggestion.rows[0].suggestedLabelConfirmed, '');
  assert.match(suggestion.rows[0].requiredHumanChecksKo, /원본 제조 이미지/);
});

test('routes incomplete Web Knowledge cards to needs-changes instead of approval', () => {
  const suggestion = buildOperationalHitlDecisionWorktableSuggestion({
    worktableExport: worktableExport([
      row({
        queueCode: 'web_knowledge_hitl',
        decisionId: 'web-incomplete',
        displayLabel: '미성형',
        allowedActions: 'approve_card | mark_needs_changes | reject_card',
        requiredFields: 'action | confirmed | reviewedDefectName | reviewedProblem | reviewedPhenomenon | causeCandidates | causeLabels | checkItems | actions',
        reviewedDefectName: '미성형',
        reviewedProblem: '사출 성형품에서 미성형 결함이 발생한다.',
        reviewedPhenomenon: '',
        causeCandidates: '',
        causeLabels: '',
        checkItems: '',
        actions: ''
      })
    ])
  });

  assert.equal(suggestion.rows[0].recommendedNewAction, 'mark_needs_changes');
  assert.match(suggestion.rows[0].recommendationReasonKo, /누락/);
  assert.match(suggestion.rows[0].missingReviewFields, /reviewedPhenomenon/);
});

test('fails closed when worktable export evidence is missing', () => {
  const suggestion = buildOperationalHitlDecisionWorktableSuggestion({});

  assert.equal(suggestion.status, 'missing_evidence');
  assert.equal(suggestion.serviceWritesPerformed, false);
  assert.equal(suggestion.summary.missingArtifacts, 1);
  assert.deepEqual(suggestion.rows, []);
  assert.equal(suggestion.csv, '');
  assert.equal(suggestion.markdown, '');
  assert.match(suggestion.recommendedAction, /worktable-export/);
});
