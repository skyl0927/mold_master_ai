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

const caseMapFromManifest = approvedManifest => new Map(
  asArray(approvedManifest?.cases)
    .map(caseEntry => [compact(caseEntry?.id), caseEntry])
    .filter(([caseId]) => caseId)
);

const fixtureForCaseId = (fixturesByCaseId, caseId) => {
  if (fixturesByCaseId instanceof Map) return fixturesByCaseId.get(caseId) || null;
  if (Array.isArray(fixturesByCaseId)) {
    return fixturesByCaseId.find(fixture => compact(fixture?.id) === caseId) || null;
  }
  return fixturesByCaseId?.[caseId] || null;
};

const normalizeCaptureProtocol = captureProtocol => ({
  imageKind: compact(captureProtocol?.imageKind || 'unknown') || 'unknown',
  availableViews: unique(captureProtocol?.availableViews || []),
  roiConfirmed: Boolean(captureProtocol?.roiConfirmed),
  metadataSource: compact(captureProtocol?.metadataSource)
});

const normalizeSourceReview = sourceReview => ({
  reviewStatus: compact(sourceReview?.reviewStatus),
  reviewedAt: compact(sourceReview?.reviewedAt),
  sourceSystem: compact(sourceReview?.sourceSystem),
  priorObservationDefectType: compact(sourceReview?.priorObservationDefectType),
  originalVisionDefectType: compact(sourceReview?.originalVisionDefectType),
  priorObservationSummary: compact(sourceReview?.priorObservationSummary)
});

const humanReviewFocusFor = ({ conflictType, candidateLabels, caseId, fixtureFound }) => {
  const labels = candidateLabels.join(', ') || '후보 라벨';
  if (!fixtureFound) {
    return `${caseId}의 approved fixture 원본을 먼저 복구한 뒤 라벨 충돌을 판정하세요.`;
  }
  if (conflictType === 'same_hash_multi_label') {
    return `동일 이미지 hash에서 ${labels} 중 실제 지배 결함이 무엇인지 원본 이미지와 prior/original 비전 관찰을 함께 확인하세요.`;
  }
  if (conflictType === 'single_record_multi_label') {
    return `단일 승인 record에서 ${labels}가 충돌합니다. 승인 라벨과 기존 비전 관찰 중 Graph 학습에 남길 정답 라벨을 확인하세요.`;
  }
  return `${caseId}의 원본 이미지, 승인 라벨, 기존 비전 관찰을 비교해 Graph/Reference 학습에 남길 라벨을 확인하세요.`;
};

const caseEvidenceFor = ({
  caseId,
  conflictType,
  candidateLabels,
  manifestCase,
  fixture
}) => {
  const fixtureFound = Boolean(fixture);
  return {
    caseId,
    fixtureFound,
    manifestListed: Boolean(manifestCase),
    manifestStatus: compact(manifestCase?.status),
    manifestTags: unique(manifestCase?.tags || []),
    fixtureFile: compact(manifestCase?.file),
    title: compact(fixture?.title),
    commonAgentImageId: compact(fixture?.commonAgentImageId),
    fileName: compact(fixture?.fileName),
    mimeType: compact(fixture?.mimeType),
    contentHash: compact(fixture?.contentHash).toLowerCase(),
    expectedDefectType: compact(fixture?.expected?.defectType),
    expectedDefectClass: compact(fixture?.expected?.defectClass),
    captureProtocol: normalizeCaptureProtocol(fixture?.captureProtocol),
    sourceReview: normalizeSourceReview(fixture?.sourceReview),
    humanReviewFocusKo: humanReviewFocusFor({
      conflictType,
      candidateLabels,
      caseId,
      fixtureFound
    })
  };
};

const reviewEvidenceStatusFor = caseEvidence => {
  if (caseEvidence.length === 0) return 'fixture_evidence_missing';
  const foundCount = caseEvidence.filter(evidence => evidence.fixtureFound).length;
  if (foundCount === caseEvidence.length) return 'fixture_evidence_ready';
  if (foundCount > 0) return 'fixture_evidence_partial';
  return 'fixture_evidence_missing';
};

const summarizeEvidence = conflicts => {
  const allEvidence = conflicts.flatMap(conflict => asArray(conflict.caseEvidence));
  return {
    evidenceReadyCases: allEvidence.filter(evidence => evidence.fixtureFound).length,
    evidenceMissingCases: allEvidence.filter(evidence => !evidence.fixtureFound).length,
    manifestUnlistedCases: allEvidence.filter(evidence => evidence.fixtureFound && !evidence.manifestListed).length,
    evidenceReadyConflicts: conflicts.filter(
      conflict => conflict.reviewEvidenceStatus === 'fixture_evidence_ready'
    ).length,
    evidencePartialConflicts: conflicts.filter(
      conflict => conflict.reviewEvidenceStatus === 'fixture_evidence_partial'
    ).length,
    evidenceMissingConflicts: conflicts.filter(
      conflict => conflict.reviewEvidenceStatus === 'fixture_evidence_missing'
    ).length
  };
};

const normalizeConflict = (conflict, index, context = {}) => {
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
  const conflictType = conflictTypeFor(normalized);
  const caseEvidence = affectedCaseIds.map(caseId => caseEvidenceFor({
    caseId,
    conflictType,
    candidateLabels,
    manifestCase: context.manifestCasesById?.get(caseId),
    fixture: fixtureForCaseId(context.fixturesByCaseId, caseId)
  }));
  return {
    ...normalized,
    conflictType,
    reviewEvidenceStatus: reviewEvidenceStatusFor(caseEvidence),
    caseEvidence,
    decisionOptions: decisionOptionsFor(candidateLabels, affectedCaseIds)
  };
};

const buildVisionApprovedLabelConflictReviewPacket = ({
  generatedAt = new Date().toISOString(),
  readinessAudit = null,
  postHitlVerificationReport = null,
  approvedManifest = null,
  fixturesByCaseId = {},
  approvedFixtureRoot = '',
  sourceArtifacts = {}
} = {}) => {
  const readinessConflicts = conflictsFromReadinessAudit(readinessAudit);
  const postHitlConflicts = conflictsFromPostHitlReport(postHitlVerificationReport);
  const context = {
    manifestCasesById: caseMapFromManifest(approvedManifest),
    fixturesByCaseId
  };
  const conflicts = (readinessConflicts.length > 0 ? readinessConflicts : postHitlConflicts)
    .map((conflict, index) => normalizeConflict(conflict, index, context));
  const status = conflicts.length > 0 ? 'action_required' : 'clear';
  const evidenceSummary = summarizeEvidence(conflicts);

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
    summary: {
      conflicts: conflicts.length,
      ...evidenceSummary
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
      postHitlVerificationReport: sourceArtifacts.postHitlVerificationReport || null,
      approvedFixtureRoot: sourceArtifacts.approvedFixtureRoot || approvedFixtureRoot || null,
      approvedManifest: sourceArtifacts.approvedManifest || null
    },
    recommendedAction: status === 'action_required'
      ? '라벨 충돌 그룹별로 정답 라벨 유지, needs_review 전환, rejected 전환, 재촬영 요청 중 하나를 사람이 결정하세요.'
      : '라벨 충돌 없음. 다음 readiness blocker를 확인하세요.'
  };
};

module.exports = {
  buildVisionApprovedLabelConflictReviewPacket
};
