const assert = require('node:assert/strict');
const test = require('node:test');

const {
  summarizeVisionBboxAnnotationStatus
} = require('../visionBboxAnnotationStatus');

const visionSummary = {
  visualObservations: [
    {
      observationId: 'obs-white',
      category: 'color',
      description: '리브 기부 백화',
      regionBbox: {
        coordinateSystem: 'normalized_xywh',
        x: 0.1,
        y: 0.2,
        width: 0.3,
        height: 0.2,
        confidence: 0.8
      }
    },
    {
      observationId: 'obs-edge',
      category: 'boundary',
      description: '취출부 경계',
      regionBbox: {
        coordinateSystem: 'normalized_xywh',
        x: 0.5,
        y: 0.2,
        width: 0.2,
        height: 0.2,
        confidence: 0.7
      }
    }
  ]
};

test('summarizes synced Vision bbox annotations by HITL review status', () => {
  const summary = summarizeVisionBboxAnnotationStatus({
    visionSummary,
    annotations: [
      {
        annotation_id: 'ann-1',
        annotation_type: 'bbox',
        review_status: 'candidate',
        metadata: {
          local_vision_observation_id: 'obs-white'
        }
      },
      {
        annotation_id: 'ann-2',
        annotation_type: 'bbox',
        review_status: 'approved',
        metadata: {
          local_vision_observation_id: 'obs-edge'
        }
      }
    ]
  });

  assert.equal(summary.status, 'pending_review');
  assert.equal(summary.totalVisionBboxes, 2);
  assert.equal(summary.synced, 2);
  assert.equal(summary.missing, 0);
  assert.equal(summary.candidate, 1);
  assert.equal(summary.approved, 1);
  assert.equal(summary.rejected, 0);
  assert.equal(summary.reviewComplete, false);
  assert.deepEqual(summary.pendingObservationIds, ['obs-white']);
  assert.deepEqual(summary.approvedObservationIds, ['obs-edge']);
});

test('marks all approved Vision bbox annotations as learning-ready but not graph-promoted', () => {
  const summary = summarizeVisionBboxAnnotationStatus({
    visionSummary,
    annotations: [
      {
        annotation_id: 'ann-1',
        annotation_type: 'bbox',
        review_status: 'approved',
        metadata: {
          local_vision_observation_id: 'obs-white'
        }
      },
      {
        annotation_id: 'ann-2',
        annotation_type: 'bbox',
        review_status: 'approved',
        metadata: {
          local_vision_observation_id: 'obs-edge'
        }
      }
    ]
  });

  assert.equal(summary.status, 'approved');
  assert.equal(summary.reviewComplete, true);
  assert.equal(summary.learningReadyCandidate, true);
  assert.equal(summary.graphPromotionAllowed, false);
  assert.deepEqual(summary.approvedObservationIds, ['obs-white', 'obs-edge']);
});

test('tracks missing and rejected Vision bbox annotations separately', () => {
  const summary = summarizeVisionBboxAnnotationStatus({
    visionSummary,
    annotations: [
      {
        annotation_id: 'ann-1',
        annotation_type: 'bbox',
        review_status: 'rejected',
        metadata: {
          local_vision_observation_id: 'obs-white'
        }
      }
    ]
  });

  assert.equal(summary.status, 'partially_synced');
  assert.equal(summary.reviewComplete, false);
  assert.equal(summary.missing, 1);
  assert.equal(summary.rejected, 1);
  assert.deepEqual(summary.rejectedObservationIds, ['obs-white']);
  assert.deepEqual(summary.missingObservationIds, ['obs-edge']);
});

test('ignores annotations that are not tied to Vision observation bbox metadata', () => {
  const summary = summarizeVisionBboxAnnotationStatus({
    visionSummary,
    annotations: [
      {
        annotation_id: 'ann-shape',
        annotation_type: 'bbox',
        review_status: 'approved',
        metadata: {
          local_shape_id: 'shape-1'
        }
      }
    ]
  });

  assert.equal(summary.status, 'not_synced');
  assert.equal(summary.synced, 0);
  assert.equal(summary.missing, 2);
  assert.deepEqual(summary.missingObservationIds, ['obs-white', 'obs-edge']);
});
