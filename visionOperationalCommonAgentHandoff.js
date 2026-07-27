const {
  buildVisionOperationalBlockerWorklist
} = require('./visionOperationalBlockerWorklist');

const asArray = value => Array.isArray(value) ? value : [];

const compact = value => String(value || '').replace(/\s+/g, ' ').trim();

const unique = values => [...new Set(values.map(compact).filter(Boolean))];

const commonAgentActionFor = code => {
  if (code === 'resolve_label_conflicts') return 'resolve_hitl_label_conflict';
  if (code === 'close_hitl_reviews') return 'close_vision_hitl_review_queue';
  if (code === 'collect_approved_samples') return 'collect_approved_field_samples';
  if (code === 'repair_reference_store') return 'refresh_vision_reference_store';
  if (code === 'build_operational_release_report') return 'rebuild_operational_release_evidence';
  if (code === 'record_operator_approval') return 'record_operator_activation_review';
  if (code === 'run_readiness_audit') return 'run_mold_master_readiness_audit';
  return 'review_mold_master_operational_task';
};

const normalizeTask = task => ({
  code: task.code,
  priority: Number(task.priority) || 0,
  owner: compact(task.owner) || 'system_operator',
  titleKo: compact(task.titleKo) || task.code,
  descriptionKo: compact(task.descriptionKo),
  commonAgentAction: commonAgentActionFor(task.code),
  requiresHumanReview: task.requiresHumanReview !== false,
  autoApplyAllowed: false,
  sourceBlockers: asArray(task.sourceBlockers),
  dependsOn: asArray(task.dependsOn),
  commands: asArray(task.commands),
  sampleRefs: asArray(task.sampleRefs),
  ...(task.count !== undefined ? { count: Number(task.count) || 0 } : {}),
  ...(task.current !== undefined ? { current: Number(task.current) || 0 } : {}),
  ...(task.required !== undefined ? { required: Number(task.required) || 0 } : {}),
  ...(task.missing !== undefined ? { missing: Number(task.missing) || 0 } : {})
});

const statusFor = worklist => {
  const taskCount = asArray(worklist.tasks).length;
  return worklist.readyForManualActivation === true && taskCount === 0
    ? 'ready_for_operator_import'
    : 'blocked';
};

const recommendedActionFor = (status, worklist, tasks) => {
  if (status === 'ready_for_operator_import') {
    return '수동 승인된 운영 후보입니다. Common Agent/Antigravity에서 artifact를 검토한 뒤 운영자가 직접 import 여부를 결정하세요.';
  }
  const sourceAction = compact(worklist.recommendedAction);
  if (sourceAction) return sourceAction;
  const firstTask = tasks[0];
  return firstTask
    ? `${firstTask.titleKo} 작업부터 닫은 뒤 readiness audit과 handoff packet을 다시 생성하세요.`
    : 'readiness audit을 먼저 실행하고 handoff packet을 다시 생성하세요.';
};

const buildVisionOperationalCommonAgentHandoff = ({
  generatedAt = new Date().toISOString(),
  readinessAudit = null,
  worklist = null,
  sourceArtifacts = {}
} = {}) => {
  const resolvedWorklist = worklist || buildVisionOperationalBlockerWorklist({
    generatedAt,
    readinessAudit
  });
  const tasks = asArray(resolvedWorklist.tasks).map(normalizeTask);
  const status = statusFor(resolvedWorklist);

  return {
    schemaVersion: 1,
    contractVersion: 'vision-operational-common-agent-handoff-packet/v1',
    generatedAt,
    targetSystem: 'common_agent',
    sourceSystem: 'mold-master-ai',
    deliveryMode: 'artifact_only',
    status,
    manualImportAllowed: status === 'ready_for_operator_import',
    serviceWritesPerformed: false,
    policy: {
      automaticServiceWritesAllowed: false,
      allowGraphPromotion: false,
      allowModelActivation: false,
      requiresHumanReview: true,
      graphPromotionMode: 'disabled_until_common_agent_human_review',
      modelActivationMode: 'disabled_until_operator_activation'
    },
    summary: {
      readinessAuditStatus: readinessAudit?.status || resolvedWorklist.sourceAuditStatus || null,
      worklistStatus: resolvedWorklist.status,
      totalTasks: tasks.length,
      blockerTasks: Number(resolvedWorklist.summary?.blockerTasks) || 0,
      operatorTasks: Number(resolvedWorklist.summary?.operatorTasks) || 0,
      primaryTaskCode: tasks[0]?.code || null,
      readyForManualActivation: resolvedWorklist.readyForManualActivation === true
    },
    tasks,
    safeNextCommands: unique(tasks.flatMap(task => task.commands)),
    commonAgentReviewRequest: {
      reviewType: 'vision_operational_handoff',
      requestedAction: status === 'ready_for_operator_import'
        ? 'operator_import_review'
        : 'close_mold_master_blockers',
      requiresHumanReview: true,
      allowGraphPromotion: false,
      allowModelActivation: false,
      itemCount: tasks.length
    },
    sources: {
      readinessAudit: sourceArtifacts.readinessAudit || null,
      blockerWorklist: sourceArtifacts.blockerWorklist || null
    },
    recommendedAction: recommendedActionFor(status, resolvedWorklist, tasks)
  };
};

module.exports = {
  buildVisionOperationalCommonAgentHandoff
};
