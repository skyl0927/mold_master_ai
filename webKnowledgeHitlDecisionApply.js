const compact = value => String(value || '').replace(/\s+/g, ' ').trim();
const asArray = value => Array.isArray(value) ? value : [];

const countDecision = (updates, decision) =>
  asArray(updates).filter(item => compact(item?.decision) === decision).length;

const policy = () => ({
  requiresHumanReview: true,
  autoApplyAllowed: false,
  allowCentralIngestion: false,
  allowGraphPromotion: false,
  allowModelTraining: false
});

const sourcesFor = (verificationReport, sourceArtifacts = {}) => ({
  decisionPacket: sourceArtifacts.decisionPacket || verificationReport?.sources?.decisionPacket || null,
  collectionRoot: sourceArtifacts.collectionRoot || verificationReport?.sources?.collectionRoot || null,
  verificationReport: sourceArtifacts.verificationReport || null,
  reviewLedger: sourceArtifacts.reviewLedger || verificationReport?.sources?.reviewLedger || null
});

const actionFor = status => ({
  dry_run_ready: '검증된 Web Case HITL 판정을 확인한 뒤 같은 명령에 --apply를 붙여 로컬 HITL 원장에만 반영하세요.',
  applied: '로컬 HITL 원장 반영이 완료되었습니다. 이후 readiness를 재실행하고 중앙 후보 적재는 별도 수동 절차에서 진행하세요.',
  not_ready_for_apply: '판정 검증 보고서가 ready_for_local_hitl_import 상태가 아닙니다. HITL 판정 파일을 먼저 완성하고 검증하세요.',
  apply_target_mismatch: '현재 collection/hash와 맞지 않는 판정이 있어 원장 반영을 중단했습니다. 최신 템플릿으로 판정을 다시 검증하세요.',
  invalid_verification_report: 'Web Case HITL 판정 검증 보고서 계약을 확인하세요.'
}[status] || 'Web Case HITL apply 상태를 확인하세요.');

const buildReport = ({
  generatedAt,
  status,
  applyRequested,
  updates,
  appliedUpdates = 0,
  invalidTargets = [],
  localLedgerWritesPerformed = false,
  verificationReport,
  sourceArtifacts
}) => ({
  schemaVersion: 1,
  contractVersion: 'web-knowledge-hitl-decision-apply-report/v1',
  generatedAt,
  sourceSystem: 'mold-master-ai',
  targetSystem: 'mold-master-ai-local-hitl-ledger',
  status,
  applyRequested,
  serviceWritesPerformed: false,
  localArtifactsWritten: true,
  localLedgerWritesPerformed,
  policy: policy(),
  summary: {
    plannedUpdates: status === 'apply_target_mismatch' ? 0 : asArray(updates).length,
    appliedUpdates,
    invalidTargets: invalidTargets.length,
    approvedCards: countDecision(updates, 'approved'),
    needsChangesCards: countDecision(updates, 'needs_changes'),
    rejectedCards: countDecision(updates, 'rejected')
  },
  plannedUpdates: status === 'apply_target_mismatch'
    ? []
    : asArray(updates).map(item => ({
      caseId: compact(item?.caseId),
      sourceContentSha256: compact(item?.sourceContentSha256).toLowerCase(),
      decision: compact(item?.decision),
      reviewer: compact(item?.reviewer),
      reviewedAt: compact(item?.reviewedAt || item?.decidedAt)
    })),
  invalidTargets,
  sources: sourcesFor(verificationReport, sourceArtifacts),
  recommendedAction: actionFor(status)
});

const applyWebKnowledgeHitlDecisionVerificationReport = ({
  generatedAt = new Date().toISOString(),
  verificationReport = null,
  collection = null,
  ledger = null,
  apply = false,
  sourceArtifacts = {}
} = {}) => {
  const applyRequested = apply === true;
  if (
    verificationReport?.contractVersion
      !== 'web-knowledge-hitl-decision-verification-report/v1'
  ) {
    return buildReport({
      generatedAt,
      status: 'invalid_verification_report',
      applyRequested,
      updates: [],
      verificationReport,
      sourceArtifacts
    });
  }

  const updates = asArray(verificationReport?.importPlan?.localLedgerUpdates);
  if (verificationReport.status !== 'ready_for_local_hitl_import') {
    return buildReport({
      generatedAt,
      status: 'not_ready_for_apply',
      applyRequested,
      updates: [],
      verificationReport,
      sourceArtifacts
    });
  }

  if (!ledger || typeof ledger.importVerifiedUpdates !== 'function') {
    return buildReport({
      generatedAt,
      status: 'invalid_verification_report',
      applyRequested,
      updates,
      invalidTargets: [{
        code: 'ledger_import_unavailable',
        message: '로컬 HITL ledger가 검증된 batch import를 지원하지 않습니다.'
      }],
      verificationReport,
      sourceArtifacts
    });
  }

  const result = ledger.importVerifiedUpdates(asArray(collection?.cards), updates, {
    apply: applyRequested,
    importedAt: generatedAt
  });

  if (asArray(result.invalidTargets).length > 0) {
    return buildReport({
      generatedAt,
      status: 'apply_target_mismatch',
      applyRequested,
      updates: [],
      invalidTargets: result.invalidTargets,
      verificationReport,
      sourceArtifacts
    });
  }

  return buildReport({
    generatedAt,
    status: applyRequested ? 'applied' : 'dry_run_ready',
    applyRequested,
    updates: result.plannedUpdates,
    appliedUpdates: result.appliedUpdates,
    localLedgerWritesPerformed: result.writesPerformed === true,
    verificationReport,
    sourceArtifacts
  });
};

module.exports = {
  applyWebKnowledgeHitlDecisionVerificationReport
};
