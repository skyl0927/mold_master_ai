const fs = require('node:fs');
const path = require('node:path');
const {
  buildOperationalHitlActionPack
} = require('../operationalHitlActionPack');

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

const progressReportPath = resolveOptionalPath(
  valueAfter('--progress-report'),
  process.env.MOLD_MASTER_DEVELOPMENT_PROGRESS_REPORT,
  latestArtifact('mold-master-development-progress-report-')
);

const intakeStatusPath = resolveOptionalPath(
  valueAfter('--intake-status'),
  process.env.OPERATIONAL_HITL_DECISION_INTAKE_STATUS,
  latestArtifact('operational-hitl-decision-intake-status-')
);

const outputPath = path.resolve(
  valueAfter('--output')
  || process.env.OPERATIONAL_HITL_ACTION_PACK_OUTPUT
  || path.join(artifactRoot, `operational-hitl-action-pack-${timestamp()}.json`)
);

const run = () => {
  const actionPack = buildOperationalHitlActionPack({
    progressReport: readOptionalJson(progressReportPath),
    intakeStatus: readOptionalJson(intakeStatusPath),
    sourceArtifacts: {
      progressReport: progressReportPath,
      intakeStatus: intakeStatusPath
    }
  });

  writeJson(outputPath, actionPack);
  console.log(JSON.stringify({
    outputPath,
    status: actionPack.status,
    serviceWritesPerformed: actionPack.serviceWritesPerformed,
    totalDecisionInputsMissing: actionPack.summary.totalDecisionInputsMissing,
    firstQueueCode: actionPack.summary.firstQueueCode,
    actionStepCount: actionPack.summary.actionStepCount,
    recommendedAction: actionPack.recommendedAction
  }, null, 2));

  if (actionPack.status === 'missing_evidence') process.exitCode = 1;
};

try {
  run();
} catch (error) {
  const actionPack = buildOperationalHitlActionPack({
    sourceArtifacts: {
      progressReport: progressReportPath,
      intakeStatus: intakeStatusPath
    }
  });
  actionPack.error = error instanceof Error ? error.message : String(error);
  writeJson(outputPath, actionPack);
  console.error(error);
  process.exitCode = 1;
}
