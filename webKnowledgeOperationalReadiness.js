const compact = value => String(value || '').replace(/\s+/g, ' ').trim();
const asArray = value => Array.isArray(value) ? value : [];

const normalizePathText = value => compact(value).replace(/\\/g, '/').toLowerCase();

const keyFor = (caseId, sourceContentSha256) =>
  `${compact(caseId)}:${compact(sourceContentSha256).toLowerCase()}`;

const countByClass = cards => Object.fromEntries(
  [...new Set(asArray(cards).map(card => compact(card.defectClass)).filter(Boolean))]
    .sort()
    .map(defectClass => [
      defectClass,
      asArray(cards).filter(card => compact(card.defectClass) === defectClass).length
    ])
);

const collectionGateFor = ({ collection, targetCardCount }) => {
  const cards = asArray(collection?.cards);
  const cardCount = Number(collection?.integrity?.cardCount) || cards.length;
  const passed = collection?.integrity?.valid === true && cardCount >= targetCardCount;
  return {
    passed,
    status: passed ? 'passed' : 'failed',
    collectionRoot: compact(collection?.rootPath),
    cardCount,
    targetCardCount,
    additionalCardsRequired: Math.max(0, targetCardCount - cardCount),
    classCount: Object.keys(countByClass(cards)).length,
    classDistribution: countByClass(cards),
    verifiedImages: Number(collection?.integrity?.verifiedImages) || 0
  };
};

const matchesCollection = (artifactRoot, collectionRoot) => {
  if (!artifactRoot || !collectionRoot) return true;
  return normalizePathText(artifactRoot) === normalizePathText(collectionRoot);
};

const qualityGateFor = ({ qualityAudit, collection, targetCardCount }) => {
  if (!qualityAudit) {
    return {
      passed: false,
      status: 'missing',
      findingCount: 0,
      findings: []
    };
  }
  const cardCount = Number(qualityAudit.cardCount) || 0;
  const passed = qualityAudit.passed === true
    && Number(qualityAudit.findingCount) === 0
    && cardCount >= targetCardCount
    && matchesCollection(qualityAudit.collectionRoot, collection?.rootPath);
  return {
    passed,
    status: passed ? 'passed' : 'failed',
    collectionRoot: compact(qualityAudit.collectionRoot),
    cardCount,
    classCount: Number(qualityAudit.classCount) || 0,
    verifiedImages: Number(qualityAudit.verifiedImages) || 0,
    findingCount: Number(qualityAudit.findingCount) || 0,
    findings: asArray(qualityAudit.findings).slice(0, 20)
  };
};

const validationGateFor = ({
  commonAgentValidation,
  collection,
  targetCardCount,
  minimumQualityScore
}) => {
  if (!commonAgentValidation) {
    return {
      passed: false,
      status: 'missing',
      total: 0,
      passedCount: 0,
      failed: 0,
      minimumQualityScore: 0,
      nonPersisting: false
    };
  }
  const total = Number(commonAgentValidation.total) || 0;
  const passedCount = Number(commonAgentValidation.passed) || 0;
  const failed = Number(commonAgentValidation.failed) || 0;
  const score = Number(commonAgentValidation.minimumQualityScore) || 0;
  const nonPersisting =
    commonAgentValidation.mode === 'non_persisting_template_validation'
    && Number(commonAgentValidation.humanApprovalsCreated) === 0
    && Number(commonAgentValidation.centralIngestionsCreated) === 0
    && Number(commonAgentValidation.graphPromotionsCreated) === 0;
  const passed = total >= targetCardCount
    && passedCount >= targetCardCount
    && failed === 0
    && score >= minimumQualityScore
    && nonPersisting
    && matchesCollection(commonAgentValidation.collectionRoot, collection?.rootPath);
  return {
    passed,
    status: passed ? 'passed' : 'failed',
    commonAgentUrl: compact(commonAgentValidation.commonAgentUrl),
    total,
    passedCount,
    failed,
    minimumQualityScore: score,
    minimumRequiredQualityScore: minimumQualityScore,
    nonPersisting
  };
};

const hitlGateFor = ({ reviewQueue, targetCardCount }) => {
  const queue = asArray(reviewQueue);
  const approvedItems = queue.filter(item =>
    item?.decision === 'approved' && item?.isCurrent !== false
  );
  const staleItems = queue.filter(item => item?.isCurrent === false);
  const needsChanges = queue.filter(item => item?.decision === 'needs_changes' && item?.isCurrent !== false);
  const rejected = queue.filter(item => item?.decision === 'rejected' && item?.isCurrent !== false);
  const pending = queue.filter(item =>
    item?.isCurrent === false
    || !['approved', 'needs_changes', 'rejected'].includes(compact(item?.decision))
  );
  return {
    passed: approvedItems.length >= targetCardCount,
    status: approvedItems.length >= targetCardCount ? 'passed' : 'awaiting_review',
    total: queue.length,
    approved: approvedItems.length,
    pending: pending.length,
    needsChanges: needsChanges.length,
    rejected: rejected.length,
    stale: staleItems.length,
    approvalsRequired: targetCardCount,
    approvalsMissing: Math.max(0, targetCardCount - approvedItems.length),
    approvedKeys: approvedItems.map(item =>
      keyFor(item?.card?.caseId, item?.sourceContentSha256)
    )
  };
};

const centralGateFor = ({ reviewQueue, ingestions, targetCardCount }) => {
  const approvedKeys = new Set(
    asArray(reviewQueue)
      .filter(item => item?.decision === 'approved' && item?.isCurrent !== false)
      .map(item => keyFor(item?.card?.caseId, item?.sourceContentSha256))
  );
  const currentIngestions = asArray(ingestions).filter(item =>
    approvedKeys.has(keyFor(item?.caseId, item?.sourceContentSha256))
  );
  const ingested = currentIngestions.filter(item => item?.status === 'succeeded');
  const approved = ingested.filter(item => item?.centralReviewStatus === 'approved');
  return {
    passed: approved.length >= targetCardCount,
    status: approved.length >= targetCardCount ? 'passed' : 'awaiting_central_approval',
    approvedLocalKeys: approvedKeys.size,
    ingestedCandidates: ingested.length,
    approvedDocuments: approved.length,
    ingestionsMissing: Math.max(0, targetCardCount - ingested.length),
    approvalsMissing: Math.max(0, targetCardCount - approved.length)
  };
};

const blocker = (code, detail = {}) => ({ code, ...detail });

const blockersFor = gates => {
  const blockers = [];
  if (!gates.collection.passed) {
    blockers.push(blocker('web_card_count_below_target', {
      current: gates.collection.cardCount,
      required: gates.collection.targetCardCount,
      missing: gates.collection.additionalCardsRequired
    }));
  }
  if (gates.qualityAudit.status === 'missing') {
    blockers.push(blocker('web_quality_audit_missing'));
  } else if (!gates.qualityAudit.passed) {
    blockers.push(blocker('web_quality_audit_failed', {
      findingCount: gates.qualityAudit.findingCount
    }));
  }
  if (gates.commonAgentValidation.status === 'missing') {
    blockers.push(blocker('common_agent_validation_missing'));
  } else if (!gates.commonAgentValidation.passed) {
    blockers.push(blocker('common_agent_validation_failed', {
      failed: gates.commonAgentValidation.failed,
      minimumQualityScore: gates.commonAgentValidation.minimumQualityScore
    }));
  }
  if (!gates.localHitl.passed) {
    blockers.push(blocker('web_hitl_approvals_missing', {
      current: gates.localHitl.approved,
      required: gates.localHitl.approvalsRequired,
      missing: gates.localHitl.approvalsMissing
    }));
  }
  if (gates.localHitl.passed && !gates.centralApproval.passed) {
    blockers.push(blocker('web_central_approvals_missing', {
      current: gates.centralApproval.approvedDocuments,
      required: gates.localHitl.approvalsRequired,
      missing: gates.centralApproval.approvalsMissing
    }));
  }
  return blockers;
};

const statusFor = ({ gates, blockers }) => {
  if (!gates.collection.passed || !gates.qualityAudit.passed) return 'action_required';
  if (!gates.commonAgentValidation.passed) return gates.commonAgentValidation.status === 'missing'
    ? 'awaiting_common_agent_validation'
    : 'action_required';
  if (!gates.localHitl.passed) return 'awaiting_hitl_review';
  if (!gates.centralApproval.passed) return 'awaiting_common_agent_approval';
  return blockers.length === 0 ? 'ready_for_graph_roundtrip' : 'action_required';
};

const actionFor = status => ({
  action_required: '웹 지식 수집 품질 audit과 Common Agent 비저장 검증 결과를 먼저 수정하세요.',
  awaiting_common_agent_validation: 'npm run knowledge:web:validate-common-agent로 Common Agent 비저장 템플릿 검증을 실행하세요.',
  awaiting_hitl_review: '앱의 DATABASE TREE > Web Case HITL에서 40건 이상을 사람이 검토 승인하세요.',
  awaiting_common_agent_approval: '승인된 Web Case를 Common Agent 후보로 적재하고 중앙 승인 + Graph 활성화를 완료하세요.',
  ready_for_graph_roundtrip: '승인된 Web Case에서 Graph 왕복 검증을 실행해 graph_approved_only 근거 경로를 확인하세요.'
}[status] || '웹 지식 운영 준비 상태를 확인하세요.');

const buildWebKnowledgeOperationalReadiness = ({
  generatedAt = new Date().toISOString(),
  collection = null,
  qualityAudit = null,
  commonAgentValidation = null,
  reviewQueue = [],
  ingestions = [],
  targetCardCount = 40,
  minimumQualityScore = 80,
  sourceArtifacts = {}
} = {}) => {
  const collectionGate = collectionGateFor({ collection, targetCardCount });
  const qualityAuditGate = qualityGateFor({ qualityAudit, collection, targetCardCount });
  const validationGate = validationGateFor({
    commonAgentValidation,
    collection,
    targetCardCount,
    minimumQualityScore
  });
  const localHitlGate = hitlGateFor({ reviewQueue, targetCardCount });
  const centralApprovalGate = centralGateFor({ reviewQueue, ingestions, targetCardCount });
  const gates = {
    collection: collectionGate,
    qualityAudit: qualityAuditGate,
    commonAgentValidation: validationGate,
    localHitl: localHitlGate,
    centralApproval: centralApprovalGate
  };
  const blockers = blockersFor(gates);
  const status = statusFor({ gates, blockers });
  const readyForCommonAgentLearning =
    gates.collection.passed
    && gates.qualityAudit.passed
    && gates.commonAgentValidation.passed
    && gates.localHitl.passed
    && gates.centralApproval.passed;

  return {
    schemaVersion: 1,
    contractVersion: 'web-knowledge-operational-readiness/v1',
    generatedAt,
    status,
    serviceWritesPerformed: false,
    localArtifactsWritten: true,
    readyForCommonAgentLearning,
    readyForGraphRoundtrip: readyForCommonAgentLearning,
    policy: {
      requiresHumanReview: true,
      autoApprovalAllowed: false,
      autoIngestionAllowed: false,
      allowGraphPromotionBeforeCentralApproval: false,
      modelTrainingAllowedBeforeRoundtrip: false
    },
    summary: {
      targetCardCount,
      cardCount: gates.collection.cardCount,
      additionalCardsRequired: gates.collection.additionalCardsRequired,
      classCount: gates.collection.classCount,
      verifiedImages: gates.collection.verifiedImages,
      commonAgentValidationPassed: gates.commonAgentValidation.passedCount,
      commonAgentValidationFailed: gates.commonAgentValidation.failed,
      approvedHitlCards: gates.localHitl.approved,
      hitlApprovalsMissing: gates.localHitl.approvalsMissing,
      centralIngestedCandidates: gates.centralApproval.ingestedCandidates,
      centralApprovedDocuments: gates.centralApproval.approvedDocuments,
      centralApprovalsMissing: gates.centralApproval.approvalsMissing
    },
    gates,
    blockers,
    sources: {
      collectionRoot: compact(collection?.rootPath) || null,
      qualityAudit: sourceArtifacts.qualityAudit || null,
      commonAgentValidation: sourceArtifacts.commonAgentValidation || null,
      reviewLedger: sourceArtifacts.reviewLedger || null,
      ingestionLedger: sourceArtifacts.ingestionLedger || null
    },
    recommendedAction: actionFor(status)
  };
};

module.exports = {
  buildWebKnowledgeOperationalReadiness
};
