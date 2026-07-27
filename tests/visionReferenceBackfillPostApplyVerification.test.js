const assert = require('node:assert/strict');
const test = require('node:test');
const {
  buildVisionReferenceBackfillPostApplyReport
} = require('../visionReferenceBackfillPostApplyVerification');

const applyReport = {
  schemaVersion: 1,
  generatedAt: '2026-07-27T04:30:00.000Z',
  applyRequested: true,
  serviceWritesPerformed: true,
  completed: true,
  results: [
    { imageId: 'image-white-1', status: 'applied' },
    { imageId: 'image-flash-1', status: 'applied' }
  ],
  requests: [
    {
      imageId: 'image-white-1',
      body: {
        defect_type: 'whitening',
        metadata: {
          capture_session_id: 'session-white-01',
          capture_view_tag: 'defect_closeup',
          capture_protocol_ready: true
        }
      }
    },
    {
      imageId: 'image-flash-1',
      body: {
        defect_type: 'flash',
        metadata: {
          capture_session_id: 'session-flash-01',
          capture_view_tag: 'defect_closeup',
          capture_protocol_ready: true
        }
      }
    }
  ]
};

const learningReadyExport = {
  total: 2,
  items: [
    {
      image_id: 'image-white-1',
      review_status: 'approved',
      defect_type: '백화',
      metadata: {
        capture_session_id: 'session-white-01',
        capture_view_tag: 'defect_closeup',
        capture_protocol_ready: true
      }
    },
    {
      image_id: 'image-flash-1',
      review_status: 'approved',
      defect_type: 'flash',
      metadata: {
        capture_session_id: 'session-flash-01',
        capture_view_tag: 'defect_closeup',
        capture_protocol_ready: true
      }
    }
  ]
};

test('verifies applied targets only when they reappear in learning-ready export', () => {
  const report = buildVisionReferenceBackfillPostApplyReport({
    applyReport,
    learningReadyExport,
    generatedAt: '2026-07-27T05:00:00.000Z'
  });

  assert.equal(report.status, 'ready');
  assert.equal(report.readyForReferenceRefresh, true);
  assert.equal(report.serviceWritesPerformed, false);
  assert.equal(report.summary.appliedTargets, 2);
  assert.equal(report.summary.verifiedLearningReady, 2);
  assert.equal(report.targets.every(item => item.status === 'verified_learning_ready'), true);
});

test('blocks applied targets missing from learning-ready export', () => {
  const report = buildVisionReferenceBackfillPostApplyReport({
    applyReport,
    learningReadyExport: {
      total: 1,
      items: [learningReadyExport.items[0]]
    }
  });

  assert.equal(report.status, 'blocked');
  assert.equal(report.readyForReferenceRefresh, false);
  assert.equal(report.summary.missingFromLearningReadyExport, 1);
  assert.ok(report.blockers.some(item => item.code === 'applied_target_missing_from_learning_ready_export'));
});

test('blocks targets that lost capture protocol evidence', () => {
  const degradedExport = {
    total: 2,
    items: [
      learningReadyExport.items[0],
      {
        ...learningReadyExport.items[1],
        metadata: {
          capture_session_id: 'session-flash-01',
          capture_view_tag: '',
          capture_protocol_ready: false
        }
      }
    ]
  };
  const report = buildVisionReferenceBackfillPostApplyReport({
    applyReport,
    learningReadyExport: degradedExport
  });

  assert.equal(report.status, 'blocked');
  assert.equal(report.readyForReferenceRefresh, false);
  assert.ok(report.blockers.some(item => item.code === 'capture_protocol_not_learning_ready'));
});

test('blocks label mismatches between approved write plan and export', () => {
  const report = buildVisionReferenceBackfillPostApplyReport({
    applyReport,
    learningReadyExport: {
      total: 2,
      items: [
        learningReadyExport.items[0],
        {
          ...learningReadyExport.items[1],
          defect_type: 'weld line'
        }
      ]
    }
  });

  assert.equal(report.status, 'blocked');
  assert.equal(report.readyForReferenceRefresh, false);
  assert.ok(report.blockers.some(item => item.code === 'defect_label_mismatch'));
});

test('dry-run reports cannot unlock reference refresh', () => {
  const report = buildVisionReferenceBackfillPostApplyReport({
    applyReport: {
      ...applyReport,
      applyRequested: false,
      serviceWritesPerformed: false,
      results: []
    },
    learningReadyExport
  });

  assert.equal(report.status, 'blocked');
  assert.equal(report.readyForReferenceRefresh, false);
  assert.ok(report.blockers.some(item => item.code === 'no_applied_backfill_targets'));
});
