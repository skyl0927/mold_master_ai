const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildOperationalHitlDecisionIntakeStatus
} = require('../operationalHitlDecisionIntakeStatus');

const readinessAudit = () => ({
  contractVersion: 'vision-operational-readiness-audit/v1',
  generatedAt: '2026-07-27T12:00:00.000Z',
  status: 'action_required',
  gates: {
    labelConflictWorkflow: {
      status: 'awaiting_human_review',
      packet: { status: 'action_required', conflicts: 4 },
      template: { status: 'template_ready', decisionsPrepared: 4 },
      verification: {
        status: 'awaiting_human_review',
        decisionsReceived: 0,
        acceptedDecisions: 0,
        invalidDecisions: 0,
        pendingConflicts: 4
      },
      nextCommand: 'npm run vision:label-conflicts:verify-decisions -- --decisions <filled-vision-label-conflict-decisions.json>',
      nextActionKo: '품질/HITL 라벨 충돌 판정 파일을 작성하고 검증하세요.'
    },
    hitlWorkflow: {
      status: 'awaiting_human_review',
      queue: { status: 'action_required', pendingHighConfidence: 12 },
      template: { status: 'template_ready', decisionsPrepared: 12 },
      verification: {
        status: 'awaiting_human_review',
        decisionsReceived: 0,
        acceptedDecisions: 0,
        invalidDecisions: 0,
        pendingQueueItems: 12
      },
      nextCommand: 'npm run vision:hitl:verify-decisions -- --decisions <filled-common-agent-hitl-decisions.json>',
      nextActionKo: 'Common Agent/HITL 판정 파일을 작성하고 검증하세요.'
    }
  }
});

const webKnowledgeReadiness = () => ({
  contractVersion: 'web-knowledge-operational-readiness/v1',
  status: 'awaiting_hitl_review',
  readyForGraphRoundtrip: false,
  readyForCommonAgentLearning: false,
  serviceWritesPerformed: false,
  summary: {
    targetCardCount: 40,
    approvedHitlCards: 0,
    hitlApprovalsMissing: 40,
    centralApprovalsMissing: 40
  },
  blockers: [
    { code: 'web_hitl_approvals_missing', current: 0, required: 40, missing: 40 }
  ]
});

test('summarizes all open human decision intake queues without applying writes', () => {
  const report = buildOperationalHitlDecisionIntakeStatus({
    generatedAt: '2026-07-27T12:10:00.000Z',
    readinessAudit: readinessAudit(),
    webKnowledgeReadiness: webKnowledgeReadiness(),
    decisionArtifacts: [{
      name: 'vision-approved-label-conflict-decision-apply-report-older.json',
      category: 'vision_label_conflicts',
      status: 'applied',
      appliedUpdates: 5
    }]
  });

  assert.equal(report.contractVersion, 'operational-hitl-decision-intake-status/v1');
  assert.equal(report.status, 'action_required');
  assert.equal(report.serviceWritesPerformed, false);
  assert.equal(report.policy.autoApplyAllowed, false);
  assert.equal(report.policy.allowGraphPromotion, false);
  assert.equal(report.summary.totalDecisionInputsMissing, 56);
  assert.equal(report.summary.firstQueueCode, 'vision_label_conflicts');
  assert.equal(report.summary.labelConflictPending, 4);
  assert.equal(report.summary.visionHitlPending, 12);
  assert.equal(report.summary.webHitlMissing, 40);
  assert.equal(report.summary.staleDecisionEvidenceCount, 1);
  assert.deepEqual(
    report.queues.map(queue => [queue.code, queue.status, queue.pending]),
    [
      ['vision_label_conflicts', 'awaiting_human_review', 4],
      ['vision_pending_hitl', 'awaiting_human_review', 12],
      ['web_knowledge_hitl', 'awaiting_human_review', 40]
    ]
  );
  assert.deepEqual(report.queues[0].commands, [
    'npm run vision:label-conflicts:decision-template',
    'npm run vision:label-conflicts:review-guide',
    'npm run vision:label-conflicts:verify-decisions -- --decisions <filled-vision-label-conflict-decisions.json>'
  ]);
  assert.match(report.queues[0].nextActionKo, /라벨 충돌 판정/);
  assert.match(report.recommendedAction, /라벨 충돌/);
});

test('reports clear only after Vision and Web HITL decision queues are closed', () => {
  const readiness = readinessAudit();
  readiness.gates.labelConflictWorkflow.status = 'clear';
  readiness.gates.labelConflictWorkflow.verification = {
    status: 'ready_for_manual_import',
    decisionsReceived: 4,
    acceptedDecisions: 4,
    invalidDecisions: 0,
    pendingConflicts: 0
  };
  readiness.gates.hitlWorkflow.status = 'clear';
  readiness.gates.hitlWorkflow.verification = {
    status: 'ready_for_authorization',
    decisionsReceived: 12,
    acceptedDecisions: 12,
    invalidDecisions: 0,
    pendingQueueItems: 0
  };
  const web = webKnowledgeReadiness();
  web.status = 'ready_for_graph_roundtrip';
  web.readyForGraphRoundtrip = true;
  web.readyForCommonAgentLearning = true;
  web.summary.approvedHitlCards = 40;
  web.summary.hitlApprovalsMissing = 0;
  web.summary.centralApprovalsMissing = 0;
  web.blockers = [];

  const report = buildOperationalHitlDecisionIntakeStatus({
    readinessAudit: readiness,
    webKnowledgeReadiness: web
  });

  assert.equal(report.status, 'clear');
  assert.equal(report.summary.totalDecisionInputsMissing, 0);
  assert.equal(report.summary.firstQueueCode, null);
  assert.ok(report.queues.every(queue => queue.status === 'clear'));
  assert.match(report.recommendedAction, /operational:progress/);
});

test('fails closed when required readiness evidence is missing', () => {
  const report = buildOperationalHitlDecisionIntakeStatus({});

  assert.equal(report.status, 'missing_evidence');
  assert.equal(report.summary.missingArtifacts, 2);
  assert.deepEqual(report.queues[0].commands, [
    'npm run vision:operational:readiness',
    'npm run knowledge:web:readiness',
    'npm run operational:hitl:intake-status'
  ]);
  assert.match(report.recommendedAction, /vision:operational:readiness/);
});
