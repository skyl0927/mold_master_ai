const compact = value => String(value || '').replace(/\s+/g, ' ').trim();

const asArray = value => Array.isArray(value) ? value : [];

const isV2Observation = visionSummary =>
  compact(visionSummary?.contractVersion || visionSummary?.contract_version) === 'vision-observation/v2';

const topCandidateName = visionSummary => compact(
  visionSummary?.primaryCandidate?.defectType
  || visionSummary?.primary_candidate?.defect_type
  || asArray(visionSummary?.candidates)[0]?.defectType
  || asArray(visionSummary?.candidates)[0]?.defect_type
);

const visibleObservationText = visionSummary => {
  const features = asArray(visionSummary?.visibleFeatures || visionSummary?.visible_features);
  if (features.length > 0) return features.map(compact).filter(Boolean).slice(0, 3).join('; ');
  const observations = asArray(visionSummary?.visualObservations || visionSummary?.observations);
  return observations
    .map(item => compact(item?.description || item?.text || item?.value))
    .filter(Boolean)
    .slice(0, 3)
    .join('; ');
};

const graphAllowsFinalization = graphValidation => Boolean(
  graphValidation
  && graphValidation.graphGrounded !== false
  && graphValidation.autoFinalizeAllowed === true
  && graphValidation.requiresHumanReview !== true
  && graphValidation.topCandidateSupported !== false
);

const gateReasons = visionSummary => {
  const reasons = [
    compact(visionSummary?.decisionReason || visionSummary?.decision_reason),
    ...asArray(visionSummary?.validationIssues || visionSummary?.validation_issues).map(compact),
    ...asArray(visionSummary?.safetyGate?.reasons).map(compact),
    ...asArray(visionSummary?.qualityConcerns || visionSummary?.quality_concerns).map(compact)
  ].filter(Boolean);
  return Array.from(new Set(reasons));
};

const additionalViewAction = visionSummary => {
  const views = asArray(visionSummary?.requiredAdditionalViews || visionSummary?.required_additional_views)
    .map(compact)
    .filter(Boolean);
  if (views.length === 0) {
    return '추가 촬영 또는 사람 검토 후 결함명과 원인/대책을 확정하세요.';
  }
  return `추가 촬영 필요: ${views.slice(0, 3).join(', ')}`;
};

const buildVisionDiagnosisGuard = (visionSummary, { graphValidation = null } = {}) => {
  const candidate = topCandidateName(visionSummary);
  const safetyGate = visionSummary?.safetyGate || {};
  const decisionStatus = compact(visionSummary?.decisionStatus || visionSummary?.decision_status);
  const safetyStatus = compact(safetyGate.status);
  const candidateUsePolicy = compact(safetyGate.candidateUsePolicy || safetyGate.candidate_use_policy);
  const finalByGraph = graphAllowsFinalization(graphValidation);

  const blocked = isV2Observation(visionSummary) && (
    decisionStatus === 'unclassifiable'
    || safetyStatus === 'blocked'
    || candidateUsePolicy === 'do_not_use_vision_candidate'
  );
  const weak = isV2Observation(visionSummary) && !blocked && (
    decisionStatus !== 'probable'
    || safetyStatus === 'needs_review'
    || safetyGate.autoGraphCandidateUseAllowed === false
    || candidateUsePolicy === 'graph_cross_check_only'
  );
  const finalizationAllowed = !isV2Observation(visionSummary)
    ? true
    : finalByGraph || (!blocked && !weak);

  const guardedDefectType = finalizationAllowed
    ? candidate
    : candidate
      ? `판정 보류 (${candidate} 후보 검토 필요)`
      : '판정 보류 (사람 검토 필요)';
  const reasons = gateReasons(visionSummary);
  const graphReviewReason = graphValidation?.requiresHumanReview === true
    ? compact(graphValidation.decisionReason || graphValidation.decision_status)
    : '';

  return {
    status: finalizationAllowed ? 'finalizable' : blocked ? 'blocked' : 'needs_review',
    finalizationAllowed,
    allowGraphRetrieval: !blocked,
    allowLlmSupplement: finalizationAllowed,
    guardedDefectType,
    reviewReason: graphReviewReason || reasons.join(', ') || (finalizationAllowed ? 'finalizable' : 'vision_review_required'),
    observationText: visibleObservationText(visionSummary),
    recommendedReviewAction: additionalViewAction(visionSummary)
  };
};

const guardDefectAnalysisForVisionRisk = (
  analysis,
  visionSummary,
  { graphValidation = null } = {}
) => {
  const guard = buildVisionDiagnosisGuard(visionSummary, { graphValidation });
  if (guard.finalizationAllowed) return analysis;

  return {
    ...analysis,
    defectType: guard.guardedDefectType,
    severity: '-',
    description: guard.observationText || analysis.description || '사진에서 신뢰할 수 있는 결함 특징을 확정하지 못했습니다.',
    possibleCauses: '',
    countermeasures: '',
    retrievalSummary: analysis.retrievalSummary
      ? {
          ...analysis.retrievalSummary
        }
      : analysis.retrievalSummary,
    visionSummary: analysis.visionSummary
      ? {
          ...analysis.visionSummary,
          decisionStatus: 'needs_review',
          decisionReason: guard.reviewReason
        }
      : analysis.visionSummary,
    rawOutput: analysis.rawOutput
  };
};

const buildVisionGuardAbstentionAnalysis = (
  visionSummary,
  {
    modeUsed = 'direct',
    rawOutput = ''
  } = {}
) => {
  const guard = buildVisionDiagnosisGuard(visionSummary);
  return guardDefectAnalysisForVisionRisk({
    defectType: guard.guardedDefectType,
    severity: '-',
    description: guard.observationText || '사진에서 신뢰할 수 있는 결함 특징을 확정하지 못했습니다.',
    possibleCauses: '',
    countermeasures: '',
    rawOutput,
    visionSummary,
    retrievalSummary: {
      modeUsed,
      citations: [],
      evidenceCount: 0,
      graphTrace: [],
      graphGrounded: false,
      llmSupplemented: false
    }
  }, visionSummary);
};

module.exports = {
  buildVisionDiagnosisGuard,
  buildVisionGuardAbstentionAnalysis,
  guardDefectAnalysisForVisionRisk
};
