const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const finiteNumber = value => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const toPct = value => Math.round(value * 1000) / 10;

const normalizeBbox = bbox => {
  if (!bbox || typeof bbox !== 'object' || Array.isArray(bbox)) return null;
  const coordinateSystem = bbox.coordinateSystem || bbox.coordinate_system;
  if (coordinateSystem !== 'normalized_xywh') return null;

  const x = finiteNumber(bbox.x);
  const y = finiteNumber(bbox.y);
  const width = finiteNumber(bbox.width ?? bbox.w);
  const height = finiteNumber(bbox.height ?? bbox.h);
  const confidence = finiteNumber(bbox.confidence);
  if (
    x === null
    || y === null
    || width === null
    || height === null
    || confidence === null
    || width <= 0
    || height <= 0
  ) {
    return null;
  }

  const left = clamp(x, 0, 1);
  const top = clamp(y, 0, 1);
  const right = clamp(x + width, 0, 1);
  const bottom = clamp(y + height, 0, 1);
  if (right <= left || bottom <= top) return null;

  return {
    coordinateSystem,
    confidence: clamp(confidence, 0, 1),
    geometry: {
      leftPct: toPct(left),
      topPct: toPct(top),
      widthPct: toPct(right - left),
      heightPct: toPct(bottom - top)
    }
  };
};

const buildVisionBboxOverlayItems = (visionSummary, { limit = 12 } = {}) => {
  const primarySupportIds = new Set(
    Array.isArray(visionSummary?.primaryCandidate?.supportingObservationIds)
      ? visionSummary.primaryCandidate.supportingObservationIds
      : []
  );
  const observations = Array.isArray(visionSummary?.visualObservations)
    ? visionSummary.visualObservations
    : [];

  return observations
    .flatMap((observation, index) => {
      const normalized = normalizeBbox(observation?.regionBbox || observation?.region_bbox);
      if (!normalized) return [];
      const observationId = String(observation.observationId || observation.observation_id || `obs-${index + 1}`);
      const category = String(observation.category || 'other');
      const isPrimarySupport = primarySupportIds.has(observationId);
      const confidencePct = Math.round(normalized.confidence * 100);

      return [{
        observationId,
        category,
        region: String(observation.region || ''),
        description: String(observation.description || ''),
        confidence: normalized.confidence,
        confidencePct,
        isPrimarySupport,
        label: `${observationId} · ${category} · ${confidencePct}%`,
        geometry: normalized.geometry
      }];
    })
    .sort((left, right) => Number(right.isPrimarySupport) - Number(left.isPrimarySupport)
      || right.confidence - left.confidence)
    .slice(0, limit)
    .map((item, index) => ({
      ...item,
      displayIndex: index + 1,
      tone: item.isPrimarySupport ? 'primary' : 'secondary'
    }));
};

const buildVisionBboxOverlayIndex = (visionSummary, options) => {
  const items = buildVisionBboxOverlayItems(visionSummary, options);
  const byObservationId = items.reduce((accumulator, item) => {
    accumulator[item.observationId] = item;
    return accumulator;
  }, Object.create(null));

  return {
    items,
    byObservationId
  };
};

const overlayItemStyle = item => ({
  left: `${item.geometry.leftPct}%`,
  top: `${item.geometry.topPct}%`,
  width: `${item.geometry.widthPct}%`,
  height: `${item.geometry.heightPct}%`
});

module.exports = {
  buildVisionBboxOverlayIndex,
  buildVisionBboxOverlayItems,
  overlayItemStyle
};
