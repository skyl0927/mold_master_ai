const asArray = value => Array.isArray(value) ? value : [];

const compact = value => String(value || '').replace(/\s+/g, ' ').trim();

const unique = values => [...new Set(values.map(compact).filter(Boolean))];

const confidenceValue = value => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const labelKey = value => compact(value).toLowerCase();

const sourceVisionAgree = decision =>
  Boolean(labelKey(decision?.evidence?.sourceLabel))
  && labelKey(decision?.evidence?.sourceLabel) === labelKey(decision?.evidence?.visionSuggestedLabel);

const riskFlagsFor = decision => {
  const confidence = confidenceValue(decision?.evidence?.visionConfidence);
  const flags = [];
  if (sourceVisionAgree(decision)) flags.push('source_vision_agreement');
  if (confidence > 0 && confidence < 0.8) flags.push('confidence_review_required');
  if (!sourceVisionAgree(decision)) flags.push('source_vision_label_mismatch');
  flags.push('human_confirmation_required');
  return flags;
};

const evidenceCardFor = decision => {
  const confidence = confidenceValue(decision?.evidence?.visionConfidence);
  return {
    sourceKind: compact(decision?.source?.sourceKind),
    relativePath: compact(decision?.source?.relativePath),
    contentSha256: compact(decision?.contentSha256).toLowerCase(),
    sourceLabel: compact(decision?.evidence?.sourceLabel),
    visionSuggestedLabel: compact(decision?.evidence?.visionSuggestedLabel),
    visionConfidence: confidence,
    visionConfidencePercent: Math.round(confidence * 100),
    visionSummary: compact(decision?.evidence?.visionSummary),
    reviewReasons: unique(decision?.evidence?.reviewReasons || [])
  };
};

const checklistFor = ({ riskFlags, confidencePercent }) => [
  '원본 이미지를 열어 결함 위치와 외관 특징이 template의 Vision summary와 일치하는지 확인하세요.',
  '도면/문서/예시 이미지가 아니라 실제 제조 이미지인지 확인하고 manufacturingImageConfirmed를 true로 바꿀지 결정하세요.',
  'source label과 Vision label이 같아도 사람 확인 전에는 Graph 승격과 Reference 학습을 허용하지 마세요.',
  riskFlags.includes('confidence_review_required')
    ? `Vision confidence가 ${confidencePercent}%입니다. 경계 사례일 수 있으므로 확대 이미지, ROI, 조명을 다시 확인하세요.`
    : '',
  riskFlags.includes('source_vision_label_mismatch')
    ? 'source label과 Vision label이 다릅니다. approve_candidate 대신 mark_needs_review 또는 request_recapture를 우선 검토하세요.'
    : '',
  '승인 근거가 충분하면 approve_candidate, 불충분하면 mark_needs_review/reject_candidate/request_recapture 중 하나를 선택하세요.'
].filter(Boolean);

const reviewPathFor = ({ riskFlags, confidencePercent }) => {
  if (riskFlags.includes('source_vision_label_mismatch')) {
    return 'source와 Vision 라벨이 다르므로 자동 승인하지 마세요. 원본 이미지와 taxonomy 기준으로 지배 결함을 재확인하세요.';
  }
  if (riskFlags.includes('confidence_review_required')) {
    return `Vision confidence가 ${confidencePercent}%입니다. 고신뢰 queue에 포함되었더라도 자동 승인하지 마세요. 원본 이미지, ROI, 촬영 품질을 사람이 재확인하세요.`;
  }
  return `Source와 Vision이 합의하고 confidence가 ${confidencePercent}%입니다. 그래도 자동 승인하지 말고, 원본 제조 이미지와 라벨을 사람이 확인한 뒤 결정하세요.`;
};

const guideItemFor = decision => {
  const riskFlags = riskFlagsFor(decision);
  const evidenceCard = evidenceCardFor(decision);
  return {
    queueId: compact(decision?.queueId),
    defectType: compact(decision?.defectType),
    defectClass: compact(decision?.defectClass),
    allowedActions: unique(decision?.allowedActions || []),
    riskFlags,
    evidenceCard,
    decisionChecklistKo: checklistFor({
      riskFlags,
      confidencePercent: evidenceCard.visionConfidencePercent
    }),
    suggestedReviewPathKo: reviewPathFor({
      riskFlags,
      confidencePercent: evidenceCard.visionConfidencePercent
    }),
    prefillDecisionDraft: {
      queueId: compact(decision?.queueId),
      action: 'pending',
      approvedDefectType: compact(decision?.approvedDefectType || decision?.defectType),
      manufacturingImageConfirmed: false,
      labelConfirmed: false,
      requestedViews: [],
      reviewComment: ''
    }
  };
};

const averageConfidenceFor = items => {
  if (items.length === 0) return 0;
  const total = items.reduce((sum, item) => sum + confidenceValue(item.evidenceCard?.visionConfidence), 0);
  return Number((total / items.length).toFixed(3));
};

const buildVisionPendingHitlReviewGuide = ({
  generatedAt = new Date().toISOString(),
  decisionTemplate = null,
  sourceArtifacts = {}
} = {}) => {
  const hasTemplate = decisionTemplate
    && decisionTemplate.contractVersion === 'common-agent-hitl-review-decisions/v1'
    && Array.isArray(decisionTemplate.decisions);
  const decisions = hasTemplate ? asArray(decisionTemplate.decisions) : [];
  const items = decisions.map(guideItemFor);
  const status = !hasTemplate
    ? 'missing_decision_template'
    : items.length > 0 ? 'action_required' : 'clear';

  return {
    schemaVersion: 1,
    contractVersion: 'vision-pending-hitl-review-guide/v1',
    generatedAt,
    sourceSystem: 'mold-master-ai',
    targetSystem: 'quality_hitl',
    status,
    serviceWritesPerformed: false,
    localArtifactsWritten: true,
    policy: {
      requiresHumanReview: true,
      autoApplyAllowed: false,
      allowGraphPromotion: false,
      allowReferenceLearning: false,
      allowModelTraining: false
    },
    summary: {
      queueItems: items.length,
      sourceVisionAgreements: items.filter(item => item.riskFlags.includes('source_vision_agreement')).length,
      confidenceReviewRequired: items.filter(item => item.riskFlags.includes('confidence_review_required')).length,
      labelMismatches: items.filter(item => item.riskFlags.includes('source_vision_label_mismatch')).length,
      averageVisionConfidence: averageConfidenceFor(items)
    },
    items,
    sources: {
      decisionTemplate: sourceArtifacts.decisionTemplate || null
    },
    recommendedAction: status === 'missing_decision_template'
      ? '먼저 npm run vision:hitl:decision-template 명령으로 pending HITL decision-template artifact를 생성하세요.'
      : status === 'clear'
        ? '검토 대상 없음. 다른 readiness blocker를 확인하세요.'
        : 'review guide의 confidence, source/Vision agreement, 원본 확인 체크리스트를 검토한 뒤 decision-template을 사람이 채우세요.'
  };
};

module.exports = {
  buildVisionPendingHitlReviewGuide
};
