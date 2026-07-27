const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildOperationalHitlPreparationPlan
} = require('../operationalHitlPreparationPlan');

const actionPack = () => ({
  contractVersion: 'operational-hitl-action-pack/v1',
  generatedAt: '2026-07-27T12:30:00.000Z',
  status: 'action_required',
  serviceWritesPerformed: false,
  summary: {
    totalDecisionInputsMissing: 56,
    firstQueueCode: 'vision_label_conflicts',
    actionStepCount: 3
  },
  actionSteps: [
    {
      queueCode: 'vision_label_conflicts',
      titleKo: '승인 이미지 라벨 충돌 판정',
      owner: 'quality_hitl',
      pending: 4,
      commands: [
        'npm run vision:label-conflicts:decision-template',
        'npm run vision:label-conflicts:review-guide',
        'npm run vision:label-conflicts:verify-decisions -- --decisions <filled-vision-label-conflict-decisions.json>'
      ],
      operatorInstructionKo: '품질/HITL 라벨 충돌 판정 파일을 작성하고 검증하세요.'
    },
    {
      queueCode: 'vision_pending_hitl',
      titleKo: 'Vision pending HITL 판정',
      owner: 'quality_hitl',
      pending: 12,
      commands: [
        'npm run vision:hitl:decision-template',
        'npm run vision:hitl:review-guide',
        'npm run vision:hitl:verify-decisions -- --decisions <filled-common-agent-hitl-decisions.json>'
      ],
      operatorInstructionKo: 'Common Agent/HITL 판정 파일을 작성하고 검증하세요.'
    },
    {
      queueCode: 'web_knowledge_hitl',
      titleKo: 'Web Knowledge HITL 승인',
      owner: 'knowledge_owner',
      pending: 40,
      commands: [
        'npm run knowledge:web:hitl:decision-template',
        'npm run knowledge:web:hitl:review-guide',
        'npm run knowledge:web:hitl:verify-decisions -- --decisions <filled-web-knowledge-hitl-decisions.json>',
        'npm run knowledge:web:hitl:apply -- --decisions <verified-web-knowledge-hitl-decisions.json> --apply'
      ],
      operatorInstructionKo: '웹 결함 Case 승인 판정 파일을 작성하고 검증/적용하세요.'
    }
  ],
  recommendedAction: '품질/HITL 라벨 충돌 판정 파일을 작성하고 검증하세요.'
});

test('splits safe preparation commands from human-gated verification/apply commands', () => {
  const plan = buildOperationalHitlPreparationPlan({
    generatedAt: '2026-07-27T12:31:00.000Z',
    actionPack: actionPack(),
    sourceArtifacts: {
      actionPack: 'artifacts/operational-hitl-action-pack.json'
    }
  });

  assert.equal(plan.contractVersion, 'operational-hitl-preparation-plan/v1');
  assert.equal(plan.status, 'ready_for_preparation');
  assert.equal(plan.serviceWritesPerformed, false);
  assert.equal(plan.policy.autoApplyAllowed, false);
  assert.equal(plan.policy.allowGraphPromotion, false);
  assert.equal(plan.summary.totalDecisionInputsMissing, 56);
  assert.equal(plan.summary.firstQueueCode, 'vision_label_conflicts');
  assert.equal(plan.summary.preparationCommandCount, 6);
  assert.equal(plan.summary.humanGatedCommandCount, 4);
  assert.equal(plan.summary.firstPreparationCommand, 'npm run vision:label-conflicts:decision-template');
  assert.equal(
    plan.summary.firstHumanGatedCommand,
    'npm run vision:label-conflicts:verify-decisions -- --decisions <filled-vision-label-conflict-decisions.json>'
  );

  assert.deepEqual(plan.preparationCommands, [
    'npm run vision:label-conflicts:decision-template',
    'npm run vision:label-conflicts:review-guide',
    'npm run vision:hitl:decision-template',
    'npm run vision:hitl:review-guide',
    'npm run knowledge:web:hitl:decision-template',
    'npm run knowledge:web:hitl:review-guide'
  ]);
  assert.deepEqual(plan.queuePlans[0].preparationCommands, [
    'npm run vision:label-conflicts:decision-template',
    'npm run vision:label-conflicts:review-guide'
  ]);
  assert.deepEqual(plan.queuePlans[0].humanGatedCommands, [
    'npm run vision:label-conflicts:verify-decisions -- --decisions <filled-vision-label-conflict-decisions.json>'
  ]);
  assert.match(plan.queuePlans[0].operatorInstructionKo, /라벨 충돌 판정/);
  assert.match(plan.recommendedAction, /decision-template/);
  assert.equal(plan.sources.actionPack, 'artifacts/operational-hitl-action-pack.json');
});

test('reports clear when no HITL preparation commands remain', () => {
  const closed = actionPack();
  closed.status = 'clear';
  closed.summary.totalDecisionInputsMissing = 0;
  closed.summary.firstQueueCode = null;
  closed.actionSteps = [];

  const plan = buildOperationalHitlPreparationPlan({
    actionPack: closed
  });

  assert.equal(plan.status, 'clear');
  assert.equal(plan.summary.preparationCommandCount, 0);
  assert.equal(plan.queuePlans.length, 0);
  assert.match(plan.recommendedAction, /operational:progress/);
});

test('fails closed when the action pack evidence is missing', () => {
  const plan = buildOperationalHitlPreparationPlan({});

  assert.equal(plan.status, 'missing_evidence');
  assert.equal(plan.summary.missingArtifacts, 1);
  assert.deepEqual(plan.preparationCommands, [
    'npm run operational:progress',
    'npm run operational:hitl:intake-status',
    'npm run operational:hitl:action-pack',
    'npm run operational:hitl:prepare-plan'
  ]);
  assert.equal(plan.policy.allowModelTraining, false);
});
