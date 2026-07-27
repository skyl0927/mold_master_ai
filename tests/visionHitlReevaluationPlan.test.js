const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildVisionHitlReevaluationManifest,
  buildVisionHitlReevaluationPlan
} = require('../visionHitlReevaluationPlan');

const correctedItem = ({
  imageId = 'image-corrected-1',
  defectType = '백화',
  metadata = {}
} = {}) => ({
  image_id: imageId,
  file_name: `${imageId}.png`,
  mime_type: 'image/png',
  review_status: 'needs_review',
  defect_type: defectType,
  observation_summary: '리브 주변 백화 후보를 사람이 교정함',
  question: '그릴 리브 주변 백화',
  metadata: {
    source_app: 'mold-master-ai',
    content_sha256: 'a'.repeat(64),
    human_review_decision: 'corrected',
    vision_review_protocol_version: 'vision-hitl-review/v1',
    vision_review_decision: 'corrected',
    vision_review_next_action: 'queue_re_evaluation',
    vision_review_re_evaluation_queue: 'vision_candidate_recheck',
    vision_review_requires_re_evaluation: true,
    vision_graph_promotion_allowed: false,
    vision_graph_promotion_blocked: true,
    vision_graph_promotion_block_reason: '재촬영 또는 HITL 교정 확정 전에는 Graph 승격할 수 없습니다.',
    vision_learning_candidate_eligible: false,
    capture_session_id: 'session-rib-white-01',
    capture_view_tags: ['full_part_context', 'defect_closeup'],
    capture_protocol_ready: true,
    corrected_analysis: {
      defectType,
      description: '리브 주변 유백색 변색',
      possibleCauses: '리브 구배 부족',
      countermeasures: '리브 구배 확대'
    },
    ...metadata
  }
});

test('corrected HITL metadata becomes a shadow Vision recheck benchmark candidate', () => {
  const plan = buildVisionHitlReevaluationPlan({
    generatedAt: '2026-07-27T08:00:00.000Z',
    items: [correctedItem()]
  });

  assert.equal(plan.schemaVersion, 1);
  assert.equal(plan.status, 'ready_for_recheck');
  assert.equal(plan.serviceWritesPerformed, false);
  assert.equal(plan.summary.totalHitlReviewItems, 1);
  assert.equal(plan.summary.readyForShadowRecheck, 1);
  assert.equal(plan.summary.waitingForRecapture, 0);
  assert.equal(plan.items[0].status, 'ready_for_shadow_recheck');
  assert.equal(plan.items[0].serviceWriteAllowed, false);
  assert.equal(plan.items[0].benchmarkCaseCandidate.commonAgentImageId, 'image-corrected-1');
  assert.equal(plan.items[0].benchmarkCaseCandidate.expected.defectType, '백화');
  assert.equal(plan.items[0].benchmarkCaseCandidate.expected.defectClass, 'whitening');
  assert.equal(plan.items[0].benchmarkCaseCandidate.sourceReview.reviewQueue, 'vision_candidate_recheck');
  assert.equal(plan.items[0].benchmarkCaseCandidate.sourceReview.learningCandidateEligible, false);
});

test('recapture HITL metadata is excluded from benchmark until a fresh image exists', () => {
  const plan = buildVisionHitlReevaluationPlan({
    generatedAt: '2026-07-27T08:00:00.000Z',
    items: [
      correctedItem({
        imageId: 'image-recapture-1',
        metadata: {
          human_review_decision: 'recapture',
          vision_review_decision: 'recapture',
          vision_review_next_action: 'request_recapture',
          vision_review_re_evaluation_queue: 'vision_recapture_required',
          vision_required_additional_views: ['초점 보정 후 결함 근접 재촬영'],
          vision_quality_concerns: ['motion blur hides the defect edge']
        }
      })
    ]
  });

  assert.equal(plan.status, 'action_required');
  assert.equal(plan.summary.readyForShadowRecheck, 0);
  assert.equal(plan.summary.waitingForRecapture, 1);
  assert.equal(plan.items[0].status, 'waiting_for_recapture');
  assert.deepEqual(plan.items[0].reasons, ['recapture_required']);
  assert.equal(plan.items[0].benchmarkCaseCandidate, null);
  assert.deepEqual(plan.items[0].requiredAdditionalViews, ['초점 보정 후 결함 근접 재촬영']);
  assert.deepEqual(plan.items[0].qualityConcerns, ['motion blur hides the defect edge']);
});

test('recapture HITL plan preserves bbox safety reasons for field follow-up', () => {
  const plan = buildVisionHitlReevaluationPlan({
    generatedAt: '2026-07-27T08:00:00.000Z',
    items: [
      correctedItem({
        imageId: 'image-bbox-recapture-1',
        metadata: {
          human_review_decision: 'recapture',
          vision_review_decision: 'recapture',
          vision_review_next_action: 'request_recapture',
          vision_review_re_evaluation_queue: 'vision_recapture_required',
          vision_safety_gate_reasons: ['low_region_bbox_confidence', 'overbroad_region_bbox'],
          vision_bbox_grounding_profile_id: 'defect_closeup_precision',
          vision_required_additional_views: [
            'bbox 신뢰도 보강: 초점/조명 보정 후 동일 위치 재촬영',
            'bbox 범위 축소: 결함 부위가 프레임 중앙에 오도록 근접 재촬영'
          ]
        }
      })
    ]
  });

  assert.equal(plan.items[0].status, 'waiting_for_recapture');
  assert.deepEqual(plan.items[0].reasons, [
    'recapture_required',
    'low_region_bbox_confidence',
    'overbroad_region_bbox'
  ]);
  assert.equal(plan.items[0].bboxGroundingProfileId, 'defect_closeup_precision');
});

test('re-evaluation manifest contains only active corrected recheck candidates', () => {
  const plan = buildVisionHitlReevaluationPlan({
    generatedAt: '2026-07-27T08:00:00.000Z',
    items: [
      correctedItem(),
      correctedItem({
        imageId: 'image-recapture-1',
        metadata: {
          human_review_decision: 'recapture',
          vision_review_decision: 'recapture',
          vision_review_next_action: 'request_recapture',
          vision_review_re_evaluation_queue: 'vision_recapture_required'
        }
      })
    ]
  });
  const manifest = buildVisionHitlReevaluationManifest(plan);

  assert.equal(manifest.version, 1);
  assert.equal(manifest.source, 'vision-hitl-review/v1');
  assert.equal(manifest.cases.length, 1);
  assert.equal(manifest.cases[0].id, 'hitl-recheck-image-corrected-1');
  assert.equal(manifest.cases[0].status, 'active');
  assert.ok(manifest.cases[0].tags.includes('hitl-corrected-recheck'));
  assert.equal(manifest.cases[0].commonAgentImageId, 'image-corrected-1');
  assert.equal(manifest.cases[0].expected.defectClass, 'whitening');
});

test('unsafe or incomplete corrected HITL items are blocked from recheck manifest', () => {
  const plan = buildVisionHitlReevaluationPlan({
    generatedAt: '2026-07-27T08:00:00.000Z',
    items: [
      correctedItem({
        imageId: '',
        metadata: {
          content_sha256: '',
          corrected_analysis: {
            defectType: '판정 불가',
            description: '불명확'
          }
        }
      }),
      correctedItem({
        imageId: 'image-accidental-learning',
        metadata: {
          vision_learning_candidate_eligible: true,
          learning_candidate_eligible: true
        }
      })
    ]
  });
  const manifest = buildVisionHitlReevaluationManifest(plan);

  assert.equal(plan.summary.blocked, 2);
  assert.deepEqual(plan.items.map(item => item.status), ['blocked', 'blocked']);
  assert.ok(plan.items[0].reasons.includes('missing_image_id'));
  assert.ok(plan.items[0].reasons.includes('missing_content_sha256'));
  assert.ok(plan.items[0].reasons.includes('unclassifiable_defect_label'));
  assert.ok(plan.items[1].reasons.includes('learning_candidate_must_remain_false'));
  assert.equal(manifest.cases.length, 0);
});
