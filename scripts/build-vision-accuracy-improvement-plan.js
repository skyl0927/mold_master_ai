const fs = require('node:fs');
const path = require('node:path');
const {
  buildVisionAccuracyImprovementPlan
} = require('../visionAccuracyImprovementPlan');

const root = path.resolve(__dirname, '..');
const artifactRoot = path.join(root, 'artifacts');
const args = process.argv.slice(2);

const valueAfter = flag => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};

const timestamp = () => new Date().toISOString().replace(/[:.]/g, '-');

const latestTimestampedArtifact = prefix => {
  if (!fs.existsSync(artifactRoot)) return null;
  const matches = fs.readdirSync(artifactRoot)
    .filter(name =>
      name.startsWith(prefix)
      && name.endsWith('.json')
      && /^\d{4}-\d{2}-\d{2}T/.test(name.slice(prefix.length))
    )
    .map(name => path.join(artifactRoot, name))
    .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs);
  return matches[0] || null;
};

const resolveOptionalPath = (...candidates) => {
  const candidate = candidates.find(Boolean);
  return candidate ? path.resolve(candidate) : null;
};

const readOptionalJson = filePath => {
  if (!filePath || !fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
};

const writeJson = (filePath, payload) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
};

const benchmarkPath = resolveOptionalPath(
  valueAfter('--benchmark'),
  process.env.VISION_BENCHMARK_REPORT,
  path.join(artifactRoot, 'multimodal-vision-benchmark-report.json')
);

const referenceRepairGuidePath = resolveOptionalPath(
  valueAfter('--reference-repair-guide'),
  process.env.VISION_REFERENCE_REPAIR_GUIDE,
  latestTimestampedArtifact('vision-reference-repair-guide-')
);

const outputPath = path.resolve(
  valueAfter('--output')
  || process.env.VISION_ACCURACY_IMPROVEMENT_PLAN_OUTPUT
  || path.join(artifactRoot, `vision-accuracy-improvement-plan-${timestamp()}.json`)
);

const run = () => {
  const plan = buildVisionAccuracyImprovementPlan({
    benchmarkReport: readOptionalJson(benchmarkPath),
    referenceRepairGuide: readOptionalJson(referenceRepairGuidePath)
  });
  const artifact = {
    ...plan,
    sources: {
      benchmarkReport: benchmarkPath,
      referenceRepairGuide: referenceRepairGuidePath
    }
  };

  writeJson(outputPath, artifact);
  console.log(JSON.stringify({
    outputPath,
    status: artifact.status,
    serviceWritesPerformed: artifact.serviceWritesPerformed,
    totalCases: artifact.summary.totalCases,
    top1Accuracy: artifact.summary.top1Accuracy,
    top3Accuracy: artifact.summary.top3Accuracy,
    captureProtocolReadyRate: artifact.summary.captureProtocolReadyRate,
    referenceRefreshAllowedNow: artifact.summary.referenceRefreshAllowedNow,
    firstTrack: artifact.improvementTracks[0]?.code || null,
    recommendedAction: artifact.recommendedAction
  }, null, 2));

  if (artifact.status !== 'ready_for_shadow_validation') {
    process.exitCode = 1;
  }
};

try {
  run();
} catch (error) {
  const artifact = buildVisionAccuracyImprovementPlan({});
  artifact.error = error instanceof Error ? error.message : String(error);
  artifact.sources = {
    benchmarkReport: benchmarkPath,
    referenceRepairGuide: referenceRepairGuidePath
  };
  writeJson(outputPath, artifact);
  console.error(error);
  process.exitCode = 1;
}
