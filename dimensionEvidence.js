const { formatMeasurement } = require('./dimensionMeasurement');

function toMeasurement(shape) {
  if (
    !shape
    || shape.tool !== 'dimension'
    || shape.unit === 'px'
    || shape.legacyDimension
    || !shape.calibrationId
    || !Number.isFinite(shape.measuredValue)
    || !Number.isFinite(shape.displayValue)
  ) {
    return null;
  }
  const precision = Number.isFinite(shape.precision) ? shape.precision : 2;
  const reviewStatus = shape.measurementReviewStatus || 'candidate';
  return {
    id: shape.id,
    label: shape.text || formatMeasurement(shape.displayValue, shape.unit, precision),
    measuredValue: shape.measuredValue,
    displayValue: shape.displayValue,
    unit: shape.unit,
    calibrationId: shape.calibrationId,
    manualOverride: shape.manualOverride === true,
    confidence: shape.measurementConfidence || 'reference',
    reviewStatus,
    source: shape.measurementSource || 'manual_calibration',
    graphPromotionAllowed: reviewStatus === 'approved'
  };
}

function buildDimensionEvidence(shapes = []) {
  const measurements = shapes.map(toMeasurement).filter(Boolean);
  const approvedCount = measurements.filter(item => item.reviewStatus === 'approved').length;
  const rejectedCount = measurements.filter(item => item.reviewStatus === 'rejected').length;
  const graphPromotionAllowed = measurements.length > 0 && approvedCount === measurements.length;

  if (measurements.length === 0) {
    return {
      status: 'warning',
      summary: '실단위 치수 증거 없음',
      next_actions: ['기준 치수 설정 후 다시 측정'],
      artifacts: [],
      measurementCount: 0,
      approvedCount: 0,
      rejectedCount: 0,
      graphPromotionAllowed: false,
      measurements: []
    };
  }

  return {
    status: graphPromotionAllowed ? 'success' : 'warning',
    summary: `실단위 치수 ${measurements.length}개 · 승인 ${approvedCount}개`,
    next_actions: graphPromotionAllowed
      ? []
      : [rejectedCount > 0 ? '거절된 치수 재측정' : '사람 검토 후 승인 또는 보정'],
    artifacts: [],
    measurementCount: measurements.length,
    approvedCount,
    rejectedCount,
    graphPromotionAllowed,
    measurements
  };
}

function formatDimensionEvidenceForPrompt(evidence) {
  if (!evidence || evidence.measurementCount === 0) return '';
  const lines = evidence.measurements.map((item, index) => {
    const precision = String(item.label).match(/\.(\d+)/)?.[1]?.length ?? 2;
    const display = formatMeasurement(item.displayValue, item.unit, precision);
    const automatic = formatMeasurement(item.measuredValue, item.unit, precision);
    const correction = item.manualOverride ? ` · 자동 ${automatic} · 수동 보정` : ' · 자동 측정';
    const review = item.reviewStatus === 'approved'
      ? '검토 승인'
      : item.reviewStatus === 'rejected' ? '검토 거절' : '검토 대기';
    return `${index + 1}. 표시 ${display}${correction} · ${review}`;
  });
  return ['사용자 보정 치수 증거:', ...lines].join('\n');
}

function formatDimensionEvidenceForReport(evidence) {
  if (!evidence || evidence.measurementCount === 0) return '';
  return evidence.measurements.map(item => {
    const precision = String(item.label).match(/\.(\d+)/)?.[1]?.length ?? 2;
    const display = formatMeasurement(item.displayValue, item.unit, precision);
    const automatic = formatMeasurement(item.measuredValue, item.unit, precision);
    const details = item.manualOverride
      ? [`자동 ${automatic}`, '수동 보정']
      : ['자동 측정'];
    details.push(item.reviewStatus === 'approved'
      ? '승인'
      : item.reviewStatus === 'rejected' ? '거절' : '검토 대기');
    return `${display} (${details.join(', ')})`;
  }).join('\n');
}

module.exports = {
  buildDimensionEvidence,
  formatDimensionEvidenceForPrompt,
  formatDimensionEvidenceForReport
};
