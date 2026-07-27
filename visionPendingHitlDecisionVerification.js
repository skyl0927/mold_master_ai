const { canonicalDefectClass } = require('./shared/defect-taxonomy');

const asArray = value => Array.isArray(value) ? value : [];

const compact = value => String(value || '').replace(/\s+/g, ' ').trim();

const normalizeHash = value => compact(value).toLowerCase();

const unique = values => [...new Set(values.map(compact).filter(Boolean))];

const validSha256 = value => /^[a-f0-9]{64}$/.test(normalizeHash(value));

const itemHash = item => normalizeHash(
  item?.contentSha256
  || item?.payload?.contentSha256
  || item?.payload?.contentHash
);

const allowedActionsFor = item => {
  const actions = asArray(item?.allowedDecisions).map(decision => compact(decision?.action));
  return new Set(actions.length > 0
    ? actions
    : ['approve_candidate', 'mark_needs_review', 'reject_candidate', 'request_recapture']);
};

const reviewerIdFor = (decision, decisionPacket) => compact(
  decision?.reviewerId
  || decision?.reviewedBy
  || decisionPacket?.reviewer?.id
  || decisionPacket?.reviewerId
);

const invalid = (decision, code, message) => ({
  queueId: compact(decision?.queueId),
  contentSha256: normalizeHash(decision?.contentSha256),
  action: compact(decision?.action),
  code,
  message
});

const validateDecision = ({
  decision,
  decisionPacket,
  queueItem,
  seenKeys
}) => {
  const queueId = compact(decision?.queueId);
  const contentSha256 = normalizeHash(decision?.contentSha256);
  const identity = `${queueId}|${contentSha256}`;
  if (seenKeys.has(identity) || [...seenKeys].some(key =>
    key.startsWith(`${queueId}|`) || key.endsWith(`|${contentSha256}`)
  )) {
    return { invalid: invalid(decision, 'duplicate_decision', '동일 queueId 또는 content hash에 대한 중복 판정입니다.') };
  }
  seenKeys.add(identity);

  if (!queueItem) {
    return { invalid: invalid(decision, 'unknown_queue_item', '판정 대상이 현재 HITL queue packet에 없습니다.') };
  }
  if (!validSha256(contentSha256) || contentSha256 !== itemHash(queueItem)) {
    return { invalid: invalid(decision, 'content_hash_mismatch', '판정 content hash가 queue item hash와 일치하지 않습니다.') };
  }

  const action = compact(decision?.action);
  if (!allowedActionsFor(queueItem).has(action)) {
    return { invalid: invalid(decision, 'unsupported_action', '해당 queue item에서 허용되지 않은 HITL action입니다.') };
  }
  if (compact(decision?.reviewComment || decision?.reason).length < 8) {
    return { invalid: invalid(decision, 'missing_review_comment', '사람 검토 사유 또는 코멘트가 필요합니다.') };
  }
  if (!reviewerIdFor(decision, decisionPacket)) {
    return { invalid: invalid(decision, 'missing_reviewer', '판정 reviewer id가 필요합니다.') };
  }
  if (!Number.isFinite(Date.parse(String(decision?.decidedAt || decisionPacket?.reviewedAt || '')))) {
    return { invalid: invalid(decision, 'invalid_decided_at', '사람 판정 시각이 유효하지 않습니다.') };
  }

  if (action === 'approve_candidate') {
    const approvedClass = canonicalDefectClass(decision?.approvedDefectType);
    const queueClass = compact(queueItem?.defectClass || queueItem?.payload?.defectClass);
    if (decision?.manufacturingImageConfirmed !== true) {
      return { invalid: invalid(decision, 'missing_image_confirmation', '승인에는 원본 제조 이미지 확인이 필요합니다.') };
    }
    if (decision?.labelConfirmed !== true) {
      return { invalid: invalid(decision, 'missing_label_confirmation', '승인에는 최종 라벨 확인이 필요합니다.') };
    }
    if (!approvedClass || approvedClass !== queueClass) {
      return { invalid: invalid(decision, 'approved_label_class_mismatch', '승인 라벨 class가 queue item class와 일치하지 않습니다.') };
    }
  }

  const decidedAt = new Date(decision?.decidedAt || decisionPacket?.reviewedAt).toISOString();
  const defectType = action === 'approve_candidate'
    ? compact(decision?.approvedDefectType)
    : compact(queueItem?.defectType || queueItem?.payload?.defectType);
  const defectClass = compact(queueItem?.defectClass || queueItem?.payload?.defectClass);

  return {
    accepted: {
      queueId,
      contentSha256,
      action,
      defectType,
      defectClass,
      reviewerId: reviewerIdFor(decision, decisionPacket),
      reviewComment: compact(decision?.reviewComment || decision?.reason),
      decidedAt,
      requestedViews: unique(decision?.requestedViews || decision?.requiredViews || []),
      graphPromotionAllowed: false,
      referenceLearningAllowed: false,
      modelTrainingAllowed: false
    }
  };
};

const buildImportPlan = acceptedDecisions => ({
  approvalCandidates: acceptedDecisions
    .filter(decision => decision.action === 'approve_candidate')
    .map(decision => ({
      ...decision,
      requiresManualImport: true,
      graphPromotionAllowed: false,
      referenceLearningAllowed: false
    })),
  needsReviewItems: acceptedDecisions
    .filter(decision => decision.action === 'mark_needs_review'),
  rejectedCandidates: acceptedDecisions
    .filter(decision => decision.action === 'reject_candidate'),
  recaptureRequests: acceptedDecisions
    .filter(decision => decision.action === 'request_recapture')
});

const summarize = ({
  queueItems,
  decisions,
  acceptedDecisions,
  invalidDecisions,
  pendingQueueItems,
  importPlan
}) => ({
  queueItems: queueItems.length,
  decisionsReceived: decisions.length,
  acceptedDecisions: acceptedDecisions.length,
  invalidDecisions: invalidDecisions.length,
  pendingQueueItems: pendingQueueItems.length,
  approvalCandidates: importPlan.approvalCandidates.length,
  needsReviewItems: importPlan.needsReviewItems.length,
  rejectedCandidates: importPlan.rejectedCandidates.length,
  recaptureRequests: importPlan.recaptureRequests.length
});

const statusFor = ({ queuePacket, queueItems, decisions, acceptedDecisions, invalidDecisions }) => {
  if (!queuePacket || !Array.isArray(queuePacket?.items)) return 'missing_queue_packet';
  if (queueItems.length === 0) return 'clear';
  if (decisions.length === 0) return 'awaiting_human_review';
  if (invalidDecisions.length > 0) return 'invalid_decisions';
  if (acceptedDecisions.length < queueItems.length) return 'partial_human_review';
  return 'ready_for_manual_import';
};

const recommendedActionFor = status => ({
  missing_queue_packet: 'vision:hitl:pending-packet 명령으로 미해결 HITL queue packet을 먼저 생성하세요.',
  clear: '미해결 HITL queue item이 없습니다. 다른 readiness blocker를 확인하세요.',
  awaiting_human_review: 'Common Agent HITL 판정 파일을 수집한 뒤 vision:hitl:verify-decisions로 검증하세요.',
  invalid_decisions: '유효하지 않은 HITL 판정을 수정한 뒤 다시 검증하세요. 자동 import와 Graph 승격은 금지됩니다.',
  partial_human_review: '아직 닫히지 않은 HITL queue item을 추가 검토하세요.',
  ready_for_manual_import: '검증된 판정만 별도 수동 import 절차로 넘기세요. 이 보고서는 직접 쓰기를 수행하지 않습니다.'
}[status] || 'HITL 판정 상태를 확인하세요.');

const buildVisionPendingHitlDecisionVerificationReport = ({
  generatedAt = new Date().toISOString(),
  queuePacket = null,
  decisionPacket = null,
  sourceArtifacts = {}
} = {}) => {
  const queueItems = asArray(queuePacket?.items);
  const queueById = new Map(queueItems.map(item => [compact(item?.queueId), item]));
  const decisions = asArray(decisionPacket?.decisions);
  const seenKeys = new Set();
  const acceptedDecisions = [];
  const invalidDecisions = [];

  decisions.forEach(decision => {
    const result = validateDecision({
      decision,
      decisionPacket,
      queueItem: queueById.get(compact(decision?.queueId)),
      seenKeys
    });
    if (result.accepted) acceptedDecisions.push(result.accepted);
    if (result.invalid) invalidDecisions.push(result.invalid);
  });

  const acceptedQueueIds = new Set(acceptedDecisions.map(decision => decision.queueId));
  const pendingQueueItems = queueItems
    .filter(item => !acceptedQueueIds.has(compact(item?.queueId)))
    .map(item => ({
      queueId: compact(item?.queueId),
      contentSha256: itemHash(item),
      defectType: compact(item?.defectType || item?.payload?.defectType),
      defectClass: compact(item?.defectClass || item?.payload?.defectClass)
    }));
  const importPlan = buildImportPlan(acceptedDecisions);
  const status = statusFor({
    queuePacket,
    queueItems,
    decisions,
    acceptedDecisions,
    invalidDecisions
  });

  return {
    schemaVersion: 1,
    contractVersion: 'vision-pending-hitl-decision-verification-report/v1',
    generatedAt,
    sourceSystem: 'mold-master-ai',
    targetSystem: 'common-agent',
    status,
    serviceWritesPerformed: false,
    localArtifactsWritten: true,
    policy: {
      requiresHumanReview: true,
      autoApplyAllowed: false,
      allowGraphPromotion: false,
      allowReferenceLearning: false,
      allowModelTraining: false
    },
    summary: summarize({
      queueItems,
      decisions,
      acceptedDecisions,
      invalidDecisions,
      pendingQueueItems,
      importPlan
    }),
    acceptedDecisions,
    invalidDecisions,
    pendingQueueItems,
    importPlan,
    sources: {
      queuePacket: sourceArtifacts.queuePacket || null,
      decisionPacket: sourceArtifacts.decisionPacket || null
    },
    recommendedAction: recommendedActionFor(status)
  };
};

module.exports = {
  buildVisionPendingHitlDecisionVerificationReport
};
