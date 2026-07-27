const asArray = value => Array.isArray(value) ? value : [];

const compact = value => String(value || '').replace(/\s+/g, ' ').trim();

const unique = values => [...new Set(asArray(values).map(compact).filter(Boolean))];

const REPORTS = [
  {
    key: 'labelConflictVerification',
    queueCode: 'label_conflicts',
    titleKo: '승인 라벨 충돌 HITL',
    contractVersion: 'vision-approved-label-conflict-decision-verification-report/v1',
    readyStatuses: new Set(['ready_for_manual_import', 'clear']),
    nextCommand: 'npm run vision:label-conflicts:verify-decisions -- --decisions <vision-label-conflict-decisions.json>'
  },
  {
    key: 'visionHitlVerification',
    queueCode: 'vision_hitl',
    titleKo: 'Vision pending HITL',
    contractVersion: 'vision-pending-hitl-decision-verification-report/v1',
    readyStatuses: new Set(['ready_for_manual_import', 'clear']),
    nextCommand: 'npm run vision:hitl:verify-decisions -- --decisions <common-agent-hitl-decisions.json>'
  },
  {
    key: 'webKnowledgeVerification',
    queueCode: 'web_knowledge_hitl',
    titleKo: 'Web Knowledge HITL',
    contractVersion: 'web-knowledge-hitl-decision-verification-report/v1',
    readyStatuses: new Set(['ready_for_local_hitl_import', 'clear']),
    nextCommand: 'npm run knowledge:web:hitl:verify-decisions -- --decisions <common-agent-web-knowledge-hitl-decisions.json>'
  }
];

const emptyPayloads = () => ({
  labelConflictResolutions: [],
  visionApprovalCandidates: [],
  webKnowledgeLedgerUpdates: [],
  graphKnowledgeCandidates: [],
  nonLearningDispositionRecords: []
});

const policy = () => ({
  requiresHumanReview: true,
  automaticServiceWritesAllowed: false,
  autoApplyAllowed: false,
  manualImportRequiresOperatorApproval: true,
  allowGraphPromotion: false,
  allowReferenceLearning: false,
  allowModelTraining: false,
  graphPromotionMode: 'disabled_until_common_agent_human_review',
  modelTrainingMode: 'disabled_until_operator_activation'
});

const reportPathFor = (sourceArtifacts, key) => compact(sourceArtifacts?.[key]) || null;

const reportStatus = ({ definition, report, sourceArtifacts }) => {
  const sourceArtifact = reportPathFor(sourceArtifacts, definition.key);
  if (!report) {
    return {
      queueCode: definition.queueCode,
      titleKo: definition.titleKo,
      status: 'missing_report',
      ready: false,
      sourceArtifact,
      nextCommand: definition.nextCommand,
      reasonKo: '검증 리포트 artifact가 없습니다.'
    };
  }
  if (report.contractVersion !== definition.contractVersion) {
    return {
      queueCode: definition.queueCode,
      titleKo: definition.titleKo,
      status: 'invalid_contract',
      ready: false,
      sourceArtifact,
      nextCommand: definition.nextCommand,
      reasonKo: '검증 리포트 contractVersion이 예상값과 다릅니다.'
    };
  }
  if (report.serviceWritesPerformed === true) {
    return {
      queueCode: definition.queueCode,
      titleKo: definition.titleKo,
      status: 'unsafe_source_report',
      sourceStatus: compact(report.status),
      ready: false,
      sourceArtifact,
      nextCommand: definition.nextCommand,
      reasonKo: '검증 리포트가 외부 서비스 쓰기를 수행한 것으로 표시되어 차단합니다.'
    };
  }
  const sourceStatus = compact(report.status);
  const ready = definition.readyStatuses.has(sourceStatus);
  return {
    queueCode: definition.queueCode,
    titleKo: definition.titleKo,
    status: sourceStatus,
    sourceStatus,
    ready,
    sourceArtifact,
    nextCommand: definition.nextCommand,
    reasonKo: ready
      ? '수동 import 검토에 사용할 수 있는 상태입니다.'
      : '아직 사람 판정 또는 검증이 완료되지 않았습니다.'
  };
};

const hasMissingReports = reportStates =>
  reportStates.some(item => item.status === 'missing_report');

const hasInvalidReports = reportStates =>
  reportStates.some(item => ['invalid_contract', 'unsafe_source_report'].includes(item.status));

const statusFor = reportStates => {
  if (hasMissingReports(reportStates)) return 'blocked_missing_verification_reports';
  if (hasInvalidReports(reportStates)) return 'blocked_invalid_verification_reports';
  return reportStates.every(item => item.ready)
    ? 'ready_for_common_agent_review'
    : 'blocked_pending_hitl_verification';
};

const readyForPayload = status => status === 'ready_for_common_agent_review';

const withSource = (item, sourceQueue, sourceVerificationArtifact) => ({
  ...item,
  sourceQueue,
  sourceVerificationArtifact,
  requiresCommonAgentHumanReview: true,
  graphPromotionAllowed: false,
  referenceLearningAllowed: false,
  modelTrainingAllowed: false
});

const labelConflictResolutionsFor = (report, sourceArtifact) =>
  asArray(report?.importPlan?.resolvedLabelConflicts).map(item =>
    withSource(item, 'label_conflicts', sourceArtifact)
  );

const visionApprovalCandidatesFor = (report, sourceArtifact) =>
  asArray(report?.importPlan?.approvalCandidates).map(item =>
    withSource(item, 'vision_hitl', sourceArtifact)
  );

const webKnowledgeLedgerUpdatesFor = (report, sourceArtifact) =>
  asArray(report?.importPlan?.localLedgerUpdates).map(item =>
    withSource(item, 'web_knowledge_hitl', sourceArtifact)
  );

const graphKnowledgeCandidatesFor = (ledgerUpdates, sourceArtifact) =>
  ledgerUpdates
    .filter(update => compact(update?.decision) === 'approved')
    .map(update => ({
      sourceQueue: 'web_knowledge_hitl',
      commonAgentAction: 'stage_graph_knowledge_candidate',
      caseId: compact(update.caseId),
      sourceContentSha256: compact(update.sourceContentSha256).toLowerCase(),
      defectName: compact(update.defectName),
      problem: compact(update.problem),
      phenomenon: compact(update.phenomenon),
      rootCauseCandidates: unique(update.causeCandidates),
      causeLabels: unique(update.causeLabels),
      checkItems: unique(update.checkItems),
      countermeasures: unique(update.actions),
      reviewerId: compact(update.reviewer),
      reviewComment: compact(update.reviewerComment),
      decidedAt: compact(update.decidedAt),
      requiresCommonAgentHumanReview: true,
      graphPromotionAllowed: false,
      referenceLearningAllowed: false,
      modelTrainingAllowed: false,
      provenance: {
        sourceSystem: 'mold-master-ai',
        sourceVerificationArtifact: sourceArtifact || null,
        sourceDecision: compact(update.decision),
        sourceContentSha256: compact(update.sourceContentSha256).toLowerCase(),
        reviewerId: compact(update.reviewer),
        decidedAt: compact(update.decidedAt)
      }
    }));

const dispositionRecord = ({
  sourceQueue,
  sourceArtifact,
  dispositionType,
  identity,
  action,
  reviewerId,
  reviewComment,
  decidedAt,
  item
}) => ({
  sourceQueue,
  sourceArtifact: sourceArtifact || null,
  dispositionType,
  identity: compact(identity),
  action: compact(action),
  reviewerId: compact(reviewerId),
  reviewComment: compact(reviewComment),
  decidedAt: compact(decidedAt),
  item,
  learningAllowed: false,
  graphPromotionAllowed: false,
  modelTrainingAllowed: false
});

const labelDispositionRecordsFor = (report, sourceArtifact) => [
  ...asArray(report?.importPlan?.needsReviewConflicts).map(item => dispositionRecord({
    sourceQueue: 'label_conflicts',
    sourceArtifact,
    dispositionType: 'needs_review_conflict',
    identity: item.conflictId,
    action: item.action,
    reviewerId: item.reviewerId,
    reviewComment: item.reviewComment,
    decidedAt: item.decidedAt,
    item
  })),
  ...asArray(report?.importPlan?.rejectedConflicts).map(item => dispositionRecord({
    sourceQueue: 'label_conflicts',
    sourceArtifact,
    dispositionType: 'rejected_conflict',
    identity: item.conflictId,
    action: item.action,
    reviewerId: item.reviewerId,
    reviewComment: item.reviewComment,
    decidedAt: item.decidedAt,
    item
  })),
  ...asArray(report?.importPlan?.recaptureRequests).map(item => dispositionRecord({
    sourceQueue: 'label_conflicts',
    sourceArtifact,
    dispositionType: 'recapture_request',
    identity: item.conflictId,
    action: item.action,
    reviewerId: item.reviewerId,
    reviewComment: item.reviewComment,
    decidedAt: item.decidedAt,
    item
  }))
];

const visionDispositionRecordsFor = (report, sourceArtifact) => [
  ...asArray(report?.importPlan?.needsReviewItems).map(item => dispositionRecord({
    sourceQueue: 'vision_hitl',
    sourceArtifact,
    dispositionType: 'needs_review_candidate',
    identity: item.queueId,
    action: item.action,
    reviewerId: item.reviewerId,
    reviewComment: item.reviewComment,
    decidedAt: item.decidedAt,
    item
  })),
  ...asArray(report?.importPlan?.rejectedCandidates).map(item => dispositionRecord({
    sourceQueue: 'vision_hitl',
    sourceArtifact,
    dispositionType: 'rejected_candidate',
    identity: item.queueId,
    action: item.action,
    reviewerId: item.reviewerId,
    reviewComment: item.reviewComment,
    decidedAt: item.decidedAt,
    item
  })),
  ...asArray(report?.importPlan?.recaptureRequests).map(item => dispositionRecord({
    sourceQueue: 'vision_hitl',
    sourceArtifact,
    dispositionType: 'recapture_request',
    identity: item.queueId,
    action: item.action,
    reviewerId: item.reviewerId,
    reviewComment: item.reviewComment,
    decidedAt: item.decidedAt,
    item
  }))
];

const webDispositionRecordsFor = (ledgerUpdates, sourceArtifact) =>
  ledgerUpdates
    .filter(update => compact(update?.decision) !== 'approved')
    .map(update => dispositionRecord({
      sourceQueue: 'web_knowledge_hitl',
      sourceArtifact,
      dispositionType: 'web_knowledge_disposition',
      identity: update.caseId,
      action: update.decision,
      reviewerId: update.reviewer,
      reviewComment: update.reviewerComment,
      decidedAt: update.decidedAt,
      item: update
    }));

const payloadsFor = ({
  labelConflictVerification,
  visionHitlVerification,
  webKnowledgeVerification,
  sourceArtifacts
}) => {
  const labelSource = reportPathFor(sourceArtifacts, 'labelConflictVerification');
  const visionSource = reportPathFor(sourceArtifacts, 'visionHitlVerification');
  const webSource = reportPathFor(sourceArtifacts, 'webKnowledgeVerification');
  const labelConflictResolutions = labelConflictResolutionsFor(labelConflictVerification, labelSource);
  const visionApprovalCandidates = visionApprovalCandidatesFor(visionHitlVerification, visionSource);
  const webKnowledgeLedgerUpdates = webKnowledgeLedgerUpdatesFor(webKnowledgeVerification, webSource);
  const graphKnowledgeCandidates = graphKnowledgeCandidatesFor(webKnowledgeLedgerUpdates, webSource);

  return {
    labelConflictResolutions,
    visionApprovalCandidates,
    webKnowledgeLedgerUpdates,
    graphKnowledgeCandidates,
    nonLearningDispositionRecords: [
      ...labelDispositionRecordsFor(labelConflictVerification, labelSource),
      ...visionDispositionRecordsFor(visionHitlVerification, visionSource),
      ...webDispositionRecordsFor(webKnowledgeLedgerUpdates, webSource)
    ]
  };
};

const summaryFor = ({ reportStates, payloads }) => ({
  sourceReports: reportStates.length,
  sourceReportsReady: reportStates.filter(item => item.ready).length,
  missingReports: reportStates.filter(item => item.status === 'missing_report').length,
  invalidReports: reportStates.filter(item => ['invalid_contract', 'unsafe_source_report'].includes(item.status)).length,
  blockingReports: reportStates.filter(item => !item.ready).length,
  labelConflictResolutions: payloads.labelConflictResolutions.length,
  visionApprovalCandidates: payloads.visionApprovalCandidates.length,
  webKnowledgeLedgerUpdates: payloads.webKnowledgeLedgerUpdates.length,
  graphKnowledgeCandidates: payloads.graphKnowledgeCandidates.length,
  nonLearningDispositionRecords: payloads.nonLearningDispositionRecords.length,
  totalApprovedPayloads: payloads.labelConflictResolutions.length
    + payloads.visionApprovalCandidates.length
    + payloads.graphKnowledgeCandidates.length
});

const recommendedActionFor = (status, reportStates) => {
  if (status === 'ready_for_common_agent_review') {
    return '검증 완료된 HITL payload만 Common Agent 수동 import 검토로 넘기세요. 이 패키지는 외부 서비스에 쓰지 않습니다.';
  }
  if (status === 'blocked_missing_verification_reports') {
    return '누락된 HITL 검증 리포트를 먼저 생성하세요. decision template 작성 후 각 verify-decisions 명령을 실행해야 합니다.';
  }
  if (status === 'blocked_invalid_verification_reports') {
    return 'contractVersion 또는 안전 정책이 맞지 않는 검증 리포트를 다시 생성하세요.';
  }
  const firstBlocking = reportStates.find(item => !item.ready);
  return firstBlocking
    ? `${firstBlocking.titleKo}의 HITL 판정/검증을 완료하세요: ${firstBlocking.nextCommand}`
    : 'HITL 검증 상태를 확인하세요.';
};

const buildOperationalHitlCommonAgentImportPackage = ({
  generatedAt = new Date().toISOString(),
  labelConflictVerification = null,
  visionHitlVerification = null,
  webKnowledgeVerification = null,
  sourceArtifacts = {}
} = {}) => {
  const reports = {
    labelConflictVerification,
    visionHitlVerification,
    webKnowledgeVerification
  };
  const reportStates = REPORTS.map(definition =>
    reportStatus({
      definition,
      report: reports[definition.key],
      sourceArtifacts
    })
  );
  const status = statusFor(reportStates);
  const payloads = readyForPayload(status)
    ? payloadsFor({
      labelConflictVerification,
      visionHitlVerification,
      webKnowledgeVerification,
      sourceArtifacts
    })
    : emptyPayloads();
  const summary = summaryFor({
    reportStates,
    payloads
  });

  return {
    schemaVersion: 1,
    contractVersion: 'operational-hitl-common-agent-import-package/v1',
    generatedAt,
    sourceSystem: 'mold-master-ai',
    targetSystem: 'common_agent',
    deliveryMode: 'artifact_only',
    status,
    manualImportAllowed: status === 'ready_for_common_agent_review',
    serviceWritesPerformed: false,
    localArtifactsWritten: true,
    policy: policy(),
    summary,
    reportStates,
    missingReportCodes: reportStates
      .filter(item => item.status === 'missing_report')
      .map(item => item.queueCode),
    blockingReports: reportStates.filter(item => !item.ready),
    payloads,
    commonAgentReviewRequest: {
      reviewType: 'operational_hitl_import_package',
      requestedAction: status === 'ready_for_common_agent_review'
        ? 'manual_hitl_import_review'
        : 'complete_hitl_decision_verification',
      requiresHumanReview: true,
      allowGraphPromotion: false,
      allowReferenceLearning: false,
      allowModelTraining: false,
      itemCount: summary.totalApprovedPayloads + summary.nonLearningDispositionRecords
    },
    sources: {
      labelConflictVerification: reportPathFor(sourceArtifacts, 'labelConflictVerification'),
      visionHitlVerification: reportPathFor(sourceArtifacts, 'visionHitlVerification'),
      webKnowledgeVerification: reportPathFor(sourceArtifacts, 'webKnowledgeVerification')
    },
    recommendedAction: recommendedActionFor(status, reportStates)
  };
};

module.exports = {
  buildOperationalHitlCommonAgentImportPackage
};
