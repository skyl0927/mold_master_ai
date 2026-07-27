const assert = require('node:assert/strict');
const test = require('node:test');

const {
  summarizeVisionOperationalHitlWorkflowDisplay,
  summarizeVisionOperationalLabelConflictWorkflowDisplay,
  summarizeOperationalHitlActionPackDisplay,
  summarizeOperationalHitlPipelineStatusDisplay,
  summarizeOperationalHitlWorktableSuggestionDisplay,
  summarizeOperationalHitlReviewSessionPlanDisplay,
  summarizeOperationalHitlReviewSessionPacketDisplay
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
    '미입력 56건 · 작업표 59건 · 추천 59건 · 검토세션 4건 · 고위험 9건 · 검토패킷 4건 · 패킷파일 8개 · 세션대기 59건 · 사전검증 59건 · 재촬영 5건 · Vision 후보 7건 · Web 후보 43건'
  );
  assert.equal(display.stageText, 'CSV HITL 판정 입력 대기');
  assert.equal(display.suggestionText, '추천 분포: 재촬영 5건 · Vision 후보 7건 · Web 후보 43건 · 검토필요 4건');
  assert.equal(display.nextCommand, 'npm run operational:hitl:worktable-suggest');
  assert.deepEqual(display.nextCommands, [
    'npm run operational:hitl:worktable-suggest',
    'npm run operational:hitl:dry-run-roundtrip',
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
