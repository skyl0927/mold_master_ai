const fs = require('node:fs');
const path = require('node:path');
const {
  buildVisionOperationalBlockerWorklist
} = require('../visionOperationalBlockerWorklist');

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

const defaultReadinessInput = () =>
  path.join(artifactRoot, 'vision-operational-readiness-audit.json');

const inputPath = path.resolve(
  valueAfter('--readiness')
  || process.env.VISION_OPERATIONAL_READINESS_AUDIT
  || latestArtifact('vision-operational-readiness-audit-')
  || defaultReadinessInput()
);

const outputPath = path.resolve(
  valueAfter('--output')
  || process.env.VISION_OPERATIONAL_BLOCKER_WORKLIST_OUTPUT
  || path.join(artifactRoot, `vision-operational-blocker-worklist-${timestamp()}.json`)
);

const readOptionalJson = filePath => {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
};

const writeJson = (filePath, payload) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
};

const run = () => {
  const worklist = buildVisionOperationalBlockerWorklist({
    readinessAudit: readOptionalJson(inputPath)
  });
  const artifact = {
    ...worklist,
    sources: {
      readinessAudit: inputPath
    }
  };

  writeJson(outputPath, artifact);
  console.log(JSON.stringify({
    outputPath,
    status: artifact.status,
    readyForManualActivation: artifact.readyForManualActivation,
    totalTasks: artifact.summary.totalTasks,
    firstTask: artifact.tasks[0]?.code || null,
    recommendedAction: artifact.recommendedAction
  }, null, 2));

  if (artifact.status !== 'ready') process.exitCode = 1;
};

try {
  run();
} catch (error) {
  const artifact = buildVisionOperationalBlockerWorklist({
    readinessAudit: null
  });
  artifact.status = 'missing_audit';
  artifact.tasks[0].sourceBlockers[0].detail = error instanceof Error
    ? error.message
    : String(error);
  artifact.sources = {
    readinessAudit: inputPath
  };
  writeJson(outputPath, artifact);
  console.error(error);
  process.exitCode = 1;
}
