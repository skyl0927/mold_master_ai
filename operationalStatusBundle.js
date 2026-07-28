const asArray = value => Array.isArray(value) ? value : [];

const compact = value => String(value || '').replace(/\s+/g, ' ').trim();

const numberValue = value => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const isContract = (artifact, contractVersion) =>
  artifact?.contractVersion === contractVersion;

const policy = () => ({
  requiresHumanReview: true,
  artifactOnly: true,
  automaticServiceWritesAllowed: false,
  autoApplyAllowed: false,
  allowGraphPromotion: false,
  allowReferenceLearning: false,
  allowModelTraining: false
});

const requiredMissing = ({
  developmentProgress,
  pipelineStatus,
  humanDecisionBrief
}) => [
  !isContract(developmentProgress, 'mold-master-development-progress-report/v1')
    ? 'developmentProgress'
    : null,
  !isContract(pipelineStatus, 'operational-hitl-pipeline-status/v1')
    ? 'pipelineStatus'
    : null,
  !isContract(humanDecisionBrief, 'operational-hitl-human-decision-brief/v1')
    ? 'humanDecisionBrief'
    : null
].filter(Boolean);

const statusFor = ({ developmentProgress, pipelineStatus, humanDecisionBrief }) => {
  if (compact(humanDecisionBrief?.status) === 'fix_invalid_human_entries') {
    return 'fix_invalid_human_entries';
  }
  if (compact(humanDecisionBrief?.status) === 'ready_for_worktable_apply') {
    return 'ready_for_worktable_apply';
  }
  if (
    compact(humanDecisionBrief?.status) === 'ready_for_human_entry'
    || compact(pipelineStatus?.currentStage?.code) === 'awaiting_human_csv_decisions'
  ) {
    return 'awaiting_human_hitl';
  }
  if (compact(developmentProgress?.status) === 'ready_for_operator_review') {
    return 'ready_for_operator_review';
  }
  return compact(developmentProgress?.status) || compact(pipelineStatus?.status) || 'action_required';
};

const statusLabelKoFor = status => ({
  missing_evidence: '필수 운영 증거 재생성 필요',
  awaiting_human_hitl: '사람 HITL 판정 입력 대기',
  fix_invalid_human_entries: '사람 입력 오류 수정 필요',
  ready_for_worktable_apply: '작업표 반영 승인 대기',
  ready_for_operator_review: '운영자 릴리스 검토 준비',
  action_required: '운영 전환 조치 필요'
}[status] || compact(status));

const sourceArtifactListFor = sourceArtifacts => [
  {
    key: 'developmentProgress',
    labelKo: '개발 진행률',
    contractVersion: 'mold-master-development-progress-report/v1',
    path: compact(sourceArtifacts.developmentProgress)
  },
  {
    key: 'pipelineStatus',
    labelKo: 'HITL 파이프라인 상태',
    contractVersion: 'operational-hitl-pipeline-status/v1',
    path: compact(sourceArtifacts.pipelineStatus)
  },
  {
    key: 'humanDecisionBrief',
    labelKo: '사람 판정 브리프',
    contractVersion: 'operational-hitl-human-decision-brief/v1',
    path: compact(sourceArtifacts.humanDecisionBrief)
  },
  {
    key: 'humanDecisionBriefMarkdown',
    labelKo: '사람 판정 브리프 Markdown',
    contractVersion: 'text/markdown',
    path: compact(sourceArtifacts.humanDecisionBriefMarkdown)
  },
  {
    key: 'reviewSessionPacket',
    labelKo: '세션 검토 패킷',
    contractVersion: 'operational-hitl-review-session-packet/v1',
    path: compact(sourceArtifacts.reviewSessionPacket)
  },
  {
    key: 'worktableSuggestion',
    labelKo: '작업표 추천',
    contractVersion: 'operational-hitl-decision-worktable-suggestion/v1',
    path: compact(sourceArtifacts.worktableSuggestion)
  }
].filter(item => item.path);

const settingsImportChecklistFor = sourceArtifacts => [
  {
    buttonLabelKo: 'Progress 등록',
    artifactKey: 'developmentProgress',
    artifactPath: compact(sourceArtifacts.developmentProgress),
    contractVersion: 'mold-master-development-progress-report/v1'
  },
  {
    buttonLabelKo: 'Pipeline Status 등록',
    artifactKey: 'pipelineStatus',
    artifactPath: compact(sourceArtifacts.pipelineStatus),
    contractVersion: 'operational-hitl-pipeline-status/v1'
  },
  {
    buttonLabelKo: 'Human Brief 등록',
    artifactKey: 'humanDecisionBrief',
    artifactPath: compact(sourceArtifacts.humanDecisionBrief),
    contractVersion: 'operational-hitl-human-decision-brief/v1'
  },
  {
    buttonLabelKo: 'Session Packet 등록',
    artifactKey: 'reviewSessionPacket',
    artifactPath: compact(sourceArtifacts.reviewSessionPacket),
    contractVersion: 'operational-hitl-review-session-packet/v1'
  },
  {
    buttonLabelKo: 'Suggestion 등록',
    artifactKey: 'worktableSuggestion',
    artifactPath: compact(sourceArtifacts.worktableSuggestion),
    contractVersion: 'operational-hitl-decision-worktable-suggestion/v1'
  }
].filter(item => item.artifactPath);

const sessionPointersFor = humanDecisionBrief =>
  asArray(humanDecisionBrief?.sessions).map(session => ({
    code: compact(session?.code),
    titleKo: compact(session?.titleKo),
    priority: numberValue(session?.priority),
    pendingRows: numberValue(session?.pendingRows),
    invalidRows: numberValue(session?.invalidRows),
    highRiskRows: numberValue(session?.highRiskRows),
    markdownPath: compact(session?.markdownPath),
    csvPath: compact(session?.csvPath),
    firstDecisionId: compact(session?.nextRows?.[0]?.decisionId),
    firstDisplayLabel: compact(session?.nextRows?.[0]?.displayLabel),
    firstRecommendedAction: compact(session?.nextRows?.[0]?.recommendedNewAction),
    firstRisk: compact(session?.nextRows?.[0]?.recommendationRisk)
  }));

const nextOperatorActionsFor = ({ sourceArtifacts, humanDecisionBrief }) => [
  {
    code: 'register_status_artifacts_in_settings',
    titleKo: 'Settings 운영 artifact 등록',
    instructionKo: 'Settings의 Progress/Pipeline Status/Human Brief/Session Packet 버튼에 최신 JSON을 등록하세요.',
    buttonLabelsKo: settingsImportChecklistFor(sourceArtifacts).map(item => item.buttonLabelKo)
  },
  {
    code: 'open_next_human_brief',
    titleKo: '다음 HITL 브리프 열기',
    instructionKo: sourceArtifacts.humanDecisionBriefMarkdown
      ? `${sourceArtifacts.humanDecisionBriefMarkdown} 파일을 열어 다음 세션과 근거를 확인하세요.`
      : '최신 operational-hitl-human-decision-brief Markdown을 열어 다음 세션과 근거를 확인하세요.',
    path: compact(sourceArtifacts.humanDecisionBriefMarkdown || sourceArtifacts.humanDecisionBrief)
  },
  {
    code: 'fill_original_worktable_csv',
    titleKo: '원본 worktable CSV 입력',
    instructionKo: compact(humanDecisionBrief?.worktableCsvPath)
      ? `${humanDecisionBrief.worktableCsvPath} 파일에 사람이 확인한 newAction/reviewer/decidedAt/reviewComment를 입력하세요.`
      : '원본 worktable CSV에 사람이 확인한 newAction/reviewer/decidedAt/reviewComment를 입력하세요.',
    path: compact(humanDecisionBrief?.worktableCsvPath)
  },
  {
    code: 'dry_run_import_and_refresh_status',
    titleKo: '입력 검증 및 상태 갱신',
    instructionKo: 'CSV 입력 후 dry-run import, session progress, pipeline status, progress report, human brief를 순서대로 갱신하세요.',
    commands: [
      'npm run operational:hitl:worktable-import',
      'npm run operational:hitl:session-progress',
      'npm run operational:hitl:pipeline-status',
      'npm run operational:progress',
      'npm run operational:hitl:human-brief'
    ]
  }
];

const missingEvidenceBundle = ({ generatedAt, sourceArtifacts, missingArtifactNames }) => ({
  schemaVersion: 1,
  contractVersion: 'operational-status-bundle/v1',
  generatedAt,
  sourceSystem: 'mold-master-ai',
  targetSystem: 'operator_common_agent',
  status: 'missing_evidence',
  statusLabelKo: statusLabelKoFor('missing_evidence'),
  serviceWritesPerformed: false,
  localArtifactsWritten: true,
  policy: policy(),
  summary: {
    missingArtifacts: missingArtifactNames.length,
    missingArtifactNames
  },
  sourceArtifacts: sourceArtifactListFor(sourceArtifacts),
  settingsImportChecklist: [],
  nextOperatorActions: [
    {
      code: 'regenerate_status_evidence',
      titleKo: '운영 상태 증거 재생성',
      instructionKo: '필수 status bundle 입력 artifact를 먼저 생성하세요.',
      commands: [
        'npm run operational:progress',
        'npm run operational:hitl:pipeline-status',
        'npm run operational:hitl:human-brief'
      ]
    }
  ],
  sessionPointers: [],
  recommendedAction: 'npm run operational:progress, npm run operational:hitl:pipeline-status, npm run operational:hitl:human-brief를 실행해 필수 증거를 재생성하세요.',
  markdown: ''
});

const markdownFor = bundle => {
  const lines = [
    '# Operational Status Bundle',
    '',
    `- 생성 시각: ${bundle.generatedAt}`,
    `- 상태: ${bundle.statusLabelKo} (${bundle.status})`,
    `- 현재 단계: ${bundle.summary.currentPhaseKo || '확인 필요'}`,
    `- 파이프라인: ${bundle.summary.currentPipelineStageKo || '확인 필요'}`,
    `- 소프트웨어 ${bundle.summary.softwareScaffoldPercent}% / 운영 ${bundle.summary.operationalProgressPercent}%`,
    `- HITL 미입력: ${bundle.summary.hitlDecisionInputsMissing}건`,
    `- 대기 row: ${bundle.summary.pendingRows}건 / 고위험 row: ${bundle.summary.highRiskRows}건`,
    `- Web 승인대기: ${bundle.summary.webHitlApprovalsMissing}건`,
    `- Vision: Top-1 ${bundle.summary.visionTop1Accuracy}% / Top-3 ${bundle.summary.visionTop3Accuracy}%`,
    `- 다음 세션: ${bundle.summary.nextSessionCode || '없음'} / ${bundle.summary.nextDecisionId || '없음'}`,
    `- 원본 worktable CSV: ${bundle.summary.worktableCsvPath || '확인 필요'}`,
    '- 안전 정책: 자동 적용 금지, Graph/Reference/Model 승격 금지',
    '',
    '## Settings 등록 순서',
    ''
  ];

  bundle.settingsImportChecklist.forEach((item, index) => {
    lines.push(`${index + 1}. ${item.buttonLabelKo}: ${item.artifactPath}`);
  });

  lines.push('', '## 다음 작업', '');
  bundle.nextOperatorActions.forEach((action, index) => {
    lines.push(`${index + 1}. ${action.titleKo}: ${action.instructionKo}`);
    if (action.path) lines.push(`   - 경로: ${action.path}`);
    asArray(action.commands).forEach(command => lines.push(`   - ${command}`));
  });

  lines.push('', '## 세션 포인터', '');
  bundle.sessionPointers.forEach(session => {
    lines.push(`- P${session.priority} ${session.titleKo}: 대기 ${session.pendingRows}건, 고위험 ${session.highRiskRows}건, 첫 decision ${session.firstDecisionId}`);
    if (session.markdownPath) lines.push(`  - MD: ${session.markdownPath}`);
    if (session.csvPath) lines.push(`  - CSV: ${session.csvPath}`);
  });

  return `${lines.join('\n')}\n`;
};

const buildOperationalStatusBundle = ({
  generatedAt = new Date().toISOString(),
  developmentProgress = null,
  pipelineStatus = null,
  humanDecisionBrief = null,
  sourceArtifacts = {},
  markdownPath = null
} = {}) => {
  const missingArtifactNames = requiredMissing({
    developmentProgress,
    pipelineStatus,
    humanDecisionBrief
  });

  if (missingArtifactNames.length > 0) {
    return missingEvidenceBundle({
      generatedAt,
      sourceArtifacts,
      missingArtifactNames
    });
  }

  const status = statusFor({
    developmentProgress,
    pipelineStatus,
    humanDecisionBrief
  });
  const progressSummary = developmentProgress.summary || {};
  const humanSummary = humanDecisionBrief.summary || {};
  const bundle = {
    schemaVersion: 1,
    contractVersion: 'operational-status-bundle/v1',
    generatedAt,
    sourceSystem: 'mold-master-ai',
    targetSystem: 'operator_common_agent',
    status,
    statusLabelKo: statusLabelKoFor(status),
    serviceWritesPerformed: false,
    localArtifactsWritten: true,
    policy: policy(),
    summary: {
      missingArtifacts: 0,
      missingArtifactNames: [],
      currentPhaseCode: compact(developmentProgress.currentPhase?.code),
      currentPhaseKo: compact(developmentProgress.currentPhase?.titleKo),
      currentPipelineStageCode: compact(pipelineStatus.currentStage?.code),
      currentPipelineStageKo: compact(pipelineStatus.currentStage?.titleKo),
      softwareScaffoldPercent: numberValue(developmentProgress.progress?.software?.percent),
      operationalProgressPercent: numberValue(developmentProgress.progress?.operational?.percent),
      visionBlockers: numberValue(progressSummary.visionBlockers),
      visionTasks: numberValue(progressSummary.visionTasks),
      hitlDecisionInputsMissing: numberValue(progressSummary.operationalHitlDecisionInputsMissing),
      hitlFirstQueueCode: compact(progressSummary.operationalHitlFirstQueueCode),
      pendingRows: numberValue(humanSummary.pendingRows),
      completedRows: numberValue(humanSummary.completedRows),
      invalidRows: numberValue(humanSummary.invalidRows),
      highRiskRows: numberValue(humanSummary.highRiskRows),
      webHitlApprovalsMissing: numberValue(progressSummary.webHitlApprovalsMissing),
      webCentralApprovalsMissing: numberValue(progressSummary.webCentralApprovalsMissing),
      visionTop1Accuracy: numberValue(progressSummary.visionTop1Accuracy),
      visionTop3Accuracy: numberValue(progressSummary.visionTop3Accuracy),
      visionCaptureProtocolReadyRate: numberValue(progressSummary.visionCaptureProtocolReadyRate),
      visionAccuracyFirstTrackCode: compact(progressSummary.visionAccuracyFirstTrackCode),
      topPriorityTaskCode: compact(progressSummary.topPriorityTaskCode),
      nextSessionCode: compact(humanSummary.nextSessionCode),
      nextDecisionId: compact(humanSummary.nextDecisionId),
      worktableCsvPath: compact(humanDecisionBrief.worktableCsvPath)
    },
    progressFeedbackKo: asArray(developmentProgress.progressFeedbackKo).map(compact).filter(Boolean),
    sourceArtifacts: sourceArtifactListFor(sourceArtifacts),
    settingsImportChecklist: settingsImportChecklistFor(sourceArtifacts),
    nextOperatorActions: nextOperatorActionsFor({
      sourceArtifacts,
      humanDecisionBrief
    }),
    sessionPointers: sessionPointersFor(humanDecisionBrief),
    recommendedAction: compact(humanDecisionBrief.recommendedAction)
      || '다음 HITL 세션을 검토하고 원본 worktable CSV를 사람이 입력하세요.',
    markdownPath
  };

  return {
    ...bundle,
    markdown: markdownFor(bundle)
  };
};

module.exports = {
  buildOperationalStatusBundle
};
