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
    webCards: 43,
    webTargetCards: 40,
    webCommonAgentValidationPassed: 43,
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

const postImportPipelineStatus = () => ({
  ...pipelineStatus(),
  currentStage: {
    code: 'execute_post_import_validation',
    titleKo: 'Post-import validation evidence capture'
  },
  summary: {
    ...pipelineStatus().summary,
    postImportValidationCases: 44,
    postImportValidationObservationStatus: 'partial_observations_collected',
    postImportGraphExecutableCases: 40,
    postImportGraphCapturedCases: 40,
    postImportGraphFailedCases: 1,
    postImportManualObservationRequiredCases: 4,
    postImportManualObservationTemplateStatus: 'ready_for_manual_observation',
    postImportManualObservationRows: 4,
    postImportValidationEvidenceStatus: 'partial_evidence_collected',
    postImportValidationObservedEvidenceCases: 40,
    postImportValidationEvidenceMissingCases: 4,
    postImportValidationResultStatus: 'awaiting_validation_evidence',
    postImportValidationPassedCases: 0,
    postImportValidationFailedCases: 0,
    postImportValidationPassRate: 0
  }
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

const labelConflictReviewGuide = () => ({
  contractVersion: 'vision-approved-label-conflict-review-guide/v1',
  status: 'action_required',
  serviceWritesPerformed: false,
  summary: {
    conflicts: 4,
    evidenceCases: 5,
    manifestUnlistedCases: 1,
    captureProtocolRiskCases: 5
  },
  items: [
    {
      conflictId: 'conflict-001',
      riskFlags: [
        'same_hash_multi_label',
        'capture_protocol_incomplete'
      ]
    }
  ]
});

const webKnowledgeCommonAgentPackage = (overrides = {}) => ({
  contractVersion: 'web-knowledge-common-agent-learning-package/v1',
  status: 'blocked_verification_not_ready',
  manualImportAllowed: false,
  readyForGraphRoundtripValidation: false,
  serviceWritesPerformed: false,
  summary: {
    approvedSourceRows: 0,
    nonApprovedRows: 0,
    packagedKnowledgeItems: 0,
    graphRoundtripCases: 0,
    targetCardCount: 40,
    approvedHitlCards: 0,
    centralIngestedCandidates: 0,
    centralApprovedDocuments: 0,
    ...(overrides.summary || {})
  },
  commonAgentReviewRequest: {
    requestedAction: 'complete_web_knowledge_hitl_gates',
    itemCount: 0,
    requiresHumanReview: true,
    allowGraphPromotion: false,
    allowReferenceLearning: false,
    allowModelTraining: false,
    ...(overrides.commonAgentReviewRequest || {})
  },
  recommendedAction: 'Complete Web HITL verification before Common Agent import.',
  ...overrides
});

const operationalPreparationRun = () => ({
  contractVersion: 'operational-hitl-preparation-run/v1',
  status: 'completed',
  serviceWritesPerformed: false,
  summary: {
    executedCommands: 6,
    failedCommands: 0,
    skippedHumanGatedCommands: 4,
    generatedArtifactCount: 9
  },
  generatedArtifacts: [
    'C:\\repo\\artifacts\\vision-approved-label-conflict-decisions-template.json',
    'C:\\repo\\artifacts\\vision-approved-label-conflict-review-guide.json',
    'C:\\repo\\artifacts\\vision-approved-label-conflict-review-guide.md',
    'C:\\repo\\artifacts\\common-agent-hitl-review-decisions-template.json',
    'C:\\repo\\artifacts\\vision-pending-hitl-review-guide.json',
    'C:\\repo\\artifacts\\common-agent-web-knowledge-hitl-decisions-template.json',
    'C:\\repo\\artifacts\\web-knowledge-hitl-review-guide.json',
    'C:\\repo\\artifacts\\web-knowledge-hitl-review-guide.md',
    'C:\\repo\\artifacts\\web-knowledge-hitl-review-guide.csv'
  ],
  executedCommands: [
    {
      command: 'npm run knowledge:web:hitl:review-guide',
      script: 'knowledge:web:hitl:review-guide',
      status: 'completed',
      outputPath: 'C:\\repo\\artifacts\\web-knowledge-hitl-review-guide.json',
      companionOutputPaths: [
        'C:\\repo\\artifacts\\web-knowledge-hitl-review-guide.md',
        'C:\\repo\\artifacts\\web-knowledge-hitl-review-guide.csv'
      ]
    }
  ],
  skippedCommands: [
    {
      command: 'npm run vision:label-conflicts:verify-decisions -- --decisions <filled.json>',
      reason: 'human_decision_required'
    },
    {
      command: 'npm run vision:hitl:verify-decisions -- --decisions <filled.json>',
      reason: 'human_decision_required'
    },
    {
      command: 'npm run knowledge:web:hitl:verify-decisions -- --decisions <filled.json>',
      reason: 'human_decision_required'
    },
    {
      command: 'npm run knowledge:web:hitl:apply -- --decisions <verified.json> --apply',
      reason: 'human_decision_required'
    }
  ],
  recommendedAction: '준비 artifact 생성이 끝났습니다. 사람이 decision file을 채운 뒤 verify-decisions로 검증하세요.'
});

const decisionInputReviewPacket = () => ({
  contractVersion: 'operational-hitl-decision-input-review-packet/v1',
  status: 'awaiting_human_input',
  serviceWritesPerformed: false,
  summary: {
    totalTemplateItems: 59,
    totalPendingActions: 59,
    targetDecisionInputsMissing: 56,
    firstQueueCode: 'vision_label_conflicts',
    sectionCount: 3
  },
  sections: [
    {
      queueCode: 'vision_label_conflicts',
      titleKo: '라벨 충돌 판정',
      owner: 'quality_hitl',
      preparedDecisionItems: 4,
      targetPending: 4,
      pendingActions: 4,
      verificationCommand: 'npm run vision:label-conflicts:verify-decisions -- --decisions <filled-vision-label-conflict-decisions.json>',
      sourceArtifact: 'C:\\repo\\artifacts\\vision-approved-label-conflict-decisions-template.json'
    },
    {
      queueCode: 'vision_pending_hitl',
      titleKo: 'Vision pending HITL 판정',
      owner: 'quality_hitl',
      preparedDecisionItems: 12,
      targetPending: 12,
      pendingActions: 12,
      verificationCommand: 'npm run vision:hitl:verify-decisions -- --decisions <filled-common-agent-hitl-decisions.json>',
      sourceArtifact: 'C:\\repo\\artifacts\\common-agent-hitl-review-decisions-template.json'
    },
    {
      queueCode: 'web_knowledge_hitl',
      titleKo: 'Web Knowledge HITL 승인',
      owner: 'knowledge_owner',
      preparedDecisionItems: 43,
      targetPending: 40,
      pendingActions: 43,
      verificationCommand: 'npm run knowledge:web:hitl:verify-decisions -- --decisions <filled-web-knowledge-hitl-decisions.json>',
      sourceArtifact: 'C:\\repo\\artifacts\\common-agent-web-knowledge-hitl-decisions-template.json'
    }
  ],
  humanGatedCommands: [
    'npm run vision:label-conflicts:verify-decisions -- --decisions <filled-vision-label-conflict-decisions.json>',
    'npm run vision:hitl:verify-decisions -- --decisions <filled-common-agent-hitl-decisions.json>',
    'npm run knowledge:web:hitl:verify-decisions -- --decisions <filled-web-knowledge-hitl-decisions.json>'
  ],
  recommendedAction: 'vision_label_conflicts부터 decision file을 채우고 검증하세요.'
});

const reviewerWorksheet = () => ({
  contractVersion: 'operational-hitl-reviewer-worksheet/v1',
  status: 'ready_for_human_review',
  serviceWritesPerformed: false,
  summary: {
    sourceStatus: 'awaiting_human_input',
    totalTemplateItems: 59,
    totalPendingActions: 59,
    targetDecisionInputsMissing: 56,
    firstQueueCode: 'vision_label_conflicts',
    nextReviewQueueCode: 'vision_label_conflicts',
    nextReviewDecisionId: 'conflict-001',
    nextReviewSourceArtifact: 'C:\\repo\\artifacts\\vision-approved-label-conflict-decisions-template.json',
    nextReviewVerificationCommand: 'npm run vision:label-conflicts:verify-decisions -- --decisions <filled-vision-label-conflict-decisions.json>',
    worksheetSectionCount: 3,
    markdownLineCount: 83
  },
  nextReviewCursor: {
    queueCode: 'vision_label_conflicts',
    decisionId: 'conflict-001',
    sourceArtifact: 'C:\\repo\\artifacts\\vision-approved-label-conflict-decisions-template.json',
    verificationCommand: 'npm run vision:label-conflicts:verify-decisions -- --decisions <filled-vision-label-conflict-decisions.json>'
  },
  markdownPath: 'C:\\repo\\artifacts\\operational-hitl-reviewer-worksheet.md',
  sources: {
    inputReviewPacket: 'C:\\repo\\artifacts\\operational-hitl-decision-input-review-packet.json'
  },
  recommendedAction: 'vision_label_conflicts부터 워크시트 순서대로 decision file을 채우고 검증 명령을 실행하세요.'
});

test('builds an artifact-only operational status bundle for handoff and Settings import', () => {
  const bundle = buildOperationalStatusBundle({
    generatedAt: '2026-07-28T04:00:00.000Z',
    developmentProgress: progressReport(),
    pipelineStatus: pipelineStatus(),
    humanDecisionBrief: humanBrief(),
    labelConflictReviewGuide: labelConflictReviewGuide(),
    webKnowledgeCommonAgentPackage: webKnowledgeCommonAgentPackage(),
    operationalPreparationRun: operationalPreparationRun(),
    operationalDecisionInputReviewPacket: decisionInputReviewPacket(),
    operationalReviewerWorksheet: reviewerWorksheet(),
    sourceArtifacts: {
      developmentProgress: 'C:\\repo\\artifacts\\mold-master-development-progress-report.json',
      pipelineStatus: 'C:\\repo\\artifacts\\operational-hitl-pipeline-status.json',
      humanDecisionBrief: 'C:\\repo\\artifacts\\operational-hitl-human-decision-brief.json',
      humanDecisionBriefMarkdown: 'C:\\repo\\artifacts\\operational-hitl-human-decision-brief.md',
      reviewSessionPacket: 'C:\\repo\\artifacts\\operational-hitl-review-session-packet.json',
      labelConflictReviewGuide: 'C:\\repo\\artifacts\\vision-approved-label-conflict-review-guide.json',
      labelConflictReviewGuideMarkdown: 'C:\\repo\\artifacts\\vision-approved-label-conflict-review-guide.md',
      webKnowledgeCommonAgentPackage: 'C:\\repo\\artifacts\\web-knowledge-common-agent-learning-package.json',
      operationalPreparationRun: 'C:\\repo\\artifacts\\operational-hitl-preparation-run.json',
      operationalDecisionInputReviewPacket: 'C:\\repo\\artifacts\\operational-hitl-decision-input-review-packet.json',
      operationalReviewerWorksheet: 'C:\\repo\\artifacts\\operational-hitl-reviewer-worksheet.json',
      operationalReviewerWorksheetMarkdown: 'C:\\repo\\artifacts\\operational-hitl-reviewer-worksheet.md'
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
  assert.equal(bundle.summary.webCards, 43);
  assert.equal(bundle.summary.webTargetCards, 40);
  assert.equal(bundle.summary.webCommonAgentValidationPassed, 43);
  assert.equal(bundle.summary.webHitlApprovalsMissing, 40);
  assert.equal(bundle.summary.webCentralApprovalsMissing, 40);
  assert.equal(bundle.summary.visionTop1Accuracy, 46.2);
  assert.equal(bundle.summary.nextSessionCode, 'label_conflict_session');
  assert.equal(bundle.summary.nextDecisionId, 'conflict-001');
  assert.equal(bundle.summary.worktableCsvPath, 'C:\\repo\\artifacts\\operational-hitl-decision-worktable-export.csv');
  assert.equal(bundle.summary.labelConflictGuideConflicts, 4);
  assert.equal(bundle.summary.labelConflictGuideEvidenceCases, 5);
  assert.equal(bundle.summary.labelConflictGuideCaptureProtocolRiskCases, 5);
  assert.equal(bundle.summary.labelConflictGuideFirstConflictId, 'conflict-001');
  assert.deepEqual(bundle.summary.labelConflictGuideFirstRiskFlags, [
    'same_hash_multi_label',
    'capture_protocol_incomplete'
  ]);
  assert.equal(
    bundle.summary.labelConflictGuideMarkdownPath,
    'C:\\repo\\artifacts\\vision-approved-label-conflict-review-guide.md'
  );
  assert.equal(bundle.summary.webKnowledgePackageStatus, 'blocked_verification_not_ready');
  assert.equal(bundle.summary.webKnowledgePackageApprovedRows, 0);
  assert.equal(bundle.summary.webKnowledgePackageItems, 0);
  assert.equal(bundle.summary.webKnowledgeGraphRoundtripCases, 0);
  assert.equal(bundle.summary.webKnowledgeManualImportAllowed, false);
  assert.equal(bundle.summary.webKnowledgeReadyForGraphRoundtrip, false);
  assert.equal(bundle.summary.webKnowledgeCommonAgentRequestedAction, 'complete_web_knowledge_hitl_gates');
  assert.equal(
    bundle.summary.webKnowledgePackagePath,
    'C:\\repo\\artifacts\\web-knowledge-common-agent-learning-package.json'
  );
  assert.equal(bundle.summary.preparationRunStatus, 'completed');
  assert.equal(bundle.summary.preparationGeneratedArtifacts, 9);
  assert.equal(bundle.summary.preparationWorksheetArtifacts, 2);
  assert.equal(bundle.summary.preparationDecisionTemplates, 3);
  assert.equal(bundle.summary.preparationHumanGatedCommands, 4);
  assert.equal(bundle.summary.preparationSkippedHumanGatedCommands, 4);
  assert.equal(bundle.summary.preparationFirstHumanGatedCommand, 'npm run vision:label-conflicts:verify-decisions -- --decisions <filled.json>');
  assert.equal(bundle.summary.preparationRunPath, 'C:\\repo\\artifacts\\operational-hitl-preparation-run.json');
  assert.equal(bundle.summary.decisionReviewPacketStatus, 'awaiting_human_input');
  assert.equal(bundle.summary.decisionReviewTotalTemplateItems, 59);
  assert.equal(bundle.summary.decisionReviewTotalPendingActions, 59);
  assert.equal(bundle.summary.decisionReviewTargetInputsMissing, 56);
  assert.equal(bundle.summary.decisionReviewFirstQueueCode, 'vision_label_conflicts');
  assert.equal(bundle.summary.decisionReviewSectionCount, 3);
  assert.equal(bundle.summary.decisionReviewHumanGatedCommands, 3);
  assert.equal(bundle.summary.decisionReviewPacketPath, 'C:\\repo\\artifacts\\operational-hitl-decision-input-review-packet.json');
  assert.equal(bundle.summary.reviewerWorksheetStatus, 'ready_for_human_review');
  assert.equal(bundle.summary.reviewerWorksheetTargetInputsMissing, 56);
  assert.equal(bundle.summary.reviewerWorksheetFirstQueueCode, 'vision_label_conflicts');
  assert.equal(bundle.summary.reviewerWorksheetNextReviewQueueCode, 'vision_label_conflicts');
  assert.equal(bundle.summary.reviewerWorksheetNextReviewDecisionId, 'conflict-001');
  assert.equal(bundle.summary.reviewerWorksheetNextReviewSourceArtifact, 'C:\\repo\\artifacts\\vision-approved-label-conflict-decisions-template.json');
  assert.equal(bundle.summary.reviewerWorksheetNextReviewVerificationCommand, 'npm run vision:label-conflicts:verify-decisions -- --decisions <filled-vision-label-conflict-decisions.json>');
  assert.equal(bundle.summary.reviewerWorksheetSectionCount, 3);
  assert.equal(bundle.summary.reviewerWorksheetMarkdownLineCount, 83);
  assert.equal(bundle.summary.reviewerWorksheetPath, 'C:\\repo\\artifacts\\operational-hitl-reviewer-worksheet.json');
  assert.equal(bundle.summary.reviewerWorksheetMarkdownPath, 'C:\\repo\\artifacts\\operational-hitl-reviewer-worksheet.md');
  assert.deepEqual(bundle.preparationDecisionTemplateArtifacts, [
    'C:\\repo\\artifacts\\vision-approved-label-conflict-decisions-template.json',
    'C:\\repo\\artifacts\\common-agent-hitl-review-decisions-template.json',
    'C:\\repo\\artifacts\\common-agent-web-knowledge-hitl-decisions-template.json'
  ]);
  assert.deepEqual(bundle.preparationWorksheetArtifacts, [
    'C:\\repo\\artifacts\\web-knowledge-hitl-review-guide.md',
    'C:\\repo\\artifacts\\web-knowledge-hitl-review-guide.csv'
  ]);
  assert.deepEqual(bundle.preparationHumanGatedCommands.map(item => item.command), [
    'npm run vision:label-conflicts:verify-decisions -- --decisions <filled.json>',
    'npm run vision:hitl:verify-decisions -- --decisions <filled.json>',
    'npm run knowledge:web:hitl:verify-decisions -- --decisions <filled.json>',
    'npm run knowledge:web:hitl:apply -- --decisions <verified.json> --apply'
  ]);
  assert.deepEqual(bundle.decisionReviewSectionPreviews.map(section => [
    section.queueCode,
    section.preparedDecisionItems,
    section.pendingActions,
    section.targetPending
  ]), [
    ['vision_label_conflicts', 4, 4, 4],
    ['vision_pending_hitl', 12, 12, 12],
    ['web_knowledge_hitl', 43, 43, 40]
  ]);
  assert.deepEqual(bundle.settingsImportChecklist.map(item => item.buttonLabelKo), [
    'Progress 등록',
    'Pipeline Status 등록',
    'Human Brief 등록',
    'Session Packet 등록',
    'Web Knowledge Package 등록'
  ]);
  assert.deepEqual(bundle.nextOperatorActions.map(action => action.code), [
    'register_status_artifacts_in_settings',
    'open_preparation_run_outputs',
    'open_reviewer_worksheet',
    'open_label_conflict_review_guide',
    'open_web_knowledge_common_agent_package',
    'open_next_human_brief',
    'fill_original_worktable_csv',
    'dry_run_import_and_refresh_status'
  ]);
  assert.equal(bundle.sessionPointers[0].code, 'label_conflict_session');
  assert.equal(bundle.sessionPointers[0].firstDecisionId, 'conflict-001');
  assert.match(bundle.markdown, /Operational Status Bundle/);
  assert.match(bundle.markdown, /소프트웨어 100%/);
  assert.match(bundle.markdown, /Web cases: 43\/40/);
  assert.match(bundle.markdown, /Label conflict guide: 4 conflicts/);
  assert.match(bundle.markdown, /Web Knowledge package: blocked_verification_not_ready/);
  assert.match(bundle.markdown, /Preparation run: completed \/ generated 9 \/ worksheets 2/);
  assert.match(bundle.markdown, /Decision review: awaiting_human_input \/ pending 59 \/ missing 56/);
  assert.match(bundle.markdown, /Reviewer worksheet: ready_for_human_review \/ missing 56 \/ lines 83/);
  assert.match(bundle.markdown, /operational-hitl-reviewer-worksheet\.md/);
  assert.match(bundle.markdown, /vision_label_conflicts: prepared 4 \/ pending 4 \/ target 4/);
  assert.match(bundle.markdown, /operational-hitl-decision-input-review-packet\.json/);
  assert.match(bundle.markdown, /common-agent-hitl-review-decisions-template\.json/);
  assert.match(bundle.markdown, /knowledge:web:hitl:verify-decisions/);
  assert.match(bundle.markdown, /web-knowledge-hitl-review-guide\.csv/);
  assert.match(bundle.markdown, /web-knowledge-common-agent-learning-package\.json/);
  assert.match(bundle.markdown, /vision-approved-label-conflict-review-guide\.md/);
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
      worktableSuggestion: 'C:\\repo\\artifacts\\operational-hitl-decision-worktable-suggestion.json',
      labelConflictReviewGuide: 'C:\\repo\\artifacts\\vision-approved-label-conflict-review-guide.json',
      webKnowledgeCommonAgentPackage: 'C:\\repo\\artifacts\\web-knowledge-common-agent-learning-package.json',
      operationalDecisionInputReviewPacket: 'C:\\repo\\artifacts\\operational-hitl-decision-input-review-packet.json',
      operationalReviewerWorksheet: 'C:\\repo\\artifacts\\operational-hitl-reviewer-worksheet.json'
    },
    sourceArtifactPayloads: {
      reviewSessionPacket,
      worktableSuggestion,
      labelConflictReviewGuide: labelConflictReviewGuide(),
      webKnowledgeCommonAgentPackage: webKnowledgeCommonAgentPackage({
        status: 'ready_for_common_agent_manual_import',
        manualImportAllowed: true,
        summary: {
          approvedSourceRows: 40,
          nonApprovedRows: 3,
          packagedKnowledgeItems: 40,
          graphRoundtripCases: 40
        },
        commonAgentReviewRequest: {
          requestedAction: 'manual_candidate_import_review',
          itemCount: 40
        }
      }),
      operationalDecisionInputReviewPacket: decisionInputReviewPacket(),
      operationalReviewerWorksheet: reviewerWorksheet()
    }
  });

  assert.equal(bundle.summary.embeddedSnapshotCount, 9);
  assert.deepEqual(bundle.sourceArtifactSnapshots.map(snapshot => snapshot.key), [
    'developmentProgress',
    'pipelineStatus',
    'humanDecisionBrief',
    'reviewSessionPacket',
    'worktableSuggestion',
    'labelConflictReviewGuide',
    'webKnowledgeCommonAgentPackage',
    'operationalDecisionInputReviewPacket',
    'operationalReviewerWorksheet'
  ]);
  assert.equal(
    bundle.sourceArtifactSnapshots.find(snapshot => snapshot.key === 'developmentProgress').payload.summary.visionBlockers,
    8
  );
  assert.equal(
    bundle.sourceArtifactSnapshots.find(snapshot => snapshot.key === 'worktableSuggestion').payload.rows[0].decisionId,
    'conflict-001'
  );
  assert.equal(
    bundle.sourceArtifactSnapshots.find(snapshot => snapshot.key === 'labelConflictReviewGuide').payload.summary.conflicts,
    4
  );
  assert.equal(
    bundle.sourceArtifactSnapshots.find(snapshot => snapshot.key === 'webKnowledgeCommonAgentPackage').payload.summary.packagedKnowledgeItems,
    40
  );
  assert.equal(
    bundle.sourceArtifactSnapshots.find(snapshot => snapshot.key === 'operationalDecisionInputReviewPacket').payload.summary.targetDecisionInputsMissing,
    56
  );
  assert.equal(
    bundle.sourceArtifactSnapshots.find(snapshot => snapshot.key === 'operationalReviewerWorksheet').payload.summary.markdownLineCount,
    83
  );

  const restorable = extractRestorableStatusBundleArtifacts(bundle);
  assert.deepEqual(restorable.restoredKeys, [
    'developmentProgress',
    'pipelineStatus',
    'humanDecisionBrief',
    'reviewSessionPacket',
    'worktableSuggestion',
    'labelConflictReviewGuide',
    'webKnowledgeCommonAgentPackage',
    'operationalDecisionInputReviewPacket',
    'operationalReviewerWorksheet'
  ]);
  assert.equal(restorable.rejectedSnapshots.length, 0);
  assert.equal(restorable.artifacts.developmentProgress.contractVersion, 'mold-master-development-progress-report/v1');
  assert.equal(restorable.artifacts.worktableSuggestion.contractVersion, 'operational-hitl-decision-worktable-suggestion/v1');
  assert.equal(restorable.artifacts.labelConflictReviewGuide.contractVersion, 'vision-approved-label-conflict-review-guide/v1');
  assert.equal(restorable.artifacts.webKnowledgeCommonAgentPackage.contractVersion, 'web-knowledge-common-agent-learning-package/v1');
  assert.equal(restorable.artifacts.operationalDecisionInputReviewPacket.contractVersion, 'operational-hitl-decision-input-review-packet/v1');
  assert.equal(restorable.artifacts.operationalReviewerWorksheet.contractVersion, 'operational-hitl-reviewer-worksheet/v1');
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

test('surfaces post-import validation status in the one-file operational bundle', () => {
  const bundle = buildOperationalStatusBundle({
    generatedAt: '2026-07-28T05:25:00.000Z',
    developmentProgress: progressReport(),
    pipelineStatus: postImportPipelineStatus(),
    humanDecisionBrief: humanBrief(),
    sourceArtifacts: {
      developmentProgress: 'C:\\repo\\artifacts\\mold-master-development-progress-report.json',
      pipelineStatus: 'C:\\repo\\artifacts\\operational-hitl-pipeline-status.json',
      humanDecisionBrief: 'C:\\repo\\artifacts\\operational-hitl-human-decision-brief.json'
    }
  });

  assert.equal(bundle.summary.currentPipelineStageCode, 'execute_post_import_validation');
  assert.equal(bundle.summary.postImportValidationCases, 44);
  assert.equal(bundle.summary.postImportValidationObservationStatus, 'partial_observations_collected');
  assert.equal(bundle.summary.postImportGraphExecutableCases, 40);
  assert.equal(bundle.summary.postImportGraphCapturedCases, 40);
  assert.equal(bundle.summary.postImportGraphFailedCases, 1);
  assert.equal(bundle.summary.postImportManualObservationRequiredCases, 4);
  assert.equal(bundle.summary.postImportManualObservationTemplateStatus, 'ready_for_manual_observation');
  assert.equal(bundle.summary.postImportManualObservationRows, 4);
  assert.equal(bundle.summary.postImportValidationEvidenceStatus, 'partial_evidence_collected');
  assert.equal(bundle.summary.postImportValidationObservedEvidenceCases, 40);
  assert.equal(bundle.summary.postImportValidationEvidenceMissingCases, 4);
  assert.equal(bundle.summary.postImportValidationResultStatus, 'awaiting_validation_evidence');
  assert.match(bundle.markdown, /Post-import cases: 44/);
  assert.match(bundle.markdown, /Graph observations: 40\/40/);
  assert.match(bundle.markdown, /Manual observations: 4/);
  assert.match(bundle.markdown, /Evidence: 40\/44/);
  assert.match(bundle.markdown, /Validation result: awaiting_validation_evidence/);
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
