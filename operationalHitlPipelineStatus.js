const asArray = value => Array.isArray(value) ? value : [];

const compact = value => String(value || '').replace(/\s+/g, ' ').trim();

const isContract = (artifact, contractVersion) =>
  artifact?.contractVersion === contractVersion;

const numberFrom = (...values) => {
  const value = values.find(item => Number.isFinite(Number(item)));
  return value === undefined ? 0 : Number(value);
};

const policy = () => ({
  requiresHumanReview: true,
  automaticServiceWritesAllowed: false,
  autoApplyAllowed: false,
  allowGraphPromotion: false,
  allowReferenceLearning: false,
  allowModelTraining: false
});

const simulationOnlyImportRows = worktableImport => {
  const invalidRows = numberFrom(worktableImport?.summary?.invalidRows);
  const simulationOnlyRows = numberFrom(worktableImport?.summary?.simulationOnlyRows);
  return invalidRows > 0
    && simulationOnlyRows > 0
    && simulationOnlyRows >= invalidRows
    && numberFrom(worktableImport?.summary?.plannedUpdates) === 0
    && worktableImport?.localEditableWritesPerformed !== true
    ? simulationOnlyRows
    : 0;
};

const normalizeOperationalWorktableImport = worktableImport => {
  const ignoredSimulationOnlyRows = simulationOnlyImportRows(worktableImport);
  if (ignoredSimulationOnlyRows === 0) return worktableImport;
  return {
    ...worktableImport,
    status: 'ignored_simulation_only',
    summary: {
      ...worktableImport.summary,
      plannedUpdates: 0,
      appliedUpdates: 0,
      invalidRows: 0,
      ignoredSimulationOnlyRows
    },
    plannedUpdates: [],
    invalidRows: []
  };
};

const requiredMissing = ({
  intakeStatus,
  workspaceManifest,
  worktableExport
}) => [
  !isContract(intakeStatus, 'operational-hitl-decision-intake-status/v1') ? 'intakeStatus' : null,
  !isContract(workspaceManifest, 'operational-hitl-editable-decision-workspace/v1') ? 'workspaceManifest' : null,
  !isContract(worktableExport, 'operational-hitl-decision-worktable-export/v1') ? 'worktableExport' : null
].filter(Boolean);

const action = ({
  code,
  titleKo,
  instructionKo,
  commands,
  owner = 'quality_hitl',
  priority = 100
}) => ({
  code,
  titleKo,
  instructionKo,
  commands,
  owner,
  priority,
  requiresHumanReview: true,
  autoApplyAllowed: false
});

const stage = ({
  code,
  titleKo,
  status,
  feedbackKo
}) => ({
  code,
  titleKo,
  status,
  feedbackKo
});

const missingEvidenceStatus = ({ generatedAt, missingArtifactNames, sourceArtifacts }) => ({
  schemaVersion: 1,
  contractVersion: 'operational-hitl-pipeline-status/v1',
  generatedAt,
  sourceSystem: 'mold-master-ai',
  targetSystem: 'operator_common_agent',
  status: 'missing_evidence',
  serviceWritesPerformed: false,
  localArtifactsWritten: true,
  policy: policy(),
  currentStage: stage({
    code: 'missing_pipeline_evidence',
    titleKo: 'HITL 파이프라인 증거 재생성 필요',
    status: 'missing_evidence',
    feedbackKo: '필수 artifact가 없어 HITL 파이프라인 현재 위치를 확정할 수 없습니다.'
  }),
  summary: {
    missingArtifacts: missingArtifactNames.length,
    missingArtifactNames,
    totalDecisionInputsMissing: 0,
    worktableRows: 0,
    worktableInvalidRows: 0,
    worktableIgnoredSimulationOnlyRows: 0,
    worktableSuggestionRows: 0,
    worktableRecaptureSuggestions: 0,
    worktableApproveCandidateSuggestions: 0,
    worktableApproveCardSuggestions: 0,
    worktableNeedsReviewSuggestions: 0,
    worktableNeedsChangesSuggestions: 0,
    worktableReviewSessionCount: 0,
    worktableReviewSessionHighRiskRows: 0,
    worktableReviewSessionPacketCount: 0,
    worktableReviewSessionPacketHighRiskRows: 0,
    worktableReviewSessionPacketFiles: 0,
    worktableReviewSessionProgressCompletedRows: 0,
    worktableReviewSessionProgressPendingRows: 0,
    worktableReviewSessionProgressInvalidRows: 0,
    worktableReviewSessionProgressCompleteSessions: 0,
    worktableReviewSessionProgressBlockedSessions: 0,
    worktableDryRunRoundtripSimulatedRows: 0,
    worktableDryRunRoundtripPlannedUpdates: 0,
    worktableDryRunRoundtripInvalidRows: 0,
    worktableSimulatedPreflightPlannedUpdates: 0,
    worktableSimulatedPreflightPendingDecisions: 0,
    worktableSimulatedPreflightMissingRequiredFields: 0,
    worktableSimulatedPreflightReadyFiles: 0,
    worktablePlannedUpdates: 0,
    preflightPendingDecisions: 0,
    verificationCommandsExecuted: 0,
    commonAgentApprovedPayloads: 0,
    postImportValidationCases: 0,
    postImportValidationResultStatus: 'not_started',
    postImportValidationPassedCases: 0,
    postImportValidationFailedCases: 0,
    postImportValidationMissingEvidenceCases: 0,
    postImportValidationPassRate: 0
  },
  nextActions: [
    action({
      code: 'regenerate_hitl_pipeline_evidence',
      titleKo: 'HITL 파이프라인 증거 재생성',
      instructionKo: '필수 artifact를 순서대로 재생성하세요.',
      commands: [
        'npm run operational:hitl:intake-status',
        'npm run operational:hitl:editable-workspace',
        'npm run operational:hitl:worktable-export'
      ],
      owner: 'system_operator'
    })
  ],
  stageTrail: [],
  sources: sourceMap(sourceArtifacts),
  recommendedAction: 'HITL 파이프라인 필수 증거를 먼저 재생성하세요.'
});

const sourceMap = sourceArtifacts => ({
  intakeStatus: sourceArtifacts.intakeStatus || null,
  workspaceManifest: sourceArtifacts.workspaceManifest || null,
  worktableExport: sourceArtifacts.worktableExport || null,
  worktableCsv: sourceArtifacts.worktableCsv || null,
  worktableSuggestion: sourceArtifacts.worktableSuggestion || null,
  dryRunRoundtrip: sourceArtifacts.dryRunRoundtrip || null,
  simulatedPreflight: sourceArtifacts.simulatedPreflight || null,
  reviewSessionPlan: sourceArtifacts.reviewSessionPlan || null,
  reviewSessionPacket: sourceArtifacts.reviewSessionPacket || null,
  reviewSessionProgress: sourceArtifacts.reviewSessionProgress || null,
  worktableImport: sourceArtifacts.worktableImport || null,
  preflightReport: sourceArtifacts.preflightReport || null,
  verificationRun: sourceArtifacts.verificationRun || null,
  commonAgentImportPackage: sourceArtifacts.commonAgentImportPackage || null,
  postImportValidationPlan: sourceArtifacts.postImportValidationPlan || null,
  postImportValidationResult: sourceArtifacts.postImportValidationResult || null
});

const stageTrailFor = ({
  intakeStatus,
  workspaceManifest,
  worktableExport,
  worktableSuggestion,
  dryRunRoundtrip,
  simulatedPreflight,
  reviewSessionPlan,
  reviewSessionPacket,
  reviewSessionProgress,
  worktableImport,
  preflightReport,
  verificationRun,
  commonAgentImportPackage,
  postImportValidationPlan,
  postImportValidationResult
}) => [
  {
    code: 'intake_status',
    titleKo: 'HITL intake',
    status: compact(intakeStatus?.status) || 'missing'
  },
  {
    code: 'editable_workspace',
    titleKo: 'Editable workspace',
    status: compact(workspaceManifest?.status) || 'missing'
  },
  {
    code: 'worktable_export',
    titleKo: 'Worktable export',
    status: compact(worktableExport?.status) || 'missing'
  },
  {
    code: 'worktable_suggestion',
    titleKo: 'Worktable suggestion',
    status: compact(worktableSuggestion?.status) || 'not_started'
  },
  {
    code: 'dry_run_roundtrip',
    titleKo: 'Dry-run roundtrip',
    status: compact(dryRunRoundtrip?.status) || 'not_started'
  },
  {
    code: 'simulated_preflight',
    titleKo: 'Simulated preflight',
    status: compact(simulatedPreflight?.status) || 'not_started'
  },
  {
    code: 'review_session_plan',
    titleKo: 'Review session plan',
    status: compact(reviewSessionPlan?.status) || 'not_started'
  },
  {
    code: 'review_session_packet',
    titleKo: 'Review session packet',
    status: compact(reviewSessionPacket?.status) || 'not_started'
  },
  {
    code: 'worktable_import',
    titleKo: 'Worktable import',
    status: compact(worktableImport?.status) || 'not_started'
  },
  {
    code: 'review_session_progress',
    titleKo: 'Review session progress',
    status: compact(reviewSessionProgress?.status) || 'not_started'
  },
  {
    code: 'editable_preflight',
    titleKo: 'Editable preflight',
    status: compact(preflightReport?.status) || 'not_started'
  },
  {
    code: 'verification_run',
    titleKo: 'Verify run',
    status: compact(verificationRun?.status) || 'not_started'
  },
  {
    code: 'common_agent_import_package',
    titleKo: 'Common Agent import package',
    status: compact(commonAgentImportPackage?.status) || 'not_started'
  },
  {
    code: 'post_import_validation_plan',
    titleKo: 'Post-import validation plan',
    status: compact(postImportValidationPlan?.status) || 'not_started'
  },
  {
    code: 'post_import_validation_result',
    titleKo: 'Post-import validation result',
    status: compact(postImportValidationResult?.status) || 'not_started'
  }
];

const fillCsvAction = worktableCsv => action({
  code: 'fill_worktable_csv',
  titleKo: 'CSV 작업표 HITL 판정 입력',
  instructionKo: 'CSV에서 각 row의 newAction, reviewer, decidedAt, reviewComment와 action별 확인 필드를 입력하세요.',
  commands: [
    'npm run operational:hitl:worktable-suggest',
    'npm run operational:hitl:dry-run-roundtrip',
    'npm run operational:hitl:simulated-preflight',
    'npm run operational:hitl:review-session-plan',
    'npm run operational:hitl:review-session-packet',
    'npm run operational:hitl:session-progress',
    'npm run operational:hitl:human-brief',
    worktableCsv ? `edit ${worktableCsv}` : 'edit <operational-hitl-decision-worktable-export.csv>',
    'npm run operational:hitl:worktable-import',
    'npm run operational:hitl:session-progress'
  ],
  owner: 'quality_hitl'
});

const pipelineDecision = ({
  intakeStatus,
  worktableExport,
  worktableSuggestion,
  dryRunRoundtrip,
  simulatedPreflight,
  worktableImport,
  preflightReport,
  verificationRun,
  commonAgentImportPackage,
  postImportValidationPlan,
  postImportValidationResult,
  sourceArtifacts
}) => {
  if (dryRunRoundtrip?.status === 'simulated_roundtrip_invalid') {
    return {
      status: 'action_required',
      currentStage: stage({
        code: 'fix_dry_run_roundtrip',
        titleKo: '추천값 roundtrip 사전검증 오류 수정',
        status: 'action_required',
        feedbackKo: '추천값만으로 후속 worktable-import dry-run을 통과하지 못하는 필드가 있습니다.'
      }),
      nextActions: [
        action({
          code: 'fix_dry_run_roundtrip',
          titleKo: '추천값 roundtrip 오류 수정',
          instructionKo: 'dry-run roundtrip invalidRows를 확인해 추천 생성 규칙 또는 worktable 필드를 보완하세요.',
          commands: [
            'npm run operational:hitl:dry-run-roundtrip',
            'npm run operational:hitl:worktable-suggest'
          ],
          owner: 'system_operator'
        })
      ]
    };
  }

  if (
    simulatedPreflight
    && !['simulated_preflight_ready', 'clear', 'missing_evidence'].includes(compact(simulatedPreflight.status))
  ) {
    return {
      status: 'action_required',
      currentStage: stage({
        code: 'fix_simulated_preflight',
        titleKo: '추천값 preflight 사전검증 오류 수정',
        status: 'action_required',
        feedbackKo: '추천값을 메모리 반영해도 editable preflight가 아직 통과하지 못합니다.'
      }),
      nextActions: [
        action({
          code: 'fix_simulated_preflight',
          titleKo: '추천값 preflight 오류 수정',
          instructionKo: 'simulated-preflight files와 roundtripInvalidRows를 확인해 추천 생성 규칙, worktable 필드, editable template 필드를 보완하세요.',
          commands: [
            'npm run operational:hitl:simulated-preflight',
            'npm run operational:hitl:dry-run-roundtrip',
            'npm run operational:hitl:worktable-suggest'
          ],
          owner: 'system_operator'
        })
      ]
    };
  }

  if (postImportValidationResult?.status === 'validation_passed') {
    return {
      status: 'ready_for_post_import_release_validation',
      currentStage: stage({
        code: 'operator_release_validation',
        titleKo: 'Post-import release validation',
        status: 'ready',
        feedbackKo: 'Common Agent 반영 후 Mold Master AI 재검증이 통과했습니다. 운영자 최종 릴리즈 검토만 남았습니다.'
      }),
      nextActions: [
        action({
          code: 'operator_release_validation',
          titleKo: '운영 릴리즈 최종 검토',
          instructionKo: '검증 결과와 graph 근거를 운영자가 확인한 뒤 배포/학습 반영 여부를 수동 승인하세요.',
          commands: [
            'npm run operational:hitl:pipeline-status',
            'npm run eval:graph'
          ],
          owner: 'quality_lead'
        })
      ]
    };
  }

  if ([
    'validation_failed',
    'unsafe_validation_evidence',
    'invalid_validation_evidence',
    'blocked_no_validation_cases'
  ].includes(compact(postImportValidationResult?.status))) {
    return {
      status: 'action_required',
      currentStage: stage({
        code: 'fix_post_import_validation',
        titleKo: 'Post-import validation 보정',
        status: 'action_required',
        feedbackKo: 'Common Agent 반영 후 Mold Master AI 재검증이 통과하지 못했습니다. 실패 case의 graph 근거, HITL 승인값, 응답 grounding을 보정해야 합니다.'
      }),
      nextActions: [
        action({
          code: 'fix_post_import_validation',
          titleKo: 'Post-import validation 실패 case 보정',
          instructionKo: '실패한 caseResults를 기준으로 Common Agent/Graph 데이터와 Mold Master 응답 grounding을 보정한 뒤 검증 결과를 다시 생성하세요.',
          commands: [
            'npm run operational:hitl:post-import-validation-result',
            'npm run operational:hitl:post-import-validation-plan',
            'npm run eval:graph'
          ],
          owner: 'common_agent_operator'
        })
      ]
    };
  }

  if (postImportValidationResult?.status === 'awaiting_validation_evidence') {
    return {
      status: 'action_required',
      currentStage: stage({
        code: 'execute_post_import_validation',
        titleKo: 'Post-import validation evidence 생성',
        status: 'awaiting_validation_evidence',
        feedbackKo: '검증 계획은 준비됐지만 Common Agent/Mold Master 재응답 evidence가 아직 없습니다.'
      }),
      nextActions: [
        action({
          code: 'execute_post_import_validation',
          titleKo: '검증 case 실행 및 evidence 작성',
          instructionKo: '계획된 case를 Common Agent와 Mold Master AI에 실행하고 graph citation/reasoning path가 포함된 evidence artifact를 생성하세요.',
          commands: [
            'npm run operational:hitl:post-import-validation-result',
            'npm run eval:graph'
          ],
          owner: 'common_agent_operator'
        })
      ]
    };
  }

  if (commonAgentImportPackage?.status === 'ready_for_common_agent_review') {
    return {
      status: 'ready_for_common_agent_manual_review',
      currentStage: stage({
        code: 'common_agent_manual_review',
        titleKo: 'Common Agent 수동 import 검토',
        status: 'ready',
        feedbackKo: '검증된 HITL payload를 Common Agent에서 수동 검토할 수 있습니다.'
      }),
      nextActions: [
        action({
          code: 'common_agent_manual_import_review',
          titleKo: 'Common Agent 수동 import 검토',
          instructionKo: 'Common Agent에서 import package를 검토하고, 반영 후 post-import validation case를 실행하세요.',
          commands: [
            'npm run operational:hitl:common-agent-import-package',
            'npm run operational:hitl:post-import-validation-plan',
            'npm run operational:hitl:post-import-validation-observations',
            'npm run operational:hitl:post-import-validation-manual-template',
            'npm run operational:hitl:post-import-validation-manual-import',
            'npm run operational:hitl:post-import-validation-evidence',
            'npm run operational:hitl:post-import-validation-result',
            'npm run eval:graph'
          ],
          owner: 'common_agent_operator'
        })
      ]
    };
  }

  if (verificationRun?.status === 'executed') {
    return {
      status: 'action_required',
      currentStage: stage({
        code: 'build_common_agent_import_package',
        titleKo: 'Common Agent import package 생성',
        status: 'action_required',
        feedbackKo: 'HITL verification 실행은 끝났습니다. 검증 리포트를 Common Agent import package로 묶어야 합니다.'
      }),
      nextActions: [
        action({
          code: 'build_common_agent_import_package',
          titleKo: '검증 결과 Common Agent import package 생성',
          instructionKo: '최신 세 verification report를 묶어 Common Agent 수동 검토 패키지를 생성하세요.',
          commands: [
            'npm run operational:hitl:common-agent-import-package',
            'npm run operational:hitl:post-import-validation-plan'
          ],
          owner: 'system_operator'
        })
      ]
    };
  }

  if (preflightReport?.status === 'ready_for_verification') {
    return {
      status: 'action_required',
      currentStage: stage({
        code: 'execute_hitl_verification',
        titleKo: 'HITL verification 실행',
        status: 'action_required',
        feedbackKo: 'editable decision file이 preflight를 통과했습니다. verify-run을 실행할 수 있습니다.'
      }),
      nextActions: [
        action({
          code: 'execute_verify_run',
          titleKo: 'HITL verify-run 실행',
          instructionKo: 'dry-run 계획을 확인한 뒤 --execute로 로컬 verification report를 생성하세요.',
          commands: [
            'npm run operational:hitl:verify-run -- --execute',
            'npm run operational:hitl:common-agent-import-package'
          ],
          owner: 'system_operator'
        })
      ]
    };
  }

  if (worktableImport?.status === 'applied') {
    return {
      status: 'action_required',
      currentStage: stage({
        code: 'run_editable_preflight',
        titleKo: 'Editable preflight 재검증',
        status: 'action_required',
        feedbackKo: 'CSV 입력이 editable JSON에 반영됐습니다. preflight로 필수 필드와 action을 점검하세요.'
      }),
      nextActions: [
        action({
          code: 'run_editable_preflight',
          titleKo: 'Editable decision preflight 실행',
          instructionKo: '반영된 editable JSON이 검증 가능한 상태인지 확인하세요.',
          commands: [
            'npm run operational:hitl:editable-preflight',
            'npm run operational:hitl:verify-run'
          ],
          owner: 'system_operator'
        })
      ]
    };
  }

  if (worktableImport?.status === 'dry_run_ready') {
    return {
      status: 'action_required',
      currentStage: stage({
        code: 'review_worktable_import_plan',
        titleKo: 'Worktable import dry-run 검토',
        status: 'action_required',
        feedbackKo: 'CSV 입력을 editable JSON에 반영할 dry-run 계획이 준비됐습니다.'
      }),
      nextActions: [
        action({
          code: 'apply_worktable_import',
          titleKo: 'CSV 입력 editable JSON 반영',
          instructionKo: 'dry-run 계획을 사람이 확인한 뒤 --apply로 로컬 editable JSON에만 반영하세요.',
          commands: [
            'npm run operational:hitl:worktable-import -- --apply',
            'npm run operational:hitl:editable-preflight'
          ],
          owner: 'quality_hitl'
        })
      ]
    };
  }

  if (worktableImport?.status === 'invalid_worktable') {
    return {
      status: 'action_required',
      currentStage: stage({
        code: 'fix_invalid_worktable_csv',
        titleKo: 'CSV 작업표 오류 수정',
        status: 'action_required',
        feedbackKo: 'CSV에 알 수 없는 decision 또는 허용되지 않은 action이 있습니다.'
      }),
      nextActions: [
        action({
          code: 'fix_worktable_csv',
          titleKo: 'CSV 작업표 오류 수정',
          instructionKo: 'invalidRows를 확인해 queueCode, decisionId, newAction 값을 수정하세요.',
          commands: [
            'npm run operational:hitl:worktable-import',
            'npm run operational:hitl:worktable-export'
          ],
          owner: 'quality_hitl'
        })
      ]
    };
  }

  const pendingInputs = numberFrom(
    intakeStatus?.summary?.totalDecisionInputsMissing,
    worktableExport?.summary?.pendingRowCount
  );
  if (pendingInputs > 0 || worktableImport?.status === 'no_actionable_rows' || !worktableImport) {
    return {
      status: 'action_required',
      currentStage: stage({
        code: 'awaiting_human_csv_decisions',
        titleKo: 'CSV HITL 판정 입력 대기',
        status: 'awaiting_human_review',
        feedbackKo: '작업표는 준비됐지만 사람이 newAction과 검토 필드를 아직 입력하지 않았습니다.'
      }),
      nextActions: [
        fillCsvAction(sourceArtifacts.worktableCsv || worktableExport?.csvPath)
      ]
    };
  }

  return {
    status: postImportValidationPlan?.status === 'ready_for_post_import_validation'
      ? 'ready_for_post_import_validation'
      : 'action_required',
    currentStage: stage({
      code: 'refresh_pipeline_status',
      titleKo: 'HITL 파이프라인 상태 갱신',
      status: 'action_required',
      feedbackKo: '최신 artifact를 재생성해 다음 단계를 확인하세요.'
    }),
    nextActions: [
      action({
        code: 'refresh_pipeline_status',
        titleKo: '파이프라인 상태 갱신',
        instructionKo: '최신 artifact를 다시 생성하세요.',
        commands: [
          'npm run operational:hitl:intake-status',
          'npm run operational:hitl:pipeline-status'
        ],
        owner: 'system_operator'
      })
    ]
  };
};

const summaryFor = ({
  missingArtifactNames,
  intakeStatus,
  workspaceManifest,
  worktableExport,
  worktableSuggestion,
  dryRunRoundtrip,
  simulatedPreflight,
  reviewSessionPlan,
  reviewSessionPacket,
  reviewSessionProgress,
  worktableImport,
  preflightReport,
  verificationRun,
  commonAgentImportPackage,
  postImportValidationPlan,
  postImportValidationResult
}) => ({
  missingArtifacts: missingArtifactNames.length,
  missingArtifactNames,
  totalDecisionInputsMissing: numberFrom(
    intakeStatus?.summary?.totalDecisionInputsMissing,
    workspaceManifest?.summary?.totalPendingActions,
    worktableExport?.summary?.pendingRowCount
  ),
  labelConflictPending: numberFrom(intakeStatus?.summary?.labelConflictPending),
  visionHitlPending: numberFrom(intakeStatus?.summary?.visionHitlPending),
  webHitlMissing: numberFrom(intakeStatus?.summary?.webHitlMissing),
  workspaceFileCount: numberFrom(workspaceManifest?.summary?.workspaceFileCount),
  worktableRows: numberFrom(worktableExport?.summary?.decisionRowCount, worktableImport?.summary?.totalRows),
  worktableInvalidRows: numberFrom(worktableImport?.summary?.invalidRows),
  worktableIgnoredSimulationOnlyRows: numberFrom(worktableImport?.summary?.ignoredSimulationOnlyRows),
  worktableSuggestionRows: numberFrom(worktableSuggestion?.summary?.suggestionRows),
  worktableRecaptureSuggestions: numberFrom(worktableSuggestion?.summary?.recaptureSuggestions),
  worktableApproveCandidateSuggestions: numberFrom(worktableSuggestion?.summary?.approveCandidateSuggestions),
  worktableApproveCardSuggestions: numberFrom(worktableSuggestion?.summary?.approveCardSuggestions),
  worktableNeedsReviewSuggestions: numberFrom(worktableSuggestion?.summary?.needsReviewSuggestions),
  worktableNeedsChangesSuggestions: numberFrom(worktableSuggestion?.summary?.needsChangesSuggestions),
  worktableDryRunRoundtripSimulatedRows: numberFrom(dryRunRoundtrip?.summary?.simulatedRows),
  worktableDryRunRoundtripPlannedUpdates: numberFrom(dryRunRoundtrip?.summary?.importPlannedUpdates),
  worktableDryRunRoundtripInvalidRows: numberFrom(dryRunRoundtrip?.summary?.invalidRows),
  worktableSimulatedPreflightPlannedUpdates: numberFrom(simulatedPreflight?.summary?.importPlannedUpdates),
  worktableSimulatedPreflightPendingDecisions: numberFrom(simulatedPreflight?.summary?.preflightPendingDecisions),
  worktableSimulatedPreflightMissingRequiredFields: numberFrom(simulatedPreflight?.summary?.preflightMissingRequiredFields),
  worktableSimulatedPreflightReadyFiles: numberFrom(simulatedPreflight?.summary?.readyForVerificationFileCount),
  worktableReviewSessionCount: numberFrom(reviewSessionPlan?.summary?.sessionCount),
  worktableReviewSessionHighRiskRows: numberFrom(reviewSessionPlan?.summary?.highRiskRows),
  worktableReviewSessionPacketCount: numberFrom(reviewSessionPacket?.summary?.sessionPacketCount),
  worktableReviewSessionPacketHighRiskRows: numberFrom(reviewSessionPacket?.summary?.highRiskRows),
  worktableReviewSessionPacketFiles: numberFrom(reviewSessionPacket?.summary?.filesToWrite),
  worktableReviewSessionProgressCompletedRows: numberFrom(reviewSessionProgress?.summary?.completedRows),
  worktableReviewSessionProgressPendingRows: numberFrom(reviewSessionProgress?.summary?.pendingRows),
  worktableReviewSessionProgressInvalidRows: numberFrom(reviewSessionProgress?.summary?.invalidRows),
  worktableReviewSessionProgressCompleteSessions: numberFrom(reviewSessionProgress?.summary?.completeSessionCount),
  worktableReviewSessionProgressBlockedSessions: numberFrom(reviewSessionProgress?.summary?.blockedSessionCount),
  worktablePlannedUpdates: numberFrom(worktableImport?.summary?.plannedUpdates),
  worktableAppliedUpdates: numberFrom(worktableImport?.summary?.appliedUpdates),
  preflightPendingDecisions: numberFrom(preflightReport?.summary?.pendingDecisionCount),
  preflightMissingRequiredFields: numberFrom(preflightReport?.summary?.missingRequiredFieldCount),
  verificationCommandsExecuted: numberFrom(verificationRun?.summary?.commandsExecuted),
  verificationFailedCommands: numberFrom(verificationRun?.summary?.failedCommands),
  commonAgentApprovedPayloads: numberFrom(commonAgentImportPackage?.summary?.totalApprovedPayloads),
  commonAgentBlockingReports: numberFrom(commonAgentImportPackage?.summary?.blockingReports),
  postImportValidationCases: numberFrom(postImportValidationPlan?.summary?.totalTestCases),
  postImportGraphRagCases: numberFrom(postImportValidationPlan?.summary?.graphRagCases),
  postImportValidationResultStatus: compact(postImportValidationResult?.status) || 'not_started',
  postImportValidationPassedCases: numberFrom(postImportValidationResult?.summary?.passedCases),
  postImportValidationFailedCases: numberFrom(postImportValidationResult?.summary?.failedCases),
  postImportValidationMissingEvidenceCases: numberFrom(postImportValidationResult?.summary?.missingEvidenceCases),
  postImportValidationPassRate: numberFrom(postImportValidationResult?.summary?.passRate)
});

const markdownFor = report => {
  const lines = [
    '# Operational HITL Pipeline Status',
    '',
    `- 생성 시각: ${report.generatedAt}`,
    `- 상태: ${report.status}`,
    `- 현재 단계: ${report.currentStage.titleKo}`,
    `- 남은 입력: ${report.summary.totalDecisionInputsMissing}`,
    `- 작업표 row: ${report.summary.worktableRows}`,
    `- 작업표 오류 row: ${report.summary.worktableInvalidRows}`,
    `- 무시된 simulation-only import row: ${report.summary.worktableIgnoredSimulationOnlyRows}`,
    `- 추천 row: ${report.summary.worktableSuggestionRows}`,
    `- 검토 세션: ${report.summary.worktableReviewSessionCount}`,
    `- 검토 세션 고위험 row: ${report.summary.worktableReviewSessionHighRiskRows}`,
    `- 검토 패킷: ${report.summary.worktableReviewSessionPacketCount}`,
    `- 검토 패킷 파일: ${report.summary.worktableReviewSessionPacketFiles}`,
    `- 세션 완료 row: ${report.summary.worktableReviewSessionProgressCompletedRows}`,
    `- 세션 대기 row: ${report.summary.worktableReviewSessionProgressPendingRows}`,
    `- 세션 오류 row: ${report.summary.worktableReviewSessionProgressInvalidRows}`,
    `- 재촬영 추천: ${report.summary.worktableRecaptureSuggestions}`,
    `- Vision 승인 후보: ${report.summary.worktableApproveCandidateSuggestions}`,
    `- Web 카드 승인 후보: ${report.summary.worktableApproveCardSuggestions}`,
    `- 추천값 roundtrip 계획 update: ${report.summary.worktableDryRunRoundtripPlannedUpdates}`,
    `- 추천값 roundtrip 오류 row: ${report.summary.worktableDryRunRoundtripInvalidRows}`,
    `- 추천값 preflight 계획 update: ${report.summary.worktableSimulatedPreflightPlannedUpdates}`,
    `- 추천값 preflight pending: ${report.summary.worktableSimulatedPreflightPendingDecisions}`,
    `- 추천값 preflight 필수필드 누락: ${report.summary.worktableSimulatedPreflightMissingRequiredFields}`,
    `- 작업표 계획 update: ${report.summary.worktablePlannedUpdates}`,
    `- post-import validation case: ${report.summary.postImportValidationCases}`,
    `- post-import validation result: ${report.summary.postImportValidationResultStatus}`,
    `- post-import validation pass: ${report.summary.postImportValidationPassedCases}/${report.summary.postImportValidationCases}`,
    `- post-import validation failed: ${report.summary.postImportValidationFailedCases}`,
    `- post-import validation passRate: ${report.summary.postImportValidationPassRate}%`,
    '- 안전 정책: 자동 쓰기 금지, Graph/Reference/Model 승격 금지',
    '',
    '## 다음 작업',
    ''
  ];
  report.nextActions.forEach((item, index) => {
    lines.push(`${index + 1}. ${item.titleKo}`);
    lines.push(`   - ${item.instructionKo}`);
    item.commands.forEach(command => lines.push(`   - \`${command}\``));
  });
  lines.push('', '## Stage Trail', '', '| Stage | Status |', '|---|---|');
  report.stageTrail.forEach(item => {
    lines.push(`| ${item.titleKo} | ${item.status} |`);
  });
  return `${lines.join('\n')}\n`;
};

const buildOperationalHitlPipelineStatus = ({
  generatedAt = new Date().toISOString(),
  intakeStatus = null,
  workspaceManifest = null,
  worktableExport = null,
  worktableSuggestion = null,
  dryRunRoundtrip = null,
  simulatedPreflight = null,
  reviewSessionPlan = null,
  reviewSessionPacket = null,
  reviewSessionProgress = null,
  worktableImport = null,
  preflightReport = null,
  verificationRun = null,
  commonAgentImportPackage = null,
  postImportValidationPlan = null,
  postImportValidationResult = null,
  sourceArtifacts = {}
} = {}) => {
  const missingArtifactNames = requiredMissing({
    intakeStatus,
    workspaceManifest,
    worktableExport
  });
  if (missingArtifactNames.length > 0) {
    const report = missingEvidenceStatus({
      generatedAt,
      missingArtifactNames,
      sourceArtifacts
    });
    return {
      ...report,
      markdown: markdownFor({
        ...report,
        stageTrail: report.stageTrail || []
      })
    };
  }

  const normalizedWorktableImport = normalizeOperationalWorktableImport(worktableImport);
  const decision = pipelineDecision({
    intakeStatus,
    workspaceManifest,
    worktableExport,
    worktableSuggestion,
    dryRunRoundtrip,
    simulatedPreflight,
    reviewSessionPlan,
    reviewSessionPacket,
    reviewSessionProgress,
    worktableImport: normalizedWorktableImport,
    preflightReport,
    verificationRun,
    commonAgentImportPackage,
    postImportValidationPlan,
    postImportValidationResult,
    sourceArtifacts
  });
  const stageTrail = stageTrailFor({
    intakeStatus,
    workspaceManifest,
    worktableExport,
    worktableSuggestion,
    dryRunRoundtrip,
    simulatedPreflight,
    reviewSessionPlan,
    reviewSessionPacket,
    reviewSessionProgress,
    worktableImport: normalizedWorktableImport,
    preflightReport,
    verificationRun,
    commonAgentImportPackage,
    postImportValidationPlan,
    postImportValidationResult
  });
  const report = {
    schemaVersion: 1,
    contractVersion: 'operational-hitl-pipeline-status/v1',
    generatedAt,
    sourceSystem: 'mold-master-ai',
    targetSystem: 'operator_common_agent',
    status: decision.status,
    serviceWritesPerformed: false,
    localArtifactsWritten: true,
    policy: policy(),
    currentStage: decision.currentStage,
    summary: summaryFor({
      missingArtifactNames,
      intakeStatus,
      workspaceManifest,
      worktableExport,
      worktableSuggestion,
      dryRunRoundtrip,
      simulatedPreflight,
      reviewSessionPlan,
      reviewSessionPacket,
      reviewSessionProgress,
      worktableImport: normalizedWorktableImport,
      preflightReport,
      verificationRun,
      commonAgentImportPackage,
      postImportValidationPlan,
      postImportValidationResult
    }),
    nextActions: decision.nextActions,
    stageTrail,
    sources: sourceMap(sourceArtifacts),
    recommendedAction: decision.nextActions[0]?.titleKo || 'HITL 파이프라인 상태를 확인하세요.'
  };
  return {
    ...report,
    markdown: markdownFor(report)
  };
};

module.exports = {
  buildOperationalHitlPipelineStatus
};
