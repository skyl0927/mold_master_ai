const {
  IMAGE_COORDINATE_SPACE,
  applyCalibrationToDimension,
  convertMeasurement,
  createCalibration,
  distanceBetween,
  formatMeasurement,
  migrateLegacyAnnotation,
  migrateLegacyShape,
  parseDimensionDisplayInput,
  recalculateDimensions
} = require('./dimensionMeasurement');
const { createPerspectiveCalibration } = require('./perspectiveMeasurement');

function cloneDocument(document) {
  return {
    ...document,
    shapes: (document.shapes || []).map(shape => ({
      ...shape,
      ...(shape.points ? { points: shape.points.map(point => ({ ...point })) } : {}),
      ...(shape.labelOffset ? { labelOffset: { ...shape.labelOffset } } : {}),
      ...(shape.textPos ? { textPos: { ...shape.textPos } } : {})
    })),
    annotations: (document.annotations || []).map(annotation => ({
      ...annotation,
      textPos: { ...annotation.textPos }
    })),
    dimensionCalibrations: (document.dimensionCalibrations || []).map(calibration => ({
      ...calibration,
      start: { ...calibration.start },
      end: { ...calibration.end },
      ...(calibration.sourceQuad
        ? { sourceQuad: calibration.sourceQuad.map(point => ({ ...point })) }
        : {}),
      ...(calibration.homography ? { homography: [...calibration.homography] } : {})
    }))
  };
}

function initializeDimensionDocument(input = {}) {
  const document = {
    shapes: input.shapes || [],
    annotations: input.annotations || [],
    dimensionCalibrations: input.dimensionCalibrations || [],
    activeDimensionCalibrationId: input.activeDimensionCalibrationId,
    coordinateSpaceVersion: input.coordinateSpaceVersion
  };
  if (input.coordinateSpaceVersion === IMAGE_COORDINATE_SPACE) {
    return { ...cloneDocument(document), coordinateSpaceVersion: IMAGE_COORDINATE_SPACE };
  }
  if (!input.legacyCanvasSize || !input.imageSize) {
    throw new TypeError('legacyCanvasSize and imageSize are required for coordinate migration');
  }
  const migrationOptions = {
    legacyCanvasSize: input.legacyCanvasSize,
    imageSize: input.imageSize
  };
  return {
    ...document,
    shapes: document.shapes.map(shape => migrateLegacyShape(shape, migrationOptions)),
    annotations: document.annotations.map(annotation => migrateLegacyAnnotation(annotation, migrationOptions)),
    dimensionCalibrations: document.dimensionCalibrations.map(calibration => ({
      ...calibration,
      coordinateSpaceVersion: IMAGE_COORDINATE_SPACE
    })),
    coordinateSpaceVersion: IMAGE_COORDINATE_SPACE
  };
}

function upsertCalibration(document, calibrationInput, options = {}) {
  const calibration = createCalibration(calibrationInput);
  const dimensionCalibrations = [
    ...(document.dimensionCalibrations || []).filter(item => item.id !== calibration.id),
    calibration
  ];
  const applyToAllDimensions = options.applyToAllDimensions !== false;
  return {
    ...document,
    dimensionCalibrations,
    activeDimensionCalibrationId: calibration.id,
    coordinateSpaceVersion: IMAGE_COORDINATE_SPACE,
    shapes: applyToAllDimensions
      ? recalculateDimensions(document.shapes || [], calibration, {
          precision: options.precision,
          preserveManualOverrides: options.preserveManualOverrides !== false
        })
      : document.shapes || []
  };
}

function upsertPerspectiveCalibration(document, calibrationInput, options = {}) {
  const calibration = createPerspectiveCalibration(calibrationInput);
  const dimensionCalibrations = [
    ...(document.dimensionCalibrations || []).filter(item => item.id !== calibration.id),
    calibration
  ];
  return {
    ...document,
    dimensionCalibrations,
    activeDimensionCalibrationId: calibration.id,
    coordinateSpaceVersion: IMAGE_COORDINATE_SPACE,
    shapes: options.applyToAllDimensions === false
      ? document.shapes || []
      : recalculateDimensions(document.shapes || [], calibration, {
          precision: options.precision,
          preserveManualOverrides: options.preserveManualOverrides !== false
        })
  };
}

function setActiveCalibration(document, calibrationId) {
  if (!(document.dimensionCalibrations || []).some(item => item.id === calibrationId)) {
    throw new RangeError(`dimension calibration does not exist: ${calibrationId}`);
  }
  return { ...document, activeDimensionCalibrationId: calibrationId };
}

function findActiveCalibration(document) {
  return (document.dimensionCalibrations || []).find(
    item => item.id === document.activeDimensionCalibrationId
  );
}

function addMeasuredDimension(document, shape, options = {}) {
  const activeCalibration = findActiveCalibration(document);
  const measuredShape = activeCalibration
    ? applyCalibrationToDimension(shape, activeCalibration, options)
    : {
        ...shape,
        measuredValue: distanceBetween(shape.points[0], shape.points[shape.points.length - 1]),
        displayValue: distanceBetween(shape.points[0], shape.points[shape.points.length - 1]),
        unit: 'px',
        precision: 0,
        text: `${Math.round(distanceBetween(shape.points[0], shape.points[shape.points.length - 1]))} px`,
        manualOverride: false,
        legacyDimension: false,
        labelOffset: shape.labelOffset ? { ...shape.labelOffset } : { x: 0, y: -20 },
        coordinateSpaceVersion: IMAGE_COORDINATE_SPACE,
        measurementConfidence: 'estimated',
        measurementReviewStatus: 'candidate',
        measurementSource: 'source_image_pixels'
      };
  return {
    ...document,
    shapes: [...(document.shapes || []), measuredShape],
    coordinateSpaceVersion: IMAGE_COORDINATE_SPACE
  };
}

function updateDimensionManualDisplay(document, dimensionId, input) {
  let updated = false;
  const shapes = (document.shapes || []).map(shape => {
    if (shape.id !== dimensionId || shape.tool !== 'dimension') return shape;
    const parsed = parseDimensionDisplayInput(input, shape.unit === 'px' ? 'mm' : shape.unit);
    if (!parsed) throw new RangeError('dimension display value must be a number with mm, cm, or in');
    const previousUnit = shape.unit === 'px' ? parsed.unit : shape.unit;
    const measuredValue = Number.isFinite(shape.measuredValue) && previousUnit !== parsed.unit
      ? convertMeasurement(shape.measuredValue, previousUnit, parsed.unit)
      : shape.measuredValue;
    const precision = Number.isFinite(shape.precision) ? shape.precision : 2;
    updated = true;
    return {
      ...shape,
      measuredValue,
      displayValue: parsed.value,
      unit: parsed.unit,
      text: formatMeasurement(parsed.value, parsed.unit, precision),
      manualOverride: true,
      measurementReviewStatus: 'candidate'
    };
  });
  if (!updated) throw new RangeError(`dimension does not exist: ${dimensionId}`);
  return { ...document, shapes };
}

function setDimensionReviewStatus(document, dimensionId, reviewStatus) {
  if (!['candidate', 'approved', 'rejected'].includes(reviewStatus)) {
    throw new RangeError(`unsupported dimension review status: ${reviewStatus}`);
  }
  let updated = false;
  const shapes = (document.shapes || []).map(shape => {
    if (shape.id !== dimensionId || shape.tool !== 'dimension') return shape;
    updated = true;
    return { ...shape, measurementReviewStatus: reviewStatus };
  });
  if (!updated) throw new RangeError(`dimension does not exist: ${dimensionId}`);
  return { ...document, shapes };
}

function createEditorHistory(initialDocument) {
  return { past: [], present: cloneDocument(initialDocument), future: [] };
}

function commitEditorHistory(history, nextDocument) {
  if (JSON.stringify(history.present) === JSON.stringify(nextDocument)) return history;
  return {
    past: [...history.past, cloneDocument(history.present)],
    present: cloneDocument(nextDocument),
    future: []
  };
}

function undoEditorHistory(history) {
  if (history.past.length === 0) return history;
  const previous = history.past[history.past.length - 1];
  return {
    past: history.past.slice(0, -1),
    present: cloneDocument(previous),
    future: [cloneDocument(history.present), ...history.future]
  };
}

function redoEditorHistory(history) {
  if (history.future.length === 0) return history;
  const next = history.future[0];
  return {
    past: [...history.past, cloneDocument(history.present)],
    present: cloneDocument(next),
    future: history.future.slice(1)
  };
}

module.exports = {
  addMeasuredDimension,
  commitEditorHistory,
  createEditorHistory,
  initializeDimensionDocument,
  redoEditorHistory,
  setActiveCalibration,
  setDimensionReviewStatus,
  undoEditorHistory,
  updateDimensionManualDisplay,
  upsertCalibration,
  upsertPerspectiveCalibration
};
