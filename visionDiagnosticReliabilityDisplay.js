const compact = value => String(value || '').replace(/\s+/g, ' ').trim();

const asArray = value => Array.isArray(value) ? value : [];

const CONTRACT_VERSION = 'vision-diagnostic-reliability-card/v1';

const STATUS_LABELS = {
  auto_report_ready: '자동 보고 가능',
  graph_cross_check_required: 'Graph 교차검증 필요',
  hitl_required: 'HITL 검토 필요',
  blocked: '진단 차단'
};

const RISK_LABELS = {
  low: '오염 위험 낮음',
  medium: '오염 위험 중간',
  high: '오염 위험 높음',
  blocked: '후속 오염 차단'
};

const STATUS_SUMMARIES = {
  auto_report_ready: 'Vision, Graph, 분류기 근거가 일치해 Graph 기반 보고서 작성이 가능합니다.',
  graph_cross_check_required: 'Top-1 Vision 후보만으로는 원인/대책을 확정하지 않고 Graph 교차검증을 먼저 수행합니다.',
  hitl_required: 'Vision, Graph, 또는 분류기 근거가 충돌해 사람 검토 전까지 최종 보고를 보류합니다.',
  blocked: '이미지 품질 또는 대상 유형 문제로 Graph 검색과 보고서 생성을 차단했습니다.'
};

const TONE_BY_STATUS = {
  auto_report_ready: 'emerald',
  graph_cross_check_required: 'amber',
  hitl_required: 'red',
  blocked: 'red'
};

const RISK_REASON_LABELS = {
  graph_grounding_required: 'Graph 근거 미확보',
  insufficient_independent_visual_evidence: '독립 시각 근거 부족',
  single_visual_evidence_category: '시각 근거 범주 편중',
  top_candidate_margin_too_small: 'Top 후보 간 신뢰도 차이 부족',
  top_candidate_confidence_below_safety_floor: 'Top 후보 신뢰도 부족',
  low_region_bbox_confidence: 'bbox 위치 신뢰도 부족',
  overbroad_region_bbox: 'bbox 범위 과대',
  top_candidate_has_contradicting_evidence: 'Top 후보 반대 근거 존재',
  vision_graph_conflict: 'Vision-Graph 후보 충돌',
  vision_classifier_disagreement: '분류기와 Vision 후보 불일치',
  graph_cross_check_only_until_vision_review: 'Vision 검토 전 Graph 교차검증 전용',
  image_quality_rejected: '이미지 품질 불량',
  non_physical_image: '물리 제품 이미지 아님',
  no_visible_defect: '표시 결함 확인 불가',
  provider_contract_invalid: 'Vision 응답 계약 오류',
  candidate_without_observation_evidence: '후보와 관찰 근거 미연결',
  missing_visual_observations: '시각 관찰 근거 누락'
};

const NEXT_ACTION_LABELS = {
  use_graph_grounded_report: 'Graph 근거 기반 보고서 작성',
  allow_llm_supplement_for_missing_wording_only: '부족한 문장 정리만 LLM 보조 허용',
  keep_human_feedback_available: 'HITL 피드백 버튼 유지',
  run_graph_cross_check_for_top3_candidates: 'Top-3 후보 전체를 Graph로 교차검증',
  do_not_write_final_causes_until_graph_accepts_candidate: 'Graph가 후보를 수락하기 전 원인/대책 확정 금지',
  collect_more_independent_visual_evidence: '독립 시각 근거 추가 확보',
  continue_graph_grounding_before_report_generation: '보고서 생성 전 Graph grounding 계속 수행',
  send_vision_graph_conflict_to_hitl: 'Vision-Graph 충돌을 HITL로 전달',
  do_not_train_or_promote_candidate: '후보 학습/Graph 승격 금지',
  collect_additional_views_before_reference_learning: 'Reference 학습 전 추가 시점 확보',
  recapture_physical_product_image: '물리 제품 이미지를 재촬영',
  do_not_query_graph_with_blocked_candidate: '차단된 후보로 Graph 검색 금지',
  submit_to_hitl_if_business_critical: '업무상 필요 시 HITL에 검토 요청'
};

const percent = value => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '0%';
  return `${Math.round(numeric * 100)}%`;
};

const scoreLabel = value => {
  const numeric = Number(value);
  return `${Number.isFinite(numeric) ? Math.round(numeric) : 0}점`;
};

const candidateLines = card => {
  const candidates = asArray(card?.candidateSummary?.topK);
  if (candidates.length === 0) return ['사용 가능한 Vision 후보 없음'];

  return candidates.map(candidate => [
    `${candidate.rank}. ${compact(candidate.defectType) || '판정 보류'} ${percent(candidate.confidence)}`,
    `관찰 ${Number(candidate.supportingObservationCount) || 0}`,
    `반대 ${Number(candidate.contradictingObservationCount) || 0}`
  ].join(' · '));
};

const labelsFor = (values, dictionary) =>
  asArray(values).map(value => dictionary[compact(value)] || compact(value)).filter(Boolean);

const isCompatibleCard = card =>
  card
  && typeof card === 'object'
  && compact(card.contractVersion) === CONTRACT_VERSION
  && compact(card.status);

const buildVisionDiagnosticReliabilityDisplayModel = card => {
  if (!isCompatibleCard(card)) return null;

  const status = compact(card.status);
  const contaminationRisk = compact(card.contaminationRisk);
  const permissions = [
    { label: 'Graph 검색', allowed: card.graphRetrievalAllowed === true },
    { label: '원인/대책 작성', allowed: card.causeCountermeasureAllowed === true },
    { label: 'LLM 보조 문장화', allowed: card.llmSupplementAllowed === true },
    { label: 'HITL 필요', allowed: card.humanReviewRequired === true }
  ];

  return {
    status,
    statusLabel: STATUS_LABELS[status] || status,
    riskLabel: RISK_LABELS[contaminationRisk] || contaminationRisk || '오염 위험 미분류',
    tone: TONE_BY_STATUS[status] || 'gray',
    confidenceLabel: scoreLabel(card.confidenceScore),
    summary: STATUS_SUMMARIES[status] || 'Vision 진단 신뢰도 상태를 확인하세요.',
    permissions,
    candidateLines: candidateLines(card),
    riskReasonLabels: labelsFor(card.riskReasons, RISK_REASON_LABELS),
    nextActionLabels: labelsFor(card.nextActions, NEXT_ACTION_LABELS),
    evidenceBadges: [
      `Vision ${compact(card.evidence?.visionSafetyStatus) || 'unknown'}`,
      card.evidence?.graphGrounded ? 'Graph grounded' : 'Graph pending',
      card.evidence?.graphTopCandidateSupported ? 'Top candidate supported' : 'Top candidate unverified',
      card.evidence?.visionGraphConflict ? 'Vision-Graph conflict' : '',
      compact(card.evidence?.classifierStatus)
        ? `Classifier ${compact(card.evidence.classifierStatus)}`
        : ''
    ].filter(Boolean),
    policyBadges: [
      card.policy?.top1VisionCandidateTrustedAlone === false ? 'Top-1 단독 신뢰 금지' : '',
      card.policy?.graphGroundingRequiredForFinalReport ? '최종 보고 Graph 근거 필수' : '',
      card.serviceWritesAllowed === false ? '서비스 자동 쓰기 없음' : ''
    ].filter(Boolean)
  };
};

const OPEN_REVIEW_ACTIONS = new Set([
  'save_correction',
  'request_recapture',
  'reject_candidate',
  'submit_hitl'
]);

const readyGate = (action, message) => ({
  action,
  allowed: true,
  message
});

const blockedGate = (action, card, purpose) => ({
  action,
  allowed: false,
  message: `${STATUS_LABELS[compact(card?.status)] || 'Vision 신뢰도 검토 필요'} 상태입니다. ${purpose} 전에 신뢰도 카드의 다음 액션을 먼저 처리하세요.`
});

const buildVisionDiagnosticReliabilityActionGate = (card, action) => {
  if (!isCompatibleCard(card)) {
    return readyGate(action, 'Reliability card unavailable; using legacy action policy.');
  }

  if (OPEN_REVIEW_ACTIONS.has(action)) {
    return readyGate(action, 'HITL/교정/재촬영 액션은 신뢰도 보류 상태에서도 허용됩니다.');
  }

  if (action === 'copy_final_report') {
    if (card.status === 'auto_report_ready' && card.automaticReportAllowed === true && card.causeCountermeasureAllowed === true) {
      return readyGate(action, 'Graph 근거가 승인되어 최종 보고서 복사가 가능합니다.');
    }
    return blockedGate(action, card, '최종 보고서 복사');
  }

  if (action === 'approve_graph_promotion') {
    if (card.status === 'auto_report_ready' && card.automaticReportAllowed === true && card.causeCountermeasureAllowed === true) {
      return readyGate(action, 'Vision/Graph 신뢰도 조건을 만족해 승인 저장이 가능합니다.');
    }
    return blockedGate(action, card, 'Graph 승격 승인');
  }

  return readyGate(action, 'No reliability restriction for this action.');
};

module.exports = {
  buildVisionDiagnosticReliabilityActionGate,
  buildVisionDiagnosticReliabilityDisplayModel
};
