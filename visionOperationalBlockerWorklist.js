const asArray = value => Array.isArray(value) ? value : [];

const compact = value => String(value || '').replace(/\s+/g, ' ').trim();

const unique = values => [...new Set(values.map(compact).filter(Boolean))];

const blockerByCode = (blockers, code) => blockers.find(blocker => blocker.code === code);

const blockersByCodes = (blockers, codes) =>
  blockers.filter(blocker => codes.includes(blocker.code));

const conflictSampleRefs = conflicts => unique(
  asArray(conflicts).flatMap(conflict => asArray(conflict.caseIds))
);

const blockerTask = ({
  code,
  priority,
  owner,
  titleKo,
  descriptionKo,
  sourceBlockers,
  commands = [],
  dependsOn = [],
  count,
  current,
  required,
  missing,
  sampleRefs = [],
  workflowStatus = null
}) => ({
  code,
  priority,
  owner,
  titleKo,
  descriptionKo,
  requiresHumanReview: true,
  autoApplyAllowed: false,
  sourceBlockers: sourceBlockers.map(blocker => ({
    source: blocker.source || 'unknown',
    code: blocker.code,
    detail: blocker.detail || null
  })),
  commands,
  dependsOn,
  ...(count !== undefined ? { count } : {}),
  ...(current !== undefined ? { current } : {}),
  ...(required !== undefined ? { required } : {}),
  ...(missing !== undefined ? { missing } : {}),
  ...(sampleRefs.length ? { sampleRefs } : {}),
  ...(workflowStatus ? { workflowStatus } : {})
});

const buildMissingAuditWorklist = generatedAt => ({
  schemaVersion: 1,
  contractVersion: 'vision-operational-blocker-worklist/v1',
  generatedAt,
  sourceAuditGeneratedAt: null,
  status: 'missing_audit',
  readyForManualActivation: false,
  autoChangesAllowed: false,
  serviceWritesPerformed: false,
  localArtifactsWritten: true,
  summary: {
    totalTasks: 1,
    blockerTasks: 1,
    operatorTasks: 0,
    readyForManualActivation: false
  },
  tasks: [{
    code: 'run_readiness_audit',
    priority: 100,
    owner: 'system_operator',
    titleKo: '운영 readiness audit 실행',
    descriptionKo: '최종 운영 차단 원인을 확인하려면 readiness audit artifact를 먼저 생성해야 합니다.',
    requiresHumanReview: false,
    autoApplyAllowed: false,
    sourceBlockers: [{ source: 'audit', code: 'readiness_audit_missing', detail: null }],
    commands: ['npm run vision:operational:readiness'],
    dependsOn: []
  }],
  commonAgentHandoff: {
    contractVersion: 'vision-operational-common-agent-handoff/v1',
    policy: {
      allowGraphPromotion: false,
      allowModelActivation: false,
      requiresHumanReview: true
    },
    items: []
  },
  recommendedAction: '먼저 npm run vision:operational:readiness를 실행해 최신 readiness audit을 생성하세요.'
});

const hitlWorkflowCommands = [
  'npm run vision:hitl:pending-packet',
  'npm run vision:hitl:decision-template',
  'npm run vision:hitl:verify-decisions -- --decisions <filled-common-agent-hitl-decisions.json>',
  'npm run vision:hitl:authorization-bridge -- --decision-verification <vision-pending-hitl-decision-verification-report.json>',
  'npm run vision:hitl:non-approval-worklist -- --decision-verification <vision-pending-hitl-decision-verification-report.json>',
  'npm run vision:hitl:approve -- --authorization <vision-hitl-authorization-from-decisions.json>',
  'npm run migration:verify-post-hitl'
];

const labelConflictWorkflowCommands = [
  'npm run vision:label-conflicts:packet',
  'npm run vision:label-conflicts:decision-template',
  'npm run vision:label-conflicts:review-guide',
  'npm run vision:label-conflicts:verify-decisions -- --decisions <filled-vision-label-conflict-decisions.json>',
  'npm run vision:label-conflicts:apply -- --verification <vision-approved-label-conflict-decision-verification-report.json>',
  'npm run vision:label-conflicts:apply -- --verification <vision-approved-label-conflict-decision-verification-report.json> --apply',
  'npm run migration:verify-post-hitl'
];

const hitlReviewDescription = workflow =>
  workflow?.nextActionKo
    ? `고신뢰 Vision/HITL 후보를 승인, 수정, 반려, 재촬영 중 하나로 닫아야 합니다. 현재 단계: ${workflow.nextActionKo}`
    : '고신뢰 Vision/HITL 후보를 승인, 수정, 반려, 재촬영 중 하나로 닫아야 합니다.';

const labelConflictDescription = workflow =>
  workflow?.nextActionKo
    ? `동일 이미지 또는 동일 해시의 불량 라벨이 충돌합니다. 현재 단계: ${workflow.nextActionKo}`
    : '동일 이미지 또는 동일 해시의 불량 라벨이 충돌합니다. HITL에서 정답 라벨을 확정하기 전에는 reference learning과 Graph 승격을 막습니다.';

const actionTasksFor = (blockers, readinessAudit = {}) => {
  const tasks = [];
  const conflict = blockerByCode(blockers, 'approved_label_conflicts');
  if (conflict) {
    const workflow = readinessAudit?.gates?.labelConflictWorkflow || null;
    tasks.push(blockerTask({
      code: 'resolve_label_conflicts',
      priority: 100,
      owner: 'quality_hitl',
      titleKo: '승인 이미지 라벨 충돌 해결',
      descriptionKo: labelConflictDescription(workflow),
      sourceBlockers: [conflict],
      commands: labelConflictWorkflowCommands,
      count: Number(conflict.count) || asArray(conflict.conflicts).length,
      sampleRefs: conflictSampleRefs(conflict.conflicts),
      workflowStatus: workflow
    }));
  }

  const humanReview = blockerByCode(blockers, 'human_review_required');
  if (humanReview) {
    const workflow = readinessAudit?.gates?.hitlWorkflow || null;
    tasks.push(blockerTask({
      code: 'close_hitl_reviews',
      priority: 90,
      owner: 'quality_hitl',
      titleKo: '미해결 HITL 검토 종료',
      descriptionKo: hitlReviewDescription(workflow),
      sourceBlockers: [humanReview],
      count: Number(humanReview.count) || 0,
      commands: hitlWorkflowCommands,
      dependsOn: conflict ? ['resolve_label_conflicts'] : [],
      workflowStatus: workflow
    }));
  }

  const sampleCount = blockerByCode(blockers, 'approved_sample_count');
  if (sampleCount) {
    tasks.push(blockerTask({
      code: 'collect_approved_samples',
      priority: 80,
      owner: 'quality_capture',
      titleKo: '승인 다중 시점 샘플 추가 확보',
      descriptionKo: '핵심 결함군별 승인 샘플 수가 부족합니다. 촬영 프로토콜을 만족하는 현장 이미지를 확보하고 HITL 승인까지 완료해야 합니다.',
      sourceBlockers: [sampleCount],
      current: Number(sampleCount.current) || 0,
      required: Number(sampleCount.required) || 0,
      missing: Number(sampleCount.missing) || 0,
      dependsOn: conflict ? ['resolve_label_conflicts'] : []
    }));
  }

  const referenceBlockers = blockersByCodes(blockers, [
    'reference_gate_missing',
    'reference_gate_not_ready',
    'reference_store_missing',
    'reference_store_invalid',
    'reference_refresh_failed',
    'reference_benchmark_failed',
    'reference_api_missing',
    'reference_refresh_api_missing',
    'prototype_embedding_model'
  ]);
  if (referenceBlockers.length > 0) {
    tasks.push(blockerTask({
      code: 'repair_reference_store',
      priority: 70,
      owner: 'common_agent_operator',
      titleKo: 'Common Agent Vision reference store 복구',
      descriptionKo: '승인 데이터 export와 production embedding reference store를 생성한 뒤 reference benchmark gate를 다시 실행합니다.',
      sourceBlockers: referenceBlockers,
      commands: [
        'npm run vision:reference:backfill-plan',
        'npm run vision:reference:gate'
      ],
      dependsOn: [
        ...(conflict ? ['resolve_label_conflicts'] : []),
        ...(humanReview ? ['close_hitl_reviews'] : []),
        ...(sampleCount ? ['collect_approved_samples'] : [])
      ]
    }));
  }

  const releaseBlockers = blockers.filter(blocker =>
    blocker.source === 'release'
    || [
      'release_report_missing',
      'release_evidence_alignment_failed',
      'release_evidence_incomplete',
      'candidate_release_not_allowed',
      'operator_decision_mismatch'
    ].includes(blocker.code)
  );
  if (releaseBlockers.length > 0) {
    tasks.push(blockerTask({
      code: 'build_operational_release_report',
      priority: 50,
      owner: 'release_owner',
      titleKo: '운영 릴리스 보고서와 증거 정합성 재생성',
      descriptionKo: 'baseline/candidate benchmark, Common Agent export, Graph snapshot URI를 결합해 release report와 evidence alignment를 다시 닫습니다.',
      sourceBlockers: releaseBlockers,
      commands: [
        'npm run eval:vision:release',
        'npm run vision:release:evidence:merge',
        'npm run vision:operational:readiness'
      ],
      dependsOn: [
        ...(referenceBlockers.length ? ['repair_reference_store'] : []),
        ...(sampleCount ? ['collect_approved_samples'] : []),
        ...(humanReview ? ['close_hitl_reviews'] : [])
      ]
    }));
  }

  return tasks.sort((left, right) => right.priority - left.priority || left.code.localeCompare(right.code));
};

const operatorTasksFor = readinessAudit => {
  if (!asArray(readinessAudit.pendingActions).includes('operator_approval_required')) return [];
  return [blockerTask({
    code: 'record_operator_approval',
    priority: 100,
    owner: 'quality_lead',
    titleKo: '운영 담당자 승인 기록',
    descriptionKo: '모든 기계 게이트가 통과했습니다. Settings의 비전 릴리스 게이트에서 담당자와 코멘트를 입력해 수동 활성화 승인 기록을 남깁니다.',
    sourceBlockers: [{ source: 'operator', code: 'operator_approval_required' }]
  })];
};

const handoffFor = tasks => ({
  contractVersion: 'vision-operational-common-agent-handoff/v1',
  policy: {
    allowGraphPromotion: false,
    allowModelActivation: false,
    requiresHumanReview: true
  },
  items: tasks.map(task => ({
    taskCode: task.code,
    owner: task.owner,
    priority: task.priority,
    titleKo: task.titleKo,
    sourceBlockers: task.sourceBlockers,
    sampleRefs: task.sampleRefs || [],
    ...(task.workflowStatus ? { workflowStatus: task.workflowStatus } : {})
  }))
});

const statusFor = (readinessAudit, tasks) => {
  if (readinessAudit?.status === 'approved_for_manual_activation') return 'ready';
  if (readinessAudit?.status === 'ready_for_operator_approval') return 'waiting_for_operator';
  return tasks.length > 0 ? 'action_required' : 'action_required';
};

const recommendedActionFor = (status, tasks) => {
  if (status === 'ready') {
    return '운영 담당자 승인까지 완료되었습니다. 자동 활성화는 금지된 상태로 후보 Vision 버전을 수동 활성화할 수 있습니다.';
  }
  if (status === 'waiting_for_operator') {
    return 'Settings의 비전 릴리스 게이트에서 운영 담당자 확인을 기록하세요.';
  }
  const first = tasks[0];
  return first
    ? `${first.titleKo} 작업부터 처리한 뒤 readiness audit을 다시 실행하세요.`
    : '차단 원인을 확인한 뒤 readiness audit을 다시 실행하세요.';
};

const buildVisionOperationalBlockerWorklist = ({
  generatedAt = new Date().toISOString(),
  readinessAudit = null
} = {}) => {
  if (!readinessAudit || readinessAudit.contractVersion !== 'vision-operational-readiness-audit/v1') {
    return buildMissingAuditWorklist(generatedAt);
  }

  const blockerTasks = actionTasksFor(asArray(readinessAudit.blockers), readinessAudit);
  const operatorTasks = operatorTasksFor(readinessAudit);
  const tasks = readinessAudit.status === 'approved_for_manual_activation'
    ? []
    : [...blockerTasks, ...operatorTasks]
      .sort((left, right) => right.priority - left.priority || left.code.localeCompare(right.code));
  const status = statusFor(readinessAudit, tasks);

  return {
    schemaVersion: 1,
    contractVersion: 'vision-operational-blocker-worklist/v1',
    generatedAt,
    sourceAuditGeneratedAt: readinessAudit.generatedAt || null,
    sourceAuditStatus: readinessAudit.status || null,
    status,
    readyForManualActivation: status === 'ready',
    autoChangesAllowed: false,
    serviceWritesPerformed: false,
    localArtifactsWritten: true,
    summary: {
      totalTasks: tasks.length,
      blockerTasks: blockerTasks.length,
      operatorTasks: operatorTasks.length,
      readyForManualActivation: status === 'ready'
    },
    tasks,
    commonAgentHandoff: handoffFor(tasks),
    recommendedAction: recommendedActionFor(status, tasks)
  };
};

module.exports = {
  buildVisionOperationalBlockerWorklist
};
