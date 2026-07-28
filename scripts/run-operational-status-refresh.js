const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
  buildOperationalStatusRefreshRun
} = require('../operationalStatusRefresh');

const root = path.resolve(__dirname, '..');
const artifactRoot = path.join(root, 'artifacts');
const args = process.argv.slice(2);

const valueAfter = flag => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};

const hasFlag = flag => args.includes(flag);

const timestamp = () => new Date().toISOString().replace(/[:.]/g, '-');

const writeJson = (filePath, payload) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
};

const outputPath = path.resolve(
  valueAfter('--output')
  || process.env.OPERATIONAL_STATUS_REFRESH_OUTPUT
  || path.join(artifactRoot, `operational-status-refresh-run-${timestamp()}.json`)
);

const executeCommand = command => {
  const npmExecPath = process.env.npm_execpath;
  const hasNpmCli = npmExecPath && fs.existsSync(npmExecPath);
  const result = hasNpmCli
    ? spawnSync(process.execPath, [npmExecPath, 'run', command.script, ...command.args], {
      cwd: root,
      encoding: 'utf8',
      shell: false
    })
    : spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', command.script, ...command.args], {
      cwd: root,
      encoding: 'utf8',
      shell: process.platform === 'win32'
    });
  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    error: result.error ? result.error.message : undefined
  };
};

const run = () => {
  const report = buildOperationalStatusRefreshRun({
    execute: hasFlag('--execute'),
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
    generatedArtifactReports: report.summary.generatedArtifactReports,
    latestStatusBundlePath: report.summary.latestStatusBundlePath || null,
    latestStatusBundleMarkdownPath: report.summary.latestStatusBundleMarkdownPath || null,
    recommendedAction: report.recommendedAction
  }, null, 2));

  if ([
    'invalid_refresh_commands',
    'refresh_failed'
  ].includes(report.status)) {
    process.exitCode = 1;
  }
};

try {
  run();
} catch (error) {
  const report = buildOperationalStatusRefreshRun();
  report.summary.error = error instanceof Error ? error.message : String(error);
  writeJson(outputPath, report);
  console.error(error);
  process.exitCode = 1;
}
