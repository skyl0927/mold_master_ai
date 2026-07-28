const asArray = value => Array.isArray(value) ? value : [];

const compact = value => String(value || '').replace(/\s+/g, ' ').trim();

const numberValue = value => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const isContract = (artifact, contractVersion) =>
  artifact?.contractVersion === contractVersion;

const isVisionCaptureWorkOrderPlan = artifact =>
  isContract(artifact, 'vision-capture-work-order-plan/v1');

const isLabelConflictReviewGuide = artifact =>
  isContract(artifact, 'vision-approved-label-conflict-review-guide/v1');

const isWebKnowledgeCommonAgentPackage = artifact =>
  isContract(artifact, 'web-knowledge-common-agent-learning-package/v1');

const isOperationalPreparationRun = artifact =>
  isContract(artifact, 'operational-hitl-preparation-run/v1');

const isOperationalDecisionInputReviewPacket = artifact =>
  isContract(artifact, 'operational-hitl-decision-input-review-packet/v1');

const isOperationalReviewerWorksheet = artifact =>
  isContract(artifact, 'operational-hitl-reviewer-worksheet/v1');

const policy = () => ({
  requiresHumanReview: true,
  artifactOnly: true,
  automaticServiceWritesAllowed: false,
  autoApplyAllowed: false,
  allowGraphPromotion: false,
  allowReferenceLearning: false,
  allowModelTraining: false
});

const requiredMissing = ({
  developmentProgress,
  pipelineStatus,
  humanDecisionBrief
}) => [
  !isContract(developmentProgress, 'mold-master-development-progress-report/v1')
    ? 'developmentProgress'
    : null,
  !isContract(pipelineStatus, 'operational-hitl-pipeline-status/v1')
    ? 'pipelineStatus'
    : null,
  !isContract(humanDecisionBrief, 'operational-hitl-human-decision-brief/v1')
    ? 'humanDecisionBrief'
    : null
].filter(Boolean);

const statusFor = ({ developmentProgress, pipelineStatus, humanDecisionBrief }) => {
  if (compact(humanDecisionBrief?.status) === 'fix_invalid_human_entries') {
    return 'fix_invalid_human_entries';
  }
  if (compact(humanDecisionBrief?.status) === 'ready_for_worktable_apply') {
    return 'ready_for_worktable_apply';
  }
  if (
    compact(humanDecisionBrief?.status) === 'ready_for_human_entry'
    || compact(pipelineStatus?.currentStage?.code) === 'awaiting_human_csv_decisions'
  ) {
    return 'awaiting_human_hitl';
  }
  if (compact(developmentProgress?.status) === 'ready_for_operator_review') {
    return 'ready_for_operator_review';
  }
  return compact(developmentProgress?.status) || compact(pipelineStatus?.status) || 'action_required';
};

const statusLabelKoFor = status => ({
  missing_evidence: '필수 운영 증거 재생성 필요',
  awaiting_human_hitl: '사람 HITL 판정 입력 대기',
  fix_invalid_human_entries: '사람 입력 오류 수정 필요',
  ready_for_worktable_apply: '작업표 반영 승인 대기',
  ready_for_operator_review: '운영자 릴리스 검토 준비',
  action_required: '운영 전환 조치 필요'
}[status] || compact(status));

const sourceArtifactListFor = sourceArtifacts => [
  {
    key: 'developmentProgress',
    labelKo: '개발 진행률',
    contractVersion: 'mold-master-development-progress-report/v1',
    path: compact(sourceArtifacts.developmentProgress)
  },
  {
    key: 'pipelineStatus',
    labelKo: 'HITL 파이프라인 상태',
    contractVersion: 'operational-hitl-pipeline-status/v1',
    path: compact(sourceArtifacts.pipelineStatus)
  },
  {
    key: 'humanDecisionBrief',
    labelKo: '사람 판정 브리프',
    contractVersion: 'operational-hitl-human-decision-brief/v1',
    path: compact(sourceArtifacts.humanDecisionBrief)
  },
  {
    key: 'humanDecisionBriefMarkdown',
    labelKo: '사람 판정 브리프 Markdown',
    contractVersion: 'text/markdown',
    path: compact(sourceArtifacts.humanDecisionBriefMarkdown)
  },
  {
    key: 'reviewSessionPacket',
    labelKo: '세션 검토 패킷',
    contractVersion: 'operational-hitl-review-session-packet/v1',
    path: compact(sourceArtifacts.reviewSessionPacket)
  },
  {
    key: 'worktableSuggestion',
    labelKo: '작업표 추천',
    contractVersion: 'operational-hitl-decision-worktable-suggestion/v1',
    path: compact(sourceArtifacts.worktableSuggestion)
  },
  {
    key: 'visionCaptureWorkOrderPlan',
    labelKo: 'Vision capture work orders',
    contractVersion: 'vision-capture-work-order-plan/v1',
    path: compact(sourceArtifacts.visionCaptureWorkOrderPlan)
  },
  {
    key: 'labelConflictReviewGuide',
    labelKo: 'Label conflict HITL review guide',
    contractVersion: 'vision-approved-label-conflict-review-guide/v1',
    path: compact(sourceArtifacts.labelConflictReviewGuide)
  },
  {
    key: 'labelConflictReviewGuideMarkdown',
    labelKo: 'Label conflict HITL review guide Markdown',
    contractVersion: 'text/markdown',
    path: compact(sourceArtifacts.labelConflictReviewGuideMarkdown)
  },
  {
    key: 'webKnowledgeCommonAgentPackage',
    labelKo: 'Web Knowledge Common Agent package',
    contractVersion: 'web-knowledge-common-agent-learning-package/v1',
    path: compact(sourceArtifacts.webKnowledgeCommonAgentPackage)
  },
  {
    key: 'operationalPreparationRun',
    labelKo: 'Operational HITL preparation run',
    contractVersion: 'operational-hitl-preparation-run/v1',
    path: compact(sourceArtifacts.operationalPreparationRun)
  },
  {
    key: 'operationalDecisionInputReviewPacket',
    labelKo: 'Operational HITL decision input review packet',
    contractVersion: 'operational-hitl-decision-input-review-packet/v1',
    path: compact(sourceArtifacts.operationalDecisionInputReviewPacket)
  },
  {
    key: 'operationalReviewerWorksheet',
    labelKo: 'Operational HITL reviewer worksheet',
    contractVersion: 'operational-hitl-reviewer-worksheet/v1',
    path: compact(sourceArtifacts.operationalReviewerWorksheet)
  },
  {
    key: 'operationalReviewerWorksheetMarkdown',
    labelKo: 'Operational HITL reviewer worksheet Markdown',
    contractVersion: 'text/markdown',
    path: compact(sourceArtifacts.operationalReviewerWorksheetMarkdown)
  }
].filter(item => item.path);

const restorableArtifactContracts = {
  developmentProgress: 'mold-master-development-progress-report/v1',
  pipelineStatus: 'operational-hitl-pipeline-status/v1',
  humanDecisionBrief: 'operational-hitl-human-decision-brief/v1',
  reviewSessionPacket: 'operational-hitl-review-session-packet/v1',
  worktableSuggestion: 'operational-hitl-decision-worktable-suggestion/v1',
  visionCaptureWorkOrderPlan: 'vision-capture-work-order-plan/v1',
  labelConflictReviewGuide: 'vision-approved-label-conflict-review-guide/v1',
  webKnowledgeCommonAgentPackage: 'web-knowledge-common-agent-learning-package/v1',
  operationalDecisionInputReviewPacket: 'operational-hitl-decision-input-review-packet/v1',
  operationalReviewerWorksheet: 'operational-hitl-reviewer-worksheet/v1'
};

const sourceArtifactSnapshotsFor = ({ generatedAt, sourceArtifacts, sourceArtifactPayloads }) =>
  Object.entries(restorableArtifactContracts)
    .map(([key, contractVersion]) => {
      const payload = sourceArtifactPayloads[key];
      if (!isContract(payload, contractVersion)) return null;
      return {
        key,
        contractVersion,
        sourcePath: compact(sourceArtifacts[key]),
        embeddedAt: generatedAt,
        payload
      };
    })
    .filter(Boolean);

const extractRestorableStatusBundleArtifacts = bundle => {
  if (bundle?.contractVersion !== 'operational-status-bundle/v1') {
    return {
      artifacts: {},
      restoredKeys: [],
      rejectedSnapshots: []
    };
  }

  const artifacts = {};
  const restoredKeys = [];
  const rejectedSnapshots = [];
  asArray(bundle.sourceArtifactSnapshots).forEach(snapshot => {
    const key = compact(snapshot?.key);
    const expectedContract = restorableArtifactContracts[key];
    if (
      !expectedContract
      || compact(snapshot?.contractVersion) !== expectedContract
      || !isContract(snapshot?.payload, expectedContract)
    ) {
      rejectedSnapshots.push({
        key,
        contractVersion: compact(snapshot?.contractVersion)
      });
      return;
    }
    artifacts[key] = snapshot.payload;
    restoredKeys.push(key);
  });

  return {
    artifacts,
    restoredKeys,
    rejectedSnapshots
  };
};

const settingsImportChecklistFor = sourceArtifacts => [
  {
    buttonLabelKo: 'Progress 등록',
    artifactKey: 'developmentProgress',
    artifactPath: compact(sourceArtifacts.developmentProgress),
    contractVersion: 'mold-master-development-progress-report/v1'
  },
  {
    buttonLabelKo: 'Pipeline Status 등록',
    artifactKey: 'pipelineStatus',
    artifactPath: compact(sourceArtifacts.pipelineStatus),
    contractVersion: 'operational-hitl-pipeline-status/v1'
  },
  {
    buttonLabelKo: 'Human Brief 등록',
    artifactKey: 'humanDecisionBrief',
    artifactPath: compact(sourceArtifacts.humanDecisionBrief),
    contractVersion: 'operational-hitl-human-decision-brief/v1'
  },
  {
    buttonLabelKo: 'Session Packet 등록',
    artifactKey: 'reviewSessionPacket',
    artifactPath: compact(sourceArtifacts.reviewSessionPacket),
    contractVersion: 'operational-hitl-review-session-packet/v1'
  },
  {
    buttonLabelKo: 'Suggestion 등록',
    artifactKey: 'worktableSuggestion',
    artifactPath: compact(sourceArtifacts.worktableSuggestion),
    contractVersion: 'operational-hitl-decision-worktable-suggestion/v1'
  },
  {
    buttonLabelKo: 'Capture Work Orders 등록',
    artifactKey: 'visionCaptureWorkOrderPlan',
    artifactPath: compact(sourceArtifacts.visionCaptureWorkOrderPlan),
    contractVersion: 'vision-capture-work-order-plan/v1'
  },
  {
    buttonLabelKo: 'Web Knowledge Package 등록',
    artifactKey: 'webKnowledgeCommonAgentPackage',
    artifactPath: compact(sourceArtifacts.webKnowledgeCommonAgentPackage),
    contractVersion: 'web-knowledge-common-agent-learning-package/v1'
  }
].filter(item => item.artifactPath);

const sessionPointersFor = humanDecisionBrief =>
  asArray(humanDecisionBrief?.sessions).map(session => ({
    code: compact(session?.code),
    titleKo: compact(session?.titleKo),
    priority: numberValue(session?.priority),
    pendingRows: numberValue(session?.pendingRows),
    invalidRows: numberValue(session?.invalidRows),
    highRiskRows: numberValue(session?.highRiskRows),
    markdownPath: compact(session?.markdownPath),
    csvPath: compact(session?.csvPath),
    firstDecisionId: compact(session?.nextRows?.[0]?.decisionId),
    firstDisplayLabel: compact(session?.nextRows?.[0]?.displayLabel),
    firstRecommendedAction: compact(session?.nextRows?.[0]?.recommendedNewAction),
    firstRisk: compact(session?.nextRows?.[0]?.recommendationRisk)
  }));

const captureWorkOrderSummaryFor = visionCaptureWorkOrderPlan => {
  if (!isVisionCaptureWorkOrderPlan(visionCaptureWorkOrderPlan)) return null;
  const summary = visionCaptureWorkOrderPlan.summary || {};
  return {
    visionCaptureWorkOrderStatus: compact(visionCaptureWorkOrderPlan.status),
    visionCaptureWorkOrders: numberValue(summary.totalWorkOrders),
    visionCaptureMissingApprovedSamples: numberValue(summary.totalMissingApprovedSamples),
    visionCaptureRecaptureSamples: numberValue(summary.totalRecaptureSamples),
    visionCaptureTopPriorityDefectClass: compact(summary.topPriorityDefectClass),
    visionCaptureCoreMissingViews: asArray(summary.coreMissingViews)
  };
};

const captureWorkOrderPreviewsFor = visionCaptureWorkOrderPlan =>
  isVisionCaptureWorkOrderPlan(visionCaptureWorkOrderPlan)
    ? asArray(visionCaptureWorkOrderPlan.workOrders).slice(0, 5).map(order => ({
      defectClass: compact(order?.defectClass),
      actionType: compact(order?.actionType),
      priority: numberValue(order?.priority),
      missingApprovedSamples: numberValue(order?.missingApprovedSamples),
      recaptureSampleCount: asArray(order?.recaptureSampleIds).length,
      requiredViews: asArray(order?.requiredViews).map(compact).filter(Boolean)
    }))
    : [];

const labelConflictGuideSummaryFor = ({ labelConflictReviewGuide, sourceArtifacts }) => {
  if (!isLabelConflictReviewGuide(labelConflictReviewGuide)) return null;
  const summary = labelConflictReviewGuide.summary || {};
  const firstItem = asArray(labelConflictReviewGuide.items)[0] || null;
  return {
    labelConflictGuideStatus: compact(labelConflictReviewGuide.status),
    labelConflictGuideConflicts: numberValue(summary.conflicts),
    labelConflictGuideEvidenceCases: numberValue(summary.evidenceCases),
    labelConflictGuideManifestUnlistedCases: numberValue(summary.manifestUnlistedCases),
    labelConflictGuideCaptureProtocolRiskCases: numberValue(summary.captureProtocolRiskCases),
    labelConflictGuideFirstConflictId: compact(firstItem?.conflictId),
    labelConflictGuideFirstRiskFlags: asArray(firstItem?.riskFlags).map(compact).filter(Boolean),
    labelConflictGuidePath: compact(sourceArtifacts.labelConflictReviewGuide),
    labelConflictGuideMarkdownPath: compact(sourceArtifacts.labelConflictReviewGuideMarkdown)
  };
};

const webKnowledgePackageSummaryFor = ({ webKnowledgeCommonAgentPackage, sourceArtifacts }) => {
  if (!isWebKnowledgeCommonAgentPackage(webKnowledgeCommonAgentPackage)) return null;
  const summary = webKnowledgeCommonAgentPackage.summary || {};
  return {
    webKnowledgePackageStatus: compact(webKnowledgeCommonAgentPackage.status),
    webKnowledgePackageApprovedRows: numberValue(summary.approvedSourceRows),
    webKnowledgePackageNonApprovedRows: numberValue(summary.nonApprovedRows),
    webKnowledgePackageItems: numberValue(summary.packagedKnowledgeItems),
    webKnowledgeGraphRoundtripCases: numberValue(summary.graphRoundtripCases),
    webKnowledgeManualImportAllowed: webKnowledgeCommonAgentPackage.manualImportAllowed === true,
    webKnowledgeReadyForGraphRoundtrip: webKnowledgeCommonAgentPackage.readyForGraphRoundtripValidation === true,
    webKnowledgeCommonAgentRequestedAction: compact(webKnowledgeCommonAgentPackage.commonAgentReviewRequest?.requestedAction),
    webKnowledgePackageRecommendedAction: compact(webKnowledgeCommonAgentPackage.recommendedAction),
    webKnowledgePackagePath: compact(sourceArtifacts.webKnowledgeCommonAgentPackage)
  };
};

const uniqueCompactPaths = paths => {
  const seen = new Set();
  return paths
    .map(compact)
    .filter(Boolean)
    .filter(item => {
      if (seen.has(item)) return false;
      seen.add(item);
      return true;
    });
};

const preparationWorksheetArtifactsFor = operationalPreparationRun => {
  if (!isOperationalPreparationRun(operationalPreparationRun)) return [];

  const commandPaths = asArray(operationalPreparationRun.executedCommands).flatMap(command => {
    const commandText = [
      command?.command,
      command?.script,
      command?.outputPath,
      ...asArray(command?.companionOutputPaths)
    ].map(compact).join(' ').toLowerCase();
    if (!commandText.includes('web-knowledge-hitl-review-guide')) return [];
    return [
      command?.outputPath,
      ...asArray(command?.companionOutputPaths)
    ];
  });

  return uniqueCompactPaths([
    ...commandPaths,
    ...asArray(operationalPreparationRun.generatedArtifacts)
  ]).filter(item =>
    /web-knowledge-hitl-review-guide/i.test(item)
    && /\.(md|csv)$/i.test(item)
  );
};

const preparationDecisionTemplateArtifactsFor = operationalPreparationRun => {
  if (!isOperationalPreparationRun(operationalPreparationRun)) return [];

  const commandPaths = asArray(operationalPreparationRun.executedCommands).flatMap(command => [
    command?.outputPath,
    ...asArray(command?.companionOutputPaths)
  ]);

  return uniqueCompactPaths([
    ...commandPaths,
    ...asArray(operationalPreparationRun.generatedArtifacts)
  ]).filter(item =>
    /decisions?-template/i.test(item)
    && /\.json$/i.test(item)
  );
};

const preparationHumanGatedCommandsFor = operationalPreparationRun => {
  if (!isOperationalPreparationRun(operationalPreparationRun)) return [];

  const seen = new Set();
  return asArray(operationalPreparationRun.skippedCommands)
    .map(item => ({
      command: compact(item?.command),
      reason: compact(item?.reason)
    }))
    .filter(item => item.command)
    .filter(item => {
      if (seen.has(item.command)) return false;
      seen.add(item.command);
      return true;
    });
};

const preparationRunSummaryFor = ({
  operationalPreparationRun,
  sourceArtifacts,
  worksheetArtifacts,
  decisionTemplateArtifacts,
  humanGatedCommands
}) => {
  if (!isOperationalPreparationRun(operationalPreparationRun)) return null;

  const summary = operationalPreparationRun.summary || {};
  const generatedArtifacts = asArray(operationalPreparationRun.generatedArtifacts);
  const generatedArtifactCount = Number.isFinite(Number(summary.generatedArtifactCount))
    ? Number(summary.generatedArtifactCount)
    : generatedArtifacts.length;
  const skippedHumanGatedCommands = Number.isFinite(Number(summary.skippedHumanGatedCommands))
    ? Number(summary.skippedHumanGatedCommands)
    : asArray(operationalPreparationRun.skippedCommands).length;

  return {
    preparationRunStatus: compact(operationalPreparationRun.status),
    preparationGeneratedArtifacts: generatedArtifactCount,
    preparationExecutedCommands: numberValue(summary.executedCommands),
    preparationFailedCommands: numberValue(summary.failedCommands),
    preparationSkippedHumanGatedCommands: skippedHumanGatedCommands,
    preparationWorksheetArtifacts: worksheetArtifacts.length,
    preparationDecisionTemplates: decisionTemplateArtifacts.length,
    preparationHumanGatedCommands: humanGatedCommands.length,
    preparationFirstWorksheetArtifactPath: worksheetArtifacts[0] || '',
    preparationFirstDecisionTemplatePath: decisionTemplateArtifacts[0] || '',
    preparationFirstHumanGatedCommand: humanGatedCommands[0]?.command || '',
    preparationRunPath: compact(sourceArtifacts.operationalPreparationRun)
  };
};

const decisionReviewPacketSummaryFor = ({ operationalDecisionInputReviewPacket, sourceArtifacts }) => {
  if (!isOperationalDecisionInputReviewPacket(operationalDecisionInputReviewPacket)) return null;

  const summary = operationalDecisionInputReviewPacket.summary || {};
  const humanGatedCommands = asArray(operationalDecisionInputReviewPacket.humanGatedCommands)
    .map(command => compact(command?.command || command))
    .filter(Boolean);

  return {
    decisionReviewPacketStatus: compact(operationalDecisionInputReviewPacket.status),
    decisionReviewTotalTemplateItems: numberValue(summary.totalTemplateItems),
    decisionReviewTotalPendingActions: numberValue(summary.totalPendingActions),
    decisionReviewTargetInputsMissing: numberValue(summary.targetDecisionInputsMissing),
    decisionReviewFirstQueueCode: compact(summary.firstQueueCode),
    decisionReviewSectionCount: numberValue(summary.sectionCount || asArray(operationalDecisionInputReviewPacket.sections).length),
    decisionReviewHumanGatedCommands: humanGatedCommands.length,
    decisionReviewFirstHumanGatedCommand: humanGatedCommands[0] || '',
    decisionReviewPacketPath: compact(sourceArtifacts.operationalDecisionInputReviewPacket)
  };
};

const decisionReviewSectionPreviewsFor = operationalDecisionInputReviewPacket =>
  isOperationalDecisionInputReviewPacket(operationalDecisionInputReviewPacket)
    ? asArray(operationalDecisionInputReviewPacket.sections).slice(0, 5).map(section => ({
      queueCode: compact(section?.queueCode),
      titleKo: compact(section?.titleKo),
      owner: compact(section?.owner),
      preparedDecisionItems: numberValue(section?.preparedDecisionItems),
      pendingActions: numberValue(section?.pendingActions),
      targetPending: numberValue(section?.targetPending),
      verificationCommand: compact(section?.verificationCommand),
      sourceArtifact: compact(section?.sourceArtifact)
    }))
    : [];

const reviewerWorksheetSummaryFor = ({ operationalReviewerWorksheet, sourceArtifacts }) => {
  if (!isOperationalReviewerWorksheet(operationalReviewerWorksheet)) return null;

  const summary = operationalReviewerWorksheet.summary || {};
  return {
    reviewerWorksheetStatus: compact(operationalReviewerWorksheet.status),
    reviewerWorksheetSourceStatus: compact(summary.sourceStatus),
    reviewerWorksheetTotalTemplateItems: numberValue(summary.totalTemplateItems),
    reviewerWorksheetTotalPendingActions: numberValue(summary.totalPendingActions),
    reviewerWorksheetTargetInputsMissing: numberValue(summary.targetDecisionInputsMissing),
    reviewerWorksheetFirstQueueCode: compact(summary.firstQueueCode),
    reviewerWorksheetSectionCount: numberValue(summary.worksheetSectionCount),
    reviewerWorksheetMarkdownLineCount: numberValue(summary.markdownLineCount),
    reviewerWorksheetRecommendedAction: compact(operationalReviewerWorksheet.recommendedAction),
    reviewerWorksheetPath: compact(sourceArtifacts.operationalReviewerWorksheet),
    reviewerWorksheetMarkdownPath: compact(
      sourceArtifacts.operationalReviewerWorksheetMarkdown || operationalReviewerWorksheet.markdownPath
    )
  };
};

const postImportValidationSummaryFor = pipelineStatus => {
  const summary = pipelineStatus?.summary || {};
  return {
    postImportValidationCases: numberValue(summary.postImportValidationCases),
    postImportValidationObservationStatus: compact(summary.postImportValidationObservationStatus) || 'not_started',
    postImportGraphExecutableCases: numberValue(summary.postImportGraphExecutableCases),
    postImportGraphCapturedCases: numberValue(summary.postImportGraphCapturedCases),
    postImportGraphFailedCases: numberValue(summary.postImportGraphFailedCases),
    postImportManualObservationRequiredCases: numberValue(summary.postImportManualObservationRequiredCases),
    postImportManualObservationTemplateStatus: compact(summary.postImportManualObservationTemplateStatus) || 'not_started',
    postImportManualObservationRows: numberValue(summary.postImportManualObservationRows),
    postImportValidationEvidenceStatus: compact(summary.postImportValidationEvidenceStatus) || 'not_started',
    postImportValidationObservedEvidenceCases: numberValue(summary.postImportValidationObservedEvidenceCases),
    postImportValidationEvidenceMissingCases: numberValue(summary.postImportValidationEvidenceMissingCases),
    postImportValidationResultStatus: compact(summary.postImportValidationResultStatus) || 'not_started',
    postImportValidationPassedCases: numberValue(summary.postImportValidationPassedCases),
    postImportValidationFailedCases: numberValue(summary.postImportValidationFailedCases),
    postImportValidationPassRate: numberValue(summary.postImportValidationPassRate)
  };
};

const nextOperatorActionsFor = ({ sourceArtifacts, humanDecisionBrief, preparationWorksheetArtifacts }) => [
  {
    code: 'register_status_artifacts_in_settings',
    titleKo: 'Settings 운영 artifact 등록',
    instructionKo: 'Settings의 Progress/Pipeline Status/Human Brief/Session Packet 버튼에 최신 JSON을 등록하세요.',
    buttonLabelsKo: settingsImportChecklistFor(sourceArtifacts).map(item => item.buttonLabelKo)
  },
  ...(asArray(preparationWorksheetArtifacts).length > 0 || compact(sourceArtifacts.operationalPreparationRun) ? [{
    code: 'open_preparation_run_outputs',
    titleKo: 'HITL preparation worksheet 열기',
    instructionKo: 'prepare-run에서 생성된 Markdown/CSV worksheet를 열고 사람이 승인/보류/수정 결정을 입력하세요.',
    path: compact(asArray(preparationWorksheetArtifacts)[0] || sourceArtifacts.operationalPreparationRun)
  }] : []),
  ...(compact(sourceArtifacts.operationalReviewerWorksheetMarkdown || sourceArtifacts.operationalReviewerWorksheet) ? [{
    code: 'open_reviewer_worksheet',
    titleKo: 'HITL reviewer worksheet 열기',
    instructionKo: '전체 HITL 입력 현황과 큐별 검토 순서를 확인한 뒤 decision template를 채우세요.',
    path: compact(sourceArtifacts.operationalReviewerWorksheetMarkdown || sourceArtifacts.operationalReviewerWorksheet)
  }] : []),
  ...(compact(sourceArtifacts.labelConflictReviewGuideMarkdown || sourceArtifacts.labelConflictReviewGuide) ? [{
    code: 'open_label_conflict_review_guide',
    titleKo: 'Label conflict HITL guide 확인',
    instructionKo: '라벨 충돌 HITL guide에서 후보 라벨별 근거와 위험 플래그를 확인한 뒤 사람이 decision-template을 채우세요.',
    path: compact(sourceArtifacts.labelConflictReviewGuideMarkdown || sourceArtifacts.labelConflictReviewGuide)
  }] : []),
  ...(compact(sourceArtifacts.webKnowledgeCommonAgentPackage) ? [{
    code: 'open_web_knowledge_common_agent_package',
    titleKo: 'Web Knowledge Common Agent package 확인',
    instructionKo: '승인된 Web Case가 Common Agent 수동 import 후보로 준비됐는지 확인하고 blocked 상태면 Web HITL decision 검증을 먼저 완료하세요.',
    path: compact(sourceArtifacts.webKnowledgeCommonAgentPackage)
  }] : []),
  {
    code: 'open_next_human_brief',
    titleKo: '다음 HITL 브리프 열기',
    instructionKo: sourceArtifacts.humanDecisionBriefMarkdown
      ? `${sourceArtifacts.humanDecisionBriefMarkdown} 파일을 열어 다음 세션과 근거를 확인하세요.`
      : '최신 operational-hitl-human-decision-brief Markdown을 열어 다음 세션과 근거를 확인하세요.',
    path: compact(sourceArtifacts.humanDecisionBriefMarkdown || sourceArtifacts.humanDecisionBrief)
  },
  {
    code: 'fill_original_worktable_csv',
    titleKo: '원본 worktable CSV 입력',
    instructionKo: compact(humanDecisionBrief?.worktableCsvPath)
      ? `${humanDecisionBrief.worktableCsvPath} 파일에 사람이 확인한 newAction/reviewer/decidedAt/reviewComment를 입력하세요.`
      : '원본 worktable CSV에 사람이 확인한 newAction/reviewer/decidedAt/reviewComment를 입력하세요.',
    path: compact(humanDecisionBrief?.worktableCsvPath)
  },
  {
    code: 'dry_run_import_and_refresh_status',
    titleKo: '입력 검증 및 상태 갱신',
    instructionKo: 'CSV 입력 후 dry-run import, session progress, pipeline status, progress report, human brief를 순서대로 갱신하세요.',
    commands: [
      'npm run operational:hitl:worktable-import',
      'npm run operational:hitl:session-progress',
      'npm run operational:hitl:pipeline-status',
      'npm run vision:capture:work-orders:status',
      'npm run operational:progress',
      'npm run operational:hitl:human-brief'
    ]
  }
];

const missingEvidenceBundle = ({ generatedAt, sourceArtifacts, missingArtifactNames }) => ({
  schemaVersion: 1,
  contractVersion: 'operational-status-bundle/v1',
  generatedAt,
  sourceSystem: 'mold-master-ai',
  targetSystem: 'operator_common_agent',
  status: 'missing_evidence',
  statusLabelKo: statusLabelKoFor('missing_evidence'),
  serviceWritesPerformed: false,
  localArtifactsWritten: true,
  policy: policy(),
  summary: {
    missingArtifacts: missingArtifactNames.length,
    missingArtifactNames
  },
  sourceArtifacts: sourceArtifactListFor(sourceArtifacts),
  settingsImportChecklist: [],
  nextOperatorActions: [
    {
      code: 'regenerate_status_evidence',
      titleKo: '운영 상태 증거 재생성',
      instructionKo: '필수 status bundle 입력 artifact를 먼저 생성하세요.',
      commands: [
        'npm run operational:progress',
        'npm run operational:hitl:pipeline-status',
        'npm run operational:hitl:human-brief'
      ]
    }
  ],
  sessionPointers: [],
  recommendedAction: 'npm run operational:progress, npm run operational:hitl:pipeline-status, npm run operational:hitl:human-brief를 실행해 필수 증거를 재생성하세요.',
  markdown: ''
});

const markdownFor = bundle => {
  const lines = [
    '# Operational Status Bundle',
    '',
    `- 생성 시각: ${bundle.generatedAt}`,
    `- 상태: ${bundle.statusLabelKo} (${bundle.status})`,
    `- 현재 단계: ${bundle.summary.currentPhaseKo || '확인 필요'}`,
    `- 파이프라인: ${bundle.summary.currentPipelineStageKo || '확인 필요'}`,
    `- 소프트웨어 ${bundle.summary.softwareScaffoldPercent}% / 운영 ${bundle.summary.operationalProgressPercent}%`,
    `- HITL 미입력: ${bundle.summary.hitlDecisionInputsMissing}건`,
    `- 대기 row: ${bundle.summary.pendingRows}건 / 고위험 row: ${bundle.summary.highRiskRows}건`,
    `- Web 승인대기: ${bundle.summary.webHitlApprovalsMissing}건`,
    `- Web cases: ${bundle.summary.webCards || 0}/${bundle.summary.webTargetCards || 0} / Common Agent ${bundle.summary.webCommonAgentValidationPassed || 0} / HITL missing ${bundle.summary.webHitlApprovalsMissing || 0} / central missing ${bundle.summary.webCentralApprovalsMissing || 0}`,
    `- Web Knowledge package: ${bundle.summary.webKnowledgePackageStatus || 'not_started'} / approved rows ${bundle.summary.webKnowledgePackageApprovedRows || 0} / items ${bundle.summary.webKnowledgePackageItems || 0} / graph cases ${bundle.summary.webKnowledgeGraphRoundtripCases || 0}`,
    `- Preparation run: ${bundle.summary.preparationRunStatus || 'not_started'} / generated ${bundle.summary.preparationGeneratedArtifacts || 0} / worksheets ${bundle.summary.preparationWorksheetArtifacts || 0}`,
    `- Decision review: ${bundle.summary.decisionReviewPacketStatus || 'not_started'} / pending ${bundle.summary.decisionReviewTotalPendingActions || 0} / missing ${bundle.summary.decisionReviewTargetInputsMissing || 0}`,
    `- Decision review packet: ${bundle.summary.decisionReviewPacketPath || 'not_started'}`,
    `- Reviewer worksheet: ${bundle.summary.reviewerWorksheetStatus || 'not_started'} / missing ${bundle.summary.reviewerWorksheetTargetInputsMissing || 0} / lines ${bundle.summary.reviewerWorksheetMarkdownLineCount || 0}`,
    `- Reviewer worksheet Markdown: ${bundle.summary.reviewerWorksheetMarkdownPath || 'not_started'}`,
    `- Vision: Top-1 ${bundle.summary.visionTop1Accuracy}% / Top-3 ${bundle.summary.visionTop3Accuracy}%`,
    `- Vision capture work orders: ${bundle.summary.visionCaptureWorkOrders || 0} / new ${bundle.summary.visionCaptureMissingApprovedSamples || 0} / recapture ${bundle.summary.visionCaptureRecaptureSamples || 0} / priority ${bundle.summary.visionCaptureTopPriorityDefectClass || 'none'}`,
    `- Label conflict guide: ${bundle.summary.labelConflictGuideConflicts || 0} conflicts / evidence ${bundle.summary.labelConflictGuideEvidenceCases || 0} / capture risk ${bundle.summary.labelConflictGuideCaptureProtocolRiskCases || 0}`,
    `- Post-import cases: ${bundle.summary.postImportValidationCases || 0}`,
    `- Graph observations: ${bundle.summary.postImportGraphCapturedCases || 0}/${bundle.summary.postImportGraphExecutableCases || 0}`,
    `- Graph observation failed: ${bundle.summary.postImportGraphFailedCases || 0}`,
    `- Manual observations: ${bundle.summary.postImportManualObservationRows || 0}`,
    `- Evidence: ${bundle.summary.postImportValidationObservedEvidenceCases || 0}/${bundle.summary.postImportValidationCases || 0}`,
    `- Evidence missing: ${bundle.summary.postImportValidationEvidenceMissingCases || 0}`,
    `- Validation result: ${bundle.summary.postImportValidationResultStatus || 'not_started'}`,
    `- 다음 세션: ${bundle.summary.nextSessionCode || '없음'} / ${bundle.summary.nextDecisionId || '없음'}`,
    `- 원본 worktable CSV: ${bundle.summary.worktableCsvPath || '확인 필요'}`,
    '- 안전 정책: 자동 적용 금지, Graph/Reference/Model 승격 금지',
    '',
    '## Settings 등록 순서',
    ''
  ];

  bundle.settingsImportChecklist.forEach((item, index) => {
    lines.push(`${index + 1}. ${item.buttonLabelKo}: ${item.artifactPath}`);
  });

  lines.push('', '## 다음 작업', '');
  bundle.nextOperatorActions.forEach((action, index) => {
    lines.push(`${index + 1}. ${action.titleKo}: ${action.instructionKo}`);
    if (action.path) lines.push(`   - 경로: ${action.path}`);
    asArray(action.commands).forEach(command => lines.push(`   - ${command}`));
  });

  lines.push('', '## 세션 포인터', '');
  bundle.sessionPointers.forEach(session => {
    lines.push(`- P${session.priority} ${session.titleKo}: 대기 ${session.pendingRows}건, 고위험 ${session.highRiskRows}건, 첫 decision ${session.firstDecisionId}`);
    if (session.markdownPath) lines.push(`  - MD: ${session.markdownPath}`);
    if (session.csvPath) lines.push(`  - CSV: ${session.csvPath}`);
  });

  if (asArray(bundle.preparationWorksheetArtifacts).length > 0) {
    lines.push('', '## Preparation run worksheet artifacts', '');
    bundle.preparationWorksheetArtifacts.forEach(artifactPath => {
      lines.push(`- ${artifactPath}`);
    });
  }

  if (asArray(bundle.preparationDecisionTemplateArtifacts).length > 0) {
    lines.push('', '## Preparation run decision templates', '');
    bundle.preparationDecisionTemplateArtifacts.forEach(artifactPath => {
      lines.push(`- ${artifactPath}`);
    });
  }

  if (asArray(bundle.preparationHumanGatedCommands).length > 0) {
    lines.push('', '## Human-gated commands', '');
    bundle.preparationHumanGatedCommands.forEach(item => {
      lines.push(`- ${item.command}`);
      if (item.reason) lines.push(`  - Reason: ${item.reason}`);
    });
  }

  if (asArray(bundle.decisionReviewSectionPreviews).length > 0) {
    lines.push('', '## Decision review input status', '');
    bundle.decisionReviewSectionPreviews.forEach(section => {
      lines.push(`- ${section.queueCode}: prepared ${section.preparedDecisionItems} / pending ${section.pendingActions} / target ${section.targetPending}`);
      if (section.verificationCommand) lines.push(`  - Verify: ${section.verificationCommand}`);
      if (section.sourceArtifact) lines.push(`  - Template: ${section.sourceArtifact}`);
    });
  }

  if (asArray(bundle.visionCaptureWorkOrderPreviews).length > 0) {
    lines.push('', '## Vision capture work orders', '');
    bundle.visionCaptureWorkOrderPreviews.forEach(order => {
      lines.push(`- P${order.priority} ${order.defectClass}: ${order.actionType} / new ${order.missingApprovedSamples} / recapture ${order.recaptureSampleCount} / views ${asArray(order.requiredViews).join(', ')}`);
    });
  }

  if (bundle.summary.labelConflictGuideConflicts > 0) {
    lines.push('', '## Label conflict HITL guide', '');
    lines.push(`- Status: ${bundle.summary.labelConflictGuideStatus || 'unknown'}`);
    lines.push(`- First conflict: ${bundle.summary.labelConflictGuideFirstConflictId || 'none'}`);
    lines.push(`- Risk flags: ${asArray(bundle.summary.labelConflictGuideFirstRiskFlags).join(', ') || 'none'}`);
    if (bundle.summary.labelConflictGuideMarkdownPath) {
      lines.push(`- Markdown: ${bundle.summary.labelConflictGuideMarkdownPath}`);
    }
    if (bundle.summary.labelConflictGuidePath) {
      lines.push(`- JSON: ${bundle.summary.labelConflictGuidePath}`);
    }
  }

  return `${lines.join('\n')}\n`;
};

const buildOperationalStatusBundle = ({
  generatedAt = new Date().toISOString(),
  developmentProgress = null,
  pipelineStatus = null,
  humanDecisionBrief = null,
  visionCaptureWorkOrderPlan = null,
  labelConflictReviewGuide = null,
  webKnowledgeCommonAgentPackage = null,
  operationalPreparationRun = null,
  operationalDecisionInputReviewPacket = null,
  operationalReviewerWorksheet = null,
  sourceArtifacts = {},
  sourceArtifactPayloads = {},
  markdownPath = null
} = {}) => {
  const missingArtifactNames = requiredMissing({
    developmentProgress,
    pipelineStatus,
    humanDecisionBrief
  });

  if (missingArtifactNames.length > 0) {
    return missingEvidenceBundle({
      generatedAt,
      sourceArtifacts,
      missingArtifactNames
    });
  }

  const status = statusFor({
    developmentProgress,
    pipelineStatus,
    humanDecisionBrief
  });
  const sourceArtifactSnapshots = sourceArtifactSnapshotsFor({
    generatedAt,
    sourceArtifacts,
    sourceArtifactPayloads: {
      developmentProgress,
      pipelineStatus,
      humanDecisionBrief,
      visionCaptureWorkOrderPlan,
      labelConflictReviewGuide,
      webKnowledgeCommonAgentPackage,
      ...sourceArtifactPayloads
    }
  });
  const progressSummary = developmentProgress.summary || {};
  const humanSummary = humanDecisionBrief.summary || {};
  const captureWorkOrderSummary = captureWorkOrderSummaryFor(visionCaptureWorkOrderPlan);
  const labelConflictGuideSummary = labelConflictGuideSummaryFor({
    labelConflictReviewGuide,
    sourceArtifacts
  });
  const webKnowledgePackageSummary = webKnowledgePackageSummaryFor({
    webKnowledgeCommonAgentPackage,
    sourceArtifacts
  });
  const preparationWorksheetArtifacts = preparationWorksheetArtifactsFor(operationalPreparationRun);
  const preparationDecisionTemplateArtifacts = preparationDecisionTemplateArtifactsFor(operationalPreparationRun);
  const preparationHumanGatedCommands = preparationHumanGatedCommandsFor(operationalPreparationRun);
  const preparationRunSummary = preparationRunSummaryFor({
    operationalPreparationRun,
    sourceArtifacts,
    worksheetArtifacts: preparationWorksheetArtifacts,
    decisionTemplateArtifacts: preparationDecisionTemplateArtifacts,
    humanGatedCommands: preparationHumanGatedCommands
  });
  const decisionReviewPacketSummary = decisionReviewPacketSummaryFor({
    operationalDecisionInputReviewPacket,
    sourceArtifacts
  });
  const reviewerWorksheetSummary = reviewerWorksheetSummaryFor({
    operationalReviewerWorksheet,
    sourceArtifacts
  });
  const bundle = {
    schemaVersion: 1,
    contractVersion: 'operational-status-bundle/v1',
    generatedAt,
    sourceSystem: 'mold-master-ai',
    targetSystem: 'operator_common_agent',
    status,
    statusLabelKo: statusLabelKoFor(status),
    serviceWritesPerformed: false,
    localArtifactsWritten: true,
    policy: policy(),
    summary: {
      missingArtifacts: 0,
      missingArtifactNames: [],
      currentPhaseCode: compact(developmentProgress.currentPhase?.code),
      currentPhaseKo: compact(developmentProgress.currentPhase?.titleKo),
      currentPipelineStageCode: compact(pipelineStatus.currentStage?.code),
      currentPipelineStageKo: compact(pipelineStatus.currentStage?.titleKo),
      softwareScaffoldPercent: numberValue(developmentProgress.progress?.software?.percent),
      operationalProgressPercent: numberValue(developmentProgress.progress?.operational?.percent),
      visionBlockers: numberValue(progressSummary.visionBlockers),
      visionTasks: numberValue(progressSummary.visionTasks),
      hitlDecisionInputsMissing: numberValue(progressSummary.operationalHitlDecisionInputsMissing),
      hitlFirstQueueCode: compact(progressSummary.operationalHitlFirstQueueCode),
      pendingRows: numberValue(humanSummary.pendingRows),
      completedRows: numberValue(humanSummary.completedRows),
      invalidRows: numberValue(humanSummary.invalidRows),
      highRiskRows: numberValue(humanSummary.highRiskRows),
      webCards: numberValue(progressSummary.webCards),
      webTargetCards: numberValue(progressSummary.webTargetCards),
      webCommonAgentValidationPassed: numberValue(progressSummary.webCommonAgentValidationPassed),
      webHitlApprovalsMissing: numberValue(progressSummary.webHitlApprovalsMissing),
      webCentralApprovalsMissing: numberValue(progressSummary.webCentralApprovalsMissing),
      visionTop1Accuracy: numberValue(progressSummary.visionTop1Accuracy),
      visionTop3Accuracy: numberValue(progressSummary.visionTop3Accuracy),
      visionCaptureProtocolReadyRate: numberValue(progressSummary.visionCaptureProtocolReadyRate),
      visionAccuracyFirstTrackCode: compact(progressSummary.visionAccuracyFirstTrackCode),
      ...(captureWorkOrderSummary || {}),
      ...(labelConflictGuideSummary || {}),
      ...(webKnowledgePackageSummary || {}),
      ...(preparationRunSummary || {}),
      ...(decisionReviewPacketSummary || {}),
      ...(reviewerWorksheetSummary || {}),
      ...postImportValidationSummaryFor(pipelineStatus),
      topPriorityTaskCode: compact(progressSummary.topPriorityTaskCode),
      nextSessionCode: compact(humanSummary.nextSessionCode),
      nextDecisionId: compact(humanSummary.nextDecisionId),
      worktableCsvPath: compact(humanDecisionBrief.worktableCsvPath),
      embeddedSnapshotCount: sourceArtifactSnapshots.length
    },
    progressFeedbackKo: asArray(developmentProgress.progressFeedbackKo).map(compact).filter(Boolean),
    sourceArtifacts: sourceArtifactListFor(sourceArtifacts),
    sourceArtifactSnapshots,
    visionCaptureWorkOrderPreviews: captureWorkOrderPreviewsFor(visionCaptureWorkOrderPlan),
    preparationWorksheetArtifacts,
    preparationDecisionTemplateArtifacts,
    preparationHumanGatedCommands,
    decisionReviewSectionPreviews: decisionReviewSectionPreviewsFor(operationalDecisionInputReviewPacket),
    settingsImportChecklist: settingsImportChecklistFor(sourceArtifacts),
    nextOperatorActions: nextOperatorActionsFor({
      sourceArtifacts,
      humanDecisionBrief,
      preparationWorksheetArtifacts
    }),
    sessionPointers: sessionPointersFor(humanDecisionBrief),
    recommendedAction: compact(humanDecisionBrief.recommendedAction)
      || '다음 HITL 세션을 검토하고 원본 worktable CSV를 사람이 입력하세요.',
    markdownPath
  };

  return {
    ...bundle,
    markdown: markdownFor(bundle)
  };
};

module.exports = {
  buildOperationalStatusBundle,
  extractRestorableStatusBundleArtifacts
};
