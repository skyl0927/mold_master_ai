const asArray = value => Array.isArray(value) ? value : [];

const compact = value => String(value || '').replace(/\s+/g, ' ').trim();

const unique = values => [...new Set(asArray(values).map(compact).filter(Boolean))];

const numberFrom = (...values) => {
  const found = values.find(value => Number.isFinite(Number(value)));
  return found === undefined ? 0 : Number(found);
};

const isContract = (artifact, contractVersion) =>
  artifact?.contractVersion === contractVersion;

const policy = () => ({
  requiresHumanReview: true,
  autoApplyAllowed: false,
  automaticServiceWritesAllowed: false,
  allowGraphPromotion: false,
  allowReferenceLearning: false,
  allowModelTraining: false
});

const REVIEW_CHECKLIST = [
  '원본 이미지 또는 원문 근거 확인',
  'action을 pending에서 허용 action 중 하나로 변경',
  'reviewer.id 또는 reviewerId 입력',
  'decidedAt 또는 reviewedAt 입력',
  'reviewComment 8자 이상 입력',
  '검증 명령 실행 후 ready 상태 확인'
];

const missingEvidenceWorksheet = (generatedAt, sourceArtifacts) => ({
  schemaVersion: 1,
  contractVersion: 'operational-hitl-reviewer-worksheet/v1',
  generatedAt,
  sourceSystem: 'mold-master-ai',
  targetSystem: 'operator_common_agent',
  status: 'missing_evidence',
  serviceWritesPerformed: false,
  localArtifactsWritten: true,
  policy: policy(),
  summary: {
    missingArtifacts: 1,
    missingArtifactNames: ['inputReviewPacket'],
    sourceStatus: null,
    totalTemplateItems: 0,
    totalPendingActions: 0,
    targetDecisionInputsMissing: 0,
    firstQueueCode: null,
    nextReviewQueueCode: null,
    nextReviewDecisionId: null,
    nextReviewSourceArtifact: null,
    nextReviewVerificationCommand: null,
    worksheetSectionCount: 0,
    markdownLineCount: 0
  },
  reviewChecklist: [],
  nextReviewCursor: null,
  nextReviewSlip: null,
  markdown: '',
  markdownPath: null,
  sources: {
    inputReviewPacket: sourceArtifacts.inputReviewPacket || null
  },
  recommendedAction: '먼저 npm run operational:hitl:decision-review-packet으로 입력 검토 패킷을 생성하세요.'
});

const statusFor = inputReviewPacket => {
  const summary = inputReviewPacket.summary || {};
  if (
    numberFrom(summary.targetDecisionInputsMissing) > 0
    || numberFrom(summary.totalPendingActions) > 0
  ) {
    return 'ready_for_human_review';
  }
  return 'ready_for_verification';
};

const sourceLine = section =>
  compact(section.sourceArtifact)
    ? `- 입력 파일: ${compact(section.sourceArtifact)}`
    : '- 입력 파일: 확인 필요';

const previewLine = section => {
  const ids = unique(section.decisionIdsPreview);
  return ids.length > 0
    ? `- 결정 ID 미리보기: ${ids.join(', ')}`
    : `- 결정 ID 미리보기: ${compact(section.decisionIdentifierField) || 'id'} 기준으로 입력 파일 확인`;
};

const truncatedLine = section => {
  const truncated = numberFrom(section.decisionIdsTruncated);
  return truncated > 0 ? [`- 추가 미표시: ${truncated}`] : [];
};

const commandBlock = command => compact(command)
  ? [
      '- 검증 명령:',
      '```powershell',
      compact(command),
      '```'
    ]
  : ['- 검증 명령: 입력 패킷에서 확인 필요'];

const sectionMarkdown = (section, index) => [
  `### ${index + 1}. ${compact(section.queueCode)}`,
  '',
  `- 제목: ${compact(section.titleKo) || compact(section.queueCode)}`,
  `- 담당: ${compact(section.owner) || 'quality_hitl'}`,
  `- 상태: ${compact(section.status) || 'awaiting_human_input'}`,
  `- 준비 항목: ${numberFrom(section.preparedDecisionItems)}`,
  `- 남은 입력: ${numberFrom(section.targetPending)}`,
  `- pending action: ${numberFrom(section.pendingActions)}`,
  `- 허용 action: ${unique(section.allowedActions).join(', ') || '입력 파일 확인'}`,
  `- 필수 필드: ${unique(section.requiredFields).join(', ') || '입력 파일 확인'}`,
  previewLine(section),
  ...truncatedLine(section),
  sourceLine(section),
  ...commandBlock(section.verificationCommand),
  `- 작업 지시: ${compact(section.nextActionKo) || '판정 파일을 채우고 검증 명령을 실행하세요.'}`,
  ''
];

const reviewOrderMarkdown = inputReviewPacket =>
  asArray(inputReviewPacket.reviewOrder).map(item =>
    `${numberFrom(item.priority)}. ${compact(item.queueCode)} - ${compact(item.titleKo)} / 남은 입력 ${numberFrom(item.targetPending)} / 담당 ${compact(item.owner)}`
  );

const nextReviewCursorFor = inputReviewPacket => {
  const sections = asArray(inputReviewPacket.sections);
  const reviewOrderCodes = asArray(inputReviewPacket.reviewOrder)
    .map(item => compact(item.queueCode))
    .filter(Boolean);
  const sectionsByCode = new Map(sections.map(section => [compact(section.queueCode), section]));
  const orderedSections = [
    ...reviewOrderCodes.map(code => sectionsByCode.get(code)).filter(Boolean),
    ...sections.filter(section => !reviewOrderCodes.includes(compact(section.queueCode)))
  ];
  const section = orderedSections.find(item =>
    numberFrom(item?.targetPending) > 0 || numberFrom(item?.pendingActions) > 0
  );
  if (!section) return null;

  return {
    queueCode: compact(section.queueCode),
    titleKo: compact(section.titleKo),
    owner: compact(section.owner) || 'quality_hitl',
    decisionIdentifierField: compact(section.decisionIdentifierField) || 'decisionId',
    decisionId: unique(section.decisionIdsPreview)[0] || '',
    sourceArtifact: compact(section.sourceArtifact),
    verificationCommand: compact(section.verificationCommand),
    requiredFields: unique(section.requiredFields),
    allowedActions: unique(section.allowedActions),
    nextActionKo: compact(section.nextActionKo)
  };
};

const nextReviewCursorMarkdown = cursor => {
  if (!cursor) {
    return [
      '## Next HITL Review Cursor',
      '',
      '- status: no pending review cursor',
      ''
    ];
  }
  return [
    '## Next HITL Review Cursor',
    '',
    `- queue: ${cursor.queueCode || 'unknown'}`,
    `- decision id: ${cursor.decisionId || 'check source file'}`,
    `- source file: ${cursor.sourceArtifact || 'check input packet'}`,
    `- verification command: ${cursor.verificationCommand || 'check input packet'}`,
    `- required fields: ${asArray(cursor.requiredFields).join(', ') || 'check input packet'}`,
    `- allowed actions: ${asArray(cursor.allowedActions).join(', ') || 'check input packet'}`,
    ''
  ];
};

const nextReviewSlipFor = cursor => {
  if (!cursor) return null;

  const queueCode = compact(cursor.queueCode) || 'review_required';
  const decisionId = compact(cursor.decisionId) || 'source file 확인 필요';
  return {
    titleKo: `다음 HITL 판정: ${queueCode} / ${decisionId}`,
    queueCode,
    decisionId,
    owner: compact(cursor.owner) || 'quality_hitl',
    sourceArtifact: compact(cursor.sourceArtifact),
    verificationCommand: compact(cursor.verificationCommand),
    requiredFields: unique(cursor.requiredFields),
    allowedActions: unique(cursor.allowedActions),
    operatorInstructionsKo: [
      `source file에서 ${decisionId} 항목을 찾으세요.`,
      '원본 이미지/텍스트 근거를 확인하고 allowed action 중 하나만 선택하세요.',
      'required fields를 모두 채운 뒤 verification command를 실행하세요.',
      '검증이 ready가 되기 전에는 Graph, Reference, Model 학습에 반영하지 마세요.'
    ],
    safetyNoticeKo: 'Artifact-only 안내입니다. 자동 적용, Graph 승격, Reference 학습, Model 학습은 모두 금지됩니다.'
  };
};

const nextReviewSlipMarkdown = slip => {
  if (!slip) return [];

  return [
    '## Next HITL Review Slip',
    '',
    `- title: ${slip.titleKo}`,
    `- owner: ${slip.owner}`,
    `- source file: ${slip.sourceArtifact || 'check input packet'}`,
    `- verification command: ${slip.verificationCommand || 'check input packet'}`,
    '- operator instructions:',
    ...asArray(slip.operatorInstructionsKo).map(item => `  - ${item}`),
    `- safety: ${slip.safetyNoticeKo}`,
    ''
  ];
};

const markdownFor = (inputReviewPacket, generatedAt) => {
  const summary = inputReviewPacket.summary || {};
  const sections = asArray(inputReviewPacket.sections);
  const nextReviewCursor = nextReviewCursorFor(inputReviewPacket);
  const nextReviewSlip = nextReviewSlipFor(nextReviewCursor);
  const lines = [
    '# Operational HITL Reviewer Worksheet',
    '',
    `- 생성 시각: ${generatedAt}`,
    `- 입력 패킷 상태: ${compact(inputReviewPacket.status) || 'unknown'}`,
    `- 남은 입력: ${numberFrom(summary.targetDecisionInputsMissing)}`,
    `- 전체 template 항목: ${numberFrom(summary.totalTemplateItems)}`,
    `- pending action: ${numberFrom(summary.totalPendingActions)}`,
    `- 첫 처리 큐: ${compact(summary.firstQueueCode) || '없음'}`,
    '- 안전 정책: 자동 적용 금지, 서비스 쓰기 없음, Graph/Reference/Model 승격 금지',
    '',
    ...nextReviewCursorMarkdown(nextReviewCursor),
    ...nextReviewSlipMarkdown(nextReviewSlip),
    '## 리뷰 공통 체크리스트',
    '',
    ...REVIEW_CHECKLIST.map(item => `- ${item}`),
    '',
    '## 리뷰 순서',
    '',
    ...reviewOrderMarkdown(inputReviewPacket),
    '',
    '## 큐별 작성 가이드',
    '',
    ...sections.flatMap(sectionMarkdown),
    '## 검증 명령 모음',
    '',
    ...unique(inputReviewPacket.humanGatedCommands).flatMap(command => [
      '```powershell',
      command,
      '```',
      ''
    ]),
    '## 주의',
    '',
    '- 이 워크시트는 사람이 판정 파일을 작성하기 위한 안내 산출물입니다.',
    '- 이 워크시트 생성만으로 Common Agent, SQL, Graph DB, Reference store, 모델 학습에는 반영되지 않습니다.'
  ];
  return `${lines.join('\n')}\n`;
};

const buildOperationalHitlReviewerWorksheet = ({
  generatedAt = new Date().toISOString(),
  inputReviewPacket = null,
  sourceArtifacts = {},
  markdownPath = null
} = {}) => {
  if (!isContract(inputReviewPacket, 'operational-hitl-decision-input-review-packet/v1')) {
    return missingEvidenceWorksheet(generatedAt, sourceArtifacts);
  }

  const sections = asArray(inputReviewPacket.sections);
  const summary = inputReviewPacket.summary || {};
  const nextReviewCursor = nextReviewCursorFor(inputReviewPacket);
  const nextReviewSlip = nextReviewSlipFor(nextReviewCursor);
  const markdown = markdownFor(inputReviewPacket, generatedAt);
  const lineCount = markdown.split(/\r?\n/).filter(line => line.length > 0).length;

  return {
    schemaVersion: 1,
    contractVersion: 'operational-hitl-reviewer-worksheet/v1',
    generatedAt,
    sourceSystem: 'mold-master-ai',
    targetSystem: 'operator_common_agent',
    status: statusFor(inputReviewPacket),
    serviceWritesPerformed: false,
    localArtifactsWritten: true,
    policy: policy(),
    summary: {
      missingArtifacts: 0,
      missingArtifactNames: [],
      sourceStatus: compact(inputReviewPacket.status) || null,
      totalTemplateItems: numberFrom(summary.totalTemplateItems),
      totalPendingActions: numberFrom(summary.totalPendingActions),
      targetDecisionInputsMissing: numberFrom(summary.targetDecisionInputsMissing),
      firstQueueCode: compact(summary.firstQueueCode) || null,
      nextReviewQueueCode: nextReviewCursor?.queueCode || null,
      nextReviewDecisionId: nextReviewCursor?.decisionId || null,
      nextReviewSourceArtifact: nextReviewCursor?.sourceArtifact || null,
      nextReviewVerificationCommand: nextReviewCursor?.verificationCommand || null,
      worksheetSectionCount: sections.length,
      markdownLineCount: lineCount
    },
    reviewChecklist: REVIEW_CHECKLIST,
    nextReviewCursor,
    nextReviewSlip,
    markdown,
    markdownPath,
    sources: {
      inputReviewPacket: sourceArtifacts.inputReviewPacket || null
    },
    recommendedAction: summary.firstQueueCode
      ? `${summary.firstQueueCode}부터 워크시트 순서대로 decision file을 채우고 검증 명령을 실행하세요.`
      : '워크시트의 검증 명령을 순서대로 실행해 decision file 상태를 확인하세요.'
  };
};

module.exports = {
  REVIEW_CHECKLIST,
  buildOperationalHitlReviewerWorksheet
};
