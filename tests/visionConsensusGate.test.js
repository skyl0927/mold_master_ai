const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildVisionConsensusGate
} = require('../visionConsensusGate');

const reliableWhiteningVision = {
  contractVersion: 'vision-observation/v2',
  imageKind: 'physical_product',
  normalityStatus: 'defect_visible',
  decisionStatus: 'probable',
  decisionReason: 'probable_multiview_consensus',
  visibleFeatures: [
    '리브 기부의 유백색 변색',
    '취출 방향 주변의 국부 경계 변화'
  ],
  primaryCandidate: {
    defectType: '백화',
    confidence: 0.86,
    supportingObservationIds: ['obs-color', 'obs-location']
  },
  candidates: [
    {
      defectType: '백화',
      confidence: 0.86,
      supportingObservationIds: ['obs-color', 'obs-location'],
      contradictingObservationIds: []
    },
    {
      defectType: '웰드라인',
      confidence: 0.18,
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
    topCandidateMargin: 0.68
  }
};

const approvedGraphValidation = {
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
  decisionReason: 'graph_top_candidate_supported',
  candidateGrounding: []
};

test('Vision-only reliable observations cannot finalize without Graph grounding', () => {
  const gate = buildVisionConsensusGate(reliableWhiteningVision);

  assert.equal(gate.status, 'needs_review');
  assert.equal(gate.finalizationAllowed, false);
  assert.equal(gate.allowGraphRetrieval, true);
  assert.equal(gate.allowLlmSupplement, false);
  assert.equal(gate.primaryReason, 'missing_graph_grounding');
  assert.ok(gate.reasons.includes('missing_graph_grounding'));
  assert.equal(gate.evidence.visionDecisionStatus, 'probable');
  assert.equal(gate.evidence.graphGrounded, false);
});

test('approved Graph grounding can finalize a Vision candidate while preserving LLM supplement policy', () => {
  const gate = buildVisionConsensusGate(reliableWhiteningVision, {
    graphValidation: approvedGraphValidation
  });

  assert.equal(gate.status, 'accepted');
  assert.equal(gate.finalizationAllowed, true);
  assert.equal(gate.allowGraphRetrieval, true);
  assert.equal(gate.allowLlmSupplement, true);
  assert.equal(gate.primaryReason, 'graph_top_candidate_supported');
  assert.equal(gate.evidence.graphGrounded, true);
  assert.equal(gate.evidence.graphAutoFinalizeAllowed, true);
});

test('Vision-Graph conflict blocks finalization even if graph auto-finalize is accidentally true', () => {
  const gate = buildVisionConsensusGate(reliableWhiteningVision, {
    graphValidation: {
      ...approvedGraphValidation,
      visionGraphConflict: true,
      decisionReason: 'vision_graph_conflict'
    }
  });

  assert.equal(gate.status, 'needs_review');
  assert.equal(gate.finalizationAllowed, false);
  assert.equal(gate.allowLlmSupplement, false);
  assert.equal(gate.primaryReason, 'vision_graph_conflict');
  assert.ok(gate.reasons.includes('vision_graph_conflict'));
});

test('classifier disagreement blocks Graph finalization and keeps the disagreement reason', () => {
  const gate = buildVisionConsensusGate({
    ...reliableWhiteningVision,
    classifierSummary: {
      contractVersion: 'vision-classifier/v1',
      candidates: [],
      topCandidate: {
        rank: 1,
        defectType: '웰드라인',
        confidence: 0.88,
        referenceCount: 5,
        supportImageIds: []
      },
      minimumReferenceSupport: 3,
      agreementWithVisionTop1: false,
      status: 'disagreed',
      decisionReason: 'vision_classifier_disagreement',
      graphCandidateUseAllowed: false,
      requiresHumanReview: true
    }
  }, {
    graphValidation: approvedGraphValidation
  });

  assert.equal(gate.status, 'needs_review');
  assert.equal(gate.finalizationAllowed, false);
  assert.equal(gate.allowLlmSupplement, false);
  assert.equal(gate.primaryReason, 'vision_classifier_disagreement');
  assert.equal(gate.evidence.classifierStatus, 'disagreed');
  assert.equal(gate.evidence.classifierAgreementWithVisionTop1, false);
});

test('quality-blocked Vision observations stop Graph retrieval and report generation', () => {
  const gate = buildVisionConsensusGate({
    ...reliableWhiteningVision,
    decisionStatus: 'unclassifiable',
    decisionReason: 'image_quality_rejected',
    qualityStatus: 'reject',
    primaryCandidate: null,
    candidates: [],
    safetyGate: {
      ...reliableWhiteningVision.safetyGate,
      status: 'blocked',
      reasons: ['image_quality_rejected'],
      candidateUsePolicy: 'do_not_use_vision_candidate',
      autoGraphCandidateUseAllowed: false,
      humanReviewRequired: true
    }
  });

  assert.equal(gate.status, 'blocked');
  assert.equal(gate.finalizationAllowed, false);
  assert.equal(gate.allowGraphRetrieval, false);
  assert.equal(gate.allowLlmSupplement, false);
  assert.equal(gate.primaryReason, 'image_quality_rejected');
});
