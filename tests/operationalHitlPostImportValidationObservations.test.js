const assert = require('node:assert/strict');
const test = require('node:test');

const {
  collectOperationalHitlPostImportValidationObservations
} = require('../operationalHitlPostImportValidationObservations');
const {
  buildOperationalHitlPostImportValidationEvidence
} = require('../operationalHitlPostImportValidationEvidence');

const sha = value => String(value).repeat(64).slice(0, 64);

const readyPlan = () => ({
  contractVersion: 'operational-hitl-post-import-validation-plan/v1',
  status: 'ready_for_post_import_validation',
  serviceWritesPerformed: false,
  summary: {
    totalTestCases: 3
  },
  testCases: [
    {
      id: 'graph-web-case-001',
      testType: 'graph_rag_answer_grounding',
      expectedEvidenceKeywords: ['weldline', 'mold temperature'],
      commonAgentRequest: {
        endpoint: '/v1/ask',
        method: 'POST',
        question: 'Weldline near a rib. Use approved graph evidence only.',
        top_k: 8,
        filters: {
          include_rag: true,
          include_reasoning_paths: true,
          evidence_policy: 'graph_approved_only',
          source_app: 'mold-master-ai'
        }
      }
    },
    {
      id: 'graph-web-case-002',
      testType: 'graph_rag_answer_grounding',
      expectedEvidenceKeywords: ['burn', 'vent'],
      commonAgentRequest: {
        endpoint: '/v1/ask',
        method: 'POST',
        question: 'Burn mark. Use approved graph evidence only.',
        top_k: 6,
        filters: {
          include_rag: true,
          include_reasoning_paths: true,
          evidence_policy: 'graph_approved_only',
          source_app: 'mold-master-ai'
        }
      }
    },
    {
      id: 'vision-sink-001',
      testType: 'vision_label_roundtrip',
      contentSha256: sha('b'),
      expectedLabel: 'sink mark',
      expectedDefectClass: 'sink'
    }
  ]
});

test('captures graph observations from Common Agent without service writes', async () => {
  const calls = [];
  const observations = await collectOperationalHitlPostImportValidationObservations({
    generatedAt: '2026-07-28T07:00:00.000Z',
    validationPlan: readyPlan(),
    commonAgentUrl: 'http://common-agent.test',
    askGraph: async request => {
      calls.push(request);
      return {
        ok: true,
        httpStatus: 200,
        payload: {
          answer: `${request.testCase.id} approved answer with weldline mold temperature burn vent evidence.`,
          confidence: 0.92,
          evidence: [
            {
              source_ref: `graph:path:${request.testCase.id}`,
              source_type: 'graph',
              review_status: 'approved',
              text: 'Approved graph evidence for weldline, mold temperature, burn, and vent.'
            }
          ],
          reasoning_trace: [
            'evidence_policy=graph_approved_only',
            'reasoning path: phenomenon -> cause -> countermeasure'
          ]
        }
      };
    },
    sourceArtifacts: {
      validationPlan: 'artifacts/validation-plan.json'
    }
  });

  assert.equal(observations.contractVersion, 'operational-hitl-post-import-validation-observations/v1');
  assert.equal(observations.status, 'partial_observations_collected');
  assert.equal(observations.serviceWritesPerformed, false);
  assert.equal(observations.policy.automaticServiceWritesAllowed, false);
  assert.equal(observations.summary.totalPlannedCases, 3);
  assert.equal(observations.summary.graphExecutableCases, 2);
  assert.equal(observations.summary.graphCapturedCases, 2);
  assert.equal(observations.summary.graphFailedCases, 0);
  assert.equal(observations.summary.manualObservationRequiredCases, 1);
  assert.deepEqual(observations.summary.manualObservationRequiredCaseIds, ['vision-sink-001']);
  assert.equal(observations.sources.validationPlan, 'artifacts/validation-plan.json');

  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, 'http://common-agent.test/v1/ask');
  assert.equal(calls[0].body.question, 'Weldline near a rib. Use approved graph evidence only.');
  assert.equal(calls[0].body.top_k, 8);
  assert.equal(calls[0].body.session_id, 'mold-master-post-import-validation-graph-web-case-001');
  assert.equal(calls[0].body.filters.evidence_policy, 'graph_approved_only');
  assert.equal(calls[0].body.filters.include_reasoning_paths, true);
  assert.equal(calls[0].body.filters.source_app, 'mold-master-ai');
  assert.equal(calls[0].body.filters.validation_case_id, 'graph-web-case-001');

  const firstResult = observations.results[0];
  assert.equal(firstResult.caseId, 'graph-web-case-001');
  assert.equal(firstResult.testType, 'graph_rag_answer_grounding');
  assert.equal(firstResult.httpStatus, 200);
  assert.equal(firstResult.commonAgentUrl, 'http://common-agent.test');
  assert.match(firstResult.rawCommonAgentPayload.answer, /approved answer/);
  assert.equal(firstResult.serviceWritesPerformed, false);

  const evidence = buildOperationalHitlPostImportValidationEvidence({
    validationPlan: readyPlan(),
    observations
  });
  assert.equal(evidence.status, 'partial_evidence_collected');
  assert.equal(evidence.summary.observedCases, 2);
  assert.equal(evidence.summary.missingCases, 1);
  assert.deepEqual(evidence.summary.missingCaseIds, ['vision-sink-001']);
});

test('records graph request failures without throwing or inventing approved evidence', async () => {
  const plan = readyPlan();
  plan.testCases = plan.testCases.slice(0, 1);
  const observations = await collectOperationalHitlPostImportValidationObservations({
    validationPlan: plan,
    askGraph: async () => ({
      ok: false,
      httpStatus: 503,
      payload: {
        detail: 'Common Agent unavailable'
      }
    })
  });

  assert.equal(observations.status, 'graph_observations_collected_with_failures');
  assert.equal(observations.summary.graphCapturedCases, 1);
  assert.equal(observations.summary.graphFailedCases, 1);
  assert.equal(observations.results.length, 1);
  assert.equal(observations.results[0].httpOk, false);
  assert.equal(observations.results[0].httpStatus, 503);
  assert.match(observations.results[0].requestError, /503/);
  assert.deepEqual(observations.results[0].rawCommonAgentPayload, { detail: 'Common Agent unavailable' });
});

test('fails closed for blocked plans without calling Common Agent', async () => {
  let called = false;
  const observations = await collectOperationalHitlPostImportValidationObservations({
    validationPlan: {
      ...readyPlan(),
      status: 'blocked_import_package_not_ready',
      testCases: []
    },
    askGraph: async () => {
      called = true;
      return { ok: true, httpStatus: 200, payload: {} };
    }
  });

  assert.equal(observations.status, 'blocked_validation_plan_not_ready');
  assert.equal(called, false);
  assert.equal(observations.summary.totalPlannedCases, 0);
  assert.deepEqual(observations.results, []);
});

test('reports manual-only plans as awaiting manual observations', async () => {
  const plan = readyPlan();
  plan.testCases = plan.testCases.filter(item => item.testType !== 'graph_rag_answer_grounding');
  const observations = await collectOperationalHitlPostImportValidationObservations({
    validationPlan: plan
  });

  assert.equal(observations.status, 'awaiting_manual_observations');
  assert.equal(observations.summary.graphExecutableCases, 0);
  assert.equal(observations.summary.manualObservationRequiredCases, 1);
  assert.deepEqual(observations.summary.manualObservationRequiredCaseIds, ['vision-sink-001']);
});
