const fs = require('node:fs');
const path = require('node:path');
const {
  buildVisionReferenceBackfillAuthorizationTemplate
} = require('../visionReferenceBackfillAuthorization');

const root = path.resolve(__dirname, '..');
const artifactRoot = path.join(root, 'artifacts');

const argumentValue = name => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

const planPath = path.resolve(
  argumentValue('--plan')
  || process.env.VISION_REFERENCE_BACKFILL_PLAN
  || path.join(artifactRoot, 'vision-reference-backfill-plan.json')
);

const run = async () => {
  if (!fs.existsSync(planPath)) {
    throw new Error(
      `Vision reference backfill plan was not found: ${planPath}. `
      + 'Run npm run vision:reference:backfill-plan first.'
    );
  }
  const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
  const generatedAt = new Date().toISOString();
  const authorization = buildVisionReferenceBackfillAuthorizationTemplate({
    plan,
    generatedAt
  });
  const defaultName = `vision-reference-backfill-authorization-${
    generatedAt.replace(/[-:.]/g, '').replace('Z', '')
  }.json`;
  const outputPath = path.resolve(
    argumentValue('--output')
    || path.join(artifactRoot, defaultName)
  );
  if (fs.existsSync(outputPath)) {
    throw new Error(`Authorization file already exists and will not be overwritten: ${outputPath}`);
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify({
    ...authorization,
    planPath
  }, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    outputPath,
    planPath,
    backfillPlanDigest: authorization.backfillPlanDigest,
    totalTargets: authorization.summary.totalTargets,
    targetsByClass: authorization.summary.targetsByClass,
    authorizationStatement: authorization.authorizationStatement,
    writesPerformed: false
  }, null, 2));
};

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
