const assert = require('node:assert/strict');
const test = require('node:test');

const {
  REQUIRED_CAPTURE_VIEW_TAGS,
  buildVisionReferenceBackfillPlan
} = require('../visionReferenceBackfillPlan');

const observed = (id, category, description) => ({
  observation_id: id,
  category,
  description,
  confidence: 0.9
});

const v2Observation = defectType => ({
  contract_version: 'vision-observation/v2',
  image_kind: 'physical_product',
  normality_status: 'defect_visible',
  summary: `${defectType} visible on physical product`,
  observations: [
    observed('obs-boundary', 'boundary', 'thin raised line along parting boundary'),
    observed('obs-surface', 'surface', 'local surface mismatch at defect region')
  ],
  candidates: [
    {
      defect_type: defectType,
      confidence: 0.86,
      supporting_observation_ids: ['obs-boundary', 'obs-surface']
    },
    {
      defect_type: 'sink',
      confidence: 0.18,
      supporting_observation_ids: ['obs-surface']
    }
  ],
  confidence: 0.88
});

const item = ({
  imageId,
  viewTag,
  sessionId = 'session-ready-1',
  defectType = 'flash',
  reviewStatus = 'approved',
  observation = v2Observation(defectType),
  metadata = {}
}) => ({
  image_id: imageId,
  file_name: `${imageId}.jpg`,
  mime_type: 'image/jpeg',
  review_status: reviewStatus,
  defect_type: defectType,
  labels: [defectType],
  confidence: 0.9,
  observation,
  metadata: {
    capture_session_id: sessionId,
    capture_view_tag: viewTag,
    capture_protocol_ready: true,
    content_hash: `${imageId}-hash`,
    product_family: 'grille',
    mold_id: 'mold-a',
    ...metadata
  }
});

test('marks approved v2 multi-view physical-product rows as reference candidates', () => {
  const plan = buildVisionReferenceBackfillPlan({
    generatedAt: '2026-07-27T02:00:00.000Z',
    items: [
      item({ imageId: 'ready-full', viewTag: 'full_part_context' }),
      item({ imageId: 'ready-close', viewTag: 'defect_closeup' })
    ]
  });

  assert.deepEqual(REQUIRED_CAPTURE_VIEW_TAGS, ['full_part_context', 'defect_closeup']);
  assert.equal(plan.summary.eligibleReferenceCandidates, 2);
  assert.equal(plan.summary.needsHitlBackfill, 0);
  assert.equal(plan.summary.blocked, 0);
  assert.deepEqual(
    plan.items.map(entry => entry.status),
    ['eligible_reference_candidate', 'eligible_reference_candidate']
  );
  assert.ok(plan.items.every(entry => entry.reasons.length === 0));
  assert.ok(plan.items.every(entry => entry.serviceWriteAllowed === false));
});

test('turns legacy approved rows into HITL backfill targets without authorizing writes', () => {
  const legacy = item({
    imageId: 'legacy-whitening',
    viewTag: 'defect_closeup',
    defectType: 'whitening',
    observation: {
      contract_version: 'vision-observation/v1',
      summary: 'white discoloration near rib',
      defect_type: 'whitening',
      visible_features: ['white discoloration near rib'],
      confidence: 0.84
    },
    metadata: {
      capture_protocol_ready: false
    }
  });

  const plan = buildVisionReferenceBackfillPlan({
    generatedAt: '2026-07-27T02:00:00.000Z',
    items: [legacy]
  });

  assert.equal(plan.summary.needsHitlBackfill, 1);
  assert.equal(plan.summary.eligibleReferenceCandidates, 0);
  assert.equal(plan.summary.blocked, 0);
  assert.equal(plan.items[0].status, 'needs_hitl_backfill');
  assert.deepEqual(plan.items[0].reasons, [
    'legacy_vision_contract',
    'capture_protocol_not_ready',
    'missing_required_views',
    'vision_safety_gate_requires_review'
  ]);
  assert.equal(plan.items[0].proposedReviewPayload.decision, 'edit');
  assert.equal(plan.items[0].proposedReviewPayload.promote_to_graph, false);
  assert.equal(plan.items[0].proposedReviewPayload.metadata.proposed_contract_version, 'vision-observation/v2');
  assert.equal(plan.items[0].serviceWriteAllowed, false);
});

test('blocks label conflicts and non-physical images from reference backfill', () => {
  const plan = buildVisionReferenceBackfillPlan({
    generatedAt: '2026-07-27T02:00:00.000Z',
    items: [
      item({
        imageId: 'label-conflict',
        viewTag: 'defect_closeup',
        defectType: 'flash',
        observation: v2Observation('sink')
      }),
      item({
        imageId: 'diagram',
        viewTag: 'full_part_context',
        defectType: 'flash',
        observation: {
          contract_version: 'vision-observation/v2',
          image_kind: 'document_or_diagram',
          normality_status: 'defect_visible',
          summary: 'drawing screenshot',
          observations: [
            observed('obs-drawing', 'geometry', 'CAD-like line drawing')
          ],
          candidates: [{
            defect_type: 'flash',
            confidence: 0.8,
            supporting_observation_ids: ['obs-drawing']
          }]
        }
      })
    ]
  });

  assert.equal(plan.summary.blocked, 2);
  assert.equal(plan.items[0].status, 'blocked');
  assert.ok(plan.items[0].reasons.includes('label_conflict'));
  assert.equal(plan.items[1].status, 'blocked');
  assert.ok(plan.items[1].reasons.includes('non_physical_image'));
  assert.equal(plan.summary.reasonCounts.label_conflict, 1);
  assert.equal(plan.summary.reasonCounts.non_physical_image, 1);
});
