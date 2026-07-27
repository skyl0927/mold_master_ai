const fs = require('node:fs');
const path = require('node:path');
const {
  validateVisionReferenceBackfillAuthorization
} = require('../visionReferenceBackfillAuthorization');

const root = path.resolve(__dirname, '..');
const artifactRoot = path.join(root, 'artifacts');

const argumentValue = name => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

const authorizationPath = path.resolve(
  argumentValue('--authorization')
  || process.env.VISION_REFERENCE_BACKFILL_AUTHORIZATION
  || ''
);

const planPath = path.resolve(
  argumentValue('--plan')
  || process.env.VISION_REFERENCE_BACKFILL_PLAN
  || path.join(artifactRoot, 'vision-reference-backfill-plan.json')
);

const run = async () => {
  if (!authorizationPath || !fs.existsSync(authorizationPath)) {
    throw new Error(
      'Vision reference backfill validation requires --authorization <reviewed-json>.'
    );
  }
  if (!fs.existsSync(planPath)) {
    throw new Error(`Vision reference backfill plan was not found: ${planPath}`);
  }
  const authorization = JSON.parse(fs.readFileSync(authorizationPath, 'utf8'));
  const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
  const result = validateVisionReferenceBackfillAuthorization({
    authorization,
    plan
  });
  const defaultName = `vision-reference-backfill-write-plan-${
    new Date().toISOString().replace(/[-:.]/g, '').replace('Z', '')
  }.json`;
  const outputPath = path.resolve(
    argumentValue('--output')
    || path.join(artifactRoot, defaultName)
  );
  if (fs.existsSync(outputPath)) {
    throw new Error(`Write-plan file already exists and will not be overwritten: ${outputPath}`);
  }
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify({
    ...result,
    planPath,
    authorizationPath
  }, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    outputPath,
    authorizationId: result.authorizationId,
    authorizedBy: result.authorizedBy,
    targets: result.targets.length,
    serviceWritesPerformed: result.serviceWritesPerformed
  }, null, 2));
};

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
