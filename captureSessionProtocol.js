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
  return {
    capture_session_id: image?.captureSessionId,
    capture_view_tags: normalizeViewTags(image?.captureViewTag),
    vision_image_kind: normalizeImageKind(image?.captureImageKind),
    capture_source: normalizeCaptureSource(image?.captureSource),
    capture_protocol_ready: summary.ready,
    capture_available_views: summary.availableViews,
    capture_missing_views: summary.missingViews
  };
};

module.exports = {
  CAPTURE_VIEW_OPTIONS,
  VALID_CAPTURE_SOURCES,
  VALID_IMAGE_KINDS,
  assessCaptureImageForDiagnosis,
  buildCaptureMetadata,
  createCaptureSessionId,
  summarizeCaptureSession
};
