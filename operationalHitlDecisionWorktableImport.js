const asArray = value => Array.isArray(value) ? value : [];

const compact = value => String(value || '').replace(/\s+/g, ' ').trim();

const unique = values => [...new Set(asArray(values).map(compact).filter(Boolean))];

const isContract = (artifact, contractVersion) =>
  artifact?.contractVersion === contractVersion;

const valueAt = (object, fieldPath) =>
  compact(fieldPath).split('.').reduce((current, key) => current?.[key], object);

const policy = () => ({
  requiresHumanReview: true,
  explicitApplyRequired: true,
  autoVerifyAllowed: false,
  autoApplyAllowed: false,
  automaticServiceWritesAllowed: false,
  allowGraphPromotion: false,
  allowReferenceLearning: false,
  allowModelTraining: false
});

const missingEvidenceReport = (generatedAt, sourceArtifacts, missingArtifactNames) => ({
  schemaVersion: 1,
  contractVersion: 'operational-hitl-decision-worktable-import/v1',
  generatedAt,
  sourceSystem: 'mold-master-ai',
  targetSystem: 'operator_common_agent',
  status: 'missing_evidence',
  applyRequested: false,
  serviceWritesPerformed: false,
  localArtifactsWritten: true,
  localEditableWritesPerformed: false,
  policy: policy(),
  summary: {
    missingArtifacts: missingArtifactNames.length,
    missingArtifactNames,
    totalRows: 0,
    actionableRows: 0,
    plannedUpdates: 0,
    appliedUpdates: 0,
    filesToUpdate: 0,
    invalidRows: 0,
    missingRequiredFieldRows: 0,
    unchangedRows: 0
  },
  plannedUpdates: [],
  invalidRows: [],
  writtenFiles: [],
  verificationCommandsReady: [],
  sources: {
    workspaceManifest: sourceArtifacts.workspaceManifest || null,
    worktableCsv: sourceArtifacts.worktableCsv || null
  },
  recommendedAction: '먼저 npm run operational:hitl:worktable-export로 CSV 작업표를 만들고, 수정용 workspace manifest와 함께 다시 실행하세요.'
});

const parseCsv = text => {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  for (let index = 0; index < String(text || '').length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (inQuotes) {
      if (char === '"' && next === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      continue;
    }
    if (char === ',') {
      row.push(cell);
      cell = '';
      continue;
    }
    if (char === '\n') {
      row.push(cell.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      cell = '';
      continue;
    }
    cell += char;
  }

  if (cell || row.length > 0) {
    row.push(cell.replace(/\r$/, ''));
    rows.push(row);
  }

  const nonEmptyRows = rows.filter(items =>
    items.some(item => compact(item))
  );
  if (nonEmptyRows.length === 0) return { headers: [], rows: [] };

  const headers = nonEmptyRows[0].map(compact);
  return {
    headers,
    rows: nonEmptyRows.slice(1).map((items, rowIndex) => {
      const output = { __rowNumber: rowIndex + 2 };
      headers.forEach((header, index) => {
        output[header] = items[index] ?? '';
      });
      return output;
    })
  };
};

const parseJsonPacket = (text, editableFile) => {
  if (typeof text !== 'string') {
    return {
      error: {
        queueCode: compact(editableFile.queueCode),
        decisionId: '',
        rowNumber: 0,
        code: 'missing_editable_file',
        message: 'workspace editable decision file을 읽을 수 없습니다.'
      },
      packet: null
    };
  }
  try {
    return {
      error: null,
      packet: JSON.parse(text.replace(/^\uFEFF/, ''))
    };
  } catch (error) {
    return {
      error: {
        queueCode: compact(editableFile.queueCode),
        decisionId: '',
        rowNumber: 0,
        code: 'invalid_editable_json',
        message: error instanceof Error ? error.message : String(error)
      },
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

const actionFromRow = row => compact(
  row.newAction
  || row.action
);

const parseBoolean = value => {
  const normalized = compact(value).toLowerCase();
  if (!normalized) return undefined;
  if (['true', '1', 'yes', 'y', 'ok', '확인', '예', '네', '승인'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n', '아니오', '아니요', '미확인'].includes(normalized)) return false;
  return undefined;
};

const splitList = value => unique(String(value || '')
  .split(/\r?\n|[;|]/)
  .map(item => item.trim()));

const textField = (row, field) => {
  const value = row[field];
  return compact(value) ? compact(value) : undefined;
};

const listField = (row, field) => {
  const values = splitList(row[field]);
  return values.length > 0 ? values : undefined;
};

const boolField = (row, field) => parseBoolean(row[field]);

const knownFieldUpdates = row => {
  const updates = {};
  const action = actionFromRow(row);
  if (!action || action === 'pending') return updates;
  updates.action = action;

  [
    'reviewerId',
    'reviewerName',
    'decidedAt',
    'reviewComment',
    'selectedLabel',
    'approvedDefectType',
    'reviewedDefectName',
    'reviewedProblem',
    'reviewedPhenomenon'
  ].forEach(field => {
    const value = textField(row, field);
    if (value !== undefined) updates[field] = value;
  });

  [
    'imageSetConfirmed',
    'labelConfirmed',
    'manufacturingImageConfirmed',
    'confirmed'
  ].forEach(field => {
    const value = boolField(row, field);
    if (value !== undefined) updates[field] = value;
  });

  [
    'requestedViews',
    'causeCandidates',
    'causeLabels',
    'checkItems',
    'actions'
  ].forEach(field => {
    const value = listField(row, field);
    if (value !== undefined) updates[field] = value;
  });

  return updates;
};

const hasUpdates = updates => Object.keys(updates).length > 0;

const requiredHeaderMissing = headers =>
  ['queueCode', 'decisionId'].filter(header => !headers.includes(header));

const requiredFieldsForAction = ({ action, target }) => {
  const fieldsByAction = target.decision?.requiredFieldsByAction || {};
  return unique(asArray(fieldsByAction[action]).length > 0
    ? fieldsByAction[action]
    : target.fileRecord.editableFile.requiredFields);
};

const valueForRequiredField = ({ field, updates, target }) => {
  const decision = target.decision || {};
  const packet = target.fileRecord.packet || {};
  if (field === 'action') return updates.action || decision.action;
  if (field === 'reviewer.id') {
    return updates.reviewerId
      || decision.reviewer?.id
      || decision.reviewerId
      || decision.reviewedBy
      || packet.reviewer?.id
      || packet.reviewerId;
  }
  if (field === 'reviewerId') {
    return updates.reviewerId
      || decision.reviewerId
      || decision.reviewedBy
      || packet.reviewer?.id
      || packet.reviewerId;
  }
  if (field === 'decidedAt') {
    return updates.decidedAt
      || decision.decidedAt
      || packet.reviewedAt
      || packet.reviewer?.reviewedAt;
  }
  if (field === 'reviewedAt') {
    return updates.reviewedAt
      || updates.decidedAt
      || decision.reviewedAt
      || decision.decidedAt
      || packet.reviewedAt
      || packet.reviewer?.reviewedAt;
  }
  if (Object.prototype.hasOwnProperty.call(updates, field)) return updates[field];
  if (field === 'reviewComment') return updates.reviewComment || decision.reviewComment || decision.reason;
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

const missingRequiredFieldsFor = ({ action, updates, target }) =>
  requiredFieldsForAction({ action, target }).filter(field =>
    isMissingRequiredValue(field, valueForRequiredField({
      field,
      updates,
      target
    }))
  );

const buildWorkspaceIndex = ({ workspaceManifest, readFileText }) => {
  const invalidRows = [];
  const files = new Map();
  const decisions = new Map();

  asArray(workspaceManifest.editableFiles).forEach(editableFile => {
    const parsed = parseJsonPacket(readFileText(editableFile.editablePath), editableFile);
    if (parsed.error) {
      invalidRows.push(parsed.error);
      return;
    }
    const packet = parsed.packet || {};
    const decisionList = asArray(packet.decisions);
    const fileRecord = {
      editableFile,
      packet,
      decisions: decisionList,
      changed: false
    };
    files.set(compact(editableFile.queueCode), fileRecord);
    decisionList.forEach((decision, index) => {
      const decisionId = decisionIdFor(decision, editableFile, index);
      decisions.set(`${compact(editableFile.queueCode)}|${decisionId}`, {
        fileRecord,
        decision,
        decisionId,
        index
      });
    });
  });

  return { files, decisions, invalidRows };
};

const invalidRow = (row, code, message) => ({
  rowNumber: row.__rowNumber,
  queueCode: compact(row.queueCode),
  decisionId: compact(row.decisionId),
  action: actionFromRow(row),
  code,
  message
});

const buildPlans = ({ rows, workspaceIndex }) => {
  const plannedUpdates = [];
  const invalidRows = [...workspaceIndex.invalidRows];
  let unchangedRows = 0;

  rows.forEach(row => {
    const queueCode = compact(row.queueCode);
    const decisionId = compact(row.decisionId);
    const action = actionFromRow(row);
    const updates = knownFieldUpdates(row);
    if (!hasUpdates(updates)) {
      unchangedRows += 1;
      return;
    }

    const target = workspaceIndex.decisions.get(`${queueCode}|${decisionId}`);
    if (!target) {
      invalidRows.push(invalidRow(row, 'unknown_decision', 'CSV row의 queueCode/decisionId가 workspace decision과 매칭되지 않습니다.'));
      return;
    }

    const allowedActions = new Set(unique(target.fileRecord.editableFile.allowedActions));
    if (action && action !== 'pending' && !allowedActions.has(action)) {
      invalidRows.push(invalidRow(row, 'unsupported_action', 'CSV row의 action이 해당 queue에서 허용되지 않습니다.'));
      return;
    }

    const missingRequiredFields = action && action !== 'pending'
      ? missingRequiredFieldsFor({
        action,
        updates,
        target
      })
      : [];
    if (missingRequiredFields.length > 0) {
      invalidRows.push({
        ...invalidRow(row, 'missing_required_fields', '선택한 action에 필요한 필수 검토 필드가 CSV/기존 decision 값에 부족합니다.'),
        missingFields: missingRequiredFields
      });
      return;
    }

    plannedUpdates.push({
      rowNumber: row.__rowNumber,
      queueCode,
      decisionId,
      editablePath: compact(target.fileRecord.editableFile.editablePath),
      action: updates.action || compact(target.decision.action),
      fieldUpdates: updates,
      requiredFieldsChecked: requiredFieldsForAction({
        action: updates.action || compact(target.decision.action),
        target
      }),
      verifyCommand: compact(target.fileRecord.editableFile.verifyCommand)
    });
  });

  return { plannedUpdates, invalidRows, unchangedRows };
};

const applyUpdates = ({ plannedUpdates, workspaceIndex, writeFileText }) => {
  const updatesByDecision = new Map(plannedUpdates.map(update => [
    `${update.queueCode}|${update.decisionId}`,
    update
  ]));

  workspaceIndex.decisions.forEach((target, key) => {
    const update = updatesByDecision.get(key);
    if (!update) return;
    Object.assign(target.decision, update.fieldUpdates);
    target.fileRecord.changed = true;
  });

  const writtenFiles = [];
  workspaceIndex.files.forEach(fileRecord => {
    if (!fileRecord.changed) return;
    const filePath = compact(fileRecord.editableFile.editablePath);
    const text = `${JSON.stringify(fileRecord.packet, null, 2)}\n`;
    writeFileText(filePath, text);
    writtenFiles.push({
      path: filePath,
      queueCode: compact(fileRecord.editableFile.queueCode),
      decisionCount: fileRecord.decisions.length,
      byteLength: Buffer.byteLength(text, 'utf8')
    });
  });
  return writtenFiles;
};

const statusFor = ({ missing, invalidRows, plannedUpdates, apply }) => {
  if (missing.length > 0) return 'missing_evidence';
  if (invalidRows.length > 0) return 'invalid_worktable';
  if (plannedUpdates.length === 0) return 'no_actionable_rows';
  return apply ? 'applied' : 'dry_run_ready';
};

const summaryFor = ({
  missing,
  rows,
  plannedUpdates,
  invalidRows,
  unchangedRows,
  writtenFiles
}) => ({
  missingArtifacts: missing.length,
  missingArtifactNames: missing,
  totalRows: rows.length,
  actionableRows: plannedUpdates.length,
  plannedUpdates: plannedUpdates.length,
  appliedUpdates: writtenFiles.length > 0 ? plannedUpdates.length : 0,
  filesToUpdate: new Set(plannedUpdates.map(update => update.editablePath)).size,
  invalidRows: invalidRows.length,
  missingRequiredFieldRows: invalidRows.filter(row => row.code === 'missing_required_fields').length,
  unchangedRows
});

const recommendedActionFor = (status, report) => ({
  missing_evidence: 'workspace manifest와 수정된 worktable CSV를 준비한 뒤 다시 실행하세요.',
  invalid_worktable: 'CSV의 queueCode, decisionId, action, 필수 검토 필드를 수정한 뒤 dry-run을 다시 실행하세요. invalidRows를 먼저 확인하세요.',
  no_actionable_rows: 'CSV에 newAction 또는 검토 필드를 입력한 뒤 다시 실행하세요.',
  dry_run_ready: 'dry-run 계획이 유효합니다. 사람이 변경 내용을 확인한 뒤 같은 명령에 --apply를 붙이면 editable decision JSON에만 반영됩니다.',
  applied: '로컬 editable decision JSON에 CSV 입력을 반영했습니다. 이제 npm run operational:hitl:editable-preflight를 실행하세요.'
}[status] || report?.recommendedAction || 'worktable import 상태를 확인하세요.');

const buildOperationalHitlDecisionWorktableImport = ({
  generatedAt = new Date().toISOString(),
  workspaceManifest = null,
  worktableCsv = '',
  apply = false,
  sourceArtifacts = {},
  readFileText = () => null,
  writeFileText = () => {}
} = {}) => {
  const missing = [
    ...(!isContract(workspaceManifest, 'operational-hitl-editable-decision-workspace/v1') ? ['workspaceManifest'] : []),
    ...(!compact(worktableCsv) ? ['worktableCsv'] : [])
  ];
  if (missing.length > 0) {
    return missingEvidenceReport(generatedAt, sourceArtifacts, missing);
  }

  const parsedCsv = parseCsv(worktableCsv);
  const missingHeaders = requiredHeaderMissing(parsedCsv.headers);
  const workspaceIndex = buildWorkspaceIndex({ workspaceManifest, readFileText });
  const plans = missingHeaders.length > 0
    ? {
      plannedUpdates: [],
      invalidRows: missingHeaders.map(header => ({
        rowNumber: 1,
        queueCode: '',
        decisionId: '',
        action: '',
        code: 'missing_required_header',
        message: `CSV header ${header}가 필요합니다.`
      })),
      unchangedRows: 0
    }
    : buildPlans({
      rows: parsedCsv.rows,
      workspaceIndex
    });

  const status = statusFor({
    missing,
    invalidRows: plans.invalidRows,
    plannedUpdates: plans.plannedUpdates,
    apply
  });
  const writtenFiles = status === 'applied'
    ? applyUpdates({
      plannedUpdates: plans.plannedUpdates,
      workspaceIndex,
      writeFileText
    })
    : [];

  const report = {
    schemaVersion: 1,
    contractVersion: 'operational-hitl-decision-worktable-import/v1',
    generatedAt,
    sourceSystem: 'mold-master-ai',
    targetSystem: 'operator_common_agent',
    status,
    applyRequested: apply === true,
    serviceWritesPerformed: false,
    localArtifactsWritten: true,
    localEditableWritesPerformed: writtenFiles.length > 0,
    policy: policy(),
    summary: summaryFor({
      missing,
      rows: parsedCsv.rows,
      plannedUpdates: plans.plannedUpdates,
      invalidRows: plans.invalidRows,
      unchangedRows: plans.unchangedRows,
      writtenFiles
    }),
    plannedUpdates: plans.plannedUpdates,
    invalidRows: plans.invalidRows,
    writtenFiles,
    verificationCommandsReady: unique(plans.plannedUpdates.map(update => update.verifyCommand)),
    sources: {
      workspaceManifest: sourceArtifacts.workspaceManifest || null,
      worktableCsv: sourceArtifacts.worktableCsv || null
    }
  };
  return {
    ...report,
    recommendedAction: recommendedActionFor(status, report)
  };
};

module.exports = {
  buildOperationalHitlDecisionWorktableImport,
  parseCsv
};
