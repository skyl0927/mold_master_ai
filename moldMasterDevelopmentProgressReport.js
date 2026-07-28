const asArray = value => Array.isArray(value) ? value : [];

const compact = value => String(value || '').replace(/\s+/g, ' ').trim();

const unique = values => [...new Set(values.map(compact).filter(Boolean))];

const isContract = (artifact, contractVersion) =>
  artifact?.contractVersion === contractVersion;

const numberFrom = (...values) => {
  const value = values.find(item => Number.isFinite(Number(item)));
  return value === undefined ? 0 : Number(value);
};

const taskByCode = (worklist, code) =>
  asArray(worklist?.tasks).find(task => task?.code === code) || null;

const blockerByCode = (readiness, code) =>
  asArray(readiness?.blockers).find(blocker => blocker?.code === code) || null;

const hasBlockerFrom = (readiness, source) =>
  asArray(readiness?.blockers).some(blocker => blocker?.source === source);

const isVisionAccuracyPlan = artifact =>
  isContract(artifact, 'vision-accuracy-improvement-plan/v1');

const isOperationalHitlIntakeStatus = artifact =>
  isContract(artifact, 'operational-hitl-decision-intake-status/v1');

const isVisionCaptureWorkOrderPlan = artifact =>
  isContract(artifact, 'vision-capture-work-order-plan/v1');

const missingArtifactsFor = ({
  visionReadiness,
  visionWorklist,
  commonAgentHandoff,
  webKnowledgeReadiness
}) => [
  !isContract(visionReadiness, 'vision-operational-readiness-audit/v1')
    ? 'visionReadiness'
    : null,
  !isContract(visionWorklist, 'vision-operational-blocker-worklist/v1')
    ? 'visionWorklist'
    : null,
  !isContract(commonAgentHandoff, 'vision-operational-common-agent-handoff-packet/v1')
    ? 'commonAgentHandoff'
    : null,
  !isContract(webKnowledgeReadiness, 'web-knowledge-operational-readiness/v1')
    ? 'webKnowledgeReadiness'
    : null
].filter(Boolean);

const taskNextActions = task => ({
  code: compact(task?.code),
  owner: compact(task?.owner) || 'system_operator',
  priority: Number(task?.priority) || 0,
  titleKo: compact(task?.titleKo) || compact(task?.code),
  commands: asArray(task?.commands),
  requiresHumanReview: task?.requiresHumanReview !== false,
  autoApplyAllowed: false
});

const stageCard = ({
  id,
  titleKo,
  status,
  softwareImplemented,
  feedbackKo,
  owner,
  blockerCodes = [],
  commands = [],
  metrics = {}
}) => ({
  id,
  titleKo,
  status,
  softwareImplemented: softwareImplemented === true,
  owner,
  blockerCodes: unique(blockerCodes),
  commands: unique(commands),
  metrics,
  feedbackKo
});

const taskStage = ({
  id,
  titleKo,
  owner,
  task,
  doneFeedbackKo,
  actionFeedbackKo,
  metrics = {}
}) => stageCard({
  id,
  titleKo,
  status: task ? 'action_required' : 'completed',
  softwareImplemented: true,
  owner,
  blockerCodes: asArray(task?.sourceBlockers).map(blocker => blocker?.code),
  commands: asArray(task?.commands),
  metrics,
  feedbackKo: task ? actionFeedbackKo : doneFeedbackKo
});

const visionAccuracyStageFor = visionAccuracyPlan => {
  if (!isVisionAccuracyPlan(visionAccuracyPlan)) return null;

  const summary = visionAccuracyPlan.summary || {};
  const firstTrack = asArray(visionAccuracyPlan.improvementTracks)[0] || null;
  const ready = visionAccuracyPlan.status === 'ready_for_shadow_validation';
  const top1 = numberFrom(summary.top1Accuracy);
  const top3 = numberFrom(summary.top3Accuracy);
  const captureReady = numberFrom(summary.captureProtocolReadyRate);

  return stageCard({
    id: 'vision_accuracy_improvement',
    titleKo: 'Vision 정확도 개선 계획',
    status: ready ? 'completed' : 'action_required',
    softwareImplemented: true,
    owner: compact(firstTrack?.owner) || 'vision_engineer',
    blockerCodes: ready ? [] : asArray(summary.failedGateChecks),
    commands: ready
      ? ['npm run eval:vision:release']
      : asArray(firstTrack?.commands),
    metrics: {
      top1Accuracy: top1,
      top3Accuracy: top3,
      captureProtocolReadyRate: captureReady,
      referenceRefreshAllowedNow: summary.referenceRefreshAllowedNow === true,
      firstTrackCode: compact(firstTrack?.code) || null,
      coreMissingViews: asArray(summary.coreMissingViews),
      undercoveredDefectClasses: asArray(summary.undercoveredDefectClasses),
      zeroAccuracyDefectClasses: asArray(summary.zeroAccuracyDefectClasses)
    },
    feedbackKo: ready
      ? 'Vision 정확도 개선 gate는 shadow validation 단계로 넘길 수 있습니다.'
      : `Vision benchmark 기준 Top-1 ${top1}%, Top-3 ${top3}%, 촬영 프로토콜 준비율 ${captureReady}%입니다. ${firstTrack?.titleKo || '개선 계획'} 작업이 우선입니다.`
  });
};

const operationalHitlIntakeStageFor = operationalHitlIntakeStatus => {
  if (!isOperationalHitlIntakeStatus(operationalHitlIntakeStatus)) return null;

  const summary = operationalHitlIntakeStatus.summary || {};
  const queues = asArray(operationalHitlIntakeStatus.queues);
  const firstQueue = queues.find(queue => queue?.code === summary.firstQueueCode)
    || queues.find(queue => numberFrom(queue?.pending) > 0)
    || queues[0]
    || null;
  const totalMissing = numberFrom(summary.totalDecisionInputsMissing);
  const ready = operationalHitlIntakeStatus.status === 'clear';
  const missingEvidence = operationalHitlIntakeStatus.status === 'missing_evidence';

  return stageCard({
    id: 'operational_hitl_decision_intake',
    titleKo: 'HITL decision intake',
    status: ready ? 'completed' : missingEvidence ? 'missing_evidence' : 'action_required',
    softwareImplemented: true,
    owner: compact(firstQueue?.owner) || 'quality_hitl',
    blockerCodes: ready ? [] : ['hitl_decision_inputs_missing'],
    commands: ready ? ['npm run operational:progress'] : asArray(firstQueue?.commands),
    metrics: {
      totalDecisionInputsMissing: totalMissing,
      firstQueueCode: compact(summary.firstQueueCode) || null,
      labelConflictPending: numberFrom(summary.labelConflictPending),
      visionHitlPending: numberFrom(summary.visionHitlPending),
      webHitlMissing: numberFrom(summary.webHitlMissing),
      staleDecisionEvidenceCount: numberFrom(summary.staleDecisionEvidenceCount),
      queueBreakdown: queues.map(queue => [
        compact(queue?.code),
        numberFrom(queue?.pending)
      ])
    },
    feedbackKo: ready
      ? 'HITL decision intake queue가 닫혔습니다.'
      : `HITL decision 입력 ${totalMissing}건이 남아 있습니다. 1순위는 ${firstQueue?.titleKo || firstQueue?.code || 'HITL intake 증거 재생성'}입니다.`
  });
};

const visionCaptureWorkOrderStageFor = visionCaptureWorkOrderPlan => {
  if (!isVisionCaptureWorkOrderPlan(visionCaptureWorkOrderPlan)) return null;

  const summary = visionCaptureWorkOrderPlan.summary || {};
  const firstOrder = asArray(visionCaptureWorkOrderPlan.workOrders)[0] || null;
  const ready = visionCaptureWorkOrderPlan.status === 'ready_for_shadow_validation';
  const totalWorkOrders = numberFrom(summary.totalWorkOrders);
  const missingApprovedSamples = numberFrom(summary.totalMissingApprovedSamples);
  const recaptureSamples = numberFrom(summary.totalRecaptureSamples);
  const topPriorityDefectClass = compact(summary.topPriorityDefectClass);

  return stageCard({
    id: 'vision_capture_work_orders',
    titleKo: 'Vision 촬영 work order',
    status: ready ? 'completed' : totalWorkOrders > 0 ? 'action_required' : compact(visionCaptureWorkOrderPlan.status),
    softwareImplemented: true,
    owner: 'quality_capture',
    blockerCodes: ready ? [] : ['vision_capture_work_orders_required'],
    commands: ready
      ? ['npm run eval:vision:release']
      : [
        'npm run vision:capture:work-orders',
        'npm run eval:vision:approved',
        'npm run vision:accuracy:improvement-plan'
      ],
    metrics: {
      status: compact(visionCaptureWorkOrderPlan.status),
      totalWorkOrders,
      missingApprovedSamples,
      recaptureSamples,
      topPriorityDefectClass,
      coreMissingViews: asArray(summary.coreMissingViews),
      firstOrder: firstOrder
        ? {
          defectClass: compact(firstOrder.defectClass),
          actionType: compact(firstOrder.actionType),
          priority: numberFrom(firstOrder.priority),
          missingApprovedSamples: numberFrom(firstOrder.missingApprovedSamples),
          recaptureSampleCount: asArray(firstOrder.recaptureSampleIds).length,
          requiredViews: asArray(firstOrder.requiredViews).map(compact).filter(Boolean)
        }
        : null
    },
    feedbackKo: ready
      ? 'Vision 촬영 work order gate가 닫혀 shadow validation으로 진행할 수 있습니다.'
      : `Vision 촬영 work order ${totalWorkOrders}건이 필요합니다. 우선 결함군은 ${topPriorityDefectClass || '미정'}이며 신규 ${missingApprovedSamples}건, 재촬영 ${recaptureSamples}건이 남아 있습니다.`
  });
};

const webStageFor = webKnowledgeReadiness => {
  if (!isContract(webKnowledgeReadiness, 'web-knowledge-operational-readiness/v1')) {
    return stageCard({
      id: 'web_case_knowledge',
      titleKo: '웹 Case 지식 수집/HITL',
      status: 'missing_evidence',
      softwareImplemented: false,
      owner: 'knowledge_owner',
      feedbackKo: 'Web Knowledge readiness artifact가 없어 수집/HITL 진행 상태를 판단할 수 없습니다.'
    });
  }

  const summary = webKnowledgeReadiness.summary || {};
  const ready = webKnowledgeReadiness.readyForGraphRoundtrip === true
    && webKnowledgeReadiness.status === 'ready_for_graph_roundtrip';
  const hitlMissing = numberFrom(summary.hitlApprovalsMissing);
  const centralMissing = numberFrom(summary.centralApprovalsMissing);
  const status = ready
    ? 'completed'
    : webKnowledgeReadiness.status === 'awaiting_hitl_review'
      || webKnowledgeReadiness.status === 'awaiting_common_agent_approval'
      ? 'awaiting_human_review'
      : 'action_required';

  return stageCard({
    id: 'web_case_knowledge',
    titleKo: '웹 Case 지식 수집/HITL',
    status,
    softwareImplemented: true,
    owner: 'knowledge_owner',
    blockerCodes: asArray(webKnowledgeReadiness.blockers).map(blocker => blocker?.code),
    commands: ready ? [] : [
      'npm run knowledge:web:readiness',
      'npm run knowledge:web:hitl:decision-template',
      'npm run knowledge:web:hitl:review-guide',
      'npm run knowledge:web:hitl:verify-decisions -- --decisions <filled-web-knowledge-hitl-decisions.json>',
      'npm run knowledge:web:hitl:apply -- --decisions <verified-web-knowledge-hitl-decisions.json> --apply'
    ],
    metrics: {
      cardCount: numberFrom(summary.cardCount),
      targetCardCount: numberFrom(summary.targetCardCount),
      commonAgentValidationPassed: numberFrom(summary.commonAgentValidationPassed),
      hitlApprovalsMissing: hitlMissing,
      centralApprovalsMissing: centralMissing
    },
    feedbackKo: ready
      ? '웹 Case 지식은 Graph 왕복 검증 단계로 넘길 수 있습니다.'
      : `웹 Case 지식은 수집/비저장 검증은 진행됐지만 HITL 승인 ${hitlMissing}건, 중앙 승인 ${centralMissing}건이 남아 있습니다.`
  });
};

const stageCardsFor = ({
  visionReadiness,
  visionWorklist,
  commonAgentHandoff,
  webKnowledgeReadiness,
  visionAccuracyPlan,
  operationalHitlIntakeStatus,
  visionCaptureWorkOrderPlan
}) => {
  const labelConflictTask = taskByCode(visionWorklist, 'resolve_label_conflicts');
  const closeHitlTask = taskByCode(visionWorklist, 'close_hitl_reviews');
  const sampleTask = taskByCode(visionWorklist, 'collect_approved_samples');
  const referenceTask = taskByCode(visionWorklist, 'repair_reference_store');
  const releaseTask = taskByCode(visionWorklist, 'build_operational_release_report');
  const handoffValid = isContract(
    commonAgentHandoff,
    'vision-operational-common-agent-handoff-packet/v1'
  );
  const readinessValid = isContract(
    visionReadiness,
    'vision-operational-readiness-audit/v1'
  );
  const labelConflictBlocker = blockerByCode(visionReadiness, 'approved_label_conflicts');
  const humanReviewBlocker = blockerByCode(visionReadiness, 'human_review_required');

  return [
    stageCard({
      id: 'vision_safety_contract',
      titleKo: 'Vision 안전 계약/Graph 차단',
      status: readinessValid
        ? asArray(visionReadiness?.blockers).length === 0 ? 'completed' : 'implemented'
        : 'missing_evidence',
      softwareImplemented: readinessValid,
      owner: 'mold_master_ai',
      blockerCodes: hasBlockerFrom(visionReadiness, 'post_hitl') ? ['post_hitl_blockers'] : [],
      metrics: {
        autoActivationAllowed: visionReadiness?.autoActivationAllowed === true,
        readyForCandidateActivation: visionReadiness?.readyForCandidateActivation === true
      },
      feedbackKo: readinessValid
        ? 'Vision 분석은 안전 게이트와 Graph 승격 차단 정책이 동작 중입니다.'
        : 'Vision readiness artifact가 없어 안전 계약 상태를 판단할 수 없습니다.'
    }),
    stageCard({
      id: 'common_agent_handoff',
      titleKo: 'Common Agent 운영 handoff',
      status: !handoffValid
        ? 'missing_evidence'
        : commonAgentHandoff.status === 'ready_for_operator_import' ? 'completed' : 'implemented',
      softwareImplemented: handoffValid,
      owner: 'common_agent_operator',
      blockerCodes: commonAgentHandoff?.status === 'blocked' ? ['handoff_blocked'] : [],
      metrics: {
        manualImportAllowed: commonAgentHandoff?.manualImportAllowed === true,
        totalTasks: numberFrom(commonAgentHandoff?.summary?.totalTasks)
      },
      feedbackKo: handoffValid
        ? 'Common Agent로 넘길 artifact-only handoff 계약이 준비되어 있습니다.'
        : 'Common Agent handoff artifact가 없어 연동 진행 상태를 판단할 수 없습니다.'
    }),
    taskStage({
      id: 'vision_label_conflict_hitl',
      titleKo: '승인 라벨 충돌 HITL',
      owner: 'quality_hitl',
      task: labelConflictTask,
      metrics: {
        conflictCount: numberFrom(labelConflictBlocker?.count)
      },
      actionFeedbackKo: `승인 라벨 충돌 ${numberFrom(labelConflictBlocker?.count)}건을 사람이 정답 라벨/보류/반려/재촬영으로 닫아야 합니다.`,
      doneFeedbackKo: '승인 라벨 충돌 blocker는 닫힌 상태입니다.'
    }),
    taskStage({
      id: 'vision_pending_hitl',
      titleKo: '미해결 Vision HITL',
      owner: 'quality_hitl',
      task: closeHitlTask,
      metrics: {
        pendingReviews: numberFrom(
          humanReviewBlocker?.count,
          visionReadiness?.gates?.hitlWorkflow?.verification?.pendingQueueItems,
          visionReadiness?.gates?.hitlWorkflow?.queue?.pendingHighConfidence
        )
      },
      actionFeedbackKo: `미해결 Vision HITL ${numberFrom(humanReviewBlocker?.count)}건을 승인/보류/반려/재촬영으로 닫아야 합니다.`,
      doneFeedbackKo: '미해결 Vision HITL queue는 닫힌 상태입니다.'
    }),
    taskStage({
      id: 'approved_sample_coverage',
      titleKo: '승인 샘플 커버리지',
      owner: 'quality_capture',
      task: sampleTask,
      metrics: {
        current: numberFrom(sampleTask?.current),
        required: numberFrom(sampleTask?.required),
        missing: numberFrom(sampleTask?.missing)
      },
      actionFeedbackKo: `승인 샘플은 ${numberFrom(sampleTask?.current)}/${numberFrom(sampleTask?.required)}이며 ${numberFrom(sampleTask?.missing)}건이 부족합니다.`,
      doneFeedbackKo: '승인 샘플 수량 gate는 충족된 상태입니다.'
    }),
    taskStage({
      id: 'vision_reference_store',
      titleKo: 'Vision reference store',
      owner: 'common_agent_operator',
      task: referenceTask,
      actionFeedbackKo: 'Common Agent Vision reference store와 benchmark gate를 복구해야 Graph 기반 자동 후보 확정이 가능합니다.',
      doneFeedbackKo: 'Vision reference store gate는 통과 상태입니다.'
    }),
    visionAccuracyStageFor(visionAccuracyPlan),
    visionCaptureWorkOrderStageFor(visionCaptureWorkOrderPlan),
    operationalHitlIntakeStageFor(operationalHitlIntakeStatus),
    webStageFor(webKnowledgeReadiness),
    taskStage({
      id: 'release_evidence',
      titleKo: '운영 릴리스 증거/승인',
      owner: 'release_owner',
      task: releaseTask,
      actionFeedbackKo: '운영 릴리스 보고서와 증거 정합성 artifact가 아직 필요합니다.',
      doneFeedbackKo: '운영 릴리스 증거 gate는 닫힌 상태입니다.'
    })
  ].filter(Boolean);
};

const progressFor = stageCards => {
  const total = stageCards.length || 1;
  const softwareImplemented = stageCards.filter(stage => stage.softwareImplemented).length;
  const operationalComplete = stageCards.filter(stage =>
    ['completed', 'ready'].includes(stage.status)
  ).length;
  return {
    software: {
      implementedStages: softwareImplemented,
      totalStages: stageCards.length,
      percent: Math.round((softwareImplemented / total) * 100)
    },
    operational: {
      completedStages: operationalComplete,
      totalStages: stageCards.length,
      blockedStages: stageCards.length - operationalComplete,
      percent: Math.round((operationalComplete / total) * 100)
    }
  };
};

const missingEvidenceProgressFor = stageCards => ({
  software: {
    implementedStages: 0,
    totalStages: stageCards.length,
    percent: 0
  },
  operational: {
    completedStages: 0,
    totalStages: stageCards.length,
    blockedStages: stageCards.length,
    percent: 0
  }
});

const currentPhaseFor = ({ status, visionWorklist, webKnowledgeReadiness }) => {
  if (status === 'missing_evidence') {
    return {
      code: 'evidence_missing',
      titleKo: '진행 증거 재생성 필요',
      descriptionKo: 'readiness/worklist/handoff/web readiness artifact가 부족해 완료 단계를 확정할 수 없습니다.'
    };
  }
  if (status === 'ready_for_operator_review') {
    return {
      code: 'operator_release_review',
      titleKo: '운영자 릴리스 검토 단계',
      descriptionKo: '기계 게이트가 닫혔고 운영자가 수동 활성화 여부를 검토할 수 있습니다.'
    };
  }
  if (asArray(visionWorklist?.tasks).length > 0) {
    return {
      code: 'operational_data_hitl_closure',
      titleKo: '운영 전환 전 데이터/HITL 게이트 종료 단계',
      descriptionKo: '기능 구현은 진행됐지만 운영 정확도를 보장하기 위한 라벨, HITL, 샘플, reference, release 증거가 남아 있습니다.'
    };
  }
  if (webKnowledgeReadiness?.readyForGraphRoundtrip !== true) {
    return {
      code: 'knowledge_hitl_closure',
      titleKo: '웹 지식 HITL/중앙 승인 종료 단계',
      descriptionKo: '웹 결함 Case 수집은 진행됐지만 HITL 또는 중앙 승인이 남아 있습니다.'
    };
  }
  return {
    code: 'release_evidence_closure',
    titleKo: '릴리스 증거 정합성 종료 단계',
    descriptionKo: '남은 release evidence를 재생성하고 운영자 확인을 받아야 합니다.'
  };
};

const statusFor = ({
  missingArtifacts,
  visionReadiness,
  visionWorklist,
  commonAgentHandoff,
  webKnowledgeReadiness,
  operationalHitlIntakeStatus
}) => {
  if (missingArtifacts.length > 0) return 'missing_evidence';
  const visionReady =
    ['approved_for_manual_activation', 'ready_for_operator_approval'].includes(visionReadiness?.status)
    && visionReadiness?.autoActivationAllowed !== true
    && asArray(visionReadiness?.blockers).length === 0;
  const worklistReady =
    visionWorklist?.readyForManualActivation === true
    && asArray(visionWorklist?.tasks).length === 0;
  const handoffReady =
    commonAgentHandoff?.status === 'ready_for_operator_import'
    && commonAgentHandoff?.serviceWritesPerformed !== true;
  const webReady =
    webKnowledgeReadiness?.readyForGraphRoundtrip === true
    && webKnowledgeReadiness?.readyForCommonAgentLearning === true
    && webKnowledgeReadiness?.serviceWritesPerformed !== true;
  const intakeReady =
    !isOperationalHitlIntakeStatus(operationalHitlIntakeStatus)
    || operationalHitlIntakeStatus.status === 'clear';
  return visionReady && worklistReady && handoffReady && webReady && intakeReady
    ? 'ready_for_operator_review'
    : 'action_required';
};

const nextActionsFor = ({
  status,
  visionWorklist,
  webKnowledgeReadiness
}) => {
  if (status === 'missing_evidence') {
    return [{
      code: 'generate_progress_evidence',
      owner: 'system_operator',
      priority: 100,
      titleKo: '운영 진행 증거 artifact 재생성',
      commands: [
        'npm run vision:operational:readiness',
        'npm run vision:operational:worklist',
        'npm run vision:operational:handoff',
        'npm run knowledge:web:readiness'
      ],
      requiresHumanReview: false,
      autoApplyAllowed: false
    }];
  }
  if (status === 'ready_for_operator_review') {
    return [{
      code: 'operator_release_review',
      owner: 'quality_lead',
      priority: 100,
      titleKo: '운영자 수동 릴리스 검토',
      commands: ['npm run operational:progress'],
      requiresHumanReview: true,
      autoApplyAllowed: false
    }];
  }

  const taskActions = asArray(visionWorklist?.tasks).map(taskNextActions);
  const webSummary = webKnowledgeReadiness?.summary || {};
  const webAction = webKnowledgeReadiness?.readyForGraphRoundtrip === true
    ? []
    : [{
      code: 'web_knowledge_hitl_approval',
      owner: 'knowledge_owner',
      priority: 40,
      titleKo: '웹 Case HITL 및 중앙 승인 종료',
      commands: [
        'npm run knowledge:web:hitl:decision-template',
        'npm run knowledge:web:hitl:verify-decisions -- --decisions <filled-web-knowledge-hitl-decisions.json>',
        'npm run knowledge:web:hitl:apply -- --decisions <verified-web-knowledge-hitl-decisions.json> --apply',
        'npm run knowledge:web:readiness'
      ],
      requiresHumanReview: true,
      autoApplyAllowed: false,
      current: numberFrom(webSummary.approvedHitlCards),
      required: numberFrom(webSummary.targetCardCount),
      missing: numberFrom(webSummary.hitlApprovalsMissing)
    }];

  return [...taskActions, ...webAction]
    .sort((left, right) => right.priority - left.priority || left.code.localeCompare(right.code));
};

const feedbackFor = ({
  status,
  currentPhase,
  summary,
  nextActions
}) => {
  if (status === 'missing_evidence') {
    return [
      '개발 단계: 현재 완료율을 확정하려면 운영 증거 artifact를 먼저 재생성해야 합니다.',
      '자동 Graph/Reference/모델 쓰기는 계속 금지됩니다.'
    ];
  }
  if (status === 'ready_for_operator_review') {
    return [
      '개발 단계: 운영자 수동 릴리스 검토 단계입니다.',
      '기계 게이트가 닫혔지만 자동 활성화는 금지되어 있으며, 운영자 확인 후 수동으로 진행해야 합니다.'
    ];
  }
  const first = nextActions[0];
  const feedback = [
    `개발 단계: ${currentPhase.titleKo}입니다.`,
    `현재 Vision blocker ${summary.visionBlockers}건, 운영 작업 ${summary.visionTasks}건, Web HITL 미승인 ${summary.webHitlApprovalsMissing}건이 남아 있습니다.`,
    first
      ? `다음 1순위는 ${first.titleKo}입니다.`
      : '다음 작업은 readiness artifact를 다시 확인해 결정하세요.',
    '자동 Graph 승격, Reference 학습, 모델 학습은 사람이 검증하기 전까지 금지됩니다.'
  ];
  if (summary.visionAccuracyStatus) {
    feedback.splice(
      3,
      0,
      `Vision 정확도 병목: Top-1 ${summary.visionTop1Accuracy}%, Top-3 ${summary.visionTop3Accuracy}%, 촬영 프로토콜 ${summary.visionCaptureProtocolReadyRate}%이며 ${summary.visionAccuracyFirstTrackTitle || '개선 계획'} 작업이 필요합니다.`
    );
  }
  if (summary.operationalHitlIntakeStatus) {
    feedback.splice(
      3,
      0,
      `HITL decision 입력 ${summary.operationalHitlDecisionInputsMissing}건이 남아 있으며 1순위 큐는 ${summary.operationalHitlFirstQueueCode || '미확정'}입니다.`
    );
  }
  if (summary.visionCaptureWorkOrderStatus) {
    feedback.splice(
      3,
      0,
      `Vision 촬영 work order ${summary.visionCaptureWorkOrders}건이 필요하며 우선 결함군은 ${summary.visionCaptureTopPriorityDefectClass || '미정'}입니다. 신규 ${summary.visionCaptureMissingApprovedSamples}건, 재촬영 ${summary.visionCaptureRecaptureSamples}건을 확보하세요.`
    );
  }
  return feedback;
};

const buildMoldMasterDevelopmentProgressReport = ({
  generatedAt = new Date().toISOString(),
  visionReadiness = null,
  visionWorklist = null,
  commonAgentHandoff = null,
  webKnowledgeReadiness = null,
  visionAccuracyPlan = null,
  operationalHitlIntakeStatus = null,
  visionCaptureWorkOrderPlan = null,
  sourceArtifacts = {}
} = {}) => {
  const missingArtifacts = missingArtifactsFor({
    visionReadiness,
    visionWorklist,
    commonAgentHandoff,
    webKnowledgeReadiness
  });
  const status = statusFor({
    missingArtifacts,
    visionReadiness,
    visionWorklist,
    commonAgentHandoff,
    webKnowledgeReadiness,
    operationalHitlIntakeStatus
  });
  const stageCards = stageCardsFor({
    visionReadiness,
    visionWorklist,
    commonAgentHandoff,
    webKnowledgeReadiness,
    visionAccuracyPlan,
    operationalHitlIntakeStatus,
    visionCaptureWorkOrderPlan
  });
  const nextActions = nextActionsFor({
    status,
    visionWorklist,
    webKnowledgeReadiness
  });
  const currentPhase = currentPhaseFor({
    status,
    visionWorklist,
    webKnowledgeReadiness
  });
  const webSummary = webKnowledgeReadiness?.summary || {};
  const accuracySummary = isVisionAccuracyPlan(visionAccuracyPlan)
    ? visionAccuracyPlan.summary || {}
    : null;
  const firstAccuracyTrack = isVisionAccuracyPlan(visionAccuracyPlan)
    ? asArray(visionAccuracyPlan.improvementTracks)[0] || null
    : null;
  const intakeSummary = isOperationalHitlIntakeStatus(operationalHitlIntakeStatus)
    ? operationalHitlIntakeStatus.summary || {}
    : null;
  const captureWorkOrderSummary = isVisionCaptureWorkOrderPlan(visionCaptureWorkOrderPlan)
    ? visionCaptureWorkOrderPlan.summary || {}
    : null;
  const summary = {
    missingArtifacts,
    visionStatus: compact(visionReadiness?.status) || null,
    visionBlockers: asArray(visionReadiness?.blockers).length,
    visionTasks: asArray(visionWorklist?.tasks).length,
    webKnowledgeStatus: compact(webKnowledgeReadiness?.status) || null,
    webCards: numberFrom(webSummary.cardCount),
    webTargetCards: numberFrom(webSummary.targetCardCount),
    webHitlApprovalsMissing: numberFrom(webSummary.hitlApprovalsMissing),
    webCentralApprovalsMissing: numberFrom(webSummary.centralApprovalsMissing),
    ...(accuracySummary ? {
      visionAccuracyStatus: compact(visionAccuracyPlan.status) || null,
      visionTop1Accuracy: numberFrom(accuracySummary.top1Accuracy),
      visionTop3Accuracy: numberFrom(accuracySummary.top3Accuracy),
      visionCaptureProtocolReadyRate: numberFrom(accuracySummary.captureProtocolReadyRate),
      visionAccuracyFirstTrackCode: compact(firstAccuracyTrack?.code) || null,
      visionAccuracyFirstTrackTitle: compact(firstAccuracyTrack?.titleKo) || null,
      visionCoreMissingViews: asArray(accuracySummary.coreMissingViews),
      visionUndercoveredDefectClasses: asArray(accuracySummary.undercoveredDefectClasses),
      visionZeroAccuracyDefectClasses: asArray(accuracySummary.zeroAccuracyDefectClasses)
    } : {}),
    ...(intakeSummary ? {
      operationalHitlIntakeStatus: compact(operationalHitlIntakeStatus.status) || null,
      operationalHitlDecisionInputsMissing: numberFrom(intakeSummary.totalDecisionInputsMissing),
      operationalHitlFirstQueueCode: compact(intakeSummary.firstQueueCode) || null,
      operationalHitlLabelConflictPending: numberFrom(intakeSummary.labelConflictPending),
      operationalHitlVisionPending: numberFrom(intakeSummary.visionHitlPending),
      operationalHitlWebMissing: numberFrom(intakeSummary.webHitlMissing),
      operationalHitlStaleDecisionEvidenceCount: numberFrom(intakeSummary.staleDecisionEvidenceCount)
    } : {}),
    ...(captureWorkOrderSummary ? {
      visionCaptureWorkOrderStatus: compact(visionCaptureWorkOrderPlan.status) || null,
      visionCaptureWorkOrders: numberFrom(captureWorkOrderSummary.totalWorkOrders),
      visionCaptureMissingApprovedSamples: numberFrom(captureWorkOrderSummary.totalMissingApprovedSamples),
      visionCaptureRecaptureSamples: numberFrom(captureWorkOrderSummary.totalRecaptureSamples),
      visionCaptureTopPriorityDefectClass: compact(captureWorkOrderSummary.topPriorityDefectClass) || null,
      visionCaptureCoreMissingViews: asArray(captureWorkOrderSummary.coreMissingViews)
    } : {}),
    handoffStatus: compact(commonAgentHandoff?.status) || null,
    topPriorityTaskCode: nextActions[0]?.code || null
  };

  return {
    schemaVersion: 1,
    contractVersion: 'mold-master-development-progress-report/v1',
    generatedAt,
    sourceSystem: 'mold-master-ai',
    targetSystem: 'operator_common_agent',
    status,
    currentPhase,
    serviceWritesPerformed: false,
    localArtifactsWritten: true,
    policy: {
      requiresHumanReview: true,
      automaticServiceWritesAllowed: false,
      autoApplyAllowed: false,
      allowGraphPromotion: false,
      allowReferenceLearning: false,
      allowModelTraining: false
    },
    summary,
    progress: status === 'missing_evidence'
      ? missingEvidenceProgressFor(stageCards)
      : progressFor(stageCards),
    stageCards,
    nextActions,
    progressFeedbackKo: feedbackFor({
      status,
      currentPhase,
      summary,
      nextActions
    }),
    sources: {
      visionReadiness: sourceArtifacts.visionReadiness || null,
      visionWorklist: sourceArtifacts.visionWorklist || null,
      commonAgentHandoff: sourceArtifacts.commonAgentHandoff || null,
      webKnowledgeReadiness: sourceArtifacts.webKnowledgeReadiness || null,
      visionAccuracyPlan: sourceArtifacts.visionAccuracyPlan || null,
      operationalHitlIntakeStatus: sourceArtifacts.operationalHitlIntakeStatus || null,
      visionCaptureWorkOrderPlan: sourceArtifacts.visionCaptureWorkOrderPlan || null
    },
    recommendedAction: nextActions[0]
      ? nextActions[0].titleKo
      : '운영 준비 상태를 다시 확인하세요.'
  };
};

module.exports = {
  buildMoldMasterDevelopmentProgressReport
};
