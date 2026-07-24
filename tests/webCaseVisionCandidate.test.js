const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');

const {
  buildWebCaseVisionCandidateManifest
} = require('../webCaseVisionCandidate');

const hash = value => crypto.createHash('sha256').update(value).digest('hex');

const card = ({
  caseId,
  defectName,
  defectClass,
  localFile,
  contentSha256
}) => ({
  schemaVersion: 1,
  caseId,
  sourceKind: 'licensed_image',
  defectName,
  defectClass,
  problem: `${defectName} 결함이 발생한다.`,
  phenomenon: `${defectName} 시각 증상이 관찰된다.`,
  causes: [{ text: '원인 후보', actions: ['대책 후보'] }],
  checkItems: ['확인 항목'],
  actions: ['대책 후보'],
  evidence: [{
    publisher: 'Wikimedia Commons',
    title: `${defectName} source image`,
    sourceUrl: `https://commons.wikimedia.org/wiki/File:${caseId}.png`,
    retrievedAt: '2026-07-24T00:00:00.000Z',
    reuseMode: 'licensed_copy',
    license: 'CC BY-SA 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    licenseVerificationUrl: 'https://example.invalid/license-record',
    sourceRecordId: 'source-record-1',
    sourceCitation: 'Source citation text',
    author: 'source author',
    localFile,
    contentSha256
  }],
  review: {
    status: 'candidate',
    requiresHumanReview: true,
    autoApprovalAllowed: false
  }
});

test('web case images become missing-class Vision candidates with source lineage', () => {
  const burnHash = hash('burn-image');
  const sinkHash = hash('sink-image');
  const manifest = buildWebCaseVisionCandidateManifest({
    collection: {
      rootPath: 'C:/collection',
      integrity: { valid: true, cardCount: 3, verifiedImages: 3 },
      cards: [
        card({
          caseId: 'burn-case',
          defectName: '흑점/탄화',
          defectClass: 'burn',
          localFile: 'images/burn.png',
          contentSha256: burnHash
        }),
        card({
          caseId: 'sink-case',
          defectName: '싱크',
          defectClass: 'sink',
          localFile: 'images/sink.png',
          contentSha256: sinkHash
        }),
        card({
          caseId: 'flash-case',
          defectName: '플래시',
          defectClass: 'flash',
          localFile: 'images/flash.png',
          contentSha256: hash('flash-image')
        })
      ]
    },
    approvedClassCounts: {
      burn: 0,
      sink: 0,
      flash: 2
    },
    minimumSamplesPerClass: 2,
    missingOnly: true,
    generatedAt: '2026-07-24T07:00:00.000Z'
  });

  assert.equal(manifest.policy.persistence, 'none');
  assert.equal(manifest.policy.autoApproval, false);
  assert.equal(manifest.policy.graphPromotion, false);
  assert.deepEqual(manifest.summary.selectedByClass, { burn: 1, sink: 1 });
  assert.deepEqual(manifest.summary.remainingAfterCandidates, { burn: 1, sink: 1 });
  assert.equal(manifest.candidates.length, 2);
  assert.equal(manifest.candidates[0].relativePath, 'images/burn.png');
  assert.equal(manifest.candidates[0].defectClass, 'burn');
  assert.equal(manifest.candidates[0].requiresLabelReconciliation, true);
  assert.equal(manifest.candidates[0].sourceLineage.webCaseId, 'burn-case');
  assert.equal(manifest.candidates[0].sourceLineage.sourcePublisher, 'Wikimedia Commons');
  assert.equal(manifest.candidates[0].sourceLineage.license, 'CC BY-SA 4.0');
  assert.equal(
    manifest.candidates[0].sourceLineage.licenseVerificationUrl,
    'https://example.invalid/license-record'
  );
  assert.equal(manifest.candidates[0].sourceLineage.sourceRecordId, 'source-record-1');
  assert.equal(manifest.candidates[0].sourceLineage.sourceCitation, 'Source citation text');
  assert.equal(manifest.candidates[0].sourceLineage.sourceReviewStatus, 'candidate');
  assert.equal(manifest.candidates[0].contentSha256, burnHash);
});

test('web case candidate selection deduplicates identical image bytes', () => {
  const duplicateHash = hash('same-image');
  const manifest = buildWebCaseVisionCandidateManifest({
    collection: {
      rootPath: 'C:/collection',
      integrity: { valid: true, cardCount: 2, verifiedImages: 2 },
      cards: [
        card({
          caseId: 'burn-a',
          defectName: '탄화',
          defectClass: 'burn',
          localFile: 'images/burn-a.png',
          contentSha256: duplicateHash
        }),
        card({
          caseId: 'burn-b',
          defectName: '탄화',
          defectClass: 'burn',
          localFile: 'images/burn-b.png',
          contentSha256: duplicateHash
        })
      ]
    },
    approvedClassCounts: { burn: 0 },
    minimumSamplesPerClass: 2
  });

  assert.equal(manifest.candidates.length, 1);
  assert.equal(manifest.summary.duplicatesSkipped, 1);
});

test('web case selection adds independent supplemental samples for the total gate', () => {
  const manifest = buildWebCaseVisionCandidateManifest({
    collection: {
      rootPath: 'C:/collection',
      integrity: { valid: true, cardCount: 3, verifiedImages: 3 },
      cards: [
        card({
          caseId: 'burn-extra',
          defectName: '탄화',
          defectClass: 'burn',
          localFile: 'images/burn-extra.png',
          contentSha256: hash('burn-extra')
        }),
        card({
          caseId: 'sink-extra',
          defectName: '싱크',
          defectClass: 'sink',
          localFile: 'images/sink-extra.png',
          contentSha256: hash('sink-extra')
        }),
        card({
          caseId: 'flash-extra',
          defectName: '플래시',
          defectClass: 'flash',
          localFile: 'images/flash-extra.png',
          contentSha256: hash('flash-extra')
        })
      ]
    },
    approvedClassCounts: {
      burn: 2,
      sink: 2,
      flash: 2
    },
    minimumSamplesPerClass: 2,
    currentApprovedSamples: 18,
    minimumTotalSamples: 20,
    missingOnly: true
  });

  assert.equal(manifest.candidates.length, 2);
  assert.equal(manifest.summary.classCoverageSelected, 0);
  assert.equal(manifest.summary.supplementalSelected, 2);
  assert.equal(manifest.summary.additionalTotalSamplesRequired, 2);
  assert.equal(manifest.summary.additionalTotalSamplesAfterCandidates, 0);
});
