const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  applyVisionApprovedLabelConflictDecisionVerificationReport
} = require('../visionApprovedLabelConflictDecisionApply');

const hashA = 'a'.repeat(64);
const hashB = 'b'.repeat(64);

const writeJson = (filePath, payload) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
};

const readJson = filePath => JSON.parse(fs.readFileSync(filePath, 'utf8'));

const createFixtureRoot = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vision-label-conflict-apply-'));
  const manifest = {
    version: 1,
    generatedAt: '2026-07-27T10:00:00.000Z',
    qualityIssues: [
      {
        type: 'duplicate_image_conflicting_labels',
        contentHash: hashA,
        caseIds: ['approved-image-a', 'approved-image-b'],
        labels: ['제팅', '플로우마크']
      },
      {
        type: 'approved_label_observation_conflict',
        caseId: 'approved-image-c',
        approvedLabel: '수축',
        observationLabel: '백화',
        approvedClass: 'other:수축',
        observationClass: 'whitening'
      }
    ],
    cases: [
      {
        id: 'approved-image-a',
        file: 'image-a.json',
        status: 'active',
        tags: ['approved-image', 'vision', 'graph']
      },
      {
        id: 'approved-image-b',
        file: 'image-b.json',
        status: 'active',
        tags: ['approved-image', 'vision', 'graph']
      },
      {
        id: 'approved-image-c',
        file: 'image-c.json',
        status: 'needs_review',
        tags: ['approved-image', 'vision', 'graph', 'vision-label-conflict']
      }
    ]
  };
  const fixture = ({ id, label, contentHash }) => ({
    id,
    title: `${label} approved image`,
    contentHash,
    expected: {
      defectType: label,
      defectClass: label === '제팅'
        ? 'jetting'
        : label === '플로우마크'
          ? 'flow_mark'
          : 'other:수축',
      possibleCauseKeywords: [],
      countermeasureKeywords: [],
      minEvidenceCount: 1
    },
    sourceReview: {
      reviewStatus: 'approved',
      reviewedAt: '2026-07-24T09:00:00.000Z'
    }
  });

  writeJson(path.join(root, 'manifest.json'), manifest);
  writeJson(path.join(root, 'image-a.json'), fixture({
    id: 'approved-image-a',
    label: '제팅',
    contentHash: hashA
  }));
  writeJson(path.join(root, 'image-b.json'), fixture({
    id: 'approved-image-b',
    label: '플로우마크',
    contentHash: hashA
  }));
  writeJson(path.join(root, 'image-c.json'), fixture({
    id: 'approved-image-c',
    label: '수축',
    contentHash: hashB
  }));
  return root;
};

const readyReport = (overrides = {}) => ({
  schemaVersion: 1,
  contractVersion: 'vision-approved-label-conflict-decision-verification-report/v1',
  generatedAt: '2026-07-27T11:00:00.000Z',
  status: 'ready_for_manual_import',
  serviceWritesPerformed: false,
  policy: {
    requiresHumanReview: true,
    autoApplyAllowed: false,
    allowGraphPromotion: false,
    allowReferenceLearning: false,
    allowModelTraining: false
  },
  importPlan: {
    resolvedLabelConflicts: [
      {
        conflictId: 'conflict-001',
        contentHash: hashA,
        action: 'keep_label',
        affectedCaseIds: ['approved-image-a', 'approved-image-b'],
        candidateLabels: ['제팅', '플로우마크'],
        selectedLabel: '제팅',
        reviewerId: 'quality-lead-01',
        decidedAt: '2026-07-27T10:55:00.000Z',
        reviewComment: '동일 이미지 확인 결과 제팅 라벨만 유지합니다.',
        requiresManualImport: true,
        graphPromotionAllowed: false,
        referenceLearningAllowed: false
      }
    ],
    needsReviewConflicts: [],
    rejectedConflicts: [],
    recaptureRequests: []
  },
  sources: {
    conflictPacket: 'conflict-packet.json',
    decisionPacket: 'decisions.json'
  },
  ...overrides
});

test('dry-run plans verified label conflict updates without writing fixture files', () => {
  const fixtureRoot = createFixtureRoot();
  const beforeManifest = fs.readFileSync(path.join(fixtureRoot, 'manifest.json'), 'utf8');
  const beforeFixture = fs.readFileSync(path.join(fixtureRoot, 'image-b.json'), 'utf8');

  const report = applyVisionApprovedLabelConflictDecisionVerificationReport({
    generatedAt: '2026-07-27T11:05:00.000Z',
    verificationReport: readyReport(),
    fixtureRoot,
    apply: false
  });

  assert.equal(report.contractVersion, 'vision-approved-label-conflict-decision-apply-report/v1');
  assert.equal(report.status, 'dry_run_ready');
  assert.equal(report.applyRequested, false);
  assert.equal(report.serviceWritesPerformed, false);
  assert.equal(report.localFixtureWritesPerformed, false);
  assert.equal(report.summary.plannedCaseUpdates, 2);
  assert.equal(report.summary.resolvedQualityIssues, 1);
  assert.deepEqual(report.plannedCaseUpdates.map(item => item.status), [
    'active',
    'needs_review'
  ]);
  assert.equal(fs.readFileSync(path.join(fixtureRoot, 'manifest.json'), 'utf8'), beforeManifest);
  assert.equal(fs.readFileSync(path.join(fixtureRoot, 'image-b.json'), 'utf8'), beforeFixture);
});

test('explicit apply resolves selected label and quarantines superseded conflict labels locally', () => {
  const fixtureRoot = createFixtureRoot();
  const report = applyVisionApprovedLabelConflictDecisionVerificationReport({
    verificationReport: readyReport(),
    fixtureRoot,
    apply: true
  });

  assert.equal(report.status, 'applied');
  assert.equal(report.applyRequested, true);
  assert.equal(report.serviceWritesPerformed, false);
  assert.equal(report.localFixtureWritesPerformed, true);
  assert.equal(report.summary.appliedCaseUpdates, 2);
  assert.equal(report.summary.keptLabelCases, 1);
  assert.equal(report.summary.supersededCases, 1);
  assert.equal(report.policy.allowGraphPromotion, false);
  assert.equal(report.policy.allowReferenceLearning, false);

  const manifest = readJson(path.join(fixtureRoot, 'manifest.json'));
  assert.equal(manifest.qualityIssues.length, 1);
  assert.equal(manifest.resolvedQualityIssues.length, 1);
  assert.equal(manifest.resolvedQualityIssues[0].resolution.action, 'keep_label');
  assert.equal(manifest.cases.find(item => item.id === 'approved-image-a').status, 'active');
  assert.equal(manifest.cases.find(item => item.id === 'approved-image-b').status, 'needs_review');
  assert.ok(manifest.cases.find(item => item.id === 'approved-image-a').tags.includes('label-conflict-resolved'));
  assert.ok(manifest.cases.find(item => item.id === 'approved-image-b').tags.includes('label-conflict-superseded'));

  const kept = readJson(path.join(fixtureRoot, 'image-a.json'));
  const superseded = readJson(path.join(fixtureRoot, 'image-b.json'));
  assert.equal(kept.expected.defectType, '제팅');
  assert.equal(kept.sourceReview.labelConflictResolution.selectedLabel, '제팅');
  assert.equal(kept.sourceReview.labelConflictResolution.humanLabelConfirmed, true);
  assert.equal(superseded.expected.defectType, '플로우마크');
  assert.equal(superseded.sourceReview.labelConflictResolution.outcome, 'superseded_needs_review');
});

test('single-record keep_label can update the expected label after human reconciliation', () => {
  const fixtureRoot = createFixtureRoot();
  const report = applyVisionApprovedLabelConflictDecisionVerificationReport({
    verificationReport: readyReport({
      importPlan: {
        resolvedLabelConflicts: [{
          conflictId: 'conflict-002',
          contentHash: '',
          action: 'keep_label',
          affectedCaseIds: ['approved-image-c'],
          candidateLabels: ['수축', '백화'],
          selectedLabel: '백화',
          reviewerId: 'quality-lead-01',
          decidedAt: '2026-07-27T10:55:00.000Z',
          reviewComment: '원본 확인 결과 응력 백화가 맞습니다.',
          requiresManualImport: true,
          graphPromotionAllowed: false,
          referenceLearningAllowed: false
        }],
        needsReviewConflicts: [],
        rejectedConflicts: [],
        recaptureRequests: []
      }
    }),
    fixtureRoot,
    apply: true
  });

  assert.equal(report.status, 'applied');
  const manifest = readJson(path.join(fixtureRoot, 'manifest.json'));
  const fixture = readJson(path.join(fixtureRoot, 'image-c.json'));
  assert.equal(manifest.qualityIssues.length, 1);
  assert.equal(manifest.qualityIssues[0].type, 'duplicate_image_conflicting_labels');
  assert.equal(manifest.cases.find(item => item.id === 'approved-image-c').status, 'active');
  assert.equal(fixture.expected.defectType, '백화');
  assert.equal(fixture.expected.defectClass, 'whitening');
  assert.equal(fixture.sourceReview.originalExpectedDefectType, '수축');
});

test('fails closed when verification is not ready or fixture hashes do not match', () => {
  const fixtureRoot = createFixtureRoot();
  const notReady = applyVisionApprovedLabelConflictDecisionVerificationReport({
    verificationReport: readyReport({ status: 'awaiting_human_review' }),
    fixtureRoot,
    apply: true
  });
  assert.equal(notReady.status, 'not_ready_for_apply');
  assert.equal(notReady.localFixtureWritesPerformed, false);

  const mismatch = applyVisionApprovedLabelConflictDecisionVerificationReport({
    verificationReport: readyReport({
      importPlan: {
        resolvedLabelConflicts: [{
          ...readyReport().importPlan.resolvedLabelConflicts[0],
          contentHash: 'c'.repeat(64)
        }],
        needsReviewConflicts: [],
        rejectedConflicts: [],
        recaptureRequests: []
      }
    }),
    fixtureRoot,
    apply: true
  });
  assert.equal(mismatch.status, 'apply_target_mismatch');
  assert.equal(mismatch.localFixtureWritesPerformed, false);
  assert.equal(mismatch.invalidTargets[0].code, 'content_hash_mismatch');
});
