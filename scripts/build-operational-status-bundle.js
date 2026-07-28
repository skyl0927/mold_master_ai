const fs = require('node:fs');
const path = require('node:path');
const {
  buildOperationalStatusBundle
} = require('../operationalStatusBundle');

const root = path.resolve(__dirname, '..');
const artifactRoot = path.join(root, 'artifacts');
const args = process.argv.slice(2);

const valueAfter = flag => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};

const timestamp = () => new Date().toISOString().replace(/[:.]/g, '-');

const latestFile = (prefix, extension) => {
  if (!fs.existsSync(artifactRoot)) return null;
  return fs.readdirSync(artifactRoot)
    .filter(name => name.startsWith(prefix) && name.endsWith(extension))
    .map(name => path.join(artifactRoot, name))
    .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs)
    .at(0) || null;
};

const resolveOptionalPath = (...candidates) => {
  const candidate = candidates.find(Boolean);
  return candidate ? path.resolve(candidate) : null;
};

const readOptionalJson = filePath => {
  if (!filePath || !fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
};

const writeText = (filePath, payload) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, payload, 'utf8');
};

const writeJson = (filePath, payload) => {
  writeText(filePath, `${JSON.stringify(payload, null, 2)}\n`);
};

const developmentProgressPath = resolveOptionalPath(
  valueAfter('--development-progress'),
  process.env.MOLD_MASTER_DEVELOPMENT_PROGRESS_REPORT,
  latestFile('mold-master-development-progress-report-', '.json')
);

const pipelineStatusPath = resolveOptionalPath(
  valueAfter('--pipeline-status'),
  process.env.OPERATIONAL_HITL_PIPELINE_STATUS,
  latestFile('operational-hitl-pipeline-status-', '.json')
);

const humanDecisionBriefPath = resolveOptionalPath(
  valueAfter('--human-decision-brief'),
  process.env.OPERATIONAL_HITL_HUMAN_DECISION_BRIEF,
  latestFile('operational-hitl-human-decision-brief-', '.json')
);

const humanDecisionBriefMarkdownPath = resolveOptionalPath(
  valueAfter('--human-decision-brief-md'),
  process.env.OPERATIONAL_HITL_HUMAN_DECISION_BRIEF_MARKDOWN,
  latestFile('operational-hitl-human-decision-brief-', '.md')
);

const reviewSessionPacketPath = resolveOptionalPath(
  valueAfter('--review-session-packet'),
  process.env.OPERATIONAL_HITL_REVIEW_SESSION_PACKET,
  latestFile('operational-hitl-review-session-packet-', '.json')
);

const reviewSessionProgressPath = resolveOptionalPath(
  valueAfter('--review-session-progress'),
  process.env.OPERATIONAL_HITL_REVIEW_SESSION_PROGRESS,
  latestFile('operational-hitl-review-session-progress-', '.json')
);

const reviewSessionProgressMarkdownPath = resolveOptionalPath(
  valueAfter('--review-session-progress-md'),
  process.env.OPERATIONAL_HITL_REVIEW_SESSION_PROGRESS_MARKDOWN,
  latestFile('operational-hitl-review-session-progress-', '.md')
);

const worktableSuggestionPath = resolveOptionalPath(
  valueAfter('--worktable-suggestion'),
  process.env.OPERATIONAL_HITL_DECISION_WORKTABLE_SUGGESTION,
  latestFile('operational-hitl-decision-worktable-suggestion-', '.json')
);

const visionCaptureWorkOrderPlanPath = resolveOptionalPath(
  valueAfter('--vision-capture-work-orders'),
  process.env.VISION_CAPTURE_WORK_ORDER_PLAN,
  latestFile('vision-capture-work-order-plan-', '.json')
);

const labelConflictReviewGuidePath = resolveOptionalPath(
  valueAfter('--label-conflict-review-guide'),
  process.env.VISION_APPROVED_LABEL_CONFLICT_REVIEW_GUIDE,
  latestFile('vision-approved-label-conflict-review-guide-', '.json')
);

const labelConflictReviewGuideMarkdownPath = resolveOptionalPath(
  valueAfter('--label-conflict-review-guide-md'),
  process.env.VISION_APPROVED_LABEL_CONFLICT_REVIEW_GUIDE_MARKDOWN,
  latestFile('vision-approved-label-conflict-review-guide-', '.md')
);

const webKnowledgeCommonAgentPackagePath = resolveOptionalPath(
  valueAfter('--web-knowledge-common-agent-package'),
  process.env.WEB_KNOWLEDGE_COMMON_AGENT_LEARNING_PACKAGE,
  latestFile('web-knowledge-common-agent-learning-package-', '.json')
);

const operationalPreparationRunPath = resolveOptionalPath(
  valueAfter('--preparation-run'),
  process.env.OPERATIONAL_HITL_PREPARATION_RUN,
  latestFile('operational-hitl-preparation-run-', '.json')
);

const operationalDecisionInputReviewPacketPath = resolveOptionalPath(
  valueAfter('--decision-review-packet'),
  process.env.OPERATIONAL_HITL_DECISION_INPUT_REVIEW_PACKET,
  latestFile('operational-hitl-decision-input-review-packet-', '.json')
);

const operationalReviewerWorksheetPath = resolveOptionalPath(
  valueAfter('--reviewer-worksheet'),
  process.env.OPERATIONAL_HITL_REVIEWER_WORKSHEET,
  latestFile('operational-hitl-reviewer-worksheet-', '.json')
);

const operationalReviewerWorksheetMarkdownPath = resolveOptionalPath(
  valueAfter('--reviewer-worksheet-md'),
  process.env.OPERATIONAL_HITL_REVIEWER_WORKSHEET_MARKDOWN,
  latestFile('operational-hitl-reviewer-worksheet-', '.md')
);

const baseOutput = valueAfter('--output-base')
  || process.env.OPERATIONAL_STATUS_BUNDLE_OUTPUT_BASE
  || path.join(artifactRoot, `operational-status-bundle-${timestamp()}`);

const jsonOutputPath = path.resolve(`${baseOutput}.json`);
const markdownOutputPath = path.resolve(`${baseOutput}.md`);

const run = () => {
  const developmentProgress = readOptionalJson(developmentProgressPath);
  const pipelineStatus = readOptionalJson(pipelineStatusPath);
  const humanDecisionBrief = readOptionalJson(humanDecisionBriefPath);
  const reviewSessionPacket = readOptionalJson(reviewSessionPacketPath);
  const reviewSessionProgress = readOptionalJson(reviewSessionProgressPath);
  const worktableSuggestion = readOptionalJson(worktableSuggestionPath);
  const visionCaptureWorkOrderPlan = readOptionalJson(visionCaptureWorkOrderPlanPath);
  const labelConflictReviewGuide = readOptionalJson(labelConflictReviewGuidePath);
  const webKnowledgeCommonAgentPackage = readOptionalJson(webKnowledgeCommonAgentPackagePath);
  const operationalPreparationRun = readOptionalJson(operationalPreparationRunPath);
  const operationalDecisionInputReviewPacket = readOptionalJson(operationalDecisionInputReviewPacketPath);
  const operationalReviewerWorksheet = readOptionalJson(operationalReviewerWorksheetPath);
  const bundle = buildOperationalStatusBundle({
    developmentProgress,
    pipelineStatus,
    humanDecisionBrief,
    visionCaptureWorkOrderPlan,
    labelConflictReviewGuide,
    webKnowledgeCommonAgentPackage,
    operationalPreparationRun,
    operationalDecisionInputReviewPacket,
    operationalReviewerWorksheet,
    operationalReviewSessionProgress: reviewSessionProgress,
    markdownPath: markdownOutputPath,
    sourceArtifacts: {
      developmentProgress: developmentProgressPath,
      pipelineStatus: pipelineStatusPath,
      humanDecisionBrief: humanDecisionBriefPath,
      humanDecisionBriefMarkdown: humanDecisionBriefMarkdownPath,
      reviewSessionPacket: reviewSessionPacketPath,
      reviewSessionProgress: reviewSessionProgressPath,
      reviewSessionProgressMarkdown: reviewSessionProgressMarkdownPath,
      worktableSuggestion: worktableSuggestionPath,
      visionCaptureWorkOrderPlan: visionCaptureWorkOrderPlanPath,
      labelConflictReviewGuide: labelConflictReviewGuidePath,
      labelConflictReviewGuideMarkdown: labelConflictReviewGuideMarkdownPath,
      webKnowledgeCommonAgentPackage: webKnowledgeCommonAgentPackagePath,
      operationalPreparationRun: operationalPreparationRunPath,
      operationalDecisionInputReviewPacket: operationalDecisionInputReviewPacketPath,
      operationalReviewerWorksheet: operationalReviewerWorksheetPath,
      operationalReviewerWorksheetMarkdown: operationalReviewerWorksheetMarkdownPath
    },
    sourceArtifactPayloads: {
      reviewSessionPacket,
      reviewSessionProgress,
      worktableSuggestion,
      visionCaptureWorkOrderPlan,
      labelConflictReviewGuide,
      webKnowledgeCommonAgentPackage,
      operationalPreparationRun,
      operationalDecisionInputReviewPacket,
      operationalReviewerWorksheet
    }
  });

  if (bundle.markdown) writeText(markdownOutputPath, bundle.markdown);
  writeJson(jsonOutputPath, {
    ...bundle,
    markdown: undefined,
    markdownPath: bundle.markdown ? markdownOutputPath : null
  });

  console.log(JSON.stringify({
    outputPath: jsonOutputPath,
    markdownPath: bundle.markdown ? markdownOutputPath : null,
    status: bundle.status,
    statusLabelKo: bundle.statusLabelKo,
    serviceWritesPerformed: bundle.serviceWritesPerformed,
    softwareScaffoldPercent: bundle.summary.softwareScaffoldPercent ?? null,
    operationalProgressPercent: bundle.summary.operationalProgressPercent ?? null,
    hitlDecisionInputsMissing: bundle.summary.hitlDecisionInputsMissing ?? null,
    pendingRows: bundle.summary.pendingRows ?? null,
    highRiskRows: bundle.summary.highRiskRows ?? null,
    webCards: bundle.summary.webCards ?? null,
    webTargetCards: bundle.summary.webTargetCards ?? null,
    webCommonAgentValidationPassed: bundle.summary.webCommonAgentValidationPassed ?? null,
    webCentralApprovalsMissing: bundle.summary.webCentralApprovalsMissing ?? null,
    visionCaptureWorkOrders: bundle.summary.visionCaptureWorkOrders ?? null,
    visionCaptureTopPriorityDefectClass: bundle.summary.visionCaptureTopPriorityDefectClass ?? null,
    labelConflictGuideConflicts: bundle.summary.labelConflictGuideConflicts ?? null,
    labelConflictGuideFirstConflictId: bundle.summary.labelConflictGuideFirstConflictId ?? null,
    labelConflictGuideMarkdownPath: bundle.summary.labelConflictGuideMarkdownPath ?? null,
    webKnowledgePackageStatus: bundle.summary.webKnowledgePackageStatus ?? null,
    webKnowledgePackageItems: bundle.summary.webKnowledgePackageItems ?? null,
    webKnowledgeGraphRoundtripCases: bundle.summary.webKnowledgeGraphRoundtripCases ?? null,
    webKnowledgeCommonAgentRequestedAction: bundle.summary.webKnowledgeCommonAgentRequestedAction ?? null,
    webKnowledgePackagePath: bundle.summary.webKnowledgePackagePath ?? null,
    preparationRunStatus: bundle.summary.preparationRunStatus ?? null,
    preparationGeneratedArtifacts: bundle.summary.preparationGeneratedArtifacts ?? null,
    preparationWorksheetArtifacts: bundle.summary.preparationWorksheetArtifacts ?? null,
    preparationDecisionTemplates: bundle.summary.preparationDecisionTemplates ?? null,
    preparationHumanGatedCommands: bundle.summary.preparationHumanGatedCommands ?? null,
    preparationFirstWorksheetArtifactPath: bundle.summary.preparationFirstWorksheetArtifactPath ?? null,
    preparationFirstDecisionTemplatePath: bundle.summary.preparationFirstDecisionTemplatePath ?? null,
    preparationFirstHumanGatedCommand: bundle.summary.preparationFirstHumanGatedCommand ?? null,
    preparationRunPath: bundle.summary.preparationRunPath ?? null,
    decisionReviewPacketStatus: bundle.summary.decisionReviewPacketStatus ?? null,
    decisionReviewTotalTemplateItems: bundle.summary.decisionReviewTotalTemplateItems ?? null,
    decisionReviewTotalPendingActions: bundle.summary.decisionReviewTotalPendingActions ?? null,
    decisionReviewTargetInputsMissing: bundle.summary.decisionReviewTargetInputsMissing ?? null,
    decisionReviewFirstQueueCode: bundle.summary.decisionReviewFirstQueueCode ?? null,
    decisionReviewPacketPath: bundle.summary.decisionReviewPacketPath ?? null,
    reviewerWorksheetStatus: bundle.summary.reviewerWorksheetStatus ?? null,
    reviewerWorksheetTargetInputsMissing: bundle.summary.reviewerWorksheetTargetInputsMissing ?? null,
    reviewerWorksheetFirstQueueCode: bundle.summary.reviewerWorksheetFirstQueueCode ?? null,
    reviewerWorksheetSlipQueueCount: bundle.summary.reviewerWorksheetSlipQueueCount ?? null,
    reviewerWorksheetWorktableMatchedSlips: bundle.summary.reviewerWorksheetWorktableMatchedSlips ?? null,
    reviewerWorksheetFirstWorktableDecisionId: bundle.summary.reviewerWorksheetFirstWorktableDecisionId ?? null,
    reviewerWorksheetFirstWorktableCsvPath: bundle.summary.reviewerWorksheetFirstWorktableCsvPath ?? null,
    reviewerWorksheetFirstWorktableCopyableText: bundle.summary.reviewerWorksheetFirstWorktableCopyableText ?? null,
    reviewerWorksheetFirstWorktableManualText: bundle.summary.reviewerWorksheetFirstWorktableManualText ?? null,
    reviewerWorksheetWorktableBridgePreviewText: bundle.summary.reviewerWorksheetWorktableBridgePreviewText ?? null,
    reviewerWorksheetWorktableBridgeScopeText: bundle.summary.reviewerWorksheetWorktableBridgeScopeText ?? null,
    reviewerWorksheetWorktableBridgePreviewCount: bundle.reviewerWorksheetWorktableBridgePreviews?.length ?? 0,
    reviewSessionProgressStatus: bundle.summary.reviewSessionProgressStatus ?? null,
    reviewSessionProgressPendingRows: bundle.summary.reviewSessionProgressPendingRows ?? null,
    reviewSessionProgressInvalidRows: bundle.summary.reviewSessionProgressInvalidRows ?? null,
    reviewSessionProgressNextSessionCode: bundle.summary.reviewSessionProgressNextSessionCode ?? null,
    reviewSessionProgressNextDecisionId: bundle.summary.reviewSessionProgressNextDecisionId ?? null,
    reviewSessionProgressNextRecommendedAction: bundle.summary.reviewSessionProgressNextRecommendedAction ?? null,
    reviewSessionProgressPath: bundle.summary.reviewSessionProgressPath ?? null,
    reviewerWorksheetMarkdownLineCount: bundle.summary.reviewerWorksheetMarkdownLineCount ?? null,
    reviewerWorksheetPath: bundle.summary.reviewerWorksheetPath ?? null,
    reviewerWorksheetMarkdownPath: bundle.summary.reviewerWorksheetMarkdownPath ?? null,
    postImportValidationCases: bundle.summary.postImportValidationCases ?? null,
    postImportValidationObservationStatus: bundle.summary.postImportValidationObservationStatus ?? null,
    postImportGraphCapturedCases: bundle.summary.postImportGraphCapturedCases ?? null,
    postImportGraphExecutableCases: bundle.summary.postImportGraphExecutableCases ?? null,
    postImportGraphFailedCases: bundle.summary.postImportGraphFailedCases ?? null,
    postImportManualObservationRows: bundle.summary.postImportManualObservationRows ?? null,
    postImportValidationObservedEvidenceCases: bundle.summary.postImportValidationObservedEvidenceCases ?? null,
    postImportValidationEvidenceMissingCases: bundle.summary.postImportValidationEvidenceMissingCases ?? null,
    postImportValidationResultStatus: bundle.summary.postImportValidationResultStatus ?? null,
    nextSessionCode: bundle.summary.nextSessionCode ?? null,
    nextDecisionId: bundle.summary.nextDecisionId ?? null,
    embeddedSnapshotCount: bundle.summary.embeddedSnapshotCount ?? 0,
    settingsImportButtons: bundle.settingsImportChecklist.map(item => item.buttonLabelKo),
    recommendedAction: bundle.recommendedAction
  }, null, 2));
};

try {
  run();
} catch (error) {
  const bundle = buildOperationalStatusBundle({
    sourceArtifacts: {
      developmentProgress: developmentProgressPath,
      pipelineStatus: pipelineStatusPath,
      humanDecisionBrief: humanDecisionBriefPath,
      humanDecisionBriefMarkdown: humanDecisionBriefMarkdownPath,
      reviewSessionPacket: reviewSessionPacketPath,
      reviewSessionProgress: reviewSessionProgressPath,
      reviewSessionProgressMarkdown: reviewSessionProgressMarkdownPath,
      worktableSuggestion: worktableSuggestionPath,
      visionCaptureWorkOrderPlan: visionCaptureWorkOrderPlanPath,
      labelConflictReviewGuide: labelConflictReviewGuidePath,
      labelConflictReviewGuideMarkdown: labelConflictReviewGuideMarkdownPath,
      webKnowledgeCommonAgentPackage: webKnowledgeCommonAgentPackagePath,
      operationalPreparationRun: operationalPreparationRunPath,
      operationalDecisionInputReviewPacket: operationalDecisionInputReviewPacketPath,
      operationalReviewerWorksheet: operationalReviewerWorksheetPath,
      operationalReviewerWorksheetMarkdown: operationalReviewerWorksheetMarkdownPath
    }
  });
  bundle.summary.error = error instanceof Error ? error.message : String(error);
  writeJson(jsonOutputPath, bundle);
  console.error(error);
  process.exitCode = 1;
}
