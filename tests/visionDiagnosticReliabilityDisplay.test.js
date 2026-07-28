const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildVisionDiagnosticReliabilityDisplayModel
} = require('../visionDiagnosticReliabilityDisplay');

const baseCard = () => ({
  contractVersion: 'vision-diagnostic-reliability-card/v1',
  status: 'auto_report_ready',
  contaminationRisk: 'low',
  confidenceScore: 94,
  automaticReportAllowed: true,
  graphRetrievalAllowed: true,
  causeCountermeasureAllowed: true,
  llmSupplementAllowed: true,
  humanReviewRequired: false,
  serviceWritesAllowed: false,
  policy: {
    failClosed: true,
    top1VisionCandidateTrustedAlone: false,
    graphGroundingRequiredForFinalReport: true,
    llmSupplementRequiresGraphAcceptance: true,
    modelTrainingAllowed: false,
    graphPromotionAllowed: false
  },
  candidateSummary: {
    topCandidate: 'whitening',
    topCandidateConfidence: 0.88,
    topCandidateMargin: 0.7,
    topK: [
      { rank: 1, defectType: 'whitening', confidence: 0.88, supportingObservationCount: 2, contradictingObservationCount: 0 },
      { rank: 2, defectType: 'sink mark', confidence: 0.18, supportingObservationCount: 1, contradictingObservationCount: 1 }
    ]
  },
  riskReasons: [],
  nextActions: ['use_graph_grounded_report', 'allow_llm_supplement_for_missing_wording_only'],
  evidence: {
    visionSafetyStatus: 'reliable',
    graphGrounded: true,
    graphTopCandidateSupported: true,
    graphAutoFinalizeAllowed: true,
    visionGraphConflict: false,
    classifierStatus: ''
  }
});

test('formats an accepted card as safe Graph-grounded report guidance', () => {
  const model = buildVisionDiagnosticReliabilityDisplayModel(baseCard());

  assert.equal(model.statusLabel, '자동 보고 가능');
  assert.equal(model.riskLabel, '오염 위험 낮음');
  assert.equal(model.tone, 'emerald');
  assert.equal(model.confidenceLabel, '94점');
  assert.equal(model.summary, 'Vision, Graph, 분류기 근거가 일치해 Graph 기반 보고서 작성이 가능합니다.');
  assert.deepEqual(model.permissions, [
    { label: 'Graph 검색', allowed: true },
    { label: '원인/대책 작성', allowed: true },
    { label: 'LLM 보조 문장화', allowed: true },
    { label: 'HITL 필요', allowed: false }
  ]);
  assert.deepEqual(model.nextActionLabels, [
    'Graph 근거 기반 보고서 작성',
    '부족한 문장 정리만 LLM 보조 허용'
  ]);
  assert.deepEqual(model.candidateLines, [
    '1. whitening 88% · 관찰 2 · 반대 0',
    '2. sink mark 18% · 관찰 1 · 반대 1'
  ]);
});

test('formats missing Graph grounding as cross-check required and blocks final causes', () => {
  const card = {
    ...baseCard(),
    status: 'graph_cross_check_required',
    contaminationRisk: 'medium',
    confidenceScore: 72,
    automaticReportAllowed: false,
    causeCountermeasureAllowed: false,
    llmSupplementAllowed: false,
    humanReviewRequired: true,
    riskReasons: ['graph_grounding_required', 'insufficient_independent_visual_evidence'],
    nextActions: [
      'run_graph_cross_check_for_top3_candidates',
      'do_not_write_final_causes_until_graph_accepts_candidate'
    ],
    evidence: {
      ...baseCard().evidence,
      graphGrounded: false,
      graphTopCandidateSupported: false,
      graphAutoFinalizeAllowed: false
    }
  };

  const model = buildVisionDiagnosticReliabilityDisplayModel(card);

  assert.equal(model.statusLabel, 'Graph 교차검증 필요');
  assert.equal(model.riskLabel, '오염 위험 중간');
  assert.equal(model.tone, 'amber');
  assert.match(model.summary, /Top-1 Vision 후보만으로는/);
  assert.deepEqual(model.riskReasonLabels, [
    'Graph 근거 미확보',
    '독립 시각 근거 부족'
  ]);
  assert.equal(model.permissions.find(item => item.label === '원인/대책 작성').allowed, false);
  assert.ok(model.nextActionLabels.includes('Top-3 후보 전체를 Graph로 교차검증'));
});

test('formats blocked cards as recapture-first and hides candidate trust', () => {
  const card = {
    ...baseCard(),
    status: 'blocked',
    contaminationRisk: 'blocked',
    confidenceScore: 0,
    automaticReportAllowed: false,
    graphRetrievalAllowed: false,
    causeCountermeasureAllowed: false,
    llmSupplementAllowed: false,
    humanReviewRequired: true,
    riskReasons: ['image_quality_rejected'],
    nextActions: ['recapture_physical_product_image', 'do_not_query_graph_with_blocked_candidate'],
    candidateSummary: {
      topCandidate: '',
      topCandidateConfidence: 0,
      topCandidateMargin: null,
      topK: []
    }
  };

  const model = buildVisionDiagnosticReliabilityDisplayModel(card);

  assert.equal(model.statusLabel, '진단 차단');
  assert.equal(model.riskLabel, '후속 오염 차단');
  assert.equal(model.tone, 'red');
  assert.equal(model.summary, '이미지 품질 또는 대상 유형 문제로 Graph 검색과 보고서 생성을 차단했습니다.');
  assert.deepEqual(model.candidateLines, ['사용 가능한 Vision 후보 없음']);
  assert.deepEqual(model.nextActionLabels, [
    '물리 제품 이미지를 재촬영',
    '차단된 후보로 Graph 검색 금지'
  ]);
});

test('returns null for missing or incompatible cards', () => {
  assert.equal(buildVisionDiagnosticReliabilityDisplayModel(null), null);
  assert.equal(buildVisionDiagnosticReliabilityDisplayModel({ status: 'auto_report_ready' }), null);
});
