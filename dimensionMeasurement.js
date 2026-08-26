const SUPPORTED_UNITS = Object.freeze(['mm', 'cm', 'in']);
const MM_PER_UNIT = Object.freeze({ mm: 1, cm: 10, in: 25.4 });
const IMAGE_COORDINATE_SPACE = 'image/v1';
const { measurePerspectiveDistance } = require('./perspectiveMeasurement');

function assertFinitePoint(point, name) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new TypeError(`${name} must contain finite x and y coordinates`);
  }
}

function assertSize(size, name) {
  if (!size || !Number.isFinite(size.width) || !Number.isFinite(size.height)) {
    throw new TypeError(`${name} must contain finite width and height`);
  }
  if (size.width <= 0 || size.height <= 0) {
    throw new RangeError(`${name} dimensions must be greater than zero`);
  }
}

function clampPrecision(value) {
  const numeric = Number.isFinite(value) ? Math.trunc(value) : 2;
  return Math.max(0, Math.min(6, numeric));
}

function roundTo(value, precision = 9) {
  const factor = 10 ** precision;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function distanceBetween(start, end) {
  assertFinitePoint(start, 'start');
  assertFinitePoint(end, 'end');
  return Math.hypot(end.x - start.x, end.y - start.y);
}

function createCalibration({
  id = `cal-${Date.now()}`,
  start,
  end,
  knownLength,
  unit = 'mm',
  planeLabel = 'image-plane',
  createdAt = new Date().toISOString()
} = {}) {
  if (!SUPPORTED_UNITS.includes(unit)) {
    throw new RangeError(`unsupported calibration unit: ${unit}`);
  }
  if (!Number.isFinite(knownLength) || knownLength <= 0) {
    throw new RangeError('known length must be greater than zero');
  }
  const pixelLength = distanceBetween(start, end);
  if (pixelLength <= 0) {
    throw new RangeError('reference pixel length must be greater than zero');
  }

  return {
    id,
    protocolVersion: 'dimension-calibration/v1',
    coordinateSpaceVersion: IMAGE_COORDINATE_SPACE,
    mode: 'linear',
    start: { ...start },
    end: { ...end },
    pixelLength: roundTo(pixelLength),
    knownLength,
    unit,
    unitPerPixel: roundTo(knownLength / pixelLength, 12),
    planeLabel,
    confidence: 'reference',
    createdAt
  };
}

function convertMeasurement(value, fromUnit, toUnit) {
  if (!Number.isFinite(value)) throw new TypeError('measurement value must be finite');
  if (!SUPPORTED_UNITS.includes(fromUnit) || !SUPPORTED_UNITS.includes(toUnit)) {
    throw new RangeError(`unsupported unit conversion: ${fromUnit} -> ${toUnit}`);
  }
  return roundTo((value * MM_PER_UNIT[fromUnit]) / MM_PER_UNIT[toUnit], 12);
}

function formatMeasurement(value, unit, precision = 2) {
  if (!Number.isFinite(value)) throw new TypeError('measurement value must be finite');
  if (![...SUPPORTED_UNITS, 'px'].includes(unit)) {
    throw new RangeError(`unsupported display unit: ${unit}`);
  }
  return `${value.toFixed(clampPrecision(precision))} ${unit}`;
}

function resolveDimensionArrowLayout({
  span,
  arrowSize = 10,
  lineWidth = 2,
  mode = 'auto'
} = {}) {
  if (!Number.isFinite(span) || span < 0) throw new RangeError('dimension span must be zero or greater');
  if (!Number.isFinite(arrowSize) || arrowSize <= 0) throw new RangeError('arrow size must be greater than zero');
  if (!['auto', 'inside', 'outside'].includes(mode)) {
    throw new RangeError(`unsupported dimension arrow mode: ${mode}`);
  }
  const strokeWidth = Number.isFinite(lineWidth) && lineWidth >= 0 ? lineWidth : 2;
  const clearance = Math.max(4, strokeWidth * 2);
  const requiredInsideSpan = arrowSize * 2 + clearance;
  const placement = mode === 'auto'
    ? (span < requiredInsideSpan ? 'outside' : 'inside')
    : mode;
  return {
    placement,
    arrowSize,
    extension: placement === 'outside' ? arrowSize + clearance : 0,
    requiredInsideSpan
  };
}

function applyCalibrationToDimension(shape, calibration, options = {}) {
  if (!shape || shape.tool !== 'dimension' || !Array.isArray(shape.points) || shape.points.length < 2) {
    throw new TypeError('a dimension shape with two points is required');
  }
  if (!calibration || !Number.isFinite(calibration.unitPerPixel) || calibration.unitPerPixel <= 0) {
    throw new TypeError('a valid dimension calibration is required');
  }
  const precision = clampPrecision(options.precision ?? shape.precision ?? 2);
  const measuredValue = roundTo(calibration.mode === 'planar'
    ? measurePerspectiveDistance(shape.points[0], shape.points[shape.points.length - 1], calibration)
    : distanceBetween(shape.points[0], shape.points[shape.points.length - 1]) * calibration.unitPerPixel);

  return {
    ...shape,
    measuredValue,
    displayValue: measuredValue,
    unit: calibration.unit,
    precision,
    text: formatMeasurement(measuredValue, calibration.unit, precision),
    calibrationId: calibration.id,
    manualOverride: false,
    legacyDimension: false,
    labelOffset: shape.labelOffset ? { ...shape.labelOffset } : { x: 0, y: -20 },
    coordinateSpaceVersion: IMAGE_COORDINATE_SPACE,
    measurementConfidence: calibration.confidence || 'reference',
    measurementReviewStatus: 'candidate',
    measurementSource: calibration.mode === 'planar' ? 'perspective_calibration' : 'manual_calibration'
  };
}

function snapPointToAxes(start, end, toleranceDegrees = 12) {
  assertFinitePoint(start, 'start');
  assertFinitePoint(end, 'end');
  const tolerance = Math.max(0, Math.min(45, Number(toleranceDegrees) || 0));
  const rawAngle = Math.atan2(end.y - start.y, end.x - start.x) * 180 / Math.PI;
  const angle = ((rawAngle % 180) + 180) % 180;
  const horizontalDelta = Math.min(angle, 180 - angle);
  const verticalDelta = Math.abs(angle - 90);

  if (horizontalDelta <= tolerance) {
    return { point: { x: end.x, y: start.y }, snapped: true, axis: 'horizontal' };
  }
  if (verticalDelta <= tolerance) {
    return { point: { x: start.x, y: end.y }, snapped: true, axis: 'vertical' };
  }
  return { point: { ...end }, snapped: false, axis: null };
}

function canvasPointToImage(point, canvasSize, imageSize) {
  assertFinitePoint(point, 'point');
  assertSize(canvasSize, 'canvasSize');
  assertSize(imageSize, 'imageSize');
  return {
    x: point.x * imageSize.width / canvasSize.width,
    y: point.y * imageSize.height / canvasSize.height
  };
}

function imagePointToCanvas(point, canvasSize, imageSize) {
  assertFinitePoint(point, 'point');
  assertSize(canvasSize, 'canvasSize');
  assertSize(imageSize, 'imageSize');
  return {
    x: point.x * canvasSize.width / imageSize.width,
    y: point.y * canvasSize.height / imageSize.height
  };
}

function buildLegacyMapper(options) {
  const legacyCanvasSize = options?.legacyCanvasSize;
  const imageSize = options?.imageSize;
  assertSize(legacyCanvasSize, 'legacyCanvasSize');
  assertSize(imageSize, 'imageSize');
  const scaleX = imageSize.width / legacyCanvasSize.width;
  const scaleY = imageSize.height / legacyCanvasSize.height;
  const fontScale = (scaleX + scaleY) / 2;
  return {
    point: value => ({ x: value.x * scaleX, y: value.y * scaleY }),
    font: value => Number.isFinite(value) ? value * fontScale : value
  };
}

function migrateLegacyShape(shape, options) {
  if (!shape || !Array.isArray(shape.points)) return shape;
  if (shape.coordinateSpaceVersion === IMAGE_COORDINATE_SPACE) return shape;
  const mapper = buildLegacyMapper(options);
  const points = shape.points.map(mapper.point);
  const migratedTextPos = shape.textPos ? mapper.point(shape.textPos) : undefined;
  let labelOffset = shape.labelOffset ? mapper.point(shape.labelOffset) : undefined;

  if (shape.tool === 'dimension' && migratedTextPos && points.length >= 2) {
    const end = points[points.length - 1];
    const midpoint = {
      x: (points[0].x + end.x) / 2,
      y: (points[0].y + end.y) / 2
    };
    labelOffset = {
      x: migratedTextPos.x - midpoint.x,
      y: migratedTextPos.y - midpoint.y
    };
  }

  return {
    ...shape,
    points,
    ...(migratedTextPos ? { textPos: migratedTextPos } : {}),
    ...(labelOffset ? { labelOffset } : {}),
    ...(Number.isFinite(shape.fontSize) ? { fontSize: mapper.font(shape.fontSize) } : {}),
    coordinateSpaceVersion: IMAGE_COORDINATE_SPACE,
    ...(shape.tool === 'dimension' && !shape.calibrationId
      ? { unit: shape.unit || 'px', legacyDimension: true }
      : {})
  };
}

function migrateLegacyAnnotation(annotation, options) {
  if (!annotation || annotation.coordinateSpaceVersion === IMAGE_COORDINATE_SPACE) return annotation;
  const mapper = buildLegacyMapper(options);
  return {
    ...annotation,
    textPos: mapper.point(annotation.textPos),
    fontSize: mapper.font(annotation.fontSize),
    coordinateSpaceVersion: IMAGE_COORDINATE_SPACE
  };
}

function midpointForDimension(shape) {
  const start = shape.points[0];
  const end = shape.points[shape.points.length - 1];
  return { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
}

function resolvedLabelOffset(shape) {
  if (shape.labelOffset) return { ...shape.labelOffset };
  if (shape.textPos && Array.isArray(shape.points) && shape.points.length >= 2) {
    const midpoint = midpointForDimension(shape);
    return { x: shape.textPos.x - midpoint.x, y: shape.textPos.y - midpoint.y };
  }
  return { x: 0, y: -20 };
}

function moveDimension(shape, delta, part = 'body') {
  if (!shape || shape.tool !== 'dimension' || !Array.isArray(shape.points) || shape.points.length < 2) {
    throw new TypeError('a dimension shape with two points is required');
  }
  assertFinitePoint(delta, 'delta');
  const labelOffset = resolvedLabelOffset(shape);
  if (part === 'label') {
    return {
      ...shape,
      labelOffset: { x: labelOffset.x + delta.x, y: labelOffset.y + delta.y },
      textPos: undefined
    };
  }
  if (part !== 'body') throw new RangeError(`unsupported dimension move part: ${part}`);
  return {
    ...shape,
    points: shape.points.map(point => ({ x: point.x + delta.x, y: point.y + delta.y })),
    labelOffset,
    textPos: undefined
  };
}

function parseDimensionDisplayInput(input, defaultUnit = 'mm') {
  const match = String(input || '').trim().replace(',', '.').match(/^(-?\d+(?:\.\d+)?)\s*(mm|cm|in)?$/i);
  if (!match) return null;
  const value = Number(match[1]);
  const unit = (match[2] || defaultUnit).toLowerCase();
  if (!Number.isFinite(value) || !SUPPORTED_UNITS.includes(unit)) return null;
  return { value, unit };
}

function recalculateDimensions(shapes, calibration, options = {}) {
  const preserveManualOverrides = options.preserveManualOverrides !== false;
  return (shapes || []).map(shape => {
    if (shape.tool !== 'dimension' || !Array.isArray(shape.points) || shape.points.length < 2) return shape;
    const previousDisplayValue = shape.displayValue;
    const previousText = shape.text;
    const previousUnit = shape.unit;
    const wasManual = shape.manualOverride === true;
    const recalculated = applyCalibrationToDimension(shape, calibration, options);
    if (!wasManual || !preserveManualOverrides || !Number.isFinite(previousDisplayValue)) {
      return recalculated;
    }
    return {
      ...recalculated,
      displayValue: previousDisplayValue,
      unit: previousUnit || recalculated.unit,
      text: previousText || formatMeasurement(previousDisplayValue, previousUnit || recalculated.unit, recalculated.precision),
      manualOverride: true,
      measurementReviewStatus: 'candidate'
    };
  });
}

module.exports = {
  IMAGE_COORDINATE_SPACE,
  SUPPORTED_UNITS,
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
};
