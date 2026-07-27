const {
  AUTHORIZATION_STATEMENT,
  computeVisionPacketDigest,
  validateVisionHitlAuthorization
} = require('./visionHitlAuthorization');

const compact = value => String(value || '').replace(/\s+/g, ' ').trim();
const normalizeHash = value => compact(value).toLowerCase();
const asArray = value => Array.isArray(value) ? value : [];

const latestIso = values => {
  const dates = values
    .map(value => Date.parse(String(value || '')))
    .filter(Number.isFinite)
    .sort((left, right) => right - left);
  return dates.length > 0 ? new Date(dates[0]).toISOString() : '';
};

const countByClass = targets => Object.fromEntries(
  [...new Set(targets.map(target => target.defectClass).filter(Boolean))]
    .sort()
    .map(defectClass => [
      defectClass,
      targets.filter(target => target.defectClass === defectClass).length
    ])
);

const sourceReferenceFor = candidate => compact(
  candidate?.sourceLineage?.webCaseId
  || candidate?.sourceLineage?.knowledgeId
  || candidate?.sourceLineage?.sourceDocumentId
);

const summarizeNonApprovals = importPlan => ({
  needsReviewItems: asArray(importPlan.needsReviewItems),
  rejectedCandidates: asArray(importPlan.rejectedCandidates),
  recaptureRequests: asArray(importPlan.recaptureRequests)
});

const statusSummary = ({
  status,
  approvalTargets = [],
  invalidTargets = [],
  importPlan = {},
  blockingStatus = ''
}) => ({
  approvalTargets: approvalTargets.length,
  targetsByClass: countByClass(approvalTargets),
  needsReviewItems: asArray(importPlan.needsReviewItems).length,
  rejectedCandidates: asArray(importPlan.rejectedCandidates).length,
  recaptureRequests: asArray(importPlan.recaptureRequests).length,
  invalidTargets: invalidTargets.length,
  blockingStatus: blockingStatus || undefined,
  status
});

const baseBridge = ({
  generatedAt,
  status,
  summary,
  decisionVerificationReport,
  sourceArtifacts,
  reviewManifest = null,
  packetRoot = '',
  authorization = null,
  invalidTargets = [],
  recommendedAction
}) => ({
  schemaVersion: 1,
  contractVersion: 'vision-pending-hitl-authorization-bridge/v1',
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
    allowModelTraining: false,
    liveApprovalRequiresExplicitRun: true
  },
  summary,
  authorization,
  invalidTargets,
  nonApprovalDecisions: summarizeNonApprovals(decisionVerificationReport?.importPlan || {}),
  sources: {
    decisionVerificationReport: sourceArtifacts.decisionVerificationReport || null,
    reviewManifest: sourceArtifacts.reviewManifest || null,
    packetRoot: compact(packetRoot) || null
  },
  packetDigest: reviewManifest ? computeVisionPacketDigest(reviewManifest) : null,
  recommendedAction
});

const buildAuthorizationTarget = ({ approval, candidate }) => ({
  relativePath: String(candidate.relativePath || '').replace(/\\/g, '/'),
  contentSha256: normalizeHash(approval.contentSha256),
  defectType: compact(candidate.defectType || approval.defectType),
  defectClass: compact(candidate.defectClass || approval.defectClass),
  sourceLabel: compact(candidate.labelEvidence?.sourceLabel),
  visionSuggestedLabel: compact(candidate.labelEvidence?.visionSuggestedLabel),
  visionConfidence: Number(candidate.labelEvidence?.visionConfidence) || 0,
  sourceKind: compact(candidate.sourceLineage?.packetSourceKind),
  sourceReference: sourceReferenceFor(candidate),
  decision: 'approve',
  manufacturingImageConfirmed: true,
  labelConfirmed: true,
  approvedDefectType: compact(approval.defectType),
  reviewComment: compact(approval.reviewComment)
});

const buildVisionPendingHitlAuthorizationBridge = ({
  generatedAt = new Date().toISOString(),
  decisionVerificationReport = null,
  reviewManifest = null,
  packetRoot = '',
  sourceArtifacts = {}
} = {}) => {
  const importPlan = decisionVerificationReport?.importPlan || {};
  if (!decisionVerificationReport) {
    return baseBridge({
      generatedAt,
      status: 'missing_decision_verification_report',
      summary: statusSummary({ status: 'missing_decision_verification_report' }),
      decisionVerificationReport,
      sourceArtifacts,
      reviewManifest,
      packetRoot,
      recommendedAction: 'vision:hitl:verify-decisions 보고서를 먼저 생성하세요.'
    });
  }

  if (compact(decisionVerificationReport.status) !== 'ready_for_manual_import') {
    const status = 'not_ready_for_manual_import';
    return baseBridge({
      generatedAt,
      status,
      summary: statusSummary({
        status,
        importPlan,
        blockingStatus: compact(decisionVerificationReport.status)
      }),
      decisionVerificationReport,
      sourceArtifacts,
      reviewManifest,
      packetRoot,
      recommendedAction: 'Common Agent HITL 판정을 모두 닫은 뒤 npm run vision:hitl:verify-decisions로 다시 검증하세요.'
    });
  }

  if (!reviewManifest || !Array.isArray(reviewManifest.candidates)) {
    const status = 'missing_review_manifest';
    return baseBridge({
      generatedAt,
      status,
      summary: statusSummary({ status, importPlan }),
      decisionVerificationReport,
      sourceArtifacts,
      reviewManifest,
      packetRoot,
      recommendedAction: '승인 대상이 묶인 review packet의 vision-candidates.json을 지정하세요.'
    });
  }

  const approvals = asArray(importPlan.approvalCandidates);
  if (approvals.length === 0) {
    const status = 'no_approval_candidates';
    return baseBridge({
      generatedAt,
      status,
      summary: statusSummary({ status, importPlan }),
      decisionVerificationReport,
      sourceArtifacts,
      reviewManifest,
      packetRoot,
      recommendedAction: '승인할 후보가 없습니다. 비승인 HITL 조치만 별도 운영 queue에서 처리하세요.'
    });
  }

  const candidatesByHash = new Map(
    asArray(reviewManifest.candidates)
      .map(candidate => [normalizeHash(candidate?.contentSha256), candidate])
      .filter(([hash]) => Boolean(hash))
  );
  const invalidTargets = approvals
    .filter(approval => !candidatesByHash.has(normalizeHash(approval.contentSha256)))
    .map(approval => ({
      queueId: compact(approval.queueId),
      contentSha256: normalizeHash(approval.contentSha256),
      defectType: compact(approval.defectType),
      defectClass: compact(approval.defectClass),
      code: 'missing_review_packet_candidate',
      message: '승인 판정 hash가 현재 review packet manifest에 없습니다.'
    }));

  if (invalidTargets.length > 0) {
    const status = 'authorization_target_mismatch';
    return baseBridge({
      generatedAt,
      status,
      summary: statusSummary({ status, importPlan, invalidTargets }),
      decisionVerificationReport,
      sourceArtifacts,
      reviewManifest,
      packetRoot,
      invalidTargets,
      recommendedAction: 'Common Agent 판정 파일과 review packet을 같은 세트로 맞춘 뒤 다시 authorization bridge를 생성하세요.'
    });
  }

  const approvalTargets = approvals.map(approval => buildAuthorizationTarget({
    approval,
    candidate: candidatesByHash.get(normalizeHash(approval.contentSha256))
  }));
  const reviewers = [...new Set(approvals.map(item => compact(item.reviewerId)).filter(Boolean))]
    .sort();
  const packetDigest = computeVisionPacketDigest(reviewManifest);
  const authorization = {
    schemaVersion: 1,
    authorizationId: `vision-hitl-import-${packetDigest.slice(0, 16)}`,
    generatedAt,
    packetRoot: compact(packetRoot),
    packetDigest,
    authorizationStatement: AUTHORIZATION_STATEMENT,
    authorizedBy: reviewers.join(', '),
    authorizedAt: latestIso(approvals.map(item => item.decidedAt)),
    instructions: [
      'This file was generated from a verified Common Agent HITL decision report.',
      'Only approve_candidate decisions are included; needs-review, reject, and recapture decisions remain manual actions.',
      'Run npm run vision:hitl:approve -- --authorization <authorization-json> only after confirming this file is the intended review packet binding.'
    ],
    summary: {
      totalTargets: approvalTargets.length,
      targetsByClass: countByClass(approvalTargets),
      writesPerformed: false,
      sourceDecisionReportStatus: compact(decisionVerificationReport.status),
      needsReviewItems: asArray(importPlan.needsReviewItems).length,
      rejectedCandidates: asArray(importPlan.rejectedCandidates).length,
      recaptureRequests: asArray(importPlan.recaptureRequests).length
    },
    targets: approvalTargets
  };

  try {
    validateVisionHitlAuthorization({
      authorization,
      manifest: reviewManifest,
      datasetItems: []
    });
  } catch (error) {
    const status = 'authorization_validation_failed';
    return baseBridge({
      generatedAt,
      status,
      summary: {
        ...statusSummary({ status, importPlan, approvalTargets }),
        validationError: error instanceof Error ? error.message : String(error)
      },
      decisionVerificationReport,
      sourceArtifacts,
      reviewManifest,
      packetRoot,
      invalidTargets: approvalTargets.map(target => ({
        contentSha256: target.contentSha256,
        defectType: target.defectType,
        defectClass: target.defectClass,
        code: 'authorization_validation_failed',
        message: error instanceof Error ? error.message : String(error)
      })),
      recommendedAction: '생성된 승인 대상이 기존 HITL authorization 검증을 통과하지 못했습니다. decision report와 review packet을 재확인하세요.'
    });
  }

  const status = 'ready_for_live_approval';
  return baseBridge({
    generatedAt,
    status,
    summary: statusSummary({ status, importPlan, approvalTargets }),
    decisionVerificationReport,
    sourceArtifacts,
    reviewManifest,
    packetRoot,
    authorization,
    recommendedAction: '검증된 승인 후보만 npm run vision:hitl:approve -- --authorization <authorization-json> 명령으로 수동 실행하세요.'
  });
};

module.exports = {
  buildVisionPendingHitlAuthorizationBridge
};
