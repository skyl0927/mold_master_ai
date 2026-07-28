const asArray = value => Array.isArray(value) ? value : [];

const compact = value => String(value || '').replace(/\s+/g, ' ').trim();

const unique = values => [...new Set(asArray(values).map(compact).filter(Boolean))];

const REQUIRED_PLAN_CONTRACT = 'operational-hitl-post-import-validation-plan/v1';
const OBSERVATIONS_CONTRACT = 'operational-hitl-post-import-validation-observations/v1';

const CSV_COLUMNS = [
  'caseId',
  'testType',
  'requiredAction',
  'expectedLabel',
  'expectedDefectClass',
  'contentSha256',
  'affectedCaseIds',
  'rejectedLabels',
  'observedContentSha256',
  'observedLabel',
  'observedDefectClass',
  'reviewStatus',
  'activeLabel',
  'affectedCaseIdsObserved',
  'rejectedLabelsActive',
  'reviewerId',
  'reviewComment',
  'capturedAt'
];

const policy = () => ({
  validationOnly: true,
  requiresHumanReview: true,
  automaticServiceWritesAllowed: false,
  autoApplyAllowed: false,
  allowGraphPromotion: false,
  allowReferenceLearning: false,
  allowModelTraining: false,
  requireApprovedGraphEvidence: true,
  requireReasoningPath: true
});

const observedCaseIds = observations =>
  new Set(asArray(observations?.results).map(item => compact(item?.caseId)).filter(Boolean));

const isManualCase = testCase => [
  'vision_label_roundtrip',
  'label_conflict_resolution_roundtrip'
].includes(compact(testCase?.testType));

const splitPipe = value => compact(value).split('|').map(compact).filter(Boolean);

const quoteCsv = value => {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const csvForRows = rows => [
  CSV_COLUMNS.join(','),
  ...rows.map(row => CSV_COLUMNS.map(column => quoteCsv(row[column])).join(','))
].join('\n') + '\n';

const parseCsvLine = line => {
  const values = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && quoted && line[index + 1] === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
};

const parseCsv = csv => {
  const lines = String(csv || '').replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => line.trim());
  if (lines.length === 0) return [];
  const headers = parseCsvLine(lines[0]).map(compact);
  return lines.slice(1).map((line, index) => {
    const values = parseCsvLine(line);
    return {
      rowNumber: index + 2,
      ...Object.fromEntries(headers.map((header, headerIndex) => [header, values[headerIndex] ?? '']))
    };
  });
};

const requiredActionFor = testCase =>
  testCase.testType === 'vision_label_roundtrip'
    ? 'confirm_vision_roundtrip'
    : 'confirm_label_conflict_resolution';

const rowForCase = testCase => ({
  caseId: compact(testCase.id),
  testType: compact(testCase.testType),
  requiredAction: requiredActionFor(testCase),
  expectedLabel: compact(testCase.expectedLabel),
  expectedDefectClass: compact(testCase.expectedDefectClass),
  contentSha256: compact(testCase.contentSha256).toLowerCase(),
  affectedCaseIds: unique(testCase.affectedCaseIds).join('|'),
  rejectedLabels: unique(testCase.rejectedLabels).join('|'),
  observedContentSha256: '',
  observedLabel: '',
  observedDefectClass: '',
  reviewStatus: '',
  activeLabel: '',
  affectedCaseIdsObserved: '',
  rejectedLabelsActive: '',
  reviewerId: '',
  reviewComment: '',
  capturedAt: ''
});

const summaryForTemplate = ({ validationPlan, observations, rows }) => ({
  totalPlannedCases: asArray(validationPlan?.testCases).length,
  existingObservedCases: observedCaseIds(observations).size,
  manualRows: rows.length,
  visionRows: rows.filter(row => row.testType === 'vision_label_roundtrip').length,
  labelConflictRows: rows.filter(row => row.testType === 'label_conflict_resolution_roundtrip').length,
  manualCaseIds: rows.map(row => row.caseId)
});

const templateStatusFor = ({ validationPlan, rows }) => {
  if (!validationPlan || validationPlan.contractVersion !== REQUIRED_PLAN_CONTRACT) {
    return 'missing_validation_plan';
  }
  if (validationPlan.status !== 'ready_for_post_import_validation') {
    return 'blocked_validation_plan_not_ready';
  }
  return rows.length > 0 ? 'ready_for_manual_observation' : 'no_manual_observations_required';
};

const templateRecommendedAction = status => ({
  missing_validation_plan: 'Create the post-import validation plan before building a manual observation template.',
  blocked_validation_plan_not_ready: 'Finish HITL verification and Common Agent manual import review before manual observations.',
  ready_for_manual_observation: 'Fill the manual observation CSV, then run the manual observation import command.',
  no_manual_observations_required: 'No manual post-import observations are required for the current plan.'
}[status] || 'Review manual observation template state.');

const markdownForTemplate = template => {
  const lines = [
    '# Operational HITL Post-Import Manual Observation Template',
    '',
    `- generatedAt: ${template.generatedAt}`,
    `- status: ${template.status}`,
    `- manual rows: ${template.summary.manualRows}`,
    `- serviceWritesPerformed: ${template.serviceWritesPerformed}`,
    '',
    '| Case | Type | Expected |',
    '|---|---|---|'
  ];
  template.rows.forEach(row => {
    lines.push(`| ${row.caseId} | ${row.testType} | ${row.expectedLabel || row.expectedDefectClass} |`);
  });
  lines.push('', `Recommended action: ${template.recommendedAction}`, '');
  return `${lines.join('\n')}\n`;
};

const buildOperationalHitlPostImportManualObservationTemplate = ({
  generatedAt = new Date().toISOString(),
  validationPlan = null,
  observations = null,
  sourceArtifacts = {}
} = {}) => {
  const existing = observedCaseIds(observations);
  const rows = validationPlan?.contractVersion === REQUIRED_PLAN_CONTRACT
    && validationPlan.status === 'ready_for_post_import_validation'
    ? asArray(validationPlan.testCases)
      .filter(testCase => isManualCase(testCase) && !existing.has(compact(testCase.id)))
      .map(rowForCase)
    : [];
  const status = templateStatusFor({ validationPlan, rows });
  const template = {
    schemaVersion: 1,
    contractVersion: 'operational-hitl-post-import-validation-manual-observations-template/v1',
    generatedAt,
    sourceSystem: 'mold-master-ai',
    targetSystem: 'mold_master_ai_common_agent_graph',
    deliveryMode: 'artifact_only',
    status,
    serviceWritesPerformed: false,
    localArtifactsWritten: true,
    policy: policy(),
    summary: summaryForTemplate({ validationPlan, observations, rows }),
    rows,
    csv: csvForRows(rows),
    sources: {
      validationPlan: sourceArtifacts.validationPlan || null,
      observations: sourceArtifacts.observations || null
    },
    recommendedAction: templateRecommendedAction(status)
  };
  return {
    ...template,
    markdown: markdownForTemplate(template)
  };
};

const planCaseMap = validationPlan =>
  new Map(asArray(validationPlan?.testCases).map(testCase => [compact(testCase.id), testCase]));

const validateVisionRow = ({ row, testCase }) => {
  const failures = [];
  if (compact(row.observedContentSha256).toLowerCase() !== compact(testCase.contentSha256).toLowerCase()) {
    failures.push('content_hash_mismatch');
  }
  if (compact(row.observedLabel) !== compact(testCase.expectedLabel)) failures.push('label_mismatch');
  if (compact(row.observedDefectClass) !== compact(testCase.expectedDefectClass)) {
    failures.push('defect_class_mismatch');
  }
  if (compact(row.reviewStatus) !== 'approved') failures.push('review_status_not_approved');
  if (!compact(row.reviewerId)) failures.push('reviewer_missing');
  if (!compact(row.capturedAt)) failures.push('captured_at_missing');
  return failures;
};

const validateLabelConflictRow = ({ row, testCase }) => {
  const failures = [];
  const affected = splitPipe(row.affectedCaseIdsObserved);
  const expectedAffected = unique(testCase.affectedCaseIds);
  if (compact(row.activeLabel) !== compact(testCase.expectedLabel)) failures.push('active_label_mismatch');
  if (expectedAffected.some(caseId => !affected.includes(caseId))) failures.push('affected_case_missing');
  const rejectedActive = splitPipe(row.rejectedLabelsActive);
  const rejectedExpected = unique(testCase.rejectedLabels);
  if (rejectedActive.some(label => rejectedExpected.includes(label))) failures.push('rejected_label_still_active');
  if (!compact(row.reviewerId)) failures.push('reviewer_missing');
  if (!compact(row.capturedAt)) failures.push('captured_at_missing');
  return failures;
};

const validateManualRow = ({ row, testCase }) => {
  if (!testCase) return ['unknown_case_id'];
  if (!isManualCase(testCase)) return ['not_manual_observation_case'];
  if (compact(row.testType) !== compact(testCase.testType)) return ['test_type_mismatch'];
  if (testCase.testType === 'vision_label_roundtrip') {
    return validateVisionRow({ row, testCase });
  }
  return validateLabelConflictRow({ row, testCase });
};

const observationForRow = ({ row, testCase }) => {
  if (testCase.testType === 'vision_label_roundtrip') {
    return {
      caseId: compact(row.caseId),
      testType: compact(testCase.testType),
      capturedAt: compact(row.capturedAt),
      response: {
        contentSha256: compact(row.observedContentSha256).toLowerCase(),
        label: compact(row.observedLabel),
        defectClass: compact(row.observedDefectClass),
        reviewStatus: compact(row.reviewStatus)
      },
      serviceWritesPerformed: false
    };
  }
  return {
    caseId: compact(row.caseId),
    testType: compact(testCase.testType),
    capturedAt: compact(row.capturedAt),
    response: {
      activeLabel: compact(row.activeLabel),
      affectedCaseIds: splitPipe(row.affectedCaseIdsObserved),
      rejectedLabelsActive: splitPipe(row.rejectedLabelsActive),
      reviewHistory: [{
        reviewerId: compact(row.reviewerId),
        reviewComment: compact(row.reviewComment)
      }]
    },
    serviceWritesPerformed: false
  };
};

const statusForImport = ({ validationPlan, invalidRows, results }) => {
  if (!validationPlan || validationPlan.contractVersion !== REQUIRED_PLAN_CONTRACT) {
    return 'missing_validation_plan';
  }
  if (validationPlan.status !== 'ready_for_post_import_validation') {
    return 'blocked_validation_plan_not_ready';
  }
  if (invalidRows.length > 0) return 'invalid_manual_observations';
  const plannedIds = new Set(asArray(validationPlan.testCases).map(testCase => compact(testCase.id)));
  const resultIds = new Set(results.map(item => compact(item.caseId)));
  return [...plannedIds].every(caseId => resultIds.has(caseId))
    ? 'ready_for_evidence_build'
    : 'partial_observations_collected';
};

const summaryForImport = ({ validationPlan, observations, importedRows, invalidRows, results }) => {
  const plannedIds = asArray(validationPlan?.testCases).map(testCase => compact(testCase.id)).filter(Boolean);
  const resultIds = new Set(results.map(item => compact(item.caseId)));
  const missingCaseIds = plannedIds.filter(caseId => !resultIds.has(caseId));
  return {
    totalPlannedCases: plannedIds.length,
    existingObservationCases: asArray(observations?.results).length,
    manualImportedRows: importedRows.length,
    invalidRows: invalidRows.length,
    missingCases: missingCaseIds.length,
    missingCaseIds
  };
};

const markdownForImport = report => {
  const lines = [
    '# Operational HITL Post-Import Manual Observation Import',
    '',
    `- generatedAt: ${report.generatedAt}`,
    `- status: ${report.status}`,
    `- imported: ${report.summary.manualImportedRows}`,
    `- invalid: ${report.summary.invalidRows}`,
    `- serviceWritesPerformed: ${report.serviceWritesPerformed}`,
    ''
  ];
  if (report.invalidRows.length > 0) {
    lines.push('## Invalid Rows', '');
    report.invalidRows.forEach(row => lines.push(`- row ${row.rowNumber}: ${row.caseId} (${row.failedChecks.join(', ')})`));
  }
  lines.push('', `Recommended action: ${report.recommendedAction}`, '');
  return `${lines.join('\n')}\n`;
};

const importRecommendedAction = status => ({
  missing_validation_plan: 'Create the post-import validation plan before importing manual observations.',
  blocked_validation_plan_not_ready: 'Finish HITL verification and Common Agent manual import review before importing manual observations.',
  invalid_manual_observations: 'Fix invalid manual observation rows, then rerun the import command.',
  partial_observations_collected: 'Capture or import the remaining post-import observations before building final evidence.',
  ready_for_evidence_build: 'Manual observations are merged. Run npm run operational:hitl:post-import-validation-evidence.'
}[status] || 'Review manual observation import state.');

const importOperationalHitlPostImportManualObservations = ({
  generatedAt = new Date().toISOString(),
  validationPlan = null,
  observations = null,
  manualObservationCsv = '',
  sourceArtifacts = {}
} = {}) => {
  const rows = parseCsv(manualObservationCsv);
  const cases = planCaseMap(validationPlan);
  const invalidRows = [];
  const importedRows = [];
  rows.forEach(row => {
    const testCase = cases.get(compact(row.caseId));
    const failedChecks = validateManualRow({ row, testCase });
    if (failedChecks.length > 0) {
      invalidRows.push({
        rowNumber: row.rowNumber,
        caseId: compact(row.caseId),
        failedChecks
      });
      return;
    }
    importedRows.push(observationForRow({ row, testCase }));
  });

  const merged = new Map(asArray(observations?.results).map(item => [compact(item.caseId), item]));
  if (invalidRows.length === 0) {
    importedRows.forEach(item => merged.set(compact(item.caseId), item));
  }
  const results = [...merged.values()];
  const status = statusForImport({ validationPlan, invalidRows, results });
  const report = {
    schemaVersion: 1,
    contractVersion: OBSERVATIONS_CONTRACT,
    generatedAt,
    sourceSystem: 'mold-master-ai',
    targetSystem: 'mold_master_ai_common_agent_graph',
    deliveryMode: 'artifact_only',
    status,
    serviceWritesPerformed: false,
    localArtifactsWritten: true,
    policy: policy(),
    summary: summaryForImport({ validationPlan, observations, importedRows: invalidRows.length === 0 ? importedRows : [], invalidRows, results }),
    results,
    invalidRows,
    sources: {
      validationPlan: sourceArtifacts.validationPlan || null,
      observations: sourceArtifacts.observations || null,
      manualObservationCsv: sourceArtifacts.manualObservationCsv || null
    },
    recommendedAction: importRecommendedAction(status)
  };
  return {
    ...report,
    markdown: markdownForImport(report)
  };
};

module.exports = {
  buildOperationalHitlPostImportManualObservationTemplate,
  importOperationalHitlPostImportManualObservations
};
