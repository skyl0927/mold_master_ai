const assert = require('node:assert/strict');
const test = require('node:test');

const { canonicalDefectClass } = require('../shared/defect-taxonomy');
const {
  findObservationLabelConflict
} = require('../scripts/lib/approved-vision-fixture-quality');

test('flow-mark Korean aliases resolve to the same graph taxonomy class', () => {
  assert.equal(canonicalDefectClass('\uD50C\uB85C\uC6B0\uB9C8\uD06C'), 'flow_mark');
  assert.equal(canonicalDefectClass('\uD750\uB984 \uC790\uAD6D'), 'flow_mark');
});

test('approved label differing from the original Vision result is quarantined', () => {
  const conflict = findObservationLabelConflict({
    image_id: 'image-conflict',
    defect_type: '\uC218\uCD95',
    observation: {
      defect_type: '\uC218\uCD95',
      raw_output: JSON.stringify({
        defect_type: '\uBC31\uD654'
      })
    },
    metadata: {}
  });

  assert.deepEqual(conflict, {
    type: 'approved_label_observation_conflict',
    caseId: 'approved-image-conflict',
    approvedLabel: '\uC218\uCD95',
    observationLabel: '\uBC31\uD654',
    approvedClass: 'other:\uC218\uCD95',
    observationClass: 'whitening'
  });
});

test('explicit human reconciliation permits an intentional Vision-label override', () => {
  const conflict = findObservationLabelConflict({
    image_id: 'image-reconciled',
    defect_type: '\uC2F1\uD06C\uB9C8\uD06C',
    observation: {
      raw_output: JSON.stringify({
        defect_type: '\uAC8C\uC774\uD2B8 \uC808\uB2E8 \uC790\uAD6D'
      })
    },
    metadata: {
      label_reconciliation_required: true,
      label_reconciled: true,
      human_label_confirmed: true
    }
  });

  assert.equal(conflict, null);
});

test('malformed or missing raw Vision output does not create a false conflict', () => {
  assert.equal(findObservationLabelConflict({
    image_id: 'image-no-raw-output',
    defect_type: '\uD50C\uB798\uC2DC',
    observation: {
      raw_output: '{not-json'
    }
  }), null);
});

test('matching approved and object-form Vision labels remain runnable', () => {
  assert.equal(findObservationLabelConflict({
    image_id: 'image-match',
    defect_type: '\uBC31\uD654',
    observation: {
      raw_output: {
        defect_type: '\uBC31\uD654'
      }
    }
  }), null);
});

test('an unclassifiable original Vision result does not create a false conflict', () => {
  assert.equal(findObservationLabelConflict({
    image_id: 'image-unclassifiable',
    defect_type: '\uD50C\uB798\uC2DC',
    observation: {
      raw_output: JSON.stringify({
        defect_type: '\uD310\uC815 \uBD88\uAC00'
      })
    }
  }), null);
});
