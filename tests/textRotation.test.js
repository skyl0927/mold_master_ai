const assert = require('node:assert/strict');
const test = require('node:test');

const {
  applyTextRotation,
  normalizeTextRotationDegrees,
  rotatePointAround,
  textRotationDegreesFromRadians,
  textRotationRadiansFromDegrees
} = require('../textRotation');

test('normalizes editable text rotation and converts degrees to persisted radians', () => {
  assert.equal(normalizeTextRotationDegrees(450), 90);
  assert.equal(normalizeTextRotationDegrees(270), -90);
  assert.equal(normalizeTextRotationDegrees(-360), 0);
  assert.equal(textRotationDegreesFromRadians(textRotationRadiansFromDegrees(90)), 90);
  assert.throws(() => normalizeTextRotationDegrees(Number.NaN), /finite/i);
  assert.throws(() => textRotationDegreesFromRadians(Number.POSITIVE_INFINITY), /finite/i);
});

test('applies text rotation without mutating the annotation or dimension', () => {
  const annotation = { id: 'ann-1', text: 'CHECK' };
  const rotated = applyTextRotation(annotation, -90);

  assert.notEqual(rotated, annotation);
  assert.equal(annotation.textRotation, undefined);
  assert.equal(textRotationDegreesFromRadians(rotated.textRotation), -90);
  assert.throws(() => applyTextRotation(null, 0), /required/i);
});

test('rotates hit-test points around the same text center', () => {
  const center = { x: 100, y: 100 };
  const rotated = rotatePointAround({ x: 120, y: 100 }, center, Math.PI / 2);
  assert.ok(Math.abs(rotated.x - 100) < 1e-9);
  assert.ok(Math.abs(rotated.y - 120) < 1e-9);

  const restored = rotatePointAround(rotated, center, -Math.PI / 2);
  assert.ok(Math.abs(restored.x - 120) < 1e-9);
  assert.ok(Math.abs(restored.y - 100) < 1e-9);
  assert.throws(() => rotatePointAround(null, center, 0), /finite/i);
  assert.throws(() => rotatePointAround({ x: 0, y: Number.NaN }, center, 0), /finite/i);
  assert.throws(() => rotatePointAround({ x: 0, y: 0 }, null, 0), /finite/i);
  assert.throws(() => rotatePointAround({ x: 0, y: 0 }, { x: 0, y: Number.NaN }, 0), /finite/i);
  assert.throws(() => rotatePointAround({ x: 0, y: 0 }, center, Number.NaN), /finite/i);
});
