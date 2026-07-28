const asArray = value => Array.isArray(value) ? value : [];

const compact = value => String(value || '').replace(/\s+/g, ' ').trim();

const REQUIRED_PLAN_CONTRACT = 'operational-hitl-post-import-validation-plan/v1';

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

const normalizeBaseUrl = value => compact(value || 'http://127.0.0.1:8000').replace(/\/+$/, '');

const endpointFor = testCase => compact(testCase?.commonAgentRequest?.endpoint || '/v1/ask');

const methodFor = testCase => compact(testCase?.commonAgentRequest?.method || 'POST').toUpperCase();

const isGraphExecutableCase = testCase =>
  compact(testCase?.testType) === 'graph_rag_answer_grounding'
  && endpointFor(testCase) === '/v1/ask'
  && methodFor(testCase) === 'POST';

const graphRequestBodyFor = testCase => {
  const request = testCase.commonAgentRequest || {};
  const caseId = compact(testCase.id);
  return {
    question: compact(request.question || testCase.questionKo),
    top_k: Number(request.top_k || request.topK || 8),
    session_id: `mold-master-post-import-validation-${caseId}`,
    filters: {
      include_rag: true,
      include_reasoning_paths: true,
      include_knowledge_graph: true,
      include_knowledge_relations: true,
      ...(request.filters || {}),
      evidence_policy: 'graph_approved_only',
      source_app: compact(request.filters?.source_app) || 'mold-master-ai',
      validation_case_id: caseId
    }
  };
};

const defaultAskGraph = async ({ url, body, timeoutMs = 45000 }) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const payload = await response.json().catch(async () => ({
      text: await response.text().catch(() => '')
    }));
    return {
      ok: response.ok,
      httpStatus: response.status,
      payload
    };
  } finally {
    clearTimeout(timer);
  }
};

const graphObservationFor = async ({
  testCase,
  generatedAt,
  commonAgentUrl,
  askGraph,
  timeoutMs
}) => {
  const startedAt = Date.now();
  const url = `${commonAgentUrl}${endpointFor(testCase)}`;
  const body = graphRequestBodyFor(testCase);
  try {
    const response = await askGraph({
      url,
      body,
      testCase,
      timeoutMs
    });
    const httpOk = response?.ok === true;
    const httpStatus = Number(response?.httpStatus) || 0;
    const payload = response?.payload || {};
    return {
      caseId: compact(testCase.id),
      testType: compact(testCase.testType),
      capturedAt: generatedAt,
      commonAgentUrl,
      endpoint: endpointFor(testCase),
      method: 'POST',
      httpOk,
      httpStatus,
      latencyMs: Date.now() - startedAt,
      request: {
        url,
        body
      },
      rawCommonAgentPayload: payload,
      requestError: httpOk ? undefined : `${httpStatus} ${JSON.stringify(payload)}`,
      serviceWritesPerformed: false
    };
  } catch (error) {
    return {
      caseId: compact(testCase.id),
      testType: compact(testCase.testType),
      capturedAt: generatedAt,
      commonAgentUrl,
      endpoint: endpointFor(testCase),
      method: 'POST',
      httpOk: false,
      httpStatus: 0,
      latencyMs: Date.now() - startedAt,
      request: {
        url,
        body
      },
      rawCommonAgentPayload: {},
      requestError: error instanceof Error ? error.message : String(error),
      serviceWritesPerformed: false
    };
  }
};

const emptySummary = testCases => ({
  totalPlannedCases: testCases.length,
  graphExecutableCases: 0,
  graphCapturedCases: 0,
  graphFailedCases: 0,
  manualObservationRequiredCases: 0,
  manualObservationRequiredCaseIds: []
});

const statusFor = ({ validationPlan, graphCases, manualCaseIds, graphFailedCases }) => {
  if (!validationPlan || validationPlan.contractVersion !== REQUIRED_PLAN_CONTRACT) {
    return 'missing_validation_plan';
  }
  if (validationPlan.status !== 'ready_for_post_import_validation') {
    return 'blocked_validation_plan_not_ready';
  }
  if (graphCases.length === 0 && manualCaseIds.length > 0) return 'awaiting_manual_observations';
  if (graphFailedCases > 0) return 'graph_observations_collected_with_failures';
  if (manualCaseIds.length > 0) return 'partial_observations_collected';
  return graphCases.length > 0 ? 'ready_for_evidence_build' : 'no_validation_cases';
};

const recommendedActionFor = status => ({
  missing_validation_plan: 'Create the post-import validation plan before capturing observations.',
  blocked_validation_plan_not_ready: 'Finish HITL verification and Common Agent manual import review before live observation capture.',
  awaiting_manual_observations: 'Capture manual Vision and label-conflict observations, then build validation evidence.',
  graph_observations_collected_with_failures: 'Review failed Common Agent graph observation calls, fix connectivity or graph import state, then rerun observation capture.',
  partial_observations_collected: 'Graph observations were captured. Add manual Vision and label-conflict observations before building final validation evidence.',
  ready_for_evidence_build: 'Observation capture is ready. Run npm run operational:hitl:post-import-validation-evidence.',
  no_validation_cases: 'Regenerate the post-import validation plan because it contains no validation cases.'
}[status] || 'Review post-import validation observation state.');

const markdownFor = observations => {
  const lines = [
    '# Operational HITL Post-Import Validation Observations',
    '',
    `- generatedAt: ${observations.generatedAt}`,
    `- status: ${observations.status}`,
    `- graph captured: ${observations.summary.graphCapturedCases}/${observations.summary.graphExecutableCases}`,
    `- graph failed: ${observations.summary.graphFailedCases}`,
    `- manual required: ${observations.summary.manualObservationRequiredCases}`,
    `- serviceWritesPerformed: ${observations.serviceWritesPerformed}`,
    '',
    '| Case | HTTP | Status |',
    '|---|---|---|'
  ];
  observations.results.forEach(item => {
    lines.push(`| ${item.caseId} | ${item.httpStatus} | ${item.httpOk ? 'ok' : 'failed'} |`);
  });
  if (observations.summary.manualObservationRequiredCaseIds.length > 0) {
    lines.push('', '## Manual Observation Required', '');
    observations.summary.manualObservationRequiredCaseIds.forEach(caseId => lines.push(`- ${caseId}`));
  }
  lines.push('', `Recommended action: ${observations.recommendedAction}`, '');
  return `${lines.join('\n')}\n`;
};

const buildReport = ({
  generatedAt,
  status,
  validationPlan,
  commonAgentUrl,
  results = [],
  graphCases = [],
  manualCaseIds = [],
  sourceArtifacts = {}
}) => {
  const graphFailedCases = results.filter(item => item.httpOk !== true).length;
  const summary = {
    ...emptySummary(asArray(validationPlan?.testCases)),
    graphExecutableCases: graphCases.length,
    graphCapturedCases: results.length,
    graphFailedCases,
    manualObservationRequiredCases: manualCaseIds.length,
    manualObservationRequiredCaseIds: manualCaseIds
  };
  const resolvedStatus = status || statusFor({
    validationPlan,
    graphCases,
    manualCaseIds,
    graphFailedCases
  });
  const report = {
    schemaVersion: 1,
    contractVersion: 'operational-hitl-post-import-validation-observations/v1',
    generatedAt,
    sourceSystem: 'mold-master-ai',
    targetSystem: 'mold_master_ai_common_agent_graph',
    deliveryMode: 'artifact_only',
    status: resolvedStatus,
    commonAgentUrl,
    serviceWritesPerformed: false,
    localArtifactsWritten: true,
    policy: policy(),
    summary,
    results,
    sources: {
      validationPlan: sourceArtifacts.validationPlan || null
    },
    recommendedAction: recommendedActionFor(resolvedStatus)
  };
  return {
    ...report,
    markdown: markdownFor(report)
  };
};

const collectOperationalHitlPostImportValidationObservations = async ({
  generatedAt = new Date().toISOString(),
  validationPlan = null,
  commonAgentUrl = process.env.COMMON_AGENT_URL || 'http://127.0.0.1:8000',
  askGraph = defaultAskGraph,
  timeoutMs = 45000,
  sourceArtifacts = {}
} = {}) => {
  const normalizedCommonAgentUrl = normalizeBaseUrl(commonAgentUrl);
  const testCases = asArray(validationPlan?.testCases);
  if (!validationPlan || validationPlan.contractVersion !== REQUIRED_PLAN_CONTRACT) {
    return buildReport({
      generatedAt,
      status: 'missing_validation_plan',
      validationPlan,
      commonAgentUrl: normalizedCommonAgentUrl,
      sourceArtifacts
    });
  }
  if (validationPlan.status !== 'ready_for_post_import_validation') {
    return buildReport({
      generatedAt,
      status: 'blocked_validation_plan_not_ready',
      validationPlan,
      commonAgentUrl: normalizedCommonAgentUrl,
      sourceArtifacts
    });
  }

  const graphCases = testCases.filter(isGraphExecutableCase);
  const graphCaseIds = new Set(graphCases.map(item => compact(item.id)));
  const manualCaseIds = testCases
    .map(item => compact(item.id))
    .filter(caseId => !graphCaseIds.has(caseId));
  const results = [];
  for (const testCase of graphCases) {
    results.push(await graphObservationFor({
      testCase,
      generatedAt,
      commonAgentUrl: normalizedCommonAgentUrl,
      askGraph,
      timeoutMs
    }));
  }

  return buildReport({
    generatedAt,
    validationPlan,
    commonAgentUrl: normalizedCommonAgentUrl,
    results,
    graphCases,
    manualCaseIds,
    sourceArtifacts
  });
};

module.exports = {
  collectOperationalHitlPostImportValidationObservations
};
