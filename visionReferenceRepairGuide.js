const asArray = value => Array.isArray(value) ? value : [];

const compact = value => String(value || '').replace(/\s+/g, ' ').trim();

const numberFrom = (...values) => {
  const value = values.find(item => Number.isFinite(Number(item)));
  return value === undefined ? 0 : Number(value);
};

const uniqueBlockers = blockers => {
  const byCode = new Map();
  for (const blocker of asArray(blockers)) {
    const code = compact(blocker?.code);
    if (!code) continue;
    const detail = compact(blocker?.detail);
    const existing = byCode.get(code);
    if (existing) {
      if (detail && !compact(existing.detail).includes(detail)) {
        existing.detail = compact(existing.detail)
          ? `${existing.detail} | ${detail}`
          : detail;
      }
      continue;
    }
    byCode.set(code, {
      source: compact(blocker?.source) || 'reference',
      code,
      detail: detail || null
    });
  }
  return [...byCode.values()];
};

const blockerByCode = (blockers, code) =>
  asArray(blockers).find(blocker => blocker?.code === code) || null;

const blockersBySource = (blockers, source) =>
  asArray(blockers).filter(blocker => blocker?.source === source);

const hasCode = (blockers, code) =>
  asArray(blockers).some(blocker => blocker?.code === code);

const isReadinessAudit = artifact =>
  artifact?.contractVersion === 'vision-operational-readiness-audit/v1';

const isReferenceGateReport = artifact =>
  artifact && typeof artifact === 'object' && 'readyForGraphRetrieval' in artifact;

const isBackfillPlan = artifact =>
  artifact && typeof artifact === 'object' && artifact.summary && Array.isArray(artifact.items);

const step = ({
  code,
  priority,
  owner,
  titleKo,
  descriptionKo,
  commands = [],
  blocking = true,
  dependsOn = [],
  refreshAllowed = false
}) => ({
  code,
  priority,
  owner,
  titleKo,
  descriptionKo,
  commands,
  blocking,
  dependsOn,
  refreshAllowed
});

const labelConflictCommands = [
  'npm run vision:label-conflicts:packet',
  'npm run vision:label-conflicts:decision-template',
  'npm run vision:label-conflicts:review-guide',
  'npm run vision:label-conflicts:verify-decisions -- --decisions <filled-vision-label-conflict-decisions.json>',
  'npm run vision:label-conflicts:apply -- --verification <vision-approved-label-conflict-decision-verification-report.json>',
  'npm run vision:label-conflicts:apply -- --verification <vision-approved-label-conflict-decision-verification-report.json> --apply',
  'npm run migration:verify-post-hitl'
];

const pendingHitlCommands = [
  'npm run vision:hitl:pending-packet',
  'npm run vision:hitl:decision-template',
  'npm run vision:hitl:review-guide',
  'npm run vision:hitl:verify-decisions -- --decisions <filled-common-agent-hitl-decisions.json>',
  'npm run vision:hitl:authorization-bridge -- --decision-verification <vision-pending-hitl-decision-verification-report.json>',
  'npm run vision:hitl:approve -- --authorization <vision-hitl-authorization-from-decisions.json>',
  'npm run migration:verify-post-hitl'
];

const backfillCommands = [
  'npm run vision:reference:backfill-plan',
  'npm run vision:reference:backfill-prepare',
  'npm run vision:reference:backfill-validate',
  'npm run vision:reference:backfill-apply',
  'npm run vision:reference:backfill-apply -- --apply',
  'npm run vision:reference:backfill-verify'
];

const missingEvidenceGuide = (generatedAt, missingArtifactNames = [
  'readinessAudit',
  'referenceGateReport',
  'backfillPlan'
]) => ({
  schemaVersion: 1,
  contractVersion: 'vision-reference-repair-guide/v1',
  generatedAt,
  status: 'missing_evidence',
  serviceWritesPerformed: false,
  localArtifactsWritten: true,
  policy: {
    requiresHumanReview: true,
    autoRefreshAllowed: false,
    allowGraphPromotion: false,
    allowReferenceLearning: false,
    allowModelTraining: false
  },
  summary: {
    missingArtifacts: missingArtifactNames.length,
    missingArtifactNames,
    referenceBlockers: 0,
    eligibleReferenceCandidates: 0,
    needsHitlBackfill: 0,
    blockedBackfillItems: 0,
    approvedSampleMissing: 0,
    labelConflicts: 0,
    pendingHitlReviews: 0,
    releaseReportMissing: false,
    refreshAllowedNow: false
  },
  repairSteps: [
    step({
      code: 'generate_reference_evidence',
      priority: 100,
      owner: 'system_operator',
      titleKo: 'Reference 증거 artifact 재생성',
      descriptionKo: 'reference 수리 판단에 필요한 readiness, backfill plan, reference gate artifact를 먼저 생성해야 합니다.',
      commands: [
        'npm run vision:operational:readiness',
        'npm run vision:reference:backfill-plan',
        'npm run vision:reference:gate'
      ],
      refreshAllowed: false
    })
  ],
  recommendedAction: '먼저 npm run vision:operational:readiness, npm run vision:reference:backfill-plan, npm run vision:reference:gate를 실행해 reference 증거를 재생성하세요.'
});

const statusFor = ({
  referenceGateReport,
  referenceBlockers,
  refreshAllowedNow,
  hasHumanDataBlocker
}) => {
  if (referenceGateReport?.status === 'passed' && referenceBlockers.length === 0) return 'passed';
  if (refreshAllowedNow && !hasHumanDataBlocker) return 'ready_for_refresh';
  return 'action_required';
};

const recommendedActionFor = ({ status, steps, summary }) => {
  if (status === 'passed') {
    return 'Reference store와 benchmark gate가 통과했습니다. 그래도 운영 반영은 수동 승인 후 진행하세요.';
  }
  if (status === 'ready_for_refresh') {
    return 'HITL/샘플 gate가 닫혔으므로 운영자가 수동으로 reference store refresh를 실행한 뒤 benchmark를 확인하세요.';
  }
  if (summary.labelConflicts > 0) {
    return `라벨 충돌 ${summary.labelConflicts}건을 먼저 닫은 뒤 HITL, 샘플, reference refresh 순서로 진행하세요.`;
  }
  if (summary.pendingHitlReviews > 0) {
    return `미해결 HITL ${summary.pendingHitlReviews}건을 승인/수정/반려/재촬영으로 닫은 뒤 reference refresh를 검토하세요.`;
  }
  if (summary.approvedSampleMissing > 0 || summary.needsHitlBackfill > 0) {
    return '승인 다중 시점 샘플과 v2 관찰 계약을 보강한 뒤 reference refresh를 검토하세요.';
  }
  return steps[0]?.titleKo || 'Reference gate 결과를 확인한 뒤 다음 작업을 진행하세요.';
};

const buildVisionReferenceRepairGuide = ({
  generatedAt = new Date().toISOString(),
  readinessAudit = null,
  referenceGateReport = null,
  backfillPlan = null
} = {}) => {
  const missingArtifactNames = [
    !isReadinessAudit(readinessAudit) ? 'readinessAudit' : null,
    !isReferenceGateReport(referenceGateReport) ? 'referenceGateReport' : null,
    !isBackfillPlan(backfillPlan) ? 'backfillPlan' : null
  ].filter(Boolean);

  if (missingArtifactNames.length > 0) {
    return missingEvidenceGuide(generatedAt, missingArtifactNames);
  }

  const readinessBlockers = asArray(readinessAudit.blockers);
  const referenceBlockers = uniqueBlockers([
    ...blockersBySource(readinessBlockers, 'reference'),
    ...asArray(referenceGateReport.blockers).map(blocker => ({
      ...blocker,
      source: 'reference'
    }))
  ]);
  const sampleBlocker = blockerByCode(readinessBlockers, 'approved_sample_count');
  const labelConflictBlocker = blockerByCode(readinessBlockers, 'approved_label_conflicts');
  const humanReviewBlocker = blockerByCode(readinessBlockers, 'human_review_required');
  const releaseReportMissing = hasCode(readinessBlockers, 'release_report_missing');
  const backfillSummary = backfillPlan.summary || {};

  const summary = {
    missingArtifacts: 0,
    referenceBlockers: referenceBlockers.length,
    eligibleReferenceCandidates: numberFrom(backfillSummary.eligibleReferenceCandidates),
    needsHitlBackfill: numberFrom(backfillSummary.needsHitlBackfill),
    blockedBackfillItems: numberFrom(backfillSummary.blocked),
    approvedSampleMissing: numberFrom(sampleBlocker?.missing),
    labelConflicts: numberFrom(labelConflictBlocker?.count),
    pendingHitlReviews: numberFrom(humanReviewBlocker?.count),
    releaseReportMissing,
    refreshAllowedNow: false
  };

  const hasHumanDataBlocker =
    summary.labelConflicts > 0
    || summary.pendingHitlReviews > 0
    || summary.approvedSampleMissing > 0
    || summary.needsHitlBackfill > 0
    || summary.blockedBackfillItems > 0;
  summary.refreshAllowedNow =
    referenceBlockers.length > 0
    && !hasHumanDataBlocker
    && summary.eligibleReferenceCandidates > 0;

  const steps = [];
  if (summary.labelConflicts > 0) {
    steps.push(step({
      code: 'resolve_label_conflicts',
      priority: 100,
      owner: 'quality_hitl',
      titleKo: '승인 이미지 라벨 충돌 해결',
      descriptionKo: '동일 이미지/해시의 정답 라벨이 충돌하므로 reference learning과 Graph 승격 전에 사람이 정답 라벨을 확정해야 합니다.',
      commands: labelConflictCommands,
      refreshAllowed: false
    }));
  }
  if (summary.pendingHitlReviews > 0) {
    steps.push(step({
      code: 'close_pending_hitl_reviews',
      priority: 90,
      owner: 'quality_hitl',
      titleKo: '미해결 Vision HITL 검토 종료',
      descriptionKo: 'Vision 후보를 승인, 수정, 반려, 재촬영 중 하나로 닫아 reference 후보의 신뢰 경계를 확정합니다.',
      commands: pendingHitlCommands,
      dependsOn: summary.labelConflicts > 0 ? ['resolve_label_conflicts'] : [],
      refreshAllowed: false
    }));
  }
  if (summary.approvedSampleMissing > 0) {
    steps.push(step({
      code: 'collect_multiview_approved_samples',
      priority: 80,
      owner: 'quality_capture',
      titleKo: '승인 다중 시점 샘플 추가 확보',
      descriptionKo: 'full_part_context와 defect_closeup을 포함한 승인 샘플 수량을 최소 기준까지 보강합니다.',
      commands: [
        'npm run vision:reference:backfill-plan',
        'npm run vision:operational:readiness'
      ],
      dependsOn: summary.labelConflicts > 0 ? ['resolve_label_conflicts'] : [],
      refreshAllowed: false
    }));
  }
  if (summary.needsHitlBackfill > 0 || summary.blockedBackfillItems > 0) {
    steps.push(step({
      code: 'complete_reference_backfill_hitl',
      priority: 75,
      owner: 'quality_hitl',
      titleKo: 'Reference 후보 v2 관찰/HITL 보강',
      descriptionKo: 'legacy observation, capture protocol, label conflict 등 backfill 사유를 사람이 검토한 뒤 승인 가능한 v2 reference 후보만 남깁니다.',
      commands: backfillCommands,
      dependsOn: [
        ...(summary.labelConflicts > 0 ? ['resolve_label_conflicts'] : []),
        ...(summary.pendingHitlReviews > 0 ? ['close_pending_hitl_reviews'] : [])
      ],
      refreshAllowed: false
    }));
  }

  if (referenceBlockers.length > 0 && !summary.refreshAllowedNow) {
    steps.push(step({
      code: 'defer_reference_refresh',
      priority: 70,
      owner: 'common_agent_operator',
      titleKo: 'Reference refresh 보류',
      descriptionKo: 'HITL/샘플/backfill blocker가 닫히기 전에는 빈 manifest 또는 오염된 라벨로 reference store를 만들 위험이 있어 refresh를 보류합니다.',
      commands: ['npm run vision:reference:gate'],
      blocking: false,
      refreshAllowed: false
    }));
  }

  if (summary.refreshAllowedNow) {
    steps.push(step({
      code: 'refresh_reference_store',
      priority: 70,
      owner: 'common_agent_operator',
      titleKo: 'Common Agent Vision reference store 수동 refresh',
      descriptionKo: '사람 검토와 샘플 gate가 닫힌 상태에서만 운영자가 reference refresh와 benchmark gate를 수동 실행합니다.',
      commands: ['npm run vision:reference:gate'],
      refreshAllowed: true
    }));
  }

  if (summary.releaseReportMissing) {
    steps.push(step({
      code: 'build_release_evidence_after_reference',
      priority: 50,
      owner: 'release_owner',
      titleKo: 'Reference 통과 후 릴리스 증거 재생성',
      descriptionKo: 'reference benchmark가 통과한 뒤 운영 릴리스 보고서와 evidence alignment를 재생성합니다.',
      commands: [
        'npm run eval:vision:release',
        'npm run vision:release:evidence:merge',
        'npm run vision:operational:readiness'
      ],
      dependsOn: referenceBlockers.length > 0 ? ['refresh_reference_store'] : [],
      refreshAllowed: false
    }));
  }

  const status = statusFor({
    referenceGateReport,
    referenceBlockers,
    refreshAllowedNow: summary.refreshAllowedNow,
    hasHumanDataBlocker
  });

  return {
    schemaVersion: 1,
    contractVersion: 'vision-reference-repair-guide/v1',
    generatedAt,
    status,
    serviceWritesPerformed: false,
    localArtifactsWritten: true,
    policy: {
      requiresHumanReview: true,
      autoRefreshAllowed: false,
      allowGraphPromotion: false,
      allowReferenceLearning: false,
      allowModelTraining: false
    },
    summary,
    referenceBlockers,
    repairSteps: steps.sort((left, right) => right.priority - left.priority || left.code.localeCompare(right.code)),
    nextCommand: steps[0]?.commands?.[0] || null,
    recommendedAction: recommendedActionFor({
      status,
      steps,
      summary
    })
  };
};

module.exports = {
  buildVisionReferenceRepairGuide
};
