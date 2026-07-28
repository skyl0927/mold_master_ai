const assert = require('node:assert/strict');
const test = require('node:test');

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
      expectedEvidenceKeywords: ['weldline', 'mold temperature', 'resin temperature'],
      commonAgentRequest: {
        endpoint: '/v1/ask',
        question: 'Weldline near a rib. Use approved graph evidence only.',
        filters: {
          evidence_policy: 'graph_approved_only',
          include_reasoning_paths: true
        }
      }
    },
    {
      id: 'vision-sink-001',
      testType: 'vision_label_roundtrip',
      contentSha256: sha('b'),
      expectedLabel: 'sink mark',
      expectedDefectClass: 'sink'
    },
    {
      id: 'label-conflict-001',
      testType: 'label_conflict_resolution_roundtrip',
      expectedLabel: 'burn',
      rejectedLabels: ['weldline'],
      affectedCaseIds: ['approved-image-a', 'approved-image-b']
    }
  ]
});

const observations = () => ({
  contractVersion: 'operational-hitl-post-import-validation-observations/v1',
  serviceWritesPerformed: false,
  results: [
    {
      caseId: 'graph-web-case-001',
      rawCommonAgentPayload: {
        answer: 'Approved graph path explains weldline from mold temperature and resin temperature imbalance.',
        confidence: 0.91,
        evidence: [
          {
            source_ref: 'graph:path:web-case-001',
            source_type: 'graph',
            review_status: 'approved',
            text: 'Weldline root cause includes low mold temperature and resin temperature imbalance.'
          }
        ],
        reasoning_trace: [
          'evidence_policy=graph_approved_only',
          'reasoning path: phenomenon -> cause -> countermeasure'
        ]
      }
    },
    {
      caseId: 'vision-sink-001',
      response: {
        contentSha256: sha('b'),
        label: 'sink mark',
        defectClass: 'sink',
        reviewStatus: 'approved'
      }
    },
    {
      caseId: 'label-conflict-001',
      response: {
        activeLabel: 'burn',
        affectedCaseIds: ['approved-image-a', 'approved-image-b'],
        rejectedLabelsActive: [],
        reviewHistory: [{ reviewerId: 'quality-lead-01' }]
      }
    }
  ]
});

test('builds no-write post-import evidence from captured Common Agent and manual observations', () => {
  const evidence = buildOperationalHitlPostImportValidationEvidence({
    generatedAt: '2026-07-28T06:00:00.000Z',
    validationPlan: readyPlan(),
    observations: observations(),
    sourceArtifacts: {
      validationPlan: 'artifacts/validation-plan.json',
      observations: 'artifacts/observations.json'
    }
  });

  assert.equal(evidence.contractVersion, 'operational-hitl-post-import-validation-evidence/v1');
  assert.equal(evidence.status, 'ready_for_post_import_validation_result');
  assert.equal(evidence.serviceWritesPerformed, false);
  assert.equal(evidence.policy.automaticServiceWritesAllowed, false);
  assert.equal(evidence.summary.totalPlannedCases, 3);
  assert.equal(evidence.summary.observedCases, 3);
  assert.equal(evidence.summary.missingCases, 0);
  assert.deepEqual(evidence.summary.missingCaseIds, []);
  assert.equal(evidence.sources.validationPlan, 'artifacts/validation-plan.json');
  assert.equal(evidence.sources.observations, 'artifacts/observations.json');

  const graphResult = evidence.results.find(item => item.caseId === 'graph-web-case-001');
  assert.equal(graphResult.response.evidencePolicy, 'graph_approved_only');
  assert.deepEqual(graphResult.response.citations, ['graph:path:web-case-001']);
  assert.deepEqual(graphResult.response.reasoningPaths, [
    'evidence_policy=graph_approved_only',
    'reasoning path: phenomenon -> cause -> countermeasure'
  ]);
  assert.match(graphResult.response.answer, /weldline/);
  assert.ok(graphResult.response.evidenceKeywords.some(item => /mold temperature/.test(item)));
});

test('awaits validation execution without inventing passing evidence', () => {
  const evidence = buildOperationalHitlPostImportValidationEvidence({
    validationPlan: readyPlan(),
    observations: null
  });

  assert.equal(evidence.status, 'awaiting_validation_execution');
  assert.equal(evidence.summary.totalPlannedCases, 3);
  assert.equal(evidence.summary.observedCases, 0);
  assert.equal(evidence.summary.missingCases, 3);
  assert.deepEqual(evidence.results, []);
  assert.deepEqual(evidence.summary.missingCaseIds, [
    'graph-web-case-001',
    'vision-sink-001',
    'label-conflict-001'
  ]);
});

test('keeps partial evidence while marking missing planned cases', () => {
  const partial = observations();
  partial.results = partial.results.slice(0, 1);

  const evidence = buildOperationalHitlPostImportValidationEvidence({
    validationPlan: readyPlan(),
    observations: partial
  });

  assert.equal(evidence.status, 'partial_evidence_collected');
  assert.equal(evidence.summary.observedCases, 1);
  assert.equal(evidence.summary.missingCases, 2);
  assert.deepEqual(evidence.summary.missingCaseIds, [
    'vision-sink-001',
    'label-conflict-001'
  ]);
  assert.equal(evidence.results.length, 1);
});

test('fails closed for blocked plans and unsafe observation artifacts', () => {
  const blocked = buildOperationalHitlPostImportValidationEvidence({
    validationPlan: {
      ...readyPlan(),
      status: 'blocked_import_package_not_ready',
      testCases: []
    },
    observations: observations()
  });

  assert.equal(blocked.status, 'blocked_validation_plan_not_ready');
  assert.equal(blocked.summary.totalPlannedCases, 0);
  assert.deepEqual(blocked.results, []);

  const unsafeObservations = observations();
  unsafeObservations.serviceWritesPerformed = true;
  const unsafe = buildOperationalHitlPostImportValidationEvidence({
    validationPlan: readyPlan(),
    observations: unsafeObservations
  });

  assert.equal(unsafe.status, 'unsafe_observations');
  assert.equal(unsafe.serviceWritesPerformed, false);
  assert.equal(unsafe.policy.allowGraphPromotion, false);
  assert.deepEqual(unsafe.results, []);
});
