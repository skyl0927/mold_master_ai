const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
  buildOperationalHitlVerificationRun
} = require('../operationalHitlVerificationRun');

const root = path.resolve(__dirname, '..');
const artifactRoot = path.join(root, 'artifacts');
const args = process.argv.slice(2);

const valueAfter = flag => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};

const hasFlag = flag => args.includes(flag);

const timestamp = () => new Date().toISOString().replace(/[:.]/g, '-');

const latestArtifact = prefix => {
  if (!fs.existsSync(artifactRoot)) return null;
  return fs.readdirSync(artifactRoot)
    .filter(name => name.startsWith(prefix) && name.endsWith('.json'))
    .map(name => path.join(artifactRoot, name))
    .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs)
    .at(0) || null;
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

const preflightReportPath = resolveOptionalPath(
  valueAfter('--preflight'),
  process.env.OPERATIONAL_HITL_EDITABLE_DECISION_PREFLIGHT_REPORT,
  latestArtifact('operational-hitl-editable-decision-preflight-')
);

const outputPath = path.resolve(
  valueAfter('--output')
  || process.env.OPERATIONAL_HITL_VERIFICATION_RUN_OUTPUT
  || path.join(artifactRoot, `operational-hitl-verification-run-${timestamp()}.json`)
);

const executeCommand = command => {
  const result = spawnSync('npm', ['run', command.script, ...command.args], {
    cwd: root,
    encoding: 'utf8',
    shell: false
  });
  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    error: result.error ? result.error.message : undefined
  };
};

const run = () => {
  const report = buildOperationalHitlVerificationRun({
    preflightReport: readOptionalJson(preflightReportPath),
    execute: hasFlag('--execute'),
    sourceArtifacts: {
      preflightReport: preflightReportPath
    },
    executeCommand
  });

  writeJson(outputPath, report);
  console.log(JSON.stringify({
    outputPath,
    status: report.status,
    executeRequested: report.executeRequested,
    serviceWritesPerformed: report.serviceWritesPerformed,
    commandsPlanned: report.summary.commandsPlanned,
    commandsExecuted: report.summary.commandsExecuted,
    failedCommands: report.summary.failedCommands,
    invalidCommands: report.summary.invalidCommands,
    recommendedAction: report.recommendedAction
  }, null, 2));

  if ([
    'missing_evidence',
    'invalid_verification_commands',
    'verification_failed'
  ].includes(report.status)) {
    process.exitCode = 1;
  }
};

try {
  run();
} catch (error) {
  const report = buildOperationalHitlVerificationRun({
    sourceArtifacts: {
      preflightReport: preflightReportPath
    }
  });
  report.summary.error = error instanceof Error ? error.message : String(error);
  writeJson(outputPath, report);
  console.error(error);
  process.exitCode = 1;
}
