const compact = value => String(value || '').replace(/\s+/g, ' ').trim();
const asArray = value => Array.isArray(value) ? value : [];
const unique = values => [...new Set(asArray(values).map(compact).filter(Boolean))];

const unresolvedItem = item =>
  item?.isCurrent === false
  || !['approved', 'rejected'].includes(compact(item?.decision));

const evidenceSummaryFor = card => asArray(card?.evidence).slice(0, 3).map(evidence => ({
  publisher: compact(evidence?.publisher),
  title: compact(evidence?.title),
  sourceUrl: compact(evidence?.sourceUrl),
  license: compact(evidence?.license),
  contentSha256: compact(evidence?.contentSha256).toLowerCase(),
  localFile: compact(evidence?.localFile)
}));

const decisionItemFor = item => {
  const card = item?.card || {};
  return {
    caseId: compact(card.caseId),
    sourceContentSha256: compact(item?.sourceContentSha256).toLowerCase(),
    defectClass: compact(card.defectClass),
    sourceKind: compact(card.sourceKind),
    originalDecision: compact(item?.decision) || 'pending',
    isCurrent: item?.isCurrent !== false,
    action: 'pending',
    allowedActions: [
      'approve_card',
      'mark_needs_changes',
      'reject_card'
    ],
    reviewedDefectName: compact(item?.review?.defectName || card.defectName),
    reviewedProblem: compact(item?.review?.problem || card.problem),
    reviewedPhenomenon: compact(item?.review?.phenomenon || card.phenomenon),
    causeCandidates: asArray(item?.review?.causeCandidates).length > 0
      ? asArray(item.review.causeCandidates).map(compact).filter(Boolean)
      : asArray(card.causes).map(cause => compact(cause?.text)).filter(Boolean),
    suggestedCauseLabels: unique(item?.suggestedCauseLabels),
    suggestedCheckItems: unique(item?.suggestedCheckItems),
    suggestedActions: unique(item?.suggestedActions),
    evidence: evidenceSummaryFor(card),
    reviewerId: '',
    reviewComment: '',
    decidedAt: '',
    confirmed: false,
    instructionsKo: [
      '원문/이미지 근거와 사출 성형 도메인 적용 가능성을 확인하세요.',
      '승인은 approve_card, 보완 필요는 mark_needs_changes, 부적합은 reject_card를 사용하세요.',
      '승인 시 reviewedDefectName, reviewedProblem, reviewedPhenomenon, causeCandidates, causeLabels, checkItems, actions를 모두 채우세요.'
    ]
  };
};

const buildWebKnowledgeHitlDecisionTemplate = ({
  generatedAt = new Date().toISOString(),
  reviewQueue = [],
  targetCardCount = 40,
  sourceArtifacts = {}
} = {}) => {
  const queue = asArray(reviewQueue);
  const currentApprovedCards = queue.filter(item =>
    item?.decision === 'approved' && item?.isCurrent !== false
  ).length;
  const decisions = queue
    .filter(unresolvedItem)
    .map(decisionItemFor)
    .filter(item => item.caseId && item.sourceContentSha256);

  return {
    schemaVersion: 1,
    contractVersion: 'common-agent-web-knowledge-hitl-decisions-template/v1',
    generatedAt,
    sourceSystem: 'mold-master-ai',
    targetSystem: 'common-agent',
    status: decisions.length > 0 ? 'template_ready' : 'clear',
    serviceWritesPerformed: false,
    localArtifactsWritten: true,
    policy: {
      requiresHumanReview: true,
      autoApplyAllowed: false,
      allowCentralIngestion: false,
      allowGraphPromotion: false,
      allowModelTraining: false
    },
    reviewer: {
      id: '',
      name: '',
      reviewedAt: ''
    },
    summary: {
      totalCards: queue.length,
      targetCardCount,
      currentApprovedCards,
      currentApprovalsMissing: Math.max(0, targetCardCount - currentApprovedCards),
      decisionsPrepared: decisions.length,
      staleCards: queue.filter(item => item?.isCurrent === false).length,
      pendingCards: queue.filter(item => compact(item?.decision) === 'pending').length,
      needsChangesCards: queue.filter(item => compact(item?.decision) === 'needs_changes').length,
      rejectedCards: queue.filter(item => compact(item?.decision) === 'rejected').length
    },
    sources: {
      collectionRoot: sourceArtifacts.collectionRoot || null,
      reviewLedger: sourceArtifacts.reviewLedger || null
    },
    decisions,
    recommendedAction: decisions.length > 0
      ? 'Common Agent/HITL 검토자가 action, reviewerId, decidedAt, reviewComment 및 승인 필드를 채운 뒤 verify-decisions로 검증하세요.'
      : '추가 Web Case HITL 판정 대상이 없습니다.'
  };
};

module.exports = {
  buildWebKnowledgeHitlDecisionTemplate
};
