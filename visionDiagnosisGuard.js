const {
  buildVisionConsensusGate
} = require('./visionConsensusGate');
const {
  buildVisionDiagnosticReliabilityCard
} = require('./visionDiagnosticReliabilityCard');

const compact = value => String(value || '').replace(/\s+/g, ' ').trim();

const asArray = value => Array.isArray(value) ? value : [];

const isV2Observation = visionSummary =>
  compact(visionSummary?.contractVersion || visionSummary?.contract_version) === 'vision-observation/v2';

const normalizedLabel = value => compact(value)
  .toLocaleLowerCase()
  .replace(/[\s()[\]{}_\-.,:;/'"]/g, '');

const labelsAgree = (left, right) => {
  const normalizedLeft = normalizedLabel(left);
  const normalizedRight = normalizedLabel(right);
  return Boolean(
    normalizedLeft
    && normalizedRight
    && (
      normalizedLeft === normalizedRight
      || normalizedLeft.includes(normalizedRight)
      || normalizedRight.includes(normalizedLeft)
    )
  );
};

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

const classifierRequiresReview = visionSummary => {
  const classifier = visionSummary?.classifierSummary || visionSummary?.classifier_summary;
  if (!classifier || typeof classifier !== 'object') return false;
  return classifier.requiresHumanReview === true
    || classifier.requires_human_review === true
    || classifier.graphCandidateUseAllowed === false
    || classifier.graph_candidate_use_allowed === false
    || [
      'disagreed',
      'insufficient_reference',
      'unavailable'
    ].includes(compact(classifier.status));
};

const classifierReviewReason = visionSummary => compact(
  visionSummary?.classifierSummary?.decisionReason
  || visionSummary?.classifierSummary?.decision_reason
  || visionSummary?.classifier_summary?.decisionReason
  || visionSummary?.classifier_summary?.decision_reason
);

const genericDecisionReasons = new Set([
  'vision_safety_gate_requires_review',
  'vision_review_required'
]);

const nonActionableGraphText = /(찾지 못했습니다|추가 분석 중|추가 분석|미확인|보류|없습니다)/;

const hasActionableGraphText = value => {
  const text = compact(value);
  return Boolean(text) && !nonActionableGraphText.test(text);
};

const buildImplicitGraphValidation = (analysis, visionSummary) => {
  const retrievalSummary = analysis?.retrievalSummary;
  if (!retrievalSummary || retrievalSummary.graphGrounded !== true) return null;

  const evidenceCount = Number(retrievalSummary.evidenceCount) || 0;
  const citations = asArray(retrievalSummary.citations).map(compact).filter(Boolean);
  const graphTrace = asArray(retrievalSummary.graphTrace).map(compact).filter(Boolean);
  const visionCandidate = topCandidateName(visionSummary);
  const graphCandidate = compact(analysis?.defectType);
  const topCandidateSupported = labelsAgree(visionCandidate, graphCandidate)
    || graphTrace.some(trace => labelsAgree(trace, visionCandidate));
  const visionGraphConflict = Boolean(
    visionCandidate
    && graphCandidate
    && !labelsAgree(visionCandidate, graphCandidate)
  );
  const hasCauses = hasActionableGraphText(analysis?.possibleCauses);
  const hasCountermeasures = hasActionableGraphText(analysis?.countermeasures);
  const graphComplete = evidenceCount > 0 && hasCauses && hasCountermeasures;
  const autoFinalizeAllowed = graphComplete && topCandidateSupported && !visionGraphConflict;
  const decisionReason = visionGraphConflict
    ? 'local_graph_candidate_conflict'
    : !topCandidateSupported
      ? 'local_graph_top_candidate_not_supported'
      : !graphComplete
        ? 'local_graph_path_incomplete'
        : 'local_graph_candidate_supported';

  return {
    contractVersion: 'vision-graph-grounding/v1',
    candidateGrounding: [],
    graphGrounded: true,
    topCandidateSupported,
    visionGraphConflict,
    approvedPathCount: evidenceCount,
    citationCount: citations.length,
    groundedCauses: hasCauses ? [compact(analysis.possibleCauses)] : [],
    groundedCountermeasures: hasCountermeasures ? [compact(analysis.countermeasures)] : [],
    requiresHumanReview: !autoFinalizeAllowed,
    autoFinalizeAllowed,
    llmSupplementAllowed: false,
    llmSupplementTrainingEligible: false,
    decisionStatus: autoFinalizeAllowed ? 'grounded' : 'needs_review',
    decisionReason
  };
};

const gateReasons = visionSummary => {
  const classifierReason = classifierRequiresReview(visionSummary)
    ? classifierReviewReason(visionSummary)
    : '';
  const reasons = [
    classifierReason,
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
  const consensusGate = buildVisionConsensusGate(visionSummary, { graphValidation });
  const diagnosticReliabilityCard = buildVisionDiagnosticReliabilityCard(visionSummary, { graphValidation });
  const classifierBlocked = classifierRequiresReview(visionSummary);
  const blocked = isV2Observation(visionSummary) && consensusGate.status === 'blocked';
  const weak = isV2Observation(visionSummary) && !blocked && consensusGate.status !== 'accepted';
  const finalizationAllowed = !isV2Observation(visionSummary)
    ? true
    : consensusGate.finalizationAllowed && !classifierBlocked;

  const guardedDefectType = finalizationAllowed
    ? candidate
    : candidate
      ? `판정 보류 (${candidate} 후보 검토 필요)`
      : '판정 보류 (사람 검토 필요)';
  const reasons = gateReasons(visionSummary);
  const classifierReason = classifierBlocked ? classifierReviewReason(visionSummary) : '';
  const rawPrimaryVisionReason = compact(visionSummary?.decisionReason || visionSummary?.decision_reason);
  const primaryVisionReason = genericDecisionReasons.has(rawPrimaryVisionReason)
    ? ''
    : rawPrimaryVisionReason;
  const blockingPrimaryVisionReason = /^probable_/i.test(primaryVisionReason)
    ? ''
    : primaryVisionReason;
  const actionableVisionReasons = reasons.filter(reason =>
    !genericDecisionReasons.has(reason) && !/^probable_/i.test(reason)
  );
  const graphReviewReason = graphValidation?.requiresHumanReview === true
    ? compact(graphValidation.decisionReason || graphValidation.decision_status)
    : '';
  const consensusReason = compact(consensusGate.primaryReason);

  return {
    status: finalizationAllowed ? 'finalizable' : blocked ? 'blocked' : 'needs_review',
    finalizationAllowed,
    allowGraphRetrieval: consensusGate.allowGraphRetrieval,
    allowLlmSupplement: consensusGate.allowLlmSupplement,
    guardedDefectType,
    reviewReason: graphReviewReason
      || classifierReason
      || blockingPrimaryVisionReason
      || actionableVisionReasons.join(', ')
      || (finalizationAllowed ? primaryVisionReason : '')
      || consensusReason
      || (finalizationAllowed ? 'finalizable' : 'vision_review_required'),
    observationText: visibleObservationText(visionSummary),
    recommendedReviewAction: additionalViewAction(visionSummary),
    consensusGate,
    diagnosticReliabilityCard
  };
};

const guardDefectAnalysisForVisionRisk = (
  analysis,
  visionSummary,
  { graphValidation = null } = {}
) => {
  const effectiveGraphValidation = graphValidation || buildImplicitGraphValidation(analysis, visionSummary);
  const guard = buildVisionDiagnosisGuard(visionSummary, { graphValidation: effectiveGraphValidation });
  const enrichedVisionSummary = {
    ...(analysis.visionSummary || visionSummary),
    consensusGate: guard.consensusGate,
    diagnosticReliabilityCard: guard.diagnosticReliabilityCard
  };
  const enrichedRetrievalSummary = analysis.retrievalSummary
    ? {
        ...analysis.retrievalSummary,
        graphValidation: analysis.retrievalSummary.graphValidation || effectiveGraphValidation || undefined
      }
    : analysis.retrievalSummary;

  if (guard.finalizationAllowed) {
    return {
      ...analysis,
      visionSummary: enrichedVisionSummary,
      retrievalSummary: enrichedRetrievalSummary
    };
  }

  return {
    ...analysis,
    defectType: guard.guardedDefectType,
    severity: '-',
    description: guard.observationText || analysis.description || '사진에서 신뢰할 수 있는 결함 특징을 확정하지 못했습니다.',
    possibleCauses: '',
    countermeasures: '',
    retrievalSummary: analysis.retrievalSummary
      ? {
          ...enrichedRetrievalSummary
        }
      : analysis.retrievalSummary,
    visionSummary: enrichedVisionSummary
      ? {
          ...enrichedVisionSummary,
          decisionStatus: 'needs_review',
          decisionReason: guard.reviewReason
        }
      : enrichedVisionSummary,
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
