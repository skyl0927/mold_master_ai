const fs = require('node:fs');
const path = require('node:path');
const {
  buildVisionHitlReevaluationPostCheck
} = require('../visionHitlReevaluationPostCheck');

const root = path.resolve(__dirname, '..');
const artifactRoot = path.join(root, 'artifacts');

const args = process.argv.slice(2);
const valueAfter = flag => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};

const timestamp = () => new Date().toISOString().replace(/[:.]/g, '-');

const planPath = path.resolve(
  valueAfter('--plan')
  || process.env.VISION_HITL_REEVALUATION_PLAN
  || path.join(artifactRoot, 'vision-hitl-reevaluation-plan.json')
);

const benchmarkPath = path.resolve(
  valueAfter('--benchmark')
  || process.env.VISION_HITL_REEVALUATION_BENCHMARK
  || path.join(artifactRoot, 'vision-hitl-recheck-benchmark-report.json')
);

const outputPath = path.resolve(
  valueAfter('--output')
  || process.env.VISION_HITL_REEVALUATION_POST_CHECK_OUTPUT
  || path.join(artifactRoot, `vision-hitl-reevaluation-post-check-${timestamp()}.json`)
);

const readJson = filePath => JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));

const writeJson = (filePath, payload) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
};

const run = () => {
  if (!fs.existsSync(planPath)) {
    throw new Error(`Vision HITL re-evaluation plan was not found: ${planPath}`);
  }
  if (!fs.existsSync(benchmarkPath)) {
    throw new Error(`Vision HITL recheck benchmark report was not found: ${benchmarkPath}`);
  }

  const report = buildVisionHitlReevaluationPostCheck({
    plan: readJson(planPath),
    benchmarkReport: readJson(benchmarkPath)
  });
  writeJson(outputPath, {
    ...report,
    sources: {
      plan: planPath,
      benchmarkReport: benchmarkPath
    }
  });

  console.log(JSON.stringify({
    outputPath,
    status: report.status,
    readyForReferenceRefresh: report.readyForReferenceRefresh,
    serviceWritesPerformed: report.serviceWritesPerformed,
    summary: report.summary,
    blockers: report.blockers,
    recommendedAction: report.recommendedAction
  }, null, 2));

  if (report.status !== 'ready_for_human_approval') {
    process.exitCode = 1;
  }
};

try {
  run();
} catch (error) {
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    status: 'failed',
    serviceWritesPerformed: false,
    readyForReferenceRefresh: false,
    summary: {
      totalRecheckCandidates: 0,
      evaluatedBenchmarkResults: 0,
      readyForHumanApproval: 0,
      needsHitlReview: 0,
      needsRecapture: 0,
      unsafeAcceptedErrors: 0,
      missingBenchmarkResults: 0,
      statusCounts: {}
    },
    blockers: [{
      code: 'hitl_recheck_post_check_failed',
      detail: error instanceof Error ? error.message : String(error)
    }],
    items: [],
    recommendedAction: 'Create the HITL re-evaluation plan and run the HITL recheck benchmark before post-check verification.'
  };
  writeJson(outputPath, report);
  console.error(error);
  process.exitCode = 1;
}
