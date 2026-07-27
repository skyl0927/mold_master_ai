const compact = value => String(value || '').replace(/\s+/g, ' ').trim();

const hasNormalizedBbox = observation => {
  const bbox = observation?.regionBbox || observation?.region_bbox;
  const coordinateSystem = compact(bbox?.coordinateSystem || bbox?.coordinate_system);
  return coordinateSystem === 'normalized_xywh'
    && Number(bbox?.width ?? bbox?.w) > 0
    && Number(bbox?.height ?? bbox?.h) > 0;
};

const statusKey = value => {
  const normalized = compact(value).toLocaleLowerCase();
  if (normalized === 'approved') return 'approved';
  if (normalized === 'rejected') return 'rejected';
  if (normalized === 'needs_review') return 'needsReview';
  return 'candidate';
};

const listVisionObservationIds = visionSummary => (
  Array.isArray(visionSummary?.visualObservations)
    ? visionSummary.visualObservations
    : []
)
  .filter(hasNormalizedBbox)
  .map((observation, index) => compact(
    observation.observationId || observation.observation_id || `obs-${index + 1}`
  ))
  .filter(Boolean);

const latestAnnotationByObservationId = annotations => {
  const result = new Map();
  for (const annotation of Array.isArray(annotations) ? annotations : []) {
    const observationId = compact(annotation?.metadata?.local_vision_observation_id);
    if (!observationId) continue;
    result.set(observationId, annotation);
  }
  return result;
};

const deriveStatus = ({
  totalVisionBboxes,
  synced,
  missing,
  candidate,
  needsReview,
  rejected,
  approved
}) => {
  if (totalVisionBboxes === 0) return 'none';
  if (synced === 0) return 'not_synced';
  if (missing > 0) return 'partially_synced';
  if (candidate > 0 || needsReview > 0) return 'pending_review';
  if (rejected > 0) return 'rejected';
  if (approved === totalVisionBboxes) return 'approved';
  return 'pending_review';
};

const summarizeVisionBboxAnnotationStatus = ({
  visionSummary,
  annotations = []
} = {}) => {
  const observationIds = listVisionObservationIds(visionSummary);
  const annotationByObservationId = latestAnnotationByObservationId(annotations);
  const totals = {
    candidate: 0,
    approved: 0,
    rejected: 0,
    needsReview: 0
  };
  const pendingObservationIds = [];
  const approvedObservationIds = [];
  const rejectedObservationIds = [];
  const missingObservationIds = [];
  const needsReviewObservationIds = [];

  for (const observationId of observationIds) {
    const annotation = annotationByObservationId.get(observationId);
    if (!annotation) {
      missingObservationIds.push(observationId);
      continue;
    }

    const key = statusKey(annotation.review_status);
    totals[key] += 1;
    if (key === 'approved') approvedObservationIds.push(observationId);
    if (key === 'rejected') rejectedObservationIds.push(observationId);
    if (key === 'needsReview') needsReviewObservationIds.push(observationId);
    if (key === 'candidate') pendingObservationIds.push(observationId);
  }

  const totalVisionBboxes = observationIds.length;
  const synced = totalVisionBboxes - missingObservationIds.length;
  const status = deriveStatus({
    totalVisionBboxes,
    synced,
    missing: missingObservationIds.length,
    candidate: totals.candidate,
    needsReview: totals.needsReview,
    rejected: totals.rejected,
    approved: totals.approved
  });
  const reviewComplete = totalVisionBboxes > 0
    && synced === totalVisionBboxes
    && totals.candidate === 0
    && totals.needsReview === 0;

  return {
    contractVersion: 'vision-bbox-annotation-status/v1',
    status,
    totalVisionBboxes,
    synced,
    missing: missingObservationIds.length,
    candidate: totals.candidate,
    approved: totals.approved,
    rejected: totals.rejected,
    needsReview: totals.needsReview,
    reviewComplete,
    learningReadyCandidate: reviewComplete && totals.rejected === 0 && totals.approved === totalVisionBboxes,
    graphPromotionAllowed: false,
    pendingObservationIds,
    approvedObservationIds,
    rejectedObservationIds,
    needsReviewObservationIds,
    missingObservationIds
  };
};

module.exports = {
  summarizeVisionBboxAnnotationStatus
};
