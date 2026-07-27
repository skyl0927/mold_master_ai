const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
  runOperationalHitlPreparation
} = require('../operationalHitlPreparationRun');

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

const preparationPlanPath = resolveOptionalPath(
  valueAfter('--preparation-plan'),
  process.env.OPERATIONAL_HITL_PREPARATION_PLAN,
  latestArtifact('operational-hitl-preparation-plan-')
);

const outputPath = path.resolve(
  valueAfter('--output')
  || process.env.OPERATIONAL_HITL_PREPARATION_RUN_OUTPUT
  || path.join(artifactRoot, `operational-hitl-preparation-run-${timestamp()}.json`)
);

const executeCommand = commandSpec => {
  const result = spawnSync(commandSpec.executable, commandSpec.args, {
    cwd: root,
    encoding: 'utf8',
    shell: false
  });
  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout || '',
    stderr: result.stderr || result.error?.message || ''
  };
};

const run = () => {
  const report = runOperationalHitlPreparation({
    preparationPlan: readOptionalJson(preparationPlanPath),
    sourceArtifacts: {
      preparationPlan: preparationPlanPath
    },
    executeCommand
  });

  writeJson(outputPath, report);
  console.log(JSON.stringify({
    outputPath,
    status: report.status,
    serviceWritesPerformed: report.serviceWritesPerformed,
    executedCommands: report.summary.executedCommands,
    failedCommands: report.summary.failedCommands,
    skippedHumanGatedCommands: report.summary.skippedHumanGatedCommands,
    generatedArtifactCount: report.summary.generatedArtifactCount,
    recommendedAction: report.recommendedAction
  }, null, 2));

  if (!['completed', 'nothing_to_prepare'].includes(report.status)) {
    process.exitCode = 1;
  }
};

try {
  run();
} catch (error) {
  const report = runOperationalHitlPreparation({
    sourceArtifacts: {
      preparationPlan: preparationPlanPath
    }
  });
  report.error = error instanceof Error ? error.message : String(error);
  writeJson(outputPath, report);
  console.error(error);
  process.exitCode = 1;
}
