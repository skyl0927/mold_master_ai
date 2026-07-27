const compact = value => String(value || '').replace(/\s+/g, ' ').trim();
const asArray = value => Array.isArray(value) ? value : [];
const normalizeHash = value => compact(value).toLowerCase();
const unique = values => [...new Set(asArray(values).map(compact).filter(Boolean))];

const actionableActions = new Set([
  'approve_card',
  'mark_needs_changes',
  'reject_card'
]);

const actionToLedgerDecision = action => ({
  approve_card: 'approved',
  mark_needs_changes: 'needs_changes',
  reject_card: 'rejected'
}[action] || '');

const invalid = (decision, code, message) => ({
  caseId: compact(decision?.caseId),
  sourceContentSha256: normalizeHash(decision?.sourceContentSha256),
  action: compact(decision?.action),
  code,
  message
});

const reviewerIdFor = (decision, decisionPacket) => compact(
  decision?.reviewerId
  || decision?.reviewedBy
  || decisionPacket?.reviewer?.id
  || decisionPacket?.reviewerId
);

const itemKey = item => `${compact(item?.card?.caseId)}:${normalizeHash(item?.sourceContentSha256)}`;
const decisionKey = decision => `${compact(decision?.caseId)}:${normalizeHash(decision?.sourceContentSha256)}`;

const normalizeList = values => unique(values).slice(0, 12);

const field = (decision, name, fallback = '') => compact(
  decision?.[name] || fallback
);

const validateApproved = ({ decision, queueItem }) => {
  const checks = [
    ['reviewedDefectName', field(decision, 'reviewedDefectName', queueItem?.card?.defectName)],
    ['reviewedProblem', field(decision, 'reviewedProblem', queueItem?.card?.problem)],
    ['reviewedPhenomenon', field(decision, 'reviewedPhenomenon', queueItem?.card?.phenomenon)],
    ['causeCandidates', normalizeList(decision?.causeCandidates)],
    ['causeLabels', normalizeList(decision?.causeLabels)],
    ['checkItems', normalizeList(decision?.checkItems)],
    ['actions', normalizeList(decision?.actions)]
  ];
  const missing = checks.find(([, value]) =>
    Array.isArray(value) ? value.length === 0 : !value
  );
  if (missing) {
    return {
      code: `approved_${missing[0].replace(/^reviewed/, '').replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`).replace(/^_/, '')}_missing`,
      message: `승인 판정에는 ${missing[0]} 값이 필요합니다.`
    };
  }
  if (decision?.confirmed !== true) {
    return {
      code: 'approval_confirmation_missing',
      message: '승인 판정에는 명시적 confirmed=true가 필요합니다.'
    };
  }
  return null;
};

const acceptedDecisionFor = ({ decision, decisionPacket, queueItem }) => {
  const action = compact(decision?.action);
  const decidedAt = new Date(decision?.decidedAt || decisionPacket?.reviewer?.reviewedAt || decisionPacket?.reviewedAt).toISOString();
  const ledgerDecision = actionToLedgerDecision(action);
  const reviewComment = compact(decision?.reviewComment || decision?.reason);
  return {
    caseId: compact(queueItem?.card?.caseId),
    sourceContentSha256: normalizeHash(queueItem?.sourceContentSha256),
    action,
    decision: ledgerDecision,
    reviewer: reviewerIdFor(decision, decisionPacket),
    reviewerComment: reviewComment,
    decidedAt,
    confirmed: true,
    defectName: field(decision, 'reviewedDefectName', queueItem?.card?.defectName),
    problem: field(decision, 'reviewedProblem', queueItem?.card?.problem),
    phenomenon: field(decision, 'reviewedPhenomenon', queueItem?.card?.phenomenon),
    causeCandidates: normalizeList(
      asArray(decision?.causeCandidates).length > 0
        ? decision.causeCandidates
        : asArray(queueItem?.card?.causes).map(cause => cause?.text)
    ),
    causeLabels: normalizeList(decision?.causeLabels),
    checkItems: normalizeList(decision?.checkItems),
    actions: normalizeList(decision?.actions),
    centralIngestionAllowed: false,
    graphPromotionAllowed: false,
    modelTrainingAllowed: false
  };
};

const validateDecision = ({
  decision,
  decisionPacket,
  queueItem,
  seenCaseIds,
  seenHashes
}) => {
  const caseId = compact(decision?.caseId);
  const contentHash = normalizeHash(decision?.sourceContentSha256);
  if (seenCaseIds.has(caseId) || seenHashes.has(contentHash)) {
    return { invalid: invalid(decision, 'duplicate_decision', '동일 caseId 또는 source hash에 대한 중복 판정입니다.') };
  }
  seenCaseIds.add(caseId);
  seenHashes.add(contentHash);

  if (!queueItem) {
    return { invalid: invalid(decision, 'unknown_queue_item', '판정 대상이 현재 Web Case HITL queue에 없습니다.') };
  }
  if (contentHash !== normalizeHash(queueItem?.sourceContentSha256)) {
    return { invalid: invalid(decision, 'source_content_hash_mismatch', '판정 source hash가 현재 카드 hash와 일치하지 않습니다.') };
  }
  const action = compact(decision?.action);
  if (!actionableActions.has(action)) {
    return { invalid: invalid(decision, 'unsupported_action', '지원하지 않는 Web Case HITL action입니다.') };
  }
  if (!reviewerIdFor(decision, decisionPacket)) {
    return { invalid: invalid(decision, 'missing_reviewer', '판정 reviewer id가 필요합니다.') };
  }
  if (compact(decision?.reviewComment || decision?.reason).length < 8) {
    return { invalid: invalid(decision, 'missing_review_comment', '사람 검토 사유 또는 코멘트가 필요합니다.') };
  }
  if (!Number.isFinite(Date.parse(String(decision?.decidedAt || decisionPacket?.reviewer?.reviewedAt || decisionPacket?.reviewedAt || '')))) {
    return { invalid: invalid(decision, 'invalid_decided_at', '사람 판정 시각이 유효하지 않습니다.') };
  }
  if (action === 'approve_card') {
    const approvalError = validateApproved({ decision, queueItem });
    if (approvalError) {
      return { invalid: invalid(decision, approvalError.code, approvalError.message) };
    }
  }

  return {
    accepted: acceptedDecisionFor({ decision, decisionPacket, queueItem })
  };
};

const statusFor = ({
  reviewQueue,
  actionableDecisions,
  acceptedDecisions,
  invalidDecisions
}) => {
  if (reviewQueue.length === 0) return 'clear';
  if (actionableDecisions.length === 0) return 'awaiting_human_review';
  if (invalidDecisions.length > 0) return 'invalid_decisions';
  if (acceptedDecisions.length < reviewQueue.length) return 'partial_human_review';
  return 'ready_for_local_hitl_import';
};

const actionFor = status => ({
  clear: '검증할 Web Case HITL queue item이 없습니다.',
  awaiting_human_review: 'Common Agent/HITL 판정 파일을 작성한 뒤 다시 검증하세요.',
  invalid_decisions: '유효하지 않은 Web Case HITL 판정을 수정한 뒤 다시 검증하세요. 자동 import는 금지됩니다.',
  partial_human_review: '남은 Web Case HITL queue item을 추가 검토하세요.',
  ready_for_local_hitl_import: '검증된 localLedgerUpdates만 별도 수동 import 절차로 넘기세요.'
}[status] || 'Web Case HITL 판정 상태를 확인하세요.');

const buildWebKnowledgeHitlDecisionVerificationReport = ({
  generatedAt = new Date().toISOString(),
  reviewQueue = [],
  decisionPacket = null,
  sourceArtifacts = {}
} = {}) => {
  const queue = asArray(reviewQueue).filter(item =>
    item?.isCurrent === false
    || !['approved', 'rejected'].includes(compact(item?.decision))
  );
  const queueByCaseId = new Map(queue.map(item => [compact(item?.card?.caseId), item]));
  const decisions = asArray(decisionPacket?.decisions);
  const actionableDecisions = decisions.filter(decision =>
    compact(decision?.action) !== 'pending'
  );
  const seenCaseIds = new Set();
  const seenHashes = new Set();
  const acceptedDecisions = [];
  const invalidDecisions = [];

  for (const decision of actionableDecisions) {
    const result = validateDecision({
      decision,
      decisionPacket,
      queueItem: queueByCaseId.get(compact(decision?.caseId)),
      seenCaseIds,
      seenHashes
    });
    if (result.accepted) acceptedDecisions.push(result.accepted);
    if (result.invalid) invalidDecisions.push(result.invalid);
  }

  const acceptedCaseIds = new Set(acceptedDecisions.map(item => item.caseId));
  const pendingQueueItems = queue
    .filter(item => !acceptedCaseIds.has(compact(item?.card?.caseId)))
    .map(item => ({
      caseId: compact(item?.card?.caseId),
      sourceContentSha256: normalizeHash(item?.sourceContentSha256),
      defectName: compact(item?.card?.defectName),
      defectClass: compact(item?.card?.defectClass)
    }));
  const status = statusFor({
    reviewQueue: queue,
    actionableDecisions,
    acceptedDecisions,
    invalidDecisions
  });
  const localLedgerUpdates = status === 'ready_for_local_hitl_import'
    ? acceptedDecisions.map(decision => ({
      caseId: decision.caseId,
      sourceContentSha256: decision.sourceContentSha256,
      decision: decision.decision,
      confirmed: true,
      reviewer: decision.reviewer,
      reviewerComment: decision.reviewerComment,
      defectName: decision.defectName,
      problem: decision.problem,
      phenomenon: decision.phenomenon,
      causeCandidates: decision.causeCandidates,
      causeLabels: decision.causeLabels,
      checkItems: decision.checkItems,
      actions: decision.actions,
      decidedAt: decision.decidedAt
    }))
    : [];

  return {
    schemaVersion: 1,
    contractVersion: 'web-knowledge-hitl-decision-verification-report/v1',
    generatedAt,
    sourceSystem: 'mold-master-ai',
    targetSystem: 'common-agent',
    status,
    serviceWritesPerformed: false,
    localArtifactsWritten: true,
    policy: {
      requiresHumanReview: true,
      autoApplyAllowed: false,
      allowCentralIngestion: false,
      allowGraphPromotion: false,
      allowModelTraining: false
    },
    summary: {
      queueItems: queue.length,
      decisionsReceived: decisions.length,
      actionableDecisions: actionableDecisions.length,
      acceptedDecisions: acceptedDecisions.length,
      invalidDecisions: invalidDecisions.length,
      pendingQueueItems: pendingQueueItems.length,
      approvedCards: acceptedDecisions.filter(item => item.decision === 'approved').length,
      needsChangesCards: acceptedDecisions.filter(item => item.decision === 'needs_changes').length,
      rejectedCards: acceptedDecisions.filter(item => item.decision === 'rejected').length
    },
    acceptedDecisions,
    invalidDecisions,
    pendingQueueItems,
    importPlan: {
      localLedgerUpdates,
      centralIngestionAllowed: false,
      graphPromotionAllowed: false,
      modelTrainingAllowed: false
    },
    sources: {
      decisionPacket: sourceArtifacts.decisionPacket || null,
      collectionRoot: sourceArtifacts.collectionRoot || null,
      reviewLedger: sourceArtifacts.reviewLedger || null
    },
    recommendedAction: actionFor(status)
  };
};

module.exports = {
  buildWebKnowledgeHitlDecisionVerificationReport
};
