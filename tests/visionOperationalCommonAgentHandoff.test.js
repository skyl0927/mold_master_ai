const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildVisionOperationalBlockerWorklist
} = require('../visionOperationalBlockerWorklist');
const {
  buildVisionOperationalCommonAgentHandoff
} = require('../visionOperationalCommonAgentHandoff');

const blockerAudit = {
  contractVersion: 'vision-operational-readiness-audit/v1',
  generatedAt: '2026-07-27T12:00:00.000Z',
  status: 'action_required',
  readyForCandidateActivation: false,
  autoActivationAllowed: false,
  blockers: [
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
      source: 'post_hitl',
      code: 'approved_sample_count',
      current: 12,
      required: 20,
      missing: 8
    },
    {
      source: 'reference',
      code: 'reference_store_missing',
      detail: 'current reference manifest pointer not found'
    },
    {
      source: 'release',
      code: 'release_report_missing'
    }
  ],
  pendingActions: []
};

test('Common Agent handoff packet is artifact-only and blocks graph promotion while tasks remain', () => {
  const worklist = buildVisionOperationalBlockerWorklist({
    generatedAt: '2026-07-27T12:30:00.000Z',
    readinessAudit: blockerAudit
  });
  const packet = buildVisionOperationalCommonAgentHandoff({
    generatedAt: '2026-07-27T12:35:00.000Z',
    readinessAudit: blockerAudit,
    worklist,
    sourceArtifacts: {
      readinessAudit: 'artifacts/vision-operational-readiness-audit.json',
      blockerWorklist: 'artifacts/vision-operational-blocker-worklist.json'
    }
  });

  assert.equal(packet.contractVersion, 'vision-operational-common-agent-handoff-packet/v1');
  assert.equal(packet.status, 'blocked');
  assert.equal(packet.targetSystem, 'common_agent');
  assert.equal(packet.deliveryMode, 'artifact_only');
  assert.equal(packet.serviceWritesPerformed, false);
  assert.equal(packet.manualImportAllowed, false);
  assert.equal(packet.policy.automaticServiceWritesAllowed, false);
  assert.equal(packet.policy.allowGraphPromotion, false);
  assert.equal(packet.policy.allowModelActivation, false);
  assert.equal(packet.policy.requiresHumanReview, true);
  assert.equal(packet.summary.totalTasks, 5);
  assert.equal(packet.summary.primaryTaskCode, 'resolve_label_conflicts');
  assert.equal(packet.tasks[0].code, 'resolve_label_conflicts');
  assert.equal(packet.tasks[0].commonAgentAction, 'resolve_hitl_label_conflict');
  assert.deepEqual(packet.tasks[0].sampleRefs, ['approved-image-a', 'approved-image-b']);
  assert.deepEqual(packet.sources, {
    readinessAudit: 'artifacts/vision-operational-readiness-audit.json',
    blockerWorklist: 'artifacts/vision-operational-blocker-worklist.json'
  });
});

test('Common Agent handoff packet can request operator import review only after worklist is clear', () => {
  const readinessAudit = {
    contractVersion: 'vision-operational-readiness-audit/v1',
    generatedAt: '2026-07-27T12:00:00.000Z',
    status: 'approved_for_manual_activation',
    readyForCandidateActivation: true,
    autoActivationAllowed: false,
    blockers: [],
    pendingActions: []
  };
  const worklist = buildVisionOperationalBlockerWorklist({ readinessAudit });
  const packet = buildVisionOperationalCommonAgentHandoff({
    readinessAudit,
    worklist
  });

  assert.equal(packet.status, 'ready_for_operator_import');
  assert.equal(packet.manualImportAllowed, true);
  assert.equal(packet.policy.automaticServiceWritesAllowed, false);
  assert.equal(packet.policy.allowGraphPromotion, false);
  assert.equal(packet.policy.allowModelActivation, false);
  assert.equal(packet.summary.totalTasks, 0);
  assert.match(packet.recommendedAction, /수동 승인/);
});

test('Common Agent handoff packet fails closed when the worklist is missing', () => {
  const packet = buildVisionOperationalCommonAgentHandoff({});

  assert.equal(packet.status, 'blocked');
  assert.equal(packet.manualImportAllowed, false);
  assert.equal(packet.summary.totalTasks, 1);
  assert.equal(packet.summary.primaryTaskCode, 'run_readiness_audit');
  assert.equal(packet.tasks[0].code, 'run_readiness_audit');
  assert.equal(packet.tasks[0].commonAgentAction, 'run_mold_master_readiness_audit');
});
