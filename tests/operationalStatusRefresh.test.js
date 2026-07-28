const assert = require('node:assert/strict');
const test = require('node:test');

const {
  DEFAULT_REFRESH_COMMANDS,
  buildOperationalStatusRefreshRun
} = require('../operationalStatusRefresh');

test('plans the post-HITL status refresh sequence without executing by default', () => {
  const executed = [];
  const report = buildOperationalStatusRefreshRun({
    generatedAt: '2026-07-28T04:30:00.000Z',
    execute: false,
    executeCommand: command => executed.push(command)
  });

  assert.equal(report.contractVersion, 'operational-status-refresh-run/v1');
  assert.equal(report.status, 'plan_ready');
  assert.equal(report.executeRequested, false);
  assert.equal(report.serviceWritesPerformed, false);
  assert.equal(report.localArtifactsWritten, true);
  assert.equal(report.policy.automaticServiceWritesAllowed, false);
  assert.equal(report.policy.allowApplyCommands, false);
  assert.equal(report.summary.commandsPlanned, DEFAULT_REFRESH_COMMANDS.length);
  assert.equal(report.summary.commandsExecuted, 0);
  assert.equal(executed.length, 0);
  assert.deepEqual(report.commands.map(command => command.script), [
    'operational:hitl:worktable-import',
    'operational:hitl:session-progress',
    'operational:hitl:pipeline-status',
    'operational:progress',
    'operational:hitl:human-brief',
    'operational:status-bundle'
  ]);
  assert.match(report.recommendedAction, /--execute/);
});

test('executes only the allowlisted refresh sequence when execute is explicit', () => {
  const executed = [];
  const report = buildOperationalStatusRefreshRun({
    execute: true,
    executeCommand: command => {
      executed.push(command);
      return {
        exitCode: 0,
        stdout: `ok ${command.script}`,
        stderr: ''
      };
    }
  });

  assert.equal(report.status, 'executed');
  assert.equal(report.executeRequested, true);
  assert.equal(report.summary.commandsPlanned, DEFAULT_REFRESH_COMMANDS.length);
  assert.equal(report.summary.commandsExecuted, DEFAULT_REFRESH_COMMANDS.length);
  assert.equal(report.summary.failedCommands, 0);
  assert.equal(executed[0].script, 'operational:hitl:worktable-import');
  assert.equal(executed.at(-1).script, 'operational:status-bundle');
  assert.deepEqual(executed.map(command => command.args), [
    [],
    [],
    [],
    [],
    [],
    []
  ]);
});

test('rejects apply, verify, and malformed commands before execution', () => {
  const executed = [];
  const report = buildOperationalStatusRefreshRun({
    execute: true,
    commands: [
      'npm run operational:hitl:worktable-import -- --apply',
      'npm run operational:hitl:verify-run -- --execute',
      'powershell -Command Remove-Item important.json'
    ],
    executeCommand: command => executed.push(command)
  });

  assert.equal(report.status, 'invalid_refresh_commands');
  assert.equal(report.summary.invalidCommands, 3);
  assert.equal(report.summary.commandsExecuted, 0);
  assert.equal(executed.length, 0);
  assert.deepEqual(report.invalidCommands.map(command => command.code), [
    'arguments_not_allowed',
    'unsupported_refresh_script',
    'malformed_command'
  ]);
});

test('reports refresh_failed when an allowlisted command fails', () => {
  const report = buildOperationalStatusRefreshRun({
    execute: true,
    executeCommand: command => ({
      exitCode: command.script === 'operational:progress' ? 1 : 0,
      stdout: '',
      stderr: command.script === 'operational:progress' ? 'progress failed' : ''
    })
  });

  assert.equal(report.status, 'refresh_failed');
  assert.equal(report.summary.commandsExecuted, DEFAULT_REFRESH_COMMANDS.length);
  assert.equal(report.summary.failedCommands, 1);
  assert.equal(report.executionResults.find(result => result.exitCode === 1).script, 'operational:progress');
  assert.match(report.recommendedAction, /failed command/);
});
