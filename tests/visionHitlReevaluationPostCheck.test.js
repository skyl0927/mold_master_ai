const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildVisionHitlReevaluationPostCheck
} = require('../visionHitlReevaluationPostCheck');

const plan = {
  schemaVersion: 1,
  generatedAt: '2026-07-27T08:00:00.000Z',
  status: 'ready_for_recheck',
  serviceWritesPerformed: false,
  items: [
    {
      imageId: 'image-pass-1',
      status: 'ready_for_shadow_recheck',
      defectType: '백화',
      defectClass: 'whitening',
      contentSha256: 'a'.repeat(64),
      benchmarkCaseCandidate: {
        id: 'hitl-recheck-image-pass-1',
        commonAgentImageId: 'image-pass-1',
        expected: {
          defectType: '백화',
          defectClass: 'whitening'
        }
      }
    },
    {
      imageId: 'image-unsafe-1',
      status: 'ready_for_shadow_recheck',
      defectType: '플래시',
      defectClass: 'flash',
      contentSha256: 'b'.repeat(64),
      benchmarkCaseCandidate: {
        id: 'hitl-recheck-image-unsafe-1',
        commonAgentImageId: 'image-unsafe-1',
        expected: {
          defectType: '플래시',
          defectClass: 'flash'
        }
      }
    },
    {
      imageId: 'image-recapture-1',
      status: 'ready_for_shadow_recheck',
      defectType: '밀핀 자국',
      defectClass: 'ejection',
      contentSha256: 'c'.repeat(64),
      benchmarkCaseCandidate: {
        id: 'hitl-recheck-image-recapture-1',
        commonAgentImageId: 'image-recapture-1',
        expected: {
          defectType: '밀핀 자국',
          defectClass: 'ejection'
        }
      }
    },
    {
      imageId: 'image-missing-1',
      status: 'ready_for_shadow_recheck',
      defectType: '웰드라인',
      defectClass: 'weld_line',
      contentSha256: 'd'.repeat(64),
      benchmarkCaseCandidate: {
        id: 'hitl-recheck-image-missing-1',
        commonAgentImageId: 'image-missing-1',
        expected: {
          defectType: '웰드라인',
          defectClass: 'weld_line'
        }
      }
    }
  ]
};

const benchmarkReport = {
  generatedAt: '2026-07-27T09:00:00.000Z',
  mode: 'live',
  manifestPath: 'eval/vision-hitl-recheck/manifest.json',
  summary: {
    total: 3,
    top1Accuracy: 33.3,
    top3Accuracy: 66.7,
    unsafeAcceptedErrors: 1
  },
  results: [
    {
      id: 'hitl-recheck-image-pass-1',
      httpOk: true,
      top1Accurate: true,
      top3Accurate: true,
      acceptedPrediction: true,
      unsafeAcceptedError: false,
      qualityStatus: 'pass',
      qualityEligible: true,
      visionContractCompliant: true,
      captureProtocol: { ready: true },
      actualDefectType: '백화',
      actualDefectClass: 'whitening',
      visionConfidence: 0.84
    },
    {
      id: 'hitl-recheck-image-unsafe-1',
      httpOk: true,
      top1Accurate: false,
      top3Accurate: false,
      acceptedPrediction: true,
      unsafeAcceptedError: true,
      qualityStatus: 'pass',
      qualityEligible: true,
      visionContractCompliant: true,
      captureProtocol: { ready: true },
      actualDefectType: '수축',
      actualDefectClass: 'sink',
      visionConfidence: 0.91
    },
    {
      id: 'hitl-recheck-image-recapture-1',
      httpOk: true,
      top1Accurate: true,
      top3Accurate: true,
      acceptedPrediction: true,
      unsafeAcceptedError: false,
      qualityStatus: 'reject',
      qualityEligible: false,
      visionContractCompliant: true,
      captureProtocol: {
        ready: false,
        missingViews: ['defect_closeup']
      },
      actualDefectType: '밀핀 자국',
      actualDefectClass: 'ejection',
      visionConfidence: 0.76
    }
  ]
};

test('post-check promotes only clean HITL recheck passes to human approval candidates', () => {
  const report = buildVisionHitlReevaluationPostCheck({
    plan,
    benchmarkReport,
    generatedAt: '2026-07-27T10:00:00.000Z'
  });

  assert.equal(report.schemaVersion, 1);
  assert.equal(report.status, 'action_required');
  assert.equal(report.serviceWritesPerformed, false);
  assert.equal(report.readyForReferenceRefresh, false);
  assert.equal(report.summary.readyForHumanApproval, 1);
  assert.equal(report.summary.needsHitlReview, 1);
  assert.equal(report.summary.needsRecapture, 1);
  assert.equal(report.summary.missingBenchmarkResults, 1);
  assert.equal(report.summary.unsafeAcceptedErrors, 1);

  const passed = report.items.find(item => item.imageId === 'image-pass-1');
  assert.equal(passed.status, 'passed_shadow_recheck');
  assert.equal(passed.serviceWriteAllowed, false);
  assert.equal(passed.humanApprovalCandidate.decision, 'approve');
  assert.equal(passed.humanApprovalCandidate.promote_to_graph, false);
  assert.equal(passed.humanApprovalCandidate.metadata.hitl_recheck_verified, true);
  assert.equal(passed.humanApprovalCandidate.metadata.fine_tuning_auto_start_allowed, false);
});

test('post-check routes unsafe, quality rejected, and missing benchmark rows away from learning', () => {
  const report = buildVisionHitlReevaluationPostCheck({
    plan,
    benchmarkReport,
    generatedAt: '2026-07-27T10:00:00.000Z'
  });

  const unsafe = report.items.find(item => item.imageId === 'image-unsafe-1');
  const recapture = report.items.find(item => item.imageId === 'image-recapture-1');
  const missing = report.items.find(item => item.imageId === 'image-missing-1');

  assert.equal(unsafe.status, 'unsafe_recheck_failed');
  assert.ok(unsafe.reasons.includes('unsafe_accepted_error'));
  assert.ok(unsafe.reasons.includes('top1_mismatch'));
  assert.equal(unsafe.humanApprovalCandidate, null);

  assert.equal(recapture.status, 'needs_recapture');
  assert.ok(recapture.reasons.includes('image_quality_rejected'));
  assert.ok(recapture.reasons.includes('capture_protocol_not_ready'));
  assert.deepEqual(recapture.missingCaptureViews, ['defect_closeup']);
  assert.equal(recapture.humanApprovalCandidate, null);

  assert.equal(missing.status, 'missing_benchmark_result');
  assert.deepEqual(missing.reasons, ['missing_benchmark_result']);
  assert.equal(missing.humanApprovalCandidate, null);
});

test('post-check is ready only when every recheck candidate cleanly passes', () => {
  const cleanPlan = {
    ...plan,
    items: [plan.items[0]]
  };
  const cleanBenchmark = {
    ...benchmarkReport,
    summary: {
      total: 1,
      top1Accuracy: 100,
      top3Accuracy: 100,
      unsafeAcceptedErrors: 0
    },
    results: [benchmarkReport.results[0]]
  };
  const report = buildVisionHitlReevaluationPostCheck({
    plan: cleanPlan,
    benchmarkReport: cleanBenchmark,
    generatedAt: '2026-07-27T10:00:00.000Z'
  });

  assert.equal(report.status, 'ready_for_human_approval');
  assert.equal(report.readyForReferenceRefresh, false);
  assert.equal(report.summary.readyForHumanApproval, 1);
  assert.equal(report.blockers.length, 0);
  assert.match(report.recommendedAction, /Human reviewer/);
});
