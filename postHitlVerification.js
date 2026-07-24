const numeric = value => Number.isFinite(Number(value)) ? Number(value) : 0;

const assessPostHitlPreflight = gateStatus => {
  const commonAgent = gateStatus?.services?.commonAgent || {};
  const qaAgent = gateStatus?.services?.qaAgent || {};
  const dataset = gateStatus?.dataset || {};
  const approved = gateStatus?.approved || {};
  const hitl = gateStatus?.hitl || {};
  const gate = gateStatus?.gate || {};
  const requiredSamples = Math.max(1, numeric(gate.minimumSamples) || 20);
  const currentSamples = Math.max(0, numeric(approved.cleanRunnable));
  const additionalSamplesRequired = Math.max(0, requiredSamples - currentSamples);
  const conflictGroups = Math.max(0, numeric(approved.conflictGroups));
  const conflicts = Array.isArray(approved.conflicts) ? approved.conflicts : [];
  const unresolvedHighConfidence = Math.max(
    0,
    numeric(hitl.unresolvedHighConfidence)
  );
  const blockers = [];

  if (commonAgent.online !== true) {
    blockers.push({
      code: 'common_agent_offline',
      detail: String(commonAgent.error || commonAgent.url || '')
    });
  }
  if (qaAgent.online !== true) {
    blockers.push({
      code: 'qa_agent_offline',
      detail: String(qaAgent.error || qaAgent.url || '')
    });
  }
  if (dataset.error) {
    blockers.push({
      code: 'dataset_query_failed',
      detail: String(dataset.error)
    });
  }
  if (additionalSamplesRequired > 0) {
    blockers.push({
      code: 'approved_sample_count',
      current: currentSamples,
      required: requiredSamples,
      missing: additionalSamplesRequired
    });
  }
  if (conflictGroups > 0) {
    blockers.push({
      code: 'approved_label_conflicts',
      count: conflictGroups,
      conflicts
    });
  }
  if (unresolvedHighConfidence > 0) {
    blockers.push({
      code: 'human_review_required',
      count: unresolvedHighConfidence
    });
  }

  const readyForBenchmarks = blockers.length === 0;
  return {
    readyForBenchmarks,
    requiredSamples,
    currentSamples,
    additionalSamplesRequired,
    conflictGroups,
    conflicts,
    unresolvedHighConfidence,
    blockers,
    nextAction: readyForBenchmarks
      ? 'Run the approved Vision and Graph benchmarks, then rebuild the migration gate.'
      : 'Resolve every preflight blocker before running the expensive benchmarks.'
  };
};

const buildPostHitlVerificationReport = ({
  generatedAt = new Date().toISOString(),
  preflight,
  finalGate,
  visionReport,
  graphReport,
  steps = []
}) => {
  const safePreflight = preflight || {
    readyForBenchmarks: false,
    blockers: [{ code: 'preflight_missing' }]
  };
  if (!safePreflight.readyForBenchmarks) {
    return {
      schemaVersion: 1,
      generatedAt,
      status: 'waiting_for_human_hitl',
      readyToDisableLegacyFallback: false,
      benchmarksExecuted: false,
      serviceWritesPerformed: false,
      localArtifactsWritten: true,
      preflight: safePreflight,
      blockers: safePreflight.blockers || [],
      steps
    };
  }

  const visionReady = visionReport?.summary?.readyToDisableLegacyFallback === true;
  const graphReady = graphReport?.summary?.readyToRetireLegacyGraphRag === true;
  const migrationReady = finalGate?.gate?.canDisableLegacyFallback === true;
  const blockers = [];
  if (!visionReady) {
    blockers.push({
      code: 'vision_benchmark_failed',
      failedChecks: visionReport?.summary?.failedGateChecks || []
    });
  }
  if (!graphReady) {
    blockers.push({
      code: 'graph_benchmark_failed',
      passed: numeric(graphReport?.summary?.passed),
      total: numeric(graphReport?.summary?.total)
    });
  }
  if (!migrationReady) {
    blockers.push({
      code: 'migration_gate_failed',
      details: finalGate?.blockers || []
    });
  }
  const readyToDisableLegacyFallback = blockers.length === 0;

  return {
    schemaVersion: 1,
    generatedAt,
    status: readyToDisableLegacyFallback ? 'passed' : 'failed',
    readyToDisableLegacyFallback,
    benchmarksExecuted: true,
    serviceWritesPerformed: false,
    localArtifactsWritten: true,
    preflight: safePreflight,
    vision: visionReport?.summary || null,
    graph: graphReport?.summary || null,
    finalGate: finalGate || null,
    blockers,
    steps
  };
};

module.exports = {
  assessPostHitlPreflight,
  buildPostHitlVerificationReport
};
