const compact = value => String(value || '').replace(/\s+/g, ' ').trim();

const finiteNumber = value => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const validNormalizedBbox = bbox => {
  if (!bbox || typeof bbox !== 'object' || Array.isArray(bbox)) return null;
  const coordinateSystem = compact(bbox.coordinateSystem || bbox.coordinate_system);
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
    || x < 0
    || y < 0
    || x > 1
    || y > 1
    || width <= 0
    || height <= 0
    || width > 1
    || height > 1
    || x + width > 1.001
    || y + height > 1.001
  ) {
    return null;
  }

  return {
    bbox: {
      coordinate_system: 'normalized_xywh',
      x,
      y,
      width,
      height
    },
    confidence
  };
};

const withoutEmptyValues = value => Object.fromEntries(
  Object.entries(value).filter(([, item]) => item !== undefined && item !== '')
);

const existingVisionObservationIds = annotations => new Set(
  (Array.isArray(annotations) ? annotations : [])
    .map(annotation => compact(annotation?.metadata?.local_vision_observation_id))
    .filter(Boolean)
);

const buildVisionBboxAnnotationPayloads = ({
  image,
  existingAnnotations = []
} = {}) => {
  const analysis = image?.analysis || {};
  const visionSummary = analysis.visionSummary || {};
  const observations = Array.isArray(visionSummary.visualObservations)
    ? visionSummary.visualObservations
    : [];
  const primaryCandidate = visionSummary.primaryCandidate || {};
  const primarySupportIds = new Set(
    Array.isArray(primaryCandidate.supportingObservationIds)
      ? primaryCandidate.supportingObservationIds
      : []
  );
  const syncedObservationIds = existingVisionObservationIds(existingAnnotations);
  const primaryDefectType = compact(primaryCandidate.defectType || analysis.defectType);

  return observations.flatMap((observation, index) => {
    const observationId = compact(observation?.observationId || observation?.observation_id || `obs-${index + 1}`);
    if (!observationId || syncedObservationIds.has(observationId)) return [];

    const normalized = validNormalizedBbox(observation?.regionBbox || observation?.region_bbox);
    if (!normalized) return [];

    const category = compact(observation?.category) || 'other';
    const isPrimarySupport = primarySupportIds.has(observationId);
    const label = isPrimarySupport && primaryDefectType
      ? primaryDefectType
      : `vision_${category}_roi`;
    const metadata = withoutEmptyValues({
      local_image_id: image?.id,
      common_agent_image_id: image?.commonAgentImageId,
      local_vision_observation_id: observationId,
      vision_observation_category: category,
      vision_observation_region: compact(observation?.region),
      vision_observation_description: compact(observation?.description),
      vision_observation_confidence: finiteNumber(observation?.confidence),
      vision_bbox_confidence: normalized.confidence,
      vision_primary_support: isPrimarySupport,
      vision_candidate_defect_type: primaryDefectType,
      capture_session_id: image?.captureSessionId,
      capture_view_tags: image?.captureViewTag ? [image.captureViewTag] : [],
      vision_image_kind: image?.captureImageKind,
      capture_source: image?.captureSource,
      source: 'vision-observation/v2'
    });

    return [{
      label,
      annotation_type: 'bbox',
      bbox: normalized.bbox,
      review_status: 'candidate',
      source_app: 'mold-master-ai',
      note: 'vision observation bbox candidate',
      metadata
    }];
  });
};

module.exports = {
  buildVisionBboxAnnotationPayloads
};
