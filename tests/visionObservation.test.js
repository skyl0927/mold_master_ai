const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildVisionRetrievalQuery,
  normalizeVisionObservation,
  parseVisionObservationText
} = require('../visionObservation');

test('parses and ranks a structured Top-3 Vision observation', () => {
  const observation = parseVisionObservationText(JSON.stringify({
    contract_version: 'vision-observation/v2',
    image_kind: 'physical_product',
    normality_status: 'defect_visible',
    observations: [
      {
        observation_id: 'obs-boundary-1',
        category: 'boundary',
        description: '\uC120\uD615 \uACBD\uACC4',
        region: 'ROI \uC911\uC559',
        confidence: 0.91
      },
      {
        observation_id: 'obs-gloss-1',
        category: 'contrast',
        description: '\uC720\uB3D9 \uBC29\uD5A5 \uAD11\uD0DD\uCC28',
        region: 'ROI \uC6B0\uCE21',
        confidence: 0.83
      }
    ],
    candidates: [
      {
        defect_type: '\uD50C\uB85C\uC6B0\uB9C8\uD06C',
        confidence: 0.31,
        supporting_observation_ids: ['obs-gloss-1']
      },
      {
        defect_type: '\uC6F0\uB4DC\uB77C\uC778',
        confidence: 0.54,
        supporting_observation_ids: ['obs-boundary-1'],
        contradicting_observation_ids: ['obs-gloss-1']
      },
      {
        defect_type: '\uC81C\uD305',
        confidence: 0.15,
        supporting_observation_ids: ['obs-gloss-1']
      }
    ],
    required_additional_views: ['\uC0AC\uAD11 \uCD2C\uC601']
  }));

  assert.deepEqual(
    observation.candidates.map(candidate => candidate.defectType),
    ['\uC6F0\uB4DC\uB77C\uC778', '\uD50C\uB85C\uC6B0\uB9C8\uD06C', '\uC81C\uD305']
  );
  assert.equal(observation.decisionStatus, 'needs_review');
  assert.match(observation.decisionReason, /margin/i);
  assert.deepEqual(observation.requiredAdditionalViews, ['\uC0AC\uAD11 \uCD2C\uC601']);
  assert.equal(observation.contractVersion, 'vision-observation/v2');
  assert.equal(observation.groundingStatus, 'grounded');
  assert.equal(observation.visualObservations[0].observationId, 'obs-boundary-1');
  assert.deepEqual(
    observation.candidates[0].supportingObservationIds,
    ['obs-boundary-1']
  );
});

test('marks a separated high-confidence candidate as probable, not confirmed', () => {
  const observation = normalizeVisionObservation({
    contract_version: 'vision-observation/v2',
    image_kind: 'physical_product',
    normality_status: 'defect_visible',
    observations: [{
      observation_id: 'obs-flash-1',
      category: 'geometry',
      description: '\uD30C\uD305\uB77C\uC778 \uBC16\uC73C\uB85C \uC5C7\uC740 \uB3CC\uCD9C',
      region: '\uD30C\uD305\uB77C\uC778',
      confidence: 0.92
    }],
    candidates: [
      {
        defect_type: '\uD50C\uB798\uC2DC',
        confidence: 0.84,
        supporting_observation_ids: ['obs-flash-1']
      },
      {
        defect_type: '\uC2A4\uD06C\uB798\uCE58',
        confidence: 0.21,
        supporting_observation_ids: ['obs-flash-1']
      }
    ]
  });

  assert.equal(observation.decisionStatus, 'probable');
  assert.equal(observation.primaryCandidate.defectType, '\uD50C\uB798\uC2DC');
});

test('falls back safely from the legacy Defect and Desc format', () => {
  const observation = parseVisionObservationText(
    'Defect: \uBC31\uD654 | Desc: \uB9AC\uBE0C \uC8FC\uBCC0\uC758 \uD750\uB9B0 \uC720\uBC31\uC0C9 \uBCC0\uC0C9'
  );

  assert.equal(observation.candidates.length, 1);
  assert.equal(observation.candidates[0].defectType, '\uBC31\uD654');
  assert.equal(observation.decisionStatus, 'needs_review');
});

test('normalizes a Common Agent observation that only contains defect_type', () => {
  const observation = normalizeVisionObservation({
    defect_type: '\uC6F0\uB4DC\uB77C\uC778',
    confidence: 0.72,
    visible_features: ['\uC720\uB3D9 \uD569\uB958\uBD80\uC758 \uAC00\uB294 \uC120']
  });

  assert.equal(observation.candidates.length, 1);
  assert.equal(observation.primaryCandidate.defectType, '\uC6F0\uB4DC\uB77C\uC778');
  assert.equal(observation.primaryCandidate.confidence, 0.72);
  assert.equal(observation.decisionStatus, 'needs_review');
});

test('treats an explicit unclassifiable label as abstention, not as a defect candidate', () => {
  const observation = normalizeVisionObservation({
    defect_type: '\uD310\uC815 \uBD88\uAC00',
    confidence: 0.93,
    summary: '\uACB0\uD568 \uD615\uC0C1\uC744 \uAD6C\uBD84\uD560 \uC218 \uC5C6\uC74C'
  });

  assert.equal(observation.candidates.length, 0);
  assert.equal(observation.primaryCandidate, null);
  assert.equal(observation.decisionStatus, 'unclassifiable');
});

test('builds Graph retrieval from observations and all candidates, not only Top-1', () => {
  const observation = normalizeVisionObservation({
    contract_version: 'vision-observation/v2',
    image_kind: 'physical_product',
    normality_status: 'defect_visible',
    observations: [
      {
        observation_id: 'obs-circle',
        category: 'boundary',
        description: '\uC6D0\uD615 \uACBD\uACC4',
        region: '\uCDE8\uCD9C\uBD80',
        confidence: 0.9
      },
      {
        observation_id: 'obs-white',
        category: 'color',
        description: '\uCDE8\uCD9C\uBD80 \uC8FC\uBCC0 \uBC31\uD654',
        region: '\uB9AC\uBE0C \uC8FC\uBCC0',
        confidence: 0.88
      }
    ],
    candidates: [
      {
        defect_type: '\uBC00\uD540 \uC790\uAD6D',
        confidence: 0.61,
        supporting_observation_ids: ['obs-circle', 'obs-white']
      },
      {
        defect_type: '\uBC31\uD654',
        confidence: 0.55,
        supporting_observation_ids: ['obs-white']
      },
      {
        defect_type: '\uC2F1\uD06C\uB9C8\uD06C',
        confidence: 0.22,
        supporting_observation_ids: ['obs-circle']
      }
    ]
  });

  const query = buildVisionRetrievalQuery(
    observation,
    '\uCDE8\uCD9C \uC2DC \uB531 \uC18C\uB9AC\uC640 \uD568\uAED8 \uC81C\uD488\uC774 \uD280\uC5B4\uB098\uC634'
  );

  assert.match(query, /\uC6D0\uD615 \uACBD\uACC4/);
  assert.match(query, /\uBC00\uD540 \uC790\uAD6D/);
  assert.match(query, /\uBC31\uD654/);
  assert.match(query, /\uC2F1\uD06C\uB9C8\uD06C/);
  assert.match(query, /\uB531 \uC18C\uB9AC/);
  assert.match(query, /obs-circle/);
  assert.match(query, /boundary/);
});

test('rejects a V2 defect candidate that cites no valid visual observation', () => {
  const observation = normalizeVisionObservation({
    contract_version: 'vision-observation/v2',
    image_kind: 'physical_product',
    normality_status: 'defect_visible',
    observations: [{
      observation_id: 'obs-color',
      category: 'color',
      description: '\uC720\uBC31\uC0C9 \uBCC0\uC0C9',
      region: 'ROI',
      confidence: 0.82
    }],
    candidates: [{
      defect_type: '\uBC31\uD654',
      confidence: 0.91,
      supporting_observation_ids: ['obs-missing']
    }]
  });

  assert.equal(observation.candidates.length, 0);
  assert.equal(observation.decisionStatus, 'unclassifiable');
  assert.equal(observation.groundingStatus, 'invalid');
  assert.ok(observation.validationIssues.includes('candidate_without_observation_evidence'));
});

test('V2 observations without an explicit ID cannot be used as defect evidence', () => {
  const observation = normalizeVisionObservation({
    contract_version: 'vision-observation/v2',
    image_kind: 'physical_product',
    normality_status: 'defect_visible',
    observations: [{
      category: 'color',
      description: '\uC720\uBC31\uC0C9 \uBCC0\uC0C9',
      confidence: 0.9
    }],
    candidates: [{
      defect_type: '\uBC31\uD654',
      confidence: 0.94,
      supporting_observation_ids: ['obs-1']
    }]
  });

  assert.equal(observation.visualObservations.length, 0);
  assert.equal(observation.candidates.length, 0);
  assert.equal(observation.groundingStatus, 'invalid');
  assert.ok(observation.validationIssues.includes('missing_visual_observations'));
});

test('hard-negative normal evidence overrides a high-confidence defect guess', () => {
  const observation = normalizeVisionObservation({
    contract_version: 'vision-observation/v2',
    image_kind: 'physical_product',
    normality_status: 'no_defect_visible',
    observations: [{
      observation_id: 'obs-normal',
      category: 'geometry',
      description: '\uBC18\uBCF5 \uC6D0\uD615 \uD615\uC0C1\uC774 \uBAA8\uB450 \uAC19\uC740 \uD06C\uAE30\uC640 \uAC04\uACA9\uC73C\uB85C \uBC30\uCE58\uB428',
      region: '\uCDE8\uCD9C\uBD80',
      confidence: 0.94
    }],
    candidates: [{
      defect_type: '\uBC00\uD540 \uC790\uAD6D',
      confidence: 0.95,
      supporting_observation_ids: ['obs-normal']
    }]
  });

  assert.equal(observation.candidates.length, 0);
  assert.equal(observation.primaryCandidate, null);
  assert.equal(observation.decisionStatus, 'unclassifiable');
  assert.equal(observation.abstentionReason, 'no_visible_defect');
});

test('document images never produce physical defect candidates', () => {
  const observation = normalizeVisionObservation({
    contract_version: 'vision-observation/v2',
    image_kind: 'document_or_diagram',
    normality_status: 'defect_visible',
    observations: [{
      observation_id: 'obs-line',
      category: 'boundary',
      description: '\uB3C4\uBA74\uC758 \uC120\uD615 \uACBD\uACC4',
      confidence: 0.99
    }],
    candidates: [{
      defect_type: '\uC6F0\uB4DC\uB77C\uC778',
      confidence: 0.98,
      supporting_observation_ids: ['obs-line']
    }]
  });

  assert.equal(observation.candidates.length, 0);
  assert.equal(observation.decisionStatus, 'unclassifiable');
  assert.equal(observation.abstentionReason, 'non_physical_image');
});

test('legacy unlinked candidates can be displayed but never become probable', () => {
  const observation = normalizeVisionObservation({
    visible_features: ['\uD30C\uD305\uB77C\uC778 \uBC16\uC73C\uB85C \uC5C7\uC740 \uB3CC\uCD9C'],
    candidates: [
      { defect_type: '\uD50C\uB798\uC2DC', confidence: 0.9 },
      { defect_type: '\uC2A4\uD06C\uB798\uCE58', confidence: 0.1 }
    ]
  });

  assert.equal(observation.candidates.length, 2);
  assert.equal(observation.groundingStatus, 'legacy');
  assert.equal(observation.decisionStatus, 'needs_review');
  assert.equal(observation.decisionReason, 'legacy_observation_contract');
});
