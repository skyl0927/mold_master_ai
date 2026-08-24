const SUPPORTED_UNITS = Object.freeze(['mm', 'cm', 'in']);
const EPSILON = 1e-10;

function assertPoint(point, name) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new TypeError(`${name} must contain finite x and y coordinates`);
  }
}

function assertOrderedConvexQuad(sourceQuad) {
  if (!Array.isArray(sourceQuad) || sourceQuad.length !== 4) {
    throw new TypeError('sourceQuad must contain four ordered points');
  }
  sourceQuad.forEach((point, index) => assertPoint(point, `sourceQuad[${index}]`));
  const crosses = sourceQuad.map((point, index) => {
    const next = sourceQuad[(index + 1) % 4];
    const after = sourceQuad[(index + 2) % 4];
    return (next.x - point.x) * (after.y - next.y)
      - (next.y - point.y) * (after.x - next.x);
  });
  const positive = crosses.every(value => value > EPSILON);
  const negative = crosses.every(value => value < -EPSILON);
  if (!positive && !negative) {
    throw new RangeError('sourceQuad must be a convex, consistently ordered quadrilateral');
  }
}

function solveLinearSystem(rows) {
  const matrix = rows.map(row => [...row]);
  const size = matrix.length;
  for (let column = 0; column < size; column += 1) {
    let pivotRow = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(matrix[row][column]) > Math.abs(matrix[pivotRow][column])) pivotRow = row;
    }
    if (Math.abs(matrix[pivotRow][column]) <= EPSILON) {
      throw new RangeError('perspective calibration points are degenerate');
    }
    [matrix[column], matrix[pivotRow]] = [matrix[pivotRow], matrix[column]];
    const pivot = matrix[column][column];
    for (let index = column; index <= size; index += 1) matrix[column][index] /= pivot;
    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = matrix[row][column];
      for (let index = column; index <= size; index += 1) {
        matrix[row][index] -= factor * matrix[column][index];
      }
    }
  }
  return matrix.map((row, index) => row[size]);
}

function solveHomography(sourceQuad, targetQuad) {
  const rows = [];
  for (let index = 0; index < 4; index += 1) {
    const { x, y } = sourceQuad[index];
    const { x: targetX, y: targetY } = targetQuad[index];
    rows.push([x, y, 1, 0, 0, 0, -targetX * x, -targetX * y, targetX]);
    rows.push([0, 0, 0, x, y, 1, -targetY * x, -targetY * y, targetY]);
  }
  return [...solveLinearSystem(rows), 1];
}

function applyPerspectiveTransform(point, homography) {
  assertPoint(point, 'point');
  if (!Array.isArray(homography) || homography.length !== 9 || !homography.every(Number.isFinite)) {
    throw new TypeError('homography must contain nine finite values');
  }
  const denominator = homography[6] * point.x + homography[7] * point.y + homography[8];
  if (Math.abs(denominator) <= EPSILON) {
    throw new RangeError('point cannot be projected onto the calibrated plane');
  }
  return {
    x: (homography[0] * point.x + homography[1] * point.y + homography[2]) / denominator,
    y: (homography[3] * point.x + homography[4] * point.y + homography[5]) / denominator
  };
}

function createPerspectiveCalibration({
  id = `perspective-${Date.now()}`,
  sourceQuad,
  knownWidth,
  knownHeight,
  unit = 'mm',
  planeLabel = 'perspective-plane',
  createdAt = new Date().toISOString()
} = {}) {
  assertOrderedConvexQuad(sourceQuad);
  if (!SUPPORTED_UNITS.includes(unit)) throw new RangeError(`unsupported calibration unit: ${unit}`);
  if (!Number.isFinite(knownWidth) || knownWidth <= 0) {
    throw new RangeError('known width must be greater than zero');
  }
  if (!Number.isFinite(knownHeight) || knownHeight <= 0) {
    throw new RangeError('known height must be greater than zero');
  }
  const targetQuad = [
    { x: 0, y: 0 },
    { x: knownWidth, y: 0 },
    { x: knownWidth, y: knownHeight },
    { x: 0, y: knownHeight }
  ];
  const homography = solveHomography(sourceQuad, targetQuad);
  const pixelLength = Math.hypot(
    sourceQuad[1].x - sourceQuad[0].x,
    sourceQuad[1].y - sourceQuad[0].y
  );
  return {
    id,
    protocolVersion: 'dimension-calibration/v2',
    coordinateSpaceVersion: 'image/v1',
    mode: 'planar',
    start: { ...sourceQuad[0] },
    end: { ...sourceQuad[1] },
    pixelLength,
    knownLength: knownWidth,
    knownWidth,
    knownHeight,
    unit,
    unitPerPixel: knownWidth / pixelLength,
    planeLabel,
    confidence: 'perspective_corrected',
    createdAt,
    sourceQuad: sourceQuad.map(point => ({ ...point })),
    homography
  };
}

function measurePerspectiveDistance(start, end, calibration) {
  if (!calibration || calibration.mode !== 'planar') {
    throw new TypeError('a planar perspective calibration is required');
  }
  const projectedStart = applyPerspectiveTransform(start, calibration.homography);
  const projectedEnd = applyPerspectiveTransform(end, calibration.homography);
  return Math.hypot(projectedEnd.x - projectedStart.x, projectedEnd.y - projectedStart.y);
}

function translatePerspectiveCalibration(calibration, delta) {
  if (!calibration || calibration.mode !== 'planar' || !Array.isArray(calibration.sourceQuad)) {
    throw new TypeError('a planar perspective calibration is required');
  }
  assertPoint(delta, 'delta');
  return createPerspectiveCalibration({
    id: calibration.id,
    sourceQuad: calibration.sourceQuad.map(point => ({
      x: point.x + delta.x,
      y: point.y + delta.y
    })),
    knownWidth: calibration.knownWidth,
    knownHeight: calibration.knownHeight,
    unit: calibration.unit,
    planeLabel: calibration.planeLabel,
    createdAt: calibration.createdAt
  });
}

module.exports = {
  applyPerspectiveTransform,
  createPerspectiveCalibration,
  measurePerspectiveDistance,
  solveHomography,
  translatePerspectiveCalibration
};
