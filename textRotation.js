const normalizeTextRotationDegrees = value => {
  if (!Number.isFinite(value)) throw new TypeError('text rotation must be finite');
  const normalized = ((value + 180) % 360 + 360) % 360 - 180;
  return Object.is(normalized, -0) ? 0 : normalized;
};

const textRotationRadiansFromDegrees = degrees => (
  normalizeTextRotationDegrees(degrees) * Math.PI / 180
);

const textRotationDegreesFromRadians = radians => {
  if (!Number.isFinite(radians)) throw new TypeError('text rotation radians must be finite');
  return normalizeTextRotationDegrees(radians * 180 / Math.PI);
};

const applyTextRotation = (item, degrees) => {
  if (!item || typeof item !== 'object') throw new TypeError('text item is required');
  return {
    ...item,
    textRotation: textRotationRadiansFromDegrees(degrees)
  };
};

const rotatePointAround = (point, center, radians) => {
  if (!point || !center || !Number.isFinite(point.x) || !Number.isFinite(point.y)
    || !Number.isFinite(center.x) || !Number.isFinite(center.y) || !Number.isFinite(radians)) {
    throw new TypeError('point, center, and radians must be finite');
  }
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  return {
    x: center.x + dx * cosine - dy * sine,
    y: center.y + dx * sine + dy * cosine
  };
};

module.exports = {
  applyTextRotation,
  normalizeTextRotationDegrees,
  rotatePointAround,
  textRotationDegreesFromRadians,
  textRotationRadiansFromDegrees
};
