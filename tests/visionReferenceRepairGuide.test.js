const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildVisionReferenceRepairGuide
} = require('../visionReferenceRepairGuide');

const baseReadiness = ({
  blockers = [],
  status = 'action_required'
} = {}) => ({
  contractVersion: 'vision-operational-readiness-audit/v1',
  generatedAt: '2026-07-27T12:00:00.000Z',
  status,
  readyForCandidateActivation: false,
  autoActivationAllowed: false,
  blockers
});

const referenceGate = ({
  blockers = [],
  status = 'blocked'
} = {}) => ({
  schemaVersion: 1,
  generatedAt: '2026-07-27T12:05:00.000Z',
  status,
  readyForGraphRetrieval: status === 'passed',
  serviceWritesPerformed: false,
  blockers
});

const backfillPlan = ({
  status = 'action_required',
  total = 12,
  eligibleReferenceCandidates = 0,
  needsHitlBackfill = 8,
  blocked = 4,
  reasonCounts = {}
} = {}) => ({
  schemaVersion: 1,
  generatedAt: '2026-07-27T12:03:00.000Z',
  status,
  serviceWritesPerformed: false,
  localArtifactsWritten: true,
  summary: {
    total,
    eligibleReferenceCandidates,
    needsHitlBackfill,
    blocked,
    reasonCounts
  },
  items: []
});

test('orders HITL blockers before reference refresh and keeps service writes disabled', () => {
  const guide = buildVisionReferenceRepairGuide({
    generatedAt: '2026-07-27T12:10:00.000Z',
    readinessAudit: baseReadiness({
      blockers: [
        { source: 'reference', code: 'reference_gate_not_ready' },
        {
          source: 'reference',
          code: 'reference_store_missing',
          detail: 'current reference manifest pointer not found'
        },
        {
          source: 'reference',
          code: 'reference_refresh_failed',
          detail: '503 reference manifest must contain at least one reference'
        },
        {
          source: 'post_hitl',
          code: 'approved_sample_count',
          current: 12,
          required: 20,
          missing: 8
        },
        {
          source: 'post_hitl',
          code: 'approved_label_conflicts',
          count: 4
        },
        {
          source: 'post_hitl',
          code: 'human_review_required',
          count: 12
        },
        {
          source: 'release',
          code: 'release_report_missing'
        }
      ]
    }),
    referenceGateReport: referenceGate({
      blockers: [
        { code: 'reference_store_missing', detail: 'current reference manifest pointer not found' },
        { code: 'reference_refresh_failed', detail: '503 reference manifest must contain at least one reference' }
      ]
    }),
    backfillPlan: backfillPlan({
      reasonCounts: {
        legacy_vision_contract: 8,
        label_conflict: 4
      }
    })
  });

  assert.equal(guide.contractVersion, 'vision-reference-repair-guide/v1');
  assert.equal(guide.status, 'action_required');
  assert.equal(guide.serviceWritesPerformed, false);
  assert.equal(guide.localArtifactsWritten, true);
  assert.equal(guide.policy.autoRefreshAllowed, false);
  assert.equal(guide.policy.allowGraphPromotion, false);
  assert.equal(guide.policy.allowReferenceLearning, false);
  assert.equal(guide.policy.allowModelTraining, false);
  assert.equal(guide.summary.referenceBlockers, 3);
  assert.equal(guide.summary.approvedSampleMissing, 8);
  assert.equal(guide.summary.labelConflicts, 4);
  assert.equal(guide.summary.pendingHitlReviews, 12);
  assert.equal(guide.summary.needsHitlBackfill, 8);
  assert.equal(guide.summary.blockedBackfillItems, 4);
  assert.equal(guide.summary.refreshAllowedNow, false);
  assert.deepEqual(
    guide.repairSteps.map(step => step.code),
    [
      'resolve_label_conflicts',
      'close_pending_hitl_reviews',
      'collect_multiview_approved_samples',
      'complete_reference_backfill_hitl',
      'defer_reference_refresh',
      'build_release_evidence_after_reference'
    ]
  );
  assert.equal(guide.repairSteps[0].blocking, true);
  assert.equal(guide.repairSteps[0].owner, 'quality_hitl');
  assert.ok(guide.repairSteps[4].refreshAllowed === false);
  assert.deepEqual(guide.repairSteps[4].commands, ['npm run vision:reference:gate']);
  assert.match(guide.recommendedAction, /라벨 충돌/);
});

test('allows only a manual reference refresh step after HITL and sample gates are clear', () => {
  const guide = buildVisionReferenceRepairGuide({
    generatedAt: '2026-07-27T12:10:00.000Z',
    readinessAudit: baseReadiness({
      blockers: [
        {
          source: 'reference',
          code: 'reference_store_missing',
          detail: 'current reference manifest pointer not found'
        }
      ]
    }),
    referenceGateReport: referenceGate({
      blockers: [
        { code: 'reference_store_missing', detail: 'current reference manifest pointer not found' }
      ]
    }),
    backfillPlan: backfillPlan({
      status: 'ready',
      total: 20,
      eligibleReferenceCandidates: 20,
      needsHitlBackfill: 0,
      blocked: 0
    })
  });

  assert.equal(guide.status, 'ready_for_refresh');
  assert.equal(guide.summary.refreshAllowedNow, true);
  assert.equal(guide.policy.autoRefreshAllowed, false);
  assert.equal(guide.repairSteps[0].code, 'refresh_reference_store');
  assert.equal(guide.repairSteps[0].blocking, true);
  assert.deepEqual(guide.repairSteps[0].commands, ['npm run vision:reference:gate']);
  assert.match(guide.recommendedAction, /수동으로 reference store refresh/);
});

test('fails closed when required reference evidence artifacts are missing', () => {
  const guide = buildVisionReferenceRepairGuide({
    generatedAt: '2026-07-27T12:10:00.000Z'
  });

  assert.equal(guide.status, 'missing_evidence');
  assert.equal(guide.summary.missingArtifacts, 3);
  assert.equal(guide.summary.refreshAllowedNow, false);
  assert.equal(guide.repairSteps[0].code, 'generate_reference_evidence');
  assert.deepEqual(guide.repairSteps[0].commands, [
    'npm run vision:operational:readiness',
    'npm run vision:reference:backfill-plan',
    'npm run vision:reference:gate'
  ]);
  assert.match(guide.recommendedAction, /vision:reference:gate/);
});
