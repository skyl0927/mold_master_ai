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

const isHumanGatedCommand = command =>
  /\bverify-decisions\b/.test(command)
  || /\bapply\b/.test(command)
  || /\bapprove\b/.test(command)
  || /\bauthorization-bridge\b/.test(command)
  || /\bnon-approval-worklist\b/.test(command)
  || /\s--apply\b/.test(command);

const isPreparationCommand = command =>
  !isHumanGatedCommand(command)
  && (
    /\bdecision-template\b/.test(command)
    || /\breview-guide\b/.test(command)
    || /\bpending-packet\b/.test(command)
    || /:packet\b/.test(command)
  );

const splitCommands = commands => {
  const all = unique(asArray(commands));
  return {
    preparationCommands: all.filter(isPreparationCommand),
    humanGatedCommands: all.filter(isHumanGatedCommand),
    informationalCommands: all.filter(command =>
      !isPreparationCommand(command) && !isHumanGatedCommand(command)
    )
  };
};

const missingEvidencePlan = (generatedAt, sourceArtifacts) => ({
  schemaVersion: 1,
  contractVersion: 'operational-hitl-preparation-plan/v1',
  generatedAt,
  sourceSystem: 'mold-master-ai',
  targetSystem: 'operator_common_agent',
  status: 'missing_evidence',
  serviceWritesPerformed: false,
  localArtifactsWritten: true,
  policy: policy(),
  summary: {
    missingArtifacts: 1,
    missingArtifactNames: ['actionPack'],
    totalDecisionInputsMissing: 0,
    firstQueueCode: 'generate_operational_hitl_action_pack',
    actionStepCount: 0,
    preparationCommandCount: 4,
    humanGatedCommandCount: 0,
    firstPreparationCommand: 'npm run operational:progress',
    firstHumanGatedCommand: null
  },
  preparationCommands: [
    'npm run operational:progress',
    'npm run operational:hitl:intake-status',
    'npm run operational:hitl:action-pack',
    'npm run operational:hitl:prepare-plan'
  ],
  humanGatedCommands: [],
  queuePlans: [],
  sources: {
    actionPack: sourceArtifacts.actionPack || null
  },
  recommendedAction: '먼저 npm run operational:progress, npm run operational:hitl:intake-status, npm run operational:hitl:action-pack를 실행하세요.'
});

const queuePlanFor = step => {
  const split = splitCommands(step?.commands);
  return {
    queueCode: compact(step?.queueCode),
    titleKo: compact(step?.titleKo) || compact(step?.queueCode),
    owner: compact(step?.owner) || 'quality_hitl',
    pending: numberFrom(step?.pending),
    preparationCommands: split.preparationCommands,
    humanGatedCommands: split.humanGatedCommands,
    informationalCommands: split.informationalCommands,
    operatorInstructionKo: compact(step?.operatorInstructionKo),
    preparationReady: split.preparationCommands.length > 0,
    humanDecisionRequired: numberFrom(step?.pending) > 0,
    safety: {
      artifactOnly: true,
      autoApplyAllowed: false,
      allowGraphPromotion: false,
      allowReferenceLearning: false,
      allowModelTraining: false
    }
  };
};

const buildOperationalHitlPreparationPlan = ({
  generatedAt = new Date().toISOString(),
  actionPack = null,
  sourceArtifacts = {}
} = {}) => {
  if (!isContract(actionPack, 'operational-hitl-action-pack/v1')) {
    return missingEvidencePlan(generatedAt, sourceArtifacts);
  }

  const summary = actionPack.summary || {};
  const queuePlans = asArray(actionPack.actionSteps).map(queuePlanFor);
  const preparationCommands = unique(queuePlans.flatMap(plan => plan.preparationCommands));
  const humanGatedCommands = unique(queuePlans.flatMap(plan => plan.humanGatedCommands));
  const firstQueue = queuePlans.find(plan => plan.queueCode === summary.firstQueueCode)
    || queuePlans[0]
    || null;
  const firstPreparationCommand = preparationCommands[0] || null;
  const firstHumanGatedCommand = humanGatedCommands[0] || null;
  const status = actionPack.status === 'clear'
    ? 'clear'
    : preparationCommands.length > 0
      ? 'ready_for_preparation'
      : 'awaiting_human_decisions';

  return {
    schemaVersion: 1,
    contractVersion: 'operational-hitl-preparation-plan/v1',
    generatedAt,
    sourceSystem: 'mold-master-ai',
    targetSystem: 'operator_common_agent',
    status,
    serviceWritesPerformed: false,
    localArtifactsWritten: true,
    policy: policy(),
    summary: {
      totalDecisionInputsMissing: numberFrom(summary.totalDecisionInputsMissing),
      firstQueueCode: compact(summary.firstQueueCode) || null,
      actionStepCount: numberFrom(summary.actionStepCount, queuePlans.length),
      preparationCommandCount: preparationCommands.length,
      humanGatedCommandCount: humanGatedCommands.length,
      firstPreparationCommand,
      firstHumanGatedCommand
    },
    preparationCommands,
    humanGatedCommands,
    queuePlans,
    sources: {
      actionPack: sourceArtifacts.actionPack || null
    },
    recommendedAction: firstPreparationCommand
      ? `먼저 ${firstPreparationCommand} 명령으로 ${firstQueue?.titleKo || 'HITL'} 입력 준비 artifact를 생성하세요.`
      : 'HITL 준비 명령이 남아 있지 않습니다. npm run operational:progress로 다음 운영 게이트를 확인하세요.'
  };
};

module.exports = {
  buildOperationalHitlPreparationPlan
};
