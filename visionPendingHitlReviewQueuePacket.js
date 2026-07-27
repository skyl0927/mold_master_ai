const asArray = value => Array.isArray(value) ? value : [];

const compact = value => String(value || '').replace(/\s+/g, ' ').trim();

const unique = values => [...new Set(values.map(compact).filter(Boolean))];

const normalizeHash = value => compact(value).toLowerCase();

const hashFromCandidate = candidate => normalizeHash(
  candidate?.contentSha256
  || candidate?.contentHash
  || candidate?.content_sha256
  || candidate?.sha256
  || candidate?.sourceLineage?.sourceContentHash
);

const hashesFromCaseRecord = record => [
  record?.contentHash,
  record?.contentSha256,
  record?.content_sha256,
  record?.metadata?.contentHash,
  record?.metadata?.contentSha256,
  record?.metadata?.content_sha256,
  record?.input?.contentHash,
  record?.sourceLineage?.sourceContentHash
].map(normalizeHash).filter(Boolean);

const approvedHashesFromManifest = approvedManifest => {
  const hashes = new Set(asArray(approvedManifest?.approvedHashes).map(normalizeHash).filter(Boolean));
  asArray(approvedManifest?.cases).forEach(record => {
    hashesFromCaseRecord(record).forEach(hash => hashes.add(hash));
  });
  return hashes;
};

const isHighConfidenceAgreement = candidate =>
  candidate?.reviewBucket === 'agreement_high_confidence'
  && candidate?.reviewDecision !== 'approved'
  && candidate?.labelEvidence?.conflict !== true;

const pendingByClass = items => items.reduce((counts, item) => {
  const key = item.defectClass || 'unknown';
  return {
    ...counts,
    [key]: (counts[key] || 0) + 1
  };
}, {});

const allowedDecisionsFor = candidate => [
  {
    action: 'approve_candidate',
    result: '사람이 원본 이미지와 라벨 근거를 확인한 뒤 approved 기준 데이터로 승격합니다.',
    graphPromotionAllowedAfterDecision: true,
    referenceLearningAllowedAfterDecision: true
  },
  {
    action: 'mark_needs_review',
    result: '근거가 부족하거나 추가 정보가 필요해 needs_review 상태로 유지합니다.',
    graphPromotionAllowedAfterDecision: false,
    referenceLearningAllowedAfterDecision: false
  },
  {
    action: 'reject_candidate',
    result: '라벨 또는 이미지 품질이 부적합해 rejected 후보로 닫습니다.',
    graphPromotionAllowedAfterDecision: false,
    referenceLearningAllowedAfterDecision: false
  },
  {
    action: 'request_recapture',
    result: '동일 불량의 재촬영 또는 추가 시점 촬영을 요청합니다.',
    graphPromotionAllowedAfterDecision: false,
    referenceLearningAllowedAfterDecision: false,
    recommendedViewTag: candidate?.captureProtocol?.recommendedViewTag || null
  }
];

const normalizeCandidate = (candidate, index) => {
  const labelEvidence = candidate?.labelEvidence || {};
  const sourceLineage = candidate?.sourceLineage || {};
  const defectType = compact(candidate?.defectType || labelEvidence.visionSuggestedLabel || labelEvidence.sourceLabel || '미분류');
  const defectClass = compact(candidate?.defectClass || candidate?.audit?.suggestedDefectClass || 'unknown');
  const contentSha256 = hashFromCandidate(candidate);

  return {
    queueId: `pending-hitl-${String(index + 1).padStart(3, '0')}`,
    priority: Number(candidate?.reviewPriority || 99),
    commonAgentAction: 'review_high_confidence_candidate',
    defectType,
    defectClass,
    contentSha256,
    relativePath: compact(candidate?.relativePath || sourceLineage.packetSourceRelativePath),
    sourceKind: compact(sourceLineage.packetSourceKind || candidate?.sourceKind || 'unknown'),
    sourceDocumentId: compact(sourceLineage.sourceDocumentId),
    evidence: {
      sourceLabel: compact(labelEvidence.sourceLabel),
      visionSuggestedLabel: compact(labelEvidence.visionSuggestedLabel),
      visionConfidence: Number(labelEvidence.visionConfidence ?? labelEvidence.visionModelConfidence ?? 0),
      visionSummary: compact(labelEvidence.visionSummary),
      reviewReasons: unique(candidate?.reviewReasons || [])
    },
    allowedDecisions: allowedDecisionsFor(candidate),
    payload: {
      sourceSystem: 'mold-master-ai',
      reviewType: 'pending_high_confidence_vision_hitl',
      contentSha256,
      defectType,
      defectClass,
      relativePath: compact(candidate?.relativePath || sourceLineage.packetSourceRelativePath),
      sourceKind: compact(sourceLineage.packetSourceKind || candidate?.sourceKind || 'unknown'),
      sourceLabel: compact(labelEvidence.sourceLabel),
      visionSuggestedLabel: compact(labelEvidence.visionSuggestedLabel),
      visionConfidence: Number(labelEvidence.visionConfidence ?? labelEvidence.visionModelConfidence ?? 0),
      visionSummary: compact(labelEvidence.visionSummary),
      requiresHumanApproval: true,
      graphPromotionAllowed: false,
      referenceLearningAllowed: false,
      modelTrainingAllowed: false
    }
  };
};

const unresolvedExpectedFromReport = report => {
  const direct = report?.preflight?.unresolvedHighConfidence;
  const nested = report?.hitl?.unresolvedHighConfidence;
  const value = Number(direct ?? nested);
  return Number.isFinite(value) ? value : null;
};

const buildVisionPendingHitlReviewQueuePacket = ({
  generatedAt = new Date().toISOString(),
  reviewPacket = null,
  approvedManifest = null,
  postHitlVerificationReport = null,
  sourceArtifacts = {}
} = {}) => {
  const candidates = asArray(reviewPacket?.candidates);
  const missingReviewPacket = !reviewPacket || candidates.length === 0;
  const highConfidenceCandidates = candidates.filter(isHighConfidenceAgreement);
  const approvedHashes = approvedHashesFromManifest(approvedManifest);
  const pendingCandidates = missingReviewPacket
    ? []
    : highConfidenceCandidates.filter(candidate => !approvedHashes.has(hashFromCandidate(candidate)));
  const items = pendingCandidates.map(normalizeCandidate);
  const status = missingReviewPacket
    ? 'missing_review_packet'
    : items.length > 0 ? 'action_required' : 'clear';
  const expectedPending = unresolvedExpectedFromReport(postHitlVerificationReport);

  return {
    schemaVersion: 1,
    contractVersion: 'vision-pending-hitl-review-queue-packet/v1',
    generatedAt,
    sourceSystem: 'mold-master-ai',
    targetSystem: 'common-agent',
    status,
    serviceWritesPerformed: false,
    localArtifactsWritten: true,
    policy: {
      requiresHumanReview: true,
      automaticApprovalAllowed: false,
      allowGraphPromotion: false,
      allowReferenceLearning: false,
      allowModelTraining: false
    },
    summary: {
      totalCandidates: missingReviewPacket ? 0 : candidates.length,
      highConfidenceCandidates: missingReviewPacket ? 0 : highConfidenceCandidates.length,
      pendingHighConfidence: items.length,
      resolvedHighConfidence: missingReviewPacket ? 0 : highConfidenceCandidates.length - items.length,
      skippedNonHighConfidence: missingReviewPacket ? 0 : candidates.length - highConfidenceCandidates.length,
      pendingByClass: pendingByClass(items),
      expectedPendingFromPostHitl: expectedPending,
      matchesPostHitlReport: expectedPending === null ? null : expectedPending === items.length
    },
    items,
    commonAgentReviewRequest: {
      reviewType: 'pending_high_confidence_vision_hitl',
      requestedAction: status === 'action_required'
        ? 'review_pending_high_confidence_candidates'
        : status === 'clear'
          ? 'no_pending_high_confidence_action_required'
          : 'rebuild_vision_review_packet',
      requiresHumanReview: status === 'action_required',
      itemCount: items.length,
      allowGraphPromotion: false,
      allowReferenceLearning: false,
      allowModelTraining: false
    },
    sources: {
      reviewPacket: sourceArtifacts.reviewPacket || null,
      approvedManifest: sourceArtifacts.approvedManifest || null,
      postHitlVerificationReport: sourceArtifacts.postHitlVerificationReport || null
    },
    recommendedAction: status === 'missing_review_packet'
      ? 'vision:review-packet 명령으로 사람 검토 후보 패킷을 먼저 생성하세요.'
      : status === 'action_required'
        ? `고신뢰 합의 후보 ${items.length}건을 사람이 승인/보류/반려/재촬영 중 하나로 닫으세요. 승인 전에는 Graph 승격과 Reference 학습을 금지합니다.`
        : '미해결 고신뢰 후보 없음. 라벨 충돌과 reference readiness blocker를 계속 확인하세요.'
  };
};

module.exports = {
  buildVisionPendingHitlReviewQueuePacket,
  approvedHashesFromManifest
};
