const {
  buildOperationalHitlDryRunRoundtrip
} = require('./operationalHitlDryRunRoundtrip');
const {
  buildOperationalHitlDecisionWorktableImport
} = require('./operationalHitlDecisionWorktableImport');
const {
  buildOperationalHitlEditableDecisionPreflight
} = require('./operationalHitlEditableDecisionPreflight');

const asArray = value => Array.isArray(value) ? value : [];

const compact = value => String(value || '').replace(/\s+/g, ' ').trim();

const unique = values => [...new Set(asArray(values).map(compact).filter(Boolean))];

const isContract = (artifact, contractVersion) =>
  artifact?.contractVersion === contractVersion;

const decisionKey = (queueCode, decisionId) =>
  `${compact(queueCode)}|${compact(decisionId)}`;

const policy = () => ({
  requiresHumanReview: true,
  simulationOnly: true,
  inMemoryEditableApplyOnly: true,
  humanDecisionSubstitutionAllowed: false,
  allowGeneratedCsvApply: false,
  autoVerifyAllowed: false,
  autoApplyAllowed: false,
  automaticServiceWritesAllowed: false,
  allowGraphPromotion: false,
  allowReferenceLearning: false,
  allowModelTraining: false
});

const missingEvidenceReport = ({ generatedAt, sourceArtifacts, missingArtifactNames }) => ({
  schemaVersion: 1,
  contractVersion: 'operational-hitl-simulated-preflight/v1',
  generatedAt,
  sourceSystem: 'mold-master-ai',
  targetSystem: 'operator_common_agent',
  status: 'missing_evidence',
  serviceWritesPerformed: false,
  localArtifactsWritten: true,
  localEditableWritesPerformed: false,
  policy: policy(),
  summary: {
    missingArtifacts: missingArtifactNames.length,
    missingArtifactNames,
    totalRows: 0,
    importPlannedUpdates: 0,
    roundtripInvalidRows: 0,
    simulatedFilesUpdated: 0,
    preflightPendingDecisions: 0,
    preflightMissingRequiredFields: 0,
    preflightInvalidActions: 0,
    readyForVerificationFileCount: 0,
    verificationCommandCount: 0
  },
  files: [],
  roundtripInvalidRows: [],
  verificationCommandsReady: [],
  markdown: '',
  sources: {
    workspaceManifest: sourceArtifacts.workspaceManifest || null,
    worktableExport: sourceArtifacts.worktableExport || null,
    worktableSuggestion: sourceArtifacts.worktableSuggestion || null
  },
  recommendedAction: '먼저 editable workspace, worktable export, worktable suggestion artifact를 모두 생성한 뒤 simulated preflight를 다시 실행하세요.'
});

const parseEditablePacket = ({ editableFile, fileText }) => {
  if (typeof fileText !== 'string') {
    return {
      error: {
        queueCode: compact(editableFile?.queueCode),
        editablePath: compact(editableFile?.editablePath),
        code: 'missing_editable_file',
        message: 'workspace editable decision file을 읽을 수 없습니다.'
      },
      packet: null
    };
  }
  try {
    return {
      error: null,
      packet: JSON.parse(fileText.replace(/^\uFEFF/, ''))
    };
  } catch (error) {
    return {
      error: {
        queueCode: compact(editableFile?.queueCode),
        editablePath: compact(editableFile?.editablePath),
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

const workspaceIndexFor = ({ workspaceManifest, readFileText }) => {
  const files = new Map();
  const decisions = new Map();
  const errors = [];

  asArray(workspaceManifest?.editableFiles).forEach(editableFile => {
    const parsed = parseEditablePacket({
      editableFile,
      fileText: readFileText(editableFile.editablePath)
    });
    if (parsed.error) {
      errors.push(parsed.error);
      return;
    }

    const fileRecord = {
      editableFile,
      packet: parsed.packet || {},
      decisions: asArray(parsed.packet?.decisions),
      changed: false
    };
    const queueCode = compact(editableFile?.queueCode);
    files.set(compact(editableFile?.editablePath), fileRecord);
    fileRecord.decisions.forEach((decision, index) => {
      decisions.set(decisionKey(queueCode, decisionIdFor(decision, editableFile, index)), {
        fileRecord,
        decision
      });
    });
  });

  return { files, decisions, errors };
};

const buildSimulatedFileMap = ({ workspaceManifest, plannedUpdates, readFileText }) => {
  const index = workspaceIndexFor({ workspaceManifest, readFileText });
  if (index.errors.length > 0) {
    return {
      errors: index.errors,
      simulatedFiles: new Map(),
      updatedFileCount: 0
    };
  }

  asArray(plannedUpdates).forEach(update => {
    const target = index.decisions.get(decisionKey(update?.queueCode, update?.decisionId));
    if (!target) return;
    Object.assign(target.decision, update.fieldUpdates || {});
    target.fileRecord.changed = true;
  });

  const simulatedFiles = new Map();
  index.files.forEach(fileRecord => {
    if (!fileRecord.changed) return;
    simulatedFiles.set(
      compact(fileRecord.editableFile.editablePath),
      `${JSON.stringify(fileRecord.packet, null, 2)}\n`
    );
  });

  return {
    errors: [],
    simulatedFiles,
    updatedFileCount: simulatedFiles.size
  };
};

const statusFor = ({ roundtrip, importReport, preflightReport, simulationErrors }) => {
  if (roundtrip.status === 'missing_evidence') return 'missing_evidence';
  if (
    roundtrip.status !== 'simulated_roundtrip_ready'
    || importReport.status !== 'dry_run_ready'
    || asArray(importReport.invalidRows).length > 0
  ) return 'blocked_roundtrip_invalid';
  if (simulationErrors.length > 0) return 'blocked_simulation_workspace';
  if (preflightReport.status === 'ready_for_verification') return 'simulated_preflight_ready';
  return 'simulated_preflight_blocked';
};

const recommendedActionFor = status => ({
  simulated_preflight_ready: '추천값을 실제 사람 판정으로 검토해 입력하면 preflight까지 열릴 가능성이 높습니다. 단 이 결과는 실제 승인 대체가 아니므로 실제 CSV에는 사람이 확인한 값만 입력하세요.',
  blocked_roundtrip_invalid: '추천값 roundtrip 오류를 먼저 수정하세요. 추천 규칙 또는 worktable 필수 필드가 후속 import 계약을 만족하지 못합니다.',
  blocked_simulation_workspace: 'simulation workspace 파일을 읽거나 JSON으로 해석할 수 없습니다. editable workspace를 재생성하거나 손상 파일을 확인하세요.',
  simulated_preflight_blocked: '메모리 반영 후 preflight가 아직 막혀 있습니다. files의 pending/invalid/missing 필드를 확인하세요.',
  missing_evidence: '필수 artifact를 먼저 재생성하세요.'
}[status] || 'simulated preflight 결과를 확인하세요.');

const markdownFor = report => {
  const lines = [
    '# Operational HITL Simulated Preflight',
    '',
    `- 생성 시각: ${report.generatedAt}`,
    `- 상태: ${report.status}`,
    `- 작업표 row: ${report.summary.totalRows}`,
    `- import 계획 update: ${report.summary.importPlannedUpdates}`,
    `- 메모리 반영 파일: ${report.summary.simulatedFilesUpdated}`,
    `- preflight pending: ${report.summary.preflightPendingDecisions}`,
    `- preflight 필수필드 누락: ${report.summary.preflightMissingRequiredFields}`,
    `- verification command: ${report.summary.verificationCommandCount}`,
    '- 안전 정책: simulation-only, in-memory apply only, 실제 사람 판정 대체 금지, Graph/Reference/Model 승격 금지',
    '',
    '## Files',
    '',
    '| Queue | Status | Items | Pending | Missing Fields |',
    '|---|---|---:|---:|---:|'
  ];

  report.files.forEach(file => {
    lines.push([
      `| ${file.queueCode}`,
      file.status,
      file.totalDecisionItems,
      file.pendingDecisionCount,
      file.missingRequiredFieldCount,
      '|'
    ].join(' | '));
  });

  if (report.roundtripInvalidRows.length > 0) {
    lines.push(
      '',
      '## Roundtrip Invalid Rows',
      '',
      '| Queue | Decision ID | Missing Fields |',
      '|---|---|---|'
    );
    report.roundtripInvalidRows.slice(0, 50).forEach(row => {
      lines.push([
        `| ${compact(row?.queueCode)}`,
        compact(row?.decisionId),
        unique(row?.missingFields).join(', ') || '-',
        '|'
      ].join(' | '));
    });
  }

  return `${lines.join('\n')}\n`;
};

const buildOperationalHitlSimulatedPreflight = ({
  generatedAt = new Date().toISOString(),
  workspaceManifest = null,
  worktableExport = null,
  worktableSuggestion = null,
  sourceArtifacts = {},
  readFileText = () => null
} = {}) => {
  const missingArtifactNames = [
    !isContract(workspaceManifest, 'operational-hitl-editable-decision-workspace/v1') ? 'workspaceManifest' : null,
    !isContract(worktableExport, 'operational-hitl-decision-worktable-export/v1') ? 'worktableExport' : null,
    !isContract(worktableSuggestion, 'operational-hitl-decision-worktable-suggestion/v1') ? 'worktableSuggestion' : null
  ].filter(Boolean);

  if (missingArtifactNames.length > 0) {
    return missingEvidenceReport({
      generatedAt,
      sourceArtifacts,
      missingArtifactNames
    });
  }

  const roundtrip = buildOperationalHitlDryRunRoundtrip({
    generatedAt,
    workspaceManifest,
    worktableExport,
    worktableSuggestion,
    sourceArtifacts,
    readFileText
  });
  const importReport = buildOperationalHitlDecisionWorktableImport({
    generatedAt,
    workspaceManifest,
    worktableCsv: roundtrip.simulatedCsv || '',
    apply: false,
    sourceArtifacts: {
      workspaceManifest: sourceArtifacts.workspaceManifest || null,
      worktableCsv: 'simulation-only:operational-hitl-simulated-preflight'
    },
    readFileText
  });
  const simulation = buildSimulatedFileMap({
    workspaceManifest,
    plannedUpdates: importReport.plannedUpdates,
    readFileText
  });
  const preflightReport = buildOperationalHitlEditableDecisionPreflight({
    generatedAt,
    workspaceManifest,
    sourceArtifacts: {
      workspaceManifest: sourceArtifacts.workspaceManifest || null
    },
    readFileText: filePath => simulation.simulatedFiles.get(filePath) || readFileText(filePath)
  });
  const status = statusFor({
    roundtrip,
    importReport,
    preflightReport,
    simulationErrors: simulation.errors
  });
  const verificationCommandsReady = status === 'simulated_preflight_ready'
    ? unique(preflightReport.verificationCommandsReady)
    : [];
  const report = {
    schemaVersion: 1,
    contractVersion: 'operational-hitl-simulated-preflight/v1',
    generatedAt,
    sourceSystem: 'mold-master-ai',
    targetSystem: 'operator_common_agent',
    status,
    serviceWritesPerformed: false,
    localArtifactsWritten: true,
    localEditableWritesPerformed: false,
    policy: policy(),
    summary: {
      missingArtifacts: 0,
      missingArtifactNames: [],
      totalRows: Number(roundtrip.summary?.totalRows || 0),
      importPlannedUpdates: Number(importReport.summary?.plannedUpdates || 0),
      roundtripInvalidRows: asArray(importReport.invalidRows).length,
      simulatedFilesUpdated: simulation.updatedFileCount,
      preflightPendingDecisions: Number(preflightReport.summary?.pendingDecisionCount || 0),
      preflightMissingRequiredFields: Number(preflightReport.summary?.missingRequiredFieldCount || 0),
      preflightInvalidActions: Number(preflightReport.summary?.invalidActionCount || 0),
      readyForVerificationFileCount: Number(preflightReport.summary?.readyForVerificationFileCount || 0),
      verificationCommandCount: verificationCommandsReady.length
    },
    importStatus: compact(importReport.status),
    preflightStatus: compact(preflightReport.status),
    files: asArray(preflightReport.files),
    roundtripInvalidRows: asArray(importReport.invalidRows),
    simulationErrors: simulation.errors,
    verificationCommandsReady,
    sources: {
      workspaceManifest: sourceArtifacts.workspaceManifest || null,
      worktableExport: sourceArtifacts.worktableExport || null,
      worktableSuggestion: sourceArtifacts.worktableSuggestion || null
    }
  };

  return {
    ...report,
    recommendedAction: recommendedActionFor(status),
    markdown: markdownFor(report)
  };
};

module.exports = {
  buildOperationalHitlSimulatedPreflight
};
