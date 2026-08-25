const ANGLE_UNIT = 'deg';

const assertFinitePoint = (point, name) => {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new TypeError(`${name} must contain finite x and y coordinates`);
  }
};

const clampPrecision = value => {
  const numeric = Number.isFinite(value) ? Math.trunc(value) : 1;
  return Math.max(0, Math.min(6, numeric));
};

const roundTo = (value, precision = 9) => {
  const factor = 10 ** precision;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

const vectorLength = vector => Math.hypot(vector.x, vector.y);

const measureAngleDegrees = (firstEnd, vertex, secondEnd) => {
  assertFinitePoint(firstEnd, 'firstEnd');
  assertFinitePoint(vertex, 'vertex');
  assertFinitePoint(secondEnd, 'secondEnd');
  const first = { x: firstEnd.x - vertex.x, y: firstEnd.y - vertex.y };
  const second = { x: secondEnd.x - vertex.x, y: secondEnd.y - vertex.y };
  const firstLength = vectorLength(first);
  const secondLength = vectorLength(second);
  if (firstLength <= 0 || secondLength <= 0) {
    throw new RangeError('both angle segments must have non-zero length');
  }
  const cosine = Math.max(-1, Math.min(1,
    (first.x * second.x + first.y * second.y) / (firstLength * secondLength)
  ));
  return roundTo(Math.acos(cosine) * 180 / Math.PI);
};

const formatAngleMeasurement = (value, precision = 1) => {
  if (!Number.isFinite(value)) throw new TypeError('angle value must be finite');
  return `${roundTo(value, clampPrecision(precision)).toFixed(clampPrecision(precision))}°`;
};

const parseAngleDisplayInput = input => {
  const match = String(input || '')
    .trim()
    .replace(',', '.')
    .match(/^(\d+(?:\.\d+)?)\s*(?:°|deg(?:rees?)?)?$/i);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) && value >= 0 && value <= 180 ? { value } : null;
};

const assertAngleShape = shape => {
  if (!shape || shape.tool !== 'angle' || !Array.isArray(shape.points) || shape.points.length !== 3) {
    throw new TypeError('an angle shape with first end, vertex, and second end is required');
  }
};

const createAngleMeasurement = (shape, options = {}) => {
  assertAngleShape(shape);
  const precision = clampPrecision(options.precision ?? shape.precision ?? 1);
  const measuredValue = measureAngleDegrees(shape.points[0], shape.points[1], shape.points[2]);
  return {
    ...shape,
    measuredValue,
    displayValue: measuredValue,
    unit: ANGLE_UNIT,
    precision,
    text: formatAngleMeasurement(measuredValue, precision),
    manualOverride: false,
    labelOffset: shape.labelOffset ? { ...shape.labelOffset } : { x: 0, y: -40 },
    coordinateSpaceVersion: 'image/v1',
    measurementConfidence: 'estimated',
    measurementReviewStatus: 'candidate',
    measurementSource: 'image_geometry_angle'
  };
};

const updateAngleManualDisplay = (shape, input) => {
  assertAngleShape(shape);
  const parsed = parseAngleDisplayInput(input);
  if (!parsed) throw new RangeError('angle display value must be between 0 and 180 degrees');
  const precision = clampPrecision(shape.precision ?? 1);
  return {
    ...shape,
    displayValue: parsed.value,
    unit: ANGLE_UNIT,
    text: formatAngleMeasurement(parsed.value, precision),
    manualOverride: true,
    measurementReviewStatus: 'candidate'
  };
};

const moveAngleMeasurement = (shape, delta, part = 'body') => {
  assertAngleShape(shape);
  assertFinitePoint(delta, 'delta');
  const labelOffset = shape.labelOffset ? { ...shape.labelOffset } : { x: 0, y: -40 };
  if (part === 'label') {
    return {
      ...shape,
      labelOffset: { x: labelOffset.x + delta.x, y: labelOffset.y + delta.y },
      textPos: undefined
    };
  }
  if (part !== 'body') throw new RangeError(`unsupported angle move part: ${part}`);
  return {
    ...shape,
    points: shape.points.map(point => ({ x: point.x + delta.x, y: point.y + delta.y })),
    labelOffset,
    textPos: undefined
  };
};

const getAngleLabelPoint = shape => {
  assertAngleShape(shape);
  const vertex = shape.points[1];
  const offset = shape.labelOffset || { x: 0, y: -40 };
  return { x: vertex.x + offset.x, y: vertex.y + offset.y };
};

module.exports = {
  ANGLE_UNIT,
  createAngleMeasurement,
  formatAngleMeasurement,
  getAngleLabelPoint,
  measureAngleDegrees,
  moveAngleMeasurement,
  parseAngleDisplayInput,
  updateAngleManualDisplay
};
