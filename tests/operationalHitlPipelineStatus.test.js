const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildOperationalHitlPipelineStatus
} = require('../operationalHitlPipelineStatus');

const intakeStatus = (pending = 59) => ({
  contractVersion: 'operational-hitl-decision-intake-status/v1',
  status: pending > 0 ? 'action_required' : 'clear',
  summary: {
    totalDecisionInputsMissing: pending,
    labelConflictPending: 4,
    visionHitlPending: 12,
    webHitlMissing: 43,
    firstQueueCode: pending > 0 ? 'vision_label_conflicts' : null
  }
});

const workspaceManifest = () => ({
  contractVersion: 'operational-hitl-editable-decision-workspace/v1',
  status: 'ready_for_human_edit',
  workspaceRoot: 'C:\\repo\\artifacts\\workspace',
  summary: {
    totalDecisionInputsMissing: 56,
    totalPendingActions: 59,
    workspaceFileCount: 3
  }
});

const worktableExport = () => ({
  contractVersion: 'operational-hitl-decision-worktable-export/v1',
  status: 'ready_for_human_edit',
  summary: {
    decisionRowCount: 59,
    pendingRowCount: 59,
    actionableRowCount: 0,
    queueCount: 3
  },
  csvPath: 'C:\\repo\\artifacts\\operational-hitl-decision-worktable-export.csv',
  markdownPath: 'C:\\repo\\artifacts\\operational-hitl-decision-worktable-export.md'
});

const worktableImport = status => ({
  contractVersion: 'operational-hitl-decision-worktable-import/v1',
  status,
  applyRequested: status === 'applied',
  serviceWritesPerformed: false,
  localEditableWritesPerformed: status === 'applied',
  summary: {
    totalRows: 59,
    plannedUpdates: status === 'no_actionable_rows' ? 0 : 59,
    appliedUpdates: status === 'applied' ? 59 : 0,
    invalidRows: 0,
    filesToUpdate: status === 'no_actionable_rows' ? 0 : 3
  }
});

const preflight = status => ({
  contractVersion: 'operational-hitl-editable-decision-preflight/v1',
  status,
  serviceWritesPerformed: false,
  summary: {
    totalDecisionItems: 59,
    pendingDecisionCount: status === 'ready_for_verification' ? 0 : 59,
    invalidActionCount: 0,
    missingRequiredFieldCount: 0,
    readyForVerificationFileCount: status === 'ready_for_verification' ? 3 : 0
  },
  verificationCommandsReady: status === 'ready_for_verification'
    ? [
      'npm run vision:label-conflicts:verify-decisions -- --decisions "C:\\repo\\workspace\\01.json"',
      'npm run vision:hitl:verify-decisions -- --decisions "C:\\repo\\workspace\\02.json"',
      'npm run knowledge:web:hitl:verify-decisions -- --decisions "C:\\repo\\workspace\\03.json"'
    ]
    : []
});

const verificationRun = status => ({
  contractVersion: 'operational-hitl-verification-run/v1',
  status,
  executeRequested: status === 'executed',
  serviceWritesPerformed: false,
  summary: {
    commandsPlanned: status === 'blocked_preflight_not_ready' ? 0 : 3,
    commandsExecuted: status === 'executed' ? 3 : 0,
    failedCommands: 0,
    invalidCommands: 0
  }
});

const commonAgentImportPackage = status => ({
  contractVersion: 'operational-hitl-common-agent-import-package/v1',
  status,
  manualImportAllowed: status === 'ready_for_common_agent_review',
  serviceWritesPerformed: false,
  summary: {
    sourceReportsReady: status === 'ready_for_common_agent_review' ? 3 : 0,
    blockingReports: status === 'ready_for_common_agent_review' ? 0 : 3,
    totalApprovedPayloads: status === 'ready_for_common_agent_review' ? 44 : 0
  }
});

const postImportValidationPlan = status => ({
  contractVersion: 'operational-hitl-post-import-validation-plan/v1',
  status,
  serviceWritesPerformed: false,
  summary: {
    totalTestCases: status === 'ready_for_post_import_validation' ? 44 : 0,
    graphRagCases: status === 'ready_for_post_import_validation' ? 40 : 0,
    visionRoundtripCases: status === 'ready_for_post_import_validation' ? 3 : 0,
    labelConflictCases: status === 'ready_for_post_import_validation' ? 1 : 0
  }
});

test('reports the real current bottleneck as waiting for human CSV decisions', () => {
  const status = buildOperationalHitlPipelineStatus({
    generatedAt: '2026-07-27T14:50:00.000Z',
    intakeStatus: intakeStatus(),
    workspaceManifest: workspaceManifest(),
    worktableExport: worktableExport(),
    worktableImport: worktableImport('no_actionable_rows'),
    preflightReport: preflight('needs_human_input'),
    verificationRun: verificationRun('blocked_preflight_not_ready'),
    commonAgentImportPackage: commonAgentImportPackage('blocked_pending_hitl_verification'),
    postImportValidationPlan: postImportValidationPlan('blocked_import_package_not_ready'),
    sourceArtifacts: {
      worktableCsv: 'C:\\repo\\artifacts\\operational-hitl-decision-worktable-export.csv'
    }
  });

  assert.equal(status.contractVersion, 'operational-hitl-pipeline-status/v1');
  assert.equal(status.status, 'action_required');
  assert.equal(status.currentStage.code, 'awaiting_human_csv_decisions');
  assert.equal(status.summary.totalDecisionInputsMissing, 59);
  assert.equal(status.summary.worktableRows, 59);
  assert.equal(status.summary.worktablePlannedUpdates, 0);
  assert.equal(status.nextActions[0].code, 'fill_worktable_csv');
  assert.match(status.nextActions[0].instructionKo, /newAction/);
  assert.deepEqual(status.nextActions[0].commands, [
    'edit C:\\repo\\artifacts\\operational-hitl-decision-worktable-export.csv',
    'npm run operational:hitl:worktable-import'
  ]);
  assert.equal(status.policy.allowGraphPromotion, false);
  assert.equal(status.serviceWritesPerformed, false);
});

test('routes dry-run update plans to explicit worktable apply', () => {
  const status = buildOperationalHitlPipelineStatus({
    intakeStatus: intakeStatus(),
    workspaceManifest: workspaceManifest(),
    worktableExport: worktableExport(),
    worktableImport: worktableImport('dry_run_ready'),
    preflightReport: preflight('needs_human_input')
  });

  assert.equal(status.currentStage.code, 'review_worktable_import_plan');
  assert.equal(status.nextActions[0].code, 'apply_worktable_import');
  assert.deepEqual(status.nextActions[0].commands, [
    'npm run operational:hitl:worktable-import -- --apply',
    'npm run operational:hitl:editable-preflight'
  ]);
});

test('routes ready preflight to HITL verification execution', () => {
  const status = buildOperationalHitlPipelineStatus({
    intakeStatus: intakeStatus(),
    workspaceManifest: workspaceManifest(),
    worktableExport: worktableExport(),
    worktableImport: worktableImport('applied'),
    preflightReport: preflight('ready_for_verification'),
    verificationRun: verificationRun('plan_ready')
  });

  assert.equal(status.currentStage.code, 'execute_hitl_verification');
  assert.equal(status.nextActions[0].code, 'execute_verify_run');
  assert.deepEqual(status.nextActions[0].commands, [
    'npm run operational:hitl:verify-run -- --execute',
    'npm run operational:hitl:common-agent-import-package'
  ]);
});

test('routes ready import packages to Common Agent manual review and post-import validation', () => {
  const status = buildOperationalHitlPipelineStatus({
    intakeStatus: intakeStatus(0),
    workspaceManifest: workspaceManifest(),
    worktableExport: worktableExport(),
    worktableImport: worktableImport('applied'),
    preflightReport: preflight('ready_for_verification'),
    verificationRun: verificationRun('executed'),
    commonAgentImportPackage: commonAgentImportPackage('ready_for_common_agent_review'),
    postImportValidationPlan: postImportValidationPlan('ready_for_post_import_validation')
  });

  assert.equal(status.status, 'ready_for_common_agent_manual_review');
  assert.equal(status.currentStage.code, 'common_agent_manual_review');
  assert.equal(status.nextActions[0].code, 'common_agent_manual_import_review');
  assert.equal(status.summary.postImportValidationCases, 44);
  assert.match(status.recommendedAction, /Common Agent/);
});

test('fails closed when required pipeline evidence is missing', () => {
  const status = buildOperationalHitlPipelineStatus({});

  assert.equal(status.status, 'missing_evidence');
  assert.equal(status.summary.missingArtifacts, 3);
  assert.deepEqual(status.summary.missingArtifactNames, [
    'intakeStatus',
    'workspaceManifest',
    'worktableExport'
  ]);
  assert.equal(status.nextActions[0].code, 'regenerate_hitl_pipeline_evidence');
});
