const assert = require('node:assert/strict');
const test = require('node:test');

const {
  applyPerspectiveTransform,
  createPerspectiveCalibration,
  measurePerspectiveDistance,
  translatePerspectiveCalibration
} = require('../perspectiveMeasurement');
const { applyCalibrationToDimension } = require('../dimensionMeasurement');
const { initializeDimensionDocument, upsertPerspectiveCalibration } = require('../dimensionEditorState');

const sourceQuad = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 80, y: 100 },
  { x: 20, y: 100 }
];

test('maps an ordered trapezoid into known planar coordinates', () => {
  const calibration = createPerspectiveCalibration({
    id: 'perspective-1',
    sourceQuad,
    knownWidth: 10,
    knownHeight: 20,
    unit: 'mm',
    createdAt: '2026-08-24T00:00:00.000Z'
  });

  const expected = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 20 },
    { x: 0, y: 20 }
  ];
  sourceQuad.forEach((point, index) => {
    const mapped = applyPerspectiveTransform(point, calibration.homography);
    assert.ok(Math.abs(mapped.x - expected[index].x) < 1e-8);
    assert.ok(Math.abs(mapped.y - expected[index].y) < 1e-8);
  });
  assert.equal(calibration.mode, 'planar');
  assert.equal(calibration.protocolVersion, 'dimension-calibration/v2');
  assert.equal(calibration.confidence, 'perspective_corrected');
});

test('measures equal real widths at the near and far edges of a perspective plane', () => {
  const calibration = createPerspectiveCalibration({
    sourceQuad,
    knownWidth: 10,
    knownHeight: 20,
    unit: 'mm'
  });

  assert.ok(Math.abs(measurePerspectiveDistance(sourceQuad[0], sourceQuad[1], calibration) - 10) < 1e-8);
  assert.ok(Math.abs(measurePerspectiveDistance(sourceQuad[3], sourceQuad[2], calibration) - 10) < 1e-8);
  assert.ok(Math.abs(measurePerspectiveDistance(sourceQuad[0], sourceQuad[3], calibration) - 20) < 1e-8);
});

test('applies a planar calibration to dimensions with explicit provenance', () => {
  const calibration = createPerspectiveCalibration({
    id: 'perspective-1',
    sourceQuad,
    knownWidth: 10,
    knownHeight: 20,
    unit: 'mm'
  });
  const shape = applyCalibrationToDimension({
    id: 'dim-1',
    tool: 'dimension',
    points: [sourceQuad[3], sourceQuad[2]],
    color: '#00ffff',
    lineWidth: 2,
    opacity: 1,
    style: 'outline'
  }, calibration, { precision: 2 });

  assert.equal(shape.text, '10.00 mm');
  assert.equal(shape.measurementSource, 'perspective_calibration');
  assert.equal(shape.measurementConfidence, 'perspective_corrected');
});

test('rejects degenerate or incorrectly ordered quadrilaterals', () => {
  assert.throws(() => createPerspectiveCalibration({
    sourceQuad: [
      { x: 0, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
      { x: 100, y: 0 }
    ],
    knownWidth: 10,
    knownHeight: 20,
    unit: 'mm'
  }), /convex|ordered/i);
});

test('rebuilds the planar transform when an image crop shifts source coordinates', () => {
  const calibration = createPerspectiveCalibration({
    id: 'perspective-1',
    sourceQuad,
    knownWidth: 10,
    knownHeight: 20,
    unit: 'mm'
  });
  const shifted = translatePerspectiveCalibration(calibration, { x: -20, y: -10 });

  assert.deepEqual(shifted.sourceQuad[0], { x: -20, y: -10 });
  assert.ok(Math.abs(measurePerspectiveDistance(shifted.sourceQuad[3], shifted.sourceQuad[2], shifted) - 10) < 1e-8);
  assert.equal(shifted.id, calibration.id);
});

test('editor activates a planar calibration and recalculates existing dimensions', () => {
  const document = initializeDimensionDocument({
    shapes: [{
      id: 'dim-existing',
      tool: 'dimension',
      points: [sourceQuad[3], sourceQuad[2]],
      color: '#00ffff',
      lineWidth: 2,
      opacity: 1,
      style: 'outline'
    }],
    annotations: [],
    coordinateSpaceVersion: 'image/v1'
  });
  const calibrated = upsertPerspectiveCalibration(document, {
    id: 'perspective-1',
    sourceQuad,
    knownWidth: 10,
    knownHeight: 20,
    unit: 'mm'
  }, { precision: 2 });

  assert.equal(calibrated.activeDimensionCalibrationId, 'perspective-1');
  assert.equal(calibrated.dimensionCalibrations[0].mode, 'planar');
  assert.equal(calibrated.shapes[0].text, '10.00 mm');
  assert.equal(calibrated.shapes[0].measurementSource, 'perspective_calibration');
});
