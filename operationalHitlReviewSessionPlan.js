const asArray = value => Array.isArray(value) ? value : [];

const compact = value => String(value || '').replace(/\s+/g, ' ').trim();

const unique = values => [...new Set(asArray(values).map(compact).filter(Boolean))];

const splitList = value => unique(String(value || '')
  .split(/\r?\n|[|;]/)
  .map(item => item.trim()));

const numberValue = value => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const policy = () => ({
  requiresHumanReview: true,
  suggestionOnly: true,
  autoPopulateNewActionAllowed: false,
  autoVerifyAllowed: false,
  autoApplyAllowed: false,
  automaticServiceWritesAllowed: false,
  allowGraphPromotion: false,
  allowReferenceLearning: false,
  allowModelTraining: false
});

const missingEvidenceReport = ({ generatedAt, sourceArtifacts }) => ({
  schemaVersion: 1,
  contractVersion: 'operational-hitl-review-session-plan/v1',
  generatedAt,
  sourceSystem: 'mold-master-ai',
  targetSystem: 'operator_common_agent',
  status: 'missing_evidence',
  serviceWritesPerformed: false,
  localArtifactsWritten: true,
  policy: policy(),
  summary: {
    missingArtifacts: 1,
    missingArtifactNames: ['worktableSuggestion'],
    totalRows: 0,
    sessionCount: 0,
    highRiskRows: 0,
    recaptureRows: 0,
    approveCandidateRows: 0,
    approveCardRows: 0,
    needsReviewRows: 0,
    needsChangesRows: 0
  },
  sessions: [],
  markdown: '',
  sources: {
    worktableSuggestion: sourceArtifacts.worktableSuggestion || null
  },
  recommendedAction: '먼저 npm run operational:hitl:worktable-suggest로 HITL 추천표를 생성하세요.'
});

const COPYABLE_FIELD_MAP = [
  ['newAction', 'recommendedNewAction'],
  ['reviewComment', 'suggestedReviewComment'],
  ['approvedDefectType', 'suggestedApprovedDefectType'],
  ['reviewedDefectName', 'suggestedReviewedDefectName'],
  ['reviewedProblem', 'suggestedReviewedProblem'],
  ['reviewedPhenomenon', 'suggestedReviewedPhenomenon'],
  ['causeCandidates', 'suggestedCauseCandidates'],
  ['causeLabels', 'suggestedCauseLabels'],
  ['checkItems', 'suggestedCheckItems'],
  ['actions', 'suggestedActions'],
  ['requestedViews', 'suggestedRequestedViews'],
  ['confirmed', 'suggestedConfirmed'],
  ['manufacturingImageConfirmed', 'suggestedManufacturingImageConfirmed'],
  ['labelConfirmed', 'suggestedLabelConfirmed']
];

const isRequiredWorktableColumn = (row, worktableColumn) => {
  const requiredFields = splitList(row?.requiredFields);
  if (worktableColumn === 'newAction') return requiredFields.includes('action');
  if (worktableColumn === 'reviewerId') {
    return requiredFields.includes('reviewer.id') || requiredFields.includes('reviewerId');
  }
  return requiredFields.includes(worktableColumn);
};

const copyableFieldsFor = row =>
  COPYABLE_FIELD_MAP
    .filter(([worktableColumn]) => isRequiredWorktableColumn(row, worktableColumn))
    .map(([worktableColumn, suggestedColumn]) => ({
      worktableColumn,
      suggestedColumn,
      value: compact(row?.[suggestedColumn])
    }))
    .filter(field => field.value);

const manualConfirmationFieldsFor = row => {
  const copyable = new Set(copyableFieldsFor(row).map(field => field.worktableColumn));
  return splitList(row?.requiredFields)
    .filter(field => field !== 'action')
    .filter(field => !copyable.has(field))
    .filter(field => !copyable.has(field.replace(/^reviewer\./, 'reviewer')));
};

const rowPreview = row => ({
  queueCode: compact(row?.queueCode),
  decisionId: compact(row?.decisionId),
  displayLabel: compact(row?.displayLabel),
  recommendedNewAction: compact(row?.recommendedNewAction),
  recommendationRisk: compact(row?.recommendationRisk),
  recommendationReasonKo: compact(row?.recommendationReasonKo),
  missingReviewFields: compact(row?.missingReviewFields),
  requiredHumanChecksKo: compact(row?.requiredHumanChecksKo),
  copyableFields: copyableFieldsFor(row),
  manualConfirmationFields: manualConfirmationFieldsFor(row),
  copyToWorktableInstructionKo: compact(row?.copyToWorktableInstructionKo),
  editablePath: compact(row?.editablePath),
  verificationCommand: compact(row?.verificationCommand)
});

const sessionDefinitions = [
  {
    code: 'label_conflict_session',
    titleKo: '승인 이미지 라벨 충돌 선검토',
    titleEn: 'Label conflict review',
    priority: 1,
    matches: row => compact(row.queueCode) === 'vision_label_conflicts',
    guidanceKo: '동일 hash 원본 이미지와 후보 라벨 중 실제 지배 결함을 먼저 확인하세요.'
  },
  {
    code: 'recapture_session',
    titleKo: '재촬영 요청 검토',
    titleEn: 'Recapture review',
    priority: 2,
    matches: row => compact(row.recommendedNewAction) === 'request_recapture',
    guidanceKo: '실제 제조 이미지 여부와 필요한 재촬영 view를 확정하세요.'
  },
  {
    code: 'vision_candidate_approval_session',
    titleKo: 'Vision 승인 후보 검토',
    titleEn: 'Vision candidate approval review',
    priority: 3,
    matches: row => compact(row.recommendedNewAction) === 'approve_candidate',
    guidanceKo: '원본 제조 이미지, ROI, 결함 라벨이 일치하는지 확인한 뒤 승인 후보로 확정하세요.'
  },
  {
    code: 'web_card_approval_session',
    titleKo: 'Web 지식 카드 승인 후보 검토',
    titleEn: 'Web card approval review',
    priority: 4,
    matches: row => compact(row.recommendedNewAction) === 'approve_card',
    guidanceKo: '출처 신뢰도, 한글 번역 품질, 현장 적용성, 원인/대책 과잉 추론 여부를 확인하세요.'
  },
  {
    code: 'needs_changes_session',
    titleKo: '보완 필요 카드 검토',
    titleEn: 'Needs-changes review',
    priority: 5,
    matches: row => compact(row.recommendedNewAction) === 'mark_needs_changes',
    guidanceKo: '누락된 필수 도메인 필드를 출처 근거와 함께 보완하세요.'
  },
  {
    code: 'remaining_review_session',
    titleKo: '기타 보류/반려 검토',
    titleEn: 'Remaining review',
    priority: 6,
    matches: () => true,
    guidanceKo: '전용 규칙에 들어가지 않은 행은 보수적으로 원본 근거를 확인하세요.'
  }
];

const emptySessionBuckets = () =>
  sessionDefinitions.map(definition => ({
    ...definition,
    rows: []
  }));

const assignRowsToSessions = rows => {
  const sessions = emptySessionBuckets();
  rows.forEach(row => {
    const session = sessions.find(candidate => candidate.matches(row));
    session.rows.push(rowPreview(row));
  });
  return sessions
    .filter(session => session.rows.length > 0)
    .map(({ matches, ...session }) => ({
      ...session,
      rowCount: session.rows.length,
      highRiskRows: session.rows.filter(row => row.recommendationRisk === 'high').length,
      copyableFieldCount: session.rows.reduce((total, row) => total + row.copyableFields.length, 0),
      manualConfirmationFieldCount: session.rows.reduce(
        (total, row) => total + row.manualConfirmationFields.length,
        0
      ),
      recommendedActionKo: `${session.titleKo} ${session.rows.length}건을 확인한 뒤 원본 worktable CSV에 필요한 값만 옮겨 적으세요.`
    }));
};

const markdownFor = report => {
  const lines = [
    '# Operational HITL Review Session Plan',
    '',
    `- 생성 시각: ${report.generatedAt}`,
    `- 상태: ${report.status}`,
    `- 전체 row: ${report.summary.totalRows}`,
    `- 세션 수: ${report.summary.sessionCount}`,
    `- 고위험 row: ${report.summary.highRiskRows}`,
    '- 안전 정책: 추천 전용, newAction 자동 입력 금지, 자동 적용 금지, Graph/Reference/Model 승격 금지',
    '',
    '## Review Sessions',
    ''
  ];

  report.sessions.forEach(session => {
    lines.push(`### P${session.priority}. ${session.titleEn} / ${session.titleKo}`);
    lines.push(`- row: ${session.rowCount}`);
    lines.push(`- 고위험: ${session.highRiskRows}`);
    lines.push(`- 안내: ${session.guidanceKo}`);
    lines.push('');
    lines.push('| Queue | Decision ID | Action | Risk | Label | Reason |');
    lines.push('|---|---|---|---|---|---|');
    session.rows.forEach(row => {
      lines.push(`| ${row.queueCode} | ${row.decisionId} | ${row.recommendedNewAction} | ${row.recommendationRisk} | ${row.displayLabel} | ${row.recommendationReasonKo} |`);
    });
    lines.push('');
  });

  return `${lines.join('\n')}\n`;
};

const summaryFor = (rows, sessions) => ({
  missingArtifacts: 0,
  missingArtifactNames: [],
  totalRows: rows.length,
  sessionCount: sessions.length,
  highRiskRows: rows.filter(row => compact(row.recommendationRisk) === 'high').length,
  recaptureRows: rows.filter(row => compact(row.recommendedNewAction) === 'request_recapture').length,
  approveCandidateRows: rows.filter(row => compact(row.recommendedNewAction) === 'approve_candidate').length,
  approveCardRows: rows.filter(row => compact(row.recommendedNewAction) === 'approve_card').length,
  needsReviewRows: rows.filter(row => compact(row.recommendedNewAction) === 'mark_needs_review').length,
  needsChangesRows: rows.filter(row => compact(row.recommendedNewAction) === 'mark_needs_changes').length
});

const buildOperationalHitlReviewSessionPlan = ({
  generatedAt = new Date().toISOString(),
  worktableSuggestion = null,
  sourceArtifacts = {}
} = {}) => {
  if (worktableSuggestion?.contractVersion !== 'operational-hitl-decision-worktable-suggestion/v1') {
    return missingEvidenceReport({ generatedAt, sourceArtifacts });
  }

  const rows = asArray(worktableSuggestion.rows)
    .filter(row => compact(row?.recommendedNewAction));
  const sessions = assignRowsToSessions(rows);
  const report = {
    schemaVersion: 1,
    contractVersion: 'operational-hitl-review-session-plan/v1',
    generatedAt,
    sourceSystem: 'mold-master-ai',
    targetSystem: 'operator_common_agent',
    status: rows.length > 0 ? 'ready_for_human_review' : 'clear',
    serviceWritesPerformed: false,
    localArtifactsWritten: true,
    policy: policy(),
    summary: summaryFor(rows, sessions),
    sessions,
    sources: {
      worktableSuggestion: sourceArtifacts.worktableSuggestion || null
    },
    recommendedAction: rows.length > 0
      ? '세션별 검토 순서에 따라 사람이 추천값을 확인하고 원본 worktable CSV에 필요한 값만 옮겨 적으세요.'
      : '추가 HITL 추천 행이 없습니다. pipeline-status를 갱신해 다음 단계를 확인하세요.'
  };

  return {
    ...report,
    markdown: markdownFor(report)
  };
};

module.exports = {
  buildOperationalHitlReviewSessionPlan
};
