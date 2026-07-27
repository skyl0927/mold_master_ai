const fs = require('node:fs');
const path = require('node:path');
const {
  runVisionReferenceOperationalGate
} = require('../visionReferenceOperationalGate');

const root = path.resolve(__dirname, '..');
const artifactRoot = path.join(root, 'artifacts');
const outputPath = path.resolve(
  process.env.VISION_REFERENCE_GATE_OUTPUT
  || path.join(artifactRoot, 'vision-reference-operational-gate.json')
);

const boolEnv = (value, fallback) => {
  if (value === undefined) return fallback;
  return !['0', 'false', 'no', 'off'].includes(String(value).trim().toLowerCase());
};

const csvEnv = value => String(value || '')
  .split(',')
  .map(item => item.trim())
  .filter(Boolean);

const numberEnv = (value, fallback) =>
  Number.isFinite(Number(value)) ? Number(value) : fallback;

const run = async () => {
  const requiredDefectTypes = csvEnv(process.env.VISION_REFERENCE_REQUIRED_DEFECT_TYPES);
  const report = await runVisionReferenceOperationalGate({
    agentUrl: process.env.COMMON_AGENT_URL || 'http://127.0.0.1:8000',
    refresh: boolEnv(process.env.VISION_REFERENCE_REFRESH, true),
    benchmarkOptions: {
      modelVersion: process.env.VISION_REFERENCE_MODEL_VERSION || undefined,
      requiredDefectTypes: requiredDefectTypes.length ? requiredDefectTypes : undefined,
      minimumReferenceSupport: numberEnv(process.env.VISION_REFERENCE_MIN_SUPPORT, 3),
      minimumSamples: numberEnv(process.env.VISION_REFERENCE_MIN_SAMPLES, 20),
      minimumSamplesPerClass: numberEnv(process.env.VISION_REFERENCE_MIN_SAMPLES_PER_CLASS, 2),
      minimumTop1Accuracy: numberEnv(process.env.VISION_REFERENCE_MIN_TOP1, 0.8),
      minimumTop3Accuracy: numberEnv(process.env.VISION_REFERENCE_MIN_TOP3, 0.9)
    }
  });

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    outputPath,
    status: report.status,
    readyForGraphRetrieval: report.readyForGraphRetrieval,
    referenceStore: report.referenceStore,
    benchmark: report.benchmark,
    blockers: report.blockers,
    recommendedAction: report.recommendedAction,
    serviceWritesPerformed: report.serviceWritesPerformed
  }, null, 2));
  if (!report.readyForGraphRetrieval) process.exitCode = 1;
};

run().catch(error => {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    status: 'blocked',
    readyForGraphRetrieval: false,
    localArtifactsWritten: true,
    serviceWritesPerformed: false,
    blockers: [{
      code: 'vision_reference_gate_runner_failed',
      detail: error instanceof Error ? error.message : String(error)
    }]
  };
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.error(error);
  process.exitCode = 1;
});
