const {
  canonicalDefectClass,
  isClassifiableDefectLabel
} = require('./shared/defect-taxonomy');

const REVIEW_PROTOCOL_VERSION = 'vision-hitl-review/v1';

const compact = value => String(value || '').replace(/\s+/g, ' ').trim();

const asArray = value => Array.isArray(value)
  ? value
  : value === undefined || value === null || value === ''
    ? []
    : [value];

const unique = values => [...new Set(values.map(compact).filter(Boolean))];

const normalizeBool = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = compact(value).toLocaleLowerCase();
  if (['1', 'true', 'yes', 'y', 'on', 'ready'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off', 'blocked'].includes(normalized)) return false;
  return fallback;
};

const metadataFor = item => item?.metadata || item?.raw?.metadata || {};

const metadataValue = (item, ...keys) => {
  const metadata = metadataFor(item);
  for (const key of keys) {
    const value = item?.[key] ?? metadata?.[key] ?? item?.raw?.[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
};

const metadataString = (item, ...keys) => compact(metadataValue(item, ...keys));

const metadataBool = (item, key, fallback = false) =>
  normalizeBool(metadataValue(item, key), fallback);

const hitlProtocolVersion = item => metadataString(item, 'vision_review_protocol_version');

const hitlQueue = item => metadataString(item, 'vision_review_re_evaluation_queue');

const hitlDecision = item => metadataString(
  item,
  'vision_review_decision',
  'human_review_decision'
);

const correctedAnalysis = item => metadataFor(item).corrected_analysis || {};

const defectTypeFor = item => compact(
  correctedAnalysis(item).defectType
  || correctedAnalysis(item).defect_type
  || item?.defect_type
  || item?.observation?.defect_type
);

const contentHashFor = item => metadataString(
  item,
  'content_sha256',
  'content_hash'
);

const captureViewsFor = item => unique([
  ...asArray(metadataValue(item, 'capture_view_tags')),
  metadataString(item, 'capture_view_tag', 'view_tag')
]);

const buildInputNotes = item => unique([
  correctedAnalysis(item).description,
  item?.observation_summary,
  item?.question,
  metadataFor(item).review_comment
]).join(' / ');

const buildCaptureProtocol = item => ({
  imageKind: metadataString(item, 'vision_image_kind') || 'physical_product',
  availableViews: captureViewsFor(item),
  roiConfirmed: metadataBool(item, 'roi_confirmed', false),
  metadataSource: 'vision-hitl-review'
});

const buildBenchmarkCaseCandidate = (entry, item) => ({
  id: `hitl-recheck-${entry.imageId}`,
  title: `${entry.defectType} HITL corrected Vision recheck`,
  commonAgentImageId: entry.imageId,
  fileName: compact(item?.file_name || item?.fileName),
  mimeType: compact(item?.mime_type || item?.mimeType) || 'image/png',
  contentHash: entry.contentSha256,
  inputNotes: buildInputNotes(item),
  captureProtocol: buildCaptureProtocol(item),
  expected: {
    defectType: entry.defectType,
    defectClass: entry.defectClass,
    possibleCauseKeywords: [],
    countermeasureKeywords: [],
    minEvidenceCount: 1
  },
  sourceReview: {
    reviewDecision: entry.reviewDecision,
    reviewQueue: entry.reviewQueue,
    reviewReason: entry.reviewReason,
    graphPromotionAllowed: entry.graphPromotionAllowed,
    learningCandidateEligible: entry.learningCandidateEligible,
    localLearningVerified: metadataBool(item, 'vision_local_learning_verified', false)
  },
  status: 'active',
  tags: [
    'hitl-corrected-recheck',
    'vision',
    'shadow-benchmark',
    `defect-${entry.defectClass}`
  ]
});

const classifyEntry = (entry, item) => {
  const reasons = [];
  if (!entry.imageId) reasons.push('missing_image_id');
  if (!entry.contentSha256) reasons.push('missing_content_sha256');
  if (!isClassifiableDefectLabel(entry.defectType)) {
    reasons.push('unclassifiable_defect_label');
  }
  if (entry.learningCandidateEligible) {
    reasons.push('learning_candidate_must_remain_false');
  }
  if (entry.graphPromotionAllowed) {
    reasons.push('graph_promotion_must_remain_false_for_recheck');
  }

  if (entry.reviewQueue === 'vision_recapture_required') {
    return {
      status: 'waiting_for_recapture',
      reasons: unique(['recapture_required']),
      benchmarkCaseCandidate: null
    };
  }
  if (entry.reviewQueue === 'vision_rejected_archive') {
    return {
      status: 'excluded_rejected',
      reasons: unique(['human_rejected']),
      benchmarkCaseCandidate: null
    };
  }
  if (entry.reviewQueue === 'vision_human_review_pending') {
    return {
      status: 'pending_human_review',
      reasons: unique(['human_review_pending']),
      benchmarkCaseCandidate: null
    };
  }
  if (entry.reviewQueue !== 'vision_candidate_recheck') {
    return {
      status: 'blocked',
      reasons: unique([...reasons, 'unknown_re_evaluation_queue']),
      benchmarkCaseCandidate: null
    };
  }
  if (reasons.length > 0) {
    return {
      status: 'blocked',
      reasons: unique(reasons),
      benchmarkCaseCandidate: null
    };
  }
  return {
    status: 'ready_for_shadow_recheck',
    reasons: [],
    benchmarkCaseCandidate: buildBenchmarkCaseCandidate(entry, item)
  };
};

const entryForItem = (item, generatedAt) => {
  const metadata = metadataFor(item);
  const defectType = defectTypeFor(item);
  const reviewQueue = hitlQueue(item);
  const learningCandidateEligible = metadataBool(item, 'vision_learning_candidate_eligible', false)
    || metadataBool(item, 'learning_candidate_eligible', false);
  const graphPromotionAllowed = metadataBool(item, 'vision_graph_promotion_allowed', false);
  const baseEntry = {
    imageId: compact(item?.image_id || item?.imageId),
    fileName: compact(item?.file_name || item?.fileName),
    reviewStatus: compact(item?.review_status),
    reviewDecision: hitlDecision(item),
    reviewQueue,
    reviewNextAction: metadataString(item, 'vision_review_next_action'),
    reviewReason: metadataString(item, 'vision_review_re_evaluation_reason'),
    defectType,
    defectClass: canonicalDefectClass(defectType),
    contentSha256: contentHashFor(item),
    graphPromotionAllowed,
    graphPromotionBlocked: metadataBool(item, 'vision_graph_promotion_blocked', !graphPromotionAllowed),
    graphPromotionBlockReason: metadataString(item, 'vision_graph_promotion_block_reason'),
    learningCandidateEligible,
    requiredAdditionalViews: asArray(metadata.vision_required_additional_views).map(compact).filter(Boolean),
    qualityConcerns: asArray(metadata.vision_quality_concerns).map(compact).filter(Boolean),
    generatedAt,
    serviceWriteAllowed: false
  };
  const classification = classifyEntry(baseEntry, item);
  return {
    ...baseEntry,
    ...classification
  };
};

const countBy = (items, selector) => items.reduce((counts, item) => {
  const key = selector(item);
  counts[key] = (counts[key] || 0) + 1;
  return counts;
}, {});

const reasonCounts = items => items.reduce((counts, item) => {
  for (const reason of item.reasons || []) {
    counts[reason] = (counts[reason] || 0) + 1;
  }
  return counts;
}, {});

const buildRecommendedAction = summary => {
  if (summary.readyForShadowRecheck > 0) {
    return 'Run the generated HITL recheck Vision benchmark manifest, then review failures before refreshing the Vision reference store.';
  }
  if (summary.waitingForRecapture > 0) {
    return 'Recapture the requested additional views before adding these images to a Vision benchmark or reference store.';
  }
  if (summary.pendingHumanReview > 0) {
    return 'Finish pending HITL reviews before creating shadow recheck benchmark cases.';
  }
  if (summary.blocked > 0) {
    return 'Resolve blocked HITL metadata, missing image IDs, content hashes, or unsafe learning flags.';
  }
  return 'No HITL Vision re-evaluation records were found.';
};

const buildVisionHitlReevaluationPlan = ({
  items = [],
  generatedAt = new Date().toISOString()
} = {}) => {
  const hitlItems = asArray(items).filter(item =>
    hitlProtocolVersion(item) === REVIEW_PROTOCOL_VERSION
    || hitlQueue(item)
  );
  const entries = hitlItems.map(item => entryForItem(item, generatedAt));
  const statusCounts = countBy(entries, item => item.status);
  const summary = {
    totalInputItems: asArray(items).length,
    totalHitlReviewItems: entries.length,
    readyForShadowRecheck: statusCounts.ready_for_shadow_recheck || 0,
    waitingForRecapture: statusCounts.waiting_for_recapture || 0,
    pendingHumanReview: statusCounts.pending_human_review || 0,
    excludedRejected: statusCounts.excluded_rejected || 0,
    blocked: statusCounts.blocked || 0,
    queueCounts: countBy(entries, item => item.reviewQueue || 'missing_queue'),
    reasonCounts: reasonCounts(entries)
  };
  const status = summary.readyForShadowRecheck > 0 && summary.blocked === 0
    ? 'ready_for_recheck'
    : entries.length === 0
      ? 'empty'
      : 'action_required';

  return {
    schemaVersion: 1,
    generatedAt,
    status,
    serviceWritesPerformed: false,
    localArtifactsWritten: true,
    summary,
    items: entries,
    recommendedAction: buildRecommendedAction(summary)
  };
};

const buildVisionHitlReevaluationManifest = plan => ({
  version: 1,
  generatedAt: plan?.generatedAt || new Date().toISOString(),
  source: REVIEW_PROTOCOL_VERSION,
  minimumSamples: Math.max(1, Number(plan?.summary?.readyForShadowRecheck) || 0),
  evaluationGate: {
    minimumSamplesPerClass: 1,
    minimumVisionConfidence: 0.5,
    minimumConfidentRate: 0,
    minimumClassAccuracy: 0,
    minimumTop3Accuracy: 0,
    minimumSelectiveAccuracy: 0,
    minimumSelectiveCoverage: 0,
    maximumUnsafeErrorRate: 100,
    maximumCalibrationError: 100,
    minimumQualityEligibleRate: 0,
    minimumVisionContractComplianceRate: 0,
    minimumCaptureProtocolReadyRate: 0
  },
  qualityIssues: [],
  cases: asArray(plan?.items)
    .filter(item => item.status === 'ready_for_shadow_recheck' && item.benchmarkCaseCandidate)
    .map(item => item.benchmarkCaseCandidate)
});

module.exports = {
  REVIEW_PROTOCOL_VERSION,
  buildVisionHitlReevaluationManifest,
  buildVisionHitlReevaluationPlan
};
