const { buildSync } = require('esbuild');
const { spawnSync } = require('child_process');
const path = require('path');

const root = path.resolve(__dirname, '..');
const output = path.join(root, '.tmp-tests', 'common-agent-document.test.cjs');

buildSync({
    entryPoints: [path.join(root, 'tests', 'commonAgentDocumentService.test.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile: output
});

const result = spawnSync(process.execPath, [
    '--test',
    output,
    path.join(root, 'tests', 'apiConfigDefaults.test.js'),
    path.join(root, 'tests', 'moldMasterDevelopmentProgressReport.test.js'),
    path.join(root, 'tests', 'visionOperationalEvidencePacket.test.js'),
    path.join(root, 'tests', 'visionOperationalReadinessAudit.test.js'),
    path.join(root, 'tests', 'visionAccuracyImprovementPlan.test.js'),
    path.join(root, 'tests', 'operationalHitlDecisionIntakeStatus.test.js'),
    path.join(root, 'tests', 'operationalHitlActionPack.test.js'),
    path.join(root, 'tests', 'operationalHitlPreparationPlan.test.js'),
    path.join(root, 'tests', 'operationalHitlPreparationRun.test.js'),
    path.join(root, 'tests', 'operationalHitlDecisionInputReviewPacket.test.js'),
    path.join(root, 'tests', 'operationalHitlReviewerWorksheet.test.js'),
    path.join(root, 'tests', 'operationalHitlEditableDecisionWorkspace.test.js'),
    path.join(root, 'tests', 'operationalHitlEditableDecisionPreflight.test.js'),
    path.join(root, 'tests', 'operationalHitlDecisionWorktableExport.test.js'),
    path.join(root, 'tests', 'operationalHitlDecisionWorktableSuggestion.test.js'),
    path.join(root, 'tests', 'operationalHitlReviewSessionPlan.test.js'),
    path.join(root, 'tests', 'operationalHitlReviewSessionPacket.test.js'),
    path.join(root, 'tests', 'operationalHitlReviewSessionProgress.test.js'),
    path.join(root, 'tests', 'operationalHitlHumanDecisionBrief.test.js'),
    path.join(root, 'tests', 'operationalHitlDryRunRoundtrip.test.js'),
    path.join(root, 'tests', 'operationalHitlSimulatedPreflight.test.js'),
    path.join(root, 'tests', 'operationalHitlDecisionWorktableImport.test.js'),
    path.join(root, 'tests', 'operationalHitlVerificationRun.test.js'),
    path.join(root, 'tests', 'operationalHitlCommonAgentImportPackage.test.js'),
    path.join(root, 'tests', 'operationalHitlPostImportValidationPlan.test.js'),
    path.join(root, 'tests', 'operationalHitlPipelineStatus.test.js'),
    path.join(root, 'tests', 'operationalStatusRefresh.test.js'),
    path.join(root, 'tests', 'operationalStatusBundle.test.js'),
    path.join(root, 'tests', 'visionOperationalBlockerWorklist.test.js'),
    path.join(root, 'tests', 'visionOperationalCommonAgentHandoff.test.js'),
    path.join(root, 'tests', 'visionOperationalHitlWorkflowDisplay.test.js'),
    path.join(root, 'tests', 'visionApprovedLabelConflictReviewPacket.test.js'),
    path.join(root, 'tests', 'visionApprovedLabelConflictDecisions.test.js'),
    path.join(root, 'tests', 'visionApprovedLabelConflictReviewGuide.test.js'),
    path.join(root, 'tests', 'visionApprovedLabelConflictDecisionApply.test.js'),
    path.join(root, 'tests', 'visionPendingHitlReviewQueuePacket.test.js'),
    path.join(root, 'tests', 'visionPendingHitlDecisionTemplate.test.js'),
    path.join(root, 'tests', 'visionPendingHitlReviewGuide.test.js'),
    path.join(root, 'tests', 'visionPendingHitlDecisionVerification.test.js'),
    path.join(root, 'tests', 'visionPendingHitlAuthorizationBridge.test.js'),
    path.join(root, 'tests', 'visionPendingHitlNonApprovalWorklist.test.js'),
    path.join(root, 'tests', 'visionReferenceRepairGuide.test.js'),
    path.join(root, 'tests', 'webKnowledgeOperationalReadiness.test.js'),
    path.join(root, 'tests', 'webKnowledgeHitlDecisions.test.js'),
    path.join(root, 'tests', 'webKnowledgeHitlReviewGuide.test.js'),
    path.join(root, 'tests', 'webKnowledgeHitlDecisionApply.test.js'),
    path.join(root, 'tests', 'visionDiagnosticReliabilityCard.test.js'),
    path.join(root, 'tests', 'visionDiagnosticReliabilityDisplay.test.js'),
    path.join(root, 'tests', 'visionDiagnosisGuard.test.js'),
    path.join(root, 'tests', 'visionStructuredOutputSchema.test.js')
], {
    cwd: root,
    stdio: 'inherit'
});
process.exit(result.status ?? 1);
