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
  assert.deepEqual(conflicts.commands, [
    'npm run vision:label-conflicts:packet',
    'npm run vision:label-conflicts:decision-template',
    'npm run vision:label-conflicts:verify-decisions -- --decisions <filled-vision-label-conflict-decisions.json>',
    'npm run vision:label-conflicts:apply -- --verification <vision-approved-label-conflict-decision-verification-report.json>',
    'npm run vision:label-conflicts:apply -- --verification <vision-approved-label-conflict-decision-verification-report.json> --apply',
    'npm run migration:verify-post-hitl'
  ]);

  const sampleTask = worklist.tasks.find(task => task.code === 'collect_approved_samples');
  assert.equal(sampleTask.current, 12);
  assert.equal(sampleTask.required, 20);
  assert.equal(sampleTask.missing, 8);

  assert.equal(worklist.commonAgentHandoff.policy.allowGraphPromotion, false);
  assert.equal(worklist.commonAgentHandoff.policy.allowModelActivation, false);
  assert.equal(worklist.commonAgentHandoff.policy.requiresHumanReview, true);
  assert.equal(worklist.commonAgentHandoff.items.length, 5);
});

test('blocker worklist surfaces HITL queue, template, and decision verification workflow', () => {
  const worklist = buildVisionOperationalBlockerWorklist({
    readinessAudit: {
      ...actionRequiredAudit,
      gates: {
        hitlWorkflow: {
          status: 'awaiting_human_review',
          queue: {
            status: 'action_required',
            pendingHighConfidence: 12
          },
          template: {
            status: 'template_ready',
            decisionsPrepared: 12
          },
          verification: {
            status: 'awaiting_human_review',
            pendingQueueItems: 12,
            invalidDecisions: 0
          },
          nextCommand: 'npm run vision:hitl:verify-decisions -- --decisions <filled-common-agent-hitl-decisions.json>',
          nextActionKo: 'Common Agent/HITL 판정 파일을 작성하고 검증하세요.'
        }
      }
    }
  });

  const task = worklist.tasks.find(item => item.code === 'close_hitl_reviews');
  assert.equal(task.workflowStatus.status, 'awaiting_human_review');
  assert.equal(task.workflowStatus.queue.pendingHighConfidence, 12);
  assert.equal(task.workflowStatus.template.decisionsPrepared, 12);
  assert.equal(task.workflowStatus.verification.pendingQueueItems, 12);
  assert.deepEqual(task.commands, [
    'npm run vision:hitl:pending-packet',
    'npm run vision:hitl:decision-template',
    'npm run vision:hitl:verify-decisions -- --decisions <filled-common-agent-hitl-decisions.json>',
    'npm run vision:hitl:authorization-bridge -- --decision-verification <vision-pending-hitl-decision-verification-report.json>',
    'npm run vision:hitl:non-approval-worklist -- --decision-verification <vision-pending-hitl-decision-verification-report.json>',
    'npm run vision:hitl:approve -- --authorization <vision-hitl-authorization-from-decisions.json>',
    'npm run migration:verify-post-hitl'
  ]);
  assert.match(task.descriptionKo, /판정 파일/);
  assert.equal(worklist.commonAgentHandoff.items.find(item => item.taskCode === 'close_hitl_reviews').workflowStatus.status, 'awaiting_human_review');
});

test('blocker worklist surfaces approved label conflict workflow status', () => {
  const worklist = buildVisionOperationalBlockerWorklist({
    readinessAudit: {
      ...actionRequiredAudit,
      gates: {
        labelConflictWorkflow: {
          status: 'dry_run_ready',
          packet: {
            status: 'action_required',
            conflicts: 4
          },
          template: {
            status: 'template_ready',
            decisionsPrepared: 4
          },
          verification: {
            status: 'ready_for_manual_import',
            acceptedDecisions: 4,
            pendingConflicts: 0,
            invalidDecisions: 0
          },
          apply: {
            status: 'dry_run_ready',
            plannedCaseUpdates: 5,
            appliedCaseUpdates: 0,
            localFixtureWritesPerformed: false
          },
          nextCommand: 'npm run vision:label-conflicts:apply -- --verification <vision-approved-label-conflict-decision-verification-report.json> --apply',
          nextActionKo: 'dry-run 결과를 확인한 뒤 사람이 승인하면 --apply로 로컬 fixture에 반영하세요.',
          policy: {
            autoApplyAllowed: false,
            allowGraphPromotion: false,
            allowReferenceLearning: false
          }
        }
      }
    }
  });

  const task = worklist.tasks.find(item => item.code === 'resolve_label_conflicts');
  assert.equal(task.workflowStatus.status, 'dry_run_ready');
  assert.equal(task.workflowStatus.packet.conflicts, 4);
  assert.equal(task.workflowStatus.apply.plannedCaseUpdates, 5);
  assert.match(task.descriptionKo, /dry-run/);
  assert.equal(
    worklist.commonAgentHandoff.items.find(item => item.taskCode === 'resolve_label_conflicts').workflowStatus.status,
    'dry_run_ready'
  );
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
