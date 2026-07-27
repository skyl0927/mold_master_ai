const asArray = value => Array.isArray(value) ? value : [];

const compact = value => String(value || '').replace(/\s+/g, ' ').trim();

const normalizeHash = value => compact(value).toLowerCase();

const unique = values => [...new Set(values.map(compact).filter(Boolean))];

const defaultActions = [
  'keep_label',
  'mark_needs_review',
  'reject_conflicting_cases',
  'request_recapture'
];

const allowedActionsFor = conflict => {
  const actions = asArray(conflict?.decisionOptions)
    .map(option => compact(option?.action))
    .filter(Boolean);
  return new Set(actions.length > 0 ? unique(actions) : defaultActions);
};

const reviewerIdFor = (decision, decisionPacket) => compact(
  decision?.reviewerId
  || decision?.reviewedBy
  || decisionPacket?.reviewer?.id
  || decisionPacket?.reviewerId
);

const invalid = (decision, code, message) => ({
  conflictId: compact(decision?.conflictId),
  contentHash: normalizeHash(decision?.contentHash),
  action: compact(decision?.action),
  code,
  message
});

const sameSet = (left, right) => {
  const leftItems = unique(left || []).sort();
  const rightItems = unique(right || []).sort();
  return leftItems.length === rightItems.length
    && leftItems.every((item, index) => item === rightItems[index]);
};

const acceptedBase = ({
  decision,
  decisionPacket,
  conflict
}) => ({
  conflictId: compact(conflict?.conflictId),
  contentHash: normalizeHash(conflict?.contentHash),
  action: compact(decision?.action),
  affectedCaseIds: unique(conflict?.affectedCaseIds || []),
  candidateLabels: unique(conflict?.candidateLabels || []),
  selectedLabel: compact(decision?.selectedLabel),
  reviewerId: reviewerIdFor(decision, decisionPacket),
  reviewComment: compact(decision?.reviewComment || decision?.reason),
  decidedAt: new Date(decision?.decidedAt || decisionPacket?.reviewedAt).toISOString(),
  requestedViews: unique(decision?.requestedViews || decision?.requiredViews || []),
  requiresManualImport: true,
  graphPromotionAllowed: false,
  referenceLearningAllowed: false,
  modelTrainingAllowed: false
});

const validateDecision = ({
  decision,
  decisionPacket,
  conflict,
  seenConflictIds
}) => {
  const conflictId = compact(decision?.conflictId);
  if (seenConflictIds.has(conflictId)) {
    return { invalid: invalid(decision, 'duplicate_decision', '동일 conflictId에 대한 중복 판정입니다.') };
  }
  seenConflictIds.add(conflictId);

  if (!conflict) {
    return { invalid: invalid(decision, 'unknown_conflict', '판정 대상 conflictId가 현재 라벨 충돌 패킷에 없습니다.') };
  }

  const expectedHash = normalizeHash(conflict?.contentHash);
  const decisionHash = normalizeHash(decision?.contentHash);
  if (expectedHash !== decisionHash) {
    return { invalid: invalid(decision, 'content_hash_mismatch', '판정 content hash가 충돌 그룹 hash와 일치하지 않습니다.') };
  }

  if (!sameSet(decision?.affectedCaseIds, conflict?.affectedCaseIds)) {
    return { invalid: invalid(decision, 'affected_cases_mismatch', '판정 case id 목록이 충돌 그룹과 일치하지 않습니다.') };
  }

  const action = compact(decision?.action);
  if (!allowedActionsFor(conflict).has(action)) {
    return { invalid: invalid(decision, 'unsupported_action', '해당 충돌 그룹에서 허용되지 않은 action입니다.') };
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

  if (action === 'keep_label') {
    if (decision?.imageSetConfirmed !== true) {
      return { invalid: invalid(decision, 'missing_image_set_confirmation', '정답 라벨 유지에는 이미지 그룹 확인이 필요합니다.') };
    }
    if (decision?.labelConfirmed !== true) {
      return { invalid: invalid(decision, 'missing_label_confirmation', '정답 라벨 유지에는 최종 라벨 확인이 필요합니다.') };
    }
    if (!unique(conflict?.candidateLabels || []).includes(compact(decision?.selectedLabel))) {
      return { invalid: invalid(decision, 'selected_label_not_in_candidates', '선택한 라벨이 충돌 그룹 후보 라벨에 없습니다.') };
    }
  }

  if (action === 'request_recapture' && unique(decision?.requestedViews || decision?.requiredViews || []).length === 0) {
    return { invalid: invalid(decision, 'missing_requested_views', '재촬영 요청에는 필요한 촬영 시점이 필요합니다.') };
  }

  return {
    accepted: acceptedBase({
      decision,
      decisionPacket,
      conflict
    })
  };
};

const buildImportPlan = acceptedDecisions => ({
  resolvedLabelConflicts: acceptedDecisions
    .filter(decision => decision.action === 'keep_label')
    .map(decision => ({
      ...decision,
      requiresManualImport: true,
      graphPromotionAllowed: false,
      referenceLearningAllowed: false
    })),
  needsReviewConflicts: acceptedDecisions
    .filter(decision => decision.action === 'mark_needs_review'),
  rejectedConflicts: acceptedDecisions
    .filter(decision => decision.action === 'reject_conflicting_cases'),
  recaptureRequests: acceptedDecisions
    .filter(decision => decision.action === 'request_recapture')
});

const summarize = ({
  conflicts,
  decisions,
  acceptedDecisions,
  invalidDecisions,
  pendingConflicts,
  importPlan
}) => ({
  conflicts: conflicts.length,
  decisionsReceived: decisions.length,
  acceptedDecisions: acceptedDecisions.length,
  invalidDecisions: invalidDecisions.length,
  pendingConflicts: pendingConflicts.length,
  resolvedLabelConflicts: importPlan.resolvedLabelConflicts.length,
  needsReviewConflicts: importPlan.needsReviewConflicts.length,
  rejectedConflicts: importPlan.rejectedConflicts.length,
  recaptureRequests: importPlan.recaptureRequests.length
});

const statusFor = ({ conflictPacket, conflicts, decisions, acceptedDecisions, invalidDecisions }) => {
  if (!conflictPacket || !Array.isArray(conflictPacket?.conflicts)) return 'missing_conflict_packet';
  if (conflicts.length === 0) return 'clear';
  if (decisions.length === 0) return 'awaiting_human_review';
  if (invalidDecisions.length > 0) return 'invalid_decisions';
  if (acceptedDecisions.length < conflicts.length) return 'partial_human_review';
  return 'ready_for_manual_import';
};

const recommendedActionFor = status => ({
  missing_conflict_packet: 'vision:label-conflicts:packet 명령으로 승인 라벨 충돌 검토 패킷을 먼저 생성하세요.',
  clear: '승인 라벨 충돌이 없습니다. 다음 readiness blocker를 확인하세요.',
  awaiting_human_review: '품질/HITL 담당자의 라벨 충돌 판정 파일을 수집한 뒤 verify-decisions로 검증하세요.',
  invalid_decisions: '유효하지 않은 라벨 충돌 판정을 수정한 뒤 다시 검증하세요. 자동 import와 Graph 승격은 금지됩니다.',
  partial_human_review: '아직 닫히지 않은 라벨 충돌 그룹을 추가 검토하세요.',
  ready_for_manual_import: '검증된 라벨 충돌 해소안만 별도 수동 import 절차로 넘기세요. 이 보고서는 직접 쓰기를 수행하지 않습니다.'
}[status] || '승인 라벨 충돌 판정 상태를 확인하세요.');

const buildVisionApprovedLabelConflictDecisionVerificationReport = ({
  generatedAt = new Date().toISOString(),
  conflictPacket = null,
  decisionPacket = null,
  sourceArtifacts = {}
} = {}) => {
  const conflicts = asArray(conflictPacket?.conflicts);
  const conflictById = new Map(conflicts.map(conflict => [compact(conflict?.conflictId), conflict]));
  const decisions = asArray(decisionPacket?.decisions);
  const seenConflictIds = new Set();
  const acceptedDecisions = [];
  const invalidDecisions = [];

  decisions.forEach(decision => {
    const result = validateDecision({
      decision,
      decisionPacket,
      conflict: conflictById.get(compact(decision?.conflictId)),
      seenConflictIds
    });
    if (result.accepted) acceptedDecisions.push(result.accepted);
    if (result.invalid) invalidDecisions.push(result.invalid);
  });

  const acceptedConflictIds = new Set(acceptedDecisions.map(decision => decision.conflictId));
  const pendingConflicts = conflicts
    .filter(conflict => !acceptedConflictIds.has(compact(conflict?.conflictId)))
    .map(conflict => ({
      conflictId: compact(conflict?.conflictId),
      contentHash: normalizeHash(conflict?.contentHash),
      affectedCaseIds: unique(conflict?.affectedCaseIds || []),
      candidateLabels: unique(conflict?.candidateLabels || []),
      conflictType: compact(conflict?.conflictType)
    }));
  const importPlan = buildImportPlan(acceptedDecisions);
  const status = statusFor({
    conflictPacket,
    conflicts,
    decisions,
    acceptedDecisions,
    invalidDecisions
  });

  return {
    schemaVersion: 1,
    contractVersion: 'vision-approved-label-conflict-decision-verification-report/v1',
    generatedAt,
    sourceSystem: 'mold-master-ai',
    targetSystem: 'quality_hitl',
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
      conflicts,
      decisions,
      acceptedDecisions,
      invalidDecisions,
      pendingConflicts,
      importPlan
    }),
    acceptedDecisions,
    invalidDecisions,
    pendingConflicts,
    importPlan,
    sources: {
      conflictPacket: sourceArtifacts.conflictPacket || null,
      decisionPacket: sourceArtifacts.decisionPacket || null
    },
    recommendedAction: recommendedActionFor(status)
  };
};

module.exports = {
  buildVisionApprovedLabelConflictDecisionVerificationReport
};
