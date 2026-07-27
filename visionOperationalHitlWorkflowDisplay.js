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

const summarizeVisionOperationalHitlWorkflowDisplay = worklist => {
  const workflow = workflowFrom(worklist);
  if (!workflow) return null;

  const status = compact(workflow.status);
  const queueCount = numberValue(workflow.queue?.pendingHighConfidence);
  const templateCount = numberValue(workflow.template?.decisionsPrepared);
  const pendingCount = numberValue(workflow.verification?.pendingQueueItems);
  const invalidCount = numberValue(workflow.verification?.invalidDecisions);
  const acceptedCount = numberValue(workflow.verification?.acceptedDecisions);
  const parts = [
    `큐 ${queueCount}건`,
    `템플릿 ${templateCount}건`,
    acceptedCount > 0 ? `검증 ${acceptedCount}건` : '',
    `미판정 ${pendingCount}건`,
    invalidCount > 0 ? `오류 ${invalidCount}건` : ''
  ].filter(Boolean);

  return {
    title: 'HITL Workflow',
    status,
    statusLabel: statusLabelFor(status, invalidCount),
    severity: severityFor(status, invalidCount),
    summaryText: parts.join(' · '),
    nextCommand: compact(workflow.nextCommand),
    nextActionKo: compact(workflow.nextActionKo),
    safetyBadges: [
      '자동 적용 금지',
      'Graph 승격 금지',
      'Reference 학습 금지'
    ]
  };
};

module.exports = {
  summarizeVisionOperationalHitlWorkflowDisplay
};
