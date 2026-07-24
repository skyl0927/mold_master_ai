const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
  assessPostHitlPreflight,
  buildPostHitlVerificationReport
} = require('../postHitlVerification');

const root = path.resolve(__dirname, '..');
const artifactRoot = path.join(root, 'artifacts');
const approvedFixtureRoot = path.join(root, 'eval', 'vision-approved');
const approvedManifestPath = path.join(approvedFixtureRoot, 'manifest.json');
const preflightGatePath = path.join(
  artifactRoot,
  'post-hitl-preflight-gate-status.json'
);
const visionReportPath = path.join(
  artifactRoot,
  'multimodal-vision-benchmark-report.json'
);
const graphReportPath = path.join(
  artifactRoot,
  'approved-graph-benchmark-report.json'
);
const finalGatePath = path.join(
  artifactRoot,
  'post-hitl-final-gate-status.json'
);
const outputPath = path.resolve(
  process.env.POST_HITL_VERIFICATION_OUTPUT
  || path.join(artifactRoot, 'post-hitl-verification-report.json')
);

const readJson = filePath => JSON.parse(fs.readFileSync(filePath, 'utf8'));
const compactOutput = value => String(value || '').trim().slice(-8000);

const runNodeStep = (name, scriptPath, args = [], extraEnv = {}) => {
  const result = spawnSync(
    process.execPath,
    [path.join(root, scriptPath), ...args],
    {
      cwd: root,
      env: {
        ...process.env,
        ...extraEnv
      },
      encoding: 'utf8',
      timeout: 30 * 60 * 1000
    }
  );
  return {
    name,
    exitCode: Number.isInteger(result.status) ? result.status : 1,
    signal: result.signal || null,
    error: result.error ? String(result.error.message || result.error) : null,
    stdout: compactOutput(result.stdout),
    stderr: compactOutput(result.stderr)
  };
};

const writeReport = report => {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
};

const run = () => {
  fs.mkdirSync(artifactRoot, { recursive: true });
  const steps = [];
  steps.push(runNodeStep(
    'sync_approved_fixtures',
    'scripts/sync-approved-vision-fixtures.js',
    [approvedFixtureRoot]
  ));
  if (
    steps.at(-1).exitCode !== 0
    || !fs.existsSync(approvedManifestPath)
  ) {
    const report = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      status: 'failed',
      readyToDisableLegacyFallback: false,
      benchmarksExecuted: false,
      serviceWritesPerformed: false,
      localArtifactsWritten: true,
      blockers: [{ code: 'approved_fixture_sync_failed' }],
      steps
    };
    writeReport(report);
    console.log(JSON.stringify({ outputPath, ...report }, null, 2));
    process.exitCode = 1;
    return;
  }

  steps.push(runNodeStep(
    'preflight_gate',
    'scripts/build-migration-gate-status.js',
    [],
    { MIGRATION_GATE_STATUS_OUTPUT: preflightGatePath }
  ));
  if (
    steps.at(-1).exitCode !== 0
    || !fs.existsSync(preflightGatePath)
  ) {
    const report = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      status: 'failed',
      readyToDisableLegacyFallback: false,
      benchmarksExecuted: false,
      serviceWritesPerformed: false,
      localArtifactsWritten: true,
      blockers: [{ code: 'preflight_gate_failed' }],
      steps
    };
    writeReport(report);
    console.log(JSON.stringify({ outputPath, ...report }, null, 2));
    process.exitCode = 1;
    return;
  }

  const preflightGate = readJson(preflightGatePath);
  const preflight = assessPostHitlPreflight(preflightGate);
  if (!preflight.readyForBenchmarks) {
    const report = {
      ...buildPostHitlVerificationReport({
        generatedAt: new Date().toISOString(),
        preflight,
        steps
      }),
      sources: {
        approvedManifest: approvedManifestPath,
        preflightGate: preflightGatePath
      }
    };
    writeReport(report);
    console.log(JSON.stringify({
      outputPath,
      status: report.status,
      preflight: report.preflight,
      benchmarksExecuted: report.benchmarksExecuted,
      serviceWritesPerformed: report.serviceWritesPerformed
    }, null, 2));
    return;
  }

  steps.push(runNodeStep(
    'vision_benchmark',
    'scripts/run-multimodal-vision-benchmark.js',
    ['--manifest', approvedManifestPath, '--output', visionReportPath]
  ));
  steps.push(runNodeStep(
    'graph_benchmark',
    'scripts/run-approved-graph-benchmark.js'
  ));
  steps.push(runNodeStep(
    'final_gate',
    'scripts/build-migration-gate-status.js',
    [],
    { MIGRATION_GATE_STATUS_OUTPUT: finalGatePath }
  ));

  const report = {
    ...buildPostHitlVerificationReport({
      generatedAt: new Date().toISOString(),
      preflight,
      finalGate: fs.existsSync(finalGatePath) ? readJson(finalGatePath) : null,
      visionReport: fs.existsSync(visionReportPath) ? readJson(visionReportPath) : null,
      graphReport: fs.existsSync(graphReportPath) ? readJson(graphReportPath) : null,
      steps
    }),
    sources: {
      approvedManifest: approvedManifestPath,
      preflightGate: preflightGatePath,
      visionReport: visionReportPath,
      graphReport: graphReportPath,
      finalGate: finalGatePath
    }
  };
  writeReport(report);
  console.log(JSON.stringify({
    outputPath,
    status: report.status,
    readyToDisableLegacyFallback: report.readyToDisableLegacyFallback,
    blockers: report.blockers,
    benchmarksExecuted: report.benchmarksExecuted,
    serviceWritesPerformed: report.serviceWritesPerformed
  }, null, 2));
  if (!report.readyToDisableLegacyFallback) process.exitCode = 1;
};

try {
  run();
} catch (error) {
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    status: 'failed',
    readyToDisableLegacyFallback: false,
    benchmarksExecuted: false,
    serviceWritesPerformed: false,
    localArtifactsWritten: true,
    blockers: [{
      code: 'orchestrator_error',
      detail: error instanceof Error ? error.message : String(error)
    }]
  };
  writeReport(report);
  console.error(error);
  process.exitCode = 1;
}
