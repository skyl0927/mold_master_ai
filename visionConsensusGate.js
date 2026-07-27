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
  || 'vision_classifier_review_required'
);

const graphReason = graphValidation => compact(
  graphValidation?.decisionReason
  || graphValidation?.decision_reason
  || graphValidation?.decisionStatus
  || graphValidation?.decision_status
);

const graphSupportsFinalization = graphValidation => Boolean(
  graphValidation
  && graphValidation.graphGrounded !== false
  && graphValidation.graph_grounded !== false
  && graphValidation.autoFinalizeAllowed === true
  && graphValidation.auto_finalize_allowed !== false
  && graphValidation.requiresHumanReview !== true
  && graphValidation.requires_human_review !== true
  && graphValidation.topCandidateSupported !== false
  && graphValidation.top_candidate_supported !== false
  && graphValidation.visionGraphConflict !== true
  && graphValidation.vision_graph_conflict !== true
);

const graphEvidenceFlags = graphValidation => ({
  graphGrounded: Boolean(
    graphValidation
    && graphValidation.graphGrounded !== false
    && graphValidation.graph_grounded !== false
  ),
  graphTopCandidateSupported: Boolean(
    graphValidation
    && graphValidation.topCandidateSupported !== false
    && graphValidation.top_candidate_supported !== false
  ),
  graphAutoFinalizeAllowed: Boolean(
    graphValidation
    && graphValidation.autoFinalizeAllowed === true
    && graphValidation.auto_finalize_allowed !== false
  ),
  graphRequiresHumanReview: Boolean(
    graphValidation
    && (graphValidation.requiresHumanReview === true || graphValidation.requires_human_review === true)
  ),
  visionGraphConflict: Boolean(
    graphValidation
    && (graphValidation.visionGraphConflict === true || graphValidation.vision_graph_conflict === true)
  )
});

const firstBlockingReason = visionSummary => {
  const safetyGate = visionSummary?.safetyGate || visionSummary?.safety_gate || {};
  const safetyReasons = asArray(safetyGate.reasons).map(compact).filter(Boolean);
  const candidateUsePolicy = compact(
    safetyGate.candidateUsePolicy || safetyGate.candidate_use_policy
  );
  const qualityStatus = compact(visionSummary?.qualityStatus || visionSummary?.quality_status);
  const imageKind = compact(visionSummary?.imageKind || visionSummary?.image_kind);
  const decisionStatus = compact(visionSummary?.decisionStatus || visionSummary?.decision_status);
  const decisionReason = compact(visionSummary?.decisionReason || visionSummary?.decision_reason);

  if (qualityStatus === 'reject') return 'image_quality_rejected';
  if (imageKind === 'document_or_diagram') return 'non_physical_image';
  if (safetyGate.status === 'blocked') return safetyReasons[0] || decisionReason || 'vision_safety_blocked';
  if (candidateUsePolicy === 'do_not_use_vision_candidate') {
    return safetyReasons[0] || decisionReason || 'vision_candidate_use_blocked';
  }
  if (decisionStatus === 'unclassifiable' && !topCandidateName(visionSummary)) {
    return decisionReason || 'no_classifiable_candidate';
  }
  return '';
};

const reviewReasons = (visionSummary, graphValidation, classifier) => {
  const reasons = [];
  const safetyGate = visionSummary?.safetyGate || visionSummary?.safety_gate || {};
  const decisionStatus = compact(visionSummary?.decisionStatus || visionSummary?.decision_status);
  const decisionReason = compact(visionSummary?.decisionReason || visionSummary?.decision_reason);
  const safetyStatus = compact(safetyGate.status);
  const candidateUsePolicy = compact(safetyGate.candidateUsePolicy || safetyGate.candidate_use_policy);
  const graphFlags = graphEvidenceFlags(graphValidation);

  if (classifierBlocksFinalization(classifier)) {
    reasons.push(classifierReason(classifier));
  }
  if (graphFlags.visionGraphConflict) {
    reasons.push(graphReason(graphValidation) || 'vision_graph_conflict');
  } else if (graphValidation && graphFlags.graphRequiresHumanReview) {
    reasons.push(graphReason(graphValidation) || 'graph_grounding_requires_review');
  } else if (graphValidation && !graphFlags.graphGrounded) {
    reasons.push(graphReason(graphValidation) || 'graph_not_grounded');
  } else if (graphValidation && !graphFlags.graphTopCandidateSupported) {
    reasons.push(graphReason(graphValidation) || 'graph_top_candidate_not_supported');
  } else if (graphValidation && !graphFlags.graphAutoFinalizeAllowed) {
    reasons.push(graphReason(graphValidation) || 'graph_auto_finalize_not_allowed');
  }

  if (decisionStatus && decisionStatus !== 'probable') {
    reasons.push(decisionReason || `vision_${decisionStatus}`);
  }
  if (safetyStatus === 'needs_review') {
    reasons.push(...asArray(safetyGate.reasons).map(compact).filter(Boolean));
  }
  if (candidateUsePolicy === 'graph_cross_check_only') {
    reasons.push('vision_candidate_requires_graph_cross_check');
  }
  if (!graphValidation) {
    reasons.push('missing_graph_grounding');
  }

  return Array.from(new Set(reasons.filter(Boolean)));
};

const buildVisionConsensusGate = (
  visionSummary,
  {
    graphValidation = null
  } = {}
) => {
  const v2 = isV2Observation(visionSummary);
  const classifier = classifierSummaryOf(visionSummary);
  const blockingReason = v2 ? firstBlockingReason(visionSummary) : '';
  const blocked = Boolean(blockingReason);
  const reasons = blocked
    ? [blockingReason]
    : v2
      ? reviewReasons(visionSummary, graphValidation, classifier)
      : [];
  const graphAccepted = graphSupportsFinalization(graphValidation);
  const classifierBlocked = classifierBlocksFinalization(classifier);
  const finalizationAllowed = !v2
    ? true
    : !blocked && graphAccepted && !classifierBlocked;
  const acceptedReason = graphReason(graphValidation) || 'vision_graph_consensus_accepted';
  const status = finalizationAllowed
    ? 'accepted'
    : blocked ? 'blocked' : 'needs_review';
  const graphFlags = graphEvidenceFlags(graphValidation);

  return {
    contractVersion: 'vision-consensus-gate/v1',
    status,
    finalizationAllowed,
    allowGraphRetrieval: !blocked,
    allowLlmSupplement: finalizationAllowed
      && (!graphValidation || graphValidation.llmSupplementAllowed !== false)
      && (!graphValidation || graphValidation.llm_supplement_allowed !== false),
    primaryReason: finalizationAllowed
      ? acceptedReason
      : reasons[0] || 'vision_consensus_review_required',
    reasons,
    candidateUsePolicy: finalizationAllowed
      ? 'verified_graph_candidate'
      : blocked ? 'do_not_use_vision_candidate' : 'graph_cross_check_only',
    evidence: {
      visionContractVersion: compact(visionSummary?.contractVersion || visionSummary?.contract_version),
      visionDecisionStatus: compact(visionSummary?.decisionStatus || visionSummary?.decision_status),
      visionSafetyStatus: compact(visionSummary?.safetyGate?.status || visionSummary?.safety_gate?.status),
      visionTopCandidate: topCandidateName(visionSummary),
      ...graphFlags,
      classifierStatus: compact(classifier?.status),
      classifierAgreementWithVisionTop1: classifier
        ? classifier.agreementWithVisionTop1 ?? classifier.agreement_with_vision_top1 ?? null
        : null
    }
  };
};

module.exports = {
  buildVisionConsensusGate
};
