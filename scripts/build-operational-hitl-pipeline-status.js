const fs = require('node:fs');
const path = require('node:path');
const {
  buildOperationalHitlPipelineStatus
} = require('../operationalHitlPipelineStatus');

const root = path.resolve(__dirname, '..');
const artifactRoot = path.join(root, 'artifacts');
const args = process.argv.slice(2);

const valueAfter = flag => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};

const timestamp = () => new Date().toISOString().replace(/[:.]/g, '-');

const latestArtifact = prefix => {
  if (!fs.existsSync(artifactRoot)) return null;
  return fs.readdirSync(artifactRoot)
    .filter(name => name.startsWith(prefix) && name.endsWith('.json'))
    .map(name => path.join(artifactRoot, name))
    .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs)
    .at(0) || null;
};

const latestCsv = prefix => {
  if (!fs.existsSync(artifactRoot)) return null;
  return fs.readdirSync(artifactRoot)
    .filter(name => name.startsWith(prefix) && name.endsWith('.csv'))
    .map(name => path.join(artifactRoot, name))
    .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs)
    .at(0) || null;
};

const latestWorkspaceManifest = () => {
  if (!fs.existsSync(artifactRoot)) return null;
  return fs.readdirSync(artifactRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && entry.name.startsWith('operational-hitl-editable-decision-workspace-'))
    .map(entry => path.join(artifactRoot, entry.name, 'manifest.json'))
    .filter(filePath => fs.existsSync(filePath))
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

const intakeStatusPath = resolveOptionalPath(
  valueAfter('--intake-status'),
  process.env.OPERATIONAL_HITL_DECISION_INTAKE_STATUS,
  latestArtifact('operational-hitl-decision-intake-status-')
);

const workspaceManifestPath = resolveOptionalPath(
  valueAfter('--workspace-manifest'),
  process.env.OPERATIONAL_HITL_EDITABLE_DECISION_WORKSPACE_MANIFEST,
  latestWorkspaceManifest()
);

const worktableExportPath = resolveOptionalPath(
  valueAfter('--worktable-export'),
  process.env.OPERATIONAL_HITL_DECISION_WORKTABLE_EXPORT,
  latestArtifact('operational-hitl-decision-worktable-export-')
);

const worktableCsvPath = resolveOptionalPath(
  valueAfter('--worktable-csv'),
  process.env.OPERATIONAL_HITL_DECISION_WORKTABLE_CSV,
  latestCsv('operational-hitl-decision-worktable-export-')
);

const worktableImportPath = resolveOptionalPath(
  valueAfter('--worktable-import'),
  process.env.OPERATIONAL_HITL_DECISION_WORKTABLE_IMPORT,
  latestArtifact('operational-hitl-decision-worktable-import-')
);

const worktableSuggestionPath = resolveOptionalPath(
  valueAfter('--worktable-suggestion'),
  process.env.OPERATIONAL_HITL_DECISION_WORKTABLE_SUGGESTION,
  latestArtifact('operational-hitl-decision-worktable-suggestion-')
);

const dryRunRoundtripPath = resolveOptionalPath(
  valueAfter('--dry-run-roundtrip'),
  process.env.OPERATIONAL_HITL_DRY_RUN_ROUNDTRIP,
  latestArtifact('operational-hitl-dry-run-roundtrip-')
);

const simulatedPreflightPath = resolveOptionalPath(
  valueAfter('--simulated-preflight'),
  process.env.OPERATIONAL_HITL_SIMULATED_PREFLIGHT,
  latestArtifact('operational-hitl-simulated-preflight-')
);

const reviewSessionPlanPath = resolveOptionalPath(
  valueAfter('--review-session-plan'),
  process.env.OPERATIONAL_HITL_REVIEW_SESSION_PLAN,
  latestArtifact('operational-hitl-review-session-plan-')
);

const reviewSessionPacketPath = resolveOptionalPath(
  valueAfter('--review-session-packet'),
  process.env.OPERATIONAL_HITL_REVIEW_SESSION_PACKET,
  latestArtifact('operational-hitl-review-session-packet-')
);

const reviewSessionProgressPath = resolveOptionalPath(
  valueAfter('--review-session-progress'),
  process.env.OPERATIONAL_HITL_REVIEW_SESSION_PROGRESS,
  latestArtifact('operational-hitl-review-session-progress-')
);

const preflightPath = resolveOptionalPath(
  valueAfter('--preflight'),
  process.env.OPERATIONAL_HITL_EDITABLE_DECISION_PREFLIGHT_REPORT,
  latestArtifact('operational-hitl-editable-decision-preflight-')
);

const verificationRunPath = resolveOptionalPath(
  valueAfter('--verification-run'),
  process.env.OPERATIONAL_HITL_VERIFICATION_RUN,
  latestArtifact('operational-hitl-verification-run-')
);

const commonAgentImportPath = resolveOptionalPath(
  valueAfter('--common-agent-import-package'),
  process.env.OPERATIONAL_HITL_COMMON_AGENT_IMPORT_PACKAGE,
  latestArtifact('operational-hitl-common-agent-import-package-')
);

const postImportValidationPath = resolveOptionalPath(
  valueAfter('--post-import-validation-plan'),
  process.env.OPERATIONAL_HITL_POST_IMPORT_VALIDATION_PLAN,
  latestArtifact('operational-hitl-post-import-validation-plan-')
);

const postImportValidationObservationsPath = resolveOptionalPath(
  valueAfter('--post-import-validation-observations'),
  process.env.OPERATIONAL_HITL_POST_IMPORT_VALIDATION_OBSERVATIONS,
  latestArtifact('operational-hitl-post-import-validation-observations-')
);

const postImportManualObservationTemplatePath = resolveOptionalPath(
  valueAfter('--post-import-manual-observation-template'),
  process.env.OPERATIONAL_HITL_POST_IMPORT_MANUAL_OBSERVATION_TEMPLATE,
  latestArtifact('operational-hitl-post-import-validation-manual-observations-template-')
);

const postImportValidationEvidencePath = resolveOptionalPath(
  valueAfter('--post-import-validation-evidence'),
  process.env.OPERATIONAL_HITL_POST_IMPORT_VALIDATION_EVIDENCE,
  latestArtifact('operational-hitl-post-import-validation-evidence-')
);

const postImportValidationResultPath = resolveOptionalPath(
  valueAfter('--post-import-validation-result'),
  process.env.OPERATIONAL_HITL_POST_IMPORT_VALIDATION_RESULT,
  latestArtifact('operational-hitl-post-import-validation-result-')
);

const baseOutput = valueAfter('--output-base')
  || process.env.OPERATIONAL_HITL_PIPELINE_STATUS_OUTPUT_BASE
  || path.join(artifactRoot, `operational-hitl-pipeline-status-${timestamp()}`);

const jsonOutputPath = path.resolve(`${baseOutput}.json`);
const markdownOutputPath = path.resolve(`${baseOutput}.md`);

const run = () => {
  const report = buildOperationalHitlPipelineStatus({
    intakeStatus: readOptionalJson(intakeStatusPath),
    workspaceManifest: readOptionalJson(workspaceManifestPath),
    worktableExport: readOptionalJson(worktableExportPath),
    worktableSuggestion: readOptionalJson(worktableSuggestionPath),
    dryRunRoundtrip: readOptionalJson(dryRunRoundtripPath),
    simulatedPreflight: readOptionalJson(simulatedPreflightPath),
    reviewSessionPlan: readOptionalJson(reviewSessionPlanPath),
    reviewSessionPacket: readOptionalJson(reviewSessionPacketPath),
    reviewSessionProgress: readOptionalJson(reviewSessionProgressPath),
    worktableImport: readOptionalJson(worktableImportPath),
    preflightReport: readOptionalJson(preflightPath),
    verificationRun: readOptionalJson(verificationRunPath),
    commonAgentImportPackage: readOptionalJson(commonAgentImportPath),
    postImportValidationPlan: readOptionalJson(postImportValidationPath),
    postImportValidationObservations: readOptionalJson(postImportValidationObservationsPath),
    postImportManualObservationTemplate: readOptionalJson(postImportManualObservationTemplatePath),
    postImportValidationEvidence: readOptionalJson(postImportValidationEvidencePath),
    postImportValidationResult: readOptionalJson(postImportValidationResultPath),
    sourceArtifacts: {
      intakeStatus: intakeStatusPath,
      workspaceManifest: workspaceManifestPath,
      worktableExport: worktableExportPath,
      worktableCsv: worktableCsvPath,
      worktableSuggestion: worktableSuggestionPath,
      dryRunRoundtrip: dryRunRoundtripPath,
      simulatedPreflight: simulatedPreflightPath,
      reviewSessionPlan: reviewSessionPlanPath,
      reviewSessionPacket: reviewSessionPacketPath,
      reviewSessionProgress: reviewSessionProgressPath,
      worktableImport: worktableImportPath,
      preflightReport: preflightPath,
      verificationRun: verificationRunPath,
      commonAgentImportPackage: commonAgentImportPath,
      postImportValidationPlan: postImportValidationPath,
      postImportValidationObservations: postImportValidationObservationsPath,
      postImportManualObservationTemplate: postImportManualObservationTemplatePath,
      postImportValidationEvidence: postImportValidationEvidencePath,
      postImportValidationResult: postImportValidationResultPath
    }
  });

  if (report.markdown) writeText(markdownOutputPath, report.markdown);
  writeJson(jsonOutputPath, {
    ...report,
    markdown: undefined,
    markdownPath: report.markdown ? markdownOutputPath : null
  });

  console.log(JSON.stringify({
    outputPath: jsonOutputPath,
    markdownPath: report.markdown ? markdownOutputPath : null,
    status: report.status,
    currentStage: report.currentStage.code,
    serviceWritesPerformed: report.serviceWritesPerformed,
    totalDecisionInputsMissing: report.summary.totalDecisionInputsMissing,
    worktableRows: report.summary.worktableRows,
    worktableInvalidRows: report.summary.worktableInvalidRows,
    worktableIgnoredSimulationOnlyRows: report.summary.worktableIgnoredSimulationOnlyRows,
    worktableSuggestionRows: report.summary.worktableSuggestionRows,
    worktableReviewSessionCount: report.summary.worktableReviewSessionCount,
    worktableReviewSessionHighRiskRows: report.summary.worktableReviewSessionHighRiskRows,
    worktableReviewSessionPacketCount: report.summary.worktableReviewSessionPacketCount,
    worktableReviewSessionPacketFiles: report.summary.worktableReviewSessionPacketFiles,
    worktableDryRunRoundtripPlannedUpdates: report.summary.worktableDryRunRoundtripPlannedUpdates,
    worktableDryRunRoundtripInvalidRows: report.summary.worktableDryRunRoundtripInvalidRows,
    worktableSimulatedPreflightPlannedUpdates: report.summary.worktableSimulatedPreflightPlannedUpdates,
    worktableSimulatedPreflightPendingDecisions: report.summary.worktableSimulatedPreflightPendingDecisions,
    worktableSimulatedPreflightMissingRequiredFields: report.summary.worktableSimulatedPreflightMissingRequiredFields,
    worktableReviewSessionProgressCompletedRows: report.summary.worktableReviewSessionProgressCompletedRows,
    worktableReviewSessionProgressPendingRows: report.summary.worktableReviewSessionProgressPendingRows,
    worktableReviewSessionProgressInvalidRows: report.summary.worktableReviewSessionProgressInvalidRows,
    worktableRecaptureSuggestions: report.summary.worktableRecaptureSuggestions,
    worktableApproveCandidateSuggestions: report.summary.worktableApproveCandidateSuggestions,
    worktableApproveCardSuggestions: report.summary.worktableApproveCardSuggestions,
    worktablePlannedUpdates: report.summary.worktablePlannedUpdates,
    preflightPendingDecisions: report.summary.preflightPendingDecisions,
    verificationCommandsExecuted: report.summary.verificationCommandsExecuted,
    commonAgentApprovedPayloads: report.summary.commonAgentApprovedPayloads,
    postImportValidationCases: report.summary.postImportValidationCases,
    postImportValidationObservationStatus: report.summary.postImportValidationObservationStatus,
    postImportGraphExecutableCases: report.summary.postImportGraphExecutableCases,
    postImportGraphCapturedCases: report.summary.postImportGraphCapturedCases,
    postImportGraphFailedCases: report.summary.postImportGraphFailedCases,
    postImportManualObservationRequiredCases: report.summary.postImportManualObservationRequiredCases,
    postImportManualObservationTemplateStatus: report.summary.postImportManualObservationTemplateStatus,
    postImportManualObservationRows: report.summary.postImportManualObservationRows,
    postImportValidationEvidenceStatus: report.summary.postImportValidationEvidenceStatus,
    postImportValidationObservedEvidenceCases: report.summary.postImportValidationObservedEvidenceCases,
    postImportValidationEvidenceMissingCases: report.summary.postImportValidationEvidenceMissingCases,
    postImportValidationResultStatus: report.summary.postImportValidationResultStatus,
    postImportValidationPassedCases: report.summary.postImportValidationPassedCases,
    postImportValidationFailedCases: report.summary.postImportValidationFailedCases,
    postImportValidationMissingEvidenceCases: report.summary.postImportValidationMissingEvidenceCases,
    postImportValidationPassRate: report.summary.postImportValidationPassRate,
    recommendedAction: report.recommendedAction
  }, null, 2));
};

try {
  run();
} catch (error) {
  const report = buildOperationalHitlPipelineStatus({
    sourceArtifacts: {
      intakeStatus: intakeStatusPath,
      workspaceManifest: workspaceManifestPath,
      worktableExport: worktableExportPath
    }
  });
  report.summary.error = error instanceof Error ? error.message : String(error);
  writeJson(jsonOutputPath, report);
  console.error(error);
  process.exitCode = 1;
}
