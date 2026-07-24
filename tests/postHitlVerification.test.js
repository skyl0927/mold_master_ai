const assert = require('node:assert/strict');
const test = require('node:test');
const {
  assessPostHitlPreflight,
  buildPostHitlVerificationReport
} = require('../postHitlVerification');

const readyGate = overrides => ({
  services: {
    commonAgent: { online: true, url: 'http://127.0.0.1:8000' },
    qaAgent: { online: true, url: 'http://127.0.0.1:8103' }
  },
  dataset: {
    total: 20,
    reviewStatuses: { approved: 20 }
  },
  approved: {
    cleanRunnable: 20,
    conflictGroups: 0
  },
  hitl: {
    unresolvedHighConfidence: 0
  },
  gate: {
    minimumSamples: 20,
    additionalCleanApprovalsRequired: 0,
    failedChecks: ['sampleCount', 'classCoverage'],
    canDisableLegacyFallback: false
  },
  ...overrides
});

test('preflight blocks expensive benchmarks until human and sample gates are complete', () => {
  const assessment = assessPostHitlPreflight(readyGate({
    services: {
      commonAgent: { online: false, error: 'offline' },
      qaAgent: { online: true }
    },
    approved: {
      cleanRunnable: 8,
      conflictGroups: 1,
      conflicts: [{
        contentHash: 'f'.repeat(64),
        caseIds: ['approved-image-a', 'approved-image-b'],
        labels: ['표면 결함', '플래시']
      }]
    },
    hitl: {
      unresolvedHighConfidence: 12
    }
  }));

  assert.equal(assessment.readyForBenchmarks, false);
  assert.deepEqual(
    assessment.blockers.map(item => item.code),
    [
      'common_agent_offline',
      'approved_sample_count',
      'approved_label_conflicts',
      'human_review_required'
    ]
  );
  assert.equal(assessment.requiredSamples, 20);
  assert.equal(assessment.currentSamples, 8);
  assert.equal(assessment.additionalSamplesRequired, 12);
  assert.deepEqual(assessment.conflicts, [{
    contentHash: 'f'.repeat(64),
    caseIds: ['approved-image-a', 'approved-image-b'],
    labels: ['표면 결함', '플래시']
  }]);
});

test('preflight ignores stale benchmark failures after approved fixtures are synchronized', () => {
  const assessment = assessPostHitlPreflight(readyGate());

  assert.equal(assessment.readyForBenchmarks, true);
  assert.deepEqual(assessment.blockers, []);
  assert.match(assessment.nextAction, /Vision and Graph benchmarks/);
});

test('dataset query errors and QA outages block benchmark execution', () => {
  const gate = readyGate();
  gate.services.qaAgent = { online: false, error: 'qa timeout' };
  gate.dataset.error = 'dataset timeout';

  const assessment = assessPostHitlPreflight(gate);

  assert.equal(assessment.readyForBenchmarks, false);
  assert.deepEqual(
    assessment.blockers.map(item => item.code),
    ['qa_agent_offline', 'dataset_query_failed']
  );
});

test('final report requires both migration and approved Graph gates', () => {
  const passing = buildPostHitlVerificationReport({
    generatedAt: '2026-07-24T10:00:00.000Z',
    preflight: assessPostHitlPreflight(readyGate()),
    finalGate: readyGate({
      gate: {
        minimumSamples: 20,
        additionalCleanApprovalsRequired: 0,
        failedChecks: [],
        canDisableLegacyFallback: true
      }
    }),
    visionReport: {
      summary: {
        total: 20,
        readyToDisableLegacyFallback: true
      }
    },
    graphReport: {
      summary: {
        total: 20,
        passed: 20,
        readyToRetireLegacyGraphRag: true
      }
    },
    steps: [{ name: 'vision_benchmark', exitCode: 0 }]
  });
  assert.equal(passing.status, 'passed');
  assert.equal(passing.readyToDisableLegacyFallback, true);
  assert.equal(passing.serviceWritesPerformed, false);

  const failingGraph = buildPostHitlVerificationReport({
    ...passing,
    preflight: passing.preflight,
    finalGate: passing.finalGate,
    visionReport: passing.visionReport,
    graphReport: {
      summary: {
        total: 20,
        passed: 19,
        readyToRetireLegacyGraphRag: false
      }
    }
  });
  assert.equal(failingGraph.status, 'failed');
  assert.equal(failingGraph.readyToDisableLegacyFallback, false);
  assert.ok(failingGraph.blockers.some(item => item.code === 'graph_benchmark_failed'));
});

test('waiting report preserves blockers and does not claim benchmark completion', () => {
  const preflight = assessPostHitlPreflight(readyGate({
    approved: {
      cleanRunnable: 8,
      conflictGroups: 0
    },
    hitl: {
      unresolvedHighConfidence: 12
    }
  }));
  const report = buildPostHitlVerificationReport({
    generatedAt: '2026-07-24T10:00:00.000Z',
    preflight,
    steps: [{ name: 'sync_approved_fixtures', exitCode: 0 }]
  });

  assert.equal(report.status, 'waiting_for_human_hitl');
  assert.equal(report.readyToDisableLegacyFallback, false);
  assert.equal(report.benchmarksExecuted, false);
  assert.deepEqual(report.blockers, preflight.blockers);
});
