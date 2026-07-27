const assert = require('node:assert/strict');
const test = require('node:test');
const {
  buildVisionReferenceBackfillPlan
} = require('../visionReferenceBackfillPlan');
const {
  AUTHORIZATION_STATEMENT,
  buildVisionReferenceBackfillAuthorizationTemplate,
  computeVisionReferenceBackfillDigest,
  validateVisionReferenceBackfillAuthorization
} = require('../visionReferenceBackfillAuthorization');

const legacyItem = ({
  imageId = 'legacy-whitening',
  defectType = 'whitening',
  contentHash = 'a'.repeat(64),
  observationDefect = defectType
} = {}) => ({
  image_id: imageId,
  file_name: `${imageId}.jpg`,
  mime_type: 'image/jpeg',
  review_status: 'approved',
  defect_type: defectType,
  labels: [defectType],
  confidence: 0.87,
  observation: {
    contract_version: 'vision-observation/v1',
    summary: 'white discoloration near rib',
    defect_type: observationDefect,
    visible_features: [
      'white discoloration near rib',
      'localized color change around ejector-side rib'
    ],
    confidence: 0.82
  },
  metadata: {
    content_hash: contentHash,
    capture_protocol_ready: false
  }
});

const buildPlan = () => buildVisionReferenceBackfillPlan({
  generatedAt: '2026-07-27T03:00:00.000Z',
  items: [
    legacyItem(),
    legacyItem({
      imageId: 'legacy-flash',
      defectType: 'flash',
      contentHash: 'b'.repeat(64)
    })
  ]
});

test('backfill authorization template is hash-bound and pending by default', () => {
  const plan = buildPlan();
  const template = buildVisionReferenceBackfillAuthorizationTemplate({
    plan,
    generatedAt: '2026-07-27T03:10:00.000Z'
  });

  assert.equal(template.schemaVersion, 1);
  assert.equal(template.authorizationStatement, 'PENDING_HUMAN_REVIEW');
  assert.equal(template.backfillPlanDigest, computeVisionReferenceBackfillDigest(plan));
  assert.equal(template.summary.totalTargets, 2);
  assert.equal(template.summary.writesPerformed, false);
  assert.deepEqual(
    template.targets.map(target => target.imageId),
    ['legacy-flash', 'legacy-whitening']
  );
  assert.ok(template.targets.every(target => target.decision === 'pending'));
  assert.ok(template.targets.every(target => target.manufacturingImageConfirmed === false));
  assert.ok(template.targets.every(target => target.v2ObservationConfirmed === false));
  assert.ok(template.targets.every(target => target.captureProtocolConfirmed === false));
});

test('validation returns a dry-run write plan only after explicit human confirmations', () => {
  const plan = buildPlan();
  const authorization = buildVisionReferenceBackfillAuthorizationTemplate({
    plan,
    generatedAt: '2026-07-27T03:10:00.000Z'
  });
  authorization.authorizationStatement = AUTHORIZATION_STATEMENT;
  authorization.authorizedBy = 'reviewer-01';
  authorization.authorizedAt = '2026-07-27T03:20:00.000Z';
  authorization.targets = [authorization.targets[1]];
  Object.assign(authorization.targets[0], {
    decision: 'approve_backfill',
    manufacturingImageConfirmed: true,
    defectVisibleConfirmed: true,
    labelConfirmed: true,
    v2ObservationConfirmed: true,
    captureProtocolConfirmed: true,
    approvedDefectType: 'whitening',
    approvedCaptureSessionId: 'session-white-01',
    approvedCaptureViewTag: 'defect_closeup',
    reviewComment: '제품 실물 이미지와 백화 라벨, 리브 주변 변색 관찰을 확인함'
  });

  const result = validateVisionReferenceBackfillAuthorization({
    authorization,
    plan
  });

  assert.equal(result.targets.length, 1);
  assert.equal(result.serviceWritesPerformed, false);
  assert.equal(result.targets[0].imageId, 'legacy-whitening');
  assert.equal(result.targets[0].reviewPayload.decision, 'edit');
  assert.equal(result.targets[0].reviewPayload.metadata.reference_backfill_human_authorized, true);
  assert.equal(result.targets[0].reviewPayload.metadata.capture_session_id, 'session-white-01');
  assert.equal(result.targets[0].reviewPayload.metadata.capture_view_tag, 'defect_closeup');
  assert.equal(result.targets[0].reviewPayload.metadata.capture_protocol_ready, true);
  assert.equal(result.targets[0].reviewPayload.metadata.proposed_contract_version, 'vision-observation/v2');
  assert.equal(result.targets[0].reviewPayload.observation.contract_version, 'vision-observation/v2');
  assert.equal(result.targets[0].reviewPayload.observation.image_kind, 'physical_product');
  assert.equal(result.targets[0].reviewPayload.observation.normality_status, 'defect_visible');
  assert.equal(result.targets[0].reviewPayload.observation.candidates[0].defect_type, 'whitening');
  assert.equal(result.targets[0].reviewPayload.metadata.reference_backfill_requires_observation_v2_write_support, true);
  assert.equal(result.commonAgentCompatibility.canSatisfyLearningReadyPrecheck, false);
  assert.ok(
    result.commonAgentCompatibility.missingCapabilities.includes('image_dataset_observation_v2_write')
  );
});

test('validation rejects stale plans, pending decisions, and missing confirmations', () => {
  const plan = buildPlan();
  const authorization = buildVisionReferenceBackfillAuthorizationTemplate({ plan });

  assert.throws(
    () => validateVisionReferenceBackfillAuthorization({ authorization, plan }),
    /authorizationStatement/
  );
  authorization.authorizationStatement = AUTHORIZATION_STATEMENT;
  authorization.authorizedBy = 'reviewer-01';
  authorization.authorizedAt = '2026-07-27T03:20:00.000Z';
  assert.throws(
    () => validateVisionReferenceBackfillAuthorization({ authorization, plan }),
    /decision must be approve_backfill/
  );
  authorization.targets = [{
    ...authorization.targets[0],
    decision: 'approve_backfill',
    manufacturingImageConfirmed: true,
    defectVisibleConfirmed: true,
    labelConfirmed: true,
    v2ObservationConfirmed: true,
    captureProtocolConfirmed: true,
    approvedDefectType: 'sink',
    approvedCaptureSessionId: 'session-flash-01',
    approvedCaptureViewTag: 'defect_closeup',
    reviewComment: '플래시 라벨을 확인함'
  }];
  assert.throws(
    () => validateVisionReferenceBackfillAuthorization({ authorization, plan }),
    /approved label does not match/
  );
  authorization.targets[0].approvedDefectType = 'flash';
  authorization.backfillPlanDigest = 'f'.repeat(64);
  assert.throws(
    () => validateVisionReferenceBackfillAuthorization({ authorization, plan }),
    /digest does not match/
  );
});

test('validation blocks forged targets and unsupported capture view tags', () => {
  const plan = buildPlan();
  const authorization = buildVisionReferenceBackfillAuthorizationTemplate({ plan });
  authorization.authorizationStatement = AUTHORIZATION_STATEMENT;
  authorization.authorizedBy = 'reviewer-01';
  authorization.authorizedAt = '2026-07-27T03:20:00.000Z';
  authorization.targets = [{
    ...authorization.targets[0],
    imageId: 'not-in-plan',
    decision: 'approve_backfill',
    manufacturingImageConfirmed: true,
    defectVisibleConfirmed: true,
    labelConfirmed: true,
    v2ObservationConfirmed: true,
    captureProtocolConfirmed: true,
    approvedDefectType: 'flash',
    approvedCaptureSessionId: 'session-x',
    approvedCaptureViewTag: 'defect_closeup',
    reviewComment: '패킷에 없는 이미지를 승인하려는 시도'
  }];

  assert.throws(
    () => validateVisionReferenceBackfillAuthorization({ authorization, plan }),
    /not a HITL backfill target/
  );

  authorization.targets[0].imageId = 'legacy-flash';
  authorization.targets[0].approvedCaptureViewTag = 'free_text_view';
  assert.throws(
    () => validateVisionReferenceBackfillAuthorization({ authorization, plan }),
    /approvedCaptureViewTag/
  );
});
