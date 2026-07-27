const {
  BASE_REQUIRED_VIEWS,
  VIEW_DEFINITIONS,
  normalizeViewTags
} = require('./visionCaptureProtocol');

const VALID_IMAGE_KINDS = new Set([
  'physical_product',
  'document_or_diagram',
  'unknown'
]);

const VALID_CAPTURE_SOURCES = new Set([
  'camera',
  'screen',
  'file',
  'mobile'
]);

const CAPTURE_VIEW_OPTIONS = Object.entries(VIEW_DEFINITIONS).map(
  ([value, definition]) => ({
    value,
    label: definition.label,
    instruction: definition.instruction
  })
);

const normalizeImageKind = value => VALID_IMAGE_KINDS.has(value)
  ? value
  : 'unknown';

const normalizeCaptureSource = value => VALID_CAPTURE_SOURCES.has(value)
  ? value
  : 'file';

const compact = value => String(value || '').replace(/\s+/g, ' ').trim();

const stringList = value => (Array.isArray(value) ? value : [])
  .map(compact)
  .filter(Boolean);

const buildRecaptureSourceFromReview = ({
  image,
  analysis,
  reviewDecisionId
} = {}) => {
  const visionSummary = analysis?.visionSummary || image?.analysis?.visionSummary || {};
  const safetyGate = visionSummary?.safetyGate || {};
  return {
    localImageId: compact(image?.id),
    commonAgentImageId: compact(image?.commonAgentImageId),
    reviewDecisionId: compact(reviewDecisionId),
    safetyGateReasons: stringList(safetyGate?.reasons),
    requiredAdditionalViews: stringList(visionSummary?.requiredAdditionalViews),
    bboxGroundingProfileId: compact(safetyGate?.bboxGroundingProfileId)
  };
};

const createCaptureSessionId = (
  source = 'capture',
  now = Date.now(),
  random = Math.random
) => {
  const safeSource = String(source || 'capture')
    .trim()
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'capture';
  const entropy = Math.floor(random() * 0x100000000)
    .toString(36)
    .padStart(7, '0');
  return `capture-${safeSource}-${Number(now).toString(36)}-${entropy}`;
};

const getViewLabel = view => VIEW_DEFINITIONS[view]?.label || view;

const buildSessionMessage = (status, missingViews) => {
  if (status === 'ready') {
    return '기본 촬영 시점이 충족되어 비전 진단을 실행할 수 있습니다.';
  }
  if (status === 'not_visually_verifiable') {
    return '문서나 도면이 아닌 실제 성형품 사진을 촬영해 주세요.';
  }
  if (status === 'needs_metadata') {
    return '촬영 세션, 이미지 종류와 촬영 시점을 지정해 주세요.';
  }
  return `추가 촬영 필요: ${missingViews.map(getViewLabel).join(', ')}`;
};

const summarizeCaptureSession = (images, sessionId) => {
  if (!sessionId) {
    return {
      sessionId: undefined,
      status: 'needs_metadata',
      ready: false,
      imageCount: 0,
      physicalImageCount: 0,
      uniqueViewCount: 0,
      availableViews: [],
      requiredViews: [...BASE_REQUIRED_VIEWS],
      missingViews: [...BASE_REQUIRED_VIEWS],
      missingViewLabels: BASE_REQUIRED_VIEWS.map(getViewLabel),
      message: buildSessionMessage('needs_metadata', BASE_REQUIRED_VIEWS)
    };
  }

  const sessionImages = (Array.isArray(images) ? images : [])
    .filter(image => image?.captureSessionId === sessionId);
  const physicalImages = sessionImages.filter(
    image => normalizeImageKind(image?.captureImageKind) === 'physical_product'
  );
  const availableViews = normalizeViewTags(
    physicalImages.map(image => image?.captureViewTag)
  );
  const missingViews = BASE_REQUIRED_VIEWS.filter(
    view => !availableViews.includes(view)
  );

  let status = 'needs_views';
  if (sessionImages.length === 0) status = 'needs_metadata';
  else if (
    physicalImages.length === 0
    && sessionImages.every(
      image => normalizeImageKind(image?.captureImageKind) === 'document_or_diagram'
    )
  ) status = 'not_visually_verifiable';
  else if (missingViews.length === 0) status = 'ready';

  return {
    sessionId,
    status,
    ready: status === 'ready',
    imageCount: sessionImages.length,
    physicalImageCount: physicalImages.length,
    uniqueViewCount: availableViews.length,
    availableViews,
    requiredViews: [...BASE_REQUIRED_VIEWS],
    missingViews,
    missingViewLabels: missingViews.map(getViewLabel),
    message: buildSessionMessage(status, missingViews)
  };
};

const assessCaptureImageForDiagnosis = (image, images) => {
  const imageKind = normalizeImageKind(image?.captureImageKind);
  if (imageKind === 'document_or_diagram') {
    return {
      ...summarizeCaptureSession(images, image?.captureSessionId),
      status: 'not_visually_verifiable',
      ready: false,
      message: buildSessionMessage('not_visually_verifiable', [])
    };
  }

  if (
    imageKind !== 'physical_product'
    || !image?.captureSessionId
    || !normalizeViewTags(image?.captureViewTag).length
  ) {
    return {
      ...summarizeCaptureSession(images, image?.captureSessionId),
      status: 'needs_metadata',
      ready: false,
      message: buildSessionMessage('needs_metadata', BASE_REQUIRED_VIEWS)
    };
  }

  return summarizeCaptureSession(images, image.captureSessionId);
};

const buildCaptureMetadata = (image, images) => {
  const summary = summarizeCaptureSession(images, image?.captureSessionId);
  const recaptureSource = image?.recaptureSource || {};
  const hasRecaptureLineage = Boolean(
    compact(recaptureSource.localImageId)
    || compact(recaptureSource.commonAgentImageId)
    || compact(recaptureSource.reviewDecisionId)
  );
  return {
    capture_session_id: image?.captureSessionId,
    capture_view_tags: normalizeViewTags(image?.captureViewTag),
    vision_image_kind: normalizeImageKind(image?.captureImageKind),
    capture_source: normalizeCaptureSource(image?.captureSource),
    capture_protocol_ready: summary.ready,
    capture_available_views: summary.availableViews,
    capture_missing_views: summary.missingViews,
    ...(hasRecaptureLineage ? {
      recapture_lineage_protocol_version: 'vision-recapture-lineage/v1',
      recapture_source_local_image_id: compact(recaptureSource.localImageId),
      recapture_source_common_agent_image_id: compact(recaptureSource.commonAgentImageId),
      recapture_review_decision_id: compact(recaptureSource.reviewDecisionId),
      recapture_safety_gate_reasons: stringList(recaptureSource.safetyGateReasons),
      recapture_required_additional_views: stringList(recaptureSource.requiredAdditionalViews),
      recapture_bbox_grounding_profile_id: compact(recaptureSource.bboxGroundingProfileId)
    } : {})
  };
};

const collectSessionDiagnosisImages = (selectedImage, images, maxViews = 8) => {
  if (
    !selectedImage
    || !selectedImage.captureSessionId
    || normalizeImageKind(selectedImage.captureImageKind) !== 'physical_product'
  ) {
    return [];
  }

  const candidates = [selectedImage, ...(Array.isArray(images) ? images : [])];
  const viewLimit = Math.min(8, Math.max(2, Number(maxViews) || 8));
  const seenIds = new Set();
  const collected = [];
  for (const image of candidates) {
    if (
      !image?.id
      || seenIds.has(image.id)
      || image.captureSessionId !== selectedImage.captureSessionId
      || normalizeImageKind(image.captureImageKind) !== 'physical_product'
      || normalizeViewTags(image.captureViewTag).length === 0
    ) {
      continue;
    }
    seenIds.add(image.id);
    collected.push(image);
    if (collected.length >= viewLimit) break;
  }
  return collected;
};

const selectDiagnosisTargetIds = (images, selectedIds, busyIds = []) => {
  const imageById = new Map(
    (Array.isArray(images) ? images : [])
      .filter(image => image?.id)
      .map(image => [image.id, image])
  );
  const busySessionKeys = new Set(
    (Array.isArray(busyIds) ? busyIds : [])
      .map(id => imageById.get(id))
      .filter(Boolean)
      .map(image => image.captureSessionId || `image:${image.id}`)
  );
  const selectedSessionKeys = new Set();
  const targets = [];
  for (const id of Array.isArray(selectedIds) ? selectedIds : []) {
    const image = imageById.get(id);
    if (!image) continue;
    const sessionKey = image.captureSessionId || `image:${image.id}`;
    if (
      busySessionKeys.has(sessionKey)
      || selectedSessionKeys.has(sessionKey)
    ) {
      continue;
    }
    selectedSessionKeys.add(sessionKey);
    targets.push(image.id);
  }
  return targets;
};

module.exports = {
  CAPTURE_VIEW_OPTIONS,
  VALID_CAPTURE_SOURCES,
  VALID_IMAGE_KINDS,
  assessCaptureImageForDiagnosis,
  buildCaptureMetadata,
  buildRecaptureSourceFromReview,
  collectSessionDiagnosisImages,
  createCaptureSessionId,
  selectDiagnosisTargetIds,
  summarizeCaptureSession
};
