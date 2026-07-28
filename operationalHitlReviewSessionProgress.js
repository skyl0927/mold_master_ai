const asArray = value => Array.isArray(value) ? value : [];

const compact = value => String(value || '').replace(/\s+/g, ' ').trim();

const unique = values => [...new Set(asArray(values).map(compact).filter(Boolean))];

const numberValue = value => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const decisionKey = (queueCode, decisionId) =>
  `${compact(queueCode)}|${compact(decisionId)}`;

const policy = () => ({
  requiresHumanReview: true,
  progressOnly: true,
  autoVerifyAllowed: false,
  autoApplyAllowed: false,
  automaticServiceWritesAllowed: false,
  allowGraphPromotion: false,
  allowReferenceLearning: false,
  allowModelTraining: false
});

const isContract = (artifact, contractVersion) =>
  artifact?.contractVersion === contractVersion;

const simulationOnlyImportRows = worktableImport => {
  const invalidRows = numberValue(worktableImport?.summary?.invalidRows);
  const simulationOnlyRows = numberValue(worktableImport?.summary?.simulationOnlyRows);
  return invalidRows > 0
    && simulationOnlyRows > 0
    && simulationOnlyRows >= invalidRows
    && numberValue(worktableImport?.summary?.plannedUpdates) === 0
    && worktableImport?.localEditableWritesPerformed !== true
    ? simulationOnlyRows
    : 0;
};

const normalizeProgressWorktableImport = worktableImport => {
  const ignoredSimulationOnlyRows = simulationOnlyImportRows(worktableImport);
  if (ignoredSimulationOnlyRows === 0) return worktableImport;
  return {
    ...worktableImport,
    status: 'ignored_simulation_only',
    summary: {
      ...worktableImport.summary,
      plannedUpdates: 0,
      appliedUpdates: 0,
      invalidRows: 0,
      ignoredSimulationOnlyRows
    },
    plannedUpdates: [],
    invalidRows: []
  };
};

const missingEvidenceReport = ({ generatedAt, sourceArtifacts, missingArtifactNames }) => ({
  schemaVersion: 1,
  contractVersion: 'operational-hitl-review-session-progress/v1',
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
    ignoredSimulationOnlyRows: 0,
    sessionCount: 0,
    completeSessionCount: 0,
    blockedSessionCount: 0,
    packetFiles: 0
  },
  sessions: [],
  markdown: '',
  sources: {
    reviewSessionPlan: sourceArtifacts.reviewSessionPlan || null,
    reviewSessionPacket: sourceArtifacts.reviewSessionPacket || null,
    worktableImport: sourceArtifacts.worktableImport || null
  },
  recommendedAction: '먼저 npm run operational:hitl:review-session-plan 및 npm run operational:hitl:worktable-import를 실행해 진행률 증거를 생성하세요.'
});

const packetIndexFor = reviewSessionPacket => {
  const packets = new Map();
  asArray(reviewSessionPacket?.packets).forEach(packet => {
    packets.set(compact(packet?.code), packet);
  });
  return packets;
};

const importIndexFor = worktableImport => {
  const planned = new Map();
  const invalid = new Map();

  asArray(worktableImport?.plannedUpdates).forEach(update => {
    planned.set(decisionKey(update?.queueCode, update?.decisionId), update);
  });

  asArray(worktableImport?.invalidRows).forEach(row => {
    const key = decisionKey(row?.queueCode, row?.decisionId);
    const rows = invalid.get(key) || [];
    rows.push(row);
    invalid.set(key, rows);
  });

  return { planned, invalid };
};

const rowStatusFor = ({ row, importIndex }) => {
  const key = decisionKey(row?.queueCode, row?.decisionId);
  const invalidRows = importIndex.invalid.get(key) || [];
  if (invalidRows.length > 0) return 'invalid_worktable';
  if (importIndex.planned.has(key)) return 'completed';
  return 'pending';
};

const invalidPreviewFor = invalidRow => ({
  queueCode: compact(invalidRow?.queueCode),
  decisionId: compact(invalidRow?.decisionId),
  action: compact(invalidRow?.action),
  code: compact(invalidRow?.code),
  missingFields: unique(invalidRow?.missingFields)
});

const pendingPreviewFor = row => ({
  queueCode: compact(row?.queueCode),
  decisionId: compact(row?.decisionId),
  displayLabel: compact(row?.displayLabel),
  recommendedNewAction: compact(row?.recommendedNewAction),
  recommendationRisk: compact(row?.recommendationRisk)
});

const completedPreviewFor = ({ row, update }) => ({
  queueCode: compact(row?.queueCode),
  decisionId: compact(row?.decisionId),
  action: compact(update?.action),
  verifyCommand: compact(update?.verifyCommand || row?.verificationCommand)
});

const sessionStatusFor = ({ invalidRows, pendingRows, completedRows, rowCount, worktableImportStatus }) => {
  if (invalidRows > 0) return 'invalid_worktable';
  if (pendingRows > 0) return 'awaiting_human_csv_decisions';
  if (rowCount === 0) return 'clear';
  if (completedRows === rowCount && worktableImportStatus === 'applied') return 'ready_for_preflight';
  if (completedRows === rowCount) return 'ready_for_worktable_apply';
  return 'awaiting_human_csv_decisions';
};

const sessionProgressFor = ({ session, packet, importIndex, worktableImportStatus }) => {
  const rows = asArray(session?.rows);
  const completedPreviews = [];
  const invalidPreviews = [];
  const pendingPreviews = [];

  rows.forEach(row => {
    const key = decisionKey(row?.queueCode, row?.decisionId);
    const status = rowStatusFor({ row, importIndex });
    if (status === 'invalid_worktable') {
      asArray(importIndex.invalid.get(key)).forEach(invalidRow => {
        invalidPreviews.push(invalidPreviewFor(invalidRow));
      });
      return;
    }
    if (status === 'completed') {
      completedPreviews.push(completedPreviewFor({
        row,
        update: importIndex.planned.get(key)
      }));
      return;
    }
    pendingPreviews.push(pendingPreviewFor(row));
  });

  const rowCount = rows.length;
  const completedRows = completedPreviews.length;
  const invalidRows = invalidPreviews.length;
  const pendingRows = Math.max(0, rowCount - completedRows - invalidRows);

  return {
    code: compact(session?.code),
    titleKo: compact(session?.titleKo),
    priority: numberValue(session?.priority),
    rowCount,
    completedRows,
    pendingRows,
    invalidRows,
    highRiskRows: numberValue(session?.highRiskRows),
    status: sessionStatusFor({
      invalidRows,
      pendingRows,
      completedRows,
      rowCount,
      worktableImportStatus
    }),
    csvPath: compact(packet?.csvPath),
    markdownPath: compact(packet?.markdownPath),
    pendingRowPreviews: pendingPreviews.slice(0, 5),
    invalidRowPreviews: invalidPreviews.slice(0, 5),
    completedRowPreviews: completedPreviews.slice(0, 5),
    verificationCommands: unique(completedPreviews.map(item => item.verifyCommand))
  };
};

const overallStatusFor = ({ missingArtifactNames, totalRows, invalidRows, pendingRows, worktableImportStatus }) => {
  if (missingArtifactNames.length > 0) return 'missing_evidence';
  if (invalidRows > 0) return 'invalid_worktable';
  if (pendingRows > 0) return 'awaiting_human_csv_decisions';
  if (totalRows === 0) return 'clear';
  if (worktableImportStatus === 'applied') return 'ready_for_preflight';
  return 'ready_for_worktable_apply';
};

const recommendedActionFor = status => {
  if (status === 'invalid_worktable') {
    return '세션별 오류 row의 필수 필드를 원본 worktable CSV에서 수정한 뒤 npm run operational:hitl:worktable-import를 다시 실행하세요.';
  }
  if (status === 'awaiting_human_csv_decisions') {
    return '세션 패킷 CSV/Markdown을 보며 원본 worktable CSV의 newAction과 필수 검토 필드를 계속 입력하세요.';
  }
  if (status === 'ready_for_worktable_apply') {
    return '모든 세션 row가 유효합니다. 사람이 dry-run 결과를 확인한 뒤 npm run operational:hitl:worktable-import -- --apply를 실행하세요.';
  }
  if (status === 'ready_for_preflight') {
    return '로컬 editable decision JSON 반영이 끝났습니다. npm run operational:hitl:editable-preflight를 실행하세요.';
  }
  if (status === 'clear') return '검토할 세션 row가 없습니다. pipeline-status를 갱신하세요.';
  return '필수 artifact를 재생성한 뒤 세션 진행률을 다시 확인하세요.';
};

const markdownFor = report => {
  const lines = [
    '# Operational HITL Review Session Progress',
    '',
    `- 생성 시각: ${report.generatedAt}`,
    `- 상태: ${report.status}`,
    `- 전체 row: ${report.summary.totalRows}`,
    `- 완료 row: ${report.summary.completedRows}`,
    `- 대기 row: ${report.summary.pendingRows}`,
    `- 오류 row: ${report.summary.invalidRows}`,
    `- 무시된 simulation-only import row: ${report.summary.ignoredSimulationOnlyRows}`,
    `- 완료 세션: ${report.summary.completeSessionCount}`,
    `- 차단 세션: ${report.summary.blockedSessionCount}`,
    '- 안전 정책: 진행률 전용, 자동 적용 금지, Graph/Reference/Model 승격 금지',
    '',
    '## Sessions',
    '',
    '| P | Session | Status | Done | Pending | Invalid | Files |',
    '|---:|---|---|---:|---:|---:|---|'
  ];

  report.sessions.forEach(session => {
    lines.push([
      `| ${session.priority}`,
      session.titleKo,
      session.status,
      session.completedRows,
      session.pendingRows,
      session.invalidRows,
      [session.csvPath, session.markdownPath].filter(Boolean).join('<br>') || '-',
      '|'
    ].join(' | '));
  });

  return `${lines.join('\n')}\n`;
};

const buildOperationalHitlReviewSessionProgress = ({
  generatedAt = new Date().toISOString(),
  reviewSessionPlan = null,
  reviewSessionPacket = null,
  worktableImport = null,
  sourceArtifacts = {}
} = {}) => {
  const missingArtifactNames = [
    !isContract(reviewSessionPlan, 'operational-hitl-review-session-plan/v1')
      ? 'reviewSessionPlan'
      : null,
    !isContract(worktableImport, 'operational-hitl-decision-worktable-import/v1')
      ? 'worktableImport'
      : null
  ].filter(Boolean);

  if (missingArtifactNames.length > 0) {
    return missingEvidenceReport({ generatedAt, sourceArtifacts, missingArtifactNames });
  }

  const normalizedWorktableImport = normalizeProgressWorktableImport(worktableImport);
  const packetIndex = packetIndexFor(reviewSessionPacket);
  const importIndex = importIndexFor(normalizedWorktableImport);
  const worktableImportStatus = compact(normalizedWorktableImport.status);
  const sessions = asArray(reviewSessionPlan.sessions).map(session =>
    sessionProgressFor({
      session,
      packet: packetIndex.get(compact(session?.code)),
      importIndex,
      worktableImportStatus
    })
  );
  const totalRows = sessions.reduce((total, session) => total + session.rowCount, 0);
  const completedRows = sessions.reduce((total, session) => total + session.completedRows, 0);
  const pendingRows = sessions.reduce((total, session) => total + session.pendingRows, 0);
  const invalidRows = sessions.reduce((total, session) => total + session.invalidRows, 0);
  const completeSessionCount = sessions.filter(session =>
    session.status === 'ready_for_worktable_apply' || session.status === 'ready_for_preflight'
  ).length;
  const blockedSessionCount = sessions.filter(session => session.status === 'invalid_worktable').length;
  const status = overallStatusFor({
    missingArtifactNames,
    totalRows,
    invalidRows,
    pendingRows,
    worktableImportStatus
  });

  const report = {
    schemaVersion: 1,
    contractVersion: 'operational-hitl-review-session-progress/v1',
    generatedAt,
    sourceSystem: 'mold-master-ai',
    targetSystem: 'operator_common_agent',
    status,
    serviceWritesPerformed: false,
    localArtifactsWritten: true,
    policy: policy(),
    summary: {
      missingArtifacts: 0,
      missingArtifactNames: [],
      totalRows,
      completedRows,
      pendingRows,
      invalidRows,
      ignoredSimulationOnlyRows: numberValue(normalizedWorktableImport?.summary?.ignoredSimulationOnlyRows),
      sessionCount: sessions.length,
      completeSessionCount,
      blockedSessionCount,
      packetFiles: numberValue(reviewSessionPacket?.summary?.filesToWrite)
    },
    sessions,
    sources: {
      reviewSessionPlan: sourceArtifacts.reviewSessionPlan || null,
      reviewSessionPacket: sourceArtifacts.reviewSessionPacket || null,
      worktableImport: sourceArtifacts.worktableImport || null
    },
    recommendedAction: recommendedActionFor(status)
  };

  return {
    ...report,
    markdown: markdownFor(report)
  };
};

module.exports = {
  buildOperationalHitlReviewSessionProgress
};
