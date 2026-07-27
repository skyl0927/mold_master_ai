const asArray = value => Array.isArray(value) ? value : [];

const compact = value => String(value || '').replace(/\s+/g, ' ').trim();

const unique = values => [...new Set(values.map(compact).filter(Boolean))];

const approvedConflictBlocker = blockers =>
  asArray(blockers).find(blocker => blocker?.code === 'approved_label_conflicts');

const conflictsFromReadinessAudit = readinessAudit => {
  const direct = approvedConflictBlocker(readinessAudit?.blockers);
  const postHitl = approvedConflictBlocker(readinessAudit?.gates?.postHitl?.blockers);
  return asArray(direct?.conflicts || postHitl?.conflicts);
};

const conflictsFromPostHitlReport = report => {
  const preflightConflicts = asArray(report?.preflight?.conflicts);
  if (preflightConflicts.length > 0) return preflightConflicts;
  const blocker = approvedConflictBlocker(report?.blockers || report?.preflight?.blockers);
  return asArray(blocker?.conflicts);
};

const conflictTypeFor = ({ contentHash, affectedCaseIds, candidateLabels }) => {
  if (contentHash && affectedCaseIds.length > 1 && candidateLabels.length > 1) {
    return 'same_hash_multi_label';
  }
  if (affectedCaseIds.length <= 1 && candidateLabels.length > 1) {
    return 'single_record_multi_label';
  }
  return 'multi_record_label_conflict';
};

const decisionOptionsFor = (candidateLabels, affectedCaseIds) => [
  ...candidateLabels.map(label => ({
    action: 'keep_label',
    label,
    affectedCaseIds,
    result: '선택한 라벨만 승인 상태로 유지하고 나머지는 needs_review로 되돌립니다.'
  })),
  {
    action: 'mark_needs_review',
    affectedCaseIds,
    result: '모든 관련 사례를 needs_review로 되돌리고 Graph/Reference 학습에서 제외합니다.'
  },
  {
    action: 'reject_conflicting_cases',
    affectedCaseIds,
    result: '충돌 사례를 rejected로 전환하고 재수집 대상으로 남깁니다.'
  },
  {
    action: 'request_recapture',
    affectedCaseIds,
    result: '동일 조건의 다중 시점 재촬영을 요청하고 현재 사례는 학습 후보에서 제외합니다.'
  }
];

const normalizeConflict = (conflict, index) => {
  const candidateLabels = unique(conflict?.labels || conflict?.candidateLabels || []);
  const affectedCaseIds = unique(conflict?.caseIds || conflict?.affectedCaseIds || []);
  const contentHash = compact(conflict?.contentHash || conflict?.content_hash);
  const normalized = {
    conflictId: `conflict-${String(index + 1).padStart(3, '0')}`,
    contentHash,
    affectedCaseIds,
    candidateLabels,
    requiresHumanDecision: true,
    autoResolveAllowed: false
  };
  return {
    ...normalized,
    conflictType: conflictTypeFor(normalized),
    decisionOptions: decisionOptionsFor(candidateLabels, affectedCaseIds)
  };
};

const buildVisionApprovedLabelConflictReviewPacket = ({
  generatedAt = new Date().toISOString(),
  readinessAudit = null,
  postHitlVerificationReport = null,
  sourceArtifacts = {}
} = {}) => {
  const readinessConflicts = conflictsFromReadinessAudit(readinessAudit);
  const postHitlConflicts = conflictsFromPostHitlReport(postHitlVerificationReport);
  const conflicts = (readinessConflicts.length > 0 ? readinessConflicts : postHitlConflicts)
    .map(normalizeConflict);
  const status = conflicts.length > 0 ? 'action_required' : 'clear';

  return {
    schemaVersion: 1,
    contractVersion: 'vision-approved-label-conflict-review-packet/v1',
    generatedAt,
    sourceSystem: 'mold-master-ai',
    targetSystem: 'quality_hitl',
    status,
    totalConflicts: conflicts.length,
    serviceWritesPerformed: false,
    localArtifactsWritten: true,
    policy: {
      requiresHumanReview: true,
      automaticCorrectionAllowed: false,
      allowGraphPromotion: false,
      allowReferenceLearning: false,
      allowModelTraining: false
    },
    conflicts,
    commonAgentReviewRequest: {
      reviewType: 'approved_label_conflict_resolution',
      requestedAction: status === 'action_required'
        ? 'resolve_approved_label_conflicts'
        : 'no_conflict_action_required',
      requiresHumanReview: status === 'action_required',
      allowGraphPromotion: false,
      allowReferenceLearning: false,
      itemCount: conflicts.length
    },
    sources: {
      readinessAudit: sourceArtifacts.readinessAudit || null,
      postHitlVerificationReport: sourceArtifacts.postHitlVerificationReport || null
    },
    recommendedAction: status === 'action_required'
      ? '라벨 충돌 그룹별로 정답 라벨 유지, needs_review 전환, rejected 전환, 재촬영 요청 중 하나를 사람이 결정하세요.'
      : '라벨 충돌 없음. 다음 readiness blocker를 확인하세요.'
  };
};

module.exports = {
  buildVisionApprovedLabelConflictReviewPacket
};
