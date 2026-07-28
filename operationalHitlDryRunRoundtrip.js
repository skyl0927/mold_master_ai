const {
  buildOperationalHitlDecisionWorktableImport
} = require('./operationalHitlDecisionWorktableImport');
const {
  COLUMNS
} = require('./operationalHitlDecisionWorktableExport');

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
  recommendationBased: true,
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
  contractVersion: 'operational-hitl-dry-run-roundtrip/v1',
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
    simulatedRows: 0,
    missingSuggestionRows: 0,
    importPlannedUpdates: 0,
    invalidRows: 0,
    filesToUpdate: 0,
    verificationCommandCount: 0
  },
  rows: [],
  invalidRows: [],
  verificationCommandsReady: [],
  simulatedCsv: '',
  markdown: '',
  sources: {
    workspaceManifest: sourceArtifacts.workspaceManifest || null,
    worktableExport: sourceArtifacts.worktableExport || null,
    worktableSuggestion: sourceArtifacts.worktableSuggestion || null
  },
  recommendedAction: '먼저 editable workspace, worktable export, worktable suggestion artifact를 모두 생성한 뒤 dry-run roundtrip을 다시 실행하세요.'
});

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

const suggestionIndexFor = worktableSuggestion => {
  const suggestions = new Map();
  asArray(worktableSuggestion?.rows).forEach(row => {
    suggestions.set(decisionKey(row?.queueCode, row?.decisionId), row);
  });
  return suggestions;
};

const firstDisplayLabel = (...values) => {
  const display = compact(values.find(value => compact(value)));
  if (!display) return '';
  return compact(display.split('/')[0].split('|')[0]);
};

const commonSimulationFields = ({ generatedAt, suggestion }) => ({
  reviewerId: 'SIMULATION_ONLY',
  reviewerName: 'HITL dry-run simulator',
  decidedAt: generatedAt,
  reviewComment: compact([
    'SIMULATION ONLY - 추천값 기반 후속 게이트 검증용입니다.',
    suggestion?.suggestedReviewComment || suggestion?.recommendationReasonKo
  ].filter(Boolean).join(' '))
});

const fillApproveCandidateFields = ({ simulated, row, suggestion }) => {
  simulated.approvedDefectType = compact(
    suggestion?.suggestedApprovedDefectType
    || row.approvedDefectType
    || firstDisplayLabel(row.displayLabel)
  );
  simulated.manufacturingImageConfirmed = 'true';
  simulated.labelConfirmed = 'true';
};

const fillApproveCardFields = ({ simulated, row, suggestion }) => {
  simulated.confirmed = 'true';
  simulated.reviewedDefectName = compact(
    suggestion?.suggestedReviewedDefectName
    || row.reviewedDefectName
    || firstDisplayLabel(row.displayLabel)
  );
  simulated.reviewedProblem = compact(suggestion?.suggestedReviewedProblem || row.reviewedProblem);
  simulated.reviewedPhenomenon = compact(suggestion?.suggestedReviewedPhenomenon || row.reviewedPhenomenon);
  simulated.causeCandidates = compact(suggestion?.suggestedCauseCandidates || row.causeCandidates);
  simulated.causeLabels = compact(suggestion?.suggestedCauseLabels || row.causeLabels);
  simulated.checkItems = compact(suggestion?.suggestedCheckItems || row.checkItems);
  simulated.actions = compact(suggestion?.suggestedActions || row.actions);
};

const fillRecaptureFields = ({ simulated, row, suggestion }) => {
  simulated.requestedViews = compact(
    suggestion?.suggestedRequestedViews
    || row.requestedViews
    || '제품 전체 정면 | 결함부 근접 | 동일 조건 재촬영'
  );
};

const fillKeepLabelFields = ({ simulated, row, suggestion }) => {
  simulated.selectedLabel = compact(
    row.selectedLabel
    || suggestion?.suggestedApprovedDefectType
    || row.approvedDefectType
    || firstDisplayLabel(row.displayLabel)
  );
  simulated.imageSetConfirmed = 'true';
  simulated.labelConfirmed = 'true';
};

const fillNeedsChangesFields = ({ simulated, row, suggestion }) => {
  simulated.reviewedDefectName = compact(
    suggestion?.suggestedReviewedDefectName
    || row.reviewedDefectName
    || firstDisplayLabel(row.displayLabel)
  );
  simulated.reviewedProblem = compact(suggestion?.suggestedReviewedProblem || row.reviewedProblem);
  simulated.reviewedPhenomenon = compact(suggestion?.suggestedReviewedPhenomenon || row.reviewedPhenomenon);
  simulated.causeCandidates = compact(suggestion?.suggestedCauseCandidates || row.causeCandidates);
  simulated.causeLabels = compact(suggestion?.suggestedCauseLabels || row.causeLabels);
  simulated.checkItems = compact(suggestion?.suggestedCheckItems || row.checkItems);
  simulated.actions = compact(suggestion?.suggestedActions || row.actions);
};

const simulateRow = ({ row, suggestion, generatedAt }) => {
  const action = compact(row.newAction)
    || compact(suggestion?.recommendedNewAction);
  const simulated = {
    ...row,
    newAction: action,
    ...commonSimulationFields({ generatedAt, suggestion })
  };

  if (!action) return simulated;
  if (action === 'approve_candidate') fillApproveCandidateFields({ simulated, row, suggestion });
  if (action === 'approve_card') fillApproveCardFields({ simulated, row, suggestion });
  if (action === 'request_recapture') fillRecaptureFields({ simulated, row, suggestion });
  if (action === 'keep_label') fillKeepLabelFields({ simulated, row, suggestion });
  if (action === 'mark_needs_changes') fillNeedsChangesFields({ simulated, row, suggestion });
  return simulated;
};

const rowsFor = ({ worktableExport, worktableSuggestion, generatedAt }) => {
  const suggestionIndex = suggestionIndexFor(worktableSuggestion);
  return asArray(worktableExport?.rows).map(row => {
    const suggestion = suggestionIndex.get(decisionKey(row?.queueCode, row?.decisionId)) || null;
    const simulated = simulateRow({
      row,
      suggestion,
      generatedAt
    });
    return {
      simulated,
      preview: {
        queueCode: compact(row?.queueCode),
        decisionId: compact(row?.decisionId),
        displayLabel: compact(row?.displayLabel),
        recommendedNewAction: compact(suggestion?.recommendedNewAction),
        simulatedAction: compact(simulated?.newAction),
        simulationOnly: true
      }
    };
  });
};

const statusFor = ({ totalRows, simulatedRows, importReport }) => {
  if (totalRows === 0) return 'clear';
  if (importReport.status === 'dry_run_ready') return 'simulated_roundtrip_ready';
  if (importReport.status === 'no_actionable_rows' || simulatedRows === 0) return 'no_actionable_simulated_rows';
  return 'simulated_roundtrip_invalid';
};

const recommendedActionFor = status => ({
  simulated_roundtrip_ready: '추천값 기반 후속 게이트 dry-run은 통과했습니다. 이 결과는 실제 판정이 아니므로 실제 CSV에는 사람이 검토한 값만 입력한 뒤 worktable-import dry-run을 다시 실행하세요.',
  simulated_roundtrip_invalid: '추천값으로도 충족되지 않는 필드가 있습니다. invalidRows의 missingFields를 확인해 추천 생성 규칙 또는 원본 worktable 필드를 보완하세요.',
  no_actionable_simulated_rows: '추천 action이 없어 후속 게이트를 시뮬레이션할 수 없습니다. worktable-suggest 결과를 먼저 확인하세요.',
  clear: '시뮬레이션할 HITL row가 없습니다. pipeline-status를 갱신하세요.'
}[status] || 'dry-run roundtrip 결과를 확인하세요.');

const markdownFor = report => {
  const lines = [
    '# Operational HITL Dry-run Roundtrip',
    '',
    `- 생성 시각: ${report.generatedAt}`,
    `- 상태: ${report.status}`,
    `- 전체 row: ${report.summary.totalRows}`,
    `- 시뮬레이션 row: ${report.summary.simulatedRows}`,
    `- import 계획 update: ${report.summary.importPlannedUpdates}`,
    `- invalid row: ${report.summary.invalidRows}`,
    '- 안전 정책: simulation-only, 실제 사람 판정 대체 금지, 생성 CSV 적용 금지, Graph/Reference/Model 승격 금지',
    '',
    '## Simulated Rows',
    '',
    '| Queue | Decision ID | Recommended | Simulated | Label |',
    '|---|---|---|---|---|'
  ];

  report.rows.slice(0, 50).forEach(row => {
    lines.push([
      `| ${row.queueCode}`,
      row.decisionId,
      row.recommendedNewAction || '-',
      row.simulatedAction || '-',
      compact(row.displayLabel).replace(/\|/g, '/'),
      '|'
    ].join(' | '));
  });

  if (report.invalidRows.length > 0) {
    lines.push(
      '',
      '## Invalid Rows',
      '',
      '| Queue | Decision ID | Code | Missing Fields |',
      '|---|---|---|---|'
    );
    report.invalidRows.slice(0, 50).forEach(row => {
      lines.push([
        `| ${row.queueCode}`,
        row.decisionId,
        row.code,
        unique(row.missingFields).join(', ') || '-',
        '|'
      ].join(' | '));
    });
  }

  return `${lines.join('\n')}\n`;
};

const buildOperationalHitlDryRunRoundtrip = ({
  generatedAt = new Date().toISOString(),
  workspaceManifest = null,
  worktableExport = null,
  worktableSuggestion = null,
  sourceArtifacts = {},
  readFileText = () => null,
  writeFileText = () => {}
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

  const simulatedRows = rowsFor({
    worktableExport,
    worktableSuggestion,
    generatedAt
  });
  const importableRows = simulatedRows.map(row => row.simulated);
  const simulatedCsv = csvForRows(importableRows);
  const importReport = buildOperationalHitlDecisionWorktableImport({
    generatedAt,
    workspaceManifest,
    worktableCsv: simulatedCsv,
    apply: false,
    allowSimulationOnlyCsv: true,
    sourceArtifacts: {
      workspaceManifest: sourceArtifacts.workspaceManifest || null,
      worktableCsv: 'simulation-only:operational-hitl-dry-run-roundtrip'
    },
    readFileText,
    writeFileText
  });

  const simulatedActionRows = importableRows.filter(row => compact(row.newAction)).length;
  const status = statusFor({
    totalRows: importableRows.length,
    simulatedRows: simulatedActionRows,
    importReport
  });
  const rows = simulatedRows.map(row => row.preview);
  const verificationCommandsReady = unique(importReport.verificationCommandsReady);
  const report = {
    schemaVersion: 1,
    contractVersion: 'operational-hitl-dry-run-roundtrip/v1',
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
      totalRows: importableRows.length,
      simulatedRows: simulatedActionRows,
      missingSuggestionRows: rows.filter(row => !row.recommendedNewAction && !row.simulatedAction).length,
      importPlannedUpdates: Number(importReport?.summary?.plannedUpdates || 0),
      invalidRows: Number(importReport?.summary?.invalidRows || 0),
      filesToUpdate: Number(importReport?.summary?.filesToUpdate || 0),
      verificationCommandCount: verificationCommandsReady.length
    },
    rows,
    invalidRows: asArray(importReport.invalidRows),
    importStatus: compact(importReport.status),
    importSummary: importReport.summary,
    verificationCommandsReady,
    simulatedCsv,
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
  buildOperationalHitlDryRunRoundtrip
};
