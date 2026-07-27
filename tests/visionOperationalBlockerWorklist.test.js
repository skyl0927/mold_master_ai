const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildVisionOperationalBlockerWorklist
} = require('../visionOperationalBlockerWorklist');

const actionRequiredAudit = {
  contractVersion: 'vision-operational-readiness-audit/v1',
  generatedAt: '2026-07-27T12:00:00.000Z',
  status: 'action_required',
  readyForCandidateActivation: false,
  autoActivationAllowed: false,
  blockers: [
    {
      source: 'reference',
      code: 'reference_store_missing',
      detail: 'current reference manifest pointer not found'
    },
    {
      source: 'reference',
      code: 'reference_refresh_failed',
      detail: '503 reference manifest must contain at least one reference'
    },
    {
      source: 'post_hitl',
      code: 'approved_sample_count',
      current: 12,
      required: 20,
      missing: 8
    },
    {
      source: 'post_hitl',
      code: 'approved_label_conflicts',
      count: 4,
      conflicts: [{
        contentHash: 'a'.repeat(64),
        caseIds: ['approved-image-a', 'approved-image-b'],
        labels: ['제팅', '플로우마크']
      }]
    },
    {
      source: 'post_hitl',
      code: 'human_review_required',
      count: 12
    },
    {
      source: 'release',
      code: 'release_report_missing'
    }
  ],
  pendingActions: []
};

test('blocker worklist turns readiness blockers into prioritized human tasks', () => {
  const worklist = buildVisionOperationalBlockerWorklist({
    generatedAt: '2026-07-27T12:30:00.000Z',
    readinessAudit: actionRequiredAudit
  });

  assert.equal(worklist.contractVersion, 'vision-operational-blocker-worklist/v1');
  assert.equal(worklist.status, 'action_required');
  assert.equal(worklist.serviceWritesPerformed, false);
  assert.equal(worklist.autoChangesAllowed, false);
  assert.equal(worklist.summary.totalTasks, 5);
  assert.deepEqual(
    worklist.tasks.map(task => task.code),
    [
      'resolve_label_conflicts',
      'close_hitl_reviews',
      'collect_approved_samples',
      'repair_reference_store',
      'build_operational_release_report'
    ]
  );

  const conflicts = worklist.tasks[0];
  assert.equal(conflicts.owner, 'quality_hitl');
  assert.equal(conflicts.priority, 100);
  assert.equal(conflicts.count, 4);
  assert.deepEqual(conflicts.sampleRefs, ['approved-image-a', 'approved-image-b']);
  assert.match(conflicts.titleKo, /라벨 충돌/);

  const sampleTask = worklist.tasks.find(task => task.code === 'collect_approved_samples');
  assert.equal(sampleTask.current, 12);
  assert.equal(sampleTask.required, 20);
  assert.equal(sampleTask.missing, 8);

  assert.equal(worklist.commonAgentHandoff.policy.allowGraphPromotion, false);
  assert.equal(worklist.commonAgentHandoff.policy.allowModelActivation, false);
  assert.equal(worklist.commonAgentHandoff.policy.requiresHumanReview, true);
  assert.equal(worklist.commonAgentHandoff.items.length, 5);
});

test('blocker worklist asks only for operator approval when machine gates passed', () => {
  const worklist = buildVisionOperationalBlockerWorklist({
    readinessAudit: {
      contractVersion: 'vision-operational-readiness-audit/v1',
      generatedAt: '2026-07-27T12:00:00.000Z',
      status: 'ready_for_operator_approval',
      readyForCandidateActivation: false,
      autoActivationAllowed: false,
      blockers: [],
      pendingActions: ['operator_approval_required']
    }
  });

  assert.equal(worklist.status, 'waiting_for_operator');
  assert.equal(worklist.summary.blockerTasks, 0);
  assert.equal(worklist.summary.operatorTasks, 1);
  assert.deepEqual(worklist.tasks.map(task => task.code), ['record_operator_approval']);
  assert.equal(worklist.tasks[0].owner, 'quality_lead');
  assert.equal(worklist.tasks[0].requiresHumanReview, true);
});

test('blocker worklist is clear after manual activation is approved', () => {
  const worklist = buildVisionOperationalBlockerWorklist({
    readinessAudit: {
      contractVersion: 'vision-operational-readiness-audit/v1',
      generatedAt: '2026-07-27T12:00:00.000Z',
      status: 'approved_for_manual_activation',
      readyForCandidateActivation: true,
      autoActivationAllowed: false,
      blockers: [],
      pendingActions: []
    }
  });

  assert.equal(worklist.status, 'ready');
  assert.equal(worklist.readyForManualActivation, true);
  assert.deepEqual(worklist.tasks, []);
  assert.match(worklist.recommendedAction, /수동 활성화/);
});

test('blocker worklist fails closed when readiness audit is missing', () => {
  const worklist = buildVisionOperationalBlockerWorklist({});

  assert.equal(worklist.status, 'missing_audit');
  assert.equal(worklist.readyForManualActivation, false);
  assert.deepEqual(worklist.tasks.map(task => task.code), ['run_readiness_audit']);
  assert.equal(worklist.tasks[0].commands[0], 'npm run vision:operational:readiness');
});
