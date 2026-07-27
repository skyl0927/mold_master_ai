const fs = require('node:fs');
const path = require('node:path');
const {
  buildOperationalHitlPreparationPlan
} = require('../operationalHitlPreparationPlan');

const root = path.resolve(__dirname, '..');
const artifactRoot = path.join(root, 'artifacts');
const args = process.argv.slice(2);

const valueAfter = flag => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};

const timestamp = () => new Date().toISOString().replace(/[:.]/g, '-');

const latestArtifact = prefix => {
  if (!fs.existsSync(artifactRoot)) return null;
  const matches = fs.readdirSync(artifactRoot)
    .filter(name => name.startsWith(prefix) && name.endsWith('.json'))
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

const actionPackPath = resolveOptionalPath(
  valueAfter('--action-pack'),
  process.env.OPERATIONAL_HITL_ACTION_PACK,
  latestArtifact('operational-hitl-action-pack-')
);

const outputPath = path.resolve(
  valueAfter('--output')
  || process.env.OPERATIONAL_HITL_PREPARATION_PLAN_OUTPUT
  || path.join(artifactRoot, `operational-hitl-preparation-plan-${timestamp()}.json`)
);

const run = () => {
  const plan = buildOperationalHitlPreparationPlan({
    actionPack: readOptionalJson(actionPackPath),
    sourceArtifacts: {
      actionPack: actionPackPath
    }
  });

  writeJson(outputPath, plan);
  console.log(JSON.stringify({
    outputPath,
    status: plan.status,
    serviceWritesPerformed: plan.serviceWritesPerformed,
    totalDecisionInputsMissing: plan.summary.totalDecisionInputsMissing,
    preparationCommandCount: plan.summary.preparationCommandCount,
    humanGatedCommandCount: plan.summary.humanGatedCommandCount,
    firstPreparationCommand: plan.summary.firstPreparationCommand,
    recommendedAction: plan.recommendedAction
  }, null, 2));

  if (plan.status === 'missing_evidence') process.exitCode = 1;
};

try {
  run();
} catch (error) {
  const plan = buildOperationalHitlPreparationPlan({
    sourceArtifacts: {
      actionPack: actionPackPath
    }
  });
  plan.error = error instanceof Error ? error.message : String(error);
  writeJson(outputPath, plan);
  console.error(error);
  process.exitCode = 1;
}
