const compact = value => String(value || '').replace(/\s+/g, ' ').trim();

const numberValue = value => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const statusLabelFor = (status, invalidDecisions) => {
  if (status === 'invalid_decisions') return '판정 오류 수정 필요';
  if (status === 'ready_for_manual_import') return '수동 Import 준비';
  if (status === 'partial_human_review') return '일부 판정 완료';
  if (status === 'decision_template_missing') return '판정 템플릿 필요';
  if (status === 'missing_queue_packet') return 'HITL 큐 필요';
  if (status === 'awaiting_decision_verification') return '판정 검증 대기';
  if (status === 'awaiting_human_review') return '판정 작성/검증 대기';
  if (status === 'clear') return 'HITL 대기 없음';
  return invalidDecisions > 0 ? '판정 오류 수정 필요' : compact(status);
};

const severityFor = (status, invalidDecisions) => {
  if (status === 'invalid_decisions' || invalidDecisions > 0) return 'danger';
  if (status === 'ready_for_manual_import' || status === 'clear') return 'success';
  return 'warning';
};

const workflowFrom = worklist => {
  if (!worklist) return null;
  const taskWorkflow = (Array.isArray(worklist.tasks) ? worklist.tasks : [])
    .find(task => task?.code === 'close_hitl_reviews' && task.workflowStatus)
    ?.workflowStatus;
  if (taskWorkflow) return taskWorkflow;
  return (Array.isArray(worklist.commonAgentHandoff?.items) ? worklist.commonAgentHandoff.items : [])
    .find(item => item?.taskCode === 'close_hitl_reviews' && item.workflowStatus)
    ?.workflowStatus || null;
};

const labelConflictWorkflowFrom = worklist => {
  if (!worklist) return null;
  const taskWorkflow = (Array.isArray(worklist.tasks) ? worklist.tasks : [])
    .find(task => task?.code === 'resolve_label_conflicts' && task.workflowStatus)
    ?.workflowStatus;
  if (taskWorkflow) return taskWorkflow;
  return (Array.isArray(worklist.commonAgentHandoff?.items) ? worklist.commonAgentHandoff.items : [])
    .find(item => item?.taskCode === 'resolve_label_conflicts' && item.workflowStatus)
    ?.workflowStatus || null;
};

const summarizeVisionOperationalHitlWorkflowDisplay = worklist => {
  const workflow = workflowFrom(worklist);
  if (!workflow) return null;

  const status = compact(workflow.status);
  const queueCount = numberValue(workflow.queue?.pendingHighConfidence);
  const templateCount = numberValue(workflow.template?.decisionsPrepared);
  const pendingCount = numberValue(workflow.verification?.pendingQueueItems);
  const invalidCount = numberValue(workflow.verification?.invalidDecisions);
  const acceptedCount = numberValue(workflow.verification?.acceptedDecisions);
  const nonApprovalCount = numberValue(workflow.nonApprovalWorklist?.totalItems);
  const parts = [
    `큐 ${queueCount}건`,
    `템플릿 ${templateCount}건`,
    acceptedCount > 0 ? `검증 ${acceptedCount}건` : '',
    `미판정 ${pendingCount}건`,
    nonApprovalCount > 0 ? `비승인 조치 ${nonApprovalCount}건` : '',
    invalidCount > 0 ? `오류 ${invalidCount}건` : ''
  ].filter(Boolean);

  return {
    title: 'HITL Workflow',
    status,
    statusLabel: statusLabelFor(status, invalidCount),
    severity: severityFor(status, invalidCount),
    summaryText: parts.join(' · '),
    nextCommand: compact(workflow.nextCommand),
    nextCommands: Array.isArray(workflow.nextCommands)
      ? workflow.nextCommands.map(compact).filter(Boolean)
      : [compact(workflow.nextCommand)].filter(Boolean),
    nextActionKo: compact(workflow.nextActionKo),
    safetyBadges: [
      '자동 적용 금지',
      'Graph 승격 금지',
      'Reference 학습 금지'
    ]
  };
};

const labelConflictStatusLabelFor = (status, invalidDecisions, invalidTargets) => {
  if (status === 'invalid_decisions') return '판정 오류 수정 필요';
  if (status === 'apply_target_mismatch' || invalidTargets > 0) return '적용 대상 오류';
  if (status === 'applied') return '로컬 반영 완료';
  if (status === 'dry_run_ready') return 'Apply 승인 대기';
  if (status === 'ready_for_apply') return 'Apply Dry-run 필요';
  if (status === 'ready_for_manual_import') return 'Apply 준비';
  if (status === 'partial_human_review') return '일부 판정 완료';
  if (status === 'decision_template_missing') return '판정 템플릿 필요';
  if (status === 'missing_conflict_packet') return '충돌 패킷 필요';
  if (status === 'awaiting_decision_verification') return '판정 검증 대기';
  if (status === 'awaiting_human_review') return '판정 작성/검증 대기';
  if (status === 'clear') return '라벨 충돌 없음';
  return compact(status);
};

const labelConflictSeverityFor = (status, invalidDecisions, invalidTargets) => {
  if (
    status === 'invalid_decisions'
    || status === 'apply_target_mismatch'
    || invalidDecisions > 0
    || invalidTargets > 0
  ) return 'danger';
  if (status === 'applied' || status === 'clear') return 'success';
  return 'warning';
};

const actionPackStatusLabelFor = status => {
  if (status === 'clear') return 'HITL 입력 완료';
  if (status === 'missing_evidence') return '증거 재생성 필요';
  if (status === 'action_required') return '판정 입력 필요';
  return compact(status);
};

const actionPackSeverityFor = status => {
  if (status === 'clear') return 'success';
  if (status === 'missing_evidence') return 'danger';
  return 'warning';
};

const pipelineStatusLabelFor = (status, stageCode) => {
  if (status === 'missing_evidence') return '증거 재생성 필요';
  if (stageCode === 'fix_dry_run_roundtrip') return '추천 사전검증 오류';
  if (stageCode === 'awaiting_human_csv_decisions') return 'CSV 판정 입력 대기';
  if (stageCode === 'review_worktable_import_plan') return '작업표 반영 승인 대기';
  if (status === 'ready_for_common_agent_manual_review') return 'Common Agent 전달 준비';
  if (status === 'ready_for_post_import_validation') return '사후 검증 준비';
  if (status === 'complete' || status === 'clear') return '완료';
  if (status === 'action_required') return '조치 필요';
  return compact(status);
};

const pipelineSeverityFor = (status, stageCode) => {
  if (stageCode === 'fix_dry_run_roundtrip') return 'danger';
  if (status === 'missing_evidence') return 'danger';
  if (
    status === 'ready_for_common_agent_manual_review'
    || status === 'ready_for_post_import_validation'
    || status === 'complete'
    || status === 'clear'
  ) return 'success';
  return 'warning';
};

const worktableSuggestionStatusLabelFor = status => {
  if (status === 'ready_for_human_review') return '사람 검토용 추천 준비';
  if (status === 'missing_evidence') return '증거 재생성 필요';
  if (status === 'clear') return '추천 대기 없음';
  return compact(status);
};

const worktableSuggestionSeverityFor = status => {
  if (status === 'missing_evidence') return 'danger';
  if (status === 'clear') return 'success';
  return 'warning';
};

const reviewSessionPlanStatusLabelFor = status => {
  if (status === 'ready_for_human_review') return '세션별 사람 검토 준비';
  if (status === 'missing_evidence') return '증거 재생성 필요';
  if (status === 'clear') return '검토 세션 없음';
  return compact(status);
};

const reviewSessionPlanSeverityFor = status => {
  if (status === 'missing_evidence') return 'danger';
  if (status === 'clear') return 'success';
  return 'warning';
};

const reviewSessionPacketStatusLabelFor = status => {
  if (status === 'ready_for_human_review') return '세션별 검토 파일 준비';
  if (status === 'missing_evidence') return '증거 재생성 필요';
  if (status === 'clear') return '검토 패킷 없음';
  return compact(status);
};

const reviewSessionPacketSeverityFor = status => {
  if (status === 'missing_evidence') return 'danger';
  if (status === 'clear') return 'success';
  return 'warning';
};

const copyableTextFor = fields => {
  const parts = (Array.isArray(fields) ? fields : [])
    .map(field => `${compact(field?.worktableColumn)}=${compact(field?.value)}`)
    .filter(part => !part.startsWith('=') && !part.endsWith('='));
  return parts.length > 0 ? `복사 후보: ${parts.join(' · ')}` : '';
};

const manualTextFor = fields => {
  const parts = (Array.isArray(fields) ? fields : []).map(compact).filter(Boolean);
  return parts.length > 0 ? `사람 확인: ${parts.join(' · ')}` : '';
};

const summarizeOperationalHitlActionPackDisplay = actionPack => {
  if (actionPack?.contractVersion !== 'operational-hitl-action-pack/v1') return null;

  const summary = actionPack.summary || {};
  const steps = Array.isArray(actionPack.actionSteps)
    ? actionPack.actionSteps
    : [];
  const firstStep = steps.find(step => step?.queueCode === summary.firstQueueCode)
    || steps[0]
    || null;
  const parts = [
    `미입력 ${numberValue(summary.totalDecisionInputsMissing)}건`,
    `라벨충돌 ${numberValue(summary.labelConflictPending)}건`,
    `Vision ${numberValue(summary.visionHitlPending)}건`,
    `Web ${numberValue(summary.webHitlMissing)}건`
  ];

  return {
    title: 'HITL Action Pack',
    status: compact(actionPack.status),
    statusLabel: actionPackStatusLabelFor(compact(actionPack.status)),
    severity: actionPackSeverityFor(compact(actionPack.status)),
    summaryText: parts.join(' · '),
    firstQueueCode: compact(summary.firstQueueCode) || null,
    firstActionTitle: compact(firstStep?.titleKo) || null,
    nextActionKo: compact(firstStep?.operatorInstructionKo)
      || compact(actionPack.recommendedAction),
    nextCommand: compact(firstStep?.commands?.[0]),
    nextCommands: Array.isArray(firstStep?.commands)
      ? firstStep.commands.map(compact).filter(Boolean)
      : [],
    actionStepPreviews: steps.slice(0, 3).map(step =>
      `${compact(step?.titleKo) || compact(step?.queueCode)} · ${compact(step?.owner) || 'owner 미정'} · ${numberValue(step?.pending)}건`
    ),
    safetyBadges: [
      'Artifact-only',
      '자동 적용 금지',
      'Graph 승격 금지',
      'Reference 학습 금지'
    ]
  };
};

const summarizeOperationalHitlPipelineStatusDisplay = pipelineStatus => {
  if (pipelineStatus?.contractVersion !== 'operational-hitl-pipeline-status/v1') return null;

  const summary = pipelineStatus.summary || {};
  const status = compact(pipelineStatus.status);
  const stageCode = compact(pipelineStatus.currentStage?.code);
  const firstAction = Array.isArray(pipelineStatus.nextActions)
    ? pipelineStatus.nextActions[0]
    : null;
  const missingArtifacts = numberValue(summary.missingArtifacts);
  const suggestionParts = [
    numberValue(summary.worktableRecaptureSuggestions) > 0
      ? `재촬영 ${numberValue(summary.worktableRecaptureSuggestions)}건`
      : '',
    numberValue(summary.worktableApproveCandidateSuggestions) > 0
      ? `Vision 후보 ${numberValue(summary.worktableApproveCandidateSuggestions)}건`
      : '',
    numberValue(summary.worktableApproveCardSuggestions) > 0
      ? `Web 후보 ${numberValue(summary.worktableApproveCardSuggestions)}건`
      : '',
    numberValue(summary.worktableNeedsReviewSuggestions) > 0
      ? `검토필요 ${numberValue(summary.worktableNeedsReviewSuggestions)}건`
      : '',
    numberValue(summary.worktableNeedsChangesSuggestions) > 0
      ? `수정필요 ${numberValue(summary.worktableNeedsChangesSuggestions)}건`
      : ''
  ].filter(Boolean);
  const summaryParts = [
    missingArtifacts > 0 ? `누락 증거 ${missingArtifacts}건` : '',
    `미입력 ${numberValue(summary.totalDecisionInputsMissing)}건`,
    `작업표 ${numberValue(summary.worktableRows)}건`,
    numberValue(summary.worktableSuggestionRows) > 0
      ? `추천 ${numberValue(summary.worktableSuggestionRows)}건`
      : '',
    numberValue(summary.worktableReviewSessionCount) > 0
      ? `검토세션 ${numberValue(summary.worktableReviewSessionCount)}건`
      : '',
    numberValue(summary.worktableReviewSessionHighRiskRows) > 0
      ? `고위험 ${numberValue(summary.worktableReviewSessionHighRiskRows)}건`
      : '',
    numberValue(summary.worktableReviewSessionPacketCount) > 0
      ? `검토패킷 ${numberValue(summary.worktableReviewSessionPacketCount)}건`
      : '',
    numberValue(summary.worktableReviewSessionPacketFiles) > 0
      ? `패킷파일 ${numberValue(summary.worktableReviewSessionPacketFiles)}개`
      : '',
    numberValue(summary.worktableReviewSessionProgressCompletedRows) > 0
      ? `세션완료 ${numberValue(summary.worktableReviewSessionProgressCompletedRows)}건`
      : '',
    numberValue(summary.worktableReviewSessionProgressPendingRows) > 0
      ? `세션대기 ${numberValue(summary.worktableReviewSessionProgressPendingRows)}건`
      : '',
    numberValue(summary.worktableReviewSessionProgressInvalidRows) > 0
      ? `세션오류 ${numberValue(summary.worktableReviewSessionProgressInvalidRows)}건`
      : '',
    numberValue(summary.worktableDryRunRoundtripPlannedUpdates) > 0
      ? `사전검증 ${numberValue(summary.worktableDryRunRoundtripPlannedUpdates)}건`
      : '',
    numberValue(summary.worktableDryRunRoundtripInvalidRows) > 0
      ? `사전오류 ${numberValue(summary.worktableDryRunRoundtripInvalidRows)}건`
      : '',
    numberValue(summary.worktableRecaptureSuggestions) > 0
      ? `재촬영 ${numberValue(summary.worktableRecaptureSuggestions)}건`
      : '',
    numberValue(summary.worktableApproveCandidateSuggestions) > 0
      ? `Vision 후보 ${numberValue(summary.worktableApproveCandidateSuggestions)}건`
      : '',
    numberValue(summary.worktableApproveCardSuggestions) > 0
      ? `Web 후보 ${numberValue(summary.worktableApproveCardSuggestions)}건`
      : '',
    numberValue(summary.worktablePlannedUpdates) > 0
      ? `반영계획 ${numberValue(summary.worktablePlannedUpdates)}건`
      : '',
    numberValue(summary.commonAgentApprovedPayloads) > 0
      ? `Agent 전달 ${numberValue(summary.commonAgentApprovedPayloads)}건`
      : ''
  ].filter(Boolean);

  return {
    title: 'HITL Pipeline Status',
    status,
    statusLabel: pipelineStatusLabelFor(status, stageCode),
    severity: pipelineSeverityFor(status, stageCode),
    stageText: compact(pipelineStatus.currentStage?.titleKo)
      || compact(pipelineStatus.currentStage?.code),
    summaryText: summaryParts.join(' · '),
    suggestionText: suggestionParts.length > 0
      ? `추천 분포: ${suggestionParts.join(' · ')}`
      : '',
    nextActionKo: compact(firstAction?.instructionKo)
      || compact(firstAction?.titleKo)
      || compact(pipelineStatus.recommendedAction),
    nextCommand: compact(firstAction?.commands?.[0]),
    nextCommands: Array.isArray(firstAction?.commands)
      ? firstAction.commands.map(compact).filter(Boolean)
      : [],
    stageTrailPreviews: (Array.isArray(pipelineStatus.stageTrail) ? pipelineStatus.stageTrail : [])
      .slice(0, 5)
      .map(item => `${compact(item?.titleKo) || compact(item?.code)} · ${compact(item?.status)}`),
    safetyBadges: [
      'Artifact-only',
      '자동 적용 금지',
      'Graph 승격 금지',
      'Reference 학습 금지',
      'Model 학습 금지'
    ]
  };
};

const summarizeOperationalHitlWorktableSuggestionDisplay = suggestion => {
  if (suggestion?.contractVersion !== 'operational-hitl-decision-worktable-suggestion/v1') {
    return null;
  }

  const summary = suggestion.summary || {};
  const rows = Array.isArray(suggestion.rows) ? suggestion.rows : [];
  const status = compact(suggestion.status);
  const riskCounts = new Map();
  rows.forEach(row => {
    const risk = compact(row?.recommendationRisk);
    if (!risk) return;
    riskCounts.set(risk, (riskCounts.get(risk) || 0) + 1);
  });
  const riskText = Array.from(riskCounts.entries())
    .map(([risk, count]) => `${risk} ${count}건`)
    .join(' · ');
  const summaryParts = [
    `추천 ${numberValue(summary.suggestionRows)}건`,
    `대기 ${numberValue(summary.pendingRows)}건`,
    numberValue(summary.recaptureSuggestions) > 0
      ? `재촬영 ${numberValue(summary.recaptureSuggestions)}건`
      : '',
    numberValue(summary.approveCandidateSuggestions) > 0
      ? `Vision 후보 ${numberValue(summary.approveCandidateSuggestions)}건`
      : '',
    numberValue(summary.approveCardSuggestions) > 0
      ? `Web 후보 ${numberValue(summary.approveCardSuggestions)}건`
      : '',
    numberValue(summary.needsReviewSuggestions) > 0
      ? `검토필요 ${numberValue(summary.needsReviewSuggestions)}건`
      : '',
    numberValue(summary.needsChangesSuggestions) > 0
      ? `수정필요 ${numberValue(summary.needsChangesSuggestions)}건`
      : ''
  ].filter(Boolean);

  return {
    title: 'HITL Worktable Suggestions',
    status,
    statusLabel: worktableSuggestionStatusLabelFor(status),
    severity: worktableSuggestionSeverityFor(status),
    summaryText: summaryParts.join(' · '),
    riskText: riskText ? `위험도: ${riskText}` : '',
    nextActionKo: compact(suggestion.recommendedAction)
      || '추천 초안을 사람이 검토한 뒤 원본 worktable CSV에 필요한 값만 옮겨 적으세요.',
    rowPreviews: rows.slice(0, 5).map(row => ({
      queueCode: compact(row?.queueCode),
      decisionId: compact(row?.decisionId),
      displayLabel: compact(row?.displayLabel),
      action: compact(row?.recommendedNewAction),
      risk: compact(row?.recommendationRisk),
      reasonKo: compact(row?.recommendationReasonKo)
    })),
    safetyBadges: [
      'Suggestion-only',
      'newAction 자동 입력 금지',
      '자동 적용 금지',
      'Graph 승격 금지',
      'Model 학습 금지'
    ]
  };
};

const summarizeOperationalHitlReviewSessionPlanDisplay = sessionPlan => {
  if (sessionPlan?.contractVersion !== 'operational-hitl-review-session-plan/v1') {
    return null;
  }

  const summary = sessionPlan.summary || {};
  const status = compact(sessionPlan.status);
  const summaryParts = [
    `전체 ${numberValue(summary.totalRows)}건`,
    `세션 ${numberValue(summary.sessionCount)}건`,
    numberValue(summary.highRiskRows) > 0 ? `고위험 ${numberValue(summary.highRiskRows)}건` : '',
    numberValue(summary.recaptureRows) > 0 ? `재촬영 ${numberValue(summary.recaptureRows)}건` : '',
    numberValue(summary.approveCandidateRows) > 0
      ? `Vision 후보 ${numberValue(summary.approveCandidateRows)}건`
      : '',
    numberValue(summary.approveCardRows) > 0
      ? `Web 후보 ${numberValue(summary.approveCardRows)}건`
      : '',
    numberValue(summary.needsReviewRows) > 0
      ? `needs_review ${numberValue(summary.needsReviewRows)}건`
      : '',
    numberValue(summary.needsChangesRows) > 0
      ? `needs_changes ${numberValue(summary.needsChangesRows)}건`
      : ''
  ].filter(Boolean);

  return {
    title: 'HITL Review Session Plan',
    status,
    statusLabel: reviewSessionPlanStatusLabelFor(status),
    severity: reviewSessionPlanSeverityFor(status),
    summaryText: summaryParts.join(' · '),
    nextActionKo: compact(sessionPlan.recommendedAction)
      || '세션별 검토 순서에 따라 사람이 추천값을 확인하세요.',
    sessionPreviews: (Array.isArray(sessionPlan.sessions) ? sessionPlan.sessions : [])
      .slice(0, 4)
      .map(session => ({
        code: compact(session?.code),
        titleKo: compact(session?.titleKo),
        priority: numberValue(session?.priority),
        rowCount: numberValue(session?.rowCount),
        highRiskRows: numberValue(session?.highRiskRows),
        guidanceKo: compact(session?.guidanceKo),
        firstRows: (Array.isArray(session?.rows) ? session.rows : []).slice(0, 2).map(row => ({
          queueCode: compact(row?.queueCode),
          decisionId: compact(row?.decisionId),
          displayLabel: compact(row?.displayLabel),
          action: compact(row?.recommendedNewAction),
          risk: compact(row?.recommendationRisk),
          copyableText: copyableTextFor(row?.copyableFields),
          manualText: manualTextFor(row?.manualConfirmationFields)
        }))
      })),
    safetyBadges: [
      'Session-plan only',
      'newAction 자동 입력 금지',
      '자동 적용 금지',
      'Graph 승격 금지',
      'Model 학습 금지'
    ]
  };
};

const summarizeOperationalHitlReviewSessionPacketDisplay = sessionPacket => {
  if (sessionPacket?.contractVersion !== 'operational-hitl-review-session-packet/v1') {
    return null;
  }

  const summary = sessionPacket.summary || {};
  const status = compact(sessionPacket.status);
  const summaryParts = [
    `전체 ${numberValue(summary.totalRows)}건`,
    `패킷 ${numberValue(summary.sessionPacketCount)}건`,
    numberValue(summary.highRiskRows) > 0 ? `고위험 ${numberValue(summary.highRiskRows)}건` : '',
    numberValue(summary.filesToWrite) > 0 ? `파일 ${numberValue(summary.filesToWrite)}개` : ''
  ].filter(Boolean);

  return {
    title: 'HITL Review Session Packet',
    status,
    statusLabel: reviewSessionPacketStatusLabelFor(status),
    severity: reviewSessionPacketSeverityFor(status),
    summaryText: summaryParts.join(' · '),
    packetDir: compact(sessionPacket.packetDir),
    nextActionKo: compact(sessionPacket.recommendedAction)
      || '세션별 CSV/Markdown을 검토한 뒤 원본 worktable CSV에 필요한 값만 옮겨 적으세요.',
    packetPreviews: (Array.isArray(sessionPacket.packets) ? sessionPacket.packets : [])
      .slice(0, 4)
      .map(packet => ({
        code: compact(packet?.code),
        titleKo: compact(packet?.titleKo),
        priority: numberValue(packet?.priority),
        rowCount: numberValue(packet?.rowCount),
        highRiskRows: numberValue(packet?.highRiskRows),
        csvFileName: compact(packet?.csvFileName),
        markdownFileName: compact(packet?.markdownFileName),
        csvPath: compact(packet?.csvPath),
        markdownPath: compact(packet?.markdownPath)
      })),
    safetyBadges: [
      'Packet-only',
      'newAction 자동 입력 금지',
      '자동 적용 금지',
      'Graph 승격 금지',
      'Model 학습 금지'
    ]
  };
};

const summarizeVisionOperationalLabelConflictWorkflowDisplay = worklist => {
  const workflow = labelConflictWorkflowFrom(worklist);
  if (!workflow) return null;

  const status = compact(workflow.status);
  const conflictCount = numberValue(workflow.packet?.conflicts);
  const templateCount = numberValue(workflow.template?.decisionsPrepared);
  const acceptedCount = numberValue(workflow.verification?.acceptedDecisions);
  const pendingCount = numberValue(workflow.verification?.pendingConflicts);
  const invalidDecisions = numberValue(workflow.verification?.invalidDecisions);
  const plannedUpdates = numberValue(workflow.apply?.plannedCaseUpdates);
  const appliedUpdates = numberValue(workflow.apply?.appliedCaseUpdates);
  const invalidTargets = numberValue(workflow.apply?.invalidTargets);
  const parts = [
    `충돌 ${conflictCount}건`,
    `템플릿 ${templateCount}건`,
    acceptedCount > 0 ? `검증 ${acceptedCount}건` : '',
    `미해결 ${pendingCount}건`,
    plannedUpdates > 0 ? `적용계획 ${plannedUpdates}건` : '',
    appliedUpdates > 0 ? `반영 ${appliedUpdates}건` : '',
    invalidDecisions > 0 ? `판정오류 ${invalidDecisions}건` : '',
    invalidTargets > 0 ? `대상오류 ${invalidTargets}건` : ''
  ].filter(Boolean);

  return {
    title: 'Label Conflict Workflow',
    status,
    statusLabel: labelConflictStatusLabelFor(status, invalidDecisions, invalidTargets),
    severity: labelConflictSeverityFor(status, invalidDecisions, invalidTargets),
    summaryText: parts.join(' · '),
    nextCommand: compact(workflow.nextCommand),
    nextCommands: Array.isArray(workflow.nextCommands)
      ? workflow.nextCommands.map(compact).filter(Boolean)
      : [compact(workflow.nextCommand)].filter(Boolean),
    nextActionKo: compact(workflow.nextActionKo),
    safetyBadges: [
      '자동 적용 금지',
      'Graph 승격 금지',
      'Reference 학습 금지'
    ]
  };
};

module.exports = {
  summarizeVisionOperationalHitlWorkflowDisplay,
  summarizeVisionOperationalLabelConflictWorkflowDisplay,
  summarizeOperationalHitlActionPackDisplay,
  summarizeOperationalHitlPipelineStatusDisplay,
  summarizeOperationalHitlWorktableSuggestionDisplay,
  summarizeOperationalHitlReviewSessionPlanDisplay,
  summarizeOperationalHitlReviewSessionPacketDisplay
};
