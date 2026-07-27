const asArray = value => Array.isArray(value) ? value : [];

const compact = value => String(value || '').replace(/\s+/g, ' ').trim();

const unique = values => [...new Set(values.map(compact).filter(Boolean))];

const numberFrom = (...values) => {
  const value = values.find(item => Number.isFinite(Number(item)));
  return value === undefined ? 0 : Number(value);
};

const isContract = (artifact, contractVersion) =>
  artifact?.contractVersion === contractVersion;

const policy = () => ({
  requiresHumanReview: true,
  autoApplyAllowed: false,
  automaticServiceWritesAllowed: false,
  allowGraphPromotion: false,
  allowReferenceLearning: false,
  allowModelTraining: false
});

const missingEvidencePack = (generatedAt, sourceArtifacts, missingArtifactNames) => ({
  schemaVersion: 1,
  contractVersion: 'operational-hitl-action-pack/v1',
  generatedAt,
  sourceSystem: 'mold-master-ai',
  targetSystem: 'operator_common_agent',
  status: 'missing_evidence',
  serviceWritesPerformed: false,
  localArtifactsWritten: true,
  policy: policy(),
  summary: {
    missingArtifacts: missingArtifactNames.length,
    missingArtifactNames,
    totalDecisionInputsMissing: 0,
    firstQueueCode: 'generate_operational_hitl_evidence',
    topPriorityTaskCode: 'generate_operational_hitl_evidence',
    actionStepCount: 1
  },
  actionSteps: [{
    priority: 100,
    queueCode: 'generate_operational_hitl_evidence',
    titleKo: '운영 HITL 증거 재생성',
    owner: 'system_operator',
    status: 'missing_evidence',
    pending: 0,
    decisionInputRequired: false,
    commands: [
      'npm run operational:progress',
      'npm run operational:hitl:intake-status',
      'npm run operational:hitl:action-pack'
    ],
    operatorInstructionKo: '최신 progress report와 HITL intake status artifact를 먼저 생성하세요.'
  }],
  commonAgentHandoff: {
    mode: 'artifact_only',
    serviceWritesAllowed: false,
    items: []
  },
  sources: {
    progressReport: sourceArtifacts.progressReport || null,
    intakeStatus: sourceArtifacts.intakeStatus || null
  },
  recommendedAction: 'npm run operational:progress와 npm run operational:hitl:intake-status 실행 후 action pack을 다시 생성하세요.'
});

const actionStepForQueue = (queue, index) => ({
  priority: 100 - (index * 10),
  queueCode: compact(queue?.code),
  titleKo: compact(queue?.titleKo) || compact(queue?.code),
  owner: compact(queue?.owner) || 'quality_hitl',
  status: compact(queue?.status) || 'awaiting_human_review',
  pending: numberFrom(queue?.pending),
  decisionInputRequired: numberFrom(queue?.pending) > 0,
  commands: unique(asArray(queue?.commands)),
  operatorInstructionKo: compact(queue?.nextActionKo)
    || '판정 입력 파일을 작성하고 검증 명령을 실행하세요.',
  safety: {
    autoApplyAllowed: false,
    allowGraphPromotion: false,
    allowReferenceLearning: false,
    allowModelTraining: false
  }
});

const commonAgentItemFor = step => ({
  queueCode: step.queueCode,
  titleKo: step.titleKo,
  owner: step.owner,
  pending: step.pending,
  decisionInputRequired: step.decisionInputRequired,
  commands: step.commands,
  operatorInstructionKo: step.operatorInstructionKo
});

const buildOperationalHitlActionPack = ({
  generatedAt = new Date().toISOString(),
  progressReport = null,
  intakeStatus = null,
  sourceArtifacts = {}
} = {}) => {
  const missingArtifactNames = [
    !isContract(progressReport, 'mold-master-development-progress-report/v1')
      ? 'progressReport'
      : null,
    !isContract(intakeStatus, 'operational-hitl-decision-intake-status/v1')
      ? 'intakeStatus'
      : null
  ].filter(Boolean);

  if (missingArtifactNames.length > 0) {
    return missingEvidencePack(generatedAt, sourceArtifacts, missingArtifactNames);
  }

  const progressSummary = progressReport.summary || {};
  const intakeSummary = intakeStatus.summary || {};
  const actionSteps = asArray(intakeStatus.queues)
    .filter(queue => numberFrom(queue?.pending) > 0)
    .map(actionStepForQueue);
  const firstStep = actionSteps.find(step => step.queueCode === intakeSummary.firstQueueCode)
    || actionSteps[0]
    || null;
  const status = actionSteps.length > 0 ? 'action_required' : 'clear';

  return {
    schemaVersion: 1,
    contractVersion: 'operational-hitl-action-pack/v1',
    generatedAt,
    sourceSystem: 'mold-master-ai',
    targetSystem: 'operator_common_agent',
    status,
    serviceWritesPerformed: false,
    localArtifactsWritten: true,
    policy: policy(),
    currentPhase: progressReport.currentPhase || null,
    summary: {
      totalDecisionInputsMissing: numberFrom(intakeSummary.totalDecisionInputsMissing),
      firstQueueCode: compact(intakeSummary.firstQueueCode) || null,
      topPriorityTaskCode: compact(progressSummary.topPriorityTaskCode) || null,
      labelConflictPending: numberFrom(intakeSummary.labelConflictPending),
      visionHitlPending: numberFrom(intakeSummary.visionHitlPending),
      webHitlMissing: numberFrom(intakeSummary.webHitlMissing),
      staleDecisionEvidenceCount: numberFrom(intakeSummary.staleDecisionEvidenceCount),
      actionStepCount: actionSteps.length
    },
    actionSteps,
    commonAgentHandoff: {
      mode: 'artifact_only',
      serviceWritesAllowed: false,
      items: actionSteps.map(commonAgentItemFor)
    },
    progressFeedbackKo: asArray(progressReport.progressFeedbackKo),
    sources: {
      progressReport: sourceArtifacts.progressReport || null,
      intakeStatus: sourceArtifacts.intakeStatus || null
    },
    recommendedAction: firstStep
      ? firstStep.operatorInstructionKo
      : 'HITL decision intake queue가 닫혔습니다. npm run operational:progress로 다음 운영 게이트를 확인하세요.'
  };
};

module.exports = {
  buildOperationalHitlActionPack
};
