const {
  VISION_OBSERVATION_JSON_SCHEMA
} = require('./visionStructuredOutputSchema');

const compact = value => String(value || '').replace(/\s+/g, ' ').trim();

const normalizedKey = value => compact(value)
  .toLocaleLowerCase()
  .replace(/[\s()[\]{}_\-.,:;/'"]/g, '');

const confidenceValue = value => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  const normalized = numeric > 1 && numeric <= 100 ? numeric / 100 : numeric;
  return Math.min(1, Math.max(0, normalized));
};

const clampScore = value => Math.min(100, Math.max(0, Math.round(value)));

const stringList = value => (Array.isArray(value) ? value : [])
  .map(compact)
  .filter(Boolean);

const isUnclassifiableLabel = value => {
  const normalized = normalizedKey(value);
  return [
    'unknown',
    'unclassified',
    '판정불가',
    '분류불가',
    '미판정',
    '불분명',
    '확인불가',
    '결함미확인'
  ].some(marker => normalized.includes(normalizedKey(marker)));
};

const VALID_OBSERVATION_CATEGORIES = new Set([
  'color',
  'boundary',
  'geometry',
  'surface',
  'location',
  'repetition',
  'orientation',
  'contrast',
  'other'
]);

const VALID_IMAGE_KINDS = new Set([
  'physical_product',
  'document_or_diagram',
  'unknown'
]);

const VALID_NORMALITY_STATUSES = new Set([
  'defect_visible',
  'no_defect_visible',
  'uncertain'
]);

const validateAgainstSchema = (schema, value, path = '') => {
  const errors = [];
  const location = path || 'root';
  if (!schema) return errors;

  const valueType = Array.isArray(value) ? 'array' : typeof value;
  if (schema.type && valueType !== schema.type) {
    errors.push(`invalid_type:${location}`);
    return errors;
  }

  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`invalid_enum:${location}`);
  }

  if (schema.type === 'string' && schema.minLength !== undefined && compact(value).length < schema.minLength) {
    errors.push(`min_length:${location}`);
  }

  if (schema.type === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`minimum:${location}`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`maximum:${location}`);
  }

  if (schema.type === 'array') {
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      errors.push(`max_items:${location}`);
    }
    value.forEach((item, index) => {
      errors.push(...validateAgainstSchema(schema.items, item, `${location}[${index}]`));
    });
  }

  if (schema.type === 'object') {
    const keys = Object.keys(value || {});
    for (const requiredKey of schema.required || []) {
      if (!Object.prototype.hasOwnProperty.call(value, requiredKey)) {
        errors.push(`missing_required:${path ? `${path}.` : ''}${requiredKey}`);
      }
    }
    if (schema.additionalProperties === false) {
      for (const key of keys) {
        if (!Object.prototype.hasOwnProperty.call(schema.properties || {}, key)) {
          errors.push(`additional_property:${path ? `${path}.` : ''}${key}`);
        }
      }
    }
    for (const [key, childSchema] of Object.entries(schema.properties || {})) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        errors.push(...validateAgainstSchema(childSchema, value[key], path ? `${path}.${key}` : key));
      }
    }
  }

  return errors;
};

const validateVisionObservationProviderPayload = payload => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return ['provider_contract_json_parse_failed'];
  }
  return validateAgainstSchema(VISION_OBSERVATION_JSON_SCHEMA, payload)
    .filter(error => error !== 'invalid_type:root');
};

const safeEnumValue = (value, allowed, fallback) => {
  const text = compact(value);
  return allowed.has(text) ? text : fallback;
};

const providerContractBlockedPayload = (payload, errors) => ({
  contract_version: 'vision-observation/v2',
  image_kind: safeEnumValue(payload?.image_kind, VALID_IMAGE_KINDS, 'unknown'),
  normality_status: safeEnumValue(payload?.normality_status, VALID_NORMALITY_STATUSES, 'uncertain'),
  observations: Array.isArray(payload?.observations) ? payload.observations : [],
  candidates: Array.isArray(payload?.candidates) ? payload.candidates : [],
  required_additional_views: Array.isArray(payload?.required_additional_views)
    ? payload.required_additional_views
    : ['사람 검토 또는 재촬영'],
  quality_concerns: [
    ...(Array.isArray(payload?.quality_concerns) ? payload.quality_concerns : []),
    'provider_contract_invalid'
  ],
  abstention_reason: compact(payload?.abstention_reason) || 'provider_contract_invalid',
  provider_contract_valid: false,
  provider_contract_invalid: true,
  provider_contract_errors: errors
});

const normalizeQualityStatus = (value, qualityConcerns = []) => {
  const normalized = normalizedKey(value);
  if ([
    'reject',
    'rejected',
    'fail',
    'failed',
    'blocked',
    'invalid',
    'unreadable'
  ].some(marker => normalized.includes(marker))) {
    return 'reject';
  }
  if ([
    'warn',
    'warning',
    'lowquality',
    'review'
  ].some(marker => normalized.includes(marker))) {
    return 'warn';
  }
  if ([
    'pass',
    'passed',
    'ok',
    'ready',
    'good'
  ].some(marker => normalized.includes(marker))) {
    return 'pass';
  }
  return qualityConcerns.length > 0 ? 'warn' : 'pass';
};

const normalizeVisualObservations = (input, isV2) => {
  const rawObservations = Array.isArray(input?.observations)
    ? input.observations
    : Array.isArray(input?.visualObservations)
      ? input.visualObservations
      : [];
  const observations = [];
  const seenIds = new Set();

  for (let index = 0; index < rawObservations.length && observations.length < 16; index++) {
    const raw = rawObservations[index];
    const description = compact(raw?.description || raw?.value || raw?.text);
    if (!description) continue;
    const explicitRawId = compact(raw?.observationId || raw?.observation_id);
    if (isV2 && !explicitRawId) continue;
    const rawId = explicitRawId || `obs-${index + 1}`;
    const observationId = rawId
      .replace(/[^a-zA-Z0-9_.:-]+/g, '-')
      .replace(/^-|-$/g, '');
    if (!observationId || seenIds.has(observationId)) continue;
    const rawCategory = compact(raw?.category).toLocaleLowerCase();
    const category = VALID_OBSERVATION_CATEGORIES.has(rawCategory)
      ? rawCategory
      : 'other';
    seenIds.add(observationId);
    observations.push({
      observationId,
      category,
      description,
      region: compact(raw?.region),
      confidence: confidenceValue(raw?.confidence),
      source: 'image'
    });
  }

  if (observations.length === 0 && !isV2) {
    const legacyFeatures = stringList(input?.visibleFeatures || input?.visible_features);
    legacyFeatures.slice(0, 16).forEach((description, index) => {
      observations.push({
        observationId: `legacy-${index + 1}`,
        category: 'other',
        description,
        region: '',
        confidence: 0,
        source: 'image'
      });
    });
  }

  return observations;
};

const normalizeCandidate = (candidate, observationById, isV2) => {
  const defectType = compact(
    candidate?.defectType
    || candidate?.defect_type
    || candidate?.label
    || candidate?.name
  );
  if (!defectType || isUnclassifiableLabel(defectType)) {
    return { candidate: null, invalidGrounding: false };
  }

  const supportingObservationIds = stringList(
    candidate?.supportingObservationIds || candidate?.supporting_observation_ids
  ).filter(id => observationById.has(id));
  const contradictingObservationIds = stringList(
    candidate?.contradictingObservationIds || candidate?.contradicting_observation_ids
  ).filter(id => observationById.has(id));

  if (isV2 && supportingObservationIds.length === 0) {
    return { candidate: null, invalidGrounding: true };
  }

  const supportingFeatures = isV2
    ? supportingObservationIds.map(id => observationById.get(id).description)
    : stringList(candidate?.supportingFeatures || candidate?.supporting_features);
  const contradictingFeatures = isV2
    ? contradictingObservationIds.map(id => observationById.get(id).description)
    : stringList(candidate?.contradictingFeatures || candidate?.contradicting_features);

  return {
    invalidGrounding: false,
    candidate: {
      defectType,
      confidence: confidenceValue(
        candidate?.confidence
        ?? candidate?.score
        ?? candidate?.probability
      ),
      supportingFeatures,
      contradictingFeatures,
      supportingObservationIds,
      contradictingObservationIds
    }
  };
};

const decisionFor = (
  candidates,
  {
    isV2,
    imageKind,
    normalityStatus,
    qualityStatus,
    validationIssues
  }
) => {
  if (imageKind === 'document_or_diagram') {
    return {
      decisionStatus: 'unclassifiable',
      decisionReason: 'non_physical_image'
    };
  }
  if (qualityStatus === 'reject') {
    return {
      decisionStatus: 'unclassifiable',
      decisionReason: 'image_quality_rejected'
    };
  }
  if (normalityStatus === 'no_defect_visible') {
    return {
      decisionStatus: 'unclassifiable',
      decisionReason: 'no_visible_defect'
    };
  }
  if (candidates.length === 0) {
    return {
      decisionStatus: 'unclassifiable',
      decisionReason: validationIssues.includes('candidate_without_observation_evidence')
        ? 'candidate_without_observation_evidence'
        : 'no_classifiable_candidate'
    };
  }
  if (!isV2) {
    return {
      decisionStatus: 'needs_review',
      decisionReason: 'legacy_observation_contract'
    };
  }
  if (validationIssues.length > 0) {
    return {
      decisionStatus: 'needs_review',
      decisionReason: 'observation_contract_validation_failed'
    };
  }
  if (normalityStatus !== 'defect_visible') {
    return {
      decisionStatus: 'needs_review',
      decisionReason: 'visual_abnormality_not_confirmed'
    };
  }

  const top = candidates[0];
  const second = candidates[1];
  if (candidates.length < 2) {
    return {
      decisionStatus: 'needs_review',
      decisionReason: 'single_candidate_requires_review'
    };
  }
  const margin = top.confidence - second.confidence;
  if (top.confidence < 0.6 || margin < 0.15) {
    return {
      decisionStatus: 'needs_review',
      decisionReason: `confidence_or_margin_gate(top=${top.confidence.toFixed(2)},margin=${margin.toFixed(2)})`
    };
  }
  return {
    decisionStatus: 'probable',
    decisionReason: `probable_pending_human_review(top=${top.confidence.toFixed(2)},margin=${margin.toFixed(2)})`
  };
};

const buildSafetyGate = ({
  isV2,
  imageKind,
  normalityStatus,
  qualityStatus,
  validationIssues,
  candidates,
  observationById
}) => {
  const reasons = [];
  const top = candidates[0] || null;
  const second = candidates[1] || null;
  const topCandidateMargin = top && second
    ? Math.round((top.confidence - second.confidence) * 1000) / 1000
    : null;
  const supportingObservationIds = top?.supportingObservationIds || [];
  const supportingCategories = new Set(
    supportingObservationIds
      .map(id => observationById.get(id)?.category)
      .filter(Boolean)
  );
  const supportObservationCount = supportingObservationIds.length || (top?.supportingFeatures || []).length;
  const supportCategoryCount = supportingCategories.size;

  const blockedReason = [
    validationIssues.includes('provider_contract_invalid') ? 'provider_contract_invalid' : '',
    imageKind === 'document_or_diagram' ? 'non_physical_image' : '',
    qualityStatus === 'reject' ? 'image_quality_rejected' : '',
    normalityStatus === 'no_defect_visible' ? 'no_visible_defect' : '',
    candidates.length === 0 ? 'no_classifiable_candidate' : '',
    validationIssues.includes('missing_visual_observations') ? 'missing_visual_observations' : '',
    validationIssues.includes('candidate_without_observation_evidence')
      ? 'candidate_without_observation_evidence'
      : ''
  ].find(Boolean);

  if (blockedReason) {
    return {
      status: 'blocked',
      score: 0,
      reasons: [blockedReason],
      candidateUsePolicy: 'do_not_use_vision_candidate',
      autoGraphCandidateUseAllowed: false,
      humanReviewRequired: true,
      supportObservationCount,
      supportCategoryCount,
      topCandidateMargin
    };
  }

  if (!isV2) reasons.push('legacy_observation_contract');
  if (qualityStatus === 'warn') reasons.push('image_quality_warning');
  if (normalityStatus !== 'defect_visible') reasons.push('visual_abnormality_not_confirmed');
  if (candidates.length < 2) reasons.push('single_candidate_requires_review');
  if (top && top.confidence < 0.7) reasons.push('top_candidate_confidence_below_safety_floor');
  if (top && second && topCandidateMargin < 0.2) reasons.push('top_candidate_margin_too_small');
  if (top && supportObservationCount < 2) {
    reasons.push('insufficient_independent_visual_evidence');
  }
  if (top && isV2 && supportCategoryCount < 2) {
    reasons.push('single_visual_evidence_category');
  }
  if (
    top
    && (
      (top.contradictingObservationIds || []).length > 0
      || (top.contradictingFeatures || []).length > 0
    )
  ) {
    reasons.push('top_candidate_has_contradicting_evidence');
  }

  const penaltyByReason = {
    legacy_observation_contract: 35,
    image_quality_warning: 12,
    visual_abnormality_not_confirmed: 20,
    single_candidate_requires_review: 15,
    top_candidate_confidence_below_safety_floor: 20,
    top_candidate_margin_too_small: 18,
    insufficient_independent_visual_evidence: 24,
    single_visual_evidence_category: 14,
    top_candidate_has_contradicting_evidence: 24
  };
  const score = clampScore(100 - reasons.reduce(
    (sum, reason) => sum + (penaltyByReason[reason] || 10),
    0
  ));
  const status = reasons.length > 0 ? 'needs_review' : 'reliable';

  return {
    status,
    score,
    reasons,
    candidateUsePolicy: status === 'reliable'
      ? 'candidate_primary_graph_cross_check'
      : 'graph_cross_check_only',
    autoGraphCandidateUseAllowed: status === 'reliable',
    humanReviewRequired: status !== 'reliable',
    supportObservationCount,
    supportCategoryCount,
    topCandidateMargin
  };
};

const normalizeVisionObservation = input => {
  const contractVersion = compact(input?.contractVersion || input?.contract_version)
    || 'vision-observation/v1';
  const isV2 = contractVersion === 'vision-observation/v2';
  const rawImageKind = compact(input?.imageKind || input?.image_kind).toLocaleLowerCase();
  const imageKind = VALID_IMAGE_KINDS.has(rawImageKind) ? rawImageKind : 'unknown';
  const rawNormalityStatus = compact(
    input?.normalityStatus || input?.normality_status
  ).toLocaleLowerCase();
  const normalityStatus = VALID_NORMALITY_STATUSES.has(rawNormalityStatus)
    ? rawNormalityStatus
    : 'uncertain';
  const qualityConcerns = stringList(input?.qualityConcerns || input?.quality_concerns);
  const qualityStatus = normalizeQualityStatus(
    input?.qualityStatus || input?.quality_status,
    qualityConcerns
  );
  const providerContractErrors = stringList(
    input?.providerContractErrors || input?.provider_contract_errors
  );
  const providerContractValid = input?.providerContractValid ?? input?.provider_contract_valid;
  const visualObservations = normalizeVisualObservations(input, isV2);
  const observationById = new Map(
    visualObservations.map(observation => [observation.observationId, observation])
  );
  const validationIssues = [];
  if (isV2 && visualObservations.length === 0) {
    validationIssues.push('missing_visual_observations');
  }
  if (qualityStatus === 'reject') {
    validationIssues.push('image_quality_rejected');
  }
  if (input?.provider_contract_invalid === true || providerContractErrors.length > 0) {
    validationIssues.push('provider_contract_invalid', ...providerContractErrors);
  }

  let rawCandidates = Array.isArray(input?.candidates)
    ? input.candidates
    : Array.isArray(input?.top_candidates)
      ? input.top_candidates
      : [];
  const fallbackDefectType = compact(input?.defect_type || input?.defectType);
  if (!isV2 && rawCandidates.length === 0 && fallbackDefectType) {
    rawCandidates = [{
      defect_type: fallbackDefectType,
      confidence: input?.confidence,
      supporting_features: input?.visible_features || input?.visibleFeatures
    }];
  }
  const explicitUnclassifiable = rawCandidates.some(candidate =>
    isUnclassifiableLabel(
      candidate?.defectType
      || candidate?.defect_type
      || candidate?.label
      || candidate?.name
    )
  );

  const deduplicated = new Map();
  let invalidGrounding = false;
  for (const rawCandidate of rawCandidates) {
    const normalized = normalizeCandidate(rawCandidate, observationById, isV2);
    invalidGrounding = invalidGrounding || normalized.invalidGrounding;
    const candidate = normalized.candidate;
    const key = normalizedKey(candidate?.defectType);
    if (!candidate || !key) continue;
    const previous = deduplicated.get(key);
    if (!previous || candidate.confidence > previous.confidence) {
      deduplicated.set(key, candidate);
    }
  }
  if (invalidGrounding) {
    validationIssues.push('candidate_without_observation_evidence');
  }

  let candidates = [...deduplicated.values()]
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, 3);
  if (
    imageKind === 'document_or_diagram'
    || qualityStatus === 'reject'
    || normalityStatus === 'no_defect_visible'
    || validationIssues.includes('provider_contract_invalid')
  ) {
    candidates = [];
  }

  const baseDecision = decisionFor(candidates, {
    isV2,
    imageKind,
    normalityStatus,
    qualityStatus,
    validationIssues
  });
  const safetyGate = buildSafetyGate({
    isV2,
    imageKind,
    normalityStatus,
    qualityStatus,
    validationIssues,
    candidates,
    observationById
  });
  const decision = safetyGate.status === 'blocked'
    ? baseDecision
    : baseDecision.decisionStatus === 'probable' && safetyGate.status !== 'reliable'
      ? {
          decisionStatus: 'needs_review',
          decisionReason: 'vision_safety_gate_requires_review'
        }
      : baseDecision;
  const groundingStatus = isV2
    ? validationIssues.length > 0 ? 'invalid' : 'grounded'
    : 'legacy';
  const explicitAbstention = compact(input?.abstentionReason || input?.abstention_reason);
  const abstentionReason = imageKind === 'document_or_diagram'
    ? 'non_physical_image'
    : qualityStatus === 'reject'
      ? 'image_quality_rejected'
      : normalityStatus === 'no_defect_visible'
        ? 'no_visible_defect'
        : explicitAbstention || (explicitUnclassifiable ? 'vision_model_abstained' : '');

  return {
    contractVersion,
    imageKind,
    normalityStatus,
    qualityStatus,
    visualObservations,
    visibleFeatures: visualObservations.map(observation => observation.description),
    candidates,
    primaryCandidate: candidates[0] || null,
    requiredAdditionalViews: stringList(
      input?.requiredAdditionalViews || input?.required_additional_views
    ),
    qualityConcerns,
    abstentionReason,
    validationIssues,
    providerContractValid: providerContractValid === undefined
      ? providerContractErrors.length === 0
      : providerContractValid !== false,
    providerContractErrors,
    groundingStatus,
    safetyGate,
    ...decision
  };
};

const extractJsonPayload = text => {
  const compactText = String(text || '').trim();
  if (!compactText) return null;
  const fenceMatch = compactText.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenceMatch?.[1]?.trim() || compactText;
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(candidate.slice(start, end + 1));
    } catch {
      return null;
    }
  }
};

const parseLegacyObservation = text => {
  const defectMatch = String(text || '').match(/Defect:\s*([^|\n]+)/i);
  const descriptionMatch = String(text || '').match(/Desc:\s*([^\n]+)/i);
  if (!defectMatch) return null;
  return {
    visible_features: descriptionMatch ? [descriptionMatch[1].trim()] : [],
    candidates: [{
      defect_type: defectMatch[1].trim(),
      confidence: 0.5,
      supporting_features: descriptionMatch ? [descriptionMatch[1].trim()] : []
    }]
  };
};

const parseVisionObservationText = text => normalizeVisionObservation(
  extractJsonPayload(text)
  || parseLegacyObservation(text)
  || {}
);

const parseProviderVisionObservationText = text => {
  const payload = extractJsonPayload(text);
  const errors = validateVisionObservationProviderPayload(payload);
  if (errors.length > 0) {
    return normalizeVisionObservation(providerContractBlockedPayload(payload, errors));
  }
  return normalizeVisionObservation({
    ...payload,
    provider_contract_valid: true,
    provider_contract_errors: []
  });
};

const buildVisionRetrievalQuery = (observation, fieldContext = '') => {
  const normalized = normalizeVisionObservation(observation || {});
  const observationLines = normalized.visualObservations.map(item => [
    `${item.observationId} [${item.category}]`,
    item.region ? `region: ${item.region}` : '',
    item.description,
    `confidence: ${item.confidence.toFixed(2)}`
  ].filter(Boolean).join(' | '));
  const candidateLines = normalized.candidates.map((candidate, index) => [
    `${index + 1}. ${candidate.defectType} (${Math.round(candidate.confidence * 100)}%)`,
    candidate.supportingObservationIds.length > 0
      ? `support observations: ${candidate.supportingObservationIds.join(', ')}`
      : '',
    candidate.contradictingObservationIds.length > 0
      ? `contradiction observations: ${candidate.contradictingObservationIds.join(', ')}`
      : ''
  ].filter(Boolean).join(' | '));

  return [
    'Injection molding visual diagnosis hypothesis verification',
    `Vision observation contract: ${normalized.contractVersion}`,
    `Image kind: ${normalized.imageKind}`,
    `Normality status: ${normalized.normalityStatus}`,
    `Quality status: ${normalized.qualityStatus}`,
    normalized.qualityConcerns.length > 0
      ? `Quality concerns: ${normalized.qualityConcerns.join(', ')}`
      : '',
    normalized.safetyGate
      ? `Vision safety gate: ${normalized.safetyGate.status} | score: ${normalized.safetyGate.score} | candidate_use_policy: ${normalized.safetyGate.candidateUsePolicy}`
      : '',
    normalized.safetyGate?.reasons?.length > 0
      ? `Vision safety reasons: ${normalized.safetyGate.reasons.join(', ')}`
      : '',
    observationLines.length > 0
      ? `Pixel-grounded observations:\n${observationLines.join('\n')}`
      : 'Pixel-grounded observations: none',
    candidateLines.length > 0
      ? `Candidate defects:\n${candidateLines.join('\n')}`
      : 'Candidate defects: unclassifiable',
    compact(fieldContext) ? `Field context for Graph cross-check only: ${compact(fieldContext)}` : '',
    'Retrieve approved graph evidence for and against each candidate, then rank causes, checks, and countermeasures.'
  ].filter(Boolean).join('\n');
};

module.exports = {
  buildVisionRetrievalQuery,
  normalizeVisionObservation,
  parseProviderVisionObservationText,
  parseVisionObservationText
};
