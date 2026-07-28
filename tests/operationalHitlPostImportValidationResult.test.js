const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildOperationalHitlPostImportValidationResult
} = require('../operationalHitlPostImportValidationResult');

const sha = value => String(value).repeat(64).slice(0, 64);

const readyPlan = () => ({
  contractVersion: 'operational-hitl-post-import-validation-plan/v1',
  status: 'ready_for_post_import_validation',
  serviceWritesPerformed: false,
  summary: {
    totalTestCases: 3,
    minimumPassRate: 85
  },
  testCases: [
    {
      id: 'graph-web-case-001',
      testType: 'graph_rag_answer_grounding',
      expectedEvidenceKeywords: ['weldline', 'mold temperature', 'resin temperature'],
      commonAgentRequest: {
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
  ],
  sources: {
    importPackage: 'artifacts/import-package.json'
  }
});

const passingEvidence = () => ({
  contractVersion: 'operational-hitl-post-import-validation-evidence/v1',
  serviceWritesPerformed: false,
  results: [
    {
      caseId: 'graph-web-case-001',
      response: {
        answer: 'Approved graph path explains weldline from low mold temperature and resin temperature imbalance.',
        citations: ['graph:path:web-case-001'],
        reasoningPaths: ['phenomenon -> cause -> countermeasure'],
        evidencePolicy: 'graph_approved_only'
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

test('passes post-import validation only when every case has approved evidence', () => {
  const result = buildOperationalHitlPostImportValidationResult({
    generatedAt: '2026-07-28T05:00:00.000Z',
    validationPlan: readyPlan(),
    validationEvidence: passingEvidence(),
    sourceArtifacts: {
      validationPlan: 'artifacts/validation-plan.json',
      validationEvidence: 'artifacts/validation-evidence.json'
    }
  });

  assert.equal(result.contractVersion, 'operational-hitl-post-import-validation-result/v1');
  assert.equal(result.status, 'validation_passed');
  assert.equal(result.readyForOperationalReleaseValidation, true);
  assert.equal(result.serviceWritesPerformed, false);
  assert.equal(result.policy.allowGraphPromotion, false);
  assert.equal(result.policy.allowReferenceLearning, false);
  assert.equal(result.summary.totalCases, 3);
  assert.equal(result.summary.passedCases, 3);
  assert.equal(result.summary.failedCases, 0);
  assert.equal(result.summary.passRate, 100);
  assert.equal(result.summary.minimumPassRate, 85);
  assert.deepEqual(result.caseResults.map(item => item.status), ['passed', 'passed', 'passed']);
  assert.equal(result.sources.validationPlan, 'artifacts/validation-plan.json');
  assert.equal(result.sources.validationEvidence, 'artifacts/validation-evidence.json');
});

test('fails graph validation when citations and expected approved keywords are missing', () => {
  const evidence = passingEvidence();
  evidence.results[0] = {
    caseId: 'graph-web-case-001',
    response: {
      answer: 'Generic LLM answer without approved graph grounding.',
      citations: [],
      reasoningPaths: [],
      evidencePolicy: 'llm_only'
    }
  };

  const result = buildOperationalHitlPostImportValidationResult({
    validationPlan: readyPlan(),
    validationEvidence: evidence
  });

  assert.equal(result.status, 'validation_failed');
  assert.equal(result.readyForOperationalReleaseValidation, false);
  assert.equal(result.summary.passedCases, 2);
  assert.equal(result.summary.failedCases, 1);
  assert.equal(result.summary.passRate, 66.7);
  const graphResult = result.caseResults.find(item => item.caseId === 'graph-web-case-001');
  assert.equal(graphResult.status, 'failed');
  assert.deepEqual(graphResult.failedChecks, [
    'approved_graph_policy_missing',
    'graph_citation_or_reasoning_path_missing',
    'expected_keyword_missing'
  ]);
  assert.match(result.recommendedAction, /failed post-import validation cases/);
});

test('waits for validation evidence without treating missing responses as approved', () => {
  const result = buildOperationalHitlPostImportValidationResult({
    validationPlan: readyPlan(),
    validationEvidence: null
  });

  assert.equal(result.status, 'awaiting_validation_evidence');
  assert.equal(result.summary.totalCases, 3);
  assert.equal(result.summary.missingEvidenceCases, 3);
  assert.equal(result.summary.passedCases, 0);
  assert.equal(result.readyForOperationalReleaseValidation, false);
  assert.deepEqual(result.caseResults.map(item => item.failedChecks), [
    ['validation_evidence_missing'],
    ['validation_evidence_missing'],
    ['validation_evidence_missing']
  ]);
});

test('waits when an evidence artifact exists but execution has not run yet', () => {
  const result = buildOperationalHitlPostImportValidationResult({
    validationPlan: readyPlan(),
    validationEvidence: {
      contractVersion: 'operational-hitl-post-import-validation-evidence/v1',
      status: 'awaiting_validation_execution',
      serviceWritesPerformed: false,
      results: []
    }
  });

  assert.equal(result.status, 'awaiting_validation_evidence');
  assert.equal(result.summary.totalCases, 3);
  assert.equal(result.summary.missingEvidenceCases, 3);
  assert.equal(result.readyForOperationalReleaseValidation, false);
});

test('fails closed for blocked plans and unsafe validation evidence', () => {
  const blocked = buildOperationalHitlPostImportValidationResult({
    validationPlan: {
      ...readyPlan(),
      status: 'blocked_import_package_not_ready',
      testCases: []
    },
    validationEvidence: passingEvidence()
  });

  assert.equal(blocked.status, 'blocked_validation_plan_not_ready');
  assert.equal(blocked.summary.totalCases, 0);
  assert.equal(blocked.readyForOperationalReleaseValidation, false);

  const unsafeEvidence = passingEvidence();
  unsafeEvidence.serviceWritesPerformed = true;
  const unsafe = buildOperationalHitlPostImportValidationResult({
    validationPlan: readyPlan(),
    validationEvidence: unsafeEvidence
  });

  assert.equal(unsafe.status, 'unsafe_validation_evidence');
  assert.equal(unsafe.summary.failedCases, 3);
  assert.equal(unsafe.policy.automaticServiceWritesAllowed, false);
  assert.deepEqual(unsafe.caseResults[0].failedChecks, ['unsafe_validation_evidence']);
});
