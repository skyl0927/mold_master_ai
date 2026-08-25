const assert = require('node:assert/strict');
const test = require('node:test');

const {
  shouldRenderCalibrationGuide
} = require('../calibrationOverlayPolicy');

test('shows calibration only while the operator is drawing the reference', () => {
  assert.equal(shouldRenderCalibrationGuide({ phase: 'draft' }), true);
  assert.equal(shouldRenderCalibrationGuide({ phase: 'editing' }), false);
  assert.equal(shouldRenderCalibrationGuide({ phase: 'export' }), false);
});

test('never exports a stored calibration guide even when an editing guide is requested', () => {
  assert.equal(shouldRenderCalibrationGuide({
    phase: 'export',
    showStoredGuides: true
  }), false);
  assert.equal(shouldRenderCalibrationGuide({
    phase: 'editing',
    showStoredGuides: true
  }), true);
});
