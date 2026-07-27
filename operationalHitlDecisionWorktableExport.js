const asArray = value => Array.isArray(value) ? value : [];

const compact = value => String(value || '').replace(/\s+/g, ' ').trim();

const unique = values => [...new Set(asArray(values).map(compact).filter(Boolean))];

const numberFrom = (...values) => {
  const found = values.find(value => Number.isFinite(Number(value)));
  return found === undefined ? 0 : Number(found);
};

const isContract = (artifact, contractVersion) =>
  artifact?.contractVersion === contractVersion;

const COLUMNS = [
  'queueCode',
  'decisionId',
  'titleKo',
  'owner',
  'currentAction',
  'rowStatus',
  'newAction',
  'displayLabel',
  'allowedActions',
  'requiredFields',
  'reviewFocusKo',
  'reviewerId',
  'reviewerName',
  'decidedAt',
  'reviewComment',
  'selectedLabel',
  'approvedDefectType',
  'imageSetConfirmed',
  'labelConfirmed',
  'manufacturingImageConfirmed',
  'confirmed',
  'requestedViews',
  'causeCandidates',
  'causeLabels',
  'checkItems',
  'actions',
  'editablePath',
  'verificationCommand'
];

const policy = () => ({
  requiresHumanReview: true,
  autoVerifyAllowed: false,
  autoApplyAllowed: false,
  automaticServiceWritesAllowed: false,
  allowGraphPromotion: false,
  allowReferenceLearning: false,
  allowModelTraining: false
});

const missingEvidenceExport = (generatedAt, sourceArtifacts) => ({
  schemaVersion: 1,
  contractVersion: 'operational-hitl-decision-worktable-export/v1',
  generatedAt,
  sourceSystem: 'mold-master-ai',
  targetSystem: 'operator_common_agent',
  status: 'missing_evidence',
  serviceWritesPerformed: false,
  localArtifactsWritten: true,
  policy: policy(),
  summary: {
    missingArtifacts: 1,
    missingArtifactNames: ['workspaceManifest'],
    workspaceFileCount: 0,
    decisionRowCount: 0,
    pendingRowCount: 0,
    actionableRowCount: 0,
    missingEditableFileCount: 0,
    invalidJsonFileCount: 0,
    queueCount: 0
  },
  columns: COLUMNS,
  rows: [],
  csv: '',
  markdown: '',
  sources: {
    workspaceManifest: sourceArtifacts.workspaceManifest || null
  },
  recommendedAction: '먼저 npm run operational:hitl:editable-workspace로 수정용 HITL decision workspace를 생성하세요.'
});

const parseEditablePacket = fileText => {
  if (typeof fileText !== 'string') {
    return { status: 'missing_editable_file', packet: null, error: 'missing_editable_file' };
  }
  try {
    return {
      status: 'ok',
      packet: JSON.parse(fileText.replace(/^\uFEFF/, '')),
      error: null
    };
  } catch (error) {
    return {
      status: 'invalid_json',
      packet: null,
      error: error instanceof Error ? error.message : String(error)
    };
  }
};

const decisionIdFor = (decision, editableFile, index) =>
  compact(decision?.[editableFile.decisionIdentifierField])
  || compact(decision?.conflictId)
  || compact(decision?.queueId)
  || compact(decision?.caseId)
  || `decision-${String(index + 1).padStart(3, '0')}`;

const currentActionFor = decision =>
  compact(decision?.action) || 'pending';

const rowStatusFor = decision => {
  const action = currentActionFor(decision);
  return action === 'pending' ? 'pending' : 'action_entered';
};

const displayLabelFor = decision => {
  const candidateLabels = unique(decision?.candidateLabels);
  if (candidateLabels.length > 0) return candidateLabels.join(' | ');

  const defectType = compact(decision?.defectType || decision?.reviewedDefectName);
  const defectClass = compact(decision?.defectClass);
  if (defectType && defectClass) return `${defectType} / ${defectClass}`;
  return defectType || defectClass || compact(decision?.caseId) || '';
};

const reviewFocusFor = decision => compact(
  decision?.evidence?.humanReviewFocusKo
  || decision?.evidence?.visionSummary
  || decision?.reviewerGuidance
  || asArray(decision?.instructionsKo)[0]
  || decision?.reviewedProblem
);

const reviewerIdFor = decision => compact(
  decision?.reviewerId
  || decision?.reviewedBy
  || decision?.reviewer?.id
);

const reviewerNameFor = decision => compact(
  decision?.reviewerName
  || decision?.reviewer?.name
);

const csvListFor = values => unique(values).join(' | ');

const fieldsByActionFor = decision =>
  Object.values(decision?.requiredFieldsByAction || {}).flatMap(asArray);

const requiredFieldsFor = (decision, editableFile) =>
  unique(fieldsByActionFor(decision).length > 0
    ? fieldsByActionFor(decision)
    : editableFile.requiredFields);

const allowedActionsFor = (decision, editableFile) =>
  unique(asArray(decision?.allowedActions).length > 0
    ? decision.allowedActions
    : editableFile.allowedActions);

const blockedRowFor = ({ editableFile, rowStatus, error }) => ({
  queueCode: compact(editableFile.queueCode),
  decisionId: compact(editableFile.queueCode) || 'unknown',
  titleKo: compact(editableFile.titleKo),
  owner: compact(editableFile.owner),
  currentAction: '',
  newAction: '',
  rowStatus,
  displayLabel: '',
  allowedActions: unique(editableFile.allowedActions).join(' | '),
  requiredFields: unique(editableFile.requiredFields).join(' | '),
  reviewFocusKo: compact(error),
  reviewerId: '',
  reviewerName: '',
  decidedAt: '',
  reviewComment: '',
  selectedLabel: '',
  approvedDefectType: '',
  imageSetConfirmed: '',
  labelConfirmed: '',
  manufacturingImageConfirmed: '',
  confirmed: '',
  requestedViews: '',
  causeCandidates: '',
  causeLabels: '',
  checkItems: '',
  actions: '',
  editablePath: compact(editableFile.editablePath),
  verificationCommand: compact(editableFile.verifyCommand)
});

const rowsForEditableFile = ({ editableFile, fileText }) => {
  const parsed = parseEditablePacket(fileText);
  if (parsed.status !== 'ok') {
    return [blockedRowFor({
      editableFile,
      rowStatus: parsed.status,
      error: parsed.error
    })];
  }

  const decisions = asArray(parsed.packet?.decisions);
  if (decisions.length === 0) {
    return [blockedRowFor({
      editableFile,
      rowStatus: 'empty_decision_file',
      error: 'decisions 배열이 비어 있습니다.'
    })];
  }

  return decisions.map((decision, index) => ({
    queueCode: compact(editableFile.queueCode),
    decisionId: decisionIdFor(decision, editableFile, index),
    titleKo: compact(editableFile.titleKo),
    owner: compact(editableFile.owner),
    currentAction: currentActionFor(decision),
    newAction: '',
    rowStatus: rowStatusFor(decision),
    displayLabel: displayLabelFor(decision),
    allowedActions: allowedActionsFor(decision, editableFile).join(' | '),
    requiredFields: requiredFieldsFor(decision, editableFile).join(' | '),
    reviewFocusKo: reviewFocusFor(decision),
    reviewerId: reviewerIdFor(decision),
    reviewerName: reviewerNameFor(decision),
    decidedAt: compact(decision?.decidedAt || decision?.reviewedAt),
    reviewComment: compact(decision?.reviewComment || decision?.reason),
    selectedLabel: compact(decision?.selectedLabel),
    approvedDefectType: compact(decision?.approvedDefectType),
    imageSetConfirmed: decision?.imageSetConfirmed === true ? 'true' : '',
    labelConfirmed: decision?.labelConfirmed === true ? 'true' : '',
    manufacturingImageConfirmed: decision?.manufacturingImageConfirmed === true ? 'true' : '',
    confirmed: decision?.confirmed === true ? 'true' : '',
    requestedViews: csvListFor(decision?.requestedViews || decision?.requiredViews),
    causeCandidates: csvListFor(decision?.causeCandidates),
    causeLabels: csvListFor(decision?.causeLabels),
    checkItems: csvListFor(decision?.checkItems),
    actions: csvListFor(decision?.actions),
    editablePath: compact(editableFile.editablePath),
    verificationCommand: compact(editableFile.verifyCommand)
  }));
};

const csvCell = value => {
  const text = String(value ?? '');
  return /[",\r\n|]/.test(text)
    ? `"${text.replace(/"/g, '""')}"`
    : text;
};

const csvForRows = rows => [
  COLUMNS.join(','),
  ...rows.map(row => COLUMNS.map(column => csvCell(row[column])).join(','))
].join('\n') + '\n';

const markdownForRows = (rows, summary, generatedAt) => {
  const lines = [
    '# Operational HITL Decision Worktable',
    '',
    `- 생성 시각: ${generatedAt}`,
    `- decision row: ${summary.decisionRowCount}`,
    `- pending row: ${summary.pendingRowCount}`,
    `- action entered row: ${summary.actionableRowCount}`,
    '- 안전 정책: 자동 적용 금지, 자동 검증 실행 없음, Graph/Reference/Model 승격 금지',
    '',
    '| Queue | Decision ID | Action | Status | Label | Review Focus |',
    '|---|---|---|---|---|---|'
  ];

  rows.forEach(row => {
    const cells = [
      row.queueCode,
      row.decisionId,
      row.currentAction,
      row.rowStatus,
      row.displayLabel,
      row.reviewFocusKo
    ].map(value => compact(value).replace(/\|/g, '/').replace(/\r?\n/g, ' '));
    lines.push(`| ${cells.join(' | ')} |`);
  });

  lines.push(
    '',
    '## 검증 명령',
    '',
    ...unique(rows.map(row => row.verificationCommand)).filter(Boolean).flatMap(command => [
      '```powershell',
      command,
      '```',
      ''
    ])
  );

  return `${lines.join('\n')}\n`;
};

const statusFor = rows => {
  if (rows.some(row => row.rowStatus === 'missing_editable_file')) {
    return 'blocked_missing_editable_files';
  }
  if (rows.some(row => row.rowStatus === 'invalid_json')) {
    return 'blocked_invalid_json';
  }
  return rows.some(row => row.rowStatus === 'pending')
    ? 'ready_for_human_edit'
    : 'ready_for_preflight';
};

const summaryFor = (workspaceManifest, rows) => ({
  missingArtifacts: 0,
  missingArtifactNames: [],
  workspaceFileCount: numberFrom(
    workspaceManifest.summary?.workspaceFileCount,
    asArray(workspaceManifest.editableFiles).length
  ),
  decisionRowCount: rows.length,
  pendingRowCount: rows.filter(row => row.rowStatus === 'pending').length,
  actionableRowCount: rows.filter(row => row.rowStatus === 'action_entered').length,
  missingEditableFileCount: rows.filter(row => row.rowStatus === 'missing_editable_file').length,
  invalidJsonFileCount: rows.filter(row => row.rowStatus === 'invalid_json').length,
  queueCount: new Set(rows.map(row => row.queueCode).filter(Boolean)).size,
  sourceTotalDecisionInputsMissing: numberFrom(workspaceManifest.summary?.totalDecisionInputsMissing),
  firstEditableQueueCode: compact(workspaceManifest.summary?.firstEditableQueueCode) || null
});

const buildOperationalHitlDecisionWorktableExport = ({
  generatedAt = new Date().toISOString(),
  workspaceManifest = null,
  sourceArtifacts = {},
  readFileText = () => null
} = {}) => {
  if (!isContract(workspaceManifest, 'operational-hitl-editable-decision-workspace/v1')) {
    return missingEvidenceExport(generatedAt, sourceArtifacts);
  }

  const rows = asArray(workspaceManifest.editableFiles).flatMap(editableFile =>
    rowsForEditableFile({
      editableFile,
      fileText: readFileText(editableFile.editablePath)
    })
  );
  const summary = summaryFor(workspaceManifest, rows);

  return {
    schemaVersion: 1,
    contractVersion: 'operational-hitl-decision-worktable-export/v1',
    generatedAt,
    sourceSystem: 'mold-master-ai',
    targetSystem: 'operator_common_agent',
    status: statusFor(rows),
    serviceWritesPerformed: false,
    localArtifactsWritten: true,
    policy: policy(),
    summary,
    columns: COLUMNS,
    rows,
    csv: csvForRows(rows),
    markdown: markdownForRows(rows, summary, generatedAt),
    sources: {
      workspaceManifest: sourceArtifacts.workspaceManifest || null
    },
    recommendedAction: statusFor(rows).startsWith('blocked_')
      ? 'workspace editable file 누락 또는 JSON 오류를 먼저 수정하세요. 필요하면 npm run operational:hitl:editable-workspace를 다시 실행하세요.'
      : summary.pendingRowCount > 0
        ? 'CSV/Markdown 작업표를 기준으로 pending row를 채운 뒤 operational:hitl:editable-preflight를 다시 실행하세요.'
        : 'CSV/Markdown 작업표 기준으로 action 입력이 끝났습니다. operational:hitl:editable-preflight를 실행하세요.'
  };
};

module.exports = {
  COLUMNS,
  buildOperationalHitlDecisionWorktableExport
};
