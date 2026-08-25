const assert = require('node:assert/strict');
const test = require('node:test');

const {
  createAngleMeasurement,
  formatAngleMeasurement,
  measureAngleDegrees,
  moveAngleMeasurement,
  parseAngleDisplayInput,
  updateAngleManualDisplay
} = require('../angleMeasurement');

const angleShape = () => ({
  id: 'angle-1',
  tool: 'angle',
  color: '#ff4500',
  lineWidth: 3,
  points: [
    { x: 0, y: 10 },
    { x: 0, y: 0 },
    { x: 10, y: 0 }
  ],
  opacity: 1,
  style: 'outline'
});

test('measures the smaller angle formed by two segments sharing a vertex', () => {
  assert.equal(measureAngleDegrees(
    { x: 0, y: 10 },
    { x: 0, y: 0 },
    { x: 10, y: 0 }
  ), 90);
  assert.equal(measureAngleDegrees(
    { x: 10, y: 0 },
    { x: 0, y: 0 },
    { x: -10, y: 10 }
  ), 135);
  assert.throws(() => measureAngleDegrees(
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 10, y: 0 }
  ), /non-zero length/i);
});

test('creates an editable angle measurement while retaining the automatic value', () => {
  const measured = createAngleMeasurement(angleShape(), { precision: 1 });

  assert.equal(measured.measuredValue, 90);
  assert.equal(measured.displayValue, 90);
  assert.equal(measured.unit, 'deg');
  assert.equal(measured.text, '90.0°');
  assert.equal(measured.manualOverride, false);
  assert.equal(measured.measurementReviewStatus, 'candidate');
  assert.equal(measured.measurementSource, 'image_geometry_angle');

  const edited = updateAngleManualDisplay(measured, '92.5°');
  assert.equal(edited.measuredValue, 90);
  assert.equal(edited.displayValue, 92.5);
  assert.equal(edited.text, '92.5°');
  assert.equal(edited.manualOverride, true);
  assert.equal(edited.measurementReviewStatus, 'candidate');
});

test('parses degree display values and rejects invalid or out-of-range input', () => {
  assert.equal(formatAngleMeasurement(12.345, 2), '12.35°');
  assert.deepEqual(parseAngleDisplayInput(' 45.5 deg '), { value: 45.5 });
  assert.deepEqual(parseAngleDisplayInput('45,5°'), { value: 45.5 });
  assert.equal(parseAngleDisplayInput('-1°'), null);
  assert.equal(parseAngleDisplayInput('181°'), null);
  assert.equal(parseAngleDisplayInput('angle'), null);
});

test('moves the two angle segments together or only the label', () => {
  const measured = createAngleMeasurement(angleShape());
  const movedBody = moveAngleMeasurement(measured, { x: 3, y: 4 }, 'body');
  assert.deepEqual(movedBody.points, [
    { x: 3, y: 14 },
    { x: 3, y: 4 },
    { x: 13, y: 4 }
  ]);

  const movedLabel = moveAngleMeasurement(measured, { x: 5, y: -2 }, 'label');
  assert.deepEqual(movedLabel.points, measured.points);
  assert.deepEqual(movedLabel.labelOffset, { x: 5, y: -42 });
});
