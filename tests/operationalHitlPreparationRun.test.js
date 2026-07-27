const assert = require('node:assert/strict');
const test = require('node:test');

const {
  runOperationalHitlPreparation
} = require('../operationalHitlPreparationRun');

const preparationPlan = () => ({
  contractVersion: 'operational-hitl-preparation-plan/v1',
  status: 'ready_for_preparation',
  serviceWritesPerformed: false,
  summary: {
    totalDecisionInputsMissing: 56,
    firstQueueCode: 'vision_label_conflicts',
    firstHumanGatedCommand: 'npm run vision:label-conflicts:verify-decisions -- --decisions <filled-vision-label-conflict-decisions.json>'
  },
  preparationCommands: [
    'npm run vision:label-conflicts:decision-template',
    'npm run vision:label-conflicts:review-guide',
    'npm run vision:hitl:decision-template'
  ],
  humanGatedCommands: [
    'npm run vision:label-conflicts:verify-decisions -- --decisions <filled-vision-label-conflict-decisions.json>',
    'npm run vision:hitl:verify-decisions -- --decisions <filled-common-agent-hitl-decisions.json>'
  ],
  queuePlans: [
    {
      queueCode: 'vision_label_conflicts',
      titleKo: '승인 이미지 라벨 충돌 판정',
      pending: 4
    },
    {
      queueCode: 'vision_pending_hitl',
      titleKo: 'Vision pending HITL 판정',
      pending: 12
    }
  ]
});

const successfulRunner = calls => commandSpec => {
  calls.push(commandSpec);
  return {
    exitCode: 0,
    stdout: JSON.stringify({
      outputPath: `artifacts/${commandSpec.script.replaceAll(':', '-')}.json`,
      status: 'template_ready',
      serviceWritesPerformed: false
    }),
    stderr: ''
  };
};

test('runs only allowlisted preparation commands and records generated artifacts', () => {
  const calls = [];
  const report = runOperationalHitlPreparation({
    generatedAt: '2026-07-27T12:40:00.000Z',
    preparationPlan: preparationPlan(),
    executeCommand: successfulRunner(calls),
    sourceArtifacts: {
      preparationPlan: 'artifacts/operational-hitl-preparation-plan.json'
    }
  });

  assert.equal(report.contractVersion, 'operational-hitl-preparation-run/v1');
  assert.equal(report.status, 'completed');
  assert.equal(report.serviceWritesPerformed, false);
  assert.equal(report.policy.allowGraphPromotion, false);
  assert.equal(report.policy.allowReferenceLearning, false);
  assert.equal(report.summary.preparationCommandsRequested, 3);
  assert.equal(report.summary.executedCommands, 3);
  assert.equal(report.summary.failedCommands, 0);
  assert.equal(report.summary.skippedHumanGatedCommands, 2);
  assert.equal(report.summary.generatedArtifactCount, 3);
  assert.deepEqual(calls.map(call => call.script), [
    'vision:label-conflicts:decision-template',
    'vision:label-conflicts:review-guide',
    'vision:hitl:decision-template'
  ]);
  assert.ok(calls.every(call => call.executable === process.execPath));
  assert.deepEqual(calls.map(call => call.args[0]), [
    'scripts/build-vision-approved-label-conflict-decision-template.js',
    'scripts/build-vision-approved-label-conflict-review-guide.js',
    'scripts/build-vision-pending-hitl-decision-template.js'
  ]);
  assert.deepEqual(report.executedCommands.map(item => item.command), [
    'npm run vision:label-conflicts:decision-template',
    'npm run vision:label-conflicts:review-guide',
    'npm run vision:hitl:decision-template'
  ]);
  assert.ok(report.executedCommands.every(item => item.shellUsed === false));
  assert.deepEqual(report.generatedArtifacts, [
    'artifacts/vision-label-conflicts-decision-template.json',
    'artifacts/vision-label-conflicts-review-guide.json',
    'artifacts/vision-hitl-decision-template.json'
  ]);
  assert.deepEqual(report.skippedCommands.map(item => item.reason), [
    'human_decision_required',
    'human_decision_required'
  ]);
  assert.match(report.recommendedAction, /verify-decisions/);
  assert.equal(report.sources.preparationPlan, 'artifacts/operational-hitl-preparation-plan.json');
});

test('fails closed without running anything when a preparation command is not allowlisted', () => {
  const plan = preparationPlan();
  plan.preparationCommands.push('npm run dangerous:write-db');
  const calls = [];

  const report = runOperationalHitlPreparation({
    preparationPlan: plan,
    executeCommand: successfulRunner(calls)
  });

  assert.equal(report.status, 'blocked_unsafe_command');
  assert.equal(report.summary.unsafeCommandCount, 1);
  assert.equal(report.summary.executedCommands, 0);
  assert.deepEqual(calls, []);
  assert.equal(report.unsafeCommands[0].command, 'npm run dangerous:write-db');
  assert.equal(report.policy.autoApplyAllowed, false);
});

test('stops at the first failed preparation command and preserves partial evidence', () => {
  const calls = [];
  const report = runOperationalHitlPreparation({
    preparationPlan: preparationPlan(),
    executeCommand: commandSpec => {
      calls.push(commandSpec);
      if (commandSpec.script === 'vision:label-conflicts:review-guide') {
        return {
          exitCode: 1,
          stdout: '',
          stderr: 'missing decision template'
        };
      }
      return {
        exitCode: 0,
        stdout: JSON.stringify({
          outputPath: 'artifacts/first.json',
          status: 'template_ready',
          serviceWritesPerformed: false
        }),
        stderr: ''
      };
    }
  });

  assert.equal(report.status, 'partial_failure');
  assert.equal(report.summary.executedCommands, 2);
  assert.equal(report.summary.failedCommands, 1);
  assert.equal(report.summary.firstFailedCommand, 'npm run vision:label-conflicts:review-guide');
  assert.deepEqual(calls.map(call => call.script), [
    'vision:label-conflicts:decision-template',
    'vision:label-conflicts:review-guide'
  ]);
  assert.match(report.executedCommands[1].stderrExcerpt, /missing decision template/);
});

test('fails closed when the preparation plan evidence is missing', () => {
  const report = runOperationalHitlPreparation({});

  assert.equal(report.status, 'missing_evidence');
  assert.equal(report.summary.missingArtifacts, 1);
  assert.deepEqual(report.executedCommands, []);
  assert.equal(report.policy.allowModelTraining, false);
});
