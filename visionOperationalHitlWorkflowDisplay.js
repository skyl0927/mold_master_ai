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
  summarizeVisionOperationalLabelConflictWorkflowDisplay
};
