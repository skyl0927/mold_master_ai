const asArray = value => Array.isArray(value) ? value : [];

const compact = value => String(value || '').replace(/\s+/g, ' ').trim();

const unique = values => [...new Set(asArray(values).map(compact).filter(Boolean))];

const numberFrom = (...values) => {
  const found = values.find(value => Number.isFinite(Number(value)));
  return found === undefined ? 0 : Number(found);
};

const isContract = (artifact, contractVersion) =>
  artifact?.contractVersion === contractVersion;

const valueAt = (object, fieldPath) =>
  compact(fieldPath).split('.').reduce((current, key) => current?.[key], object);

const policy = () => ({
  requiresHumanReview: true,
  autoVerifyAllowed: false,
  autoApplyAllowed: false,
  automaticServiceWritesAllowed: false,
  allowGraphPromotion: false,
  allowReferenceLearning: false,
  allowModelTraining: false
});

const missingEvidenceReport = (generatedAt, sourceArtifacts) => ({
  schemaVersion: 1,
  contractVersion: 'operational-hitl-editable-decision-preflight/v1',
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
    totalDecisionItems: 0,
    actionableDecisionCount: 0,
    pendingDecisionCount: 0,
    invalidActionCount: 0,
    missingRequiredFieldCount: 0,
    missingEditableFileCount: 0,
    invalidJsonFileCount: 0,
    readyForVerificationFileCount: 0,
    firstBlockedQueueCode: null
  },
  files: [],
  verificationCommandsReady: [],
  sources: {
    workspaceManifest: sourceArtifacts.workspaceManifest || null
  },
  recommendedAction: '먼저 npm run operational:hitl:editable-workspace로 수정용 decision workspace를 생성하세요.'
});

const parseEditablePacket = text => {
  if (typeof text !== 'string') {
    return { error: 'missing_editable_file', packet: null };
  }
  try {
    return { error: null, packet: JSON.parse(text.replace(/^\uFEFF/, '')) };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      packet: null
    };
  }
};

const decisionIdFor = (decision, editableFile, index) =>
  compact(decision?.[editableFile.decisionIdentifierField])
  || compact(decision?.conflictId)
  || compact(decision?.queueId)
  || compact(decision?.caseId)
  || `decision-${String(index + 1).padStart(3, '0')}`;

const requiredFieldsFor = (decision, editableFile) => {
  const action = compact(decision?.action);
  const fieldsByAction = decision?.requiredFieldsByAction || {};
  return unique(asArray(fieldsByAction[action]).length > 0
    ? fieldsByAction[action]
    : editableFile.requiredFields);
};

const valueForRequiredField = (field, decision, packet) => {
  if (field === 'reviewer.id') {
    return decision?.reviewer?.id
      || decision?.reviewerId
      || decision?.reviewedBy
      || packet?.reviewer?.id
      || packet?.reviewerId;
  }
  if (field === 'reviewerId') {
    return decision?.reviewerId
      || decision?.reviewedBy
      || packet?.reviewer?.id
      || packet?.reviewerId;
  }
  if (field === 'decidedAt') {
    return decision?.decidedAt
      || packet?.reviewedAt
      || packet?.reviewer?.reviewedAt;
  }
  if (field === 'reviewedAt') {
    return decision?.reviewedAt
      || decision?.decidedAt
      || packet?.reviewedAt
      || packet?.reviewer?.reviewedAt;
  }
  if (field === 'reviewComment') {
    return decision?.reviewComment || decision?.reason;
  }
  return valueAt(decision, field);
};

const isMissingRequiredValue = (field, value) => {
  if (field === 'action') return !compact(value) || compact(value) === 'pending';
  if (field === 'reviewComment') return compact(value).length < 8;
  if (/At$/.test(field)) return !Number.isFinite(Date.parse(String(value || '')));
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'boolean') return value !== true;
  return !compact(value);
};

const missingFieldsForDecision = ({ decision, packet, editableFile }) =>
  requiredFieldsFor(decision, editableFile)
    .filter(field => isMissingRequiredValue(
      field,
      valueForRequiredField(field, decision, packet)
    ))
    .map(field => ({
      decisionId: decisionIdFor(decision, editableFile, 0),
      action: compact(decision?.action),
      field
    }));

const statusForFile = ({
  missingFile,
  invalidJson,
  pendingDecisionCount,
  invalidActionCount,
  missingRequiredFieldCount
}) => {
  if (missingFile) return 'missing_editable_file';
  if (invalidJson) return 'invalid_json';
  if (invalidActionCount > 0) return 'invalid_decisions';
  if (missingRequiredFieldCount > 0) return 'incomplete_decisions';
  if (pendingDecisionCount > 0) return 'needs_human_input';
  return 'ready_for_verification';
};

const analyzeEditableFile = ({ editableFile, fileText }) => {
  const parsed = parseEditablePacket(fileText);
  if (parsed.error) {
    const missingFile = parsed.error === 'missing_editable_file';
    return {
      queueCode: compact(editableFile.queueCode),
      titleKo: compact(editableFile.titleKo),
      owner: compact(editableFile.owner),
      editablePath: compact(editableFile.editablePath),
      status: statusForFile({
        missingFile,
        invalidJson: !missingFile,
        pendingDecisionCount: 0,
        invalidActionCount: 0,
        missingRequiredFieldCount: 0
      }),
      totalDecisionItems: 0,
      actionableDecisionCount: 0,
      pendingDecisionCount: 0,
      invalidActionCount: 0,
      missingRequiredFieldCount: 0,
      pendingDecisionIds: [],
      invalidActions: [],
      missingRequiredFields: [],
      verifyCommand: compact(editableFile.verifyCommand),
      error: parsed.error
    };
  }

  const packet = parsed.packet || {};
  const decisions = asArray(packet.decisions);
  const allowedActions = new Set(unique(editableFile.allowedActions));
  const pendingDecisionIds = [];
  const invalidActions = [];
  const missingRequiredFields = [];
  let actionableDecisionCount = 0;

  decisions.forEach((decision, index) => {
    const action = compact(decision?.action);
    const decisionId = decisionIdFor(decision, editableFile, index);
    if (!action || action === 'pending') {
      pendingDecisionIds.push(decisionId);
      return;
    }
    if (!allowedActions.has(action)) {
      invalidActions.push({
        decisionId,
        action,
        allowedActions: [...allowedActions]
      });
      return;
    }
    actionableDecisionCount += 1;
    missingRequiredFields.push(...missingFieldsForDecision({
      decision,
      packet,
      editableFile
    }).map(item => ({
      ...item,
      decisionId
    })));
  });

  const status = statusForFile({
    missingFile: false,
    invalidJson: false,
    pendingDecisionCount: pendingDecisionIds.length,
    invalidActionCount: invalidActions.length,
    missingRequiredFieldCount: missingRequiredFields.length
  });

  return {
    queueCode: compact(editableFile.queueCode),
    titleKo: compact(editableFile.titleKo),
    owner: compact(editableFile.owner),
    editablePath: compact(editableFile.editablePath),
    status,
    totalDecisionItems: decisions.length,
    actionableDecisionCount,
    pendingDecisionCount: pendingDecisionIds.length,
    invalidActionCount: invalidActions.length,
    missingRequiredFieldCount: missingRequiredFields.length,
    pendingDecisionIds,
    invalidActions,
    missingRequiredFields,
    verifyCommand: compact(editableFile.verifyCommand),
    error: null
  };
};

const aggregateStatus = files => {
  if (files.some(file => ['missing_editable_file', 'invalid_json'].includes(file.status))) {
    return 'invalid_workspace';
  }
  if (files.some(file => file.status !== 'ready_for_verification')) {
    return 'needs_human_input';
  }
  return 'ready_for_verification';
};

const buildSummary = (workspaceManifest, files) => {
  const firstBlocked = files.find(file => file.status !== 'ready_for_verification');
  return {
    missingArtifacts: 0,
    missingArtifactNames: [],
    workspaceFileCount: files.length,
    totalDecisionItems: files.reduce((total, file) => total + file.totalDecisionItems, 0),
    actionableDecisionCount: files.reduce((total, file) => total + file.actionableDecisionCount, 0),
    pendingDecisionCount: files.reduce((total, file) => total + file.pendingDecisionCount, 0),
    invalidActionCount: files.reduce((total, file) => total + file.invalidActionCount, 0),
    missingRequiredFieldCount: files.reduce((total, file) => total + file.missingRequiredFieldCount, 0),
    missingEditableFileCount: files.filter(file => file.status === 'missing_editable_file').length,
    invalidJsonFileCount: files.filter(file => file.status === 'invalid_json').length,
    readyForVerificationFileCount: files.filter(file => file.status === 'ready_for_verification').length,
    firstBlockedQueueCode: firstBlocked?.queueCode || null,
    sourceWorkspaceStatus: compact(workspaceManifest.status) || null,
    sourceTotalDecisionInputsMissing: numberFrom(workspaceManifest.summary?.totalDecisionInputsMissing)
  };
};

const recommendedActionFor = (status, summary, files) => {
  if (status === 'ready_for_verification') {
    return '모든 editable decision file이 preflight를 통과했습니다. verificationCommandsReady를 순서대로 실행하세요.';
  }
  if (status === 'invalid_workspace') {
    return 'workspace 파일 누락 또는 JSON 오류를 먼저 수정하세요. 필요하면 npm run operational:hitl:editable-workspace를 다시 실행하세요.';
  }
  const first = files.find(file => file.queueCode === summary.firstBlockedQueueCode)
    || files.find(file => file.status !== 'ready_for_verification');
  return first
    ? `${first.queueCode}의 pending action 또는 필수 필드 누락을 먼저 수정하세요.`
    : 'editable decision file 입력 상태를 확인하세요.';
};

const buildOperationalHitlEditableDecisionPreflight = ({
  generatedAt = new Date().toISOString(),
  workspaceManifest = null,
  sourceArtifacts = {},
  readFileText = () => null
} = {}) => {
  if (!isContract(workspaceManifest, 'operational-hitl-editable-decision-workspace/v1')) {
    return missingEvidenceReport(generatedAt, sourceArtifacts);
  }

  const files = asArray(workspaceManifest.editableFiles).map(editableFile =>
    analyzeEditableFile({
      editableFile,
      fileText: readFileText(editableFile.editablePath)
    })
  );
  const status = aggregateStatus(files);
  const summary = buildSummary(workspaceManifest, files);

  return {
    schemaVersion: 1,
    contractVersion: 'operational-hitl-editable-decision-preflight/v1',
    generatedAt,
    sourceSystem: 'mold-master-ai',
    targetSystem: 'operator_common_agent',
    status,
    serviceWritesPerformed: false,
    localArtifactsWritten: true,
    policy: policy(),
    summary,
    files,
    verificationCommandsReady: files
      .filter(file => file.status === 'ready_for_verification')
      .map(file => file.verifyCommand)
      .filter(Boolean),
    sources: {
      workspaceManifest: sourceArtifacts.workspaceManifest || null
    },
    recommendedAction: recommendedActionFor(status, summary, files)
  };
};

module.exports = {
  buildOperationalHitlEditableDecisionPreflight
};
