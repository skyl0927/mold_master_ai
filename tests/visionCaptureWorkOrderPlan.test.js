const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildVisionCaptureWorkOrderPlan
} = require('../visionCaptureWorkOrderPlan');

const benchmarkReport = () => ({
  generatedAt: '2026-07-28T04:00:00.000Z',
  summary: {
    total: 5,
    top1Accuracy: 40,
    top3Accuracy: 60,
    minimumTop3Accuracy: 90,
    captureProtocolReadyRate: 0,
    minimumCaptureProtocolReadyRate: 80,
    minimumSamplesPerClass: 2,
    minimumClassAccuracy: 50,
    missingCaptureViews: [
      { view: 'full_part_context', count: 5 },
      { view: 'defect_closeup', count: 5 },
      { view: 'oblique_light', count: 2 },
      { view: 'reverse_geometry', count: 1 },
      { view: 'fill_end_context', count: 1 }
    ],
    perClass: [
      { defectClass: 'whitening', total: 2, accuracy: 100, top3Accuracy: 100, requiredSamples: 2, covered: true },
      { defectClass: 'burn', total: 0, accuracy: 0, top3Accuracy: 0, requiredSamples: 2, covered: false },
      { defectClass: 'sink', total: 1, accuracy: 0, top3Accuracy: 0, requiredSamples: 2, covered: false },
      { defectClass: 'flash', total: 2, accuracy: 50, top3Accuracy: 50, requiredSamples: 2, covered: true }
    ],
    failedGateChecks: ['captureProtocol', 'classCoverage', 'classAccuracy', 'top3Accuracy']
  },
  results: [
    {
      id: 'sink-001',
      expectedDefectClass: 'sink',
      actualDefectClass: 'burn',
      top1Accurate: false,
      top3Accurate: false,
      captureProtocol: {
        ready: false,
        missingViews: ['full_part_context', 'defect_closeup', 'oblique_light', 'reverse_geometry']
      }
    },
    {
      id: 'flash-001',
      expectedDefectClass: 'flash',
      actualDefectClass: 'weld_line',
      top1Accurate: false,
      top3Accurate: false,
      captureProtocol: {
        ready: false,
        missingViews: ['full_part_context', 'defect_closeup', 'parting_line_context']
      }
    },
    {
      id: 'white-001',
      expectedDefectClass: 'whitening',
      actualDefectClass: 'whitening',
      top1Accurate: true,
      top3Accurate: true,
      captureProtocol: {
        ready: false,
        missingViews: ['full_part_context', 'defect_closeup', 'oblique_light']
      }
    }
  ]
});

test('fails closed when benchmark evidence is missing', () => {
  const plan = buildVisionCaptureWorkOrderPlan({});

  assert.equal(plan.contractVersion, 'vision-capture-work-order-plan/v1');
  assert.equal(plan.status, 'missing_evidence');
  assert.equal(plan.serviceWritesPerformed, false);
  assert.equal(plan.policy.allowGraphPromotion, false);
  assert.deepEqual(plan.workOrders, []);
  assert.deepEqual(plan.nextCommands, [
    'npm run eval:vision:approved',
    'npm run vision:capture:work-orders'
  ]);
});

test('turns weak benchmark evidence into prioritized defect-class capture work orders', () => {
  const plan = buildVisionCaptureWorkOrderPlan({
    generatedAt: '2026-07-28T04:05:00.000Z',
    benchmarkReport: benchmarkReport()
  });

  assert.equal(plan.status, 'capture_required');
  assert.equal(plan.summary.totalWorkOrders, 4);
  assert.equal(plan.summary.captureProtocolReadyRate, 0);
  assert.equal(plan.summary.topPriorityDefectClass, 'burn');
  assert.equal(plan.summary.totalMissingApprovedSamples, 3);
  assert.deepEqual(plan.summary.coreMissingViews, [
    { view: 'defect_closeup', count: 5 },
    { view: 'full_part_context', count: 5 }
  ]);

  const burn = plan.workOrders[0];
  assert.equal(burn.defectClass, 'burn');
  assert.equal(burn.actionType, 'capture_new_multiview_samples');
  assert.equal(burn.missingApprovedSamples, 2);
  assert.deepEqual(burn.requiredViews, [
    'full_part_context',
    'defect_closeup',
    'fill_end_context',
    'vent_context'
  ]);
  assert.ok(burn.captureInstructions.every(item => item.view && item.label && item.instruction));

  const sink = plan.workOrders.find(order => order.defectClass === 'sink');
  assert.equal(sink.actionType, 'capture_new_and_recapture_existing_samples');
  assert.equal(sink.missingApprovedSamples, 1);
  assert.deepEqual(sink.recaptureSampleIds, ['sink-001']);
  assert.deepEqual(sink.missingViews.map(item => item.view), [
    'defect_closeup',
    'full_part_context',
    'oblique_light',
    'reverse_geometry'
  ]);
});

test('creates recapture-only work orders for covered classes with poor protocol evidence', () => {
  const report = benchmarkReport();
  report.summary.perClass = [
    { defectClass: 'whitening', total: 2, accuracy: 100, top3Accuracy: 100, requiredSamples: 2, covered: true }
  ];
  report.results = [
    {
      id: 'white-001',
      expectedDefectClass: 'whitening',
      actualDefectClass: 'whitening',
      top1Accurate: true,
      top3Accurate: true,
      captureProtocol: {
        ready: false,
        missingViews: ['full_part_context', 'defect_closeup', 'oblique_light']
      }
    }
  ];

  const plan = buildVisionCaptureWorkOrderPlan({ benchmarkReport: report });
  const order = plan.workOrders[0];

  assert.equal(order.defectClass, 'whitening');
  assert.equal(order.actionType, 'recapture_missing_views');
  assert.equal(order.missingApprovedSamples, 0);
  assert.deepEqual(order.recaptureSampleIds, ['white-001']);
});

test('passes to shadow validation when sample, accuracy, and capture protocol gates are satisfied', () => {
  const report = benchmarkReport();
  report.summary = {
    ...report.summary,
    top1Accuracy: 92,
    top3Accuracy: 96,
    captureProtocolReadyRate: 95,
    missingCaptureViews: [],
    failedGateChecks: [],
    perClass: [
      { defectClass: 'whitening', total: 3, accuracy: 100, top3Accuracy: 100, requiredSamples: 2, covered: true },
      { defectClass: 'burn', total: 3, accuracy: 90, top3Accuracy: 100, requiredSamples: 2, covered: true }
    ]
  };
  report.results = [];

  const plan = buildVisionCaptureWorkOrderPlan({ benchmarkReport: report });

  assert.equal(plan.status, 'ready_for_shadow_validation');
  assert.equal(plan.summary.totalWorkOrders, 0);
  assert.deepEqual(plan.workOrders, []);
  assert.deepEqual(plan.nextCommands, [
    'npm run eval:vision:release'
  ]);
});
