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

const uniqueStrings = values => [...new Set(stringList(values))];

const RECAPTURE_VIEW_PATTERNS = [
  ['full_part_context', /전체|전경|full[_\s-]*part|overview|wide[_\s-]*context/],
  ['defect_closeup', /근접|확대|bbox|roi|defect[_\s-]*close|결함\s*부위.*중앙/],
  ['oblique_light', /사선광|사광|광택|oblique|raking|side[_\s-]*light/],
  ['ejection_location', /밀핀|이젝|ejector|취출\s*(?:접촉|기능|위치)/],
  ['fill_end_context', /충전\s*말단|유동\s*말단|fill[_\s-]*end|flow[_\s-]*end|게이트.*말단|burn/],
  ['reference_part', /정상\s*품|정상품|기준품|비교품|reference|golden[_\s-]*sample/],
  ['vent_context', /벤트|가스\s*배출|vent|burn/],
  ['parting_line_context', /파팅|parting|인서트\s*경계/],
  ['edge_profile', /경계\s*측면|돌출\s*높이|측면에서|edge[_\s-]*profile/],
  ['reverse_geometry', /반대면|배면|후육|reverse|backside/],
  ['flow_convergence_context', /유동\s*합류|합류\s*위치|웰드|weld|flow[_\s-]*convergence/],
  ['release_sequence', /금형\s*개방|취출\s*완료|취출\s*전후|release[_\s-]*sequence|before[_\s-]*after[_\s-]*ejection/]
];

const inferRecaptureViewTags = source => {
  const explicitTags = normalizeViewTags(source?.requiredViewTags);
  const evidenceItems = [
    ...stringList(source?.requiredAdditionalViews),
    ...stringList(source?.safetyGateReasons),
    compact(source?.bboxGroundingProfileId)
  ].map(item => item.toLocaleLowerCase());
  const inferredTags = [];

  for (const [viewTag, pattern] of RECAPTURE_VIEW_PATTERNS) {
    if (evidenceItems.some(item => pattern.test(item))) inferredTags.push(viewTag);
  }

  const viewTags = normalizeViewTags([...explicitTags, ...inferredTags]);
  const hasRecaptureSignal = Boolean(
    compact(source?.localImageId)
    || compact(source?.commonAgentImageId)
    || compact(source?.reviewDecisionId)
    || compact(source?.workOrderId)
    || evidenceItems.some(Boolean)
  );
  return viewTags.length > 0
    ? viewTags
    : hasRecaptureSignal
      ? ['defect_closeup']
      : [];
};

const requiredRecaptureViews = source => normalizeViewTags([
  ...BASE_REQUIRED_VIEWS,
  ...normalizeViewTags(source?.requiredViewTags),
  ...inferRecaptureViewTags(source)
]);

const buildRecaptureSourceFromReview = ({
  image,
  analysis,
  reviewDecisionId,
  workOrderId,
  requiredViewTags
} = {}) => {
  const visionSummary = analysis?.visionSummary || image?.analysis?.visionSummary || {};
  const safetyGate = visionSummary?.safetyGate || {};
  const source = {
    localImageId: compact(image?.id),
    commonAgentImageId: compact(image?.commonAgentImageId),
    reviewDecisionId: compact(reviewDecisionId),
    safetyGateReasons: stringList(safetyGate?.reasons),
    requiredAdditionalViews: stringList(visionSummary?.requiredAdditionalViews),
    bboxGroundingProfileId: compact(safetyGate?.bboxGroundingProfileId),
    workOrderId: compact(workOrderId) || compact(reviewDecisionId),
    requiredViewTags: normalizeViewTags(requiredViewTags)
  };
  source.requiredViewTags = requiredRecaptureViews(source);
  return source;
};

const buildRecaptureCaptureGuidance = (source = {}) => {
  const reasonCodes = uniqueStrings(source?.safetyGateReasons);
  const sourceInstructions = uniqueStrings(source?.requiredAdditionalViews);
  const hasRecaptureSignal = Boolean(
    compact(source?.localImageId)
    || compact(source?.commonAgentImageId)
    || compact(source?.reviewDecisionId)
    || compact(source?.workOrderId)
    || compact(source?.bboxGroundingProfileId)
    || reasonCodes.length
    || sourceInstructions.length
  );
  const inferredViewTags = inferRecaptureViewTags(source);
  const recommendedViewTag = inferredViewTags.find(
    viewTag => !BASE_REQUIRED_VIEWS.includes(viewTag)
  ) || inferredViewTags.find(viewTag => viewTag === 'defect_closeup')
    || inferredViewTags[0]
    || 'defect_closeup';
  const requiredViewTags = requiredRecaptureViews(source);
  const view = VIEW_DEFINITIONS[recommendedViewTag];
  const instructions = uniqueStrings([
    ...sourceInstructions,
    view?.instruction
  ]);

  return {
    protocolVersion: 'vision-recapture-capture-guidance/v1',
    active: hasRecaptureSignal,
    recommendedViewTag,
    reasonCodes,
    instructions,
    requiredViewTags,
    message: hasRecaptureSignal
      ? `재촬영 권장 시점: ${view?.label || recommendedViewTag}`
      : '재촬영 연결 대기 없음'
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
    return '필수 촬영 시점이 충족되어 비전 진단을 실행할 수 있습니다.';
  }
  if (status === 'not_visually_verifiable') {
    return '문서나 도면이 아닌 실제 성형품 사진을 촬영해 주세요.';
  }
  if (status === 'needs_metadata') {
    return '촬영 세션, 이미지 종류와 촬영 시점을 지정해 주세요.';
  }
  return `추가 촬영 필요: ${missingViews.map(getViewLabel).join(', ')}`;
};

const requiredViewsForImages = (images, recaptureSource) => {
  const sources = (Array.isArray(images) ? images : [])
    .map(image => image?.recaptureSource)
    .filter(Boolean);
  if (recaptureSource) sources.push(recaptureSource);
  return normalizeViewTags([
    ...BASE_REQUIRED_VIEWS,
    ...sources.flatMap(requiredRecaptureViews)
  ]);
};

const summarizeCaptureSession = (images, sessionId, recaptureSource) => {
  const sessionImages = sessionId
    ? (Array.isArray(images) ? images : [])
      .filter(image => image?.captureSessionId === sessionId)
    : [];
  const requiredViews = requiredViewsForImages(sessionImages, recaptureSource);
  if (!sessionId) {
    return {
      sessionId: undefined,
      status: 'needs_metadata',
      ready: false,
      imageCount: 0,
      physicalImageCount: 0,
      uniqueViewCount: 0,
      availableViews: [],
      requiredViews,
      missingViews: requiredViews,
      missingViewLabels: requiredViews.map(getViewLabel),
      message: buildSessionMessage('needs_metadata', requiredViews)
    };
  }

  const physicalImages = sessionImages.filter(
    image => normalizeImageKind(image?.captureImageKind) === 'physical_product'
  );
  const availableViews = normalizeViewTags(
    physicalImages.map(image => image?.captureViewTag)
  );
  const missingViews = requiredViews.filter(
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
    requiredViews,
    missingViews,
    missingViewLabels: missingViews.map(getViewLabel),
    message: buildSessionMessage(status, missingViews)
  };
};

const buildCaptureEvidenceMergePlan = ({
  images,
  selectedIds,
  targetSessionId,
  fallbackSessionId,
  recaptureSource
} = {}) => {
  const selectedIdList = selectedIds instanceof Set
    ? stringList([...selectedIds])
    : stringList(selectedIds);
  const selectedIdSet = new Set(selectedIdList);
  const allImages = Array.isArray(images) ? images : [];
  const selectedImages = allImages.filter(
    image => image?.id && selectedIdSet.has(String(image.id))
  );
  const physicalImages = selectedImages.filter(
    image => normalizeImageKind(image?.captureImageKind) === 'physical_product'
  );
  const availableViews = normalizeViewTags(
    physicalImages.map(image => image?.captureViewTag)
  );
  const requiredViews = requiredViewsForImages(selectedImages, recaptureSource);
  const missingViews = requiredViews.filter(
    view => !availableViews.includes(view)
  );
  const safeTargetSessionId = compact(targetSessionId)
    || compact(selectedImages.find(image => image?.captureSessionId)?.captureSessionId)
    || compact(fallbackSessionId)
    || createCaptureSessionId('evidence-merge');
  const sessionIds = uniqueStrings(
    selectedImages.map(image => image?.captureSessionId)
  );
  const workOrderIds = uniqueStrings(selectedImages.map(image =>
    image?.recaptureSource?.workOrderId
    || image?.recaptureSource?.reviewDecisionId
  ));
  const workOrderConflict = workOrderIds.length > 1;
  const canMerge = selectedImages.length >= 2 && !workOrderConflict;
  const readyAfterMerge = canMerge
    && physicalImages.length >= 2
    && missingViews.length === 0;

  return {
    protocolVersion: 'capture-evidence-merge/v1',
    canMerge,
    targetSessionId: safeTargetSessionId,
    selectedCount: selectedImages.length,
    physicalImageCount: physicalImages.length,
    availableViews,
    requiredViews,
    missingViews,
    missingViewLabels: missingViews.map(getViewLabel),
    readyAfterMerge,
    changedImageIds: selectedImages
      .filter(image => image?.captureSessionId !== safeTargetSessionId)
      .map(image => image.id),
    sourceSessionIds: sessionIds,
    workOrderIds,
    workOrderConflict,
    message: workOrderConflict
      ? '서로 다른 재촬영 작업지시의 사진은 하나의 증거 세트로 통합할 수 없습니다.'
      : !canMerge
      ? 'Select at least 2 photos to merge as one evidence set.'
      : readyAfterMerge
        ? `Selected ${selectedImages.length} photos can be merged into one diagnosis-ready evidence set.`
        : `Selected photos can be merged, but required views are still missing: ${missingViews.map(getViewLabel).join(', ')}`
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
  const recaptureSource = image?.recaptureSource || {};
  const summary = summarizeCaptureSession(
    images,
    image?.captureSessionId,
    recaptureSource
  );
  const captureViewTags = normalizeViewTags(image?.captureViewTag);
  const hasRecaptureLineage = Boolean(
    compact(recaptureSource.localImageId)
    || compact(recaptureSource.commonAgentImageId)
    || compact(recaptureSource.reviewDecisionId)
    || compact(recaptureSource.workOrderId)
    || normalizeViewTags(recaptureSource.requiredViewTags).length
  );
  const recaptureGuidance = hasRecaptureLineage
    ? buildRecaptureCaptureGuidance(recaptureSource)
    : null;
  const recaptureGuidanceFulfilled = recaptureGuidance
    ? summary.ready && recaptureGuidance.requiredViewTags.every(
      viewTag => summary.availableViews.includes(viewTag)
    )
    : false;
  const recaptureGuidanceFulfillmentStatus = recaptureGuidanceFulfilled
    ? 'fulfilled'
    : captureViewTags.length === 0
      ? 'missing_view_tag'
      : 'view_mismatch';
  return {
    capture_session_id: image?.captureSessionId,
    capture_view_tags: captureViewTags,
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
      recapture_work_order_id: compact(recaptureSource.workOrderId),
      recapture_safety_gate_reasons: stringList(recaptureSource.safetyGateReasons),
      recapture_required_additional_views: stringList(recaptureSource.requiredAdditionalViews),
      recapture_required_view_tags: recaptureGuidance.requiredViewTags,
      recapture_bbox_grounding_profile_id: compact(recaptureSource.bboxGroundingProfileId),
      recapture_guidance_protocol_version: recaptureGuidance.protocolVersion,
      recapture_recommended_view_tag: recaptureGuidance.recommendedViewTag,
      recapture_guidance_message: recaptureGuidance.message,
      recapture_guidance_reason_codes: recaptureGuidance.reasonCodes,
      recapture_guidance_instructions: recaptureGuidance.instructions,
      recapture_actual_view_tags: captureViewTags,
      recapture_guidance_fulfilled: recaptureGuidanceFulfilled,
      recapture_guidance_fulfillment_status: recaptureGuidanceFulfillmentStatus,
      ...(!recaptureGuidanceFulfilled ? {
        recapture_missing_recommended_view_tag: recaptureGuidance.recommendedViewTag
      } : {})
    } : {})
  };
};

const resolveCaptureLearningEligibility = (reviewDecision, captureMetadata = {}) => {
  if (reviewDecision !== 'approved') {
    return {
      eligible: false,
      reason: 'hitl_not_approved'
    };
  }

  if (
    captureMetadata.recapture_lineage_protocol_version
    && captureMetadata.recapture_guidance_fulfilled !== true
  ) {
    return {
      eligible: false,
      reason: `recapture_guidance_${captureMetadata.recapture_guidance_fulfillment_status || 'not_fulfilled'}`
    };
  }

  if (captureMetadata.capture_protocol_ready === false) {
    return {
      eligible: false,
      reason: 'capture_protocol_not_ready'
    };
  }

  return {
    eligible: true,
    reason: 'approved_capture_ready'
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
  buildCaptureEvidenceMergePlan,
  buildCaptureMetadata,
  buildRecaptureCaptureGuidance,
  buildRecaptureSourceFromReview,
  collectSessionDiagnosisImages,
  createCaptureSessionId,
  inferRecaptureViewTags,
  resolveCaptureLearningEligibility,
  selectDiagnosisTargetIds,
  summarizeCaptureSession
};
