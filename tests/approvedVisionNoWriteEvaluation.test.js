const assert = require('node:assert/strict');
const test = require('node:test');

const {
  assessApprovedNoWriteDiagnosis,
  buildApprovedNoWriteVisionForm,
  selectApprovedNoWriteCases,
  summarizeApprovedNoWriteEvaluation
} = require('../scripts/lib/approved-no-write-evaluation');
const {
  buildDatasetSnapshot
} = require('../scripts/lib/no-write-multiview-evaluation');

const approvedFixture = (overrides = {}) => ({
  id: 'approved-image-whitening',
  commonAgentImageId: 'image-whitening',
  fileName: 'whitening.png',
  mimeType: 'image/png',
  expected: {
    defectType: '백화',
    defectClass: 'whitening'
  },
  sourceReview: {
    reviewStatus: 'approved'
  },
  ...overrides
});

test('selects only baseline-approved fixtures and excludes recapture decisions', () => {
  const selected = selectApprovedNoWriteCases([
    approvedFixture(),
    approvedFixture({
      id: 'approved-image-recapture',
      commonAgentImageId: 'image-recapture',
      sourceReview: {
        reviewStatus: 'approved',
        labelConflictResolution: {
          action: 'request_recapture',
          humanLabelConfirmed: false
        }
      }
    }),
    approvedFixture({
      id: 'approved-image-not-in-baseline',
      commonAgentImageId: 'image-not-in-baseline'
    })
  ], [
    { id: 'approved-image-whitening' },
    { id: 'approved-image-recapture' },
    { id: 'approved-image-missing' }
  ]);

  assert.deepEqual(selected.valid.map(item => item.id), [
    'approved-image-whitening'
  ]);
  assert.deepEqual(selected.skipped, [
    {
      id: 'approved-image-recapture',
      reason: 'physical recapture is required'
    },
    {
      id: 'approved-image-missing',
      reason: 'approved fixture is missing'
    }
  ]);
  assert.equal(selected.valid[0].evidenceStatus, 'approved_holdout_shadow');
});

test('builds a blind single-view request with explicit no-write mode', () => {
  const testCase = {
    ...approvedFixture(),
    evidenceStatus: 'approved_holdout_shadow'
  };
  const form = buildApprovedNoWriteVisionForm(testCase, {
    bytes: Buffer.from([1, 2, 3]),
    mimeType: 'image/png'
  });

  assert.equal(form.get('persist_mode'), 'never');
  assert.equal(form.get('source_system'), 'mold-master-ai-approved-shadow-benchmark');
  assert.equal(form.get('file').name, 'approved-view.png');
  assert.equal(String(form.get('question')).includes('백화'), false);

  const metadata = JSON.parse(String(form.get('metadata_json')));
  assert.equal(metadata.evidence_status, 'approved_holdout_shadow');
  assert.equal(metadata.release_evidence_eligible, false);
  assert.equal(metadata.blind_evaluation, true);
  assert.equal(Object.hasOwn(metadata, 'expected'), false);
  assert.equal(Object.hasOwn(metadata, 'defect_type'), false);
});

test('accepts an approved shadow result only when all no-write invariants hold', () => {
  const testCase = {
    ...approvedFixture(),
    evidenceStatus: 'approved_holdout_shadow'
  };
  const before = buildDatasetSnapshot({
    items: [{ image_id: 'image-a', updated_at: '2026-08-28T00:00:00Z' }]
  }, { centralCount: 23 });
  const after = buildDatasetSnapshot({
    items: [{ image_id: 'image-a', updated_at: '2026-08-28T00:00:00Z' }]
  }, { centralCount: 23 });
  const payload = {
    observation: {
      defect_type: '표면 변색',
      candidates: [
        { defect_type: '표면 변색', confidence: 0.55 },
        { defect_type: '백화', confidence: 0.42 }
      ],
      decision_status: 'needs_review'
    },
    graph_grounding: {
      graph_grounded: true,
      approved_path_count: 2,
      citation_count: 2
    },
    metadata: {
      persist_mode: 'never',
      persisted_to_dataset: false,
      service_writes_performed: false
    },
    reasoning_trace: [
      'answer_ledger_persisted=false',
      'image_dataset_persisted=false',
      'service_writes_performed=false'
    ]
  };

  const accepted = assessApprovedNoWriteDiagnosis(testCase, payload, { before, after });
  assert.equal(accepted.noWriteAttested, true);
  assert.equal(accepted.datasetUnchanged, true);
  assert.equal(accepted.operationallyValid, true);
  assert.equal(accepted.top1Accurate, false);
  assert.equal(accepted.top3Accurate, true);
  assert.equal(accepted.graphGrounded, true);
  assert.equal(accepted.releaseEvidenceEligible, false);

  const missingTrace = assessApprovedNoWriteDiagnosis(
    testCase,
    { ...payload, reasoning_trace: [] },
    { before, after }
  );
  assert.equal(missingTrace.noWriteAttested, false);
  assert.equal(missingTrace.operationallyValid, false);
});

test('summarizes approved shadow quality without unlocking physical recapture', () => {
  const summary = summarizeApprovedNoWriteEvaluation([
    {
      operationallyValid: true,
      noWriteAttested: true,
      datasetUnchanged: true,
      classifiable: true,
      top1Accurate: true,
      top3Accurate: true,
      graphGrounded: true,
      releaseEvidenceEligible: false
    },
    {
      operationallyValid: true,
      noWriteAttested: true,
      datasetUnchanged: true,
      classifiable: false,
      top1Accurate: false,
      top3Accurate: true,
      graphGrounded: false,
      releaseEvidenceEligible: false
    }
  ]);

  assert.equal(summary.noWriteGatePassed, true);
  assert.equal(summary.operationalValidityRate, 100);
  assert.equal(summary.classifiableRate, 50);
  assert.equal(summary.top1Accuracy, 50);
  assert.equal(summary.top3Accuracy, 100);
  assert.equal(summary.graphGroundedRate, 50);
  assert.equal(summary.readyForOperationalRelease, false);
  assert.equal(summary.nextGate, 'governed physical multiview recapture');
});
