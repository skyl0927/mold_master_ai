const asArray = value => Array.isArray(value) ? value : [];

const compact = value => String(value || '').replace(/\s+/g, ' ').trim();

const unique = values => [...new Set(asArray(values).map(compact).filter(Boolean))];

const REQUIRED_PLAN_CONTRACT = 'operational-hitl-post-import-validation-plan/v1';
const OBSERVATIONS_CONTRACT = 'operational-hitl-post-import-validation-observations/v1';

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

const emptySummary = () => ({
  totalPlannedCases: 0,
  observedCases: 0,
  missingCases: 0,
  missingCaseIds: [],
  graphRagCases: 0,
  visionRoundtripCases: 0,
  labelConflictCases: 0,
  ignoredObservationCases: 0
});

const evidenceTexts = payload =>
  asArray(payload?.evidence)
    .map(item => compact(item?.text || item?.content || item?.summary))
    .filter(Boolean);

const citationIds = payload =>
  unique(asArray(payload?.evidence).map(item =>
    item?.source_ref || item?.node_id || item?.source_id || item?.id
  ));

const reasoningPaths = payload =>
  unique(asArray(payload?.reasoning_trace || payload?.reasoningPaths).filter(item =>
    /evidence|graph|path|policy|source|retrieval|relation/i.test(compact(item))
  ));

const graphEvidencePolicy = ({ testCase, observation, payload }) => {
  const explicitPolicy = compact(
    observation?.response?.evidencePolicy
    || observation?.evidencePolicy
    || payload?.evidence_policy
    || payload?.evidencePolicy
  );
  if (explicitPolicy) return explicitPolicy;
  const requestedPolicy = compact(testCase?.commonAgentRequest?.filters?.evidence_policy);
  if (requestedPolicy) return requestedPolicy;
  return reasoningPaths(payload).some(item => item.includes('graph_approved_only'))
    ? 'graph_approved_only'
    : '';
};

const graphResponseFor = ({ testCase, observation }) => {
  const payload = observation.rawCommonAgentPayload || observation.response || {};
  return {
    answer: compact(payload.answer || payload.response || payload.summary),
    summary: compact(payload.summary),
    confidence: Number(payload.confidence) || 0,
    citations: citationIds(payload),
    reasoningPaths: reasoningPaths(payload),
    evidenceKeywords: evidenceTexts(payload),
    evidencePolicy: graphEvidencePolicy({ testCase, observation, payload })
  };
};

const manualResponseFor = observation => ({
  ...(observation.response || {}),
  ...(observation.response ? {} : observation.observedResponse || {})
});

const responseFor = ({ testCase, observation }) => {
  if (testCase.testType === 'graph_rag_answer_grounding') {
    return graphResponseFor({ testCase, observation });
  }
  return manualResponseFor(observation);
};

const observationsArray = observations => {
  if (!observations) return [];
  if (Array.isArray(observations)) return observations;
  return asArray(observations.results);
};

const observationsByCaseId = observations =>
  new Map(observationsArray(observations).map(item => [compact(item?.caseId), item]));

const summaryFor = ({ testCases, results, ignoredObservationCases }) => {
  const observedIds = new Set(results.map(item => item.caseId));
  const missingCaseIds = testCases
    .map(item => compact(item.id))
    .filter(caseId => !observedIds.has(caseId));
  return {
    totalPlannedCases: testCases.length,
    observedCases: results.length,
    missingCases: missingCaseIds.length,
    missingCaseIds,
    graphRagCases: testCases.filter(item => item.testType === 'graph_rag_answer_grounding').length,
    visionRoundtripCases: testCases.filter(item => item.testType === 'vision_label_roundtrip').length,
    labelConflictCases: testCases.filter(item => item.testType === 'label_conflict_resolution_roundtrip').length,
    ignoredObservationCases
  };
};

const statusFor = ({ validationPlan, observations, summary }) => {
  if (!validationPlan || validationPlan.contractVersion !== REQUIRED_PLAN_CONTRACT) {
    return 'missing_validation_plan';
  }
  if (validationPlan.status !== 'ready_for_post_import_validation') {
    return 'blocked_validation_plan_not_ready';
  }
  if (observations?.serviceWritesPerformed === true) return 'unsafe_observations';
  if (observations && observations.contractVersion && observations.contractVersion !== OBSERVATIONS_CONTRACT) {
    return 'invalid_observations';
  }
  if (summary.observedCases === 0) return 'awaiting_validation_execution';
  return summary.missingCases === 0
    ? 'ready_for_post_import_validation_result'
    : 'partial_evidence_collected';
};

const recommendedActionFor = status => ({
  missing_validation_plan: 'Create the post-import validation plan before collecting validation evidence.',
  blocked_validation_plan_not_ready: 'Finish HITL verification and Common Agent manual import review before collecting validation evidence.',
  unsafe_observations: 'Discard the observation artifact and rerun validation capture without service writes.',
  invalid_observations: 'Regenerate observations with the operational-hitl-post-import-validation-observations/v1 contract.',
  awaiting_validation_execution: 'Run the planned Common Agent/Mold Master validation cases and capture observations.',
  partial_evidence_collected: 'Capture the missing post-import validation observations, then rebuild this evidence artifact.',
  ready_for_post_import_validation_result: 'Evidence is ready. Run npm run operational:hitl:post-import-validation-result.'
}[status] || 'Review post-import validation evidence state.');

const markdownFor = evidence => {
  const lines = [
    '# Operational HITL Post-Import Validation Evidence',
    '',
    `- generatedAt: ${evidence.generatedAt}`,
    `- status: ${evidence.status}`,
    `- planned: ${evidence.summary.totalPlannedCases}`,
    `- observed: ${evidence.summary.observedCases}`,
    `- missing: ${evidence.summary.missingCases}`,
    `- serviceWritesPerformed: ${evidence.serviceWritesPerformed}`,
    '',
    '| Case | Type | Evidence |',
    '|---|---|---|'
  ];
  evidence.results.forEach(item => {
    const hasCitation = asArray(item.response?.citations).length > 0 ? 'cited' : 'captured';
    lines.push(`| ${item.caseId} | ${item.testType} | ${hasCitation} |`);
  });
  if (evidence.summary.missingCaseIds.length > 0) {
    lines.push('', '## Missing Cases', '');
    evidence.summary.missingCaseIds.forEach(caseId => lines.push(`- ${caseId}`));
  }
  lines.push('', `Recommended action: ${evidence.recommendedAction}`, '');
  return `${lines.join('\n')}\n`;
};

const blockedEvidence = ({ generatedAt, status, validationPlan, sourceArtifacts }) => {
  const evidence = {
    schemaVersion: 1,
    contractVersion: 'operational-hitl-post-import-validation-evidence/v1',
    generatedAt,
    sourceSystem: 'mold-master-ai',
    targetSystem: 'mold_master_ai_common_agent_graph',
    deliveryMode: 'artifact_only',
    status,
    serviceWritesPerformed: false,
    localArtifactsWritten: true,
    policy: policy(),
    summary: {
      ...emptySummary(),
      totalPlannedCases: asArray(validationPlan?.testCases).length
    },
    results: [],
    sources: {
      validationPlan: sourceArtifacts.validationPlan || null,
      observations: sourceArtifacts.observations || null
    },
    recommendedAction: recommendedActionFor(status)
  };
  return {
    ...evidence,
    markdown: markdownFor(evidence)
  };
};

const buildOperationalHitlPostImportValidationEvidence = ({
  generatedAt = new Date().toISOString(),
  validationPlan = null,
  observations = null,
  sourceArtifacts = {}
} = {}) => {
  if (!validationPlan || validationPlan.contractVersion !== REQUIRED_PLAN_CONTRACT) {
    return blockedEvidence({
      generatedAt,
      status: 'missing_validation_plan',
      validationPlan,
      sourceArtifacts
    });
  }

  if (validationPlan.status !== 'ready_for_post_import_validation') {
    return blockedEvidence({
      generatedAt,
      status: 'blocked_validation_plan_not_ready',
      validationPlan,
      sourceArtifacts
    });
  }

  if (observations?.serviceWritesPerformed === true) {
    return blockedEvidence({
      generatedAt,
      status: 'unsafe_observations',
      validationPlan,
      sourceArtifacts
    });
  }

  if (observations && observations.contractVersion && observations.contractVersion !== OBSERVATIONS_CONTRACT) {
    return blockedEvidence({
      generatedAt,
      status: 'invalid_observations',
      validationPlan,
      sourceArtifacts
    });
  }

  const testCases = asArray(validationPlan.testCases);
  const observationMap = observationsByCaseId(observations);
  const plannedIds = new Set(testCases.map(item => compact(item.id)));
  const ignoredObservationCases = observationsArray(observations)
    .filter(item => !plannedIds.has(compact(item?.caseId))).length;
  const results = testCases
    .map(testCase => {
      const observation = observationMap.get(compact(testCase.id));
      if (!observation) return null;
      return {
        caseId: compact(testCase.id),
        testType: compact(testCase.testType),
        capturedAt: compact(observation.capturedAt) || generatedAt,
        response: responseFor({ testCase, observation }),
        rawObservationIncluded: false
      };
    })
    .filter(Boolean);
  const summary = summaryFor({ testCases, results, ignoredObservationCases });
  const status = statusFor({ validationPlan, observations, summary });
  const evidence = {
    schemaVersion: 1,
    contractVersion: 'operational-hitl-post-import-validation-evidence/v1',
    generatedAt,
    sourceSystem: 'mold-master-ai',
    targetSystem: 'mold_master_ai_common_agent_graph',
    deliveryMode: 'artifact_only',
    status,
    serviceWritesPerformed: false,
    localArtifactsWritten: true,
    policy: policy(),
    summary,
    results,
    sources: {
      validationPlan: sourceArtifacts.validationPlan || null,
      observations: sourceArtifacts.observations || null
    },
    recommendedAction: recommendedActionFor(status)
  };
  return {
    ...evidence,
    markdown: markdownFor(evidence)
  };
};

module.exports = {
  buildOperationalHitlPostImportValidationEvidence
};
