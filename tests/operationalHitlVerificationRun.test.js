const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildOperationalHitlVerificationRun
} = require('../operationalHitlVerificationRun');

const readyPreflight = () => ({
  contractVersion: 'operational-hitl-editable-decision-preflight/v1',
  status: 'ready_for_verification',
  serviceWritesPerformed: false,
  summary: {
    totalDecisionItems: 3,
    readyForVerificationFileCount: 3
  },
  verificationCommandsReady: [
    'npm run vision:label-conflicts:verify-decisions -- --decisions "C:\\repo\\workspace\\01-vision-label-conflicts.decisions.json"',
    'npm run vision:hitl:verify-decisions -- --decisions "C:\\repo\\workspace\\02-vision-pending-hitl.decisions.json"',
    'npm run knowledge:web:hitl:verify-decisions -- --decisions "C:\\repo\\workspace\\03-web-knowledge-hitl.decisions.json"'
  ],
  sources: {
    workspaceManifest: 'C:\\repo\\workspace\\manifest.json'
  }
});

test('plans allowed HITL verification commands without executing by default', () => {
  const executed = [];
  const report = buildOperationalHitlVerificationRun({
    generatedAt: '2026-07-27T14:30:00.000Z',
    preflightReport: readyPreflight(),
    execute: false,
    sourceArtifacts: {
      preflightReport: 'artifacts/preflight.json'
    },
    executeCommand: command => executed.push(command)
  });

  assert.equal(report.contractVersion, 'operational-hitl-verification-run/v1');
  assert.equal(report.status, 'plan_ready');
  assert.equal(report.executeRequested, false);
  assert.equal(report.serviceWritesPerformed, false);
  assert.equal(report.localVerificationWritesAllowed, true);
  assert.equal(report.policy.allowGraphPromotion, false);
  assert.equal(report.summary.commandsPlanned, 3);
  assert.equal(report.summary.commandsExecuted, 0);
  assert.equal(report.summary.invalidCommands, 0);
  assert.equal(executed.length, 0);
  assert.deepEqual(report.commands.map(command => command.script), [
    'vision:label-conflicts:verify-decisions',
    'vision:hitl:verify-decisions',
    'knowledge:web:hitl:verify-decisions'
  ]);
  assert.equal(report.commands[0].decisionsPath, 'C:\\repo\\workspace\\01-vision-label-conflicts.decisions.json');
  assert.match(report.recommendedAction, /--execute/);
});

test('executes allowed verification commands only when execute is explicit', () => {
  const executed = [];
  const report = buildOperationalHitlVerificationRun({
    preflightReport: readyPreflight(),
    execute: true,
    executeCommand: command => {
      executed.push(command);
      return {
        exitCode: 0,
        stdout: `verified ${command.script}`,
        stderr: ''
      };
    }
  });

  assert.equal(report.status, 'executed');
  assert.equal(report.executeRequested, true);
  assert.equal(report.summary.commandsExecuted, 3);
  assert.equal(report.summary.failedCommands, 0);
  assert.equal(report.executionResults[0].exitCode, 0);
  assert.equal(executed[1].script, 'vision:hitl:verify-decisions');
  assert.deepEqual(executed[1].args, [
    '--',
    '--decisions',
    'C:\\repo\\workspace\\02-vision-pending-hitl.decisions.json'
  ]);
});

test('blocks execution until editable preflight is fully ready', () => {
  const executed = [];
  const report = buildOperationalHitlVerificationRun({
    preflightReport: {
      ...readyPreflight(),
      status: 'needs_human_input',
      verificationCommandsReady: []
    },
    execute: true,
    executeCommand: command => executed.push(command)
  });

  assert.equal(report.status, 'blocked_preflight_not_ready');
  assert.equal(report.summary.commandsPlanned, 0);
  assert.equal(report.summary.commandsExecuted, 0);
  assert.equal(executed.length, 0);
  assert.match(report.recommendedAction, /editable-preflight/);
});

test('fails closed on unsupported or malformed verification commands', () => {
  const executed = [];
  const report = buildOperationalHitlVerificationRun({
    preflightReport: {
      ...readyPreflight(),
      verificationCommandsReady: [
        'npm run vision:hitl:approve -- --authorization "C:\\repo\\authorization.json"',
        'powershell -Command Remove-Item important.json'
      ]
    },
    execute: true,
    executeCommand: command => executed.push(command)
  });

  assert.equal(report.status, 'invalid_verification_commands');
  assert.equal(report.summary.invalidCommands, 2);
  assert.equal(report.summary.commandsExecuted, 0);
  assert.deepEqual(report.invalidCommands.map(command => command.code), [
    'unsupported_npm_script',
    'malformed_command'
  ]);
  assert.equal(executed.length, 0);
});

test('fails closed when preflight evidence is missing', () => {
  const report = buildOperationalHitlVerificationRun({
    preflightReport: null
  });

  assert.equal(report.status, 'missing_evidence');
  assert.equal(report.summary.missingArtifacts, 1);
  assert.deepEqual(report.commands, []);
  assert.equal(report.serviceWritesPerformed, false);
});
