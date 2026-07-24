const assert = require('node:assert/strict');
const test = require('node:test');

const { mapSelectionToImage } = require('../captureGeometry');

test('maps overlay coordinates to full-resolution capture pixels', () => {
  const crop = mapSelectionToImage(
    { x: 972, y: 235, width: 461, height: 97 },
    { width: 1920, height: 1032 },
    { width: 1920, height: 1080 }
  );

  assert.deepEqual(crop, {
    x: 972,
    y: 246,
    width: 461,
    height: 102
  });
});

test('clamps a selection to the source image bounds', () => {
  const crop = mapSelectionToImage(
    { x: 1900, y: 1000, width: 100, height: 100 },
    { width: 1920, height: 1032 },
    { width: 1920, height: 1080 }
  );

  assert.deepEqual(crop, {
    x: 1900,
    y: 1047,
    width: 20,
    height: 33
  });
});
