const crypto = require('node:crypto');
const { canonicalDefectClass } = require('./shared/defect-taxonomy');

const AUTHORIZATION_STATEMENT = 'I_CONFIRM_REFERENCE_BACKFILL_TARGETS';
const ALLOWED_CAPTURE_VIEW_TAGS = Object.freeze([
  'full_part_context',
  'defect_closeup',
  'oblique_light',
  'ejection_location',
  'fill_end_context',
  'reference_part',
  'vent_context',
  'parting_line_context',
  'edge_profile',
  'reverse_geometry',
  'flow_convergence_context',
  'release_sequence'
]);

const compact = value => String(value || '').replace(/\s+/g, ' ').trim();

const asArray = value => Array.isArray(value) ? value : [];

const stablePlanItem = item => ({
  imageId: compact(item?.imageId),
  fileName: compact(item?.fileName),
  status: compact(item?.status),
  defectType: compact(item?.defectType),
  defectClass: compact(item?.defectClass),
  visionPrimaryDefectType: compact(item?.visionPrimaryDefectType),
  visionPrimaryDefectClass: compact(item?.visionPrimaryDefectClass),
  observationContractVersion: compact(item?.observationContractVersion),
  imageKind: compact(item?.imageKind),
  normalityStatus: compact(item?.normalityStatus),
  captureSessionId: compact(item?.captureSessionId),
  captureViewTag: compact(item?.captureViewTag),
  captureProtocolReady: item?.captureProtocolReady === true,
  visualObservationCount: Number(item?.visualObservationCount) || 0,
  reasons: asArray(item?.reasons).map(compact).sort(),
  proposedReviewPayload: {
    decision: compact(item?.proposedReviewPayload?.decision),
    defect_type: compact(item?.proposedReviewPayload?.defect_type),
    observation_summary: compact(item?.proposedReviewPayload?.observation_summary),
    visible_features: asArray(item?.proposedReviewPayload?.visible_features).map(compact),
    labels: asArray(item?.proposedReviewPayload?.labels).map(compact).sort()
  }
});

const computeVisionReferenceBackfillDigest = plan => {
  const identity = {
    schemaVersion: Number(plan?.schemaVersion) || null,
    items: asArray(plan?.items)
      .map(stablePlanItem)
      .sort((left, right) => left.imageId.localeCompare(right.imageId))
  };
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(identity))
    .digest('hex');
};

const summarizeByClass = targets => Object.fromEntries(
  [...new Set(targets.map(item => item.defectClass))]
    .sort()
    .map(defectClass => [
      defectClass,
      targets.filter(item => item.defectClass === defectClass).length
    ])
);

const backfillTargets = plan => asArray(plan?.items)
  .filter(item => item?.status === 'needs_hitl_backfill')
  .filter(item => item?.proposedReviewPayload)
  .sort((left, right) =>
    compact(left.defectClass).localeCompare(compact(right.defectClass))
    || compact(left.imageId).localeCompare(compact(right.imageId))
  );

const buildVisionReferenceBackfillAuthorizationTemplate = ({
  plan,
  generatedAt = new Date().toISOString()
} = {}) => {
  const targets = backfillTargets(plan).map(item => ({
    targetId: `reference-backfill-${compact(item.imageId)}`,
    imageId: compact(item.imageId),
    fileName: compact(item.fileName),
    defectType: compact(item.defectType),
    defectClass: compact(item.defectClass),
    visionPrimaryDefectType: compact(item.visionPrimaryDefectType),
    visionPrimaryDefectClass: compact(item.visionPrimaryDefectClass),
    observationContractVersion: compact(item.observationContractVersion),
    imageKind: compact(item.imageKind),
    normalityStatus: compact(item.normalityStatus),
    captureSessionId: compact(item.captureSessionId),
    captureViewTag: compact(item.captureViewTag),
    availableCaptureViewTags: asArray(item.availableCaptureViewTags).map(compact),
    missingCaptureViewTags: asArray(item.missingCaptureViewTags).map(compact),
    reasons: asArray(item.reasons).map(compact),
    proposedReviewPayload: item.proposedReviewPayload,
    decision: 'pending',
    manufacturingImageConfirmed: false,
    defectVisibleConfirmed: false,
    labelConfirmed: false,
    v2ObservationConfirmed: false,
    captureProtocolConfirmed: false,
    approvedDefectType: compact(item.defectType),
    approvedCaptureSessionId: compact(item.captureSessionId),
    approvedCaptureViewTag: compact(item.captureViewTag),
    reviewComment: ''
  }));
  const backfillPlanDigest = computeVisionReferenceBackfillDigest(plan);

  return {
    schemaVersion: 1,
    authorizationId: `vision-reference-backfill-${backfillPlanDigest.slice(0, 16)}`,
    generatedAt,
    backfillPlanDigest,
    authorizationStatement: 'PENDING_HUMAN_REVIEW',
    authorizedBy: '',
    authorizedAt: '',
    instructions: [
      'Open each Common Agent image before approving a target.',
      'Approve only when the image is a physical manufacturing product and the defect is visible.',
      'Confirm the final defect label, v2 observation summary/features, and capture protocol metadata.',
      `Set authorizationStatement to ${AUTHORIZATION_STATEMENT} after every selected target is reviewed.`,
      'This template generates a dry-run write plan only; it does not write to Common Agent by itself.'
    ],
    summary: {
      totalTargets: targets.length,
      targetsByClass: summarizeByClass(targets),
      writesPerformed: false
    },
    targets
  };
};

const requireAuthorizationHeader = (authorization, expectedDigest) => {
  if (!authorization || Number(authorization.schemaVersion) !== 1) {
    throw new Error('Vision reference backfill authorization schemaVersion must be 1.');
  }
  if (compact(authorization.backfillPlanDigest).toLowerCase() !== expectedDigest) {
    throw new Error('Vision reference backfill digest does not match the current plan.');
  }
  if (compact(authorization.authorizationStatement) !== AUTHORIZATION_STATEMENT) {
    throw new Error(`authorizationStatement must be ${AUTHORIZATION_STATEMENT}.`);
  }
  if (compact(authorization.authorizedBy).length < 2) {
    throw new Error('authorizedBy must identify the human reviewer.');
  }
  if (!Number.isFinite(Date.parse(String(authorization.authorizedAt || '')))) {
    throw new Error('authorizedAt must be a valid human-review timestamp.');
  }
};

const targetByImageId = plan => new Map(
  backfillTargets(plan).map(item => [compact(item.imageId), item])
);

const assertConfirmed = (target, field, index) => {
  if (target?.[field] !== true) {
    throw new Error(`targets[${index}] ${field} confirmation is required.`);
  }
};

const withAuthorizedMetadata = ({
  payload,
  target,
  authorizedBy,
  authorizedAt,
  approvedCaptureSessionId,
  approvedCaptureViewTag
}) => ({
  ...payload,
  defect_type: compact(target.approvedDefectType),
  labels: Array.from(new Set([
    compact(target.approvedDefectType),
    ...asArray(payload.labels).map(compact)
  ].filter(Boolean))),
  metadata: {
    ...(payload.metadata || {}),
    source_app: 'mold-master-ai',
    reference_backfill_human_authorized: true,
    reference_backfill_authorized_by: authorizedBy,
    reference_backfill_authorized_at: authorizedAt,
    capture_session_id: approvedCaptureSessionId,
    capture_view_tag: approvedCaptureViewTag,
    capture_protocol_ready: true,
    learning_candidate_eligible: true,
    proposed_contract_version: 'vision-observation/v2',
    proposed_image_kind: 'physical_product',
    proposed_normality_status: 'defect_visible'
  },
  comment: [
    compact(payload.comment),
    `Human reference backfill authorization by ${authorizedBy}.`,
    compact(target.reviewComment)
  ].filter(Boolean).join(' ')
});

const validateVisionReferenceBackfillAuthorization = ({
  authorization,
  plan
} = {}) => {
  const expectedDigest = computeVisionReferenceBackfillDigest(plan);
  requireAuthorizationHeader(authorization, expectedDigest);
  const targets = asArray(authorization.targets);
  if (targets.length === 0) {
    throw new Error('Vision reference backfill authorization must include at least one target.');
  }

  const planTargets = targetByImageId(plan);
  const seen = new Set();
  const authorizedBy = compact(authorization.authorizedBy);
  const authorizedAt = new Date(authorization.authorizedAt).toISOString();

  const validatedTargets = targets.map((target, index) => {
    const prefix = `targets[${index}]`;
    const imageId = compact(target?.imageId);
    if (!imageId || !planTargets.has(imageId)) {
      throw new Error(`${prefix} is not a HITL backfill target in the bound plan.`);
    }
    if (seen.has(imageId)) {
      throw new Error(`${prefix} has a duplicate imageId.`);
    }
    seen.add(imageId);
    const planItem = planTargets.get(imageId);

    if (compact(target.decision) !== 'approve_backfill') {
      throw new Error(`${prefix} decision must be approve_backfill.`);
    }
    assertConfirmed(target, 'manufacturingImageConfirmed', index);
    assertConfirmed(target, 'defectVisibleConfirmed', index);
    assertConfirmed(target, 'labelConfirmed', index);
    assertConfirmed(target, 'v2ObservationConfirmed', index);
    assertConfirmed(target, 'captureProtocolConfirmed', index);

    const approvedDefectType = compact(target.approvedDefectType);
    if (
      !approvedDefectType
      || canonicalDefectClass(approvedDefectType) !== compact(planItem.defectClass)
    ) {
      throw new Error(`${prefix} approved label does not match the backfill target class.`);
    }
    const approvedCaptureSessionId = compact(target.approvedCaptureSessionId);
    if (approvedCaptureSessionId.length < 3) {
      throw new Error(`${prefix} approvedCaptureSessionId is required.`);
    }
    const approvedCaptureViewTag = compact(target.approvedCaptureViewTag);
    if (!ALLOWED_CAPTURE_VIEW_TAGS.includes(approvedCaptureViewTag)) {
      throw new Error(`${prefix} approvedCaptureViewTag must be one of ${ALLOWED_CAPTURE_VIEW_TAGS.join(', ')}.`);
    }
    if (compact(target.reviewComment).length < 8) {
      throw new Error(`${prefix} reviewComment must describe the human verification.`);
    }

    return {
      imageId,
      defectType: approvedDefectType,
      defectClass: canonicalDefectClass(approvedDefectType),
      authorizedBy,
      authorizedAt,
      reviewComment: compact(target.reviewComment),
      reviewPayload: withAuthorizedMetadata({
        payload: planItem.proposedReviewPayload,
        target: {
          ...target,
          approvedDefectType
        },
        authorizedBy,
        authorizedAt,
        approvedCaptureSessionId,
        approvedCaptureViewTag
      })
    };
  });

  return {
    authorizationId: compact(authorization.authorizationId),
    authorizedBy,
    authorizedAt,
    backfillPlanDigest: expectedDigest,
    serviceWritesPerformed: false,
    targets: validatedTargets
  };
};

module.exports = {
  ALLOWED_CAPTURE_VIEW_TAGS,
  AUTHORIZATION_STATEMENT,
  buildVisionReferenceBackfillAuthorizationTemplate,
  computeVisionReferenceBackfillDigest,
  validateVisionReferenceBackfillAuthorization
};
