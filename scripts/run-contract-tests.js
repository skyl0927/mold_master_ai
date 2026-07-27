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
    path.join(root, 'tests', 'visionOperationalBlockerWorklist.test.js'),
    path.join(root, 'tests', 'visionOperationalCommonAgentHandoff.test.js'),
    path.join(root, 'tests', 'visionOperationalHitlWorkflowDisplay.test.js'),
    path.join(root, 'tests', 'visionApprovedLabelConflictReviewPacket.test.js'),
    path.join(root, 'tests', 'visionApprovedLabelConflictDecisions.test.js'),
    path.join(root, 'tests', 'visionPendingHitlReviewQueuePacket.test.js'),
    path.join(root, 'tests', 'visionPendingHitlDecisionTemplate.test.js'),
    path.join(root, 'tests', 'visionPendingHitlDecisionVerification.test.js'),
    path.join(root, 'tests', 'visionPendingHitlAuthorizationBridge.test.js'),
    path.join(root, 'tests', 'visionPendingHitlNonApprovalWorklist.test.js'),
    path.join(root, 'tests', 'webKnowledgeOperationalReadiness.test.js'),
    path.join(root, 'tests', 'webKnowledgeHitlDecisions.test.js'),
    path.join(root, 'tests', 'webKnowledgeHitlDecisionApply.test.js'),
    path.join(root, 'tests', 'visionDiagnosisGuard.test.js'),
    path.join(root, 'tests', 'visionStructuredOutputSchema.test.js')
], {
    cwd: root,
    stdio: 'inherit'
});
process.exit(result.status ?? 1);
