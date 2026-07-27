const asArray = value => Array.isArray(value) ? value : [];

const compact = value => String(value || '').replace(/\s+/g, ' ').trim();

const numberValue = value => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const slugify = value => compact(value)
  .toLowerCase()
  .replace(/_/g, '-')
  .replace(/[^a-z0-9-]+/g, '-')
  .replace(/-+/g, '-')
  .replace(/^-|-$/g, '');

const policy = () => ({
  requiresHumanReview: true,
  sessionPacketOnly: true,
  suggestionOnly: true,
  autoPopulateNewActionAllowed: false,
  autoVerifyAllowed: false,
  autoApplyAllowed: false,
  automaticServiceWritesAllowed: false,
  allowGraphPromotion: false,
  allowReferenceLearning: false,
  allowModelTraining: false
});

const csvCell = value => {
  const text = String(value ?? '');
  if (!/[",\r\n|]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
};

const csvLine = values => values.map(csvCell).join(',');

const fieldText = fields => asArray(fields)
  .map(field => `${compact(field?.worktableColumn)}=${compact(field?.value)}`)
  .filter(part => !part.startsWith('=') && !part.endsWith('='))
  .join(' | ');

const manualFieldText = fields => asArray(fields)
  .map(compact)
  .filter(Boolean)
  .join(' | ');

const missingEvidenceReport = ({ generatedAt, sourceArtifacts }) => ({
  schemaVersion: 1,
  contractVersion: 'operational-hitl-review-session-packet/v1',
  generatedAt,
  sourceSystem: 'mold-master-ai',
  targetSystem: 'operator_common_agent',
  status: 'missing_evidence',
  serviceWritesPerformed: false,
  localArtifactsWritten: true,
  policy: policy(),
  summary: {
    missingArtifacts: 1,
    missingArtifactNames: ['reviewSessionPlan'],
    totalRows: 0,
    sessionPacketCount: 0,
    highRiskRows: 0,
    filesToWrite: 0
  },
  packets: [],
  sources: {
    reviewSessionPlan: sourceArtifacts.reviewSessionPlan || null
  },
  recommendedAction: '먼저 npm run operational:hitl:review-session-plan으로 세션별 검토 계획을 생성하세요.'
});

const csvForSession = session => {
  const headers = [
    'sessionCode',
    'sessionTitleKo',
    'priority',
    'queueCode',
    'decisionId',
    'displayLabel',
    'recommendedNewAction',
    'recommendationRisk',
    'recommendationReasonKo',
    'copyableFields',
    'manualConfirmationFields',
    'humanDecision',
    'reviewerId',
    'reviewerName',
    'decidedAt',
    'reviewComment',
    'copyConfirmed',
    'copyToWorktableInstructionKo',
    'editablePath',
    'verificationCommand'
  ];
  const rows = asArray(session.rows).map(row => [
    compact(session.code),
    compact(session.titleKo),
    numberValue(session.priority),
    compact(row.queueCode),
    compact(row.decisionId),
    compact(row.displayLabel),
    compact(row.recommendedNewAction),
    compact(row.recommendationRisk),
    compact(row.recommendationReasonKo),
    fieldText(row.copyableFields),
    manualFieldText(row.manualConfirmationFields),
    '',
    '',
    '',
    '',
    '',
    '',
    compact(row.copyToWorktableInstructionKo),
    compact(row.editablePath),
    compact(row.verificationCommand)
  ]);
  return `${[headers, ...rows].map(csvLine).join('\n')}\n`;
};

const markdownForSession = session => {
  const lines = [
    `# ${compact(session.titleEn) || compact(session.code)} / ${compact(session.titleKo)}`,
    '',
    `- 우선순위: P${numberValue(session.priority)}`,
    `- row: ${asArray(session.rows).length}`,
    `- 고위험 row: ${numberValue(session.highRiskRows)}`,
    `- 안내: ${compact(session.guidanceKo)}`,
    '- 안전 정책: 세션 패킷 전용, newAction 자동 입력 금지, 자동 적용 금지, Graph/Reference/Model 승격 금지',
    '',
    '| Queue | Decision ID | Action | Risk | Label | Copyable fields | Manual confirmation |',
    '|---|---|---|---|---|---|---|'
  ];
  asArray(session.rows).forEach(row => {
    lines.push([
      '|',
      compact(row.queueCode),
      '|',
      compact(row.decisionId),
      '|',
      compact(row.recommendedNewAction),
      '|',
      compact(row.recommendationRisk),
      '|',
      compact(row.displayLabel),
      '|',
      fieldText(row.copyableFields),
      '|',
      manualFieldText(row.manualConfirmationFields),
      '|'
    ].join(' '));
  });
  return `${lines.join('\n')}\n`;
};

const packetForSession = session => {
  const priority = String(numberValue(session.priority)).padStart(2, '0');
  const fileBase = `${priority}-${slugify(session.code) || 'review-session'}`;
  return {
    code: compact(session.code),
    titleKo: compact(session.titleKo),
    titleEn: compact(session.titleEn),
    priority: numberValue(session.priority),
    rowCount: asArray(session.rows).length,
    highRiskRows: numberValue(session.highRiskRows),
    fileBase,
    csvFileName: `${fileBase}.csv`,
    markdownFileName: `${fileBase}.md`,
    csv: csvForSession(session),
    markdown: markdownForSession(session)
  };
};

const buildOperationalHitlReviewSessionPacket = ({
  generatedAt = new Date().toISOString(),
  reviewSessionPlan = null,
  sourceArtifacts = {}
} = {}) => {
  if (reviewSessionPlan?.contractVersion !== 'operational-hitl-review-session-plan/v1') {
    return missingEvidenceReport({ generatedAt, sourceArtifacts });
  }

  const sessions = asArray(reviewSessionPlan.sessions)
    .filter(session => asArray(session.rows).length > 0);
  const packets = sessions.map(packetForSession);
  const totalRows = packets.reduce((total, packet) => total + packet.rowCount, 0);
  const highRiskRows = packets.reduce((total, packet) => total + packet.highRiskRows, 0);

  return {
    schemaVersion: 1,
    contractVersion: 'operational-hitl-review-session-packet/v1',
    generatedAt,
    sourceSystem: 'mold-master-ai',
    targetSystem: 'operator_common_agent',
    status: totalRows > 0 ? 'ready_for_human_review' : 'clear',
    serviceWritesPerformed: false,
    localArtifactsWritten: true,
    policy: policy(),
    summary: {
      missingArtifacts: 0,
      missingArtifactNames: [],
      totalRows,
      sessionPacketCount: packets.length,
      highRiskRows,
      filesToWrite: packets.length * 2
    },
    packets,
    sources: {
      reviewSessionPlan: sourceArtifacts.reviewSessionPlan || null
    },
    recommendedAction: totalRows > 0
      ? '세션별 CSV/Markdown을 사람이 검토한 뒤 원본 worktable CSV에 필요한 값만 옮겨 적으세요.'
      : '추가 세션 패킷이 없습니다. pipeline-status를 갱신해 다음 단계를 확인하세요.'
  };
};

module.exports = {
  buildOperationalHitlReviewSessionPacket
};
