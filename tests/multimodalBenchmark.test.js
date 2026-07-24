const assert = require('node:assert/strict');
const test = require('node:test');

const {
  canonicalDefectClass,
  findDuplicateImageGroups,
  findDuplicateLabelConflicts,
  evaluateVisionResult,
  isClassifiable,
  summarizeVisionBenchmark,
  validateVisionCases
} = require('../scripts/lib/multimodal-benchmark');
const {
  buildShadowReleaseInput
} = require('../scripts/lib/vision-operational-release-input');
const {
  applyVisionRuntimeGate,
  assessVisionRuntimeStatus,
  buildBlindVisionQuestion,
  buildGraphRetrievalQuestion
} = require('../scripts/lib/vision-benchmark-harness');

const validCase = {
  id: 'whitening-rib-01',
  title: 'Rib whitening with ejection resistance',
  imagePath: 'fixtures/whitening-rib-01.png',
  inputNotes: '리브 주변 백화, 취출 시 딱 소리',
  expected: {
    defectType: '백화',
    possibleCauseKeywords: ['취출 저항'],
    countermeasureKeywords: ['구배'],
    minEvidenceCount: 1
  }
};

test('blind Vision prompt excludes field notes, expected labels, and Graph instructions', () => {
  const question = buildBlindVisionQuestion({
    inputNotes: 'FIELD_CONTEXT_SENTINEL',
    expected: { defectType: 'EXPECTED_LABEL_SENTINEL' },
    roiNormalized: { x: 0.1, y: 0.1, width: 0.5, height: 0.5 }
  });

  assert.match(question, /pixels|픽셀/i);
  assert.doesNotMatch(question, /FIELD_CONTEXT_SENTINEL/);
  assert.doesNotMatch(question, /EXPECTED_LABEL_SENTINEL/);
  assert.doesNotMatch(question, /Graph DB|원인과 대책/);
});

test('Graph retrieval prompt adds field context only after blind observations', () => {
  const question = buildGraphRetrievalQuestion({
    testCase: { inputNotes: 'FIELD_CONTEXT_SENTINEL' },
    visionSummary: {
      decisionStatus: 'needs_review',
      candidates: [{
        defectType: '백화',
        confidence: 0.62,
        supportingFeatures: ['리브 주변 유백색 변색'],
        contradictingFeatures: []
      }],
      visibleFeatures: ['리브 주변 유백색 변색']
    },
    observation: {
      summary: '픽셀 관찰 결과',
      possible_causes: ['VISION_CAUSE_MUST_NOT_PROPAGATE']
    }
  });

  assert.match(question, /FIELD_CONTEXT_SENTINEL/);
  assert.match(question, /백화/);
  assert.match(question, /픽셀 관찰 결과/);
  assert.doesNotMatch(question, /VISION_CAUSE_MUST_NOT_PROPAGATE/);
});

test('runtime attestation fails closed when model lineage is incomplete', () => {
  const ready = assessVisionRuntimeStatus({
    vision_model: 'gpt-5.6-terra',
    vision_prompt_version: 'vision-observation-v3',
    vision_image_detail: 'auto'
  });
  const missingPrompt = assessVisionRuntimeStatus({
    vision_model: 'gpt-5.6-terra',
    vision_image_detail: 'auto'
  });

  assert.equal(ready.ready, true);
  assert.equal(missingPrompt.ready, false);
  assert.deepEqual(missingPrompt.missingFields, ['vision_prompt_version']);

  const gated = applyVisionRuntimeGate({
    gateChecks: { defectAccuracy: true },
    failedGateChecks: [],
    readyToDisableLegacyFallback: true
  }, missingPrompt);
  assert.equal(gated.gateChecks.runtimeAttestation, false);
  assert.deepEqual(gated.failedGateChecks, ['runtimeAttestation']);
  assert.equal(gated.readyToDisableLegacyFallback, false);
});

test('vision fixture validation reports missing and placeholder image paths', () => {
  const validation = validateVisionCases([
    validCase,
    { ...validCase, id: 'placeholder', imagePath: 'REPLACE_WITH_LOCAL_IMAGE_PATH' }
  ], {
    fileExists: imagePath => imagePath.endsWith('whitening-rib-01.png')
  });

  assert.equal(validation.valid.length, 1);
  assert.equal(validation.invalid.length, 1);
  assert.match(validation.invalid[0].reason, /placeholder/i);
});

test('vision fixture validation accepts an approved Common Agent image reference', () => {
  const validation = validateVisionCases([{
    ...validCase,
    imagePath: undefined,
    commonAgentImageId: 'image-approved-1',
    mimeType: 'image/jpeg'
  }]);

  assert.equal(validation.valid.length, 1);
  assert.equal(validation.valid[0].commonAgentImageId, 'image-approved-1');
  assert.equal(validation.invalid.length, 0);
});

test('vision result scoring requires classification, expected terms, and graph evidence', () => {
  const result = evaluateVisionResult(validCase, {
    httpOk: true,
    latencyMs: 1200,
    response: {
      observation: {
        defect_type: '리브 주변 백화',
        possible_causes: ['과도한 취출 저항']
      },
      answer: '이형 구배를 확인하고 리브를 연마하세요.',
      evidence: [{
        text: '취출 저항에 의한 백화',
        review_status: 'approved',
        source_ref: 'graph:path-1'
      }]
    }
  });

  assert.equal(result.passed, true);
  assert.equal(result.classifiable, true);
  assert.equal(result.graphGrounded, true);
  assert.equal(result.checks.defectType, true);
  assert.equal(result.checks.causes, true);
  assert.equal(result.checks.countermeasures, true);
});

test('vision scoring records Top-3 recovery when Top-1 is incorrect', () => {
  const result = evaluateVisionResult(validCase, {
    httpOk: true,
    latencyMs: 900,
    response: {
      observation: {
        defect_type: '밀핀 자국',
        visible_features: ['리브 주변 원형 경계와 유백색 변색'],
        candidates: [
          { defect_type: '밀핀 자국', confidence: 0.48 },
          { defect_type: '백화', confidence: 0.39 },
          { defect_type: '싱크마크', confidence: 0.13 }
        ],
        possible_causes: ['취출 저항']
      },
      answer: '구배를 확인하세요.',
      evidence: [{
        review_status: 'approved',
        source_ref: 'graph:path-top3'
      }]
    }
  });

  assert.equal(result.top1Accurate, false);
  assert.equal(result.top3Accurate, true);
  assert.equal(result.expectedCandidateRank, 2);
  assert.equal(result.decisionStatus, 'needs_review');
  assert.equal(result.acceptedPrediction, false);
  assert.equal(result.visionContractCompliant, true);
});

test('vision scoring treats a separated high-confidence candidate as an accepted prediction', () => {
  const result = evaluateVisionResult(validCase, {
    httpOk: true,
    latencyMs: 700,
    response: {
      observation: {
        contract_version: 'vision-observation/v2',
        image_kind: 'physical_product',
        normality_status: 'defect_visible',
        observations: [{
          observation_id: 'obs-color-1',
          category: 'color',
          description: '리브 기부의 유백색 응력 변색',
          region: '리브 기부',
          confidence: 0.92
        }],
        candidates: [
          {
            defect_type: '백화',
            confidence: 0.86,
            supporting_observation_ids: ['obs-color-1']
          },
          {
            defect_type: '싱크마크',
            confidence: 0.12,
            supporting_observation_ids: ['obs-color-1']
          }
        ]
      },
      answer: '구배를 확인하세요.',
      evidence: [{
        review_status: 'approved',
        source_type: 'knowledge_path'
      }]
    }
  });

  assert.equal(result.top1Accurate, true);
  assert.equal(result.decisionStatus, 'probable');
  assert.equal(result.acceptedPrediction, true);
  assert.equal(result.unsafeAcceptedError, false);
});

test('vision benchmark reports selective risk and confidence calibration', () => {
  const results = [
    {
      id: 'correct-accepted',
      passed: true,
      httpOk: true,
      classifiable: true,
      graphGrounded: true,
      expectedDefectClass: 'whitening',
      visionConfidence: 0.9,
      top1Accurate: true,
      top3Accurate: true,
      acceptedPrediction: true,
      unsafeAcceptedError: false,
      visionContractCompliant: true,
      qualityEligible: true,
      checks: { defectType: true }
    },
    {
      id: 'wrong-accepted',
      passed: false,
      httpOk: true,
      classifiable: true,
      graphGrounded: true,
      expectedDefectClass: 'whitening',
      visionConfidence: 0.9,
      top1Accurate: false,
      top3Accurate: true,
      acceptedPrediction: true,
      unsafeAcceptedError: true,
      visionContractCompliant: true,
      qualityEligible: true,
      checks: { defectType: false }
    },
    {
      id: 'wrong-abstained',
      passed: false,
      httpOk: true,
      classifiable: true,
      graphGrounded: true,
      expectedDefectClass: 'whitening',
      visionConfidence: 0.51,
      top1Accurate: false,
      top3Accurate: true,
      acceptedPrediction: false,
      unsafeAcceptedError: false,
      visionContractCompliant: false,
      qualityEligible: true,
      checks: { defectType: false }
    }
  ];

  const summary = summarizeVisionBenchmark(results, 3, {
    requiredDefectClasses: ['whitening'],
    minimumSamplesPerClass: 1,
    minimumClassAccuracy: 0,
    minimumConfidentRate: 0
  });

  assert.equal(summary.top1Accuracy, 33.3);
  assert.equal(summary.top3Accuracy, 100);
  assert.equal(summary.selectiveCoverage, 66.7);
  assert.equal(summary.selectiveAccuracy, 50);
  assert.equal(summary.unsafeErrorRate, 33.3);
  assert.equal(summary.reviewCaptureRate, 50);
  assert.equal(summary.visionContractComplianceRate, 66.7);
  assert.ok(summary.expectedCalibrationError > 30);
  assert.equal(summary.gateChecks.unsafeError, false);
  assert.equal(summary.gateChecks.calibration, false);
  assert.equal(summary.gateChecks.visionContract, false);
});

test('approved graph entities count as graph-grounded evidence', () => {
  const result = evaluateVisionResult(validCase, {
    httpOk: true,
    latencyMs: 1200,
    response: {
      observation: {
        defect_type: '백화',
        possible_causes: ['취출 저항']
      },
      answer: '구배를 확인하세요.',
      evidence: [{
        text: '승인된 원인 노드',
        review_status: 'approved',
        source_type: 'knowledge_entity',
        source_ref: 'entity-cause-1'
      }]
    }
  });

  assert.equal(result.graphGrounded, true);
    assert.equal(result.checks.graphEvidence, true);
});

test('taxonomy-equivalent defect aliases count as the same Vision class', () => {
  const result = evaluateVisionResult({
    ...validCase,
    expected: {
      ...validCase.expected,
      defectType: '취출/이형',
      defectClass: 'ejection'
    }
  }, {
    httpOk: true,
    latencyMs: 100,
    response: {
      observation: {
        defect_type: '이형 불량',
        possible_causes: ['취출 저항']
      },
      answer: '구배를 확인하세요.',
      graph_policy_applied: true,
      evidence: [{
        review_status: 'approved',
        source_type: 'knowledge_entity'
      }]
    }
  });

  assert.equal(result.expectedDefectClass, 'ejection');
  assert.equal(result.checks.defectType, true);
  assert.equal(result.passed, true);
});

test('duplicate approved images with conflicting labels are flagged for HITL review', () => {
  const conflicts = findDuplicateLabelConflicts([
    { id: 'case-a', contentHash: 'same-hash', expected: { defectType: '플래시' } },
    { id: 'case-b', contentHash: 'same-hash', expected: { defectType: '표면 결함' } },
    { id: 'case-c', contentHash: 'other-hash', expected: { defectType: '백화' } }
  ]);

  assert.equal(conflicts.length, 1);
  assert.deepEqual(conflicts[0].caseIds, ['case-a', 'case-b']);
    assert.deepEqual(conflicts[0].labels.sort(), ['표면 결함', '플래시'].sort());
});

test('same-label duplicate images are grouped so only one can remain runnable', () => {
  const groups = findDuplicateImageGroups([
    { id: 'case-a', contentHash: 'same-hash', expected: { defectType: '웰드라인' } },
    { id: 'case-b', contentHash: 'same-hash', expected: { defectType: '웰드라인' } },
    { id: 'case-c', contentHash: 'other-hash', expected: { defectType: '백화' } }
  ]);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].type, 'duplicate_image_same_label');
  assert.deepEqual(groups[0].caseIds, ['case-a', 'case-b']);
  assert.deepEqual(groups[0].labels, ['웰드라인']);
});

test('vision benchmark retirement gate requires 20 real, successful, classifiable cases', () => {
  const passingResult = {
    id: 'case',
    passed: true,
    httpOk: true,
    classifiable: true,
    graphGrounded: true,
    expectedDefectClass: 'whitening',
    visionConfidence: 0.9,
    latencyMs: 1000,
    checks: { defectType: true }
  };
  const defectClasses = [
    'whitening',
    'short_shot',
    'burn',
    'flash',
    'sink',
    'weld_line',
    'ejection'
  ];
  const passingCases = Array.from({ length: 20 }, (_, index) => ({
    ...passingResult,
    id: `case-${index}`,
    expectedDefectClass: defectClasses[index % defectClasses.length]
  }));
  const ready = summarizeVisionBenchmark(
    passingCases,
    20
  );
  const insufficient = summarizeVisionBenchmark(
    passingCases.slice(0, 19),
    20
  );

  assert.equal(ready.readyToDisableLegacyFallback, true);
  assert.equal(ready.classifiableRate, 100);
  assert.equal(ready.observedDefectClasses, 7);
  assert.equal(ready.coveredDefectClasses, 7);
  assert.equal(ready.confidentRate, 100);
  assert.equal(insufficient.readyToDisableLegacyFallback, false);
});

test('vision retirement gate rejects a high-scoring but single-class dataset', () => {
  const repeated = Array.from({ length: 20 }, (_, index) => ({
    id: `whitening-${index}`,
    passed: true,
    httpOk: true,
    classifiable: true,
    graphGrounded: true,
    expectedDefectClass: 'whitening',
    visionConfidence: 0.95,
    checks: { defectType: true }
  }));

  const summary = summarizeVisionBenchmark(repeated, 20);

  assert.equal(summary.passRate, 100);
  assert.equal(summary.observedDefectClasses, 1);
  assert.equal(summary.coveredDefectClasses, 1);
  assert.equal(summary.classCoverageReady, false);
  assert.equal(summary.readyToDisableLegacyFallback, false);
});

test('canonical defect classes group manufacturing aliases for coverage', () => {
  assert.equal(canonicalDefectClass('백화'), 'whitening');
  assert.equal(canonicalDefectClass('Short Shot'), 'short_shot');
  assert.equal(canonicalDefectClass('흑점 및 탄화'), 'burn');
  assert.equal(canonicalDefectClass('가스 탐/번 마크'), 'burn');
  assert.equal(canonicalDefectClass('번마크'), 'burn');
  assert.equal(canonicalDefectClass('밀핀 자국'), 'ejection');
});

test('non-defect and unclassifiable labels never become benchmark labels', () => {
  assert.equal(isClassifiable('판정 불가(성형 이미지 미제공)'), false);
  assert.equal(isClassifiable('분류 불가'), false);
  assert.equal(isClassifiable('-'), false);
  assert.equal(isClassifiable('백화'), true);
});

test('normal or no-defect observations never become benchmark labels', () => {
  assert.equal(isClassifiable('정상 형상'), false);
  assert.equal(isClassifiable('이상 없음'), false);
  assert.equal(isClassifiable('결함 없음(기능 형상)'), false);
  assert.equal(isClassifiable('결함 미확인'), false);
});

test('vision scoring keeps vision and retrieval confidence separate', () => {
  const result = evaluateVisionResult(validCase, {
    httpOk: true,
    response: {
      observation: {
        defect_type: validCase.expected.defectType,
        confidence: 0.93,
        possible_causes: ['취출 저항']
      },
      answer: '구배를 확인하세요.',
      confidence: 0.37,
      visionConfidence: 0.93,
      retrievalConfidence: 0.37,
      graph_policy_applied: true,
      evidence: [{
        review_status: 'approved',
        source_type: 'knowledge_entity'
      }]
    }
  });

  assert.equal(result.confidence, 0.93);
  assert.equal(result.visionConfidence, 0.93);
  assert.equal(result.retrievalConfidence, 0.37);
});

test('operational release input pairs baseline and candidate by case id with verified cohort metadata', () => {
  const baselineReport = {
    results: [
      {
        id: 'case-2',
        top1Accurate: false,
        top3Accurate: true,
        acceptedPrediction: false,
        visionConfidence: 0.4,
        latencyMs: 500
      },
      {
        id: 'case-1',
        top1Accurate: true,
        top3Accurate: true,
        acceptedPrediction: true,
        visionConfidence: 0.9,
        latencyMs: 450
      }
    ]
  };
  const candidateReport = {
    results: [
      {
        id: 'case-1',
        top1Accurate: true,
        top3Accurate: true,
        acceptedPrediction: true,
        visionConfidence: 0.95,
        latencyMs: 470
      },
      {
        id: 'case-3',
        top1Accurate: true,
        top3Accurate: true,
        acceptedPrediction: true,
        visionConfidence: 0.8,
        latencyMs: 490
      }
    ]
  };
  const config = {
    baselineVersion: {
      modelVersion: 'model-a',
      promptVersion: 'prompt-a',
      graphVersion: 'graph-a'
    },
    candidateVersion: {
      modelVersion: 'model-b',
      promptVersion: 'prompt-b',
      graphVersion: 'graph-b'
    },
    latencyTargetP95Ms: 1500,
    caseMetadata: {
      'case-1': {
        evaluatedAt: '2026-07-24T10:00:00.000Z',
        productFamily: 'GRILLE',
        moldId: 'M-1',
        cameraId: 'CAM-1',
        captureSessionId: 'SESSION-1',
        contentHash: 'HASH-1',
        expectedDefectClass: 'whitening',
        humanVerified: true
      }
    }
  };

  const built = buildShadowReleaseInput(baselineReport, candidateReport, config);

  assert.equal(built.gateInput.samples.length, 1);
  assert.equal(built.gateInput.samples[0].caseId, 'case-1');
  assert.equal(built.gateInput.samples[0].candidate.confidence, 0.95);
  assert.equal(built.gateInput.samples[0].productFamily, 'GRILLE');
  assert.deepEqual(built.diagnostics.baselineOnlyCaseIds, ['case-2']);
  assert.deepEqual(built.diagnostics.candidateOnlyCaseIds, ['case-3']);
  assert.deepEqual(built.diagnostics.missingMetadataCaseIds, []);
});
