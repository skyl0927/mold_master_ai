const asArray = value => Array.isArray(value) ? value : [];

const compact = value => String(value || '').replace(/\s+/g, ' ').trim();

const numberFrom = (...values) => {
  const value = values.find(item => Number.isFinite(Number(item)));
  return value === undefined ? 0 : Number(value);
};

const isContract = (artifact, contractVersion) =>
  artifact?.contractVersion === contractVersion;

const intakePolicy = () => ({
  requiresHumanReview: true,
  autoApplyAllowed: false,
  allowGraphPromotion: false,
  allowReferenceLearning: false,
  allowModelTraining: false
});

const queue = ({
  code,
  titleKo,
  owner,
  status,
  prepared = 0,
  received = 0,
  accepted = 0,
  invalid = 0,
  pending = 0,
  commands = [],
  nextActionKo = ''
}) => ({
  code,
  titleKo,
  owner,
  status,
  decisionsPrepared: prepared,
  decisionsReceived: received,
  acceptedDecisions: accepted,
  invalidDecisions: invalid,
  pending,
  commands,
  nextActionKo
});

const missingEvidenceReport = (generatedAt, missingArtifactNames = [
  'readinessAudit',
  'webKnowledgeReadiness'
]) => ({
  schemaVersion: 1,
  contractVersion: 'operational-hitl-decision-intake-status/v1',
  generatedAt,
  status: 'missing_evidence',
  serviceWritesPerformed: false,
  localArtifactsWritten: true,
  policy: intakePolicy(),
  summary: {
    missingArtifacts: missingArtifactNames.length,
    missingArtifactNames,
    totalDecisionInputsMissing: 0,
    labelConflictPending: 0,
    visionHitlPending: 0,
    webHitlMissing: 0,
    staleDecisionEvidenceCount: 0,
    firstQueueCode: 'generate_hitl_intake_evidence'
  },
  queues: [
    queue({
      code: 'generate_hitl_intake_evidence',
      titleKo: 'HITL intake 증거 재생성',
      owner: 'system_operator',
      status: 'missing_evidence',
      commands: [
        'npm run vision:operational:readiness',
        'npm run knowledge:web:readiness',
        'npm run operational:hitl:intake-status'
      ],
      nextActionKo: '최신 readiness와 Web Knowledge readiness artifact를 먼저 생성하세요.'
    })
  ],
  staleDecisionEvidence: [],
  recommendedAction: '먼저 npm run vision:operational:readiness와 npm run knowledge:web:readiness를 실행한 뒤 npm run operational:hitl:intake-status를 다시 실행하세요.'
});

const labelConflictQueueFor = workflow => {
  const verification = workflow?.verification || {};
  const pending = numberFrom(verification.pendingConflicts, workflow?.packet?.conflicts);
  const received = numberFrom(verification.decisionsReceived);
  const status = pending > 0 ? 'awaiting_human_review' : 'clear';
  return queue({
    code: 'vision_label_conflicts',
    titleKo: '승인 이미지 라벨 충돌 판정',
    owner: 'quality_hitl',
    status,
    prepared: numberFrom(workflow?.template?.decisionsPrepared, workflow?.packet?.conflicts),
    received,
    accepted: numberFrom(verification.acceptedDecisions),
    invalid: numberFrom(verification.invalidDecisions),
    pending,
    commands: status === 'clear' ? [] : [
      'npm run vision:label-conflicts:decision-template',
      'npm run vision:label-conflicts:review-guide',
      workflow?.nextCommand
        || 'npm run vision:label-conflicts:verify-decisions -- --decisions <filled-vision-label-conflict-decisions.json>'
    ],
    nextActionKo: workflow?.nextActionKo || (
      status === 'clear'
        ? '승인 이미지 라벨 충돌 판정이 닫혔습니다.'
        : '품질/HITL 라벨 충돌 판정 파일을 작성하고 검증하세요.'
    )
  });
};

const visionHitlQueueFor = workflow => {
  const verification = workflow?.verification || {};
  const pending = numberFrom(verification.pendingQueueItems, workflow?.queue?.pendingHighConfidence);
  const status = pending > 0 ? 'awaiting_human_review' : 'clear';
  return queue({
    code: 'vision_pending_hitl',
    titleKo: 'Vision pending HITL 판정',
    owner: 'quality_hitl',
    status,
    prepared: numberFrom(workflow?.template?.decisionsPrepared, workflow?.queue?.pendingHighConfidence),
    received: numberFrom(verification.decisionsReceived),
    accepted: numberFrom(verification.acceptedDecisions),
    invalid: numberFrom(verification.invalidDecisions),
    pending,
    commands: status === 'clear' ? [] : [
      'npm run vision:hitl:decision-template',
      'npm run vision:hitl:review-guide',
      workflow?.nextCommand
        || 'npm run vision:hitl:verify-decisions -- --decisions <filled-common-agent-hitl-decisions.json>'
    ],
    nextActionKo: workflow?.nextActionKo || (
      status === 'clear'
        ? 'Vision pending HITL 판정이 닫혔습니다.'
        : 'Common Agent/HITL 판정 파일을 작성하고 검증하세요.'
    )
  });
};

const webKnowledgeQueueFor = webKnowledgeReadiness => {
  const summary = webKnowledgeReadiness.summary || {};
  const pending = numberFrom(summary.hitlApprovalsMissing);
  const status = pending > 0 ? 'awaiting_human_review' : 'clear';
  return queue({
    code: 'web_knowledge_hitl',
    titleKo: 'Web Knowledge HITL 승인',
    owner: 'knowledge_owner',
    status,
    prepared: numberFrom(summary.targetCardCount),
    received: numberFrom(summary.approvedHitlCards),
    accepted: numberFrom(summary.approvedHitlCards),
    invalid: 0,
    pending,
    commands: status === 'clear' ? [] : [
      'npm run knowledge:web:hitl:decision-template',
      'npm run knowledge:web:hitl:review-guide',
      'npm run knowledge:web:hitl:verify-decisions -- --decisions <filled-web-knowledge-hitl-decisions.json>',
      'npm run knowledge:web:hitl:apply -- --decisions <verified-web-knowledge-hitl-decisions.json> --apply'
    ],
    nextActionKo: status === 'clear'
      ? 'Web Knowledge HITL 승인이 닫혔습니다.'
      : '웹 결함 Case 승인 판정 파일을 작성하고 검증/적용하세요.'
  });
};

const staleDecisionEvidenceFor = (queues, decisionArtifacts) => {
  const pendingByCategory = queues.reduce((map, item) => {
    map[item.code] = item.pending;
    return map;
  }, {});
  return asArray(decisionArtifacts)
    .map(item => ({
      name: compact(item.name),
      category: compact(item.category),
      status: compact(item.status),
      appliedUpdates: numberFrom(item.appliedUpdates, item.appliedCaseUpdates, item.appliedCardUpdates),
      acceptedDecisions: numberFrom(item.acceptedDecisions),
      pendingNow: numberFrom(pendingByCategory[compact(item.category)])
    }))
    .filter(item =>
      item.name
      && item.pendingNow > 0
      && (
        item.appliedUpdates > 0
        || item.acceptedDecisions > 0
        || ['applied', 'ready_for_apply', 'ready_for_manual_import'].includes(item.status)
      )
    );
};

const statusFor = queues =>
  queues.some(item => item.pending > 0) ? 'action_required' : 'clear';

const firstOpenQueue = queues =>
  queues.find(item => item.pending > 0) || null;

const recommendedActionFor = (status, first) => {
  if (status === 'clear') {
    return 'HITL decision intake queue가 닫혔습니다. npm run operational:progress로 다음 운영 게이트를 확인하세요.';
  }
  if (first?.code === 'vision_label_conflicts') {
    return '승인 이미지 라벨 충돌 판정 파일을 먼저 작성/검증하세요. 이 단계가 닫히기 전에는 Reference 학습과 Graph 승격을 보류합니다.';
  }
  return first
    ? `${first.titleKo} 작업부터 처리하세요.`
    : 'HITL intake evidence를 재생성하세요.';
};

const buildOperationalHitlDecisionIntakeStatus = ({
  generatedAt = new Date().toISOString(),
  readinessAudit = null,
  webKnowledgeReadiness = null,
  decisionArtifacts = []
} = {}) => {
  const missingArtifactNames = [
    !isContract(readinessAudit, 'vision-operational-readiness-audit/v1') ? 'readinessAudit' : null,
    !isContract(webKnowledgeReadiness, 'web-knowledge-operational-readiness/v1') ? 'webKnowledgeReadiness' : null
  ].filter(Boolean);
  if (missingArtifactNames.length > 0) {
    return missingEvidenceReport(generatedAt, missingArtifactNames);
  }

  const queues = [
    labelConflictQueueFor(readinessAudit.gates?.labelConflictWorkflow),
    visionHitlQueueFor(readinessAudit.gates?.hitlWorkflow),
    webKnowledgeQueueFor(webKnowledgeReadiness)
  ];
  const first = firstOpenQueue(queues);
  const staleDecisionEvidence = staleDecisionEvidenceFor(queues, decisionArtifacts);
  const status = statusFor(queues);

  return {
    schemaVersion: 1,
    contractVersion: 'operational-hitl-decision-intake-status/v1',
    generatedAt,
    status,
    sourceReadinessGeneratedAt: readinessAudit.generatedAt || null,
    serviceWritesPerformed: false,
    localArtifactsWritten: true,
    policy: intakePolicy(),
    summary: {
      missingArtifacts: 0,
      totalDecisionInputsMissing: queues.reduce((total, item) => total + item.pending, 0),
      labelConflictPending: queues.find(item => item.code === 'vision_label_conflicts')?.pending || 0,
      visionHitlPending: queues.find(item => item.code === 'vision_pending_hitl')?.pending || 0,
      webHitlMissing: queues.find(item => item.code === 'web_knowledge_hitl')?.pending || 0,
      staleDecisionEvidenceCount: staleDecisionEvidence.length,
      firstQueueCode: first?.code || null
    },
    queues,
    staleDecisionEvidence,
    recommendedAction: recommendedActionFor(status, first)
  };
};

module.exports = {
  buildOperationalHitlDecisionIntakeStatus
};
