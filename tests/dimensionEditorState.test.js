const assert = require('node:assert/strict');
const test = require('node:test');

const {
  addMeasuredDimension,
  commitEditorHistory,
  createEditorHistory,
  initializeDimensionDocument,
  redoEditorHistory,
  setActiveCalibration,
  setDimensionReviewStatus,
  undoEditorHistory,
  updateDimensionManualDisplay,
  upsertCalibration
} = require('../dimensionEditorState');

const baseDocument = () => ({
  shapes: [],
  annotations: [],
  dimensionCalibrations: [],
  activeDimensionCalibrationId: undefined,
  coordinateSpaceVersion: 'image/v1'
});

test('initializes legacy annotations and shapes in source image coordinates', () => {
  const document = initializeDimensionDocument({
    shapes: [{
      id: 'legacy-dim',
      tool: 'dimension',
      points: [{ x: 10, y: 20 }, { x: 110, y: 20 }],
      text: '100px'
    }],
    annotations: [{
      id: 'legacy-ann',
      text: 'RIB',
      textPos: { x: 20, y: 30 },
      fontSize: 10
    }],
    coordinateSpaceVersion: undefined,
    legacyCanvasSize: { width: 500, height: 250 },
    imageSize: { width: 1000, height: 500 }
  });

  assert.deepEqual(document.shapes[0].points, [{ x: 20, y: 40 }, { x: 220, y: 40 }]);
  assert.deepEqual(document.annotations[0].textPos, { x: 40, y: 60 });
  assert.equal(document.coordinateSpaceVersion, 'image/v1');
});

test('upserts a calibration, activates it, and recalculates automatic dimensions', () => {
  const document = {
    ...baseDocument(),
    shapes: [{
      id: 'dim-before-calibration',
      tool: 'dimension',
      points: [{ x: 0, y: 0 }, { x: 55, y: 0 }],
      text: '55 px',
      unit: 'px',
      legacyDimension: true
    }]
  };
  const updated = upsertCalibration(document, {
    id: 'cal-1',
    start: { x: 0, y: 0 },
    end: { x: 100, y: 0 },
    knownLength: 10,
    unit: 'mm'
  }, { precision: 2, applyToAllDimensions: true });

  assert.equal(updated.activeDimensionCalibrationId, 'cal-1');
  assert.equal(updated.dimensionCalibrations.length, 1);
  assert.equal(updated.shapes[0].text, '5.50 mm');
  assert.equal(updated.shapes[0].legacyDimension, false);
});

test('adds a calibrated dimension using the active calibration', () => {
  const calibrated = upsertCalibration(baseDocument(), {
    id: 'cal-1',
    start: { x: 0, y: 0 },
    end: { x: 100, y: 0 },
    knownLength: 10,
    unit: 'mm'
  });
  const updated = addMeasuredDimension(calibrated, {
    id: 'dim-1',
    tool: 'dimension',
    color: '#ff0000',
    lineWidth: 2,
    points: [{ x: 0, y: 0 }, { x: 55, y: 0 }],
    opacity: 1,
    style: 'outline'
  }, { precision: 2 });

  assert.equal(updated.shapes[0].text, '5.50 mm');
  assert.equal(updated.shapes[0].measurementReviewStatus, 'candidate');
});

test('keeps uncalibrated dimensions as source-image pixels', () => {
  const updated = addMeasuredDimension(baseDocument(), {
    id: 'dim-px',
    tool: 'dimension',
    color: '#ff0000',
    lineWidth: 2,
    points: [{ x: 0, y: 0 }, { x: 55, y: 0 }],
    opacity: 1,
    style: 'outline'
  });

  assert.equal(updated.shapes[0].text, '55 px');
  assert.equal(updated.shapes[0].unit, 'px');
  assert.equal(updated.shapes[0].legacyDimension, false);
  assert.equal(updated.shapes[0].coordinateSpaceVersion, 'image/v1');
});

test('manual display edits retain an automatic comparison value', () => {
  const calibrated = upsertCalibration(baseDocument(), {
    id: 'cal-1',
    start: { x: 0, y: 0 },
    end: { x: 100, y: 0 },
    knownLength: 10,
    unit: 'mm'
  });
  const measured = addMeasuredDimension(calibrated, {
    id: 'dim-1',
    tool: 'dimension',
    color: '#ff0000',
    lineWidth: 2,
    points: [{ x: 0, y: 0 }, { x: 55, y: 0 }],
    opacity: 1,
    style: 'outline'
  });
  const updated = updateDimensionManualDisplay(measured, 'dim-1', '5.20 mm');

  assert.equal(updated.shapes[0].measuredValue, 5.5);
  assert.equal(updated.shapes[0].displayValue, 5.2);
  assert.equal(updated.shapes[0].text, '5.20 mm');
  assert.equal(updated.shapes[0].manualOverride, true);
  assert.equal(updated.shapes[0].measurementReviewStatus, 'candidate');
});

test('records dimension HITL review status without mutating other shapes', () => {
  const document = {
    ...baseDocument(),
    shapes: [
      { id: 'dim-1', tool: 'dimension', points: [{ x: 0, y: 0 }, { x: 5, y: 0 }] },
      { id: 'rect-1', tool: 'rect', points: [{ x: 0, y: 0 }, { x: 5, y: 5 }] }
    ]
  };
  const updated = setDimensionReviewStatus(document, 'dim-1', 'approved');

  assert.equal(updated.shapes[0].measurementReviewStatus, 'approved');
  assert.strictEqual(updated.shapes[1], document.shapes[1]);
});

test('switches active calibration only to an existing calibration', () => {
  const document = upsertCalibration(baseDocument(), {
    id: 'cal-1',
    start: { x: 0, y: 0 },
    end: { x: 100, y: 0 },
    knownLength: 10,
    unit: 'mm'
  });

  assert.equal(setActiveCalibration(document, 'cal-1').activeDimensionCalibrationId, 'cal-1');
  assert.throws(() => setActiveCalibration(document, 'missing'), /does not exist/i);
});

test('undo and redo restore complete editor documents and clear divergent redo history', () => {
  const initial = baseDocument();
  const history0 = createEditorHistory(initial);
  const state1 = { ...initial, shapes: [{ id: 'shape-1' }] };
  const history1 = commitEditorHistory(history0, state1);
  const state2 = { ...state1, shapes: [...state1.shapes, { id: 'shape-2' }] };
  const history2 = commitEditorHistory(history1, state2);
  const undone = undoEditorHistory(history2);

  assert.deepEqual(undone.present.shapes, [{ id: 'shape-1' }]);
  const redone = redoEditorHistory(undone);
  assert.deepEqual(redone.present.shapes, [{ id: 'shape-1' }, { id: 'shape-2' }]);

  const divergent = commitEditorHistory(undone, {
    ...undone.present,
    shapes: [{ id: 'shape-3' }]
  });
  assert.deepEqual(divergent.future, []);
});
