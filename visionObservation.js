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

const normalizeCandidate = candidate => {
  const defectType = compact(
    candidate?.defectType
    || candidate?.defect_type
    || candidate?.label
    || candidate?.name
  );
  if (!defectType || isUnclassifiableLabel(defectType)) return null;
  return {
    defectType,
    confidence: confidenceValue(
      candidate?.confidence
      ?? candidate?.score
      ?? candidate?.probability
    ),
    supportingFeatures: stringList(
      candidate?.supportingFeatures || candidate?.supporting_features
    ),
    contradictingFeatures: stringList(
      candidate?.contradictingFeatures || candidate?.contradicting_features
    )
  };
};

const decisionFor = candidates => {
  if (candidates.length === 0) {
    return {
      decisionStatus: 'unclassifiable',
      decisionReason: 'no_classifiable_candidate'
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

const normalizeVisionObservation = input => {
  let rawCandidates = Array.isArray(input?.candidates)
    ? input.candidates
    : Array.isArray(input?.top_candidates)
      ? input.top_candidates
      : [];
  const fallbackDefectType = compact(input?.defect_type || input?.defectType);
  if (rawCandidates.length === 0 && fallbackDefectType) {
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
  for (const rawCandidate of rawCandidates) {
    const candidate = normalizeCandidate(rawCandidate);
    const key = normalizedKey(candidate?.defectType);
    if (!candidate || !key) continue;
    const previous = deduplicated.get(key);
    if (!previous || candidate.confidence > previous.confidence) {
      deduplicated.set(key, candidate);
    }
  }
  const candidates = [...deduplicated.values()]
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, 3);
  const decision = decisionFor(candidates);

  return {
    visibleFeatures: stringList(input?.visibleFeatures || input?.visible_features),
    candidates,
    primaryCandidate: candidates[0] || null,
    requiredAdditionalViews: stringList(
      input?.requiredAdditionalViews || input?.required_additional_views
    ),
    qualityConcerns: stringList(input?.qualityConcerns || input?.quality_concerns),
    abstentionReason: compact(input?.abstentionReason || input?.abstention_reason)
      || (explicitUnclassifiable ? 'vision_model_abstained' : ''),
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

const buildVisionRetrievalQuery = (observation, fieldContext = '') => {
  const normalized = normalizeVisionObservation(observation || {});
  const candidateLines = normalized.candidates.map((candidate, index) => [
    `${index + 1}. ${candidate.defectType} (${Math.round(candidate.confidence * 100)}%)`,
    candidate.supportingFeatures.length > 0
      ? `support: ${candidate.supportingFeatures.join(', ')}`
      : '',
    candidate.contradictingFeatures.length > 0
      ? `contradiction: ${candidate.contradictingFeatures.join(', ')}`
      : ''
  ].filter(Boolean).join(' | '));

  return [
    'Injection molding visual diagnosis hypothesis verification',
    normalized.visibleFeatures.length > 0
      ? `Observed visual features: ${normalized.visibleFeatures.join(', ')}`
      : '',
    candidateLines.length > 0
      ? `Candidate defects:\n${candidateLines.join('\n')}`
      : 'Candidate defects: unclassifiable',
    compact(fieldContext) ? `Field context: ${compact(fieldContext)}` : '',
    'Retrieve approved graph evidence for and against each candidate, then rank causes, checks, and countermeasures.'
  ].filter(Boolean).join('\n');
};

module.exports = {
  buildVisionRetrievalQuery,
  normalizeVisionObservation,
  parseVisionObservationText
};
