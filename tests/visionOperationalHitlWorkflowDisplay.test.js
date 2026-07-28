const assert = require('node:assert/strict');
const test = require('node:test');

const {
  summarizeVisionOperationalHitlWorkflowDisplay,
  summarizeVisionOperationalLabelConflictWorkflowDisplay,
  summarizeOperationalHitlActionPackDisplay,
  summarizeOperationalHitlPipelineStatusDisplay,
  summarizeOperationalHitlWorktableSuggestionDisplay,
  summarizeOperationalHitlReviewSessionPlanDisplay,
  summarizeOperationalHitlReviewSessionPacketDisplay,
  summarizeOperationalHitlHumanDecisionBriefDisplay,
  summarizeMoldMasterDevelopmentProgressDisplay,
  summarizeOperationalStatusBundleDisplay
} = require('../visionOperationalHitlWorkflowDisplay');

test('summarizes awaiting HITL workflow for Settings UI display', () => {
  const display = summarizeVisionOperationalHitlWorkflowDisplay({
    tasks: [{
      code: 'close_hitl_reviews',
      workflowStatus: {
        status: 'awaiting_human_review',
        queue: {
          pendingHighConfidence: 12
        },
        template: {
          decisionsPrepared: 12
        },
        verification: {
          pendingQueueItems: 12,
          invalidDecisions: 0,
          acceptedDecisions: 0
        },
        nextCommand: 'npm run vision:hitl:verify-decisions -- --decisions <filled-common-agent-hitl-decisions.json>',
        nextActionKo: 'Common Agent/HITL 판정 파일을 작성하고 검증하세요.'
      }
    }]
  });

  assert.equal(display.title, 'HITL Workflow');
  assert.equal(display.statusLabel, '판정 작성/검증 대기');
  assert.equal(display.severity, 'warning');
  assert.equal(display.summaryText, '큐 12건 · 템플릿 12건 · 미판정 12건');
  assert.equal(display.nextCommand, 'npm run vision:hitl:verify-decisions -- --decisions <filled-common-agent-hitl-decisions.json>');
  assert.match(display.nextActionKo, /판정 파일/);
  assert.deepEqual(display.safetyBadges, [
    '자동 적용 금지',
    'Graph 승격 금지',
    'Reference 학습 금지'
  ]);
});

test('highlights invalid decisions before manual import is allowed', () => {
  const display = summarizeVisionOperationalHitlWorkflowDisplay({
    commonAgentHandoff: {
      items: [{
        taskCode: 'close_hitl_reviews',
        workflowStatus: {
          status: 'invalid_decisions',
          queue: {
            pendingHighConfidence: 12
          },
          template: {
            decisionsPrepared: 12
          },
          verification: {
            pendingQueueItems: 12,
            invalidDecisions: 3,
            acceptedDecisions: 0
          },
          nextCommand: 'npm run vision:hitl:verify-decisions -- --decisions <filled-common-agent-hitl-decisions.json>',
          nextActionKo: '유효하지 않은 HITL 판정을 수정하고 다시 검증하세요.'
        }
      }]
    }
  });

  assert.equal(display.statusLabel, '판정 오류 수정 필요');
  assert.equal(display.severity, 'danger');
  assert.equal(display.summaryText, '큐 12건 · 템플릿 12건 · 미판정 12건 · 오류 3건');
  assert.match(display.nextActionKo, /수정/);
});

test('shows the authorization bridge as the next step after decision verification is ready', () => {
  const display = summarizeVisionOperationalHitlWorkflowDisplay({
    tasks: [{
      code: 'close_hitl_reviews',
      workflowStatus: {
        status: 'ready_for_manual_import',
        queue: {
          pendingHighConfidence: 12
        },
        template: {
          decisionsPrepared: 12
        },
        verification: {
          pendingQueueItems: 0,
          invalidDecisions: 0,
          acceptedDecisions: 12
        },
        nonApprovalWorklist: {
          status: 'action_required',
          totalItems: 4,
          needsReviewItems: 1,
          rejectedCandidates: 1,
          recaptureRequests: 2
        },
        nextCommand: 'npm run vision:hitl:authorization-bridge -- --decision-verification <vision-pending-hitl-decision-verification-report.json>',
        nextCommands: [
          'npm run vision:hitl:authorization-bridge -- --decision-verification <vision-pending-hitl-decision-verification-report.json>',
          'npm run vision:hitl:non-approval-worklist -- --decision-verification <vision-pending-hitl-decision-verification-report.json>'
        ],
        nextActionKo: '검증된 판정을 authorization bridge로 변환하세요.'
      }
    }]
  });

  assert.equal(display.statusLabel, '수동 Import 준비');
  assert.equal(display.severity, 'success');
  assert.equal(display.summaryText, '큐 12건 · 템플릿 12건 · 검증 12건 · 미판정 0건 · 비승인 조치 4건');
  assert.match(display.nextCommand, /vision:hitl:authorization-bridge/);
  assert.deepEqual(display.nextCommands, [
    'npm run vision:hitl:authorization-bridge -- --decision-verification <vision-pending-hitl-decision-verification-report.json>',
    'npm run vision:hitl:non-approval-worklist -- --decision-verification <vision-pending-hitl-decision-verification-report.json>'
  ]);
  assert.match(display.nextActionKo, /authorization bridge/);
});

test('returns null when no HITL workflow is available to display', () => {
  assert.equal(summarizeVisionOperationalHitlWorkflowDisplay({ tasks: [] }), null);
  assert.equal(summarizeVisionOperationalHitlWorkflowDisplay(null), null);
});

test('summarizes approved label conflict workflow for Settings UI display', () => {
  const display = summarizeVisionOperationalLabelConflictWorkflowDisplay({
    tasks: [{
      code: 'resolve_label_conflicts',
      workflowStatus: {
        status: 'dry_run_ready',
        packet: {
          conflicts: 4
        },
        template: {
          decisionsPrepared: 4
        },
        verification: {
          acceptedDecisions: 4,
          invalidDecisions: 0,
          pendingConflicts: 0
        },
        apply: {
          plannedCaseUpdates: 5,
          appliedCaseUpdates: 0,
          localFixtureWritesPerformed: false
        },
        nextCommand: 'npm run vision:label-conflicts:apply -- --verification <vision-approved-label-conflict-decision-verification-report.json> --apply',
        nextActionKo: 'dry-run 결과를 확인한 뒤 사람이 승인하면 --apply로 로컬 fixture에 반영하세요.'
      }
    }]
  });

  assert.equal(display.title, 'Label Conflict Workflow');
  assert.equal(display.statusLabel, 'Apply 승인 대기');
  assert.equal(display.severity, 'warning');
  assert.equal(display.summaryText, '충돌 4건 · 템플릿 4건 · 검증 4건 · 미해결 0건 · 적용계획 5건');
  assert.match(display.nextCommand, /vision:label-conflicts:apply/);
  assert.match(display.nextActionKo, /--apply/);
  assert.deepEqual(display.safetyBadges, [
    '자동 적용 금지',
    'Graph 승격 금지',
    'Reference 학습 금지'
  ]);
});

test('highlights applied label conflict workflow as requiring post-HITL verification', () => {
  const display = summarizeVisionOperationalLabelConflictWorkflowDisplay({
    commonAgentHandoff: {
      items: [{
        taskCode: 'resolve_label_conflicts',
        workflowStatus: {
          status: 'applied',
          packet: {
            conflicts: 4
          },
          template: {
            decisionsPrepared: 4
          },
          verification: {
            acceptedDecisions: 4,
            invalidDecisions: 0,
            pendingConflicts: 0
          },
          apply: {
            plannedCaseUpdates: 5,
            appliedCaseUpdates: 5,
            localFixtureWritesPerformed: true
          },
          nextCommand: 'npm run migration:verify-post-hitl',
          nextActionKo: 'post-HITL 검증을 다시 실행하세요.'
        }
      }]
    }
  });

  assert.equal(display.statusLabel, '로컬 반영 완료');
  assert.equal(display.severity, 'success');
  assert.equal(display.summaryText, '충돌 4건 · 템플릿 4건 · 검증 4건 · 미해결 0건 · 적용계획 5건 · 반영 5건');
  assert.equal(display.nextCommand, 'npm run migration:verify-post-hitl');
});

test('returns null when no label conflict workflow is available to display', () => {
  assert.equal(summarizeVisionOperationalLabelConflictWorkflowDisplay({ tasks: [] }), null);
  assert.equal(summarizeVisionOperationalLabelConflictWorkflowDisplay(null), null);
});

test('summarizes operational HITL action pack for Settings UI display', () => {
  const display = summarizeOperationalHitlActionPackDisplay({
    contractVersion: 'operational-hitl-action-pack/v1',
    status: 'action_required',
    summary: {
      totalDecisionInputsMissing: 56,
      firstQueueCode: 'vision_label_conflicts',
      labelConflictPending: 4,
      visionHitlPending: 12,
      webHitlMissing: 40,
      actionStepCount: 3
    },
    actionSteps: [
      {
        queueCode: 'vision_label_conflicts',
        titleKo: '승인 이미지 라벨 충돌 판정',
        owner: 'quality_hitl',
        pending: 4,
        commands: [
          'npm run vision:label-conflicts:decision-template',
          'npm run vision:label-conflicts:review-guide',
          'npm run vision:label-conflicts:verify-decisions -- --decisions <filled-vision-label-conflict-decisions.json>'
        ],
        operatorInstructionKo: '품질/HITL 라벨 충돌 판정 파일을 작성하고 검증하세요.'
      },
      {
        queueCode: 'vision_pending_hitl',
        titleKo: 'Vision pending HITL 판정',
        owner: 'quality_hitl',
        pending: 12,
        commands: ['npm run vision:hitl:decision-template'],
        operatorInstructionKo: 'Common Agent/HITL 판정 파일을 작성하고 검증하세요.'
      }
    ]
  });

  assert.equal(display.title, 'HITL Action Pack');
  assert.equal(display.statusLabel, '판정 입력 필요');
  assert.equal(display.severity, 'warning');
  assert.equal(display.summaryText, '미입력 56건 · 라벨충돌 4건 · Vision 12건 · Web 40건');
  assert.equal(display.firstQueueCode, 'vision_label_conflicts');
  assert.equal(display.firstActionTitle, '승인 이미지 라벨 충돌 판정');
  assert.match(display.nextActionKo, /라벨 충돌 판정/);
  assert.deepEqual(display.nextCommands, [
    'npm run vision:label-conflicts:decision-template',
    'npm run vision:label-conflicts:review-guide',
    'npm run vision:label-conflicts:verify-decisions -- --decisions <filled-vision-label-conflict-decisions.json>'
  ]);
  assert.deepEqual(display.actionStepPreviews, [
    '승인 이미지 라벨 충돌 판정 · quality_hitl · 4건',
    'Vision pending HITL 판정 · quality_hitl · 12건'
  ]);
  assert.deepEqual(display.safetyBadges, [
    'Artifact-only',
    '자동 적용 금지',
    'Graph 승격 금지',
    'Reference 학습 금지'
  ]);
});

test('returns null when no operational HITL action pack is available to display', () => {
  assert.equal(summarizeOperationalHitlActionPackDisplay(null), null);
  assert.equal(summarizeOperationalHitlActionPackDisplay({ contractVersion: 'unknown/v1' }), null);
});

test('summarizes operational HITL pipeline status for Settings UI display', () => {
  const display = summarizeOperationalHitlPipelineStatusDisplay({
    contractVersion: 'operational-hitl-pipeline-status/v1',
    status: 'action_required',
    currentStage: {
      code: 'awaiting_human_csv_decisions',
      titleKo: 'CSV HITL 판정 입력 대기',
      status: 'awaiting_human_review',
      feedbackKo: '작업표는 준비됐지만 사람이 newAction과 검토 필드를 아직 입력하지 않았습니다.'
    },
    summary: {
      totalDecisionInputsMissing: 56,
      worktableRows: 59,
      worktableSuggestionRows: 59,
      worktableRecaptureSuggestions: 5,
      worktableApproveCandidateSuggestions: 7,
      worktableApproveCardSuggestions: 43,
      worktableNeedsReviewSuggestions: 4,
      worktableReviewSessionCount: 4,
      worktableReviewSessionHighRiskRows: 9,
      worktableReviewSessionPacketCount: 4,
      worktableReviewSessionPacketFiles: 8,
      worktableReviewSessionProgressCompletedRows: 0,
      worktableReviewSessionProgressPendingRows: 59,
      worktableReviewSessionProgressInvalidRows: 0,
      worktableDryRunRoundtripPlannedUpdates: 59,
      worktableDryRunRoundtripInvalidRows: 0,
      worktableSimulatedPreflightPlannedUpdates: 59,
      worktableSimulatedPreflightPendingDecisions: 0,
      worktableSimulatedPreflightMissingRequiredFields: 0,
      worktablePlannedUpdates: 0,
      preflightPendingDecisions: 59,
      commonAgentApprovedPayloads: 0
    },
    nextActions: [
      {
        code: 'fill_worktable_csv',
        titleKo: 'CSV 작업표 HITL 판정 입력',
        instructionKo: 'CSV에서 각 row의 newAction과 검토 필드를 사람이 확정하세요.',
        commands: [
          'npm run operational:hitl:worktable-suggest',
          'npm run operational:hitl:dry-run-roundtrip',
          'npm run operational:hitl:simulated-preflight',
          'npm run operational:hitl:review-session-plan',
          'npm run operational:hitl:review-session-packet',
          'edit C:\\repo\\artifacts\\operational-hitl-decision-worktable-export.csv',
          'npm run operational:hitl:worktable-import'
        ]
      }
    ]
  });

  assert.equal(display.title, 'HITL Pipeline Status');
  assert.equal(display.statusLabel, 'CSV 판정 입력 대기');
  assert.equal(display.severity, 'warning');
  assert.equal(
    display.summaryText,
    '미입력 56건 · 작업표 59건 · 추천 59건 · 검토세션 4건 · 고위험 9건 · 검토패킷 4건 · 패킷파일 8개 · 세션대기 59건 · 사전검증 59건 · preflight예행 59건 · 재촬영 5건 · Vision 후보 7건 · Web 후보 43건'
  );
  assert.equal(display.stageText, 'CSV HITL 판정 입력 대기');
  assert.equal(display.suggestionText, '추천 분포: 재촬영 5건 · Vision 후보 7건 · Web 후보 43건 · 검토필요 4건');
  assert.equal(display.nextCommand, 'npm run operational:hitl:worktable-suggest');
  assert.deepEqual(display.nextCommands, [
    'npm run operational:hitl:worktable-suggest',
    'npm run operational:hitl:dry-run-roundtrip',
    'npm run operational:hitl:simulated-preflight',
    'npm run operational:hitl:review-session-plan',
    'npm run operational:hitl:review-session-packet',
    'edit C:\\repo\\artifacts\\operational-hitl-decision-worktable-export.csv',
    'npm run operational:hitl:worktable-import'
  ]);
  assert.match(display.nextActionKo, /newAction/);
  assert.deepEqual(display.safetyBadges, [
    'Artifact-only',
    '자동 적용 금지',
    'Graph 승격 금지',
    'Reference 학습 금지',
    'Model 학습 금지'
  ]);
});

test('highlights invalid operational HITL simulated preflight evidence', () => {
  const display = summarizeOperationalHitlPipelineStatusDisplay({
    contractVersion: 'operational-hitl-pipeline-status/v1',
    status: 'action_required',
    currentStage: {
      code: 'fix_simulated_preflight',
      titleKo: '추천값 preflight 사전검증 오류 수정'
    },
    summary: {
      totalDecisionInputsMissing: 56,
      worktableRows: 59,
      worktableSuggestionRows: 59,
      worktableSimulatedPreflightPlannedUpdates: 59,
      worktableSimulatedPreflightPendingDecisions: 12,
      worktableSimulatedPreflightMissingRequiredFields: 2
    },
    nextActions: [
      {
        instructionKo: 'simulated-preflight files를 확인하세요.',
        commands: [
          'npm run operational:hitl:simulated-preflight',
          'npm run operational:hitl:dry-run-roundtrip'
        ]
      }
    ]
  });

  assert.equal(display.statusLabel, '추천 Preflight 오류');
  assert.equal(display.severity, 'danger');
  assert.equal(
    display.summaryText,
    '미입력 56건 · 작업표 59건 · 추천 59건 · preflight예행 59건 · preflight대기 12건 · preflight누락 2건'
  );
  assert.equal(display.nextCommand, 'npm run operational:hitl:simulated-preflight');
});

test('highlights invalid operational HITL dry-run roundtrip evidence', () => {
  const display = summarizeOperationalHitlPipelineStatusDisplay({
    contractVersion: 'operational-hitl-pipeline-status/v1',
    status: 'action_required',
    currentStage: {
      code: 'fix_dry_run_roundtrip',
      titleKo: '추천값 roundtrip 사전검증 오류 수정'
    },
    summary: {
      totalDecisionInputsMissing: 56,
      worktableRows: 59,
      worktableSuggestionRows: 59,
      worktableDryRunRoundtripPlannedUpdates: 0,
      worktableDryRunRoundtripInvalidRows: 2
    },
    nextActions: [
      {
        instructionKo: 'dry-run roundtrip invalidRows를 확인하세요.',
        commands: [
          'npm run operational:hitl:dry-run-roundtrip',
          'npm run operational:hitl:worktable-suggest'
        ]
      }
    ]
  });

  assert.equal(display.statusLabel, '추천 사전검증 오류');
  assert.equal(display.severity, 'danger');
  assert.equal(display.summaryText, '미입력 56건 · 작업표 59건 · 추천 59건 · 사전오류 2건');
  assert.equal(display.nextCommand, 'npm run operational:hitl:dry-run-roundtrip');
});

test('highlights missing operational HITL pipeline evidence', () => {
  const display = summarizeOperationalHitlPipelineStatusDisplay({
    contractVersion: 'operational-hitl-pipeline-status/v1',
    status: 'missing_evidence',
    currentStage: {
      code: 'missing_pipeline_evidence',
      titleKo: 'HITL 파이프라인 증거 재생성 필요'
    },
    summary: {
      missingArtifacts: 2,
      missingArtifactNames: ['intakeStatus', 'worktableExport']
    },
    nextActions: [
      {
        instructionKo: '필수 artifact를 순서대로 재생성하세요.',
        commands: ['npm run operational:hitl:intake-status']
      }
    ]
  });

  assert.equal(display.statusLabel, '증거 재생성 필요');
  assert.equal(display.severity, 'danger');
  assert.equal(display.summaryText, '누락 증거 2건 · 미입력 0건 · 작업표 0건');
  assert.equal(display.stageText, 'HITL 파이프라인 증거 재생성 필요');
  assert.equal(display.nextCommand, 'npm run operational:hitl:intake-status');
});

test('summarizes post-import observation and evidence metrics for Settings UI display', () => {
  const display = summarizeOperationalHitlPipelineStatusDisplay({
    contractVersion: 'operational-hitl-pipeline-status/v1',
    status: 'action_required',
    currentStage: {
      code: 'execute_post_import_validation',
      titleKo: 'Post-import validation evidence capture'
    },
    summary: {
      totalDecisionInputsMissing: 0,
      worktableRows: 59,
      commonAgentApprovedPayloads: 44,
      postImportValidationCases: 44,
      postImportValidationObservationStatus: 'partial_observations_collected',
      postImportGraphExecutableCases: 40,
      postImportGraphCapturedCases: 40,
      postImportGraphFailedCases: 1,
      postImportManualObservationRequiredCases: 4,
      postImportManualObservationTemplateStatus: 'ready_for_manual_observation',
      postImportManualObservationRows: 4,
      postImportManualObservationVisionRows: 3,
      postImportManualObservationLabelConflictRows: 1,
      postImportValidationEvidenceStatus: 'partial_evidence_collected',
      postImportValidationObservedEvidenceCases: 40,
      postImportValidationEvidenceMissingCases: 4,
      postImportValidationResultStatus: 'awaiting_validation_evidence'
    },
    nextActions: [
      {
        instructionKo: 'Capture post-import validation observations and build evidence.',
        commands: [
          'npm run operational:hitl:post-import-validation-observations',
          'npm run operational:hitl:post-import-validation-manual-template',
          'npm run operational:hitl:post-import-validation-manual-import',
          'npm run operational:hitl:post-import-validation-evidence',
          'npm run operational:hitl:post-import-validation-result'
        ]
      }
    ],
    stageTrail: [
      {
        code: 'post_import_validation_observations',
        titleKo: 'Post-import validation observations',
        status: 'partial_observations_collected'
      },
      {
        code: 'post_import_manual_observations',
        titleKo: 'Post-import manual observations',
        status: 'ready_for_manual_observation'
      },
      {
        code: 'post_import_validation_evidence',
        titleKo: 'Post-import validation evidence',
        status: 'partial_evidence_collected'
      }
    ]
  });

  assert.equal(display.statusLabel, 'Post-import validation pending');
  assert.equal(display.summaryText.includes('Post-import cases 44'), true);
  assert.equal(display.summaryText.includes('Graph obs 40/40'), true);
  assert.equal(display.summaryText.includes('Graph fail 1'), true);
  assert.equal(display.summaryText.includes('Manual obs 4'), true);
  assert.equal(display.summaryText.includes('Evidence 40/44'), true);
  assert.equal(display.summaryText.includes('Evidence missing 4'), true);
  assert.equal(display.summaryText.includes('Result awaiting_validation_evidence'), true);
  assert.equal(display.nextCommand, 'npm run operational:hitl:post-import-validation-observations');
  assert.deepEqual(display.stageTrailPreviews, [
    'Post-import validation observations - partial_observations_collected',
    'Post-import manual observations - ready_for_manual_observation',
    'Post-import validation evidence - partial_evidence_collected'
  ]);
});

test('returns null when no operational HITL pipeline status is available to display', () => {
  assert.equal(summarizeOperationalHitlPipelineStatusDisplay(null), null);
  assert.equal(summarizeOperationalHitlPipelineStatusDisplay({ contractVersion: 'unknown/v1' }), null);
});

test('summarizes operational HITL worktable suggestions for Settings UI display', () => {
  const display = summarizeOperationalHitlWorktableSuggestionDisplay({
    contractVersion: 'operational-hitl-decision-worktable-suggestion/v1',
    status: 'ready_for_human_review',
    summary: {
      totalRows: 59,
      pendingRows: 59,
      suggestionRows: 59,
      recaptureSuggestions: 5,
      approveCandidateSuggestions: 7,
      approveCardSuggestions: 43,
      needsReviewSuggestions: 4,
      needsChangesSuggestions: 0
    },
    rows: [
      {
        queueCode: 'vision_label_conflicts',
        decisionId: 'conflict-001',
        displayLabel: '제팅 | 플로우마크',
        recommendedNewAction: 'mark_needs_review',
        recommendationRisk: 'high',
        recommendationReasonKo: '라벨 충돌 항목은 원본 동일 hash와 지배 결함 확인 전까지 needs_review 격리가 안전합니다.',
        copyToWorktableInstructionKo: '원본 worktable row에 newAction과 검토 필드를 옮겨 적으세요.'
      },
      {
        queueCode: 'vision_pending_hitl',
        decisionId: 'pending-hitl-003',
        displayLabel: '웰드라인',
        recommendedNewAction: 'approve_candidate',
        recommendationRisk: 'medium',
        recommendationReasonKo: '비전 설명과 결함명이 일치하는 승인 후보입니다.'
      },
      {
        queueCode: 'web_knowledge_hitl',
        decisionId: 'web-basf-22-jetting',
        displayLabel: '제팅',
        recommendedNewAction: 'approve_card',
        recommendationRisk: 'medium',
        recommendationReasonKo: '필수 도메인 카드 필드가 채워져 있어 승인 후보입니다.'
      }
    ],
    recommendedAction: '추천 초안을 사람이 검토한 뒤 원본 worktable CSV에 옮겨 적으세요.'
  });

  assert.equal(display.title, 'HITL Worktable Suggestions');
  assert.equal(display.statusLabel, '사람 검토용 추천 준비');
  assert.equal(display.severity, 'warning');
  assert.equal(
    display.summaryText,
    '추천 59건 · 대기 59건 · 재촬영 5건 · Vision 후보 7건 · Web 후보 43건 · 검토필요 4건'
  );
  assert.equal(display.riskText, '위험도: high 1건 · medium 2건');
  assert.match(display.nextActionKo, /CSV/);
  assert.deepEqual(display.rowPreviews, [
    {
      queueCode: 'vision_label_conflicts',
      decisionId: 'conflict-001',
      displayLabel: '제팅 | 플로우마크',
      action: 'mark_needs_review',
      risk: 'high',
      reasonKo: '라벨 충돌 항목은 원본 동일 hash와 지배 결함 확인 전까지 needs_review 격리가 안전합니다.'
    },
    {
      queueCode: 'vision_pending_hitl',
      decisionId: 'pending-hitl-003',
      displayLabel: '웰드라인',
      action: 'approve_candidate',
      risk: 'medium',
      reasonKo: '비전 설명과 결함명이 일치하는 승인 후보입니다.'
    },
    {
      queueCode: 'web_knowledge_hitl',
      decisionId: 'web-basf-22-jetting',
      displayLabel: '제팅',
      action: 'approve_card',
      risk: 'medium',
      reasonKo: '필수 도메인 카드 필드가 채워져 있어 승인 후보입니다.'
    }
  ]);
  assert.deepEqual(display.safetyBadges, [
    'Suggestion-only',
    'newAction 자동 입력 금지',
    '자동 적용 금지',
    'Graph 승격 금지',
    'Model 학습 금지'
  ]);
});

test('returns null when no operational HITL worktable suggestions are available to display', () => {
  assert.equal(summarizeOperationalHitlWorktableSuggestionDisplay(null), null);
  assert.equal(summarizeOperationalHitlWorktableSuggestionDisplay({ contractVersion: 'unknown/v1' }), null);
});

test('summarizes operational HITL review session plan for Settings UI display', () => {
  const display = summarizeOperationalHitlReviewSessionPlanDisplay({
    contractVersion: 'operational-hitl-review-session-plan/v1',
    status: 'ready_for_human_review',
    summary: {
      totalRows: 59,
      sessionCount: 4,
      highRiskRows: 9,
      recaptureRows: 5,
      approveCandidateRows: 7,
      approveCardRows: 43,
      needsReviewRows: 4,
      needsChangesRows: 0
    },
    sessions: [
      {
        code: 'label_conflict_session',
        titleKo: '승인 이미지 라벨 충돌 선검토',
        priority: 1,
        rowCount: 4,
        highRiskRows: 4,
        guidanceKo: '동일 hash 원본 이미지와 후보 라벨 중 실제 지배 결함을 먼저 확인하세요.',
        rows: [
          {
            queueCode: 'vision_label_conflicts',
            decisionId: 'conflict-001',
            displayLabel: '제팅 | 플로우마크',
            recommendedNewAction: 'mark_needs_review',
            recommendationRisk: 'high',
            recommendationReasonKo: '라벨 충돌 항목은 원본 동일 hash와 지배 결함 확인 전까지 needs_review 격리가 안전합니다.',
            copyableFields: [
              { worktableColumn: 'newAction', value: 'mark_needs_review' },
              { worktableColumn: 'reviewComment', value: '라벨 충돌이 있어 원본 확인 전까지 학습 후보에서 격리합니다.' }
            ],
            manualConfirmationFields: ['selectedLabel', 'imageSetConfirmed', 'labelConfirmed']
          }
        ]
      },
      {
        code: 'recapture_session',
        titleKo: '재촬영 요청 검토',
        priority: 2,
        rowCount: 5,
        highRiskRows: 5,
        guidanceKo: '실제 제조 이미지 여부와 필요한 재촬영 view를 확정하세요.',
        rows: [
          {
            queueCode: 'vision_pending_hitl',
            decisionId: 'pending-hitl-001',
            displayLabel: '교육용 도식',
            recommendedNewAction: 'request_recapture',
            recommendationRisk: 'high',
            recommendationReasonKo: '비전 설명에 도식/비제조 이미지 위험이 있어 학습 승인보다 재촬영 요청으로 검토하는 것이 안전합니다.',
            copyableFields: [
              { worktableColumn: 'newAction', value: 'request_recapture' },
              { worktableColumn: 'requestedViews', value: '제품 전체 정면 | 결함부 근접' }
            ],
            manualConfirmationFields: ['reviewer.id', 'decidedAt']
          }
        ]
      }
    ],
    recommendedAction: '세션별 검토 순서에 따라 사람이 추천값을 확인하고 원본 worktable CSV에 필요한 값만 옮겨 적으세요.'
  });

  assert.equal(display.title, 'HITL Review Session Plan');
  assert.equal(display.statusLabel, '세션별 사람 검토 준비');
  assert.equal(display.severity, 'warning');
  assert.equal(
    display.summaryText,
    '전체 59건 · 세션 4건 · 고위험 9건 · 재촬영 5건 · Vision 후보 7건 · Web 후보 43건 · needs_review 4건'
  );
  assert.match(display.nextActionKo, /세션별/);
  assert.deepEqual(display.sessionPreviews, [
    {
      code: 'label_conflict_session',
      titleKo: '승인 이미지 라벨 충돌 선검토',
      priority: 1,
      rowCount: 4,
      highRiskRows: 4,
      guidanceKo: '동일 hash 원본 이미지와 후보 라벨 중 실제 지배 결함을 먼저 확인하세요.',
      firstRows: [
        {
          queueCode: 'vision_label_conflicts',
          decisionId: 'conflict-001',
          displayLabel: '제팅 | 플로우마크',
          action: 'mark_needs_review',
          risk: 'high',
          copyableText: '복사 후보: newAction=mark_needs_review · reviewComment=라벨 충돌이 있어 원본 확인 전까지 학습 후보에서 격리합니다.',
          manualText: '사람 확인: selectedLabel · imageSetConfirmed · labelConfirmed'
        }
      ]
    },
    {
      code: 'recapture_session',
      titleKo: '재촬영 요청 검토',
      priority: 2,
      rowCount: 5,
      highRiskRows: 5,
      guidanceKo: '실제 제조 이미지 여부와 필요한 재촬영 view를 확정하세요.',
      firstRows: [
        {
          queueCode: 'vision_pending_hitl',
          decisionId: 'pending-hitl-001',
          displayLabel: '교육용 도식',
          action: 'request_recapture',
          risk: 'high',
          copyableText: '복사 후보: newAction=request_recapture · requestedViews=제품 전체 정면 | 결함부 근접',
          manualText: '사람 확인: reviewer.id · decidedAt'
        }
      ]
    }
  ]);
  assert.deepEqual(display.safetyBadges, [
    'Session-plan only',
    'newAction 자동 입력 금지',
    '자동 적용 금지',
    'Graph 승격 금지',
    'Model 학습 금지'
  ]);
});

test('returns null when no operational HITL review session plan is available to display', () => {
  assert.equal(summarizeOperationalHitlReviewSessionPlanDisplay(null), null);
  assert.equal(summarizeOperationalHitlReviewSessionPlanDisplay({ contractVersion: 'unknown/v1' }), null);
});

test('summarizes operational HITL review session packet for Settings UI display', () => {
  const display = summarizeOperationalHitlReviewSessionPacketDisplay({
    contractVersion: 'operational-hitl-review-session-packet/v1',
    status: 'ready_for_human_review',
    packetDir: 'C:\\repo\\artifacts\\operational-hitl-review-session-packet-files',
    summary: {
      totalRows: 59,
      sessionPacketCount: 4,
      highRiskRows: 9,
      filesToWrite: 8
    },
    packets: [
      {
        code: 'label_conflict_session',
        titleKo: '승인 이미지 라벨 충돌 선검토',
        priority: 1,
        rowCount: 4,
        highRiskRows: 4,
        csvFileName: '01-label-conflict-session.csv',
        markdownFileName: '01-label-conflict-session.md',
        csvPath: 'C:\\repo\\artifacts\\operational-hitl-review-session-packet-files\\01-label-conflict-session.csv',
        markdownPath: 'C:\\repo\\artifacts\\operational-hitl-review-session-packet-files\\01-label-conflict-session.md'
      },
      {
        code: 'recapture_session',
        titleKo: '재촬영 요청 검토',
        priority: 2,
        rowCount: 5,
        highRiskRows: 5,
        csvFileName: '02-recapture-session.csv',
        markdownFileName: '02-recapture-session.md',
        csvPath: 'C:\\repo\\artifacts\\operational-hitl-review-session-packet-files\\02-recapture-session.csv',
        markdownPath: 'C:\\repo\\artifacts\\operational-hitl-review-session-packet-files\\02-recapture-session.md'
      }
    ],
    recommendedAction: '세션별 CSV/Markdown을 사람이 검토한 뒤 원본 worktable CSV에 필요한 값만 옮겨 적으세요.'
  });

  assert.equal(display.title, 'HITL Review Session Packet');
  assert.equal(display.statusLabel, '세션별 검토 파일 준비');
  assert.equal(display.severity, 'warning');
  assert.equal(display.summaryText, '전체 59건 · 패킷 4건 · 고위험 9건 · 파일 8개');
  assert.equal(display.packetDir, 'C:\\repo\\artifacts\\operational-hitl-review-session-packet-files');
  assert.match(display.nextActionKo, /세션별 CSV/);
  assert.deepEqual(display.packetPreviews, [
    {
      code: 'label_conflict_session',
      titleKo: '승인 이미지 라벨 충돌 선검토',
      priority: 1,
      rowCount: 4,
      highRiskRows: 4,
      csvFileName: '01-label-conflict-session.csv',
      markdownFileName: '01-label-conflict-session.md',
      csvPath: 'C:\\repo\\artifacts\\operational-hitl-review-session-packet-files\\01-label-conflict-session.csv',
      markdownPath: 'C:\\repo\\artifacts\\operational-hitl-review-session-packet-files\\01-label-conflict-session.md'
    },
    {
      code: 'recapture_session',
      titleKo: '재촬영 요청 검토',
      priority: 2,
      rowCount: 5,
      highRiskRows: 5,
      csvFileName: '02-recapture-session.csv',
      markdownFileName: '02-recapture-session.md',
      csvPath: 'C:\\repo\\artifacts\\operational-hitl-review-session-packet-files\\02-recapture-session.csv',
      markdownPath: 'C:\\repo\\artifacts\\operational-hitl-review-session-packet-files\\02-recapture-session.md'
    }
  ]);
  assert.deepEqual(display.safetyBadges, [
    'Packet-only',
    'newAction 자동 입력 금지',
    '자동 적용 금지',
    'Graph 승격 금지',
    'Model 학습 금지'
  ]);
});

test('returns null when no operational HITL review session packet is available to display', () => {
  assert.equal(summarizeOperationalHitlReviewSessionPacketDisplay(null), null);
  assert.equal(summarizeOperationalHitlReviewSessionPacketDisplay({ contractVersion: 'unknown/v1' }), null);
});

test('summarizes operational HITL human decision brief for Settings UI display', () => {
  const display = summarizeOperationalHitlHumanDecisionBriefDisplay({
    contractVersion: 'operational-hitl-human-decision-brief/v1',
    status: 'ready_for_human_entry',
    pipelineStageKo: 'CSV HITL 판정 입력 대기',
    worktableCsvPath: 'C:\\repo\\artifacts\\operational-hitl-decision-worktable-export.csv',
    summary: {
      totalRows: 59,
      completedRows: 0,
      pendingRows: 59,
      invalidRows: 0,
      highRiskRows: 9,
      sessionCount: 4,
      nextSessionCode: 'label_conflict_session',
      nextDecisionId: 'conflict-001'
    },
    operatorSteps: [
      {
        code: 'open_session_packet',
        titleKo: '세션 패킷 열기',
        instructionKo: '먼저 세션 Markdown 파일을 열어 검토 대상과 근거를 확인하세요.',
        path: 'C:\\repo\\packet\\01-label-conflict-session.md'
      },
      {
        code: 'fill_original_worktable_csv',
        titleKo: '원본 worktable CSV 입력',
        instructionKo: '원본 worktable CSV에 사람이 확인한 값만 입력하세요.',
        path: 'C:\\repo\\artifacts\\operational-hitl-decision-worktable-export.csv'
      },
      {
        code: 'dry_run_import',
        titleKo: '입력 dry-run 검증',
        instructionKo: 'npm run operational:hitl:worktable-import를 실행하세요.',
        command: 'npm run operational:hitl:worktable-import'
      }
    ],
    sessions: [
      {
        code: 'label_conflict_session',
        titleKo: '승인 이미지 라벨 충돌 선검토',
        priority: 1,
        status: 'awaiting_human_csv_decisions',
        rowCount: 4,
        completedRows: 0,
        pendingRows: 4,
        invalidRows: 0,
        highRiskRows: 4,
        markdownPath: 'C:\\repo\\packet\\01-label-conflict-session.md',
        guidanceKo: '동일 hash 원본 이미지와 후보 라벨 중 실제 지배 결함을 먼저 확인하세요.',
        nextRows: [
          {
            queueCode: 'vision_label_conflicts',
            decisionId: 'conflict-001',
            displayLabel: '제팅 | 플로우마크',
            recommendedNewAction: 'mark_needs_review',
            recommendationRisk: 'high',
            recommendationReasonKo: '라벨 충돌은 원본 확인 전까지 needs_review 격리가 안전합니다.',
            requiredHumanChecksKo: '원본 이미지와 후보 라벨 중 실제 지배 결함을 확인하세요.',
            copyableFields: [
              'newAction=mark_needs_review',
              'reviewComment=라벨 충돌이 있어 원본 확인 전까지 학습 후보에서 격리합니다.'
            ],
            manualConfirmationFields: [
              'selectedLabel',
              'reviewer.id',
              'decidedAt'
            ]
          }
        ]
      }
    ],
    recommendedAction: '다음 세션 패킷을 열고 원본 worktable CSV에 사람이 확인한 값만 입력하세요.'
  });

  assert.equal(display.title, 'HITL Human Decision Brief');
  assert.equal(display.statusLabel, '사람 CSV 입력 대기');
  assert.equal(display.severity, 'warning');
  assert.equal(display.stageText, 'CSV HITL 판정 입력 대기');
  assert.equal(
    display.summaryText,
    '전체 59건 · 완료 0건 · 대기 59건 · 고위험 9건 · 세션 4건'
  );
  assert.equal(display.worktableCsvPath, 'C:\\repo\\artifacts\\operational-hitl-decision-worktable-export.csv');
  assert.equal(display.nextSessionText, '다음 세션: label_conflict_session · conflict-001');
  assert.equal(display.nextCommand, 'npm run operational:hitl:worktable-import');
  assert.deepEqual(display.operatorStepPreviews, [
    {
      code: 'open_session_packet',
      titleKo: '세션 패킷 열기',
      instructionKo: '먼저 세션 Markdown 파일을 열어 검토 대상과 근거를 확인하세요.',
      command: '',
      path: 'C:\\repo\\packet\\01-label-conflict-session.md'
    },
    {
      code: 'fill_original_worktable_csv',
      titleKo: '원본 worktable CSV 입력',
      instructionKo: '원본 worktable CSV에 사람이 확인한 값만 입력하세요.',
      command: '',
      path: 'C:\\repo\\artifacts\\operational-hitl-decision-worktable-export.csv'
    },
    {
      code: 'dry_run_import',
      titleKo: '입력 dry-run 검증',
      instructionKo: 'npm run operational:hitl:worktable-import를 실행하세요.',
      command: 'npm run operational:hitl:worktable-import',
      path: ''
    }
  ]);
  assert.deepEqual(display.sessionPreviews, [
    {
      code: 'label_conflict_session',
      titleKo: '승인 이미지 라벨 충돌 선검토',
      priority: 1,
      status: 'awaiting_human_csv_decisions',
      rowCount: 4,
      completedRows: 0,
      pendingRows: 4,
      invalidRows: 0,
      highRiskRows: 4,
      markdownPath: 'C:\\repo\\packet\\01-label-conflict-session.md',
      guidanceKo: '동일 hash 원본 이미지와 후보 라벨 중 실제 지배 결함을 먼저 확인하세요.',
      nextRows: [
        {
          queueCode: 'vision_label_conflicts',
          decisionId: 'conflict-001',
          displayLabel: '제팅 | 플로우마크',
          action: 'mark_needs_review',
          risk: 'high',
          reasonKo: '라벨 충돌은 원본 확인 전까지 needs_review 격리가 안전합니다.',
          requiredHumanChecksKo: '원본 이미지와 후보 라벨 중 실제 지배 결함을 확인하세요.',
          copyableText: '복사 후보: newAction=mark_needs_review · reviewComment=라벨 충돌이 있어 원본 확인 전까지 학습 후보에서 격리합니다.',
          manualText: '사람 확인: selectedLabel · reviewer.id · decidedAt'
        }
      ]
    }
  ]);
  assert.deepEqual(display.safetyBadges, [
    'Brief-only',
    'newAction 자동 입력 금지',
    '자동 적용 금지',
    'Graph 승격 금지',
    'Model 학습 금지'
  ]);
});

test('returns null when no operational HITL human decision brief is available to display', () => {
  assert.equal(summarizeOperationalHitlHumanDecisionBriefDisplay(null), null);
  assert.equal(summarizeOperationalHitlHumanDecisionBriefDisplay({ contractVersion: 'unknown/v1' }), null);
});

test('summarizes Mold Master development progress for Settings UI display', () => {
  const display = summarizeMoldMasterDevelopmentProgressDisplay({
    contractVersion: 'mold-master-development-progress-report/v1',
    status: 'action_required',
    currentPhase: {
      code: 'operational_data_hitl_closure',
      titleKo: '운영 전환 전 데이터/HITL 게이트 종료 단계'
    },
    summary: {
      visionBlockers: 8,
      visionTasks: 5,
      webHitlApprovalsMissing: 40,
      webCentralApprovalsMissing: 40,
      operationalHitlDecisionInputsMissing: 56,
      operationalHitlFirstQueueCode: 'vision_label_conflicts',
      visionTop1Accuracy: 46.2,
      visionTop3Accuracy: 53.8,
      visionCaptureProtocolReadyRate: 0,
      visionAccuracyFirstTrackCode: 'repair_capture_protocol',
      topPriorityTaskCode: 'resolve_label_conflicts'
    },
    progress: {
      software: {
        implementedStages: 10,
        totalStages: 10,
        percent: 100
      },
      operational: {
        completedStages: 0,
        totalStages: 10,
        blockedStages: 10,
        percent: 0
      }
    },
    nextActions: [
      {
        code: 'resolve_label_conflicts',
        owner: 'quality_hitl',
        priority: 100,
        titleKo: '승인 이미지 라벨 충돌 해결',
        commands: [
          'npm run vision:label-conflicts:packet',
          'npm run vision:label-conflicts:decision-template'
        ]
      }
    ],
    stageCards: [
      {
        id: 'vision_safety_contract',
        titleKo: 'Vision 안전 계약/Graph 차단',
        status: 'implemented',
        owner: 'mold_master_ai',
        blockerCodes: ['post_hitl_blockers'],
        commands: [],
        feedbackKo: 'Vision 분석은 안전 게이트와 Graph 승격 차단 정책이 동작 중입니다.'
      },
      {
        id: 'operational_hitl_decision_intake',
        titleKo: 'HITL decision intake',
        status: 'action_required',
        owner: 'quality_hitl',
        blockerCodes: ['hitl_decision_inputs_missing'],
        commands: ['npm run vision:label-conflicts:decision-template'],
        feedbackKo: 'HITL decision 입력 56건이 남아 있습니다.'
      }
    ],
    progressFeedbackKo: [
      '개발 단계: 운영 전환 전 데이터/HITL 게이트 종료 단계입니다.',
      '현재 Vision blocker 8건, 운영 작업 5건, Web HITL 미승인 40건이 남아 있습니다.',
      '다음 1순위는 승인 이미지 라벨 충돌 해결입니다.',
      '자동 Graph 승격, Reference 학습, 모델 학습은 사람이 검증하기 전까지 금지됩니다.'
    ]
  });

  assert.equal(display.title, 'Mold Master Development Progress');
  assert.equal(display.statusLabel, '운영 전환 조치 필요');
  assert.equal(display.severity, 'warning');
  assert.equal(display.phaseText, '운영 전환 전 데이터/HITL 게이트 종료 단계');
  assert.equal(display.summaryText, '소프트웨어 100% · 운영 0% · Vision blocker 8건 · HITL 56건 · Web 승인대기 40건');
  assert.equal(display.accuracyText, 'Vision Top-1 46.2% · Top-3 53.8% · 촬영 프로토콜 0% · 개선 repair_capture_protocol');
  assert.equal(display.nextActionKo, '승인 이미지 라벨 충돌 해결 · quality_hitl · P100');
  assert.equal(display.nextCommand, 'npm run vision:label-conflicts:packet');
  assert.deepEqual(display.feedbackPreviews, [
    '개발 단계: 운영 전환 전 데이터/HITL 게이트 종료 단계입니다.',
    '현재 Vision blocker 8건, 운영 작업 5건, Web HITL 미승인 40건이 남아 있습니다.',
    '다음 1순위는 승인 이미지 라벨 충돌 해결입니다.',
    '자동 Graph 승격, Reference 학습, 모델 학습은 사람이 검증하기 전까지 금지됩니다.'
  ]);
  assert.deepEqual(display.stagePreviews, [
    {
      id: 'vision_safety_contract',
      titleKo: 'Vision 안전 계약/Graph 차단',
      status: 'implemented',
      owner: 'mold_master_ai',
      blockerText: 'post_hitl_blockers',
      commandCount: 0,
      feedbackKo: 'Vision 분석은 안전 게이트와 Graph 승격 차단 정책이 동작 중입니다.'
    },
    {
      id: 'operational_hitl_decision_intake',
      titleKo: 'HITL decision intake',
      status: 'action_required',
      owner: 'quality_hitl',
      blockerText: 'hitl_decision_inputs_missing',
      commandCount: 1,
      feedbackKo: 'HITL decision 입력 56건이 남아 있습니다.'
    }
  ]);
  assert.deepEqual(display.safetyBadges, [
    'Artifact-only',
    '자동 적용 금지',
    'Graph 승격 금지',
    'Reference 학습 금지',
    'Model 학습 금지'
  ]);
});

test('returns null when no Mold Master development progress report is available to display', () => {
  assert.equal(summarizeMoldMasterDevelopmentProgressDisplay(null), null);
  assert.equal(summarizeMoldMasterDevelopmentProgressDisplay({ contractVersion: 'unknown/v1' }), null);
});

test('summarizes operational status bundle for one-step Settings handoff display', () => {
  const display = summarizeOperationalStatusBundleDisplay({
    contractVersion: 'operational-status-bundle/v1',
    status: 'awaiting_human_hitl',
    statusLabelKo: '사람 HITL 판정 입력 대기',
    summary: {
      currentPhaseKo: '운영 전환 및 데이터 HITL 게이트 종료 단계',
      currentPipelineStageKo: 'CSV HITL 판정 입력 대기',
      softwareScaffoldPercent: 100,
      operationalProgressPercent: 0,
      visionBlockers: 8,
      visionTasks: 5,
      hitlDecisionInputsMissing: 56,
      pendingRows: 59,
      completedRows: 0,
      invalidRows: 0,
      highRiskRows: 9,
      webCards: 43,
      webTargetCards: 40,
      webCommonAgentValidationPassed: 43,
      webHitlApprovalsMissing: 40,
      webCentralApprovalsMissing: 40,
      visionTop1Accuracy: 46.2,
      visionTop3Accuracy: 53.8,
      visionCaptureWorkOrderStatus: 'capture_required',
      visionCaptureWorkOrders: 7,
      visionCaptureMissingApprovedSamples: 4,
      visionCaptureRecaptureSamples: 10,
      visionCaptureTopPriorityDefectClass: 'burn',
      nextSessionCode: 'label_conflict_session',
      nextDecisionId: 'conflict-001',
      worktableCsvPath: 'C:\\repo\\artifacts\\worktable.csv'
    },
    visionCaptureWorkOrderPreviews: [
      {
        defectClass: 'burn',
        actionType: 'capture_new_multiview_samples',
        priority: 105,
        missingApprovedSamples: 2,
        recaptureSampleCount: 0,
        requiredViews: ['full_part_context', 'defect_closeup', 'fill_end_context', 'vent_context']
      }
    ],
    settingsImportChecklist: [
      { buttonLabelKo: 'Progress 등록', artifactKey: 'developmentProgress' },
      { buttonLabelKo: 'Pipeline Status 등록', artifactKey: 'pipelineStatus' },
      { buttonLabelKo: 'Human Brief 등록', artifactKey: 'humanDecisionBrief' },
      { buttonLabelKo: 'Session Packet 등록', artifactKey: 'reviewSessionPacket' }
    ],
    sessionPointers: [
      {
        code: 'label_conflict_session',
        titleKo: '승인 이미지 라벨 충돌 확인',
        priority: 1,
        pendingRows: 4,
        highRiskRows: 4,
        firstDecisionId: 'conflict-001',
        markdownPath: 'C:\\repo\\artifacts\\session.md',
        csvPath: 'C:\\repo\\artifacts\\session.csv'
      }
    ],
    nextOperatorActions: [
      {
        code: 'fill_original_worktable_csv',
        titleKo: '원본 worktable CSV 입력',
        instructionKo: '사람이 확인한 값만 입력하세요.',
        path: 'C:\\repo\\artifacts\\worktable.csv'
      }
    ],
    progressFeedbackKo: [
      '개발 단계: 운영 전환 및 데이터 HITL 게이트 종료 단계입니다.',
      '자동 Graph 반영, Reference 학습, 모델 학습은 금지됩니다.'
    ],
    recommendedAction: '다음 세션 패킷을 열고 원본 worktable CSV에 사람이 확인한 값만 입력하세요.'
  });

  assert.equal(display.title, 'Operational Status Bundle');
  assert.equal(display.statusLabel, '사람 HITL 판정 입력 대기');
  assert.equal(display.severity, 'warning');
  assert.equal(display.phaseText, '운영 전환 및 데이터 HITL 게이트 종료 단계');
  assert.equal(display.pipelineStageText, 'CSV HITL 판정 입력 대기');
  assert.equal(display.summaryText, 'Software 100% · Operational 0% · Vision blocker 8건 · HITL missing 56건 · Pending 59건 · High risk 9건 · Web approval 40건');
  assert.equal(display.webKnowledgeText, 'Web cases 43/40 · Common Agent 43건 · HITL 승인대기 40건 · 중앙 승인대기 40건');
  assert.equal(display.accuracyText, 'Vision Top-1 46.2% · Top-3 53.8%');
  assert.equal(display.nextSessionText, 'Next session: label_conflict_session · conflict-001');
  assert.equal(display.captureWorkOrderText, 'Capture work orders 7건 · 신규 4건 · 재촬영 10건 · 우선 burn');
  assert.deepEqual(display.captureWorkOrderPreviews, [
    {
      defectClass: 'burn',
      actionType: 'capture_new_multiview_samples',
      priority: 105,
      missingApprovedSamples: 2,
      recaptureSampleCount: 0,
      requiredViewsText: 'full_part_context, defect_closeup, fill_end_context, vent_context'
    }
  ]);
  assert.equal(display.worktableCsvPath, 'C:\\repo\\artifacts\\worktable.csv');
  assert.deepEqual(display.settingsImportButtons, [
    'Progress 등록',
    'Pipeline Status 등록',
    'Human Brief 등록',
    'Session Packet 등록'
  ]);
  assert.deepEqual(display.sessionPreviews, [
    {
      code: 'label_conflict_session',
      titleKo: '승인 이미지 라벨 충돌 확인',
      priority: 1,
      pendingRows: 4,
      highRiskRows: 4,
      firstDecisionId: 'conflict-001',
      path: 'C:\\repo\\artifacts\\session.md'
    }
  ]);
  assert.deepEqual(display.actionPreviews, [
    {
      code: 'fill_original_worktable_csv',
      titleKo: '원본 worktable CSV 입력',
      instructionKo: '사람이 확인한 값만 입력하세요.',
      path: 'C:\\repo\\artifacts\\worktable.csv'
    }
  ]);
  assert.deepEqual(display.feedbackPreviews, [
    '개발 단계: 운영 전환 및 데이터 HITL 게이트 종료 단계입니다.',
    '자동 Graph 반영, Reference 학습, 모델 학습은 금지됩니다.'
  ]);
  assert.deepEqual(display.safetyBadges, [
    'Bundle-only',
    'Auto apply blocked',
    'Graph promotion blocked',
    'Reference learning blocked',
    'Model training blocked'
  ]);
});

test('returns null when no operational status bundle is available to display', () => {
  assert.equal(summarizeOperationalStatusBundleDisplay(null), null);
  assert.equal(summarizeOperationalStatusBundleDisplay({ contractVersion: 'unknown/v1' }), null);
});
