const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildVisionRetrievalQuery,
  normalizeVisionObservation,
  parseVisionObservationText
} = require('../visionObservation');

test('parses and ranks a structured Top-3 Vision observation', () => {
  const observation = parseVisionObservationText(JSON.stringify({
    visible_features: [
      '\uC120\uD615 \uACBD\uACC4',
      '\uC720\uB3D9 \uBC29\uD5A5 \uAD11\uD0DD\uCC28'
    ],
    candidates: [
      {
        defect_type: '\uD50C\uB85C\uC6B0\uB9C8\uD06C',
        confidence: 0.31,
        supporting_features: ['\uBC18\uBCF5 \uB744\uBB34\uB2AC']
      },
      {
        defect_type: '\uC6F0\uB4DC\uB77C\uC778',
        confidence: 0.54,
        supporting_features: ['\uAC00\uB294 \uC120\uD615 \uACBD\uACC4'],
        contradicting_features: ['\uD569\uB958 \uC704\uCE58 \uBBF8\uD655\uC778']
      },
      {
        defect_type: '\uC81C\uD305',
        confidence: 0.15
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
});

test('marks a separated high-confidence candidate as probable, not confirmed', () => {
  const observation = normalizeVisionObservation({
    visible_features: ['\uD30C\uD305\uB77C\uC778 \uBC16\uC73C\uB85C \uC5C7\uC740 \uB3CC\uCD9C'],
    candidates: [
      { defect_type: '\uD50C\uB798\uC2DC', confidence: 0.84 },
      { defect_type: '\uC2A4\uD06C\uB798\uCE58', confidence: 0.21 }
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

test('builds Graph retrieval from observations and all candidates, not only Top-1', () => {
  const observation = normalizeVisionObservation({
    visible_features: ['\uC6D0\uD615 \uACBD\uACC4', '\uCDE8\uCD9C\uBD80 \uC8FC\uBCC0 \uBC31\uD654'],
    candidates: [
      { defect_type: '\uBC00\uD540 \uC790\uAD6D', confidence: 0.61 },
      { defect_type: '\uBC31\uD654', confidence: 0.55 },
      { defect_type: '\uC2F1\uD06C\uB9C8\uD06C', confidence: 0.22 }
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
});
