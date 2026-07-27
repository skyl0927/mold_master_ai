const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildVisionAccuracyImprovementPlan
} = require('../visionAccuracyImprovementPlan');

const benchmarkReport = () => ({
  schemaVersion: 1,
  generatedAt: '2026-07-27T12:30:00.000Z',
  summary: {
    total: 13,
    minimumSamples: 20,
    top1Accuracy: 46.2,
    top3Accuracy: 53.8,
    minimumTop3Accuracy: 90,
    classifiableRate: 61.5,
    confidentRate: 30.8,
    graphGroundedRate: 92.3,
    captureProtocolReadyRate: 0,
    minimumCaptureProtocolReadyRate: 80,
    missingCaptureViews: [
      { view: 'defect_closeup', count: 13 },
      { view: 'full_part_context', count: 13 },
      { view: 'oblique_light', count: 5 }
    ],
    perClass: [
      { defectClass: 'whitening', total: 2, accuracy: 100, top3Accuracy: 100, requiredSamples: 2, covered: true },
      { defectClass: 'short_shot', total: 2, accuracy: 50, top3Accuracy: 50, requiredSamples: 2, covered: true },
      { defectClass: 'burn', total: 0, accuracy: 0, top3Accuracy: 0, requiredSamples: 2, covered: false },
      { defectClass: 'flash', total: 2, accuracy: 50, top3Accuracy: 50, requiredSamples: 2, covered: true },
      { defectClass: 'sink', total: 1, accuracy: 0, top3Accuracy: 0, requiredSamples: 2, covered: false },
      { defectClass: 'weld_line', total: 2, accuracy: 50, top3Accuracy: 50, requiredSamples: 2, covered: true },
      { defectClass: 'ejection', total: 1, accuracy: 0, top3Accuracy: 0, requiredSamples: 2, covered: false }
    ],
    failedGateChecks: [
      'sampleCount',
      'classifiable',
      'defectAccuracy',
      'classCoverage',
      'classAccuracy',
      'visionConfidence',
      'top3Accuracy',
      'captureProtocol'
    ],
    gateChecks: {
      graphGrounding: true,
      unsafeError: true,
      calibration: true
    }
  },
  results: [
    {
      id: 'approved-image-weld',
      expectedDefectClass: 'weld_line',
      actualDefectClass: 'unclassified',
      top1Accurate: false,
      top3Accurate: false,
      classifiable: false,
      confidence: 0,
      captureProtocol: {
        ready: false,
        missingViews: ['full_part_context', 'defect_closeup', 'flow_convergence_context']
      },
      requiredAdditionalViews: ['적색 표시 없는 원본 이미지', '사광 조명 이미지']
    },
    {
      id: 'approved-image-sink',
      expectedDefectClass: 'sink',
      actualDefectClass: 'burn',
      actualDefectType: '흑점/탄화',
      top1Accurate: false,
      top3Accurate: false,
      classifiable: true,
      confidence: 0.46,
      captureProtocol: {
        ready: false,
        missingViews: ['full_part_context', 'defect_closeup', 'oblique_light', 'reverse_geometry']
      }
    },
    {
      id: 'approved-image-white',
      expectedDefectClass: 'whitening',
      actualDefectClass: 'whitening',
      top1Accurate: true,
      top3Accurate: true,
      classifiable: true,
      confidence: 0.72,
      captureProtocol: {
        ready: false,
        missingViews: ['full_part_context', 'defect_closeup']
      }
    }
  ]
});

test('builds a no-write improvement plan from weak Vision benchmark evidence', () => {
  const plan = buildVisionAccuracyImprovementPlan({
    generatedAt: '2026-07-27T12:40:00.000Z',
    benchmarkReport: benchmarkReport(),
    referenceRepairGuide: {
      contractVersion: 'vision-reference-repair-guide/v1',
      status: 'action_required',
      summary: {
        refreshAllowedNow: false,
        labelConflicts: 4,
        pendingHitlReviews: 12,
        approvedSampleMissing: 8,
        needsHitlBackfill: 19
      }
    }
  });

  assert.equal(plan.contractVersion, 'vision-accuracy-improvement-plan/v1');
  assert.equal(plan.status, 'action_required');
  assert.equal(plan.serviceWritesPerformed, false);
  assert.equal(plan.policy.allowGraphPromotion, false);
  assert.equal(plan.policy.allowReferenceLearning, false);
  assert.equal(plan.summary.totalCases, 13);
  assert.equal(plan.summary.top1Accuracy, 46.2);
  assert.equal(plan.summary.top3Accuracy, 53.8);
  assert.equal(plan.summary.captureProtocolReadyRate, 0);
  assert.equal(plan.summary.referenceRefreshAllowedNow, false);
  assert.deepEqual(plan.summary.coreMissingViews, [
    { view: 'defect_closeup', count: 13 },
    { view: 'full_part_context', count: 13 }
  ]);
  assert.deepEqual(plan.summary.undercoveredDefectClasses, ['burn', 'sink', 'ejection']);
  assert.deepEqual(plan.summary.zeroAccuracyDefectClasses, ['sink', 'ejection']);
  assert.deepEqual(plan.improvementTracks.map(track => track.code), [
    'repair_capture_protocol',
    'expand_balanced_class_coverage',
    'build_confusion_and_hard_negative_set',
    'calibrate_abstention_without_lowering_safety',
    'hold_reference_learning_until_hitl_closed'
  ]);
  assert.equal(plan.improvementTracks[0].priority, 100);
  assert.deepEqual(plan.improvementTracks[0].targetViews, ['defect_closeup', 'full_part_context', 'oblique_light']);
  assert.deepEqual(plan.improvementTracks[2].confusionPairs, [{
    expectedDefectClass: 'sink',
    actualDefectClass: 'burn',
    count: 1,
    sampleIds: ['approved-image-sink']
  }]);
  assert.match(plan.recommendedAction, /촬영 프로토콜/);
});

test('passes when benchmark gates are strong and reference refresh is allowed', () => {
  const strong = benchmarkReport();
  strong.summary = {
    ...strong.summary,
    total: 24,
    top1Accuracy: 91.7,
    top3Accuracy: 95.8,
    classifiableRate: 100,
    confidentRate: 91.7,
    captureProtocolReadyRate: 91.7,
    failedGateChecks: [],
    missingCaptureViews: [],
    perClass: strong.summary.perClass.map(item => ({
      ...item,
      total: 3,
      accuracy: 90,
      top3Accuracy: 100,
      covered: true
    }))
  };
  strong.results = [];

  const plan = buildVisionAccuracyImprovementPlan({
    benchmarkReport: strong,
    referenceRepairGuide: {
      contractVersion: 'vision-reference-repair-guide/v1',
      status: 'ready_for_refresh',
      summary: { refreshAllowedNow: true }
    }
  });

  assert.equal(plan.status, 'ready_for_shadow_validation');
  assert.equal(plan.summary.referenceRefreshAllowedNow, true);
  assert.deepEqual(plan.improvementTracks.map(track => track.code), [
    'run_shadow_validation'
  ]);
  assert.match(plan.recommendedAction, /shadow validation/);
});

test('fails closed when benchmark evidence is missing', () => {
  const plan = buildVisionAccuracyImprovementPlan({});

  assert.equal(plan.status, 'missing_evidence');
  assert.equal(plan.summary.missingArtifacts, 1);
  assert.equal(plan.improvementTracks[0].code, 'generate_vision_benchmark');
  assert.deepEqual(plan.improvementTracks[0].commands, [
    'npm run eval:vision:approved',
    'npm run vision:accuracy:improvement-plan'
  ]);
  assert.match(plan.recommendedAction, /eval:vision:approved/);
});
