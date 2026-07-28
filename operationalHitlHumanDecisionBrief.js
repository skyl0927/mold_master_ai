const asArray = value => Array.isArray(value) ? value : [];

const compact = value => String(value || '').replace(/\s+/g, ' ').trim();

const unique = values => [...new Set(asArray(values).map(compact).filter(Boolean))];

const numberValue = value => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const isContract = (artifact, contractVersion) =>
  artifact?.contractVersion === contractVersion;

const policy = () => ({
  requiresHumanReview: true,
  briefOnly: true,
  autoPopulateNewActionAllowed: false,
  autoVerifyAllowed: false,
  autoApplyAllowed: false,
  automaticServiceWritesAllowed: false,
  allowGraphPromotion: false,
  allowReferenceLearning: false,
  allowModelTraining: false
});

const packetIndexFor = reviewSessionPacket => {
  const packets = new Map();
  asArray(reviewSessionPacket?.packets).forEach(packet => {
    packets.set(compact(packet?.code), packet);
  });
  return packets;
};

const progressIndexFor = reviewSessionProgress => {
  const sessions = new Map();
  asArray(reviewSessionProgress?.sessions).forEach(session => {
    sessions.set(compact(session?.code), session);
  });
  return sessions;
};

const worktableCsvPathFor = pipelineStatus =>
  compact(pipelineStatus?.sources?.worktableCsv)
  || compact(pipelineStatus?.nextActions?.[0]?.worktableCsv)
  || null;

const copyableFieldText = field => {
  const column = compact(field?.worktableColumn);
  const value = compact(field?.value);
  return column && value ? `${column}=${value}` : '';
};

const briefCellText = value => {
  const text = compact(value);
  return text.length > 90
    ? `${text.slice(0, 87)}... (세션 패킷에서 전체 확인)`
    : text;
};

const rowBriefFor = row => ({
  queueCode: compact(row?.queueCode),
  decisionId: compact(row?.decisionId),
  displayLabel: compact(row?.displayLabel),
  recommendedNewAction: compact(row?.recommendedNewAction),
  recommendationRisk: compact(row?.recommendationRisk),
  recommendationReasonKo: compact(row?.recommendationReasonKo),
  requiredHumanChecksKo: compact(row?.requiredHumanChecksKo),
  copyableFields: unique(asArray(row?.copyableFields).map(copyableFieldText)),
  manualConfirmationFields: unique(row?.manualConfirmationFields),
  copyToWorktableInstructionKo: compact(row?.copyToWorktableInstructionKo),
  verificationCommand: compact(row?.verificationCommand)
});

const sessionBriefFor = ({ session, packet, progress }) => {
  const rows = asArray(session?.rows);
  const completedRows = progress ? numberValue(progress.completedRows) : 0;
  const invalidRows = progress ? numberValue(progress.invalidRows) : 0;
  const pendingRows = progress
    ? numberValue(progress.pendingRows)
    : rows.length;
  return {
    code: compact(session?.code),
    titleKo: compact(session?.titleKo),
    priority: numberValue(session?.priority),
    status: compact(progress?.status) || (rows.length > 0 ? 'awaiting_human_csv_decisions' : 'clear'),
    rowCount: rows.length,
    completedRows,
    pendingRows,
    invalidRows,
    highRiskRows: numberValue(session?.highRiskRows),
    guidanceKo: compact(session?.guidanceKo),
    csvPath: compact(packet?.csvPath),
    markdownPath: compact(packet?.markdownPath),
    nextRows: rows.slice(0, 5).map(rowBriefFor),
    verificationCommands: unique(rows.map(row => row?.verificationCommand))
  };
};

const chooseNextSession = sessions =>
  sessions.find(session => session.invalidRows > 0)
  || sessions.find(session => session.pendingRows > 0)
  || sessions.find(session => session.rowCount > 0)
  || null;

const statusFor = ({ missingArtifactNames, totalRows, pendingRows, invalidRows }) => {
  if (missingArtifactNames.length > 0) return 'missing_evidence';
  if (invalidRows > 0) return 'fix_invalid_human_entries';
  if (pendingRows > 0) return 'ready_for_human_entry';
  if (totalRows === 0) return 'clear';
  return 'ready_for_worktable_apply';
};

const recommendedActionFor = status => ({
  missing_evidence: '먼저 npm run operational:hitl:pipeline-status와 npm run operational:hitl:review-session-plan을 실행하세요.',
  fix_invalid_human_entries: '오류 row부터 원본 worktable CSV에서 수정한 뒤 npm run operational:hitl:worktable-import를 다시 실행하세요.',
  ready_for_human_entry: '다음 세션 패킷을 열고 원본 worktable CSV에 사람이 확인한 값만 입력하세요.',
  ready_for_worktable_apply: '모든 row가 dry-run에서 유효합니다. 사람이 계획을 확인한 뒤 worktable-import -- --apply를 실행하세요.',
  clear: '추가 HITL 입력 대상이 없습니다. pipeline-status를 갱신하세요.'
}[status] || 'HITL human decision brief 상태를 확인하세요.');

const operatorStepsFor = ({ nextSession, worktableCsvPath }) => [
  {
    code: 'open_session_packet',
    titleKo: '세션 패킷 열기',
    instructionKo: nextSession?.markdownPath
      ? `먼저 ${nextSession.markdownPath} 파일을 열어 검토 대상과 근거를 확인하세요.`
      : '먼저 review session packet Markdown/CSV를 열어 검토 대상과 근거를 확인하세요.',
    path: nextSession?.markdownPath || nextSession?.csvPath || null
  },
  {
    code: 'review_source_evidence',
    titleKo: '원본 근거 확인',
    instructionKo: '추천 action은 초안입니다. 원본 이미지, 문서 출처, 라벨, Graph/도메인 근거를 사람이 직접 확인하세요.'
  },
  {
    code: 'fill_original_worktable_csv',
    titleKo: '원본 worktable CSV 입력',
    instructionKo: worktableCsvPath
      ? `${worktableCsvPath} 파일에 newAction, reviewer, decidedAt, reviewComment, 필수 확인 필드를 입력하세요.`
      : '원본 worktable CSV에 newAction, reviewer, decidedAt, reviewComment, 필수 확인 필드를 입력하세요.',
    path: worktableCsvPath
  },
  {
    code: 'dry_run_import',
    titleKo: '입력 dry-run 검증',
    instructionKo: 'npm run operational:hitl:worktable-import를 실행해 적용 전 계획과 오류 row를 확인하세요.',
    command: 'npm run operational:hitl:worktable-import'
  },
  {
    code: 'refresh_progress',
    titleKo: '세션 진행률 갱신',
    instructionKo: 'npm run operational:hitl:session-progress와 npm run operational:hitl:pipeline-status를 실행해 다음 병목을 갱신하세요.',
    command: 'npm run operational:hitl:session-progress'
  }
];

const missingEvidenceBrief = ({ generatedAt, sourceArtifacts, missingArtifactNames }) => ({
  schemaVersion: 1,
  contractVersion: 'operational-hitl-human-decision-brief/v1',
  generatedAt,
  sourceSystem: 'mold-master-ai',
  targetSystem: 'operator_common_agent',
  status: 'missing_evidence',
  serviceWritesPerformed: false,
  localArtifactsWritten: true,
  policy: policy(),
  summary: {
    missingArtifacts: missingArtifactNames.length,
    missingArtifactNames,
    totalRows: 0,
    completedRows: 0,
    pendingRows: 0,
    invalidRows: 0,
    highRiskRows: 0,
    sessionCount: 0,
    nextSessionCode: null,
    nextDecisionId: null
  },
  worktableCsvPath: null,
  operatorSteps: [],
  sessions: [],
  markdown: '',
  sources: {
    pipelineStatus: sourceArtifacts.pipelineStatus || null,
    reviewSessionPlan: sourceArtifacts.reviewSessionPlan || null,
    reviewSessionPacket: sourceArtifacts.reviewSessionPacket || null,
    reviewSessionProgress: sourceArtifacts.reviewSessionProgress || null
  },
  recommendedAction: recommendedActionFor('missing_evidence')
});

const markdownFor = report => {
  const nextSession = report.sessions.find(session => session.code === report.summary.nextSessionCode);
  const lines = [
    '# Operational HITL Human Decision Brief',
    '',
    `- 생성 시각: ${report.generatedAt}`,
    `- 상태: ${report.status}`,
    `- 현재 단계: ${compact(report.pipelineStageKo) || '확인 필요'}`,
    `- 원본 worktable CSV: ${report.worktableCsvPath || '확인 필요'}`,
    `- 전체 row: ${report.summary.totalRows}`,
    `- 완료 row: ${report.summary.completedRows}`,
    `- 대기 row: ${report.summary.pendingRows}`,
    `- 오류 row: ${report.summary.invalidRows}`,
    `- 고위험 row: ${report.summary.highRiskRows}`,
    `- 다음 세션: ${nextSession?.titleKo || '없음'}`,
    report.status === 'fix_invalid_human_entries'
      ? '- 우선 처리: 오류 row부터 수정'
      : '- 우선 처리: 다음 세션의 pending row 입력',
    '- 안전 정책: 브리프 전용, 자동 입력 금지, 자동 적용 금지, Graph/Reference/Model 승격 금지',
    '',
    '## 작업 순서',
    ''
  ];

  report.operatorSteps.forEach((step, index) => {
    lines.push(`${index + 1}. ${step.titleKo}: ${step.instructionKo}`);
  });

  lines.push('', '## 세션별 입력 요약', '');
  report.sessions.forEach(session => {
    lines.push(`### P${session.priority}. ${session.titleKo}`);
    lines.push(`- 상태: ${session.status}`);
    lines.push(`- row: ${session.rowCount} / 완료 ${session.completedRows} / 대기 ${session.pendingRows} / 오류 ${session.invalidRows}`);
    lines.push(`- 파일: ${session.markdownPath || session.csvPath || '확인 필요'}`);
    lines.push(`- 안내: ${session.guidanceKo || '원본 근거를 확인하세요.'}`);
    lines.push('');
    lines.push('| Decision ID | Action | Risk | Label | Copyable | Manual confirmation |');
    lines.push('|---|---|---|---|---|---|');
    session.nextRows.forEach(row => {
      lines.push([
        '|',
        row.decisionId,
        '|',
        row.recommendedNewAction,
        '|',
        row.recommendationRisk,
        '|',
        row.displayLabel.replace(/\|/g, '/'),
        '|',
        row.copyableFields.map(briefCellText).join('<br>').replace(/\|/g, '/'),
        '|',
        row.manualConfirmationFields.join('<br>').replace(/\|/g, '/'),
        '|'
      ].join(' '));
    });
    lines.push('');
  });

  return `${lines.join('\n')}\n`;
};

const buildOperationalHitlHumanDecisionBrief = ({
  generatedAt = new Date().toISOString(),
  pipelineStatus = null,
  reviewSessionPlan = null,
  reviewSessionPacket = null,
  reviewSessionProgress = null,
  sourceArtifacts = {},
  markdownPath = null
} = {}) => {
  const missingArtifactNames = [
    !isContract(pipelineStatus, 'operational-hitl-pipeline-status/v1') ? 'pipelineStatus' : null,
    !isContract(reviewSessionPlan, 'operational-hitl-review-session-plan/v1') ? 'reviewSessionPlan' : null
  ].filter(Boolean);

  if (missingArtifactNames.length > 0) {
    return missingEvidenceBrief({
      generatedAt,
      sourceArtifacts,
      missingArtifactNames
    });
  }

  const packetIndex = packetIndexFor(reviewSessionPacket);
  const progressIndex = progressIndexFor(reviewSessionProgress);
  const sessions = asArray(reviewSessionPlan.sessions).map(session =>
    sessionBriefFor({
      session,
      packet: packetIndex.get(compact(session?.code)),
      progress: progressIndex.get(compact(session?.code))
    })
  );
  const totalRows = numberValue(reviewSessionPlan?.summary?.totalRows)
    || sessions.reduce((total, session) => total + session.rowCount, 0);
  const completedRows = isContract(reviewSessionProgress, 'operational-hitl-review-session-progress/v1')
    ? numberValue(reviewSessionProgress?.summary?.completedRows)
    : sessions.reduce((total, session) => total + session.completedRows, 0);
  const pendingRows = isContract(reviewSessionProgress, 'operational-hitl-review-session-progress/v1')
    ? numberValue(reviewSessionProgress?.summary?.pendingRows)
    : sessions.reduce((total, session) => total + session.pendingRows, 0);
  const invalidRows = isContract(reviewSessionProgress, 'operational-hitl-review-session-progress/v1')
    ? numberValue(reviewSessionProgress?.summary?.invalidRows)
    : sessions.reduce((total, session) => total + session.invalidRows, 0);
  const nextSession = chooseNextSession(sessions);
  const status = statusFor({
    missingArtifactNames,
    totalRows,
    pendingRows,
    invalidRows
  });
  const worktableCsvPath = worktableCsvPathFor(pipelineStatus);

  const report = {
    schemaVersion: 1,
    contractVersion: 'operational-hitl-human-decision-brief/v1',
    generatedAt,
    sourceSystem: 'mold-master-ai',
    targetSystem: 'operator_common_agent',
    status,
    serviceWritesPerformed: false,
    localArtifactsWritten: true,
    policy: policy(),
    pipelineStageCode: compact(pipelineStatus?.currentStage?.code),
    pipelineStageKo: compact(pipelineStatus?.currentStage?.titleKo),
    worktableCsvPath,
    summary: {
      missingArtifacts: 0,
      missingArtifactNames: [],
      totalRows,
      completedRows,
      pendingRows,
      invalidRows,
      highRiskRows: numberValue(reviewSessionPlan?.summary?.highRiskRows),
      sessionCount: sessions.length,
      nextSessionCode: nextSession?.code || null,
      nextDecisionId: nextSession?.nextRows?.[0]?.decisionId || null
    },
    operatorSteps: operatorStepsFor({
      nextSession,
      worktableCsvPath
    }),
    sessions,
    sources: {
      pipelineStatus: sourceArtifacts.pipelineStatus || null,
      reviewSessionPlan: sourceArtifacts.reviewSessionPlan || null,
      reviewSessionPacket: sourceArtifacts.reviewSessionPacket || null,
      reviewSessionProgress: sourceArtifacts.reviewSessionProgress || null
    },
    recommendedAction: recommendedActionFor(status),
    markdownPath
  };

  return {
    ...report,
    markdown: markdownFor(report)
  };
};

module.exports = {
  buildOperationalHitlHumanDecisionBrief
};
