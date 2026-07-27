const {
  canonicalDefectClass,
  isClassifiableDefectLabel
} = require('./shared/defect-taxonomy');
const { normalizeVisionObservation } = require('./visionObservation');

const REQUIRED_CAPTURE_VIEW_TAGS = Object.freeze([
  'full_part_context',
  'defect_closeup'
]);

const compact = value => String(value || '').replace(/\s+/g, ' ').trim();

const asArray = value => Array.isArray(value) ? value : [];

const unique = values => [...new Set(values.map(compact).filter(Boolean))];

const normalizeBool = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = compact(value).toLocaleLowerCase();
  if (['1', 'true', 'yes', 'y', 'on', 'ready'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off', 'blocked'].includes(normalized)) return false;
  return fallback;
};

const metadataValue = (item, ...keys) => {
  const metadata = item?.metadata || item?.raw?.metadata || {};
  for (const key of keys) {
    const value = item?.[key] ?? metadata?.[key] ?? item?.raw?.[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
};

const metadataString = (item, ...keys) => compact(metadataValue(item, ...keys));

const metadataBool = (item, key, fallback = false) =>
  normalizeBool(metadataValue(item, key), fallback);

const itemObservationSource = item =>
  item?.observation || item?.raw?.observation || null;

const buildObservationInput = item => {
  const observation = itemObservationSource(item);
  if (!observation && !item?.observation_summary && asArray(item?.visible_features).length === 0) {
    return null;
  }
  return {
    ...(observation || {}),
    summary: observation?.summary || item?.observation_summary || item?.answer_preview || '',
    defect_type: observation?.defect_type || item?.defect_type,
    process_area: observation?.process_area || item?.process_area,
    severity: observation?.severity || item?.severity,
    visible_features: observation?.visible_features || item?.visible_features || [],
    possible_causes: observation?.possible_causes || item?.possible_causes || [],
    recommended_checks: observation?.recommended_checks || item?.recommended_checks || [],
    labels: observation?.labels || item?.labels || [],
    confidence: observation?.confidence ?? item?.vision_confidence ?? item?.confidence,
    candidates: observation?.candidates || item?.candidates || [],
    top_candidates: observation?.top_candidates || item?.top_candidates || []
  };
};

const summarizeObservation = (item, normalized) => compact(
  itemObservationSource(item)?.summary
  || item?.observation_summary
  || normalized.visibleFeatures.join('; ')
  || normalized.primaryCandidate?.defectType
  || ''
);

const defectClassesConflict = (sourceDefectType, visionDefectType) => {
  if (!isClassifiableDefectLabel(sourceDefectType) || !isClassifiableDefectLabel(visionDefectType)) {
    return false;
  }
  return canonicalDefectClass(sourceDefectType) !== canonicalDefectClass(visionDefectType);
};

const buildProposedReviewPayload = ({ item, normalized, generatedAt }) => {
  const defectType = compact(item?.defect_type || normalized.primaryCandidate?.defectType);
  return {
    decision: 'edit',
    defect_type: defectType,
    observation_summary: summarizeObservation(item, normalized),
    visible_features: normalized.visibleFeatures,
    possible_causes: asArray(itemObservationSource(item)?.possible_causes || item?.possible_causes)
      .map(compact)
      .filter(Boolean),
    recommended_checks: asArray(itemObservationSource(item)?.recommended_checks || item?.recommended_checks)
      .map(compact)
      .filter(Boolean),
    labels: unique([...(item?.labels || []), defectType]),
    process_area: compact(item?.process_area || itemObservationSource(item)?.process_area || 'injection-molding'),
    severity: compact(item?.severity || itemObservationSource(item)?.severity),
    promote_to_graph: false,
    force_promote: false,
    metadata: {
      source_app: 'mold-master-ai',
      reference_backfill_dry_run: true,
      vision_backfill_plan_generated_at: generatedAt,
      proposed_contract_version: 'vision-observation/v2',
      proposed_image_kind: 'physical_product',
      proposed_normality_status: 'defect_visible',
      learning_candidate_review_required: true
    },
    comment: [
      'Mold Master AI dry-run Vision reference backfill plan.',
      'Human reviewer must verify the image, defect label, required views, and v2 visual observations before learning promotion.'
    ].join(' ')
  };
};

const hardBlockerReasons = new Set([
  'not_approved',
  'recapture_required',
  'learning_candidate_ineligible',
  'missing_defect_type',
  'missing_vision_observation',
  'non_physical_image',
  'defect_not_visible',
  'unclassifiable_defect_label',
  'label_conflict',
  'vision_safety_gate_blocked'
]);

const initialEntryForItem = ({ item, generatedAt }) => {
  const observationInput = buildObservationInput(item);
  const normalized = observationInput
    ? normalizeVisionObservation(observationInput)
    : normalizeVisionObservation({});
  const reasons = [];
  const defectType = compact(item?.defect_type || normalized.primaryCandidate?.defectType);

  if (compact(item?.review_status) !== 'approved') reasons.push('not_approved');
  if (metadataBool(item, 'recapture_required')) reasons.push('recapture_required');
  if (metadataBool(item, 'learning_candidate_eligible', true) === false) {
    reasons.push('learning_candidate_ineligible');
  }
  if (!defectType) reasons.push('missing_defect_type');
  if (!observationInput) reasons.push('missing_vision_observation');
  if (defectType && !isClassifiableDefectLabel(defectType)) {
    reasons.push('unclassifiable_defect_label');
  }

  if (observationInput && normalized.contractVersion !== 'vision-observation/v2') {
    reasons.push('legacy_vision_contract');
  }
  if (normalized.contractVersion === 'vision-observation/v2') {
    if (normalized.imageKind !== 'physical_product') reasons.push('non_physical_image');
    if (normalized.normalityStatus !== 'defect_visible') reasons.push('defect_not_visible');
  }

  const captureSessionId = metadataString(item, 'capture_session_id', 'session_id');
  const captureViewTag = metadataString(item, 'capture_view_tag', 'view_tag');
  if (!captureSessionId) reasons.push('missing_capture_session');
  if (!captureViewTag) reasons.push('missing_capture_view_tag');
  if (!metadataBool(item, 'capture_protocol_ready')) reasons.push('capture_protocol_not_ready');

  const primaryDefectType = compact(normalized.primaryCandidate?.defectType);
  if (defectClassesConflict(defectType, primaryDefectType)) {
    reasons.push('label_conflict');
  }

  return {
    imageId: compact(item?.image_id || item?.imageId),
    fileName: compact(item?.file_name || item?.fileName),
    reviewStatus: compact(item?.review_status),
    defectType,
    defectClass: canonicalDefectClass(defectType),
    visionPrimaryDefectType: primaryDefectType,
    visionPrimaryDefectClass: primaryDefectType ? canonicalDefectClass(primaryDefectType) : 'unclassified',
    captureSessionId,
    captureViewTag,
    captureProtocolReady: metadataBool(item, 'capture_protocol_ready'),
    observationContractVersion: normalized.contractVersion,
    imageKind: normalized.imageKind,
    normalityStatus: normalized.normalityStatus,
    visionSafetyGate: normalized.safetyGate,
    visualObservationCount: normalized.visualObservations.length,
    reasons,
    proposedReviewPayload: null,
    serviceWriteAllowed: false,
    _item: item,
    _normalized: normalized
  };
};

const sessionViewMap = entries => {
  const bySession = new Map();
  for (const entry of entries) {
    if (!entry.captureSessionId || !entry.captureViewTag) continue;
    if (!bySession.has(entry.captureSessionId)) bySession.set(entry.captureSessionId, new Set());
    bySession.get(entry.captureSessionId).add(entry.captureViewTag);
  }
  return bySession;
};

const addSessionViewReasons = (entries, requiredViewTags) => {
  const viewsBySession = sessionViewMap(entries);
  for (const entry of entries) {
    if (!entry.captureSessionId) continue;
    const views = viewsBySession.get(entry.captureSessionId) || new Set();
    const missing = requiredViewTags.filter(tag => !views.has(tag));
    if (missing.length > 0) entry.reasons.push('missing_required_views');
    entry.availableCaptureViewTags = [...views].sort();
    entry.missingCaptureViewTags = missing;
  }
};

const finalizeEntry = ({ entry, generatedAt }) => {
  const safetyStatus = entry.visionSafetyGate?.status;
  if (safetyStatus === 'blocked') {
    entry.reasons.push('vision_safety_gate_blocked');
  } else if (safetyStatus === 'needs_review') {
    entry.reasons.push('vision_safety_gate_requires_review');
  }
  entry.reasons = unique(entry.reasons);

  const blocked = entry.reasons.some(reason => hardBlockerReasons.has(reason));
  entry.status = blocked
    ? 'blocked'
    : entry.reasons.length > 0
      ? 'needs_hitl_backfill'
      : 'eligible_reference_candidate';
  if (entry.status === 'needs_hitl_backfill') {
    entry.proposedReviewPayload = buildProposedReviewPayload({
      item: entry._item,
      normalized: entry._normalized,
      generatedAt
    });
  }
  delete entry._item;
  delete entry._normalized;
  return entry;
};

const countBy = (items, selector) => items.reduce((counts, item) => {
  const key = selector(item);
  counts[key] = (counts[key] || 0) + 1;
  return counts;
}, {});

const reasonCounts = items => items.reduce((counts, item) => {
  for (const reason of item.reasons) {
    counts[reason] = (counts[reason] || 0) + 1;
  }
  return counts;
}, {});

const buildRecommendedAction = summary => {
  if (summary.eligibleReferenceCandidates > 0 && summary.needsHitlBackfill === 0 && summary.blocked === 0) {
    return 'Run the Common Agent Vision reference refresh, then benchmark the promoted reference store.';
  }
  if (summary.needsHitlBackfill > 0) {
    return 'Review the HITL backfill targets, recapture missing required views, then approve v2 observations before reference refresh.';
  }
  if (summary.blocked > 0) {
    return 'Resolve blocked image labels, recapture requests, or non-physical inputs before using them for Vision reference learning.';
  }
  return 'Add approved physical-product Vision images with full_part_context and defect_closeup views.';
};

const buildVisionReferenceBackfillPlan = ({
  items = [],
  generatedAt = new Date().toISOString(),
  requiredViewTags = REQUIRED_CAPTURE_VIEW_TAGS
} = {}) => {
  const requiredTags = [...requiredViewTags];
  const entries = asArray(items).map(item => initialEntryForItem({ item, generatedAt }));
  addSessionViewReasons(entries, requiredTags);
  const finalized = entries.map(entry => finalizeEntry({ entry, generatedAt }));
  const statusCounts = countBy(finalized, item => item.status);
  const summary = {
    total: finalized.length,
    eligibleReferenceCandidates: statusCounts.eligible_reference_candidate || 0,
    needsHitlBackfill: statusCounts.needs_hitl_backfill || 0,
    blocked: statusCounts.blocked || 0,
    requiredCaptureViewTags: requiredTags,
    reasonCounts: reasonCounts(finalized)
  };

  return {
    schemaVersion: 1,
    generatedAt,
    status: summary.eligibleReferenceCandidates > 0 && summary.needsHitlBackfill === 0 && summary.blocked === 0
      ? 'ready'
      : finalized.length > 0
        ? 'action_required'
        : 'empty',
    serviceWritesPerformed: false,
    localArtifactsWritten: true,
    summary,
    items: finalized,
    recommendedAction: buildRecommendedAction(summary)
  };
};

module.exports = {
  REQUIRED_CAPTURE_VIEW_TAGS,
  buildVisionReferenceBackfillPlan
};
