const assert = require('node:assert/strict');
const test = require('node:test');
const {
  buildVisionDiagnosisGuard,
  guardDefectAnalysisForVisionRisk
} = require('../visionDiagnosisGuard');

const weakObservation = {
  contractVersion: 'vision-observation/v2',
  imageKind: 'physical_product',
  normalityStatus: 'defect_visible',
  decisionStatus: 'needs_review',
  decisionReason: 'vision_safety_gate_requires_review',
  visibleFeatures: ['리브 기부의 유백색 변색'],
  primaryCandidate: {
    defectType: '백화',
    confidence: 0.91
  },
  requiredAdditionalViews: ['사선광 근접 촬영'],
  safetyGate: {
    status: 'needs_review',
    score: 62,
    reasons: ['insufficient_independent_visual_evidence'],
    candidateUsePolicy: 'graph_cross_check_only',
    autoGraphCandidateUseAllowed: false,
    humanReviewRequired: true,
    supportObservationCount: 1,
    supportCategoryCount: 1,
    topCandidateMargin: 0.73
  }
};

test('weak Vision candidates can retrieve graph context but cannot finalize diagnosis', () => {
  const guard = buildVisionDiagnosisGuard(weakObservation);

  assert.equal(guard.status, 'needs_review');
  assert.equal(guard.allowGraphRetrieval, true);
  assert.equal(guard.allowLlmSupplement, false);
  assert.equal(guard.finalizationAllowed, false);
  assert.equal(guard.guardedDefectType, '판정 보류 (후보 미검증)');
  assert.match(guard.reviewReason, /insufficient_independent_visual_evidence/);
});

test('guard removes unverified LLM causes and actions from weak Vision analysis', () => {
  const guarded = guardDefectAnalysisForVisionRisk({
    defectType: '백화',
    severity: 'Medium',
    description: '리브 주변 백화로 판단됨',
    possibleCauses: 'LLM 추정 원인',
    countermeasures: 'LLM 추정 대책',
    rawOutput: 'raw',
    retrievalSummary: {
      modeUsed: 'hybrid',
      citations: [],
      evidenceCount: 0,
      graphGrounded: false,
      llmSupplemented: true
    }
  }, weakObservation);

  assert.equal(guarded.defectType, '판정 보류 (후보 미검증)');
  assert.equal(guarded.severity, '-');
  assert.equal(guarded.description, '리브 기부의 유백색 변색');
  assert.equal(guarded.possibleCauses, '');
  assert.equal(guarded.countermeasures, '');
  assert.equal(guarded.retrievalSummary.llmSupplemented, true);
});

test('mixed defect locations hide the speculative top candidate and stop retrieval', () => {
  const mixedObservation = {
    ...weakObservation,
    primaryCandidate: {
      defectType: '플래시 또는 버',
      confidence: 0.72
    },
    fusionSummary: {
      contractVersion: 'vision-fusion/v1',
      requestedViewCount: 4,
      validViewCount: 4,
      availableViewTags: ['full_part_context', 'defect_closeup', 'oblique_light', 'ejection_location'],
      missingRequiredViews: [],
      disagreementScore: 0.55,
      candidateSupport: [{
        defectType: '플래시 또는 버',
        fusedConfidence: 0.72,
        supportingViewIds: ['view-rib'],
        contradictingViewIds: [],
        supportingViewCount: 1
      }, {
        defectType: '스크래치/패임',
        fusedConfidence: 0.52,
        supportingViewIds: ['view-full', 'view-leaf', 'view-round'],
        contradictingViewIds: [],
        supportingViewCount: 3
      }],
      decisionStatus: 'needs_review',
      decisionReason: 'multiview_candidate_conflict'
    }
  };

  const guard = buildVisionDiagnosisGuard(mixedObservation);
  const guarded = guardDefectAnalysisForVisionRisk({
    defectType: '플래시 또는 버',
    severity: 'Medium',
    description: '서로 다른 부위의 관찰 내용',
    possibleCauses: '잘못 결합된 원인',
    countermeasures: '잘못 결합된 대책',
    rawOutput: 'raw',
    retrievalSummary: {
      modeUsed: 'graph_only',
      citations: ['unrelated-path'],
      evidenceCount: 3,
      graphTrace: ['스크래치 -> 취출 저항 -> 조건 점검'],
      graphGrounded: false,
      llmSupplemented: false
    }
  }, mixedObservation);

  assert.equal(guard.finalizationAllowed, false);
  assert.equal(guard.allowGraphRetrieval, false);
  assert.equal(guard.allowLlmSupplement, false);
  assert.equal(guard.guardedDefectType, '판정 보류 (사진 그룹 분리 필요)');
  assert.equal(guard.reviewReason, 'different_defect_regions_suspected');
  assert.match(guard.recommendedReviewAction, /동일 결함 위치/);
  assert.equal(guarded.defectType, '판정 보류 (사진 그룹 분리 필요)');
  assert.match(guarded.description, /서로 다른 결함 위치/);
  assert.equal(guarded.possibleCauses, '');
  assert.equal(guarded.countermeasures, '');
});

test('reliable Vision without Graph grounding cannot pass LLM-only causes and actions', () => {
  const reliableObservation = {
    ...weakObservation,
    decisionStatus: 'probable',
    decisionReason: 'probable_multiview_consensus',
    visibleFeatures: ['리브 기부의 유백색 변색', '취출 방향 주변 경계 변화'],
    safetyGate: {
      ...weakObservation.safetyGate,
      status: 'reliable',
      reasons: [],
      candidateUsePolicy: 'candidate_primary_graph_cross_check',
      autoGraphCandidateUseAllowed: true,
      humanReviewRequired: false,
      supportObservationCount: 2,
      supportCategoryCount: 2
    }
  };

  const guarded = guardDefectAnalysisForVisionRisk({
    defectType: '백화',
    severity: 'Medium',
    description: '리브 주변 백화로 판단됨',
    possibleCauses: 'LLM 단독 추정 원인',
    countermeasures: 'LLM 단독 추정 대책',
    rawOutput: 'raw',
    retrievalSummary: {
      modeUsed: 'hybrid',
      citations: [],
      evidenceCount: 0,
      graphTrace: [],
      graphGrounded: false,
      llmSupplemented: true
    }
  }, reliableObservation);

  assert.equal(guarded.defectType, '판정 보류 (후보 미검증)');
  assert.equal(guarded.possibleCauses, '');
  assert.equal(guarded.countermeasures, '');
  assert.equal(guarded.visionSummary.decisionReason, 'missing_graph_grounding');
});

test('local Graph-grounded analysis can finalize when it matches the Vision candidate', () => {
  const reliableObservation = {
    ...weakObservation,
    decisionStatus: 'probable',
    decisionReason: 'probable_multiview_consensus',
    visibleFeatures: ['리브 기부의 유백색 변색', '취출 방향 주변 경계 변화'],
    safetyGate: {
      ...weakObservation.safetyGate,
      status: 'reliable',
      reasons: [],
      candidateUsePolicy: 'candidate_primary_graph_cross_check',
      autoGraphCandidateUseAllowed: true,
      humanReviewRequired: false,
      supportObservationCount: 2,
      supportCategoryCount: 2
    }
  };

  const guarded = guardDefectAnalysisForVisionRisk({
    defectType: '백화',
    severity: 'Medium',
    description: 'Graph 승인 경로로 백화를 확인함',
    possibleCauses: '1. 취출 저항',
    countermeasures: '1. 구배 점검',
    rawOutput: 'raw',
    retrievalSummary: {
      modeUsed: 'graph_only',
      citations: ['path-1'],
      evidenceCount: 1,
      graphTrace: ['백화 -> 취출 저항 -> 구배 점검'],
      graphGrounded: true,
      llmSupplemented: false
    }
  }, reliableObservation);

  assert.equal(guarded.defectType, '백화');
  assert.equal(guarded.possibleCauses, '1. 취출 저항');
  assert.equal(guarded.countermeasures, '1. 구배 점검');
});

test('approved Graph auto-finalization preserves a weak Vision candidate', () => {
  const guarded = guardDefectAnalysisForVisionRisk({
    defectType: '백화',
    severity: 'Medium',
    description: 'Graph 승인 경로로 백화를 확인함',
    possibleCauses: '1. 취출 저항',
    countermeasures: '1. 구배 점검',
    rawOutput: 'raw',
    retrievalSummary: {
      modeUsed: 'graph_only',
      citations: ['path-1'],
      evidenceCount: 1,
      graphGrounded: true,
      llmSupplemented: false
    }
  }, weakObservation, {
    graphValidation: {
      autoFinalizeAllowed: true,
      requiresHumanReview: false,
      graphGrounded: true,
      topCandidateSupported: true
    }
  });

  assert.equal(guarded.defectType, '백화');
  assert.equal(guarded.possibleCauses, '1. 취출 저항');
  assert.equal(guarded.countermeasures, '1. 구배 점검');
});

test('classifier disagreement prevents finalization even with approved Graph support', () => {
  const reliableObservation = {
    ...weakObservation,
    decisionStatus: 'probable',
    decisionReason: 'probable_multiview_consensus',
    safetyGate: {
      ...weakObservation.safetyGate,
      status: 'reliable',
      reasons: [],
      candidateUsePolicy: 'candidate_primary_graph_cross_check',
      autoGraphCandidateUseAllowed: true,
      humanReviewRequired: false,
      supportObservationCount: 2,
      supportCategoryCount: 2
    },
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
  };

  const guarded = guardDefectAnalysisForVisionRisk({
    defectType: '백화',
    severity: 'Medium',
    description: 'Graph 승인 경로로 백화를 확인함',
    possibleCauses: '1. 취출 저항',
    countermeasures: '1. 구배 점검',
    rawOutput: 'raw',
    visionSummary: reliableObservation,
    retrievalSummary: {
      modeUsed: 'graph_only',
      citations: ['path-1'],
      evidenceCount: 1,
      graphGrounded: true,
      llmSupplemented: false
    }
  }, reliableObservation, {
    graphValidation: {
      autoFinalizeAllowed: true,
      requiresHumanReview: false,
      graphGrounded: true,
      topCandidateSupported: true
    }
  });

  assert.equal(guarded.defectType, '판정 보류 (후보 미검증)');
  assert.equal(guarded.possibleCauses, '');
  assert.equal(guarded.countermeasures, '');
  assert.equal(guarded.visionSummary.decisionReason, 'vision_classifier_disagreement');
});

test('blocked Vision observations stop graph retrieval and final diagnosis', () => {
  const guard = buildVisionDiagnosisGuard({
    ...weakObservation,
    imageKind: 'document_or_diagram',
    decisionStatus: 'unclassifiable',
    decisionReason: 'non_physical_image',
    primaryCandidate: null,
    safetyGate: {
      ...weakObservation.safetyGate,
      status: 'blocked',
      candidateUsePolicy: 'do_not_use_vision_candidate',
      reasons: ['non_physical_image']
    }
  });

  assert.equal(guard.status, 'blocked');
  assert.equal(guard.allowGraphRetrieval, false);
  assert.equal(guard.allowLlmSupplement, false);
  assert.equal(guard.guardedDefectType, '판정 보류 (사람 검토 필요)');
});
