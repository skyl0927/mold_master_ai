const assert = require('node:assert/strict');
const test = require('node:test');

const {
  applyCalibrationToDimension,
  canvasPointToImage,
  convertMeasurement,
  createCalibration,
  distanceBetween,
  formatMeasurement,
  imagePointToCanvas,
  migrateLegacyAnnotation,
  migrateLegacyShape,
  moveDimension,
  parseDimensionDisplayInput,
  recalculateDimensions,
  resolveDimensionArrowLayout,
  snapPointToAxes
} = require('../dimensionMeasurement');

const calibration = createCalibration({
  id: 'cal-1',
  start: { x: 0, y: 0 },
  end: { x: 100, y: 0 },
  knownLength: 10,
  unit: 'mm'
});

test('creates a calibration from a known reference length', () => {
  assert.equal(calibration.pixelLength, 100);
  assert.equal(calibration.unitPerPixel, 0.1);
  assert.equal(calibration.coordinateSpaceVersion, 'image/v1');
  assert.equal(calibration.protocolVersion, 'dimension-calibration/v1');
});

test('rejects zero-length or invalid reference calibrations', () => {
  assert.throws(() => createCalibration({
    start: { x: 2, y: 2 },
    end: { x: 2, y: 2 },
    knownLength: 10,
    unit: 'mm'
  }), /reference pixel length/i);
  assert.throws(() => createCalibration({
    start: { x: 0, y: 0 },
    end: { x: 10, y: 0 },
    knownLength: 0,
    unit: 'mm'
  }), /known length/i);
});

test('measures 55 pixels as 5.5 mm with a 100 px = 10 mm calibration', () => {
  const measured = applyCalibrationToDimension({
    id: 'dim-1',
    tool: 'dimension',
    points: [{ x: 0, y: 0 }, { x: 55, y: 0 }],
    text: '55px'
  }, calibration, { precision: 2 });

  assert.equal(measured.measuredValue, 5.5);
  assert.equal(measured.displayValue, 5.5);
  assert.equal(measured.text, '5.50 mm');
  assert.equal(measured.manualOverride, false);
  assert.equal(measured.calibrationId, 'cal-1');
});

test('converts supported manufacturing units without changing physical length', () => {
  assert.equal(convertMeasurement(10, 'mm', 'cm'), 1);
  assert.equal(convertMeasurement(25.4, 'mm', 'in'), 1);
  assert.equal(convertMeasurement(2, 'in', 'mm'), 50.8);
});

test('formats finite measurements with deterministic precision', () => {
  assert.equal(formatMeasurement(5.5, 'mm', 2), '5.50 mm');
  assert.equal(formatMeasurement(1, 'in', 3), '1.000 in');
  assert.throws(() => formatMeasurement(Number.NaN, 'mm', 2), /finite/i);
});

test('snaps a line within 12 degrees to horizontal or vertical', () => {
  assert.deepEqual(
    snapPointToAxes({ x: 0, y: 0 }, { x: 100, y: 10 }, 12),
    { point: { x: 100, y: 0 }, snapped: true, axis: 'horizontal' }
  );
  assert.deepEqual(
    snapPointToAxes({ x: 10, y: 10 }, { x: 20, y: 110 }, 12),
    { point: { x: 10, y: 110 }, snapped: true, axis: 'vertical' }
  );
});

test('does not snap a diagonal outside the angular tolerance', () => {
  assert.deepEqual(
    snapPointToAxes({ x: 0, y: 0 }, { x: 100, y: 40 }, 12),
    { point: { x: 100, y: 40 }, snapped: false, axis: null }
  );
});

test('maps CSS canvas points to source image coordinates and back', () => {
  const imagePoint = canvasPointToImage(
    { x: 250, y: 125 },
    { width: 500, height: 250 },
    { width: 2000, height: 1000 }
  );
  assert.deepEqual(imagePoint, { x: 1000, y: 500 });
  assert.deepEqual(
    imagePointToCanvas(imagePoint, { width: 500, height: 250 }, { width: 2000, height: 1000 }),
    { x: 250, y: 125 }
  );
});

test('migrates legacy display-coordinate dimensions while preserving their px label', () => {
  const migrated = migrateLegacyShape({
    id: 'legacy-1',
    tool: 'dimension',
    points: [{ x: 10, y: 20 }, { x: 110, y: 20 }],
    textPos: { x: 60, y: 5 },
    text: '100px'
  }, {
    legacyCanvasSize: { width: 500, height: 250 },
    imageSize: { width: 2000, height: 1000 }
  });

  assert.deepEqual(migrated.points, [{ x: 40, y: 80 }, { x: 440, y: 80 }]);
  assert.deepEqual(migrated.labelOffset, { x: 0, y: -60 });
  assert.equal(migrated.text, '100px');
  assert.equal(migrated.unit, 'px');
  assert.equal(migrated.legacyDimension, true);
  assert.equal(migrated.coordinateSpaceVersion, 'image/v1');
});

test('migrates text annotations to image coordinates', () => {
  const migrated = migrateLegacyAnnotation({
    id: 'ann-1',
    text: 'RIB',
    textPos: { x: 25, y: 50 },
    fontSize: 20
  }, {
    legacyCanvasSize: { width: 100, height: 100 },
    imageSize: { width: 200, height: 300 }
  });

  assert.deepEqual(migrated.textPos, { x: 50, y: 150 });
  assert.equal(migrated.fontSize, 50);
  assert.equal(migrated.coordinateSpaceVersion, 'image/v1');
});

test('moving a dimension body preserves length and label offset', () => {
  const shape = applyCalibrationToDimension({
    id: 'dim-body',
    tool: 'dimension',
    points: [{ x: 0, y: 0 }, { x: 55, y: 0 }],
    labelOffset: { x: 0, y: -20 }
  }, calibration);
  const moved = moveDimension(shape, { x: 30, y: 40 }, 'body');

  assert.equal(distanceBetween(moved.points[0], moved.points[1]), 55);
  assert.deepEqual(moved.points, [{ x: 30, y: 40 }, { x: 85, y: 40 }]);
  assert.deepEqual(moved.labelOffset, { x: 0, y: -20 });
  assert.equal(moved.measuredValue, shape.measuredValue);
});

test('moving only a dimension label leaves measurement points untouched', () => {
  const shape = {
    id: 'dim-label',
    tool: 'dimension',
    points: [{ x: 0, y: 0 }, { x: 55, y: 0 }],
    labelOffset: { x: 0, y: -20 },
    measuredValue: 5.5
  };
  const moved = moveDimension(shape, { x: 12, y: -5 }, 'label');

  assert.deepEqual(moved.points, shape.points);
  assert.deepEqual(moved.labelOffset, { x: 12, y: -25 });
  assert.equal(moved.measuredValue, 5.5);
});

test('parses a manual display override without losing the automatic value', () => {
  assert.deepEqual(parseDimensionDisplayInput('10.20 mm', 'mm'), {
    value: 10.2,
    unit: 'mm'
  });
  assert.deepEqual(parseDimensionDisplayInput('0.5 in', 'mm'), {
    value: 0.5,
    unit: 'in'
  });
  assert.equal(parseDimensionDisplayInput('확인 필요', 'mm'), null);
});

test('recalibration updates automatic values but preserves manual overrides', () => {
  const automatic = applyCalibrationToDimension({
    id: 'auto',
    tool: 'dimension',
    points: [{ x: 0, y: 0 }, { x: 50, y: 0 }]
  }, calibration);
  const manual = {
    ...automatic,
    id: 'manual',
    displayValue: 5.2,
    text: '5.20 mm',
    manualOverride: true
  };
  const replacement = createCalibration({
    id: 'cal-2',
    start: { x: 0, y: 0 },
    end: { x: 100, y: 0 },
    knownLength: 20,
    unit: 'mm'
  });

  const recalculated = recalculateDimensions([automatic, manual], replacement, {
    precision: 2,
    preserveManualOverrides: true
  });

  assert.equal(recalculated[0].measuredValue, 10);
  assert.equal(recalculated[0].displayValue, 10);
  assert.equal(recalculated[0].text, '10.00 mm');
  assert.equal(recalculated[1].measuredValue, 10);
  assert.equal(recalculated[1].displayValue, 5.2);
  assert.equal(recalculated[1].text, '5.20 mm');
});

test('automatically moves dimension arrows outside when the measured span is narrow', () => {
  assert.deepEqual(resolveDimensionArrowLayout({
    span: 80,
    arrowSize: 10,
    lineWidth: 2,
    mode: 'auto'
  }), {
    placement: 'inside',
    arrowSize: 10,
    extension: 0,
    requiredInsideSpan: 24
  });

  assert.deepEqual(resolveDimensionArrowLayout({
    span: 20,
    arrowSize: 10,
    lineWidth: 2,
    mode: 'auto'
  }), {
    placement: 'outside',
    arrowSize: 10,
    extension: 14,
    requiredInsideSpan: 24
  });
});

test('allows explicit inside or outside dimension arrow placement', () => {
  assert.equal(resolveDimensionArrowLayout({ span: 10, arrowSize: 10, mode: 'inside' }).placement, 'inside');
  assert.equal(resolveDimensionArrowLayout({ span: 100, arrowSize: 10, mode: 'outside' }).placement, 'outside');
  assert.equal(resolveDimensionArrowLayout({ span: 24, arrowSize: 10, lineWidth: 2 }).placement, 'inside');
  assert.equal(resolveDimensionArrowLayout({ span: 40, arrowSize: 10, lineWidth: 8 }).requiredInsideSpan, 36);
  assert.equal(resolveDimensionArrowLayout({ span: 40, arrowSize: 10, lineWidth: Number.NaN }).requiredInsideSpan, 24);
  assert.throws(() => resolveDimensionArrowLayout({ span: -1, arrowSize: 10 }), /span/i);
  assert.throws(() => resolveDimensionArrowLayout({ span: 10, arrowSize: 0 }), /arrow size/i);
  assert.throws(() => resolveDimensionArrowLayout({ span: 10, arrowSize: 10, mode: 'sideways' }), /unsupported/i);
});
