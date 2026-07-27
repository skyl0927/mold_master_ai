const fs = require('node:fs');
const path = require('node:path');
const {
  runVisionReferenceBackfillApply
} = require('../visionReferenceBackfillApply');

const root = path.resolve(__dirname, '..');
const artifactRoot = path.join(root, 'artifacts');

const argumentValue = name => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

const hasFlag = name => process.argv.includes(name);

const writePlanPath = path.resolve(
  argumentValue('--write-plan')
  || process.env.VISION_REFERENCE_BACKFILL_WRITE_PLAN
  || ''
);

const run = async () => {
  if (!writePlanPath || !fs.existsSync(writePlanPath)) {
    throw new Error(
      'Vision reference backfill apply requires --write-plan <validated-write-plan.json>. '
      + 'Create it with npm run vision:reference:backfill-validate.'
    );
  }
  const apply = hasFlag('--apply');
  const writePlan = JSON.parse(fs.readFileSync(writePlanPath, 'utf8'));
  const report = await runVisionReferenceBackfillApply({
    writePlan,
    agentUrl: process.env.COMMON_AGENT_URL || 'http://127.0.0.1:8000',
    apply
  });
  const defaultName = `vision-reference-backfill-${apply ? 'apply' : 'dry-run'}-${
    new Date().toISOString().replace(/[-:.]/g, '').replace('Z', '')
  }.json`;
  const outputPath = path.resolve(
    argumentValue('--output')
    || path.join(artifactRoot, defaultName)
  );
  if (fs.existsSync(outputPath)) {
    throw new Error(`Apply report already exists and will not be overwritten: ${outputPath}`);
  }
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify({
    ...report,
    writePlanPath
  }, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    outputPath,
    applyRequested: report.applyRequested,
    serviceWritesPerformed: report.serviceWritesPerformed,
    requestCount: report.requestCount,
    results: report.results.map(item => ({
      imageId: item.imageId,
      status: item.status,
      error: item.error
    })),
    completed: report.completed,
    recommendedAction: report.recommendedAction
  }, null, 2));
  if (apply && !report.completed) process.exitCode = 1;
};

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
