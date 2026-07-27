const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildOperationalHitlActionPack
} = require('../operationalHitlActionPack');

const progressReport = () => ({
  contractVersion: 'mold-master-development-progress-report/v1',
  generatedAt: '2026-07-27T12:20:00.000Z',
  status: 'action_required',
  currentPhase: {
    code: 'operational_data_hitl_closure',
    titleKo: '운영 전환 전 데이터/HITL 게이트 종료 단계'
  },
  summary: {
    topPriorityTaskCode: 'resolve_label_conflicts',
    operationalHitlDecisionInputsMissing: 56,
    operationalHitlFirstQueueCode: 'vision_label_conflicts'
  },
  nextActions: [{
    code: 'resolve_label_conflicts',
    owner: 'quality_hitl',
    priority: 100,
    titleKo: '승인 이미지 라벨 충돌 해결'
  }],
  progressFeedbackKo: [
    'HITL decision 입력 56건이 남아 있으며 1순위 큐는 vision_label_conflicts입니다.'
  ]
});

const intakeStatus = () => ({
  contractVersion: 'operational-hitl-decision-intake-status/v1',
  generatedAt: '2026-07-27T12:21:00.000Z',
  status: 'action_required',
  serviceWritesPerformed: false,
  summary: {
    totalDecisionInputsMissing: 56,
    firstQueueCode: 'vision_label_conflicts',
    labelConflictPending: 4,
    visionHitlPending: 12,
    webHitlMissing: 40,
    staleDecisionEvidenceCount: 0
  },
  queues: [
    {
      code: 'vision_label_conflicts',
      titleKo: '승인 이미지 라벨 충돌 판정',
      owner: 'quality_hitl',
      status: 'awaiting_human_review',
      pending: 4,
      commands: [
        'npm run vision:label-conflicts:decision-template',
        'npm run vision:label-conflicts:review-guide',
        'npm run vision:label-conflicts:verify-decisions -- --decisions <filled-vision-label-conflict-decisions.json>'
      ],
      nextActionKo: '품질/HITL 라벨 충돌 판정 파일을 작성하고 검증하세요.'
    },
    {
      code: 'vision_pending_hitl',
      titleKo: 'Vision pending HITL 판정',
      owner: 'quality_hitl',
      status: 'awaiting_human_review',
      pending: 12,
      commands: [
        'npm run vision:hitl:decision-template',
        'npm run vision:hitl:review-guide'
      ],
      nextActionKo: 'Common Agent/HITL 판정 파일을 작성하고 검증하세요.'
    },
    {
      code: 'web_knowledge_hitl',
      titleKo: 'Web Knowledge HITL 승인',
      owner: 'knowledge_owner',
      status: 'awaiting_human_review',
      pending: 40,
      commands: [
        'npm run knowledge:web:hitl:decision-template',
        'npm run knowledge:web:hitl:review-guide'
      ],
      nextActionKo: '웹 결함 Case 승인 판정 파일을 작성하고 검증/적용하세요.'
    }
  ]
});

test('builds a single no-write action pack for all open HITL decision queues', () => {
  const pack = buildOperationalHitlActionPack({
    generatedAt: '2026-07-27T12:22:00.000Z',
    progressReport: progressReport(),
    intakeStatus: intakeStatus(),
    sourceArtifacts: {
      progressReport: 'artifacts/mold-master-development-progress-report.json',
      intakeStatus: 'artifacts/operational-hitl-decision-intake-status.json'
    }
  });

  assert.equal(pack.contractVersion, 'operational-hitl-action-pack/v1');
  assert.equal(pack.status, 'action_required');
  assert.equal(pack.serviceWritesPerformed, false);
  assert.equal(pack.policy.allowGraphPromotion, false);
  assert.equal(pack.policy.allowReferenceLearning, false);
  assert.equal(pack.summary.totalDecisionInputsMissing, 56);
  assert.equal(pack.summary.firstQueueCode, 'vision_label_conflicts');
  assert.equal(pack.summary.topPriorityTaskCode, 'resolve_label_conflicts');
  assert.equal(pack.actionSteps.length, 3);
  assert.equal(pack.actionSteps[0].queueCode, 'vision_label_conflicts');
  assert.equal(pack.actionSteps[0].pending, 4);
  assert.deepEqual(pack.actionSteps[0].commands, [
    'npm run vision:label-conflicts:decision-template',
    'npm run vision:label-conflicts:review-guide',
    'npm run vision:label-conflicts:verify-decisions -- --decisions <filled-vision-label-conflict-decisions.json>'
  ]);
  assert.match(pack.actionSteps[0].operatorInstructionKo, /라벨 충돌 판정/);
  assert.equal(pack.commonAgentHandoff.mode, 'artifact_only');
  assert.equal(pack.commonAgentHandoff.items[0].queueCode, 'vision_label_conflicts');
  assert.equal(pack.commonAgentHandoff.items[0].decisionInputRequired, true);
  assert.match(pack.recommendedAction, /라벨 충돌 판정/);
  assert.equal(pack.sources.progressReport, 'artifacts/mold-master-development-progress-report.json');
  assert.equal(pack.sources.intakeStatus, 'artifacts/operational-hitl-decision-intake-status.json');
});

test('reports clear when every HITL decision queue is closed', () => {
  const intake = intakeStatus();
  intake.status = 'clear';
  intake.summary.totalDecisionInputsMissing = 0;
  intake.summary.firstQueueCode = null;
  intake.queues = intake.queues.map(queue => ({
    ...queue,
    status: 'clear',
    pending: 0,
    commands: [],
    nextActionKo: `${queue.titleKo} 완료`
  }));

  const pack = buildOperationalHitlActionPack({
    progressReport: {
      ...progressReport(),
      status: 'ready_for_operator_review',
      summary: {
        topPriorityTaskCode: 'operator_release_review'
      }
    },
    intakeStatus: intake
  });

  assert.equal(pack.status, 'clear');
  assert.equal(pack.summary.totalDecisionInputsMissing, 0);
  assert.equal(pack.actionSteps.length, 0);
  assert.match(pack.recommendedAction, /operational:progress/);
});

test('fails closed when progress or intake evidence is missing', () => {
  const pack = buildOperationalHitlActionPack({});

  assert.equal(pack.status, 'missing_evidence');
  assert.equal(pack.summary.missingArtifacts, 2);
  assert.deepEqual(pack.actionSteps[0].commands, [
    'npm run operational:progress',
    'npm run operational:hitl:intake-status',
    'npm run operational:hitl:action-pack'
  ]);
  assert.equal(pack.policy.autoApplyAllowed, false);
});
