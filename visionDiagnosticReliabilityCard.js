const {
  buildVisionConsensusGate
} = require('./visionConsensusGate');

const compact = value => String(value || '').replace(/\s+/g, ' ').trim();

const asArray = value => Array.isArray(value) ? value : [];

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const confidenceValue = value => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return clamp(numeric > 1 && numeric <= 100 ? numeric / 100 : numeric, 0, 1);
};

const rounded = (value, digits = 3) => {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
};

const safetyGateOf = visionSummary => visionSummary?.safetyGate || visionSummary?.safety_gate || {};

const classifierSummaryOf = visionSummary =>
  visionSummary?.classifierSummary || visionSummary?.classifier_summary || null;

const classifierBlocksFinalization = classifier => Boolean(
  classifier
  && (
    classifier.requiresHumanReview === true
    || classifier.requires_human_review === true
    || classifier.graphCandidateUseAllowed === false
    || classifier.graph_candidate_use_allowed === false
    || ['disagreed', 'insufficient_reference', 'unavailable'].includes(compact(classifier.status))
  )
);

const classifierReason = classifier => compact(
  classifier?.decisionReason
  || classifier?.decision_reason
  || (classifierBlocksFinalization(classifier) ? 'vision_classifier_review_required' : '')
);

const candidateName = candidate => compact(
  candidate?.defectType
  || candidate?.defect_type
  || candidate?.label
  || candidate?.name
);

const candidateSupportIds = candidate => asArray(
  candidate?.supportingObservationIds || candidate?.supporting_observation_ids
).map(compact).filter(Boolean);

const candidateContradictionIds = candidate => asArray(
  candidate?.contradictingObservationIds || candidate?.contradicting_observation_ids
).map(compact).filter(Boolean);

const candidatesOf = visionSummary => {
  const candidates = asArray(visionSummary?.candidates)
    .map(candidate => ({
      defectType: candidateName(candidate),
      confidence: confidenceValue(candidate?.confidence ?? candidate?.score ?? candidate?.probability),
      supportingObservationCount: candidateSupportIds(candidate).length,
      contradictingObservationCount: candidateContradictionIds(candidate).length
    }))
    .filter(candidate => candidate.defectType)
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, 3);

  const primaryName = candidateName(visionSummary?.primaryCandidate || visionSummary?.primary_candidate);
  if (!primaryName) return candidates;

  const primary = {
    defectType: primaryName,
    confidence: confidenceValue(
      visionSummary?.primaryCandidate?.confidence
      ?? visionSummary?.primary_candidate?.confidence
    ),
    supportingObservationCount: candidateSupportIds(
      visionSummary?.primaryCandidate || visionSummary?.primary_candidate
    ).length,
    contradictingObservationCount: candidateContradictionIds(
      visionSummary?.primaryCandidate || visionSummary?.primary_candidate
    ).length
  };

  const withoutDuplicate = candidates.filter(candidate => candidate.defectType !== primary.defectType);
  return [primary, ...withoutDuplicate].slice(0, 3);
};

const graphFlagsOf = graphValidation => ({
  graphGrounded: Boolean(
    graphValidation
    && graphValidation.graphGrounded !== false
    && graphValidation.graph_grounded !== false
  ),
  topCandidateSupported: Boolean(
    graphValidation
    && graphValidation.topCandidateSupported !== false
    && graphValidation.top_candidate_supported !== false
  ),
  autoFinalizeAllowed: Boolean(
    graphValidation
    && graphValidation.autoFinalizeAllowed === true
    && graphValidation.auto_finalize_allowed !== false
  ),
  requiresHumanReview: Boolean(
    graphValidation
    && (graphValidation.requiresHumanReview === true || graphValidation.requires_human_review === true)
  ),
  visionGraphConflict: Boolean(
    graphValidation
    && (graphValidation.visionGraphConflict === true || graphValidation.vision_graph_conflict === true)
  ),
  decisionReason: compact(
    graphValidation?.decisionReason
    || graphValidation?.decision_reason
    || graphValidation?.decisionStatus
    || graphValidation?.decision_status
  )
});

const unique = values => Array.from(new Set(values.map(compact).filter(Boolean)));

const riskReasonsFor = ({
  consensusGate,
  visionSummary,
  graphValidation,
  classifier,
  safetyGate
}) => {
  const graphFlags = graphFlagsOf(graphValidation);
  return unique([
    ...asArray(consensusGate.reasons),
    ...asArray(safetyGate.reasons),
    compact(visionSummary?.decisionReason || visionSummary?.decision_reason),
    !graphValidation || !graphFlags.graphGrounded ? 'graph_grounding_required' : '',
    graphFlags.visionGraphConflict ? 'vision_graph_conflict' : '',
    graphValidation && graphFlags.requiresHumanReview ? graphFlags.decisionReason : '',
    classifierBlocksFinalization(classifier) ? classifierReason(classifier) : ''
  ]);
};

const statusFor = ({ consensusGate, graphFlags, classifierBlocked }) => {
  if (consensusGate.status === 'blocked' || consensusGate.allowGraphRetrieval === false) {
    return 'blocked';
  }
  if (consensusGate.finalizationAllowed) {
    return 'auto_report_ready';
  }
  if (graphFlags.visionGraphConflict || classifierBlocked) {
    return 'hitl_required';
  }
  if (consensusGate.allowGraphRetrieval) {
    return 'graph_cross_check_required';
  }
  return 'hitl_required';
};

const contaminationRiskFor = ({ status, safetyGate, graphFlags, classifierBlocked }) => {
  if (status === 'blocked') return 'blocked';
  if (status === 'auto_report_ready') return 'low';
  if (graphFlags.visionGraphConflict || classifierBlocked) return 'high';
  if (compact(safetyGate.status) === 'needs_review') return 'high';
  return 'medium';
};

const confidenceScoreFor = ({ status, candidates, safetyGate, graphFlags, classifierBlocked }) => {
  if (status === 'blocked') return 0;

  const topConfidence = candidates[0]?.confidence || 0;
  const secondConfidence = candidates[1]?.confidence || 0;
  const margin = Math.max(0, topConfidence - secondConfidence);
  const safetyScore = Number.isFinite(Number(safetyGate.score)) ? Number(safetyGate.score) : 50;

  let score =
    safetyScore * 0.45
    + topConfidence * 25
    + Math.min(margin, 1) * 15;

  if (graphFlags.graphGrounded) score += 8;
  if (graphFlags.topCandidateSupported) score += 8;
  if (graphFlags.autoFinalizeAllowed) score += 8;
  if (graphFlags.requiresHumanReview) score -= 14;
  if (graphFlags.visionGraphConflict) score -= 35;
  if (classifierBlocked) score -= 25;
  if (status === 'auto_report_ready') score += 6;
  if (status === 'graph_cross_check_required') score -= 4;
  if (status === 'hitl_required') score -= 12;

  return clamp(Math.round(score), 0, 100);
};

const nextActionsFor = ({ status, contaminationRisk }) => {
  if (status === 'auto_report_ready') {
    return [
      'use_graph_grounded_report',
      'allow_llm_supplement_for_missing_wording_only',
      'keep_human_feedback_available'
    ];
  }
  if (status === 'blocked') {
    return [
      'recapture_physical_product_image',
      'do_not_query_graph_with_blocked_candidate',
      'submit_to_hitl_if_business_critical'
    ];
  }
  if (status === 'hitl_required') {
    return [
      'send_vision_graph_conflict_to_hitl',
      'do_not_train_or_promote_candidate',
      'collect_additional_views_before_reference_learning'
    ];
  }
  return [
    'run_graph_cross_check_for_top3_candidates',
    'do_not_write_final_causes_until_graph_accepts_candidate',
    contaminationRisk === 'high'
      ? 'collect_more_independent_visual_evidence'
      : 'continue_graph_grounding_before_report_generation'
  ];
};

const buildCandidateSummary = candidates => {
  const top = candidates[0] || null;
  const second = candidates[1] || null;
  return {
    topCandidate: top?.defectType || '',
    topCandidateConfidence: rounded(top?.confidence || 0),
    topCandidateMargin: second ? rounded((top?.confidence || 0) - second.confidence) : null,
    topK: candidates.map((candidate, index) => ({
      rank: index + 1,
      ...candidate,
      confidence: rounded(candidate.confidence)
    }))
  };
};

const buildVisionDiagnosticReliabilityCard = (
  visionSummary,
  {
    graphValidation = null
  } = {}
) => {
  const consensusGate = buildVisionConsensusGate(visionSummary, { graphValidation });
  const safetyGate = safetyGateOf(visionSummary);
  const classifier = classifierSummaryOf(visionSummary);
  const classifierBlocked = classifierBlocksFinalization(classifier);
  const graphFlags = graphFlagsOf(graphValidation);
  const candidates = candidatesOf(visionSummary);
  const status = statusFor({ consensusGate, graphFlags, classifierBlocked });
  const contaminationRisk = contaminationRiskFor({
    status,
    safetyGate,
    graphFlags,
    classifierBlocked
  });
  const riskReasons = riskReasonsFor({
    consensusGate,
    visionSummary,
    graphValidation,
    classifier,
    safetyGate
  });

  return {
    contractVersion: 'vision-diagnostic-reliability-card/v1',
    status,
    contaminationRisk,
    confidenceScore: confidenceScoreFor({
      status,
      candidates,
      safetyGate,
      graphFlags,
      classifierBlocked
    }),
    automaticReportAllowed: status === 'auto_report_ready',
    graphRetrievalAllowed: consensusGate.allowGraphRetrieval,
    causeCountermeasureAllowed: status === 'auto_report_ready',
    llmSupplementAllowed: consensusGate.allowLlmSupplement && status === 'auto_report_ready',
    humanReviewRequired: status !== 'auto_report_ready',
    serviceWritesAllowed: false,
    policy: {
      failClosed: true,
      top1VisionCandidateTrustedAlone: false,
      graphGroundingRequiredForFinalReport: true,
      llmSupplementRequiresGraphAcceptance: true,
      modelTrainingAllowed: false,
      graphPromotionAllowed: false
    },
    candidateSummary: buildCandidateSummary(candidates),
    riskReasons,
    nextActions: nextActionsFor({ status, contaminationRisk }),
    evidence: {
      consensusGate,
      visionDecisionStatus: compact(visionSummary?.decisionStatus || visionSummary?.decision_status),
      visionSafetyStatus: compact(safetyGate.status),
      visionSafetyScore: Number.isFinite(Number(safetyGate.score)) ? Number(safetyGate.score) : null,
      visionSafetyReasons: asArray(safetyGate.reasons).map(compact).filter(Boolean),
      graphGrounded: graphFlags.graphGrounded,
      graphTopCandidateSupported: graphFlags.topCandidateSupported,
      graphAutoFinalizeAllowed: graphFlags.autoFinalizeAllowed,
      graphRequiresHumanReview: graphFlags.requiresHumanReview,
      visionGraphConflict: graphFlags.visionGraphConflict,
      classifierStatus: compact(classifier?.status),
      classifierAgreementWithVisionTop1: classifier
        ? classifier.agreementWithVisionTop1 ?? classifier.agreement_with_vision_top1 ?? null
        : null
    }
  };
};

module.exports = {
  buildVisionDiagnosticReliabilityCard
};
