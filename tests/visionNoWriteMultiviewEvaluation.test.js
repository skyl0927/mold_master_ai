const assert = require('node:assert/strict');
const test = require('node:test');

const {
  assessNoWriteDiagnosis,
  buildDatasetSnapshot,
  buildNoWriteVisionForm,
  normalizeVisionRuntimeStatus,
  shouldRetryNoWriteDiagnosisStatus,
  summarizeNoWriteMultiviewEvaluation,
  validateNoWriteMultiviewCases
} = require('../scripts/lib/no-write-multiview-evaluation');

const createCase = () => ({
  id: 'pair-whitening-s003',
  evidenceStatus: 'provisional_pair',
  expected: {
    defectType: '백화',
    defectClass: 'whitening'
  },
  views: [
    {
      commonAgentImageId: 'image-full',
      captureViewTag: 'full_part_context',
      isPrimary: true
    },
    {
      commonAgentImageId: 'image-close',
      captureViewTag: 'defect_closeup',
      isPrimary: false
    }
  ]
});

test('validates only explicit provisional multiview pairs with one primary view', () => {
  const validCase = createCase();
  const duplicateViewCase = {
    ...createCase(),
    id: 'duplicate-view',
    views: [
      validCase.views[0],
      { ...validCase.views[1], commonAgentImageId: 'image-full' }
    ]
  };
  const releaseCase = {
    ...createCase(),
    id: 'unsafe-release-case',
    evidenceStatus: 'release_ready'
  };

  const result = validateNoWriteMultiviewCases([
    validCase,
    duplicateViewCase,
    releaseCase
  ]);

  assert.deepEqual(result.valid.map(item => item.id), ['pair-whitening-s003']);
  assert.deepEqual(
    result.invalid.map(item => item.id),
    ['duplicate-view', 'unsafe-release-case']
  );
});

test('builds a blind no-write multipart request with neutral file names', async () => {
  const testCase = createCase();
  const form = buildNoWriteVisionForm(testCase, [
    { ...testCase.views[0], bytes: Buffer.from([1]), mimeType: 'image/png' },
    { ...testCase.views[1], bytes: Buffer.from([2]), mimeType: 'image/png' }
  ]);

  assert.equal(form.get('persist_mode'), 'never');
  assert.equal(form.get('source_system'), 'mold-master-ai-shadow-benchmark');
  assert.equal(String(form.get('question')).includes('백화'), false);
  assert.equal(form.get('file').name, 'view-01.png');
  assert.equal(form.getAll('view_files')[0].name, 'view-02.png');

  const manifest = JSON.parse(String(form.get('view_manifest_json')));
  assert.deepEqual(
    manifest.map(item => [item.capture_view_tag, item.is_primary]),
    [
      ['full_part_context', true],
      ['defect_closeup', false]
    ]
  );
  const metadata = JSON.parse(String(form.get('metadata_json')));
  assert.equal(metadata.evidence_status, 'provisional_pair');
  assert.equal(Object.hasOwn(metadata, 'expected'), false);
});

test('fails closed unless no-write, fusion, and dataset invariants are explicit', () => {
  const testCase = createCase();
  const before = buildDatasetSnapshot({
    items: [{ image_id: 'image-a', updated_at: '2026-08-28T00:00:00Z' }]
  });
  const after = buildDatasetSnapshot({
    items: [{ image_id: 'image-a', updated_at: '2026-08-28T00:00:00Z' }]
  });
  const payload = {
    observation: {
      defect_type: '백화',
      candidates: [{ defect_type: '백화', confidence: 0.88 }],
      decision_status: 'probable'
    },
    fusion_report: {
      valid_view_count: 2,
      requested_view_count: 2,
      decision_status: 'probable',
      disagreement_score: 0.08
    },
    graph_grounding: {
      graph_grounded: true,
      approved_path_count: 2,
      citation_count: 2,
      grounded_causes: ['취출 응력'],
      grounded_countermeasures: ['이형 저항 점검']
    },
    metadata: {
      persisted_to_dataset: false,
      service_writes_performed: false,
      persist_mode: 'never'
    },
    reasoning_trace: [
      'answer_ledger_persisted=false',
      'image_dataset_persisted=false',
      'service_writes_performed=false'
    ]
  };

  const accepted = assessNoWriteDiagnosis(testCase, payload, { before, after });
  assert.equal(accepted.noWriteAttested, true);
  assert.equal(accepted.datasetUnchanged, true);
  assert.equal(accepted.fusionSucceeded, true);
  assert.equal(accepted.top1Accurate, true);
  assert.equal(accepted.graphGrounded, true);
  assert.equal(accepted.operationallyValid, true);
  assert.equal(accepted.releaseEvidenceEligible, false);

  const missingAttestation = assessNoWriteDiagnosis(
    testCase,
    { ...payload, metadata: {} },
    { before, after }
  );
  assert.equal(missingAttestation.noWriteAttested, false);
  assert.equal(missingAttestation.operationallyValid, false);
});

test('dataset snapshots are stable across item order and detect record mutation', () => {
  const left = buildDatasetSnapshot({
    items: [
      { image_id: 'image-b', updated_at: '2' },
      { image_id: 'image-a', updated_at: '1' }
    ]
  }, { centralCount: 23 });
  const reordered = buildDatasetSnapshot({
    items: [
      { image_id: 'image-a', updated_at: '1' },
      { image_id: 'image-b', updated_at: '2' }
    ]
  }, { centralCount: 23 });
  const changed = buildDatasetSnapshot({
    items: [
      { image_id: 'image-a', updated_at: '1' },
      { image_id: 'image-b', updated_at: '3' }
    ]
  }, { centralCount: 23 });
  const hiddenInsert = buildDatasetSnapshot({
    items: [
      { image_id: 'image-a', updated_at: '1' },
      { image_id: 'image-b', updated_at: '2' }
    ]
  }, { centralCount: 24 });

  assert.equal(left.fingerprint, reordered.fingerprint);
  assert.notEqual(left.fingerprint, changed.fingerprint);
  assert.notEqual(left.fingerprint, hiddenInsert.fingerprint);
  assert.equal(left.centralCount, 23);
});

test('normalizes the nested Common Agent Vision runtime contract', () => {
  assert.deepEqual(normalizeVisionRuntimeStatus({
    status: 'ready',
    image_dataset_count: 23,
    qa_agent: {
      status: 'ready',
      provider: 'openai',
      vision_model: 'gpt-5.6-terra',
      vision_prompt_version: 'vision-diagnosis-v2',
      vision_image_detail: 'original'
    }
  }), {
    status: 'ready',
    provider: 'openai',
    visionModel: 'gpt-5.6-terra',
    visionPromptVersion: 'vision-diagnosis-v2',
    visionImageDetail: 'original',
    imageDatasetCount: 23,
    ready: true
  });
});

test('retries only transient no-write diagnosis failures', () => {
  assert.equal(shouldRetryNoWriteDiagnosisStatus(429), true);
  assert.equal(shouldRetryNoWriteDiagnosisStatus(502), true);
  assert.equal(shouldRetryNoWriteDiagnosisStatus(503), true);
  assert.equal(shouldRetryNoWriteDiagnosisStatus(400), false);
  assert.equal(shouldRetryNoWriteDiagnosisStatus(404), false);
});

test('summary separates shadow quality evidence from release eligibility', () => {
  const summary = summarizeNoWriteMultiviewEvaluation([
    {
      operationallyValid: true,
      noWriteAttested: true,
      datasetUnchanged: true,
      fusionSucceeded: true,
      top1Accurate: true,
      top3Accurate: true,
      graphGrounded: true,
      releaseEvidenceEligible: false
    },
    {
      operationallyValid: true,
      noWriteAttested: true,
      datasetUnchanged: true,
      fusionSucceeded: true,
      top1Accurate: false,
      top3Accurate: true,
      graphGrounded: false,
      releaseEvidenceEligible: false
    }
  ]);

  assert.equal(summary.noWriteGatePassed, true);
  assert.equal(summary.fusionSuccessRate, 100);
  assert.equal(summary.top1Accuracy, 50);
  assert.equal(summary.top3Accuracy, 100);
  assert.equal(summary.releaseEligibleCases, 0);
  assert.equal(summary.readyForOperationalRelease, false);
});
