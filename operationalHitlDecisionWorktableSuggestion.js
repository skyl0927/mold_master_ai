const asArray = value => Array.isArray(value) ? value : [];

const compact = value => String(value || '').replace(/\s+/g, ' ').trim();

const unique = values => [...new Set(asArray(values).map(compact).filter(Boolean))];

const isContract = (artifact, contractVersion) =>
  artifact?.contractVersion === contractVersion;

const splitList = value => String(value || '')
  .split(/\r?\n|[|;]/)
  .map(item => item.trim())
  .filter(Boolean);

const containsAny = (text, patterns) =>
  patterns.some(pattern => pattern.test(text));

const allowedActionsFor = row => new Set(splitList(row.allowedActions));

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

const SUGGESTION_COLUMNS = [
  'queueCode',
  'decisionId',
  'titleKo',
  'rowStatus',
  'currentAction',
  'newAction',
  'displayLabel',
  'recommendedNewAction',
  'recommendationConfidence',
  'recommendationRisk',
  'recommendationReasonKo',
  'missingReviewFields',
  'requiredHumanChecksKo',
  'suggestedReviewComment',
  'suggestedReviewedDefectName',
  'suggestedReviewedProblem',
  'suggestedReviewedPhenomenon',
  'suggestedApprovedDefectType',
  'suggestedCauseCandidates',
  'suggestedCauseLabels',
  'suggestedCheckItems',
  'suggestedActions',
  'suggestedRequestedViews',
  'suggestedConfirmed',
  'suggestedManufacturingImageConfirmed',
  'suggestedLabelConfirmed',
  'copyToWorktableInstructionKo',
  'editablePath',
  'verificationCommand'
];

const missingEvidenceReport = ({ generatedAt, sourceArtifacts }) => ({
  schemaVersion: 1,
  contractVersion: 'operational-hitl-decision-worktable-suggestion/v1',
  generatedAt,
  sourceSystem: 'mold-master-ai',
  targetSystem: 'operator_common_agent',
  status: 'missing_evidence',
  serviceWritesPerformed: false,
  localArtifactsWritten: true,
  policy: policy(),
  summary: {
    missingArtifacts: 1,
    missingArtifactNames: ['worktableExport'],
    totalRows: 0,
    pendingRows: 0,
    suggestionRows: 0,
    approveCandidateSuggestions: 0,
    approveCardSuggestions: 0,
    recaptureSuggestions: 0,
    needsReviewSuggestions: 0,
    needsChangesSuggestions: 0,
    rejectSuggestions: 0
  },
  columns: SUGGESTION_COLUMNS,
  rows: [],
  csv: '',
  markdown: '',
  sources: {
    worktableExport: sourceArtifacts.worktableExport || null
  },
  recommendedAction: '먼저 npm run operational:hitl:worktable-export로 HITL CSV 작업표를 생성하세요.'
});

const riskTextFor = row => compact([
  row.reviewFocusKo,
  row.displayLabel,
  row.reviewComment
].filter(Boolean).join(' '));

const hasImageRecaptureRisk = row => containsAny(riskTextFor(row), [
  /실제\s*성형품\s*표면\s*사진이\s*아니/i,
  /실제\s*제품\s*외관.*판정할\s*수\s*없/i,
  /교육용\s*도식/i,
  /도식\s*이미지/i,
  /설명용/i,
  /논문/i,
  /현미경\s*복합/i,
  /비제조/i
]);

const firstLabel = row => {
  const display = compact(row.displayLabel);
  if (!display) return '';
  return compact(display.split('/')[0].split('|')[0]);
};

const webContentFields = [
  'reviewedDefectName',
  'reviewedProblem',
  'reviewedPhenomenon',
  'causeCandidates',
  'causeLabels',
  'checkItems',
  'actions'
];

const missingWebFieldsFor = row =>
  webContentFields.filter(field => !compact(row[field]));

const baseSuggestion = row => ({
  ...row,
  recommendedNewAction: '',
  recommendationConfidence: '0.00',
  recommendationRisk: 'medium',
  recommendationReasonKo: '',
  missingReviewFields: '',
  requiredHumanChecksKo: '추천 초안입니다. 원본 이미지/문서와 라벨/근거를 사람이 확인하기 전에는 적용하지 마세요.',
  suggestedReviewComment: '',
  suggestedReviewedDefectName: compact(row.reviewedDefectName),
  suggestedReviewedProblem: compact(row.reviewedProblem),
  suggestedReviewedPhenomenon: compact(row.reviewedPhenomenon),
  suggestedApprovedDefectType: compact(row.approvedDefectType || firstLabel(row)),
  suggestedCauseCandidates: compact(row.causeCandidates),
  suggestedCauseLabels: compact(row.causeLabels),
  suggestedCheckItems: compact(row.checkItems),
  suggestedActions: compact(row.actions),
  suggestedRequestedViews: '',
  suggestedConfirmed: '',
  suggestedManufacturingImageConfirmed: '',
  suggestedLabelConfirmed: '',
  copyToWorktableInstructionKo: '사람이 추천 내용을 검토한 뒤 원본 worktable CSV의 newAction 및 필수 필드에 필요한 값만 옮겨 적으세요.'
});

const visionPendingSuggestion = row => {
  const allowed = allowedActionsFor(row);
  if (hasImageRecaptureRisk(row) && allowed.has('request_recapture')) {
    return {
      recommendedNewAction: 'request_recapture',
      recommendationConfidence: '0.82',
      recommendationRisk: 'high',
      recommendationReasonKo: '비전 설명에 도식/비제조 이미지 위험이 있어 학습 승인보다 재촬영 요청으로 검토하는 것이 안전합니다.',
      requiredHumanChecksKo: '원본이 실제 생산품/사출 성형품 사진인지 확인하고, 아니면 동일 조건의 실제 제품 이미지를 재촬영하세요.',
      suggestedReviewComment: '도식 또는 비제조 이미지 가능성이 있어 학습 승인 대신 실제 제품 재촬영을 요청합니다.',
      suggestedRequestedViews: '제품 전체 정면 | 결함부 근접 | 측면 보조 | 동일 조건 재촬영'
    };
  }

  if (allowed.has('approve_candidate') && compact(row.approvedDefectType || firstLabel(row))) {
    return {
      recommendedNewAction: 'approve_candidate',
      recommendationConfidence: '0.68',
      recommendationRisk: 'medium',
      recommendationReasonKo: '비전 설명과 결함명이 일치하는 승인 후보입니다. 단 원본 제조 이미지와 라벨 확인은 사람이 수행해야 합니다.',
      requiredHumanChecksKo: '원본 제조 이미지 여부, ROI/결함 위치, 최종 결함 라벨을 사람이 확인하세요.',
      suggestedReviewComment: '원본 제조 이미지와 결함 라벨을 확인한 뒤 승인 후보로 검토합니다.'
    };
  }

  return {
    recommendedNewAction: allowed.has('mark_needs_review') ? 'mark_needs_review' : '',
    recommendationConfidence: '0.55',
    recommendationRisk: 'medium',
    recommendationReasonKo: '승인에 필요한 결함명 또는 이미지 확인 근거가 부족합니다.',
    requiredHumanChecksKo: '원본 이미지와 라벨 근거를 확인한 뒤 승인, 보류, 반려, 재촬영 중 하나를 선택하세요.',
    suggestedReviewComment: '승인 근거가 충분하지 않아 추가 검토가 필요합니다.'
  };
};

const labelConflictSuggestion = row => {
  const allowed = allowedActionsFor(row);
  return {
    recommendedNewAction: allowed.has('mark_needs_review') ? 'mark_needs_review' : '',
    recommendationConfidence: '0.58',
    recommendationRisk: 'high',
    recommendationReasonKo: '라벨 충돌 항목은 원본 동일 hash와 지배 결함 확인 전까지 needs_review 격리가 안전합니다.',
    requiredHumanChecksKo: '동일 hash 원본 이미지, prior/original 비전 관찰, 후보 라벨 중 실제 지배 결함을 사람이 확인하세요.',
    suggestedReviewComment: '라벨 충돌이 있어 원본 확인 전까지 학습 후보에서 격리합니다.'
  };
};

const webKnowledgeSuggestion = row => {
  const allowed = allowedActionsFor(row);
  const missing = missingWebFieldsFor(row);
  if (missing.length === 0 && allowed.has('approve_card')) {
    return {
      recommendedNewAction: 'approve_card',
      recommendationConfidence: '0.74',
      recommendationRisk: 'medium',
      recommendationReasonKo: '필수 도메인 카드 필드가 채워져 있어 승인 후보입니다. 출처/번역/현장 적용성은 사람이 확인해야 합니다.',
      missingReviewFields: '',
      requiredHumanChecksKo: '출처 신뢰도, 한글 번역 품질, 사출 성형 현장 적용성, 원인/대책의 과잉 추론 여부를 확인하세요.',
      suggestedReviewComment: '필수 지식 카드 필드가 충족되어 Common Agent 수동 import 후보로 검토합니다.'
    };
  }

  return {
    recommendedNewAction: allowed.has('mark_needs_changes') ? 'mark_needs_changes' : '',
    recommendationConfidence: '0.76',
    recommendationRisk: 'medium',
    recommendationReasonKo: `필수 검토 필드가 누락되어 보완 후 재검토가 필요합니다: ${missing.join(', ')}`,
    missingReviewFields: missing.join(' | '),
    requiredHumanChecksKo: '누락된 현상, 원인, 점검 항목, 대책을 출처 근거와 함께 보완하세요.',
    suggestedReviewComment: '필수 도메인 카드 필드 누락으로 보완이 필요합니다.'
  };
};

const fallbackSuggestion = row => {
  const allowed = allowedActionsFor(row);
  const safeAction = allowed.has('mark_needs_review')
    ? 'mark_needs_review'
    : splitList(row.allowedActions).find(action => !/^approve/i.test(action)) || '';
  return {
    recommendedNewAction: safeAction,
    recommendationConfidence: '0.50',
    recommendationRisk: 'medium',
    recommendationReasonKo: '전용 추천 규칙이 없어 보수적인 사람 재검토 action을 제안합니다.',
    requiredHumanChecksKo: '원본 근거와 필수 필드를 사람이 직접 확인하세요.',
    suggestedReviewComment: '전용 추천 규칙이 없어 사람 재검토가 필요합니다.'
  };
};

const recommendationFor = row => {
  if (compact(row.currentAction) !== 'pending' && compact(row.rowStatus) !== 'pending') {
    return {
      recommendedNewAction: compact(row.currentAction),
      recommendationConfidence: '1.00',
      recommendationRisk: 'low',
      recommendationReasonKo: '이미 action이 입력된 행입니다. 기존 입력을 유지하세요.',
      requiredHumanChecksKo: '기존 입력이 사람 검토 결과인지 확인하세요.',
      suggestedReviewComment: compact(row.reviewComment)
    };
  }
  const queueCode = compact(row.queueCode);
  if (queueCode === 'vision_pending_hitl') return visionPendingSuggestion(row);
  if (queueCode === 'vision_label_conflicts') return labelConflictSuggestion(row);
  if (queueCode === 'web_knowledge_hitl') return webKnowledgeSuggestion(row);
  return fallbackSuggestion(row);
};

const suggestionRowFor = row => {
  const suggestion = recommendationFor(row);
  return {
    ...baseSuggestion(row),
    ...suggestion
  };
};

const csvCell = value => {
  const text = String(value ?? '');
  return /[",\r\n|]/.test(text)
    ? `"${text.replace(/"/g, '""')}"`
    : text;
};

const csvForRows = rows => [
  SUGGESTION_COLUMNS.join(','),
  ...rows.map(row => SUGGESTION_COLUMNS.map(column => csvCell(row[column])).join(','))
].join('\n') + '\n';

const markdownForRows = ({ rows, summary, generatedAt }) => {
  const lines = [
    '# Operational HITL Decision Worktable Suggestions',
    '',
    `- 생성 시각: ${generatedAt}`,
    `- 추천 row: ${summary.suggestionRows}`,
    `- 재촬영 추천: ${summary.recaptureSuggestions}`,
    `- Vision 승인 후보: ${summary.approveCandidateSuggestions}`,
    `- Web 카드 승인 후보: ${summary.approveCardSuggestions}`,
    '- 안전 정책: 추천 전용, newAction 자동 입력 금지, 자동 적용 금지, Graph/Reference/Model 승격 금지',
    '',
    '| Queue | Decision ID | Suggested Action | Risk | Reason |',
    '|---|---|---|---|---|'
  ];

  rows.forEach(row => {
    const cells = [
      row.queueCode,
      row.decisionId,
      row.recommendedNewAction,
      row.recommendationRisk,
      row.recommendationReasonKo
    ].map(value => compact(value).replace(/\|/g, '/').replace(/\r?\n/g, ' '));
    lines.push(`| ${cells.join(' | ')} |`);
  });

  return `${lines.join('\n')}\n`;
};

const countAction = (rows, action) =>
  rows.filter(row => row.recommendedNewAction === action).length;

const summaryFor = ({ worktableExport, rows }) => ({
  missingArtifacts: 0,
  missingArtifactNames: [],
  totalRows: Number(worktableExport?.summary?.decisionRowCount || rows.length),
  pendingRows: Number(worktableExport?.summary?.pendingRowCount || rows.filter(row => row.rowStatus === 'pending').length),
  suggestionRows: rows.filter(row => compact(row.recommendedNewAction)).length,
  approveCandidateSuggestions: countAction(rows, 'approve_candidate'),
  approveCardSuggestions: countAction(rows, 'approve_card'),
  recaptureSuggestions: countAction(rows, 'request_recapture'),
  needsReviewSuggestions: countAction(rows, 'mark_needs_review'),
  needsChangesSuggestions: countAction(rows, 'mark_needs_changes'),
  rejectSuggestions: rows.filter(row => /^reject/.test(row.recommendedNewAction)).length
});

const statusFor = rows =>
  rows.some(row => compact(row.recommendedNewAction))
    ? 'ready_for_human_review'
    : 'clear';

const buildOperationalHitlDecisionWorktableSuggestion = ({
  generatedAt = new Date().toISOString(),
  worktableExport = null,
  sourceArtifacts = {}
} = {}) => {
  if (!isContract(worktableExport, 'operational-hitl-decision-worktable-export/v1')) {
    return missingEvidenceReport({ generatedAt, sourceArtifacts });
  }

  const rows = asArray(worktableExport.rows).map(suggestionRowFor);
  const summary = summaryFor({ worktableExport, rows });
  const report = {
    schemaVersion: 1,
    contractVersion: 'operational-hitl-decision-worktable-suggestion/v1',
    generatedAt,
    sourceSystem: 'mold-master-ai',
    targetSystem: 'operator_common_agent',
    status: statusFor(rows),
    serviceWritesPerformed: false,
    localArtifactsWritten: true,
    policy: policy(),
    summary,
    columns: SUGGESTION_COLUMNS,
    rows,
    sources: {
      worktableExport: sourceArtifacts.worktableExport || null
    },
    recommendedAction: summary.suggestionRows > 0
      ? '추천 초안을 사람이 검토한 뒤 원본 worktable CSV의 newAction 및 필수 필드에 필요한 값만 옮겨 적고 npm run operational:hitl:worktable-import를 dry-run으로 실행하세요.'
      : '추가 추천 대상이 없습니다. 최신 HITL pipeline status를 확인하세요.'
  };

  return {
    ...report,
    csv: csvForRows(rows),
    markdown: markdownForRows({
      rows,
      summary,
      generatedAt
    })
  };
};

module.exports = {
  SUGGESTION_COLUMNS,
  buildOperationalHitlDecisionWorktableSuggestion
};
