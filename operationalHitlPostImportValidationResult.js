const asArray = value => Array.isArray(value) ? value : [];

const compact = value => String(value || '').replace(/\s+/g, ' ').trim();

const REQUIRED_PLAN_CONTRACT = 'operational-hitl-post-import-validation-plan/v1';
const REQUIRED_EVIDENCE_CONTRACT = 'operational-hitl-post-import-validation-evidence/v1';

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

const numberValue = value => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const textIncludesAny = (value, keywords) => {
  const text = compact(value).toLowerCase();
  return asArray(keywords).some(keyword => text.includes(compact(keyword).toLowerCase()));
};

const responseTextFor = response => [
  response?.answer,
  response?.summary,
  response?.explanation,
  ...asArray(response?.evidenceKeywords),
  ...asArray(response?.citations),
  ...asArray(response?.reasoningPaths)
].map(compact).join(' ');

const evidenceByCaseId = validationEvidence =>
  new Map(asArray(validationEvidence?.results).map(item => [compact(item?.caseId), item]));

const graphFailedChecks = ({ testCase, evidence }) => {
  const response = evidence?.response || {};
  const failed = [];
  if (compact(response.evidencePolicy) !== 'graph_approved_only') {
    failed.push('approved_graph_policy_missing');
  }
  if (asArray(response.citations).length === 0 && asArray(response.reasoningPaths).length === 0) {
    failed.push('graph_citation_or_reasoning_path_missing');
  }
  if (!textIncludesAny(responseTextFor(response), testCase.expectedEvidenceKeywords)) {
    failed.push('expected_keyword_missing');
  }
  return failed;
};

const visionFailedChecks = ({ testCase, evidence }) => {
  const response = evidence?.response || {};
  const failed = [];
  if (compact(response.reviewStatus) !== 'approved') failed.push('approved_review_status_missing');
  if (compact(response.contentSha256).toLowerCase() !== compact(testCase.contentSha256).toLowerCase()) {
    failed.push('content_hash_mismatch');
  }
  if (compact(response.label) !== compact(testCase.expectedLabel)) failed.push('label_mismatch');
  if (compact(response.defectClass) !== compact(testCase.expectedDefectClass)) {
    failed.push('defect_class_mismatch');
  }
  return failed;
};

const labelConflictFailedChecks = ({ testCase, evidence }) => {
  const response = evidence?.response || {};
  const failed = [];
  const activeLabel = compact(response.activeLabel);
  const rejectedActive = asArray(response.rejectedLabelsActive).map(compact).filter(Boolean);
  const affected = new Set(asArray(response.affectedCaseIds).map(compact).filter(Boolean));
  const expectedAffected = asArray(testCase.affectedCaseIds).map(compact).filter(Boolean);
  if (activeLabel !== compact(testCase.expectedLabel)) failed.push('active_label_mismatch');
  if (rejectedActive.some(label => asArray(testCase.rejectedLabels).map(compact).includes(label))) {
    failed.push('rejected_label_still_active');
  }
  if (expectedAffected.some(id => !affected.has(id))) failed.push('affected_case_missing');
  if (asArray(response.reviewHistory).length === 0) failed.push('review_history_missing');
  return failed;
};

const failedChecksFor = ({ testCase, evidence, validationEvidence }) => {
  if (!validationEvidence) return ['validation_evidence_missing'];
  if (validationEvidence.serviceWritesPerformed === true) return ['unsafe_validation_evidence'];
  if (!evidence) return ['case_evidence_missing'];
  if (testCase.testType === 'graph_rag_answer_grounding') {
    return graphFailedChecks({ testCase, evidence });
  }
  if (testCase.testType === 'vision_label_roundtrip') {
    return visionFailedChecks({ testCase, evidence });
  }
  if (testCase.testType === 'label_conflict_resolution_roundtrip') {
    return labelConflictFailedChecks({ testCase, evidence });
  }
  return ['unsupported_test_type'];
};

const caseResultFor = ({ testCase, evidence, validationEvidence }) => {
  const failedChecks = failedChecksFor({ testCase, evidence, validationEvidence });
  return {
    caseId: compact(testCase.id),
    testType: compact(testCase.testType),
    status: failedChecks.length === 0 ? 'passed' : 'failed',
    failedChecks,
    expected: compact(testCase.expectedDefectName || testCase.expectedLabel || testCase.expectedDefectClass),
    sourceEvidenceCaseId: compact(evidence?.caseId) || null
  };
};

const round1 = value => Math.round(value * 10) / 10;

const summaryFor = ({ validationPlan, caseResults }) => {
  const totalCases = caseResults.length;
  const passedCases = caseResults.filter(item => item.status === 'passed').length;
  const failedCases = totalCases - passedCases;
  const missingEvidenceCases = caseResults.filter(item =>
    item.failedChecks.includes('validation_evidence_missing')
    || item.failedChecks.includes('case_evidence_missing')
  ).length;
  return {
    totalCases,
    passedCases,
    failedCases,
    missingEvidenceCases,
    passRate: totalCases > 0 ? round1((passedCases / totalCases) * 100) : 0,
    minimumPassRate: numberValue(validationPlan?.summary?.minimumPassRate) || 85,
    graphRagCases: caseResults.filter(item => item.testType === 'graph_rag_answer_grounding').length,
    visionRoundtripCases: caseResults.filter(item => item.testType === 'vision_label_roundtrip').length,
    labelConflictCases: caseResults.filter(item => item.testType === 'label_conflict_resolution_roundtrip').length
  };
};

const statusFor = ({ validationPlan, validationEvidence, summary }) => {
  if (!validationPlan || validationPlan.contractVersion !== REQUIRED_PLAN_CONTRACT) {
    return 'missing_validation_plan';
  }
  if (validationPlan.status !== 'ready_for_post_import_validation') {
    return 'blocked_validation_plan_not_ready';
  }
  if (!validationEvidence) return 'awaiting_validation_evidence';
  if (validationEvidence.contractVersion !== REQUIRED_EVIDENCE_CONTRACT) {
    return 'invalid_validation_evidence';
  }
  if (validationEvidence.serviceWritesPerformed === true) return 'unsafe_validation_evidence';
  if (summary.totalCases === 0) return 'blocked_no_validation_cases';
  return summary.failedCases === 0 && summary.passRate >= summary.minimumPassRate
    ? 'validation_passed'
    : 'validation_failed';
};

const recommendedActionFor = status => ({
  missing_validation_plan: 'Create the post-import validation plan before evaluating Common Agent or Mold Master responses.',
  blocked_validation_plan_not_ready: 'Finish HITL verification and Common Agent manual import review before post-import validation.',
  awaiting_validation_evidence: 'Run the planned Common Agent/Mold Master validation cases and provide an operational-hitl-post-import-validation-evidence/v1 artifact.',
  invalid_validation_evidence: 'Regenerate validation evidence with the operational-hitl-post-import-validation-evidence/v1 contract.',
  unsafe_validation_evidence: 'Discard unsafe validation evidence and rerun validation without service writes.',
  blocked_no_validation_cases: 'Regenerate the post-import validation plan because it contains no validation cases.',
  validation_failed: 'Review failed post-import validation cases, fix Common Agent/Graph grounding or HITL import data, then rerun validation.',
  validation_passed: 'Post-import validation passed. Proceed to operator release validation without automatic Graph, Reference, or model promotion.'
}[status] || 'Review post-import validation state.');

const markdownFor = result => {
  const lines = [
    '# Operational HITL Post-Import Validation Result',
    '',
    `- generatedAt: ${result.generatedAt}`,
    `- status: ${result.status}`,
    `- passed: ${result.summary.passedCases}/${result.summary.totalCases}`,
    `- passRate: ${result.summary.passRate}%`,
    `- minimumPassRate: ${result.summary.minimumPassRate}%`,
    `- serviceWritesPerformed: ${result.serviceWritesPerformed}`,
    '',
    '| Case | Type | Status | Failed checks |',
    '|---|---|---|---|'
  ];
  result.caseResults.forEach(item => {
    lines.push(`| ${item.caseId} | ${item.testType} | ${item.status} | ${item.failedChecks.join(', ') || '-'} |`);
  });
  lines.push('', `Recommended action: ${result.recommendedAction}`, '');
  return `${lines.join('\n')}\n`;
};

const buildOperationalHitlPostImportValidationResult = ({
  generatedAt = new Date().toISOString(),
  validationPlan = null,
  validationEvidence = null,
  sourceArtifacts = {}
} = {}) => {
  const evidenceMap = evidenceByCaseId(validationEvidence);
  const testCases = validationPlan?.contractVersion === REQUIRED_PLAN_CONTRACT
    ? asArray(validationPlan.testCases)
    : [];
  const caseResults = testCases.map(testCase => caseResultFor({
    testCase,
    evidence: evidenceMap.get(compact(testCase.id)),
    validationEvidence
  }));
  const summary = summaryFor({ validationPlan, caseResults });
  const status = statusFor({ validationPlan, validationEvidence, summary });
  const result = {
    schemaVersion: 1,
    contractVersion: 'operational-hitl-post-import-validation-result/v1',
    generatedAt,
    sourceSystem: 'mold-master-ai',
    targetSystem: 'mold_master_ai_common_agent_graph',
    deliveryMode: 'artifact_only',
    status,
    readyForOperationalReleaseValidation: status === 'validation_passed',
    serviceWritesPerformed: false,
    localArtifactsWritten: true,
    policy: policy(),
    summary,
    caseResults,
    sources: {
      validationPlan: sourceArtifacts.validationPlan || null,
      validationEvidence: sourceArtifacts.validationEvidence || null
    },
    recommendedAction: recommendedActionFor(status)
  };
  return {
    ...result,
    markdown: markdownFor(result)
  };
};

module.exports = {
  buildOperationalHitlPostImportValidationResult
};
