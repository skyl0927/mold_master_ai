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

const reviewStatusForAction = reviewAction => {
  const action = compact(reviewAction);
  if (action === 'rejected_bbox' || action === 'reject_bbox') return 'rejected';
  return 'needs_review';
};

const findVisionObservation = (visionSummary, observationId) => {
  const observations = Array.isArray(visionSummary?.visualObservations)
    ? visionSummary.visualObservations
    : [];
  const targetObservationId = compact(observationId);
  if (!targetObservationId) return null;

  const observation = observations.find((item, index) => {
    const localObservationId = compact(item?.observationId || item?.observation_id || `obs-${index + 1}`);
    return localObservationId === targetObservationId;
  });
  return observation ? { observation, observationId: targetObservationId } : null;
};

const sameCoordinate = (left, right) => Math.abs(Number(left) - Number(right)) < 0.0005;

const buildVisionBboxCorrectionDraft = ({
  image,
  observationId,
  draftValues = {}
} = {}) => {
  const analysis = image?.analysis || {};
  const visionSummary = analysis.visionSummary || {};
  const found = findVisionObservation(visionSummary, observationId);
  if (!found) return null;

  const original = validNormalizedBbox(found.observation?.regionBbox || found.observation?.region_bbox);
  if (!original) return null;

  const fields = {
    x: draftValues.x ?? original.bbox.x,
    y: draftValues.y ?? original.bbox.y,
    width: draftValues.width ?? draftValues.w ?? original.bbox.width,
    height: draftValues.height ?? draftValues.h ?? original.bbox.height
  };
  const x = finiteNumber(fields.x);
  const y = finiteNumber(fields.y);
  const width = finiteNumber(fields.width);
  const height = finiteNumber(fields.height);
  const errors = [];

  if (x === null) errors.push('x_not_number');
  if (y === null) errors.push('y_not_number');
  if (width === null) errors.push('width_not_number');
  if (height === null) errors.push('height_not_number');
  if (x !== null && x < 0) errors.push('x_below_0');
  if (y !== null && y < 0) errors.push('y_below_0');
  if (x !== null && x > 1) errors.push('x_above_1');
  if (y !== null && y > 1) errors.push('y_above_1');
  if (width !== null && width <= 0) errors.push('width_not_positive');
  if (height !== null && height <= 0) errors.push('height_not_positive');
  if (width !== null && width > 1) errors.push('width_above_1');
  if (height !== null && height > 1) errors.push('height_above_1');
  if (x !== null && width !== null && x + width > 1.001) errors.push('x_plus_width_exceeds_1');
  if (y !== null && height !== null && y + height > 1.001) errors.push('y_plus_height_exceeds_1');

  if (errors.length > 0) {
    return {
      protocolVersion: 'vision-bbox-correction-draft/v1',
      observationId: found.observationId,
      originalBbox: original.bbox,
      correctedBbox: null,
      isValid: false,
      hasChanges: false,
      errors
    };
  }

  const hasChanges = !sameCoordinate(x, original.bbox.x)
    || !sameCoordinate(y, original.bbox.y)
    || !sameCoordinate(width, original.bbox.width)
    || !sameCoordinate(height, original.bbox.height);
  const correctedBbox = {
    coordinateSystem: 'normalized_xywh',
    x,
    y,
    width,
    height,
    confidence: 1
  };

  return {
    protocolVersion: 'vision-bbox-correction-draft/v1',
    observationId: found.observationId,
    originalBbox: original.bbox,
    correctedBbox,
    isValid: true,
    hasChanges,
    errors: []
  };
};

const buildVisionBboxReviewPacket = ({
  image,
  observationId,
  reviewAction = 'needs_review',
  correctedBbox,
  reviewerNote = ''
} = {}) => {
  const analysis = image?.analysis || {};
  const visionSummary = analysis.visionSummary || {};
  const targetObservationId = compact(observationId);
  if (!targetObservationId) return null;

  const found = findVisionObservation(visionSummary, targetObservationId);
  if (!found) return null;
  const observation = found.observation;

  const original = validNormalizedBbox(observation?.regionBbox || observation?.region_bbox);
  if (!original) return null;
  const corrected = correctedBbox ? validNormalizedBbox(correctedBbox) : null;
  if (correctedBbox && !corrected) return null;

  const primaryCandidate = visionSummary.primaryCandidate || {};
  const primarySupportIds = new Set(
    Array.isArray(primaryCandidate.supportingObservationIds)
      ? primaryCandidate.supportingObservationIds
      : []
  );
  const primaryDefectType = compact(primaryCandidate.defectType || analysis.defectType);
  const category = compact(observation?.category) || 'other';
  const isPrimarySupport = primarySupportIds.has(targetObservationId);
  const label = isPrimarySupport && primaryDefectType
    ? primaryDefectType
    : `vision_${category}_roi`;
  const reviewStatus = reviewStatusForAction(reviewAction);
  const packetBbox = corrected?.bbox || original.bbox;
  const graphPromotionAllowed = false;
  const learningSyncAllowed = false;

  const metadata = withoutEmptyValues({
    local_image_id: image?.id,
    common_agent_image_id: image?.commonAgentImageId,
    local_vision_observation_id: targetObservationId,
    vision_observation_category: category,
    vision_observation_region: compact(observation?.region),
    vision_observation_description: compact(observation?.description),
    vision_observation_confidence: finiteNumber(observation?.confidence),
    vision_bbox_confidence: original.confidence,
    vision_bbox_review_confidence: corrected?.confidence,
    vision_primary_support: isPrimarySupport,
    vision_candidate_defect_type: primaryDefectType,
    capture_session_id: image?.captureSessionId,
    capture_view_tags: image?.captureViewTag ? [image.captureViewTag] : [],
    vision_image_kind: image?.captureImageKind,
    capture_source: image?.captureSource,
    source: 'vision-bbox-hitl-review/v1',
    parent_source: 'vision-observation/v2',
    review_action: compact(reviewAction) || 'needs_review',
    reviewer_note: compact(reviewerNote),
    original_bbox: original.bbox,
    corrected_bbox: corrected?.bbox,
    graph_promotion_allowed: graphPromotionAllowed,
    learning_sync_allowed: learningSyncAllowed,
    requires_human_review: true
  });

  const annotationRequest = {
    label,
    annotation_type: 'bbox',
    bbox: packetBbox,
    review_status: reviewStatus,
    source_app: 'mold-master-ai',
    note: 'vision bbox HITL review packet',
    metadata
  };

  return {
    protocolVersion: 'vision-bbox-hitl-review/v1',
    schema_version: 'vision-bbox-hitl-review/v1',
    sourceApp: 'mold-master-ai',
    reviewAction: compact(reviewAction) || 'needs_review',
    reviewStatus,
    localImageId: image?.id || '',
    commonAgentImageId: image?.commonAgentImageId || '',
    observationId: targetObservationId,
    label,
    originalBbox: original.bbox,
    correctedBbox: corrected?.bbox,
    annotationRequest,
    graphPromotionAllowed,
    learningSyncAllowed,
    requiresHumanReview: true
  };
};

module.exports = {
  buildVisionBboxCorrectionDraft,
  buildVisionBboxReviewPacket,
  buildVisionBboxAnnotationPayloads
};
