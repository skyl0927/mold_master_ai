const assert = require('node:assert/strict');
const test = require('node:test');

const { buildVisionReviewQueue } = require('../visionReviewQueue');

const coverage = [
    { defectClass: 'whitening', count: 0, required: 2, missing: 2, covered: false },
    { defectClass: 'flash', count: 2, required: 2, missing: 0, covered: true },
    { defectClass: 'sink', count: 1, required: 2, missing: 1, covered: false }
];

const candidate = (id, defectType, overrides = {}) => ({
    candidateId: id,
    contentSha256: `hash-${id}`,
    proposedDefectType: defectType,
    reviewPriority: 2,
    reviewBucket: 'agreement_low_confidence',
    modifiedAt: '2026-07-24T00:00:00.000Z',
    alreadyRegistered: false,
    likelyNonManufacturing: false,
    ...overrides
});

test('missing required classes rank before already-covered classes', () => {
    const queue = buildVisionReviewQueue({
        candidates: [
            candidate('flash', '플래시', {
                reviewPriority: 1,
                reviewBucket: 'agreement_high_confidence'
            }),
            candidate('whitening', '백화', {
                reviewPriority: 2,
                reviewBucket: 'agreement_low_confidence'
            })
        ],
        defectClassCoverage: coverage
    });

    assert.equal(queue[0].candidate.candidateId, 'whitening');
    assert.equal(queue[0].needsCoverage, true);
    assert.equal(queue[0].coverageMissing, 2);
    assert.equal(queue[1].needsCoverage, false);
});

test('trusted agreement ranks before conflicts and unclassifiable candidates', () => {
    const queue = buildVisionReviewQueue({
        candidates: [
            candidate('unclassifiable', '백화', {
                reviewPriority: 1,
                reviewBucket: 'unclassifiable'
            }),
            candidate('conflict', '백화', {
                reviewPriority: 1,
                reviewBucket: 'class_conflict'
            }),
            candidate('agreement', '백화', {
                reviewPriority: 2,
                reviewBucket: 'agreement_low_confidence'
            })
        ],
        defectClassCoverage: coverage
    });

    assert.deepEqual(
        queue.map(item => item.candidate.candidateId),
        ['agreement', 'conflict', 'unclassifiable']
    );
});

test('an existing reviewable record ranks before a duplicate registration step', () => {
    const registered = candidate('registered', '싱크', {
        contentSha256: 'same-registered-hash'
    });
    const unregistered = candidate('unregistered', '싱크');
    const queue = buildVisionReviewQueue({
        candidates: [unregistered, registered],
        datasetItems: [{
            image_id: 'image-existing',
            review_status: 'candidate',
            defect_type: '싱크',
            metadata: { content_sha256: 'SAME-REGISTERED-HASH' }
        }],
        defectClassCoverage: coverage
    });

    assert.equal(queue[0].candidate.candidateId, 'registered');
    assert.equal(queue[0].isRegistered, true);
    assert.equal(queue[0].existingReviewStatus, 'candidate');
});

test('coverage-only filter excludes complete, covered, and non-required candidates', () => {
    const queue = buildVisionReviewQueue({
        candidates: [
            candidate('approved-whitening', '백화', {
                contentSha256: 'approved-hash'
            }),
            candidate('pending-whitening', '백화'),
            candidate('covered-flash', '플래시'),
            candidate('other', '기포')
        ],
        datasetItems: [{
            image_id: 'image-approved',
            review_status: 'approved',
            defect_type: 'Whitening',
            metadata: { content_sha256: 'approved-hash' }
        }],
        defectClassCoverage: coverage,
        onlyNeedsCoverage: true
    });

    assert.deepEqual(
        queue.map(item => item.candidate.candidateId),
        ['pending-whitening']
    );
});

test('active candidates rank before deferred and excluded review decisions', () => {
    const queue = buildVisionReviewQueue({
        candidates: [
            candidate('excluded', '백화', {
                reviewDecision: {
                    decision: 'excluded',
                    reason: '정상 형상/결함 미확인'
                }
            }),
            candidate('deferred', '백화', {
                reviewDecision: {
                    decision: 'deferred',
                    reason: '전문가 검토 필요'
                }
            }),
            candidate('active', '백화')
        ],
        defectClassCoverage: coverage
    });

    assert.deepEqual(
        queue.map(item => item.candidate.candidateId),
        ['active', 'deferred', 'excluded']
    );
});
