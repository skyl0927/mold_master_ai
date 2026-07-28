const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildOperationalHitlPostImportManualObservationTemplate,
  importOperationalHitlPostImportManualObservations
} = require('../operationalHitlPostImportValidationManualObservations');
const {
  buildOperationalHitlPostImportValidationEvidence
} = require('../operationalHitlPostImportValidationEvidence');

const sha = value => String(value).repeat(64).slice(0, 64);

const readyPlan = () => ({
  contractVersion: 'operational-hitl-post-import-validation-plan/v1',
  status: 'ready_for_post_import_validation',
  serviceWritesPerformed: false,
  testCases: [
    {
      id: 'graph-web-case-001',
      testType: 'graph_rag_answer_grounding',
      expectedEvidenceKeywords: ['weldline'],
      commonAgentRequest: {
        endpoint: '/v1/ask',
        question: 'Weldline near rib'
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

const graphObservations = () => ({
  contractVersion: 'operational-hitl-post-import-validation-observations/v1',
  status: 'partial_observations_collected',
  serviceWritesPerformed: false,
  results: [
    {
      caseId: 'graph-web-case-001',
      testType: 'graph_rag_answer_grounding',
      rawCommonAgentPayload: {
        answer: 'Approved graph path explains weldline.',
        evidence: [{
          source_ref: 'graph:path:web-case-001',
          source_type: 'graph',
          review_status: 'approved',
          text: 'Approved graph evidence for weldline.'
        }],
        reasoning_trace: ['evidence_policy=graph_approved_only']
      }
    }
  ]
});

test('builds a no-write manual observation template for missing Vision and label cases', () => {
  const template = buildOperationalHitlPostImportManualObservationTemplate({
    generatedAt: '2026-07-28T08:00:00.000Z',
    validationPlan: readyPlan(),
    observations: graphObservations(),
    sourceArtifacts: {
      validationPlan: 'artifacts/validation-plan.json',
      observations: 'artifacts/observations.json'
    }
  });

  assert.equal(template.contractVersion, 'operational-hitl-post-import-validation-manual-observations-template/v1');
  assert.equal(template.status, 'ready_for_manual_observation');
  assert.equal(template.serviceWritesPerformed, false);
  assert.equal(template.policy.automaticServiceWritesAllowed, false);
  assert.equal(template.summary.totalPlannedCases, 3);
  assert.equal(template.summary.existingObservedCases, 1);
  assert.equal(template.summary.manualRows, 2);
  assert.equal(template.summary.visionRows, 1);
  assert.equal(template.summary.labelConflictRows, 1);
  assert.deepEqual(template.summary.manualCaseIds, ['vision-sink-001', 'label-conflict-001']);
  assert.equal(template.sources.validationPlan, 'artifacts/validation-plan.json');
  assert.equal(template.sources.observations, 'artifacts/observations.json');

  assert.equal(template.rows[0].caseId, 'vision-sink-001');
  assert.equal(template.rows[0].expectedLabel, 'sink mark');
  assert.equal(template.rows[0].observedLabel, '');
  assert.equal(template.rows[1].caseId, 'label-conflict-001');
  assert.equal(template.rows[1].expectedLabel, 'burn');
  assert.equal(template.rows[1].rejectedLabels, 'weldline');
  assert.match(template.csv, /caseId,testType,requiredAction/);
  assert.match(template.markdown, /vision-sink-001/);
});

test('imports filled manual observation CSV and merges with graph observations', () => {
  const template = buildOperationalHitlPostImportManualObservationTemplate({
    validationPlan: readyPlan(),
    observations: graphObservations()
  });
  const header = template.csv.trim().split(/\r?\n/)[0];
  const csv = [
    header,
    [
      'vision-sink-001',
      'vision_label_roundtrip',
      'confirm_vision_roundtrip',
      'sink mark',
      'sink',
      sha('b'),
      '',
      '',
      sha('b'),
      'sink mark',
      'sink',
      'approved',
      '',
      '',
      '',
      'vision-reviewer-01',
      'hash and label confirmed',
      '2026-07-28T08:10:00.000Z'
    ].join(','),
    [
      'label-conflict-001',
      'label_conflict_resolution_roundtrip',
      'confirm_label_conflict_resolution',
      'burn',
      '',
      '',
      'approved-image-a|approved-image-b',
      'weldline',
      '',
      '',
      '',
      '',
      'burn',
      'approved-image-a|approved-image-b',
      '',
      'quality-lead-01',
      'conflict resolved',
      '2026-07-28T08:11:00.000Z'
    ].join(',')
  ].join('\n');

  const imported = importOperationalHitlPostImportManualObservations({
    generatedAt: '2026-07-28T08:12:00.000Z',
    validationPlan: readyPlan(),
    observations: graphObservations(),
    manualObservationCsv: csv,
    sourceArtifacts: {
      manualObservationCsv: 'artifacts/manual-observations.csv'
    }
  });

  assert.equal(imported.contractVersion, 'operational-hitl-post-import-validation-observations/v1');
  assert.equal(imported.status, 'ready_for_evidence_build');
  assert.equal(imported.serviceWritesPerformed, false);
  assert.equal(imported.summary.totalPlannedCases, 3);
  assert.equal(imported.summary.existingObservationCases, 1);
  assert.equal(imported.summary.manualImportedRows, 2);
  assert.equal(imported.summary.invalidRows, 0);
  assert.equal(imported.results.length, 3);
  assert.equal(imported.sources.manualObservationCsv, 'artifacts/manual-observations.csv');

  const vision = imported.results.find(item => item.caseId === 'vision-sink-001');
  assert.equal(vision.response.contentSha256, sha('b'));
  assert.equal(vision.response.label, 'sink mark');
  assert.equal(vision.response.defectClass, 'sink');
  assert.equal(vision.response.reviewStatus, 'approved');

  const conflict = imported.results.find(item => item.caseId === 'label-conflict-001');
  assert.equal(conflict.response.activeLabel, 'burn');
  assert.deepEqual(conflict.response.affectedCaseIds, ['approved-image-a', 'approved-image-b']);
  assert.deepEqual(conflict.response.rejectedLabelsActive, []);
  assert.deepEqual(conflict.response.reviewHistory, [{ reviewerId: 'quality-lead-01', reviewComment: 'conflict resolved' }]);

  const evidence = buildOperationalHitlPostImportValidationEvidence({
    validationPlan: readyPlan(),
    observations: imported
  });
  assert.equal(evidence.status, 'ready_for_post_import_validation_result');
  assert.equal(evidence.summary.observedCases, 3);
  assert.equal(evidence.summary.missingCases, 0);
});

test('fails closed when manual observation rows are incomplete or unsafe', () => {
  const template = buildOperationalHitlPostImportManualObservationTemplate({
    validationPlan: readyPlan(),
    observations: graphObservations()
  });
  const imported = importOperationalHitlPostImportManualObservations({
    validationPlan: readyPlan(),
    observations: graphObservations(),
    manualObservationCsv: template.csv
  });

  assert.equal(imported.status, 'invalid_manual_observations');
  assert.equal(imported.summary.manualImportedRows, 0);
  assert.equal(imported.summary.invalidRows, 2);
  assert.equal(imported.results.length, 1);
  assert.equal(imported.policy.allowGraphPromotion, false);
});

test('fails closed for blocked plans without emitting manual rows', () => {
  const template = buildOperationalHitlPostImportManualObservationTemplate({
    validationPlan: {
      ...readyPlan(),
      status: 'blocked_import_package_not_ready',
      testCases: []
    },
    observations: graphObservations()
  });

  assert.equal(template.status, 'blocked_validation_plan_not_ready');
  assert.deepEqual(template.rows, []);
  assert.equal(template.summary.manualRows, 0);
});
