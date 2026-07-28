const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildOperationalStatusBundle,
  extractRestorableStatusBundleArtifacts
} = require('../operationalStatusBundle');

const progressReport = () => ({
  contractVersion: 'mold-master-development-progress-report/v1',
  status: 'action_required',
  currentPhase: {
    code: 'operational_data_hitl_closure',
    titleKo: '운영 전환 전 데이터/HITL 게이트 종료 단계'
  },
  serviceWritesPerformed: false,
  policy: {
    automaticServiceWritesAllowed: false,
    allowGraphPromotion: false
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
      percent: 100
    },
    operational: {
      percent: 0
    }
  },
  nextActions: [
    {
      code: 'resolve_label_conflicts',
      titleKo: '승인 이미지 라벨 충돌 해결',
      owner: 'quality_hitl',
      priority: 100,
      commands: ['npm run vision:label-conflicts:packet']
    }
  ],
  progressFeedbackKo: [
    '개발 단계: 운영 전환 전 데이터/HITL 게이트 종료 단계입니다.',
    'HITL decision 입력 56건이 남아 있습니다.'
  ]
});

const pipelineStatus = () => ({
  contractVersion: 'operational-hitl-pipeline-status/v1',
  status: 'action_required',
  currentStage: {
    code: 'awaiting_human_csv_decisions',
    titleKo: 'CSV HITL 판정 입력 대기'
  },
  serviceWritesPerformed: false,
  summary: {
    worktableRows: 59,
    worktableReviewSessionProgressCompletedRows: 0,
    worktableReviewSessionProgressPendingRows: 59,
    worktableReviewSessionProgressInvalidRows: 0
  },
  nextActions: [
    {
      code: 'fill_worktable_csv',
      titleKo: 'CSV 작업표 HITL 판정 입력',
      commands: [
        'npm run operational:hitl:worktable-import',
        'npm run operational:hitl:session-progress'
      ]
    }
  ]
});

const humanBrief = () => ({
  contractVersion: 'operational-hitl-human-decision-brief/v1',
  status: 'ready_for_human_entry',
  pipelineStageCode: 'awaiting_human_csv_decisions',
  pipelineStageKo: 'CSV HITL 판정 입력 대기',
  serviceWritesPerformed: false,
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
      instructionKo: '세션 Markdown을 열어 근거를 확인하세요.',
      path: 'C:\\repo\\packet\\01-label-conflict-session.md'
    },
    {
      code: 'fill_original_worktable_csv',
      titleKo: '원본 worktable CSV 입력',
      instructionKo: '사람이 확인한 값만 입력하세요.',
      path: 'C:\\repo\\artifacts\\operational-hitl-decision-worktable-export.csv'
    }
  ],
  sessions: [
    {
      code: 'label_conflict_session',
      titleKo: '승인 이미지 라벨 충돌 선검토',
      priority: 1,
      pendingRows: 4,
      invalidRows: 0,
      highRiskRows: 4,
      markdownPath: 'C:\\repo\\packet\\01-label-conflict-session.md',
      csvPath: 'C:\\repo\\packet\\01-label-conflict-session.csv',
      nextRows: [
        {
          queueCode: 'vision_label_conflicts',
          decisionId: 'conflict-001',
          displayLabel: '제팅 | 플로우마크',
          recommendedNewAction: 'mark_needs_review',
          recommendationRisk: 'high'
        }
      ]
    }
  ],
  recommendedAction: '다음 세션 패킷을 열고 원본 worktable CSV에 사람이 확인한 값만 입력하세요.'
});

const captureWorkOrderPlan = () => ({
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
    },
    {
      defectClass: 'sink',
      actionType: 'capture_new_and_recapture_existing_samples',
      priority: 98,
      missingApprovedSamples: 1,
      recaptureSampleIds: ['sink-001'],
      requiredViews: ['full_part_context', 'defect_closeup', 'oblique_light', 'reverse_geometry']
    }
  ]
});

test('builds an artifact-only operational status bundle for handoff and Settings import', () => {
  const bundle = buildOperationalStatusBundle({
    generatedAt: '2026-07-28T04:00:00.000Z',
    developmentProgress: progressReport(),
    pipelineStatus: pipelineStatus(),
    humanDecisionBrief: humanBrief(),
    sourceArtifacts: {
      developmentProgress: 'C:\\repo\\artifacts\\mold-master-development-progress-report.json',
      pipelineStatus: 'C:\\repo\\artifacts\\operational-hitl-pipeline-status.json',
      humanDecisionBrief: 'C:\\repo\\artifacts\\operational-hitl-human-decision-brief.json',
      humanDecisionBriefMarkdown: 'C:\\repo\\artifacts\\operational-hitl-human-decision-brief.md',
      reviewSessionPacket: 'C:\\repo\\artifacts\\operational-hitl-review-session-packet.json'
    },
    markdownPath: 'C:\\repo\\artifacts\\operational-status-bundle.md'
  });

  assert.equal(bundle.contractVersion, 'operational-status-bundle/v1');
  assert.equal(bundle.status, 'awaiting_human_hitl');
  assert.equal(bundle.serviceWritesPerformed, false);
  assert.equal(bundle.policy.autoApplyAllowed, false);
  assert.equal(bundle.policy.allowGraphPromotion, false);
  assert.equal(bundle.summary.softwareScaffoldPercent, 100);
  assert.equal(bundle.summary.operationalProgressPercent, 0);
  assert.equal(bundle.summary.currentPhaseKo, '운영 전환 전 데이터/HITL 게이트 종료 단계');
  assert.equal(bundle.summary.currentPipelineStageKo, 'CSV HITL 판정 입력 대기');
  assert.equal(bundle.summary.hitlDecisionInputsMissing, 56);
  assert.equal(bundle.summary.pendingRows, 59);
  assert.equal(bundle.summary.highRiskRows, 9);
  assert.equal(bundle.summary.webHitlApprovalsMissing, 40);
  assert.equal(bundle.summary.visionTop1Accuracy, 46.2);
  assert.equal(bundle.summary.nextSessionCode, 'label_conflict_session');
  assert.equal(bundle.summary.nextDecisionId, 'conflict-001');
  assert.equal(bundle.summary.worktableCsvPath, 'C:\\repo\\artifacts\\operational-hitl-decision-worktable-export.csv');
  assert.deepEqual(bundle.settingsImportChecklist.map(item => item.buttonLabelKo), [
    'Progress 등록',
    'Pipeline Status 등록',
    'Human Brief 등록',
    'Session Packet 등록'
  ]);
  assert.deepEqual(bundle.nextOperatorActions.map(action => action.code), [
    'register_status_artifacts_in_settings',
    'open_next_human_brief',
    'fill_original_worktable_csv',
    'dry_run_import_and_refresh_status'
  ]);
  assert.equal(bundle.sessionPointers[0].code, 'label_conflict_session');
  assert.equal(bundle.sessionPointers[0].firstDecisionId, 'conflict-001');
  assert.match(bundle.markdown, /Operational Status Bundle/);
  assert.match(bundle.markdown, /소프트웨어 100%/);
  assert.match(bundle.markdown, /Progress 등록/);
  assert.match(bundle.markdown, /Graph\/Reference\/Model 승격 금지/);
  assert.equal(bundle.markdownPath, 'C:\\repo\\artifacts\\operational-status-bundle.md');
});

test('fails closed when required operational status evidence is missing', () => {
  const bundle = buildOperationalStatusBundle({
    sourceArtifacts: {
      developmentProgress: 'missing-progress.json'
    }
  });

  assert.equal(bundle.status, 'missing_evidence');
  assert.equal(bundle.serviceWritesPerformed, false);
  assert.deepEqual(bundle.summary.missingArtifactNames, [
    'developmentProgress',
    'pipelineStatus',
    'humanDecisionBrief'
  ]);
  assert.deepEqual(bundle.sessionPointers, []);
  assert.equal(bundle.settingsImportChecklist.length, 0);
  assert.match(bundle.recommendedAction, /operational:progress/);
});

test('embeds restorable source artifact snapshots for one-file Settings restore', () => {
  const reviewSessionPacket = {
    contractVersion: 'operational-hitl-review-session-packet/v1',
    status: 'ready_for_human_review',
    summary: {
      totalRows: 59
    }
  };
  const worktableSuggestion = {
    contractVersion: 'operational-hitl-decision-worktable-suggestion/v1',
    status: 'ready_for_human_review',
    rows: [
      {
        decisionId: 'conflict-001',
        recommendedNewAction: 'mark_needs_review'
      }
    ]
  };

  const bundle = buildOperationalStatusBundle({
    generatedAt: '2026-07-28T04:00:00.000Z',
    developmentProgress: progressReport(),
    pipelineStatus: pipelineStatus(),
    humanDecisionBrief: humanBrief(),
    sourceArtifacts: {
      developmentProgress: 'C:\\repo\\artifacts\\mold-master-development-progress-report.json',
      pipelineStatus: 'C:\\repo\\artifacts\\operational-hitl-pipeline-status.json',
      humanDecisionBrief: 'C:\\repo\\artifacts\\operational-hitl-human-decision-brief.json',
      reviewSessionPacket: 'C:\\repo\\artifacts\\operational-hitl-review-session-packet.json',
      worktableSuggestion: 'C:\\repo\\artifacts\\operational-hitl-decision-worktable-suggestion.json'
    },
    sourceArtifactPayloads: {
      reviewSessionPacket,
      worktableSuggestion
    }
  });

  assert.equal(bundle.summary.embeddedSnapshotCount, 5);
  assert.deepEqual(bundle.sourceArtifactSnapshots.map(snapshot => snapshot.key), [
    'developmentProgress',
    'pipelineStatus',
    'humanDecisionBrief',
    'reviewSessionPacket',
    'worktableSuggestion'
  ]);
  assert.equal(
    bundle.sourceArtifactSnapshots.find(snapshot => snapshot.key === 'developmentProgress').payload.summary.visionBlockers,
    8
  );
  assert.equal(
    bundle.sourceArtifactSnapshots.find(snapshot => snapshot.key === 'worktableSuggestion').payload.rows[0].decisionId,
    'conflict-001'
  );

  const restorable = extractRestorableStatusBundleArtifacts(bundle);
  assert.deepEqual(restorable.restoredKeys, [
    'developmentProgress',
    'pipelineStatus',
    'humanDecisionBrief',
    'reviewSessionPacket',
    'worktableSuggestion'
  ]);
  assert.equal(restorable.rejectedSnapshots.length, 0);
  assert.equal(restorable.artifacts.developmentProgress.contractVersion, 'mold-master-development-progress-report/v1');
  assert.equal(restorable.artifacts.worktableSuggestion.contractVersion, 'operational-hitl-decision-worktable-suggestion/v1');
});

test('embeds Vision capture work orders in the status bundle handoff', () => {
  const bundle = buildOperationalStatusBundle({
    generatedAt: '2026-07-28T04:00:00.000Z',
    developmentProgress: progressReport(),
    pipelineStatus: pipelineStatus(),
    humanDecisionBrief: humanBrief(),
    visionCaptureWorkOrderPlan: captureWorkOrderPlan(),
    sourceArtifacts: {
      developmentProgress: 'C:\\repo\\artifacts\\mold-master-development-progress-report.json',
      pipelineStatus: 'C:\\repo\\artifacts\\operational-hitl-pipeline-status.json',
      humanDecisionBrief: 'C:\\repo\\artifacts\\operational-hitl-human-decision-brief.json',
      visionCaptureWorkOrderPlan: 'C:\\repo\\artifacts\\vision-capture-work-order-plan.json'
    }
  });

  assert.equal(bundle.summary.visionCaptureWorkOrderStatus, 'capture_required');
  assert.equal(bundle.summary.visionCaptureWorkOrders, 7);
  assert.equal(bundle.summary.visionCaptureMissingApprovedSamples, 4);
  assert.equal(bundle.summary.visionCaptureRecaptureSamples, 10);
  assert.equal(bundle.summary.visionCaptureTopPriorityDefectClass, 'burn');
  assert.deepEqual(bundle.summary.visionCaptureCoreMissingViews, [
    { view: 'defect_closeup', count: 13 },
    { view: 'full_part_context', count: 13 }
  ]);
  assert.deepEqual(bundle.visionCaptureWorkOrderPreviews, [
    {
      defectClass: 'burn',
      actionType: 'capture_new_multiview_samples',
      priority: 105,
      missingApprovedSamples: 2,
      recaptureSampleCount: 0,
      requiredViews: ['full_part_context', 'defect_closeup', 'fill_end_context', 'vent_context']
    },
    {
      defectClass: 'sink',
      actionType: 'capture_new_and_recapture_existing_samples',
      priority: 98,
      missingApprovedSamples: 1,
      recaptureSampleCount: 1,
      requiredViews: ['full_part_context', 'defect_closeup', 'oblique_light', 'reverse_geometry']
    }
  ]);
  assert.ok(bundle.sourceArtifacts.some(item => item.key === 'visionCaptureWorkOrderPlan'));
  assert.equal(bundle.sourceArtifactSnapshots.at(-1).key, 'visionCaptureWorkOrderPlan');

  const restorable = extractRestorableStatusBundleArtifacts(bundle);
  assert.equal(restorable.artifacts.visionCaptureWorkOrderPlan.contractVersion, 'vision-capture-work-order-plan/v1');
  assert.ok(bundle.markdown.includes('Vision capture work orders'));
});

test('rejects unsupported or contract-mismatched status bundle snapshots', () => {
  const restorable = extractRestorableStatusBundleArtifacts({
    contractVersion: 'operational-status-bundle/v1',
    sourceArtifactSnapshots: [
      {
        key: 'developmentProgress',
        contractVersion: 'wrong/v1',
        payload: progressReport()
      },
      {
        key: 'humanDecisionBriefMarkdown',
        contractVersion: 'text/markdown',
        payload: '# brief'
      },
      {
        key: 'pipelineStatus',
        contractVersion: 'operational-hitl-pipeline-status/v1',
        payload: pipelineStatus()
      }
    ]
  });

  assert.deepEqual(restorable.restoredKeys, ['pipelineStatus']);
  assert.equal(restorable.artifacts.pipelineStatus.contractVersion, 'operational-hitl-pipeline-status/v1');
  assert.deepEqual(restorable.rejectedSnapshots.map(item => item.key), [
    'developmentProgress',
    'humanDecisionBriefMarkdown'
  ]);
});
