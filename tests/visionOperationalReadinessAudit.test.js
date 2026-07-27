const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildVisionOperationalReadinessAudit
} = require('../visionOperationalReadinessAudit');

const baselineVersion = {
  modelVersion: 'vision-model-2026.06',
  promptVersion: 'vision-prompt-v5',
  graphVersion: 'approved-graph-42'
};

const candidateVersion = {
  modelVersion: 'vision-model-2026.07',
  promptVersion: 'vision-prompt-v6',
  graphVersion: 'approved-graph-43'
};

const evidenceBundle = {
  contractVersion: 'vision-operational-evidence-bundle/v1',
  complete: true,
  missingEvidence: [],
  items: [
    {
      kind: 'baseline_benchmark',
      uri: 'file:///artifacts/baseline-vision-report.json',
      sha256: 'a'.repeat(64)
    },
    {
      kind: 'candidate_benchmark',
      uri: 'file:///artifacts/candidate-vision-report.json',
      sha256: 'b'.repeat(64)
    },
    {
      kind: 'release_config',
      uri: 'file:///artifacts/vision-release-config.json',
      sha256: 'c'.repeat(64)
    },
    {
      kind: 'common_agent_dataset_export',
      uri: 'common-agent://datasets/images/export/approved-holdout-20260727'
    },
    {
      kind: 'graph_snapshot',
      uri: 'neo4j://mold-master/approved-graph-43'
    }
  ]
};

const referenceGatePassed = {
  schemaVersion: 1,
  status: 'passed',
  readyForGraphRetrieval: true,
  benchmarkExecuted: true,
  serviceWritesPerformed: true,
  referenceStore: {
    ready: true,
    referenceCount: 42,
    modelVersion: 'dinov2:facebook/dinov2-base',
    productionReady: true
  },
  benchmark: {
    evaluatedCount: 42,
    top1Accuracy: 0.91,
    top3Accuracy: 0.97,
    failedGateChecks: []
  },
  blockers: []
};

const postHitlPassed = {
  schemaVersion: 1,
  status: 'passed',
  readyToDisableLegacyFallback: true,
  benchmarksExecuted: true,
  serviceWritesPerformed: false,
  blockers: [],
  vision: {
    total: 40,
    readyToDisableLegacyFallback: true
  },
  graph: {
    total: 40,
    passed: 40,
    readyToRetireLegacyGraphRag: true
  }
};

const releaseReport = overrides => ({
  schemaVersion: 'vision-operational-release/v1',
  generatedAt: '2026-07-27T09:00:00.000Z',
  decision: 'promote_candidate',
  releaseAllowed: true,
  baselineVersion,
  candidateVersion,
  baseline: {},
  candidate: {},
  splitAudit: { passed: true, issues: [] },
  cohorts: [],
  checks: {},
  blockingReasons: [],
  evidenceBundle,
  evidenceAlignment: {
    contractVersion: 'vision-operational-evidence-alignment/v1',
    passed: true,
    issues: []
  },
  decisionCard: {
    contractVersion: 'vision-operational-decision-card/v1',
    status: 'ready_to_promote',
    severity: 'success',
    primaryAction: 'activate_candidate',
    title: '후보 Vision 버전 활성화 가능',
    summary: '모든 운영 gate가 통과했습니다.',
    operatorSteps: ['담당자 확인 후 후보 버전을 수동 활성화합니다.'],
    blockingReasons: [],
    targetVersion: candidateVersion,
    evidenceBundle,
    requiresHumanApproval: true,
    autoApplyAllowed: false
  },
  ...overrides
});

const operatorDecision = {
  contractVersion: 'vision-operational-operator-decision/v1',
  status: 'confirmed',
  action: 'activate_candidate',
  decisionCardStatus: 'ready_to_promote',
  reportDecision: 'promote_candidate',
  reportGeneratedAt: '2026-07-27T09:00:00.000Z',
  decidedAt: '2026-07-27T10:00:00.000Z',
  operator: 'quality-lead',
  comment: 'Field benchmark and graph evidence confirmed.',
  confirmed: true,
  targetVersion: candidateVersion,
  blockingReasons: [],
  evidenceBundle,
  autoApplied: false
};

test('readiness audit waits for operator approval after every machine gate passes', () => {
  const audit = buildVisionOperationalReadinessAudit({
    generatedAt: '2026-07-27T11:00:00.000Z',
    referenceGateReport: referenceGatePassed,
    postHitlVerificationReport: postHitlPassed,
    releaseReport: releaseReport()
  });

  assert.equal(audit.contractVersion, 'vision-operational-readiness-audit/v1');
  assert.equal(audit.status, 'ready_for_operator_approval');
  assert.equal(audit.readyForCandidateActivation, false);
  assert.equal(audit.autoActivationAllowed, false);
  assert.deepEqual(audit.blockers, []);
  assert.deepEqual(audit.pendingActions, ['operator_approval_required']);
  assert.equal(audit.gates.reference.passed, true);
  assert.equal(audit.gates.postHitl.passed, true);
  assert.equal(audit.gates.release.passed, true);
  assert.equal(audit.gates.release.operatorConfirmed, false);
  assert.match(audit.recommendedAction, /operator/i);
});

test('readiness audit approves only manual candidate activation after matching operator confirmation', () => {
  const audit = buildVisionOperationalReadinessAudit({
    generatedAt: '2026-07-27T11:00:00.000Z',
    referenceGateReport: referenceGatePassed,
    postHitlVerificationReport: postHitlPassed,
    releaseReport: releaseReport({ operatorDecision })
  });

  assert.equal(audit.status, 'approved_for_manual_activation');
  assert.equal(audit.readyForCandidateActivation, true);
  assert.equal(audit.autoActivationAllowed, false);
  assert.deepEqual(audit.pendingActions, []);
  assert.equal(audit.gates.release.operatorConfirmed, true);
  assert.deepEqual(audit.targetVersion, candidateVersion);
});

test('readiness audit aggregates reference, HITL, evidence, and release blockers fail-closed', () => {
  const audit = buildVisionOperationalReadinessAudit({
    referenceGateReport: {
      ...referenceGatePassed,
      status: 'blocked',
      readyForGraphRetrieval: false,
      blockers: [{ code: 'prototype_embedding_model' }]
    },
    postHitlVerificationReport: {
      ...postHitlPassed,
      status: 'failed',
      readyToDisableLegacyFallback: false,
      blockers: [{ code: 'graph_benchmark_failed' }]
    },
    releaseReport: releaseReport({
      decision: 'hold_shadow',
      releaseAllowed: false,
      blockingReasons: ['top1Accuracy'],
      evidenceAlignment: {
        contractVersion: 'vision-operational-evidence-alignment/v1',
        passed: false,
        issues: [{ check: 'graphSnapshotMatchesCandidateGraphVersion' }]
      },
      decisionCard: {
        ...releaseReport().decisionCard,
        status: 'shadow_hold',
        primaryAction: 'keep_shadow',
        blockingReasons: ['top1Accuracy']
      }
    })
  });

  assert.equal(audit.status, 'action_required');
  assert.equal(audit.readyForCandidateActivation, false);
  assert.deepEqual(
    audit.blockers.map(blocker => blocker.code),
    [
      'reference_gate_not_ready',
      'prototype_embedding_model',
      'post_hitl_verification_not_passed',
      'graph_benchmark_failed',
      'release_evidence_alignment_failed',
      'candidate_release_not_allowed',
      'top1Accuracy'
    ]
  );
});

test('readiness audit exposes pending HITL queue, template, and decision verification state', () => {
  const audit = buildVisionOperationalReadinessAudit({
    referenceGateReport: referenceGatePassed,
    postHitlVerificationReport: {
      ...postHitlPassed,
      status: 'waiting_for_human_hitl',
      readyToDisableLegacyFallback: false,
      benchmarksExecuted: false,
      blockers: [{
        code: 'human_review_required',
        count: 12
      }]
    },
    releaseReport: null,
    hitlQueuePacket: {
      contractVersion: 'vision-pending-hitl-review-queue-packet/v1',
      status: 'action_required',
      summary: {
        pendingHighConfidence: 12,
        resolvedHighConfidence: 6,
        pendingByClass: {
          sink: 3,
          burn: 3,
          flash: 3,
          short_shot: 2,
          weld_line: 1
        }
      },
      serviceWritesPerformed: false,
      items: Array.from({ length: 12 }, (_, index) => ({
        queueId: `pending-hitl-${String(index + 1).padStart(3, '0')}`
      }))
    },
    hitlDecisionTemplate: {
      contractVersion: 'common-agent-hitl-review-decisions/v1',
      templateVersion: 'common-agent-hitl-review-decisions-template/v1',
      status: 'template_ready',
      summary: {
        queueItems: 12,
        decisionsPrepared: 12
      },
      serviceWritesPerformed: false
    },
    hitlDecisionVerificationReport: {
      contractVersion: 'vision-pending-hitl-decision-verification-report/v1',
      status: 'awaiting_human_review',
      summary: {
        queueItems: 12,
        decisionsReceived: 0,
        acceptedDecisions: 0,
        invalidDecisions: 0,
        pendingQueueItems: 12
      },
      serviceWritesPerformed: false
    }
  });

  assert.equal(audit.status, 'action_required');
  assert.equal(audit.gates.hitlWorkflow.status, 'awaiting_human_review');
  assert.equal(audit.gates.hitlWorkflow.queue.status, 'action_required');
  assert.equal(audit.gates.hitlWorkflow.queue.pendingHighConfidence, 12);
  assert.equal(audit.gates.hitlWorkflow.template.status, 'template_ready');
  assert.equal(audit.gates.hitlWorkflow.template.decisionsPrepared, 12);
  assert.equal(audit.gates.hitlWorkflow.verification.status, 'awaiting_human_review');
  assert.equal(audit.gates.hitlWorkflow.verification.pendingQueueItems, 12);
  assert.equal(audit.gates.hitlWorkflow.policy.autoApplyAllowed, false);
  assert.equal(audit.gates.hitlWorkflow.policy.allowGraphPromotion, false);
  assert.match(audit.gates.hitlWorkflow.nextCommand, /vision:hitl:verify-decisions/);
});

test('readiness audit routes verified HITL decisions to the authorization bridge', () => {
  const audit = buildVisionOperationalReadinessAudit({
    referenceGateReport: referenceGatePassed,
    postHitlVerificationReport: {
      ...postHitlPassed,
      status: 'waiting_for_human_hitl',
      readyToDisableLegacyFallback: false,
      benchmarksExecuted: false,
      blockers: [{
        code: 'human_review_required',
        count: 12
      }]
    },
    hitlQueuePacket: {
      contractVersion: 'vision-pending-hitl-review-queue-packet/v1',
      status: 'action_required',
      summary: {
        pendingHighConfidence: 12,
        resolvedHighConfidence: 6
      },
      serviceWritesPerformed: false,
      items: Array.from({ length: 12 }, (_, index) => ({
        queueId: `pending-hitl-${String(index + 1).padStart(3, '0')}`
      }))
    },
    hitlDecisionTemplate: {
      contractVersion: 'common-agent-hitl-review-decisions/v1',
      status: 'template_ready',
      summary: {
        decisionsPrepared: 12
      },
      serviceWritesPerformed: false
    },
    hitlDecisionVerificationReport: {
      contractVersion: 'vision-pending-hitl-decision-verification-report/v1',
      status: 'ready_for_manual_import',
      summary: {
        queueItems: 12,
        decisionsReceived: 12,
        acceptedDecisions: 12,
        invalidDecisions: 0,
        pendingQueueItems: 0,
        approvalCandidates: 8,
        needsReviewItems: 1,
        rejectedCandidates: 1,
        recaptureRequests: 2
      },
      serviceWritesPerformed: false
    }
  });

  assert.equal(audit.gates.hitlWorkflow.status, 'ready_for_manual_import');
  assert.equal(audit.gates.hitlWorkflow.verification.approvalCandidates, 8);
  assert.equal(audit.gates.hitlWorkflow.nonApprovalWorklist.status, 'worklist_missing');
  assert.equal(audit.gates.hitlWorkflow.nonApprovalWorklist.totalItems, 4);
  assert.equal(audit.gates.hitlWorkflow.nonApprovalWorklist.needsReviewItems, 1);
  assert.equal(audit.gates.hitlWorkflow.nonApprovalWorklist.rejectedCandidates, 1);
  assert.equal(audit.gates.hitlWorkflow.nonApprovalWorklist.recaptureRequests, 2);
  assert.match(audit.gates.hitlWorkflow.nextCommand, /vision:hitl:authorization-bridge/);
  assert.ok(audit.gates.hitlWorkflow.nextCommands.some(command =>
    command.includes('vision:hitl:non-approval-worklist')
  ));
  assert.match(audit.gates.hitlWorkflow.nextActionKo, /authorization/);
});

test('readiness audit exposes generated non-approval worklist counts', () => {
  const audit = buildVisionOperationalReadinessAudit({
    referenceGateReport: referenceGatePassed,
    postHitlVerificationReport: {
      ...postHitlPassed,
      status: 'waiting_for_human_hitl',
      readyToDisableLegacyFallback: false,
      benchmarksExecuted: false,
      blockers: [{ code: 'human_review_required', count: 12 }]
    },
    hitlQueuePacket: {
      contractVersion: 'vision-pending-hitl-review-queue-packet/v1',
      status: 'action_required',
      summary: {
        pendingHighConfidence: 12,
        resolvedHighConfidence: 6
      },
      serviceWritesPerformed: false,
      items: Array.from({ length: 12 }, (_, index) => ({
        queueId: `pending-hitl-${String(index + 1).padStart(3, '0')}`
      }))
    },
    hitlDecisionTemplate: {
      contractVersion: 'common-agent-hitl-review-decisions/v1',
      status: 'template_ready',
      summary: { decisionsPrepared: 12 },
      serviceWritesPerformed: false
    },
    hitlDecisionVerificationReport: {
      contractVersion: 'vision-pending-hitl-decision-verification-report/v1',
      status: 'ready_for_manual_import',
      summary: {
        queueItems: 12,
        decisionsReceived: 12,
        acceptedDecisions: 12,
        invalidDecisions: 0,
        pendingQueueItems: 0,
        approvalCandidates: 8,
        needsReviewItems: 1,
        rejectedCandidates: 1,
        recaptureRequests: 2
      },
      serviceWritesPerformed: false
    },
    hitlNonApprovalWorklist: {
      contractVersion: 'vision-pending-hitl-non-approval-worklist/v1',
      status: 'action_required',
      summary: {
        totalItems: 4,
        needsReviewItems: 1,
        rejectedCandidates: 1,
        recaptureRequests: 2,
        approvalCandidatesExcluded: 8
      },
      serviceWritesPerformed: false
    }
  });

  assert.equal(audit.gates.hitlWorkflow.nonApprovalWorklist.status, 'action_required');
  assert.equal(audit.gates.hitlWorkflow.nonApprovalWorklist.totalItems, 4);
  assert.equal(audit.gates.hitlWorkflow.nonApprovalWorklist.approvalCandidatesExcluded, 8);
  assert.equal(audit.gates.hitlWorkflow.nonApprovalWorklist.serviceWritesPerformed, false);
});
