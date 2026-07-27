const asArray = value => Array.isArray(value) ? value : [];

const compact = value => String(value || '').replace(/\s+/g, ' ').trim();

const unique = values => [...new Set(asArray(values).map(compact).filter(Boolean))];

const numberOrNull = value => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const numberFrom = (...values) => {
  const found = values.map(numberOrNull).find(value => value !== null);
  return found === undefined ? 0 : found;
};

const isContract = (artifact, contractVersion) =>
  artifact?.contractVersion === contractVersion;

const valueAt = (object, path) =>
  compact(path).split('.').reduce((current, key) => current?.[key], object);

const policy = () => ({
  requiresHumanReview: true,
  autoApplyAllowed: false,
  automaticServiceWritesAllowed: false,
  allowGraphPromotion: false,
  allowReferenceLearning: false,
  allowModelTraining: false
});

const QUEUES = [
  {
    key: 'labelConflict',
    queueCode: 'vision_label_conflicts',
    titleKo: '승인 이미지 라벨 충돌 판정',
    owner: 'quality_hitl',
    contractVersion: 'vision-approved-label-conflict-decisions/v1',
    decisionIdentifierField: 'conflictId',
    preparedFallbackFields: ['summary.decisionsPrepared', 'summary.conflicts'],
    defaultVerificationCommand: 'npm run vision:label-conflicts:verify-decisions -- --decisions <filled-vision-label-conflict-decisions.json>',
    fallbackRequiredFields: [
      'action',
      'selectedLabel',
      'imageSetConfirmed',
      'labelConfirmed',
      'reviewer.id',
      'decidedAt',
      'reviewComment',
      'requestedViews'
    ],
    nextActionKo: '라벨 충돌 decision file에서 action과 필수 확인 필드를 채운 뒤 verify-decisions로 검증하세요.'
  },
  {
    key: 'visionPendingHitl',
    queueCode: 'vision_pending_hitl',
    titleKo: 'Vision pending HITL 판정',
    owner: 'quality_hitl',
    contractVersion: 'common-agent-hitl-review-decisions/v1',
    decisionIdentifierField: 'queueId',
    preparedFallbackFields: ['summary.decisionsPrepared', 'summary.queueItems'],
    defaultVerificationCommand: 'npm run vision:hitl:verify-decisions -- --decisions <filled-common-agent-hitl-decisions.json>',
    fallbackRequiredFields: [
      'action',
      'approvedDefectType',
      'manufacturingImageConfirmed',
      'labelConfirmed',
      'reviewer.id',
      'decidedAt',
      'reviewComment',
      'requestedViews'
    ],
    nextActionKo: 'Vision HITL decision file에서 제조 이미지 확인과 라벨 확정 필드를 채운 뒤 verify-decisions로 검증하세요.'
  },
  {
    key: 'webKnowledgeHitl',
    queueCode: 'web_knowledge_hitl',
    titleKo: 'Web Knowledge HITL 승인',
    owner: 'knowledge_owner',
    contractVersion: 'common-agent-web-knowledge-hitl-decisions-template/v1',
    decisionIdentifierField: 'caseId',
    preparedFallbackFields: ['summary.decisionsPrepared', 'summary.totalCards'],
    targetPendingFields: ['summary.currentApprovalsMissing', 'summary.targetCardCount'],
    defaultVerificationCommand: 'npm run knowledge:web:hitl:verify-decisions -- --decisions <filled-web-knowledge-hitl-decisions.json>',
    fallbackRequiredFields: [
      'action',
      'reviewerId',
      'decidedAt',
      'reviewComment',
      'confirmed',
      'reviewedDefectName',
      'reviewedProblem',
      'reviewedPhenomenon',
      'causeCandidates',
      'causeLabels',
      'checkItems',
      'actions'
    ],
    nextActionKo: 'Web Case decision file에서 승인/보완/반려 action과 승인 근거 필드를 채운 뒤 verify-decisions로 검증하세요.'
  }
];

const templateFor = (decisionTemplates, key) => {
  if (!decisionTemplates) return null;
  return decisionTemplates[key]
    || decisionTemplates[`${key}Template`]
    || null;
};

const pendingActionCount = decisions =>
  asArray(decisions).filter(decision => {
    const action = compact(decision?.action);
    return !action || action === 'pending';
  }).length;

const actionableActionCount = decisions =>
  asArray(decisions).filter(decision => {
    const action = compact(decision?.action);
    return action && action !== 'pending';
  }).length;

const fieldsFromRequiredFieldsByAction = decisions => unique(
  asArray(decisions).flatMap(decision =>
    Object.values(decision?.requiredFieldsByAction || {}).flatMap(asArray)
  )
);

const allowedActionsFor = decisions => unique(
  asArray(decisions).flatMap(decision => decision?.allowedActions)
);

const preparedCountFor = (template, queue) => {
  const decisions = asArray(template?.decisions);
  if (decisions.length > 0) return decisions.length;
  return numberFrom(...queue.preparedFallbackFields.map(field => valueAt(template, field)));
};

const targetPendingFor = (template, queue, pendingActions, preparedDecisionItems) => {
  if (queue.targetPendingFields) {
    const explicit = queue.targetPendingFields
      .map(field => numberOrNull(valueAt(template, field)))
      .find(value => value !== null);
    if (explicit !== undefined) return explicit;
  }
  if (preparedDecisionItems > 0) return pendingActions;
  return numberFrom(...queue.preparedFallbackFields.map(field => valueAt(template, field)));
};

const reviewTimingPresent = template =>
  Boolean(compact(template?.reviewedAt || template?.reviewer?.reviewedAt));

const reviewerPresent = template =>
  Boolean(compact(template?.reviewer?.id || template?.reviewerId));

const idsFor = (decisions, identifierField) =>
  asArray(decisions)
    .map(decision => compact(decision?.[identifierField]))
    .filter(Boolean);

const sectionFor = (template, queue, sourceArtifact) => {
  const decisions = asArray(template?.decisions);
  const preparedDecisionItems = preparedCountFor(template, queue);
  const pendingActions = pendingActionCount(decisions);
  const actionableActions = actionableActionCount(decisions);
  const targetPending = targetPendingFor(
    template,
    queue,
    pendingActions,
    preparedDecisionItems
  );
  const requiredFields = fieldsFromRequiredFieldsByAction(decisions);
  const decisionIds = idsFor(decisions, queue.decisionIdentifierField);
  const verificationCommand = compact(template?.verification?.command)
    || queue.defaultVerificationCommand;

  return {
    queueCode: queue.queueCode,
    titleKo: queue.titleKo,
    owner: queue.owner,
    status: targetPending > 0 || pendingActions > 0
      ? 'awaiting_human_input'
      : 'ready_for_verification',
    sourceArtifact: sourceArtifact || null,
    contractVersion: template.contractVersion,
    templateStatus: compact(template.status) || null,
    preparedDecisionItems,
    targetPending,
    pendingActions,
    actionableActions,
    allowedActions: allowedActionsFor(decisions),
    requiredFields: requiredFields.length > 0
      ? requiredFields
      : queue.fallbackRequiredFields,
    decisionIdentifierField: queue.decisionIdentifierField,
    decisionIdsPreview: decisionIds.slice(0, 10),
    decisionIdsTruncated: Math.max(0, decisionIds.length - 10),
    inputState: {
      reviewerIdPresent: reviewerPresent(template),
      reviewedAtPresent: reviewTimingPresent(template),
      topLevelReviewerRecommended: true,
      pendingDecisionIdsPreview: decisions
        .filter(decision => {
          const action = compact(decision?.action);
          return !action || action === 'pending';
        })
        .map(decision => compact(decision?.[queue.decisionIdentifierField]))
        .filter(Boolean)
        .slice(0, 10)
    },
    verificationCommand,
    safety: {
      artifactOnly: true,
      serviceWritesAllowed: false,
      autoApplyAllowed: false,
      allowGraphPromotion: false,
      allowReferenceLearning: false,
      allowModelTraining: false
    },
    nextActionKo: queue.nextActionKo
  };
};

const missingEvidencePacket = (generatedAt, sourceArtifacts, missingArtifactNames) => ({
  schemaVersion: 1,
  contractVersion: 'operational-hitl-decision-input-review-packet/v1',
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
    totalTemplateItems: 0,
    totalPendingActions: 0,
    targetDecisionInputsMissing: 0,
    firstQueueCode: null,
    sectionCount: 0
  },
  reviewOrder: [],
  sections: [],
  humanGatedCommands: [],
  sources: {
    labelConflict: sourceArtifacts.labelConflict || null,
    visionPendingHitl: sourceArtifacts.visionPendingHitl || null,
    webKnowledgeHitl: sourceArtifacts.webKnowledgeHitl || null
  },
  recommendedAction: '먼저 npm run operational:hitl:prepare-run으로 decision template와 review guide를 생성하세요.'
});

const firstOpenSection = sections =>
  sections.find(section => section.targetPending > 0 || section.pendingActions > 0)
  || null;

const statusFor = sections => {
  if (sections.some(section => section.targetPending > 0 || section.pendingActions > 0)) {
    return 'awaiting_human_input';
  }
  return 'ready_for_verification';
};

const buildOperationalHitlDecisionInputReviewPacket = ({
  generatedAt = new Date().toISOString(),
  decisionTemplates = {},
  sourceArtifacts = {}
} = {}) => {
  const missingArtifactNames = QUEUES
    .filter(queue => !isContract(templateFor(decisionTemplates, queue.key), queue.contractVersion))
    .map(queue => queue.key);

  if (missingArtifactNames.length > 0) {
    return missingEvidencePacket(generatedAt, sourceArtifacts, missingArtifactNames);
  }

  const sections = QUEUES.map(queue =>
    sectionFor(
      templateFor(decisionTemplates, queue.key),
      queue,
      sourceArtifacts[queue.key] || null
    )
  );
  const first = firstOpenSection(sections);
  const status = statusFor(sections);

  return {
    schemaVersion: 1,
    contractVersion: 'operational-hitl-decision-input-review-packet/v1',
    generatedAt,
    sourceSystem: 'mold-master-ai',
    targetSystem: 'operator_common_agent',
    status,
    serviceWritesPerformed: false,
    localArtifactsWritten: true,
    policy: policy(),
    summary: {
      missingArtifacts: 0,
      missingArtifactNames: [],
      totalTemplateItems: sections.reduce((total, section) =>
        total + section.preparedDecisionItems, 0),
      totalPendingActions: sections.reduce((total, section) =>
        total + section.pendingActions, 0),
      targetDecisionInputsMissing: sections.reduce((total, section) =>
        total + section.targetPending, 0),
      firstQueueCode: first?.queueCode || null,
      sectionCount: sections.length
    },
    reviewOrder: sections.map((section, index) => ({
      priority: index + 1,
      queueCode: section.queueCode,
      titleKo: section.titleKo,
      owner: section.owner,
      targetPending: section.targetPending,
      nextActionKo: section.nextActionKo
    })),
    sections,
    humanGatedCommands: unique(sections.map(section => section.verificationCommand)),
    sources: {
      labelConflict: sourceArtifacts.labelConflict || null,
      visionPendingHitl: sourceArtifacts.visionPendingHitl || null,
      webKnowledgeHitl: sourceArtifacts.webKnowledgeHitl || null
    },
    recommendedAction: first
      ? `${first.queueCode}부터 decision file을 채우고 ${first.verificationCommand} 명령으로 검증하세요.`
      : '모든 decision input이 채워진 상태입니다. humanGatedCommands를 순서대로 실행해 검증하세요.'
  };
};

module.exports = {
  buildOperationalHitlDecisionInputReviewPacket
};
