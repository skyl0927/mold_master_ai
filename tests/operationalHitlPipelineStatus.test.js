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

const simulationOnlyWorktableImport = () => ({
  contractVersion: 'operational-hitl-decision-worktable-import/v1',
  status: 'invalid_worktable',
  applyRequested: true,
  serviceWritesPerformed: false,
  localEditableWritesPerformed: false,
  summary: {
    totalRows: 59,
    plannedUpdates: 0,
    appliedUpdates: 0,
    invalidRows: 59,
    simulationOnlyRows: 59,
    filesToUpdate: 0
  },
  plannedUpdates: [],
  invalidRows: [
    {
      queueCode: 'vision_label_conflicts',
      decisionId: 'conflict-001',
      action: 'mark_needs_review',
      code: 'simulation_only_csv'
    }
  ]
});

const worktableSuggestion = () => ({
  contractVersion: 'operational-hitl-decision-worktable-suggestion/v1',
  status: 'ready_for_human_review',
  serviceWritesPerformed: false,
  summary: {
    totalRows: 59,
    pendingRows: 59,
    suggestionRows: 59,
    approveCandidateSuggestions: 7,
    approveCardSuggestions: 43,
    recaptureSuggestions: 5,
    needsReviewSuggestions: 4,
    needsChangesSuggestions: 0,
    rejectSuggestions: 0
  }
});

const reviewSessionPlan = () => ({
  contractVersion: 'operational-hitl-review-session-plan/v1',
  status: 'ready_for_human_review',
  serviceWritesPerformed: false,
  summary: {
    totalRows: 59,
    sessionCount: 4,
    highRiskRows: 9,
    recaptureRows: 5,
    approveCandidateRows: 7,
    approveCardRows: 43,
    needsReviewRows: 4,
    needsChangesRows: 0
  }
});

const reviewSessionPacket = () => ({
  contractVersion: 'operational-hitl-review-session-packet/v1',
  status: 'ready_for_human_review',
  serviceWritesPerformed: false,
  summary: {
    totalRows: 59,
    sessionPacketCount: 4,
    highRiskRows: 9,
    filesToWrite: 8
  }
});

const reviewSessionProgress = () => ({
  contractVersion: 'operational-hitl-review-session-progress/v1',
  status: 'awaiting_human_csv_decisions',
  serviceWritesPerformed: false,
  summary: {
    totalRows: 59,
    completedRows: 0,
    pendingRows: 59,
    invalidRows: 0,
    sessionCount: 4,
    completeSessionCount: 0,
    blockedSessionCount: 0,
    packetFiles: 8
  }
});

const dryRunRoundtrip = (status = 'simulated_roundtrip_ready') => ({
  contractVersion: 'operational-hitl-dry-run-roundtrip/v1',
  status,
  serviceWritesPerformed: false,
  localEditableWritesPerformed: false,
  summary: {
    totalRows: 59,
    simulatedRows: status === 'no_actionable_simulated_rows' ? 0 : 59,
    importPlannedUpdates: status === 'simulated_roundtrip_ready' ? 59 : 0,
    invalidRows: status === 'simulated_roundtrip_invalid' ? 1 : 0,
    filesToUpdate: status === 'simulated_roundtrip_ready' ? 3 : 0,
    verificationCommandCount: status === 'simulated_roundtrip_ready' ? 3 : 0
  }
});

const simulatedPreflight = (status = 'simulated_preflight_ready') => ({
  contractVersion: 'operational-hitl-simulated-preflight/v1',
  status,
  serviceWritesPerformed: false,
  localEditableWritesPerformed: false,
  summary: {
    totalRows: 59,
    importPlannedUpdates: status === 'blocked_roundtrip_invalid' ? 0 : 59,
    roundtripInvalidRows: status === 'blocked_roundtrip_invalid' ? 1 : 0,
    simulatedFilesUpdated: status === 'simulated_preflight_ready' ? 3 : 0,
    preflightPendingDecisions: status === 'simulated_preflight_ready' ? 0 : 12,
    preflightMissingRequiredFields: status === 'simulated_preflight_blocked' ? 2 : 0,
    readyForVerificationFileCount: status === 'simulated_preflight_ready' ? 3 : 0,
    verificationCommandCount: status === 'simulated_preflight_ready' ? 3 : 0
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
    'npm run operational:hitl:worktable-suggest',
    'npm run operational:hitl:dry-run-roundtrip',
    'npm run operational:hitl:simulated-preflight',
    'npm run operational:hitl:review-session-plan',
    'npm run operational:hitl:review-session-packet',
    'edit C:\\repo\\artifacts\\operational-hitl-decision-worktable-export.csv',
    'npm run operational:hitl:worktable-import',
    'npm run operational:hitl:session-progress'
  ]);
  assert.equal(status.policy.allowGraphPromotion, false);
  assert.equal(status.serviceWritesPerformed, false);
});

test('surfaces worktable suggestion metrics while awaiting human CSV decisions', () => {
  const status = buildOperationalHitlPipelineStatus({
    generatedAt: '2026-07-27T15:10:00.000Z',
    intakeStatus: intakeStatus(),
    workspaceManifest: workspaceManifest(),
    worktableExport: worktableExport(),
    worktableSuggestion: worktableSuggestion(),
    dryRunRoundtrip: dryRunRoundtrip(),
    simulatedPreflight: simulatedPreflight(),
    reviewSessionPlan: reviewSessionPlan(),
    reviewSessionPacket: reviewSessionPacket(),
    reviewSessionProgress: reviewSessionProgress(),
    worktableImport: worktableImport('no_actionable_rows'),
    preflightReport: preflight('needs_human_input'),
    sourceArtifacts: {
      worktableSuggestion: 'C:\\repo\\artifacts\\operational-hitl-decision-worktable-suggestion.json',
      dryRunRoundtrip: 'C:\\repo\\artifacts\\operational-hitl-dry-run-roundtrip.json',
      simulatedPreflight: 'C:\\repo\\artifacts\\operational-hitl-simulated-preflight.json',
      reviewSessionPlan: 'C:\\repo\\artifacts\\operational-hitl-review-session-plan.json',
      reviewSessionPacket: 'C:\\repo\\artifacts\\operational-hitl-review-session-packet.json',
      reviewSessionProgress: 'C:\\repo\\artifacts\\operational-hitl-review-session-progress.json'
    }
  });

  assert.equal(status.currentStage.code, 'awaiting_human_csv_decisions');
  assert.equal(status.summary.worktableSuggestionRows, 59);
  assert.equal(status.summary.worktableRecaptureSuggestions, 5);
  assert.equal(status.summary.worktableApproveCandidateSuggestions, 7);
  assert.equal(status.summary.worktableApproveCardSuggestions, 43);
  assert.equal(status.summary.worktableNeedsReviewSuggestions, 4);
  assert.equal(status.summary.worktableDryRunRoundtripSimulatedRows, 59);
  assert.equal(status.summary.worktableDryRunRoundtripPlannedUpdates, 59);
  assert.equal(status.summary.worktableDryRunRoundtripInvalidRows, 0);
  assert.equal(status.summary.worktableSimulatedPreflightPlannedUpdates, 59);
  assert.equal(status.summary.worktableSimulatedPreflightPendingDecisions, 0);
  assert.equal(status.summary.worktableSimulatedPreflightMissingRequiredFields, 0);
  assert.equal(status.summary.worktableSimulatedPreflightReadyFiles, 3);
  assert.equal(status.summary.worktableReviewSessionCount, 4);
  assert.equal(status.summary.worktableReviewSessionHighRiskRows, 9);
  assert.equal(status.summary.worktableReviewSessionPacketCount, 4);
  assert.equal(status.summary.worktableReviewSessionPacketHighRiskRows, 9);
  assert.equal(status.summary.worktableReviewSessionPacketFiles, 8);
  assert.equal(status.summary.worktableReviewSessionProgressCompletedRows, 0);
  assert.equal(status.summary.worktableReviewSessionProgressPendingRows, 59);
  assert.equal(status.summary.worktableReviewSessionProgressInvalidRows, 0);
  assert.equal(status.summary.worktableReviewSessionProgressCompleteSessions, 0);
  assert.equal(status.sources.worktableSuggestion, 'C:\\repo\\artifacts\\operational-hitl-decision-worktable-suggestion.json');
  assert.equal(status.sources.dryRunRoundtrip, 'C:\\repo\\artifacts\\operational-hitl-dry-run-roundtrip.json');
  assert.equal(status.sources.simulatedPreflight, 'C:\\repo\\artifacts\\operational-hitl-simulated-preflight.json');
  assert.equal(status.sources.reviewSessionPlan, 'C:\\repo\\artifacts\\operational-hitl-review-session-plan.json');
  assert.equal(status.sources.reviewSessionPacket, 'C:\\repo\\artifacts\\operational-hitl-review-session-packet.json');
  assert.equal(status.sources.reviewSessionProgress, 'C:\\repo\\artifacts\\operational-hitl-review-session-progress.json');
  assert.deepEqual(
    status.stageTrail.find(item => item.code === 'worktable_suggestion'),
    {
      code: 'worktable_suggestion',
      titleKo: 'Worktable suggestion',
      status: 'ready_for_human_review'
    }
  );
  assert.deepEqual(
    status.stageTrail.find(item => item.code === 'dry_run_roundtrip'),
    {
      code: 'dry_run_roundtrip',
      titleKo: 'Dry-run roundtrip',
      status: 'simulated_roundtrip_ready'
    }
  );
  assert.deepEqual(
    status.stageTrail.find(item => item.code === 'simulated_preflight'),
    {
      code: 'simulated_preflight',
      titleKo: 'Simulated preflight',
      status: 'simulated_preflight_ready'
    }
  );
  assert.deepEqual(
    status.stageTrail.find(item => item.code === 'review_session_plan'),
    {
      code: 'review_session_plan',
      titleKo: 'Review session plan',
      status: 'ready_for_human_review'
    }
  );
  assert.deepEqual(
    status.stageTrail.find(item => item.code === 'review_session_packet'),
    {
      code: 'review_session_packet',
      titleKo: 'Review session packet',
      status: 'ready_for_human_review'
    }
  );
  assert.deepEqual(
    status.stageTrail.find(item => item.code === 'review_session_progress'),
    {
      code: 'review_session_progress',
      titleKo: 'Review session progress',
      status: 'awaiting_human_csv_decisions'
    }
  );
  assert.match(status.markdown, /추천 row: 59/);
  assert.match(status.markdown, /추천값 roundtrip 계획 update: 59/);
  assert.match(status.markdown, /추천값 roundtrip 오류 row: 0/);
  assert.match(status.markdown, /추천값 preflight 계획 update: 59/);
  assert.match(status.markdown, /추천값 preflight pending: 0/);
  assert.match(status.markdown, /추천값 preflight 필수필드 누락: 0/);
  assert.match(status.markdown, /검토 세션: 4/);
  assert.match(status.markdown, /검토 패킷: 4/);
  assert.match(status.markdown, /세션 완료 row: 0/);
  assert.match(status.markdown, /세션 대기 row: 59/);
  assert.match(status.markdown, /재촬영 추천: 5/);
});

test('ignores simulation-only safety smoke imports when reporting the operational HITL bottleneck', () => {
  const status = buildOperationalHitlPipelineStatus({
    generatedAt: '2026-07-28T03:00:00.000Z',
    intakeStatus: intakeStatus(),
    workspaceManifest: workspaceManifest(),
    worktableExport: worktableExport(),
    worktableSuggestion: worktableSuggestion(),
    dryRunRoundtrip: dryRunRoundtrip(),
    simulatedPreflight: simulatedPreflight(),
    reviewSessionPlan: reviewSessionPlan(),
    reviewSessionPacket: reviewSessionPacket(),
    reviewSessionProgress: reviewSessionProgress(),
    worktableImport: simulationOnlyWorktableImport(),
    preflightReport: preflight('needs_human_input'),
    sourceArtifacts: {
      worktableCsv: 'C:\\repo\\artifacts\\operational-hitl-decision-worktable-export.csv',
      worktableImport: 'C:\\repo\\artifacts\\operational-hitl-decision-worktable-import-smoke.json'
    }
  });

  assert.equal(status.status, 'action_required');
  assert.equal(status.currentStage.code, 'awaiting_human_csv_decisions');
  assert.equal(status.summary.worktablePlannedUpdates, 0);
  assert.equal(status.summary.worktableInvalidRows, 0);
  assert.equal(status.summary.worktableIgnoredSimulationOnlyRows, 59);
  assert.equal(
    status.stageTrail.find(item => item.code === 'worktable_import').status,
    'ignored_simulation_only'
  );
  assert.equal(status.nextActions[0].code, 'fill_worktable_csv');
  assert.match(status.markdown, /무시된 simulation-only import row: 59/);
});

test('surfaces simulated preflight blockers before human CSV entry', () => {
  const status = buildOperationalHitlPipelineStatus({
    intakeStatus: intakeStatus(),
    workspaceManifest: workspaceManifest(),
    worktableExport: worktableExport(),
    worktableSuggestion: worktableSuggestion(),
    dryRunRoundtrip: dryRunRoundtrip(),
    simulatedPreflight: simulatedPreflight('simulated_preflight_blocked'),
    worktableImport: worktableImport('no_actionable_rows'),
    preflightReport: preflight('needs_human_input')
  });

  assert.equal(status.status, 'action_required');
  assert.equal(status.currentStage.code, 'fix_simulated_preflight');
  assert.equal(status.nextActions[0].code, 'fix_simulated_preflight');
  assert.equal(status.summary.worktableSimulatedPreflightPendingDecisions, 12);
  assert.equal(status.summary.worktableSimulatedPreflightMissingRequiredFields, 2);
  assert.deepEqual(status.nextActions[0].commands, [
    'npm run operational:hitl:simulated-preflight',
    'npm run operational:hitl:dry-run-roundtrip',
    'npm run operational:hitl:worktable-suggest'
  ]);
});

test('surfaces recommendation roundtrip gaps before human CSV entry', () => {
  const status = buildOperationalHitlPipelineStatus({
    intakeStatus: intakeStatus(),
    workspaceManifest: workspaceManifest(),
    worktableExport: worktableExport(),
    worktableSuggestion: worktableSuggestion(),
    dryRunRoundtrip: dryRunRoundtrip('simulated_roundtrip_invalid'),
    worktableImport: worktableImport('no_actionable_rows'),
    preflightReport: preflight('needs_human_input')
  });

  assert.equal(status.status, 'action_required');
  assert.equal(status.currentStage.code, 'fix_dry_run_roundtrip');
  assert.equal(status.nextActions[0].code, 'fix_dry_run_roundtrip');
  assert.equal(status.summary.worktableDryRunRoundtripInvalidRows, 1);
  assert.deepEqual(status.nextActions[0].commands, [
    'npm run operational:hitl:dry-run-roundtrip',
    'npm run operational:hitl:worktable-suggest'
  ]);
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
