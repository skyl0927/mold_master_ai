const assert = require('node:assert/strict');
const test = require('node:test');
const {
  buildVisionHitlAuthorizationTemplate,
  computeVisionPacketDigest,
  validateVisionHitlAuthorization
} = require('../visionHitlAuthorization');

const HASHES = {
  approved: 'a'.repeat(64),
  pendingBurn: 'b'.repeat(64),
  pendingSink: 'c'.repeat(64)
};

const candidate = ({
  hash,
  relativePath,
  defectType,
  defectClass,
  priority = 1,
  bucket = 'agreement_high_confidence'
}) => ({
  relativePath,
  defectType,
  defectClass,
  contentSha256: hash,
  reviewPriority: priority,
  reviewBucket: bucket,
  labelEvidence: {
    sourceLabel: defectType,
    visionSuggestedLabel: defectType,
    visionConfidence: 0.94,
    conflict: false,
    auditedAt: '2026-07-24T08:00:00.000Z'
  },
  sourceLineage: {
    packetSourceKind: 'web-case',
    webCaseId: `case-${defectClass}`
  }
});

const manifest = {
  schemaVersion: 1,
  generatedAt: '2026-07-24T08:18:12.829Z',
  candidates: [
    candidate({
      hash: HASHES.approved,
      relativePath: 'web-case/approved-flash.jpg',
      defectType: '플래시',
      defectClass: 'flash'
    }),
    candidate({
      hash: HASHES.pendingBurn,
      relativePath: 'web-case/pending-burn.jpg',
      defectType: '흑점/탄화',
      defectClass: 'burn'
    }),
    candidate({
      hash: HASHES.pendingSink,
      relativePath: 'web-case/pending-sink.jpg',
      defectType: '싱크',
      defectClass: 'sink'
    }),
    candidate({
      hash: 'd'.repeat(64),
      relativePath: 'product-review/conflict.jpg',
      defectType: '웰드라인',
      defectClass: 'weld_line',
      priority: 4,
      bucket: 'class_conflict'
    })
  ]
};

const datasetItems = [{
  image_id: 'approved-flash',
  defect_type: '플래시',
  review_status: 'approved',
  metadata: {
    content_sha256: HASHES.approved
  }
}];

test('authorization template contains only unresolved high-confidence candidates', () => {
  const template = buildVisionHitlAuthorizationTemplate({
    manifest,
    packetRoot: 'C:\\packet',
    datasetItems,
    generatedAt: '2026-07-24T09:00:00.000Z'
  });

  assert.equal(template.schemaVersion, 1);
  assert.equal(template.authorizationStatement, 'PENDING_HUMAN_REVIEW');
  assert.equal(template.packetDigest, computeVisionPacketDigest(manifest));
  assert.equal(template.summary.totalTargets, 2);
  assert.deepEqual(
    template.targets.map(item => item.contentSha256),
    [HASHES.pendingBurn, HASHES.pendingSink]
  );
  assert.ok(template.targets.every(item => item.decision === 'pending'));
  assert.ok(template.targets.every(item => item.manufacturingImageConfirmed === false));
  assert.ok(template.targets.every(item => item.labelConfirmed === false));
});

test('validation accepts only explicitly reviewed image and label decisions', () => {
  const authorization = buildVisionHitlAuthorizationTemplate({
    manifest,
    packetRoot: 'C:\\packet',
    datasetItems,
    generatedAt: '2026-07-24T09:00:00.000Z'
  });
  authorization.authorizationStatement = 'I_CONFIRM_EACH_IMAGE_AND_LABEL';
  authorization.authorizedBy = 'reviewer-01';
  authorization.authorizedAt = '2026-07-24T09:30:00.000Z';
  authorization.targets = [authorization.targets[0]];
  Object.assign(authorization.targets[0], {
    decision: 'approve',
    manufacturingImageConfirmed: true,
    labelConfirmed: true,
    approvedDefectType: '흑점/탄화',
    reviewComment: '원본 이미지와 번 마크 라벨을 직접 확인함'
  });

  const result = validateVisionHitlAuthorization({
    authorization,
    manifest,
    datasetItems
  });

  assert.equal(result.targets.length, 1);
  assert.equal(result.targets[0].candidateId, `local-${HASHES.pendingBurn.slice(0, 20)}`);
  assert.equal(result.targets[0].defectClass, 'burn');
  assert.equal(result.targets[0].alreadyApproved, false);
});

test('validation rejects pending decisions and missing human confirmations', () => {
  const authorization = buildVisionHitlAuthorizationTemplate({
    manifest,
    packetRoot: 'C:\\packet',
    datasetItems
  });
  authorization.authorizationStatement = 'I_CONFIRM_EACH_IMAGE_AND_LABEL';
  authorization.authorizedBy = 'reviewer-01';
  authorization.authorizedAt = '2026-07-24T09:30:00.000Z';

  assert.throws(
    () => validateVisionHitlAuthorization({
      authorization,
      manifest,
      datasetItems
    }),
    /decision must be approve/
  );
});

test('validation rejects stale packet bindings and changed labels', () => {
  const authorization = buildVisionHitlAuthorizationTemplate({
    manifest,
    packetRoot: 'C:\\packet',
    datasetItems
  });
  authorization.authorizationStatement = 'I_CONFIRM_EACH_IMAGE_AND_LABEL';
  authorization.authorizedBy = 'reviewer-01';
  authorization.authorizedAt = '2026-07-24T09:30:00.000Z';
  Object.assign(authorization.targets[0], {
    decision: 'approve',
    manufacturingImageConfirmed: true,
    labelConfirmed: true,
    approvedDefectType: '싱크',
    reviewComment: '잘못된 라벨 변경을 시도하는 검토 기록'
  });

  assert.throws(
    () => validateVisionHitlAuthorization({
      authorization,
      manifest,
      datasetItems
    }),
    /does not match the packet class/
  );

  authorization.targets[0].approvedDefectType = '흑점/탄화';
  authorization.packetDigest = 'f'.repeat(64);
  assert.throws(
    () => validateVisionHitlAuthorization({
      authorization,
      manifest,
      datasetItems
    }),
    /packet digest does not match/
  );
});

test('validation rejects duplicate hashes and approved-label conflicts', () => {
  const authorization = buildVisionHitlAuthorizationTemplate({
    manifest,
    packetRoot: 'C:\\packet',
    datasetItems: []
  });
  authorization.authorizationStatement = 'I_CONFIRM_EACH_IMAGE_AND_LABEL';
  authorization.authorizedBy = 'reviewer-01';
  authorization.authorizedAt = '2026-07-24T09:30:00.000Z';
  const target = authorization.targets[0];
  Object.assign(target, {
    decision: 'approve',
    manufacturingImageConfirmed: true,
    labelConfirmed: true,
    approvedDefectType: '플래시',
    reviewComment: '원본과 플래시 라벨을 직접 확인함'
  });
  authorization.targets = [target, { ...target }];

  assert.throws(
    () => validateVisionHitlAuthorization({
      authorization,
      manifest,
      datasetItems: []
    }),
    /duplicate target hash/
  );

  authorization.targets = [target];
  assert.throws(
    () => validateVisionHitlAuthorization({
      authorization,
      manifest,
      datasetItems: [{
        image_id: 'conflicting-image',
        defect_type: '싱크',
        review_status: 'approved',
        metadata: { content_sha256: HASHES.approved }
      }]
    }),
    /conflicting approved label/
  );
});

test('validation requires reviewer identity, timestamp, targets, and authorization statement', () => {
  const authorization = buildVisionHitlAuthorizationTemplate({
    manifest,
    packetRoot: 'C:\\packet',
    datasetItems
  });

  assert.throws(
    () => validateVisionHitlAuthorization({ authorization, manifest, datasetItems }),
    /authorizationStatement/
  );
  authorization.authorizationStatement = 'I_CONFIRM_EACH_IMAGE_AND_LABEL';
  assert.throws(
    () => validateVisionHitlAuthorization({ authorization, manifest, datasetItems }),
    /authorizedBy/
  );
  authorization.authorizedBy = 'reviewer-01';
  assert.throws(
    () => validateVisionHitlAuthorization({ authorization, manifest, datasetItems }),
    /authorizedAt/
  );
  authorization.authorizedAt = '2026-07-24T09:30:00.000Z';
  authorization.targets = [];
  assert.throws(
    () => validateVisionHitlAuthorization({ authorization, manifest, datasetItems }),
    /at least one target/
  );
  assert.throws(
    () => validateVisionHitlAuthorization({
      authorization: { ...authorization, schemaVersion: 2 },
      manifest,
      datasetItems
    }),
    /schemaVersion/
  );
});

test('validation requires each target confirmation and a meaningful review comment', () => {
  const authorization = buildVisionHitlAuthorizationTemplate({
    manifest,
    packetRoot: 'C:\\packet',
    datasetItems
  });
  authorization.authorizationStatement = 'I_CONFIRM_EACH_IMAGE_AND_LABEL';
  authorization.authorizedBy = 'reviewer-01';
  authorization.authorizedAt = '2026-07-24T09:30:00.000Z';
  authorization.targets = [authorization.targets[0]];
  authorization.targets[0].decision = 'approve';

  assert.throws(
    () => validateVisionHitlAuthorization({ authorization, manifest, datasetItems }),
    /manufacturing image confirmation/
  );
  authorization.targets[0].manufacturingImageConfirmed = true;
  assert.throws(
    () => validateVisionHitlAuthorization({ authorization, manifest, datasetItems }),
    /label confirmation/
  );
  authorization.targets[0].labelConfirmed = true;
  assert.throws(
    () => validateVisionHitlAuthorization({ authorization, manifest, datasetItems }),
    /reviewComment/
  );
});

test('validation is idempotent for the same approved label but blocks rejected hashes', () => {
  const authorization = buildVisionHitlAuthorizationTemplate({
    manifest,
    packetRoot: 'C:\\packet',
    datasetItems: []
  });
  authorization.authorizationStatement = 'I_CONFIRM_EACH_IMAGE_AND_LABEL';
  authorization.authorizedBy = 'reviewer-01';
  authorization.authorizedAt = '2026-07-24T09:30:00.000Z';
  authorization.targets = [authorization.targets[1]];
  Object.assign(authorization.targets[0], {
    decision: 'approve',
    manufacturingImageConfirmed: true,
    labelConfirmed: true,
    approvedDefectType: '흑점/탄화',
    reviewComment: '원본 이미지와 번 마크 라벨을 직접 확인함'
  });
  const sameLabelDataset = [{
    image_id: 'approved-burn',
    defect_type: '흑점/탄화',
    review_status: 'approved',
    metadata: { content_sha256: HASHES.pendingBurn }
  }];

  const result = validateVisionHitlAuthorization({
    authorization,
    manifest,
    datasetItems: sameLabelDataset
  });
  assert.equal(result.targets[0].alreadyApproved, true);

  assert.throws(
    () => validateVisionHitlAuthorization({
      authorization,
      manifest,
      datasetItems: [{
        ...sameLabelDataset[0],
        review_status: 'rejected'
      }]
    }),
    /already rejected/
  );
});

test('validation blocks hashes that were not selected from the bound packet', () => {
  const authorization = buildVisionHitlAuthorizationTemplate({
    manifest,
    packetRoot: 'C:\\packet',
    datasetItems
  });
  authorization.authorizationStatement = 'I_CONFIRM_EACH_IMAGE_AND_LABEL';
  authorization.authorizedBy = 'reviewer-01';
  authorization.authorizedAt = '2026-07-24T09:30:00.000Z';
  authorization.targets = [{
    ...authorization.targets[0],
    contentSha256: 'e'.repeat(64),
    decision: 'approve',
    manufacturingImageConfirmed: true,
    labelConfirmed: true,
    reviewComment: '패킷에 없는 해시를 승인하려는 시도'
  }];

  assert.throws(
    () => validateVisionHitlAuthorization({ authorization, manifest, datasetItems }),
    /not an unresolved high-confidence packet candidate/
  );
});

test('empty manifests produce a stable zero-target template and cannot be authorized', () => {
  const emptyManifest = { schemaVersion: 1, candidates: null };
  const firstDigest = computeVisionPacketDigest(emptyManifest);
  const secondDigest = computeVisionPacketDigest(emptyManifest);
  assert.equal(firstDigest, secondDigest);

  const authorization = buildVisionHitlAuthorizationTemplate({
    manifest: emptyManifest,
    packetRoot: '',
    datasetItems: null
  });
  assert.equal(authorization.summary.totalTargets, 0);
  assert.deepEqual(authorization.summary.targetsByClass, {});

  authorization.authorizationStatement = 'I_CONFIRM_EACH_IMAGE_AND_LABEL';
  authorization.authorizedBy = 'reviewer-01';
  authorization.authorizedAt = '2026-07-24T09:30:00.000Z';
  authorization.targets = null;
  assert.throws(
    () => validateVisionHitlAuthorization({
      authorization,
      manifest: emptyManifest,
      datasetItems: null
    }),
    /at least one target/
  );
  assert.throws(
    () => validateVisionHitlAuthorization({
      authorization: null,
      manifest: emptyManifest
    }),
    /schemaVersion/
  );
});

test('a forged high-confidence bucket cannot bypass source and Vision agreement checks', () => {
  const forged = candidate({
    hash: 'f'.repeat(64),
    relativePath: 'web-case/forged.jpg',
    defectType: '흑점/탄화',
    defectClass: 'burn'
  });
  forged.labelEvidence = {
    ...forged.labelEvidence,
    visionSuggestedLabel: '싱크',
    visionConfidence: 0.99,
    conflict: true
  };

  const authorization = buildVisionHitlAuthorizationTemplate({
    manifest: {
      schemaVersion: 1,
      generatedAt: '2026-07-24T09:00:00.000Z',
      candidates: [forged]
    },
    packetRoot: 'C:\\packet',
    datasetItems: []
  });

  assert.equal(authorization.summary.totalTargets, 0);
});
