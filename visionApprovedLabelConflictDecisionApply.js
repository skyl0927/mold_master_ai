const fs = require('node:fs');
const path = require('node:path');
const { canonicalDefectClass } = require('./shared/defect-taxonomy');

const compact = value => String(value || '').replace(/\s+/g, ' ').trim();

const asArray = value => Array.isArray(value) ? value : [];

const unique = values => [...new Set(values.map(compact).filter(Boolean))];

const normalizeHash = value => compact(value).toLowerCase();

const sameSet = (left, right) => {
  const leftItems = unique(left || []).sort();
  const rightItems = unique(right || []).sort();
  return leftItems.length === rightItems.length
    && leftItems.every((item, index) => item === rightItems[index]);
};

const policy = () => ({
  requiresHumanReview: true,
  autoApplyAllowed: false,
  allowGraphPromotion: false,
  allowReferenceLearning: false,
  allowModelTraining: false
});

const readJson = filePath =>
  JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));

const writeJson = (filePath, payload) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
};

const sourcesFor = (verificationReport, sourceArtifacts = {}, fixtureRoot = '') => ({
  conflictPacket: sourceArtifacts.conflictPacket || verificationReport?.sources?.conflictPacket || null,
  decisionPacket: sourceArtifacts.decisionPacket || verificationReport?.sources?.decisionPacket || null,
  verificationReport: sourceArtifacts.verificationReport || null,
  approvedFixtureRoot: sourceArtifacts.approvedFixtureRoot || fixtureRoot || null
});

const actionFor = status => ({
  dry_run_ready: '검증된 라벨 충돌 해소안을 확인한 뒤 같은 명령에 --apply를 붙여 로컬 approved fixture에만 반영하세요.',
  applied: '로컬 approved fixture 반영이 완료되었습니다. 이후 migration:verify-post-hitl과 readiness audit을 다시 실행하세요.',
  not_ready_for_apply: '라벨 충돌 판정 검증 보고서가 ready_for_manual_import 상태가 아닙니다. 사람이 판정 파일을 완성하고 다시 검증해야 합니다.',
  apply_target_mismatch: '현재 approved fixture와 검증 보고서의 case/hash가 일치하지 않아 반영을 중단했습니다. 최신 충돌 패킷부터 다시 생성하세요.',
  invalid_verification_report: '라벨 충돌 판정 검증 보고서 계약을 확인하세요.',
  invalid_fixture_root: 'approved fixture root 또는 manifest.json을 확인하세요.'
}[status] || '라벨 충돌 판정 apply 상태를 확인하세요.');

const buildReport = ({
  generatedAt,
  status,
  applyRequested,
  plannedCaseUpdates = [],
  appliedCaseUpdates = 0,
  resolvedQualityIssues = [],
  invalidTargets = [],
  localFixtureWritesPerformed = false,
  verificationReport,
  sourceArtifacts,
  fixtureRoot
}) => ({
  schemaVersion: 1,
  contractVersion: 'vision-approved-label-conflict-decision-apply-report/v1',
  generatedAt,
  sourceSystem: 'mold-master-ai',
  targetSystem: 'mold-master-ai-approved-vision-fixtures',
  status,
  applyRequested,
  serviceWritesPerformed: false,
  localArtifactsWritten: true,
  localFixtureWritesPerformed,
  policy: policy(),
  summary: {
    plannedCaseUpdates: status === 'apply_target_mismatch' ? 0 : plannedCaseUpdates.length,
    appliedCaseUpdates,
    resolvedQualityIssues: resolvedQualityIssues.length,
    invalidTargets: invalidTargets.length,
    keptLabelCases: plannedCaseUpdates.filter(item => item.outcome === 'kept_label').length,
    supersededCases: plannedCaseUpdates.filter(item => item.outcome === 'superseded_needs_review').length,
    needsReviewCases: plannedCaseUpdates.filter(item => item.outcome === 'needs_review').length,
    rejectedCases: plannedCaseUpdates.filter(item => item.outcome === 'rejected').length,
    recaptureRequests: plannedCaseUpdates.filter(item => item.outcome === 'recapture_requested').length
  },
  plannedCaseUpdates: status === 'apply_target_mismatch' ? [] : plannedCaseUpdates.map(item => ({
    conflictId: item.conflictId,
    caseId: item.caseId,
    action: item.action,
    selectedLabel: item.selectedLabel,
    previousLabel: item.previousLabel,
    nextLabel: item.nextLabel,
    status: item.status,
    outcome: item.outcome
  })),
  resolvedQualityIssues,
  invalidTargets,
  sources: sourcesFor(verificationReport, sourceArtifacts, fixtureRoot),
  recommendedAction: actionFor(status)
});

const allDecisionsFrom = verificationReport => [
  ...asArray(verificationReport?.importPlan?.resolvedLabelConflicts),
  ...asArray(verificationReport?.importPlan?.needsReviewConflicts),
  ...asArray(verificationReport?.importPlan?.rejectedConflicts),
  ...asArray(verificationReport?.importPlan?.recaptureRequests)
];

const labelMatches = (left, right) => {
  const leftLabel = compact(left);
  const rightLabel = compact(right);
  if (!leftLabel || !rightLabel) return false;
  return leftLabel === rightLabel
    || canonicalDefectClass(leftLabel) === canonicalDefectClass(rightLabel);
};

const cleanTagsFor = (tags, additions = []) => unique([
  ...asArray(tags).filter(tag => ![
    'vision-label-conflict',
    'duplicate-label-conflict'
  ].includes(compact(tag))),
  ...additions
]);

const issueMatchesDecision = (issue, decision) => {
  const affectedCaseIds = asArray(decision?.affectedCaseIds);
  if (issue?.type === 'duplicate_image_conflicting_labels') {
    const hashMatches =
      normalizeHash(issue.contentHash)
      && normalizeHash(issue.contentHash) === normalizeHash(decision?.contentHash);
    return hashMatches || sameSet(issue.caseIds, affectedCaseIds);
  }
  if (issue?.type === 'approved_label_observation_conflict') {
    return affectedCaseIds.includes(compact(issue.caseId));
  }
  return false;
};

const splitQualityIssues = (qualityIssues, decisions, generatedAt) => {
  const resolved = [];
  const remaining = [];
  for (const issue of asArray(qualityIssues)) {
    const decision = decisions.find(item => issueMatchesDecision(issue, item));
    if (!decision) {
      remaining.push(issue);
      continue;
    }
    resolved.push({
      ...issue,
      resolvedAt: generatedAt,
      resolution: {
        conflictId: compact(decision.conflictId),
        action: compact(decision.action),
        selectedLabel: compact(decision.selectedLabel),
        reviewerId: compact(decision.reviewerId),
        decidedAt: compact(decision.decidedAt),
        reviewComment: compact(decision.reviewComment)
      }
    });
  }
  return { remaining, resolved };
};

const updateForDecision = ({
  decision,
  caseEntry,
  fixture,
  generatedAt
}) => {
  const action = compact(decision.action);
  const selectedLabel = compact(decision.selectedLabel);
  const previousLabel = compact(fixture?.expected?.defectType);
  const affectedCaseIds = unique(decision.affectedCaseIds || []);
  const selectedCase = action === 'keep_label'
    && (
      affectedCaseIds.length === 1
      || labelMatches(previousLabel, selectedLabel)
    );
  let status = 'needs_review';
  let outcome = 'needs_review';
  let tagAdditions = ['label-conflict-needs-review'];
  let nextLabel = previousLabel;

  if (action === 'keep_label' && selectedCase) {
    status = 'active';
    outcome = 'kept_label';
    tagAdditions = ['label-conflict-resolved'];
    nextLabel = selectedLabel;
  } else if (action === 'keep_label') {
    status = 'needs_review';
    outcome = 'superseded_needs_review';
    tagAdditions = ['label-conflict-superseded'];
  } else if (action === 'reject_conflicting_cases') {
    status = 'rejected';
    outcome = 'rejected';
    tagAdditions = ['label-conflict-rejected'];
  } else if (action === 'request_recapture') {
    status = 'needs_review';
    outcome = 'recapture_requested';
    tagAdditions = ['label-conflict-recapture-requested'];
  }

  const updatedCase = {
    ...caseEntry,
    status,
    tags: cleanTagsFor(caseEntry.tags, tagAdditions)
  };
  const updatedFixture = {
    ...fixture,
    expected: {
      ...(fixture.expected || {}),
      defectType: nextLabel,
      defectClass: nextLabel
        ? canonicalDefectClass(nextLabel)
        : fixture.expected?.defectClass
    },
    sourceReview: {
      ...(fixture.sourceReview || {}),
      ...(nextLabel !== previousLabel
        ? { originalExpectedDefectType: previousLabel }
        : {}),
      labelConflictResolution: {
        conflictId: compact(decision.conflictId),
        action,
        outcome,
        selectedLabel,
        previousLabel,
        nextLabel,
        candidateLabels: unique(decision.candidateLabels || []),
        affectedCaseIds,
        reviewerId: compact(decision.reviewerId),
        decidedAt: compact(decision.decidedAt),
        reviewComment: compact(decision.reviewComment),
        requestedViews: unique(decision.requestedViews || []),
        humanLabelConfirmed: outcome === 'kept_label',
        appliedAt: generatedAt,
        graphPromotionAllowed: false,
        referenceLearningAllowed: false,
        modelTrainingAllowed: false
      }
    }
  };

  return {
    update: {
      conflictId: compact(decision.conflictId),
      caseId: compact(caseEntry.id),
      action,
      selectedLabel,
      previousLabel,
      nextLabel,
      status,
      outcome
    },
    updatedCase,
    updatedFixture
  };
};

const validateTarget = ({ decision, caseEntry, fixture }) => {
  if (!caseEntry) {
    return {
      code: 'case_not_found',
      conflictId: compact(decision?.conflictId),
      caseId: compact(decision?.affectedCaseIds?.[0]),
      message: 'manifest cases에서 대상 case id를 찾을 수 없습니다.'
    };
  }
  if (!fixture) {
    return {
      code: 'fixture_not_found',
      conflictId: compact(decision?.conflictId),
      caseId: compact(caseEntry.id),
      message: 'manifest case에 연결된 fixture JSON을 찾을 수 없습니다.'
    };
  }
  const expectedHash = normalizeHash(decision?.contentHash);
  if (expectedHash && normalizeHash(fixture?.contentHash) !== expectedHash) {
    return {
      code: 'content_hash_mismatch',
      conflictId: compact(decision?.conflictId),
      caseId: compact(caseEntry.id),
      expectedHash,
      actualHash: normalizeHash(fixture?.contentHash),
      message: '검증 보고서의 content hash가 현재 fixture와 일치하지 않습니다.'
    };
  }
  return null;
};

const applyVisionApprovedLabelConflictDecisionVerificationReport = ({
  generatedAt = new Date().toISOString(),
  verificationReport = null,
  fixtureRoot = path.join(process.cwd(), 'eval', 'vision-approved'),
  apply = false,
  sourceArtifacts = {}
} = {}) => {
  const applyRequested = apply === true;
  if (
    verificationReport?.contractVersion
      !== 'vision-approved-label-conflict-decision-verification-report/v1'
    || verificationReport?.serviceWritesPerformed === true
  ) {
    return buildReport({
      generatedAt,
      status: 'invalid_verification_report',
      applyRequested,
      verificationReport,
      sourceArtifacts,
      fixtureRoot
    });
  }

  const decisions = allDecisionsFrom(verificationReport);
  if (verificationReport.status !== 'ready_for_manual_import') {
    return buildReport({
      generatedAt,
      status: 'not_ready_for_apply',
      applyRequested,
      verificationReport,
      sourceArtifacts,
      fixtureRoot
    });
  }

  const manifestPath = path.join(fixtureRoot, 'manifest.json');
  if (!fixtureRoot || !fs.existsSync(manifestPath)) {
    return buildReport({
      generatedAt,
      status: 'invalid_fixture_root',
      applyRequested,
      verificationReport,
      sourceArtifacts,
      fixtureRoot
    });
  }

  const manifest = readJson(manifestPath);
  const caseById = new Map(asArray(manifest.cases).map(item => [compact(item.id), item]));
  const fixtureByCaseId = new Map();
  const fixturePathByCaseId = new Map();
  const invalidTargets = [];

  for (const decision of decisions) {
    for (const caseId of unique(decision.affectedCaseIds || [])) {
      const caseEntry = caseById.get(caseId);
      const fixturePath = caseEntry?.file
        ? path.join(fixtureRoot, caseEntry.file)
        : '';
      const fixture = fixturePath && fs.existsSync(fixturePath)
        ? readJson(fixturePath)
        : null;
      const invalidTarget = validateTarget({ decision, caseEntry, fixture });
      if (invalidTarget) invalidTargets.push(invalidTarget);
      if (caseEntry && fixture) {
        fixtureByCaseId.set(caseId, fixture);
        fixturePathByCaseId.set(caseId, fixturePath);
      }
    }
  }

  const { remaining, resolved } = splitQualityIssues(
    manifest.qualityIssues,
    decisions,
    generatedAt
  );
  if (resolved.length < decisions.length) {
    const resolvedConflictIds = new Set(
      resolved.map(item => compact(item.resolution?.conflictId))
    );
    decisions
      .filter(decision => !resolvedConflictIds.has(compact(decision.conflictId)))
      .forEach(decision => invalidTargets.push({
        code: 'quality_issue_not_found',
        conflictId: compact(decision.conflictId),
        caseIds: unique(decision.affectedCaseIds || []),
        message: 'manifest qualityIssues에서 대상 라벨 충돌을 찾을 수 없습니다.'
      }));
  }

  if (invalidTargets.length > 0) {
    return buildReport({
      generatedAt,
      status: 'apply_target_mismatch',
      applyRequested,
      invalidTargets,
      verificationReport,
      sourceArtifacts,
      fixtureRoot
    });
  }

  const plannedCaseUpdates = [];
  const updatedCaseById = new Map();
  const updatedFixtureById = new Map();
  for (const decision of decisions) {
    for (const caseId of unique(decision.affectedCaseIds || [])) {
      const result = updateForDecision({
        decision,
        caseEntry: caseById.get(caseId),
        fixture: fixtureByCaseId.get(caseId),
        generatedAt
      });
      plannedCaseUpdates.push(result.update);
      updatedCaseById.set(caseId, result.updatedCase);
      updatedFixtureById.set(caseId, result.updatedFixture);
    }
  }

  if (applyRequested) {
    const updatedManifest = {
      ...manifest,
      generatedAt,
      qualityIssues: remaining,
      resolvedQualityIssues: [
        ...asArray(manifest.resolvedQualityIssues),
        ...resolved
      ],
      cases: asArray(manifest.cases).map(item =>
        updatedCaseById.get(compact(item.id)) || item
      )
    };
    writeJson(manifestPath, updatedManifest);
    for (const [caseId, fixture] of updatedFixtureById.entries()) {
      writeJson(fixturePathByCaseId.get(caseId), fixture);
    }
  }

  return buildReport({
    generatedAt,
    status: applyRequested ? 'applied' : 'dry_run_ready',
    applyRequested,
    plannedCaseUpdates,
    appliedCaseUpdates: applyRequested ? plannedCaseUpdates.length : 0,
    resolvedQualityIssues: resolved,
    localFixtureWritesPerformed: applyRequested,
    verificationReport,
    sourceArtifacts,
    fixtureRoot
  });
};

module.exports = {
  applyVisionApprovedLabelConflictDecisionVerificationReport
};
