const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildVisionDiagnosticReliabilityCard
} = require('../visionDiagnosticReliabilityCard');
const {
  guardDefectAnalysisForVisionRisk
} = require('../visionDiagnosisGuard');

const reliableVision = () => ({
  contractVersion: 'vision-observation/v2',
  imageKind: 'physical_product',
  normalityStatus: 'defect_visible',
  decisionStatus: 'probable',
  decisionReason: 'probable_multiview_consensus',
  primaryCandidate: {
    defectType: 'whitening',
    confidence: 0.88,
    supportingObservationIds: ['obs-color', 'obs-location']
  },
  candidates: [
    {
      defectType: 'whitening',
      confidence: 0.88,
      supportingObservationIds: ['obs-color', 'obs-location'],
      contradictingObservationIds: []
    },
    {
      defectType: 'sink mark',
      confidence: 0.18,
      supportingObservationIds: ['obs-location'],
      contradictingObservationIds: ['obs-color']
    },
    {
      defectType: 'weld line',
      confidence: 0.11,
      supportingObservationIds: ['obs-location'],
      contradictingObservationIds: ['obs-color']
    }
  ],
  safetyGate: {
    status: 'reliable',
    score: 96,
    reasons: [],
    candidateUsePolicy: 'candidate_primary_graph_cross_check',
    autoGraphCandidateUseAllowed: true,
    humanReviewRequired: false,
    supportObservationCount: 2,
    supportCategoryCount: 2,
    topCandidateMargin: 0.7
  }
});

const approvedGraph = () => ({
  contractVersion: 'vision-graph-grounding/v1',
  graphGrounded: true,
  topCandidateSupported: true,
  visionGraphConflict: false,
  approvedPathCount: 2,
  citationCount: 2,
  requiresHumanReview: false,
  autoFinalizeAllowed: true,
  llmSupplementAllowed: true,
  decisionStatus: 'grounded',
  decisionReason: 'graph_top_candidate_supported'
});

test('allows automatic report content only when Vision, Graph, and classifier gates agree', () => {
  const card = buildVisionDiagnosticReliabilityCard(reliableVision(), {
    graphValidation: approvedGraph()
  });

  assert.equal(card.contractVersion, 'vision-diagnostic-reliability-card/v1');
  assert.equal(card.status, 'auto_report_ready');
  assert.equal(card.contaminationRisk, 'low');
  assert.equal(card.automaticReportAllowed, true);
  assert.equal(card.causeCountermeasureAllowed, true);
  assert.equal(card.graphRetrievalAllowed, true);
  assert.equal(card.llmSupplementAllowed, true);
  assert.equal(card.humanReviewRequired, false);
  assert.equal(card.serviceWritesAllowed, false);
  assert.equal(card.policy.top1VisionCandidateTrustedAlone, false);
  assert.deepEqual(card.candidateSummary.topK.map(candidate => candidate.defectType), [
    'whitening',
    'sink mark',
    'weld line'
  ]);
  assert.equal(card.candidateSummary.topCandidateMargin, 0.7);
  assert.ok(card.confidenceScore >= 90);
  assert.ok(card.nextActions.includes('use_graph_grounded_report'));
});

test('requires Graph cross-check when Vision looks reliable but Graph grounding is missing', () => {
  const card = buildVisionDiagnosticReliabilityCard(reliableVision());

  assert.equal(card.status, 'graph_cross_check_required');
  assert.equal(card.contaminationRisk, 'medium');
  assert.equal(card.automaticReportAllowed, false);
  assert.equal(card.causeCountermeasureAllowed, false);
  assert.equal(card.graphRetrievalAllowed, true);
  assert.equal(card.llmSupplementAllowed, false);
  assert.equal(card.humanReviewRequired, true);
  assert.ok(card.riskReasons.includes('graph_grounding_required'));
  assert.ok(card.nextActions.includes('run_graph_cross_check_for_top3_candidates'));
});

test('downgrades weak visual evidence even if Top-1 confidence is high', () => {
  const weakVision = {
    ...reliableVision(),
    decisionStatus: 'needs_review',
    decisionReason: 'vision_safety_gate_requires_review',
    safetyGate: {
      ...reliableVision().safetyGate,
      status: 'needs_review',
      score: 58,
      reasons: ['insufficient_independent_visual_evidence'],
      candidateUsePolicy: 'graph_cross_check_only',
      autoGraphCandidateUseAllowed: false,
      humanReviewRequired: true,
      supportObservationCount: 1,
      supportCategoryCount: 1
    }
  };

  const card = buildVisionDiagnosticReliabilityCard(weakVision, {
    graphValidation: {
      ...approvedGraph(),
      autoFinalizeAllowed: false,
      requiresHumanReview: true,
      decisionReason: 'graph_cross_check_only_until_vision_review'
    }
  });

  assert.equal(card.status, 'graph_cross_check_required');
  assert.equal(card.contaminationRisk, 'high');
  assert.equal(card.automaticReportAllowed, false);
  assert.equal(card.causeCountermeasureAllowed, false);
  assert.equal(card.evidence.visionSafetyStatus, 'needs_review');
  assert.ok(card.riskReasons.includes('insufficient_independent_visual_evidence'));
  assert.ok(card.nextActions.includes('do_not_write_final_causes_until_graph_accepts_candidate'));
});

test('routes Vision-Graph or classifier disagreement to HITL and blocks LLM supplement', () => {
  const card = buildVisionDiagnosticReliabilityCard({
    ...reliableVision(),
    classifierSummary: {
      contractVersion: 'vision-classifier/v1',
      status: 'disagreed',
      agreementWithVisionTop1: false,
      graphCandidateUseAllowed: false,
      requiresHumanReview: true,
      decisionReason: 'vision_classifier_disagreement'
    }
  }, {
    graphValidation: {
      ...approvedGraph(),
      visionGraphConflict: true,
      autoFinalizeAllowed: false,
      requiresHumanReview: true,
      decisionReason: 'vision_graph_conflict'
    }
  });

  assert.equal(card.status, 'hitl_required');
  assert.equal(card.contaminationRisk, 'high');
  assert.equal(card.automaticReportAllowed, false);
  assert.equal(card.graphRetrievalAllowed, true);
  assert.equal(card.llmSupplementAllowed, false);
  assert.ok(card.riskReasons.includes('vision_graph_conflict'));
  assert.ok(card.riskReasons.includes('vision_classifier_disagreement'));
  assert.ok(card.nextActions.includes('send_vision_graph_conflict_to_hitl'));
});

test('blocks graph retrieval and report generation for non-diagnostic image evidence', () => {
  const card = buildVisionDiagnosticReliabilityCard({
    ...reliableVision(),
    imageKind: 'document_or_diagram',
    qualityStatus: 'reject',
    decisionStatus: 'unclassifiable',
    decisionReason: 'image_quality_rejected',
    primaryCandidate: null,
    candidates: [],
    safetyGate: {
      status: 'blocked',
      score: 0,
      reasons: ['image_quality_rejected'],
      candidateUsePolicy: 'do_not_use_vision_candidate',
      autoGraphCandidateUseAllowed: false,
      humanReviewRequired: true
    }
  });

  assert.equal(card.status, 'blocked');
  assert.equal(card.contaminationRisk, 'blocked');
  assert.equal(card.automaticReportAllowed, false);
  assert.equal(card.graphRetrievalAllowed, false);
  assert.equal(card.causeCountermeasureAllowed, false);
  assert.equal(card.llmSupplementAllowed, false);
  assert.ok(card.riskReasons.includes('image_quality_rejected'));
  assert.ok(card.nextActions.includes('recapture_physical_product_image'));
});

test('attaches the reliability card to guarded diagnosis output for downstream report UI', () => {
  const guarded = guardDefectAnalysisForVisionRisk({
    defectType: 'whitening',
    severity: 'Medium',
    description: 'Graph-supported whitening near rib base',
    possibleCauses: '1. Ejection resistance',
    countermeasures: '1. Polish rib draft and ejector balance',
    rawOutput: 'raw',
    retrievalSummary: {
      modeUsed: 'graph_only',
      citations: ['path-1'],
      evidenceCount: 1,
      graphTrace: ['whitening -> ejection resistance -> polish rib draft'],
      graphGrounded: true,
      llmSupplemented: false
    }
  }, reliableVision(), {
    graphValidation: approvedGraph()
  });

  assert.equal(
    guarded.visionSummary.diagnosticReliabilityCard.contractVersion,
    'vision-diagnostic-reliability-card/v1'
  );
  assert.equal(guarded.visionSummary.diagnosticReliabilityCard.status, 'auto_report_ready');
  assert.equal(guarded.visionSummary.diagnosticReliabilityCard.causeCountermeasureAllowed, true);
});
