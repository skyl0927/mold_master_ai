const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildMoldMasterDevelopmentProgressReport
} = require('../moldMasterDevelopmentProgressReport');

const task = ({ code, priority, owner, titleKo, commands = [], current, required, missing }) => ({
  code,
  priority,
  owner,
  titleKo,
  descriptionKo: `${titleKo} 설명`,
  requiresHumanReview: true,
  autoApplyAllowed: false,
  commands,
  ...(current !== undefined ? { current } : {}),
  ...(required !== undefined ? { required } : {}),
  ...(missing !== undefined ? { missing } : {})
});

const actionRequiredReadiness = {
  contractVersion: 'vision-operational-readiness-audit/v1',
  generatedAt: '2026-07-27T10:00:00.000Z',
  status: 'action_required',
  readyForCandidateActivation: false,
  autoActivationAllowed: false,
  blockers: [
    { source: 'reference', code: 'reference_store_missing' },
    { source: 'post_hitl', code: 'approved_sample_count', current: 12, required: 20, missing: 8 },
    { source: 'post_hitl', code: 'approved_label_conflicts', count: 4 },
    { source: 'post_hitl', code: 'human_review_required', count: 12 },
    { source: 'release', code: 'release_report_missing' }
  ],
  gates: {
    hitlWorkflow: {
      status: 'awaiting_human_review',
      queue: {
        pendingHighConfidence: 12
      },
      verification: {
        pendingQueueItems: 12
      }
    }
  }
};

const actionRequiredWorklist = {
  contractVersion: 'vision-operational-blocker-worklist/v1',
  status: 'action_required',
  readyForManualActivation: false,
  summary: {
    totalTasks: 5,
    blockerTasks: 5,
    operatorTasks: 0
  },
  tasks: [
    task({
      code: 'resolve_label_conflicts',
      priority: 100,
      owner: 'quality_hitl',
      titleKo: '승인 이미지 라벨 충돌 해결',
      commands: [
        'npm run vision:label-conflicts:packet',
        'npm run vision:label-conflicts:decision-template',
        'npm run vision:label-conflicts:review-guide',
        'npm run vision:label-conflicts:verify-decisions -- --decisions <filled-vision-label-conflict-decisions.json>',
        'npm run vision:label-conflicts:apply -- --verification <vision-approved-label-conflict-decision-verification-report.json>',
        'npm run vision:label-conflicts:apply -- --verification <vision-approved-label-conflict-decision-verification-report.json> --apply',
        'npm run migration:verify-post-hitl'
      ]
    }),
    task({
      code: 'close_hitl_reviews',
      priority: 90,
      owner: 'quality_hitl',
      titleKo: '미해결 HITL 검토 종료',
      commands: ['npm run vision:hitl:pending-packet']
    }),
    task({
      code: 'collect_approved_samples',
      priority: 80,
      owner: 'quality_capture',
      titleKo: '승인 다중 시점 샘플 추가 확보',
      current: 12,
      required: 20,
      missing: 8
    }),
    task({
      code: 'repair_reference_store',
      priority: 70,
      owner: 'common_agent_operator',
      titleKo: 'Common Agent Vision reference store 복구',
      commands: ['npm run vision:reference:gate']
    }),
    task({
      code: 'build_operational_release_report',
      priority: 50,
      owner: 'release_owner',
      titleKo: '운영 릴리스 보고서와 증거 정합성 재생성',
      commands: ['npm run eval:vision:release']
    })
  ]
};

const blockedHandoff = {
  contractVersion: 'vision-operational-common-agent-handoff-packet/v1',
  status: 'blocked',
  serviceWritesPerformed: false,
  manualImportAllowed: false,
  summary: {
    totalTasks: 5,
    primaryTaskCode: 'resolve_label_conflicts'
  }
};

const awaitingWebReadiness = {
  contractVersion: 'web-knowledge-operational-readiness/v1',
  status: 'awaiting_hitl_review',
  readyForCommonAgentLearning: false,
  readyForGraphRoundtrip: false,
  serviceWritesPerformed: false,
  summary: {
    targetCardCount: 40,
    cardCount: 43,
    classCount: 22,
    verifiedImages: 19,
    commonAgentValidationPassed: 43,
    commonAgentValidationFailed: 0,
    approvedHitlCards: 0,
    hitlApprovalsMissing: 40,
    centralApprovedDocuments: 0,
    centralApprovalsMissing: 40
  },
  blockers: [
    { code: 'web_hitl_approvals_missing', current: 0, required: 40, missing: 40 }
  ]
};

const actionRequiredAccuracyPlan = {
  contractVersion: 'vision-accuracy-improvement-plan/v1',
  status: 'action_required',
  serviceWritesPerformed: false,
  summary: {
    totalCases: 13,
    top1Accuracy: 46.2,
    top3Accuracy: 53.8,
    captureProtocolReadyRate: 0,
    referenceRefreshAllowedNow: false,
    coreMissingViews: [
      { view: 'defect_closeup', count: 13 },
      { view: 'full_part_context', count: 13 }
    ],
    undercoveredDefectClasses: ['burn', 'sink', 'ejection'],
    zeroAccuracyDefectClasses: ['sink', 'ejection']
  },
  improvementTracks: [{
    code: 'repair_capture_protocol',
    priority: 100,
    titleKo: '촬영 프로토콜 보강',
    commands: [
      'npm run eval:vision:approved:validate',
      'npm run vision:hitl:review-guide',
      'npm run vision:reference:backfill-plan'
    ]
  }]
};

const actionRequiredHitlIntakeStatus = {
  contractVersion: 'operational-hitl-decision-intake-status/v1',
  status: 'action_required',
  serviceWritesPerformed: false,
  summary: {
    totalDecisionInputsMissing: 56,
    firstQueueCode: 'vision_label_conflicts',
    labelConflictPending: 4,
    visionHitlPending: 12,
    webHitlMissing: 40,
    staleDecisionEvidenceCount: 0
  },
  queues: [
    {
      code: 'vision_label_conflicts',
      titleKo: '승인 이미지 라벨 충돌 판정',
      owner: 'quality_hitl',
      status: 'awaiting_human_review',
      decisionsPrepared: 4,
      decisionsReceived: 0,
      pending: 4,
      commands: [
        'npm run vision:label-conflicts:decision-template',
        'npm run vision:label-conflicts:review-guide',
        'npm run vision:label-conflicts:verify-decisions -- --decisions <filled-vision-label-conflict-decisions.json>'
      ],
      nextActionKo: '품질/HITL 라벨 충돌 판정 파일을 작성하고 검증하세요.'
    },
    {
      code: 'vision_pending_hitl',
      titleKo: 'Vision pending HITL 판정',
      owner: 'quality_hitl',
      status: 'awaiting_human_review',
      decisionsPrepared: 12,
      decisionsReceived: 0,
      pending: 12,
      commands: ['npm run vision:hitl:decision-template']
    },
    {
      code: 'web_knowledge_hitl',
      titleKo: 'Web Knowledge HITL 승인',
      owner: 'knowledge_owner',
      status: 'awaiting_human_review',
      decisionsPrepared: 40,
      decisionsReceived: 0,
      pending: 40,
      commands: ['npm run knowledge:web:hitl:decision-template']
    }
  ]
};

const captureWorkOrderPlan = {
  contractVersion: 'vision-capture-work-order-plan/v1',
  status: 'capture_required',
  serviceWritesPerformed: false,
  summary: {
    totalWorkOrders: 7,
    totalMissingApprovedSamples: 4,
    totalRecaptureSamples: 10,
    topPriorityDefectClass: 'burn',
    coreMissingViews: [
      { view: 'defect_closeup', count: 13 },
      { view: 'full_part_context', count: 13 }
    ]
  },
  workOrders: [
    {
      defectClass: 'burn',
      actionType: 'capture_new_multiview_samples',
      priority: 105,
      missingApprovedSamples: 2,
      recaptureSampleIds: [],
      requiredViews: ['full_part_context', 'defect_closeup', 'fill_end_context', 'vent_context']
    }
  ]
};

test('summarizes the current development phase and remaining operational blockers', () => {
  const report = buildMoldMasterDevelopmentProgressReport({
    generatedAt: '2026-07-27T11:00:00.000Z',
    visionReadiness: actionRequiredReadiness,
    visionWorklist: actionRequiredWorklist,
    commonAgentHandoff: blockedHandoff,
    webKnowledgeReadiness: awaitingWebReadiness,
    sourceArtifacts: {
      visionReadiness: 'artifacts/vision-operational-readiness-audit.json',
      visionWorklist: 'artifacts/vision-operational-blocker-worklist.json',
      commonAgentHandoff: 'artifacts/vision-operational-common-agent-handoff.json',
      webKnowledgeReadiness: 'artifacts/web-knowledge-operational-readiness.json'
    }
  });

  assert.equal(report.contractVersion, 'mold-master-development-progress-report/v1');
  assert.equal(report.status, 'action_required');
  assert.equal(report.currentPhase.code, 'operational_data_hitl_closure');
  assert.equal(report.serviceWritesPerformed, false);
  assert.equal(report.policy.allowGraphPromotion, false);
  assert.equal(report.summary.visionBlockers, 5);
  assert.equal(report.summary.visionTasks, 5);
  assert.equal(report.summary.webCards, 43);
  assert.equal(report.summary.webTargetCards, 40);
  assert.equal(report.summary.webCommonAgentValidationPassed, 43);
  assert.equal(report.summary.webHitlApprovalsMissing, 40);
  assert.equal(report.summary.webCentralApprovalsMissing, 40);
  assert.equal(report.summary.topPriorityTaskCode, 'resolve_label_conflicts');
  assert.equal(report.nextActions[0].code, 'resolve_label_conflicts');
  assert.deepEqual(report.nextActions[0].commands, [
    'npm run vision:label-conflicts:packet',
    'npm run vision:label-conflicts:decision-template',
    'npm run vision:label-conflicts:review-guide',
    'npm run vision:label-conflicts:verify-decisions -- --decisions <filled-vision-label-conflict-decisions.json>',
    'npm run vision:label-conflicts:apply -- --verification <vision-approved-label-conflict-decision-verification-report.json>',
    'npm run vision:label-conflicts:apply -- --verification <vision-approved-label-conflict-decision-verification-report.json> --apply',
    'npm run migration:verify-post-hitl'
  ]);

  const labelConflictStage = report.stageCards.find(stage => stage.id === 'vision_label_conflict_hitl');
  assert.equal(labelConflictStage.status, 'action_required');
  assert.equal(labelConflictStage.softwareImplemented, true);
  assert.match(labelConflictStage.feedbackKo, /4건/);

  const webStage = report.stageCards.find(stage => stage.id === 'web_case_knowledge');
  assert.equal(webStage.status, 'awaiting_human_review');
  assert.equal(webStage.softwareImplemented, true);
  assert.deepEqual(webStage.commands, [
    'npm run knowledge:web:readiness',
    'npm run knowledge:web:hitl:decision-template',
    'npm run knowledge:web:hitl:review-guide',
    'npm run knowledge:web:hitl:verify-decisions -- --decisions <filled-web-knowledge-hitl-decisions.json>',
    'npm run knowledge:web:hitl:apply -- --decisions <verified-web-knowledge-hitl-decisions.json> --apply'
  ]);
  assert.match(webStage.feedbackKo, /40건/);

  assert.ok(report.progress.software.percent > report.progress.operational.percent);
  assert.match(report.progressFeedbackKo[0], /운영 전환 전/);
  assert.equal(report.sources.visionReadiness, 'artifacts/vision-operational-readiness-audit.json');
});

test('surfaces Vision accuracy bottlenecks when the improvement plan exists', () => {
  const report = buildMoldMasterDevelopmentProgressReport({
    generatedAt: '2026-07-27T11:00:00.000Z',
    visionReadiness: actionRequiredReadiness,
    visionWorklist: actionRequiredWorklist,
    commonAgentHandoff: blockedHandoff,
    webKnowledgeReadiness: awaitingWebReadiness,
    visionAccuracyPlan: actionRequiredAccuracyPlan,
    sourceArtifacts: {
      visionAccuracyPlan: 'artifacts/vision-accuracy-improvement-plan.json'
    }
  });

  assert.equal(report.summary.visionAccuracyStatus, 'action_required');
  assert.equal(report.summary.visionTop1Accuracy, 46.2);
  assert.equal(report.summary.visionTop3Accuracy, 53.8);
  assert.equal(report.summary.visionCaptureProtocolReadyRate, 0);
  assert.equal(report.summary.visionAccuracyFirstTrackCode, 'repair_capture_protocol');
  assert.deepEqual(report.summary.visionCoreMissingViews, [
    { view: 'defect_closeup', count: 13 },
    { view: 'full_part_context', count: 13 }
  ]);
  assert.deepEqual(report.summary.visionUndercoveredDefectClasses, ['burn', 'sink', 'ejection']);

  const stage = report.stageCards.find(item => item.id === 'vision_accuracy_improvement');
  assert.equal(stage.status, 'action_required');
  assert.equal(stage.softwareImplemented, true);
  assert.equal(stage.metrics.top1Accuracy, 46.2);
  assert.equal(stage.metrics.captureProtocolReadyRate, 0);
  assert.deepEqual(stage.metrics.coreMissingViews, [
    { view: 'defect_closeup', count: 13 },
    { view: 'full_part_context', count: 13 }
  ]);
  assert.deepEqual(stage.commands, [
    'npm run eval:vision:approved:validate',
    'npm run vision:hitl:review-guide',
    'npm run vision:reference:backfill-plan'
  ]);
  assert.match(stage.feedbackKo, /Top-1 46\.2%/);
  assert.match(report.progressFeedbackKo.join('\n'), /촬영 프로토콜/);
  assert.equal(report.sources.visionAccuracyPlan, 'artifacts/vision-accuracy-improvement-plan.json');
});

test('surfaces operational HITL decision intake status when available', () => {
  const report = buildMoldMasterDevelopmentProgressReport({
    generatedAt: '2026-07-27T11:00:00.000Z',
    visionReadiness: actionRequiredReadiness,
    visionWorklist: actionRequiredWorklist,
    commonAgentHandoff: blockedHandoff,
    webKnowledgeReadiness: awaitingWebReadiness,
    operationalHitlIntakeStatus: actionRequiredHitlIntakeStatus,
    sourceArtifacts: {
      operationalHitlIntakeStatus: 'artifacts/operational-hitl-decision-intake-status.json'
    }
  });

  assert.equal(report.summary.operationalHitlIntakeStatus, 'action_required');
  assert.equal(report.summary.operationalHitlDecisionInputsMissing, 56);
  assert.equal(report.summary.operationalHitlFirstQueueCode, 'vision_label_conflicts');
  assert.equal(report.summary.operationalHitlLabelConflictPending, 4);
  assert.equal(report.summary.operationalHitlVisionPending, 12);
  assert.equal(report.summary.operationalHitlWebMissing, 40);

  const stage = report.stageCards.find(item => item.id === 'operational_hitl_decision_intake');
  assert.equal(stage.status, 'action_required');
  assert.equal(stage.owner, 'quality_hitl');
  assert.equal(stage.metrics.totalDecisionInputsMissing, 56);
  assert.equal(stage.metrics.firstQueueCode, 'vision_label_conflicts');
  assert.deepEqual(stage.metrics.queueBreakdown, [
    ['vision_label_conflicts', 4],
    ['vision_pending_hitl', 12],
    ['web_knowledge_hitl', 40]
  ]);
  assert.deepEqual(stage.commands, [
    'npm run vision:label-conflicts:decision-template',
    'npm run vision:label-conflicts:review-guide',
    'npm run vision:label-conflicts:verify-decisions -- --decisions <filled-vision-label-conflict-decisions.json>'
  ]);
  assert.match(stage.feedbackKo, /decision 입력 56건/);
  assert.match(report.progressFeedbackKo.join('\n'), /HITL decision 입력 56건/);
  assert.equal(report.sources.operationalHitlIntakeStatus, 'artifacts/operational-hitl-decision-intake-status.json');
});

test('surfaces Vision capture work orders as the next data-quality bottleneck', () => {
  const report = buildMoldMasterDevelopmentProgressReport({
    generatedAt: '2026-07-28T04:30:00.000Z',
    visionReadiness: actionRequiredReadiness,
    visionWorklist: actionRequiredWorklist,
    commonAgentHandoff: blockedHandoff,
    webKnowledgeReadiness: awaitingWebReadiness,
    visionAccuracyPlan: actionRequiredAccuracyPlan,
    visionCaptureWorkOrderPlan: captureWorkOrderPlan,
    sourceArtifacts: {
      visionCaptureWorkOrderPlan: 'artifacts/vision-capture-work-order-plan.json'
    }
  });

  assert.equal(report.summary.visionCaptureWorkOrderStatus, 'capture_required');
  assert.equal(report.summary.visionCaptureWorkOrders, 7);
  assert.equal(report.summary.visionCaptureMissingApprovedSamples, 4);
  assert.equal(report.summary.visionCaptureRecaptureSamples, 10);
  assert.equal(report.summary.visionCaptureTopPriorityDefectClass, 'burn');
  assert.deepEqual(report.summary.visionCaptureCoreMissingViews, [
    { view: 'defect_closeup', count: 13 },
    { view: 'full_part_context', count: 13 }
  ]);
  assert.equal(report.sources.visionCaptureWorkOrderPlan, 'artifacts/vision-capture-work-order-plan.json');

  const stage = report.stageCards.find(item => item.id === 'vision_capture_work_orders');
  assert.equal(stage.status, 'action_required');
  assert.equal(stage.owner, 'quality_capture');
  assert.equal(stage.metrics.totalWorkOrders, 7);
  assert.equal(stage.metrics.topPriorityDefectClass, 'burn');
  assert.deepEqual(stage.commands, [
    'npm run vision:capture:work-orders',
    'npm run eval:vision:approved',
    'npm run vision:accuracy:improvement-plan'
  ]);
  assert.ok(report.progressFeedbackKo.some(item => item.includes('burn')));
});

test('reports ready for operator review only when Vision and Web knowledge gates are closed', () => {
  const report = buildMoldMasterDevelopmentProgressReport({
    visionReadiness: {
      contractVersion: 'vision-operational-readiness-audit/v1',
      status: 'approved_for_manual_activation',
      readyForCandidateActivation: true,
      autoActivationAllowed: false,
      blockers: []
    },
    visionWorklist: {
      contractVersion: 'vision-operational-blocker-worklist/v1',
      status: 'ready',
      readyForManualActivation: true,
      summary: {
        totalTasks: 0,
        blockerTasks: 0,
        operatorTasks: 0
      },
      tasks: []
    },
    commonAgentHandoff: {
      contractVersion: 'vision-operational-common-agent-handoff-packet/v1',
      status: 'ready_for_operator_import',
      manualImportAllowed: true,
      serviceWritesPerformed: false
    },
    webKnowledgeReadiness: {
      contractVersion: 'web-knowledge-operational-readiness/v1',
      status: 'ready_for_graph_roundtrip',
      readyForGraphRoundtrip: true,
      readyForCommonAgentLearning: true,
      serviceWritesPerformed: false,
      summary: {
        cardCount: 43,
        targetCardCount: 40,
        approvedHitlCards: 40,
        hitlApprovalsMissing: 0,
        centralApprovedDocuments: 40,
        centralApprovalsMissing: 0
      },
      blockers: []
    }
  });

  assert.equal(report.status, 'ready_for_operator_review');
  assert.equal(report.currentPhase.code, 'operator_release_review');
  assert.equal(report.summary.visionBlockers, 0);
  assert.equal(report.nextActions[0].code, 'operator_release_review');
  assert.equal(report.progress.operational.percent, 100);
});

test('fails closed when progress evidence artifacts are missing', () => {
  const report = buildMoldMasterDevelopmentProgressReport({});

  assert.equal(report.status, 'missing_evidence');
  assert.equal(report.currentPhase.code, 'evidence_missing');
  assert.equal(report.summary.missingArtifacts.length, 4);
  assert.equal(report.nextActions[0].code, 'generate_progress_evidence');
  assert.equal(report.policy.automaticServiceWritesAllowed, false);
  assert.equal(report.progress.operational.percent, 0);
});
