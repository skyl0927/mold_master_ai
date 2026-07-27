const asArray = value => Array.isArray(value) ? value : [];

const compact = value => String(value || '').replace(/\s+/g, ' ').trim();

const sameVersionSnapshot = (left, right) =>
  compact(left?.modelVersion) === compact(right?.modelVersion)
  && compact(left?.promptVersion) === compact(right?.promptVersion)
  && compact(left?.graphVersion) === compact(right?.graphVersion);

const withSource = (source, blocker = {}) => ({
  ...blocker,
  code: compact(blocker.code) || `${source}_blocked`,
  source
});

const releaseEvidenceAlignmentFor = (releaseReport, releaseEvidenceAlignment) =>
  releaseEvidenceAlignment
  || releaseReport?.evidenceAlignment
  || {
    contractVersion: 'vision-operational-evidence-alignment/v1',
    passed: false,
    issues: [{ check: 'evidence_alignment_missing' }]
  };

const releaseEvidenceComplete = releaseReport =>
  releaseReport?.evidenceBundle?.complete === true
  && releaseReport?.decisionCard?.evidenceBundle?.complete === true;

const referenceGate = report => {
  const passed = report?.readyForGraphRetrieval === true && compact(report?.status) === 'passed';
  const blockers = [];
  if (!report) {
    blockers.push({ source: 'reference', code: 'reference_gate_missing' });
  } else if (!passed) {
    blockers.push({
      source: 'reference',
      code: 'reference_gate_not_ready',
      status: report.status || null
    });
    blockers.push(...asArray(report.blockers).map(blocker => withSource('reference', blocker)));
  }
  return {
    passed,
    status: report?.status || null,
    readyForGraphRetrieval: report?.readyForGraphRetrieval === true,
    benchmarkExecuted: report?.benchmarkExecuted === true,
    referenceCount: Number(report?.referenceStore?.referenceCount) || 0,
    modelVersion: report?.referenceStore?.modelVersion || null,
    top1Accuracy: Number(report?.benchmark?.top1Accuracy) || 0,
    top3Accuracy: Number(report?.benchmark?.top3Accuracy) || 0,
    blockers
  };
};

const postHitlGate = report => {
  const passed =
    report?.readyToDisableLegacyFallback === true
    && report?.benchmarksExecuted === true
    && compact(report?.status) === 'passed';
  const blockers = [];
  if (!report) {
    blockers.push({ source: 'post_hitl', code: 'post_hitl_verification_missing' });
  } else if (!passed) {
    blockers.push({
      source: 'post_hitl',
      code: 'post_hitl_verification_not_passed',
      status: report.status || null
    });
    blockers.push(...asArray(report.blockers).map(blocker => withSource('post_hitl', blocker)));
  }
  return {
    passed,
    status: report?.status || null,
    readyToDisableLegacyFallback: report?.readyToDisableLegacyFallback === true,
    benchmarksExecuted: report?.benchmarksExecuted === true,
    vision: report?.vision || null,
    graph: report?.graph || null,
    blockers
  };
};

const releaseGate = (releaseReport, releaseEvidenceAlignment) => {
  const evidenceAlignment = releaseEvidenceAlignmentFor(releaseReport, releaseEvidenceAlignment);
  const evidenceComplete = releaseEvidenceComplete(releaseReport);
  const operatorDecision = releaseReport?.operatorDecision || null;
  const operatorConfirmed =
    operatorDecision?.status === 'confirmed'
    && operatorDecision?.confirmed === true
    && operatorDecision?.action === 'activate_candidate'
    && operatorDecision?.autoApplied === false
    && sameVersionSnapshot(operatorDecision?.targetVersion, releaseReport?.candidateVersion)
    && operatorDecision?.reportGeneratedAt === releaseReport?.generatedAt
    && operatorDecision?.reportDecision === releaseReport?.decision;
  const candidateAllowed =
    releaseReport?.releaseAllowed === true
    && releaseReport?.decision === 'promote_candidate'
    && releaseReport?.decisionCard?.status === 'ready_to_promote'
    && releaseReport?.decisionCard?.primaryAction === 'activate_candidate';
  const passed =
    candidateAllowed
    && evidenceAlignment.passed === true
    && evidenceComplete
    && releaseReport?.decisionCard?.autoApplyAllowed === false
    && releaseReport?.decisionCard?.requiresHumanApproval === true;
  const blockers = [];

  if (!releaseReport) {
    blockers.push({ source: 'release', code: 'release_report_missing' });
  } else {
    if (evidenceAlignment.passed !== true) {
      blockers.push({
        source: 'release',
        code: 'release_evidence_alignment_failed',
        issues: asArray(evidenceAlignment.issues).map(issue => compact(issue.check || issue.message)).filter(Boolean)
      });
    }
    if (!evidenceComplete) {
      blockers.push({
        source: 'release',
        code: 'release_evidence_incomplete',
        missingEvidence: asArray(
          releaseReport.evidenceBundle?.missingEvidence
          || releaseReport.decisionCard?.evidenceBundle?.missingEvidence
        )
      });
    }
    if (!candidateAllowed) {
      blockers.push({
        source: 'release',
        code: 'candidate_release_not_allowed',
        decision: releaseReport.decision || null
      });
      blockers.push(...asArray(releaseReport.blockingReasons).map(code => ({
        source: 'release',
        code: compact(code)
      })));
    }
    if (operatorDecision && !operatorConfirmed) {
      blockers.push({
        source: 'release',
        code: 'operator_decision_mismatch',
        action: operatorDecision.action || null
      });
    }
  }

  return {
    passed,
    decision: releaseReport?.decision || null,
    releaseAllowed: releaseReport?.releaseAllowed === true,
    evidenceAligned: evidenceAlignment.passed === true,
    evidenceComplete,
    operatorConfirmed,
    primaryAction: releaseReport?.decisionCard?.primaryAction || null,
    targetVersion: releaseReport?.decisionCard?.targetVersion || releaseReport?.candidateVersion || null,
    blockers
  };
};

const buildRecommendedAction = (status, blockers) => {
  if (status === 'approved_for_manual_activation') {
    return 'Manual candidate activation can proceed after the operator follows the release card. Automatic activation remains disabled.';
  }
  if (status === 'ready_for_operator_approval') {
    return 'All machine gates passed. Record the operator approval before manual Vision candidate activation.';
  }
  if (blockers.some(blocker => blocker.source === 'reference')) {
    return 'Resolve the Vision reference store or benchmark gate, then rerun the operational readiness audit.';
  }
  if (blockers.some(blocker => blocker.source === 'post_hitl')) {
    return 'Complete post-HITL verification and Graph benchmark closure before candidate activation.';
  }
  if (blockers.some(blocker => blocker.source === 'release')) {
    return 'Rebuild the operational release report with complete evidence alignment before operator approval.';
  }
  return 'Resolve readiness blockers, then rerun the Vision operational readiness audit.';
};

const buildVisionOperationalReadinessAudit = ({
  generatedAt = new Date().toISOString(),
  referenceGateReport = null,
  postHitlVerificationReport = null,
  releaseReport = null,
  releaseEvidenceAlignment = null
} = {}) => {
  const reference = referenceGate(referenceGateReport);
  const postHitl = postHitlGate(postHitlVerificationReport);
  const release = releaseGate(releaseReport, releaseEvidenceAlignment);
  const blockers = [
    ...reference.blockers,
    ...postHitl.blockers,
    ...release.blockers
  ];
  const pendingActions = [];
  let status = 'action_required';

  if (blockers.length === 0) {
    if (release.operatorConfirmed) {
      status = 'approved_for_manual_activation';
    } else {
      status = 'ready_for_operator_approval';
      pendingActions.push('operator_approval_required');
    }
  }

  return {
    schemaVersion: 1,
    contractVersion: 'vision-operational-readiness-audit/v1',
    generatedAt,
    status,
    readyForCandidateActivation: status === 'approved_for_manual_activation',
    autoActivationAllowed: false,
    serviceWritesPerformed: false,
    localArtifactsWritten: true,
    targetVersion: release.targetVersion,
    gates: {
      reference,
      postHitl,
      release
    },
    blockers,
    pendingActions,
    evidenceRefs: asArray(releaseReport?.evidenceBundle?.items)
      .map(item => item?.uri)
      .filter(Boolean),
    recommendedAction: buildRecommendedAction(status, blockers)
  };
};

module.exports = {
  buildVisionOperationalReadinessAudit
};
