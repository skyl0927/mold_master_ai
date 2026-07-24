const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
    applyVisionAuditObservation,
    buildVisionHumanReviewPacket,
    collectReviewCandidates,
    rankVisionReviewCandidate,
    summarizeVisionAuditCandidates
} = require('../visionHumanReviewPacket');

const hash = value => crypto.createHash('sha256').update(value).digest('hex');

test('review packet normalizes three candidate sources and deduplicates by content hash', () => {
    const sharedHash = hash('shared');
    const uniqueHash = hash('unique');
    const collected = collectReviewCandidates({
        knowledgeCard: {
            candidates: [{
                relativePath: 'whitening.png',
                defectType: '백화',
                defectClass: 'whitening',
                contentSha256: sharedHash,
                sourceLineage: { sourceReviewStatus: 'review_needed' }
            }]
        },
        productReview: {
            candidates: [{
                relativePath: 'duplicate.jpg',
                defectType: '백화',
                defectClass: 'whitening',
                contentSha256: sharedHash,
                requiresLabelReconciliation: true
            }]
        },
        missingClass: {
            items: [{
                file: 'burn.jpg',
                suggestedClass: 'burn',
                contentSha256: uniqueHash,
                reviewDecision: 'unreviewed',
                sourceReviewStatus: 'review_needed'
            }]
        }
    });

    assert.equal(collected.candidates.length, 2);
    assert.equal(collected.duplicatesSkipped, 1);
    assert.deepEqual(collected.classCounts, { whitening: 1, burn: 1 });
    assert.equal(collected.candidates[0].requiresLabelReconciliation, true);
    assert.equal(collected.candidates[1].defectType, '가스 탐/번 마크');
    assert.equal(collected.candidates[1].requiresLabelReconciliation, true);
});

test('review packet verifies source hashes and writes a scanner-compatible manifest', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vision-review-packet-'));
    const sourceRoot = path.join(root, 'source');
    const outputRoot = path.join(root, 'output');
    fs.mkdirSync(sourceRoot);
    const bytes = Buffer.from('manufacturing-image');
    fs.writeFileSync(path.join(sourceRoot, 'sample.png'), bytes);

    const result = buildVisionHumanReviewPacket({
        outputRoot,
        sources: [{
            kind: 'knowledge-card',
            rootPath: sourceRoot,
            manifest: {
                candidates: [{
                    relativePath: 'sample.png',
                    defectType: '백화',
                    defectClass: 'whitening',
                    fieldContext: 'rib whitening',
                    contentSha256: hash(bytes),
                    sourceLineage: { sourceReviewStatus: 'review_needed' }
                }]
            }
        }],
        approvedClassCounts: { ejection: 1 },
        minimumSamples: 20,
        minimumSamplesPerClass: 2
    });

    const manifest = JSON.parse(fs.readFileSync(result.manifestPath, 'utf8'));
    assert.equal(manifest.summary.candidates, 1);
    assert.equal(manifest.summary.currentCleanApproved, 1);
    assert.equal(manifest.summary.additionalCleanApprovalsRequired, 19);
    assert.equal(manifest.summary.minimumClassApprovalsRequired.ejection, 1);
    assert.equal(manifest.summary.minimumClassApprovalsRequired.whitening, 2);
    assert.equal(manifest.candidates[0].relativePath, 'knowledge-card/sample.png');
    assert.equal(manifest.candidates[0].requiresLabelReconciliation, true);
    assert.equal(
        hash(fs.readFileSync(path.join(outputRoot, 'knowledge-card', 'sample.png'))),
        hash(bytes)
    );

    fs.rmSync(root, { recursive: true, force: true });
});

test('review packet rejects a source file whose hash changed after discovery', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vision-review-hash-'));
    fs.writeFileSync(path.join(root, 'changed.png'), 'changed');

    assert.throws(
        () => buildVisionHumanReviewPacket({
            outputRoot: path.join(root, 'output'),
            sources: [{
                kind: 'product-review',
                rootPath: root,
                manifest: {
                    candidates: [{
                        relativePath: 'changed.png',
                        defectType: '웰드라인',
                        defectClass: 'weld_line',
                        contentSha256: hash('original')
                    }]
                }
            }]
        }),
        /hash mismatch/
    );

    fs.rmSync(root, { recursive: true, force: true });
});

test('Vision audit records a non-persisting suggestion without replacing the source label', () => {
    const candidate = {
        defectType: '백화',
        defectClass: 'whitening',
        contentSha256: hash('candidate'),
        requiresLabelReconciliation: true
    };
    const audited = applyVisionAuditObservation(candidate, {
        defect_type: '백화',
        confidence: 0.91,
        summary: '리브 주변 국부 백화',
        possible_causes: ['취출 저항'],
        recommended_checks: ['빼기 구배 확인']
    }, '2026-07-23T00:00:00.000Z');

    assert.equal(audited.defectType, '백화');
    assert.equal(audited.defectClass, 'whitening');
    assert.equal(audited.labelEvidence.visionSuggestedLabel, '백화');
    assert.equal(audited.labelEvidence.conflict, false);
    assert.equal(audited.labelEvidence.nonPersisting, true);
    assert.equal(audited.requiresLabelReconciliation, true);
});

test('Vision audit flags conflicting and unclassifiable suggestions for human review', () => {
    const candidate = {
        defectType: '웰드라인',
        defectClass: 'weld_line',
        contentSha256: hash('candidate-conflict')
    };
    const conflicting = applyVisionAuditObservation(candidate, {
        defect_type: '취출/이형',
        confidence: 0.88,
        summary: '표면 뜯김'
    });
    const unclassifiable = applyVisionAuditObservation(candidate, {
        defect_type: '판정 불가',
        confidence: 0.99,
        summary: '소프트웨어 화면'
    });

    assert.equal(conflicting.labelEvidence.conflict, true);
    assert.equal(conflicting.audit.classifiable, true);
    assert.equal(conflicting.audit.suggestedDefectClass, 'ejection');
    assert.equal(unclassifiable.labelEvidence.conflict, true);
    assert.equal(unclassifiable.audit.classifiable, false);
    assert.equal(unclassifiable.audit.modelConfidence, 0.99);
    assert.equal(unclassifiable.audit.confidence, 0);
});

test('Vision audit summary excludes pending candidates from conflict metrics', () => {
    const audited = applyVisionAuditObservation({
        defectType: '백화',
        defectClass: 'whitening'
    }, {
        defect_type: '백화',
        confidence: 0.8
    }, '2026-07-23T00:00:00.000Z');
    const summary = summarizeVisionAuditCandidates([
        audited,
        { defectType: '미성형', defectClass: 'short_shot' }
    ]);

    assert.equal(summary.total, 2);
    assert.equal(summary.audited, 1);
    assert.equal(summary.pending, 1);
    assert.equal(summary.classifiable, 1);
    assert.equal(summary.unclassifiable, 0);
    assert.equal(summary.agreements, 1);
    assert.equal(summary.conflicts, 0);
});

test('Vision review ranking prioritizes high-confidence class agreement', () => {
    const highAgreement = rankVisionReviewCandidate({
        defectClass: 'whitening',
        labelEvidence: {
            visionSuggestedLabel: '백화',
            visionConfidence: 0.81,
            conflict: false,
            auditedAt: '2026-07-23T00:00:00.000Z'
        }
    });
    const lowAgreement = rankVisionReviewCandidate({
        defectClass: 'ejection',
        labelEvidence: {
            visionSuggestedLabel: '취출/이형',
            visionConfidence: 0.56,
            conflict: false,
            auditedAt: '2026-07-23T00:00:00.000Z'
        }
    });
    const conflict = rankVisionReviewCandidate({
        defectClass: 'weld_line',
        labelEvidence: {
            visionSuggestedLabel: '취출/이형',
            visionConfidence: 0.88,
            conflict: true,
            auditedAt: '2026-07-23T00:00:00.000Z'
        }
    });
    const unclassifiable = rankVisionReviewCandidate({
        defectClass: 'burn',
        labelEvidence: {
            visionSuggestedLabel: '판정 불가',
            visionConfidence: 0,
            conflict: true,
            auditedAt: '2026-07-23T00:00:00.000Z'
        }
    });
    const heuristicAgreement = rankVisionReviewCandidate({
        defectClass: 'sink',
        labelProvenance: 'heuristic_suggested_class',
        labelEvidence: {
            visionSuggestedLabel: '싱크 마크',
            visionConfidence: 0.8,
            conflict: false,
            auditedAt: '2026-07-23T00:00:00.000Z'
        }
    });

    assert.deepEqual(
        [
            highAgreement.reviewBucket,
            lowAgreement.reviewBucket,
            heuristicAgreement.reviewBucket,
            conflict.reviewBucket,
            unclassifiable.reviewBucket
        ],
        [
            'agreement_high_confidence',
            'agreement_low_confidence',
            'heuristic_agreement',
            'class_conflict',
            'unclassifiable'
        ]
    );
    assert.deepEqual(
        [
            highAgreement.reviewPriority,
            lowAgreement.reviewPriority,
            heuristicAgreement.reviewPriority,
            conflict.reviewPriority,
            unclassifiable.reviewPriority
        ],
        [1, 2, 3, 4, 5]
    );
});
