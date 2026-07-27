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

const numberFrom = (...values) => {
  const value = values.find(item => Number.isFinite(Number(item)));
  return value === undefined ? 0 : Number(value);
};

const hitlWorkflowNext = status => ({
  missing_queue_packet: {
    command: 'npm run vision:hitl:pending-packet',
    actionKo: '미해결 HITL 후보 queue packet을 먼저 생성하세요.'
  },
  decision_template_missing: {
    command: 'npm run vision:hitl:decision-template',
    actionKo: 'Common Agent/HITL 담당자가 채울 판정 템플릿을 생성하세요.'
  },
  awaiting_decision_verification: {
    command: 'npm run vision:hitl:verify-decisions -- --decisions <filled-common-agent-hitl-decisions.json>',
    actionKo: '작성된 HITL 판정 파일을 검증하세요.'
  },
  awaiting_human_review: {
    command: 'npm run vision:hitl:verify-decisions -- --decisions <filled-common-agent-hitl-decisions.json>',
    actionKo: 'Common Agent/HITL 판정 파일을 작성하고 검증하세요.'
  },
  invalid_decisions: {
    command: 'npm run vision:hitl:verify-decisions -- --decisions <filled-common-agent-hitl-decisions.json>',
    actionKo: '유효하지 않은 HITL 판정을 수정하고 다시 검증하세요.'
  },
  partial_human_review: {
    command: 'npm run vision:hitl:verify-decisions -- --decisions <filled-common-agent-hitl-decisions.json>',
    actionKo: '남은 HITL queue item을 추가 검토하고 다시 검증하세요.'
  },
  ready_for_manual_import: {
    command: 'npm run vision:hitl:authorization-bridge -- --decision-verification <vision-pending-hitl-decision-verification-report.json>',
    actionKo: '검증된 판정을 live approval authorization으로 변환하세요.'
  },
  clear: {
    command: 'npm run migration:verify-post-hitl',
    actionKo: 'HITL blocker가 닫혔는지 post-HITL 검증을 다시 실행하세요.'
  }
}[status] || {
  command: 'npm run vision:hitl:pending-packet',
  actionKo: 'HITL workflow artifact 상태를 확인하세요.'
});

const hitlWorkflowGate = ({
  hitlQueuePacket,
  hitlDecisionTemplate,
  hitlDecisionVerificationReport
}) => {
  const queueItems = asArray(hitlQueuePacket?.items);
  const queuePending = numberFrom(
    hitlQueuePacket?.summary?.pendingHighConfidence,
    hitlQueuePacket?.summary?.queueItems,
    queueItems.length
  );
  const templateDecisions = asArray(hitlDecisionTemplate?.decisions);
  const decisionsPrepared = numberFrom(
    hitlDecisionTemplate?.summary?.decisionsPrepared,
    templateDecisions.length
  );
  const verificationSummary = hitlDecisionVerificationReport?.summary || {};
  const queueStatus = compact(hitlQueuePacket?.status) || 'missing_queue_packet';
  const templateStatus = compact(hitlDecisionTemplate?.status)
    || (queuePending > 0 ? 'missing_decision_template' : 'clear');
  const verificationStatus = compact(hitlDecisionVerificationReport?.status)
    || (queuePending > 0 ? 'awaiting_decision_verification' : 'clear');
  let status = 'clear';

  if (!hitlQueuePacket) {
    status = 'missing_queue_packet';
  } else if (queuePending <= 0 || queueStatus === 'clear') {
    status = 'clear';
  } else if (!hitlDecisionTemplate) {
    status = 'decision_template_missing';
  } else if (!hitlDecisionVerificationReport) {
    status = 'awaiting_decision_verification';
  } else {
    status = verificationStatus;
  }

  const next = hitlWorkflowNext(status);

  return {
    status,
    queue: {
      status: queueStatus,
      pendingHighConfidence: queuePending,
      resolvedHighConfidence: numberFrom(hitlQueuePacket?.summary?.resolvedHighConfidence),
      pendingByClass: hitlQueuePacket?.summary?.pendingByClass || {}
    },
    template: {
      status: templateStatus,
      decisionsPrepared
    },
    verification: {
      status: verificationStatus,
      decisionsReceived: numberFrom(verificationSummary.decisionsReceived),
      acceptedDecisions: numberFrom(verificationSummary.acceptedDecisions),
      invalidDecisions: numberFrom(verificationSummary.invalidDecisions),
      pendingQueueItems: numberFrom(verificationSummary.pendingQueueItems, queuePending),
      approvalCandidates: numberFrom(verificationSummary.approvalCandidates),
      recaptureRequests: numberFrom(verificationSummary.recaptureRequests)
    },
    policy: {
      requiresHumanReview: true,
      autoApplyAllowed: false,
      allowGraphPromotion: false,
      allowReferenceLearning: false,
      allowModelTraining: false
    },
    serviceWritesPerformed: hitlQueuePacket?.serviceWritesPerformed === true
      || hitlDecisionTemplate?.serviceWritesPerformed === true
      || hitlDecisionVerificationReport?.serviceWritesPerformed === true,
    nextCommand: next.command,
    nextActionKo: next.actionKo
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
  releaseEvidenceAlignment = null,
  hitlQueuePacket = null,
  hitlDecisionTemplate = null,
  hitlDecisionVerificationReport = null
} = {}) => {
  const reference = referenceGate(referenceGateReport);
  const postHitl = postHitlGate(postHitlVerificationReport);
  const hitlWorkflow = hitlWorkflowGate({
    hitlQueuePacket,
    hitlDecisionTemplate,
    hitlDecisionVerificationReport
  });
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
      hitlWorkflow,
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
