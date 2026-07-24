const assert = require('node:assert/strict');
const test = require('node:test');

const { buildMigrationGateStatus } = require('../migrationGateStatus');

test('migration gate status combines live data, HITL queue, and benchmark blockers', () => {
    const status = buildMigrationGateStatus({
        generatedAt: '2026-07-24T02:00:00.000Z',
        agentHealth: { online: true, url: 'http://127.0.0.1:8000' },
        qaHealth: { online: true, url: 'http://127.0.0.1:8103' },
        dataset: {
            total: 16,
            items: [
                { review_status: 'approved' },
                { review_status: 'approved' },
                { review_status: 'approved' },
                { review_status: 'candidate' }
            ]
        },
        approvedManifest: {
            minimumSamples: 20,
            qualityIssues: [{ type: 'duplicate_image_conflicting_labels' }],
            cases: [
                { status: 'active' },
                { status: 'needs_review' },
                { status: 'needs_review' },
                { status: 'duplicate' }
            ]
        },
        reviewManifest: {
            policy: { approval: 'human_required' },
            auditSummary: {
                total: 23,
                agreements: 6,
                conflicts: 17,
                reviewBucketCounts: {
                    agreement_high_confidence: 6,
                    class_conflict: 7,
                    unclassifiable: 10
                }
            },
            candidates: [
                { reviewBucket: 'agreement_high_confidence', defectClass: 'whitening' },
                { reviewBucket: 'agreement_high_confidence', defectClass: 'flash' }
            ]
        },
        benchmarkReport: {
            summary: {
                total: 1,
                minimumSamples: 20,
                failedGateChecks: ['sampleCount', 'classCoverage', 'classAccuracy'],
                readyToDisableLegacyFallback: false,
                perClass: [
                    { defectClass: 'whitening', total: 0, requiredSamples: 2, covered: false },
                    { defectClass: 'ejection', total: 1, requiredSamples: 2, covered: false }
                ]
            }
        }
    });

    assert.equal(status.dataset.total, 16);
    assert.equal(status.dataset.reviewStatuses.approved, 3);
    assert.equal(status.approved.cleanRunnable, 1);
    assert.equal(status.approved.duplicatesExcluded, 1);
    assert.equal(status.approved.conflictGroups, 1);
    assert.equal(status.hitl.highConfidenceAgreements, 6);
    assert.equal(status.hitl.unresolvedHighConfidence, 6);
    assert.equal(status.hitl.resolvedHighConfidence, 0);
    assert.equal(status.hitl.autoApprovalAllowed, false);
    assert.equal(status.gate.additionalCleanApprovalsRequired, 19);
    assert.deepEqual(status.gate.failedChecks, ['sampleCount', 'classCoverage', 'classAccuracy']);
    assert.equal(status.gate.canDisableLegacyFallback, false);
    assert.match(status.recommendedAction, /사람이 검토/);
    assert.equal(status.writesPerformed, false);
});

test('terminal Common Agent reviews resolve matching HITL candidates by content hash', () => {
    const status = buildMigrationGateStatus({
        agentHealth: { online: true },
        qaHealth: { online: true },
        dataset: {
            items: [
                {
                    review_status: 'approved',
                    metadata: { content_sha256: 'a'.repeat(64) }
                },
                {
                    review_status: 'rejected',
                    metadata: { content_sha256: 'b'.repeat(64) }
                },
                {
                    review_status: 'candidate',
                    metadata: { content_sha256: 'c'.repeat(64) }
                }
            ]
        },
        approvedManifest: {
            minimumSamples: 20,
            cases: []
        },
        reviewManifest: {
            policy: { approval: 'human_required' },
            auditSummary: {
                reviewBucketCounts: { agreement_high_confidence: 3 }
            },
            candidates: [
                {
                    reviewBucket: 'agreement_high_confidence',
                    defectClass: 'whitening',
                    contentSha256: 'a'.repeat(64)
                },
                {
                    reviewBucket: 'agreement_high_confidence',
                    defectClass: 'flash',
                    contentSha256: 'b'.repeat(64)
                },
                {
                    reviewBucket: 'agreement_high_confidence',
                    defectClass: 'ejection',
                    contentSha256: 'c'.repeat(64)
                }
            ]
        },
        benchmarkReport: {
            summary: {
                failedGateChecks: ['sampleCount'],
                readyToDisableLegacyFallback: false
            }
        }
    });

    assert.equal(status.hitl.highConfidenceAgreements, 3);
    assert.equal(status.hitl.resolvedHighConfidence, 2);
    assert.equal(status.hitl.unresolvedHighConfidence, 1);
    assert.equal(
        status.blockers.find(item => item.code === 'human_review_required')?.count,
        1
    );
    assert.match(status.recommendedAction, /1건/);
});

test('dataset query failure blocks fallback retirement even when benchmark passes', () => {
    const status = buildMigrationGateStatus({
        agentHealth: { online: true },
        qaHealth: { online: true },
        dataset: {
            total: 0,
            items: [],
            error: 'dataset timeout'
        },
        approvedManifest: {
            minimumSamples: 20,
            cases: Array.from({ length: 20 }, () => ({ status: 'active' }))
        },
        benchmarkReport: {
            summary: {
                total: 20,
                failedGateChecks: [],
                readyToDisableLegacyFallback: true
            }
        }
    });

    assert.equal(status.gate.canDisableLegacyFallback, false);
    assert.equal(
        status.blockers.find(item => item.code === 'dataset_query_failed')?.detail,
        'dataset timeout'
    );
});

test('unresolved high-confidence HITL blocks fallback retirement even when benchmark passes', () => {
    const unresolvedHash = 'd'.repeat(64);
    const status = buildMigrationGateStatus({
        agentHealth: { online: true },
        qaHealth: { online: true },
        dataset: {
            total: 20,
            items: Array.from({ length: 20 }, () => ({
                review_status: 'approved'
            }))
        },
        approvedManifest: {
            minimumSamples: 20,
            qualityIssues: [],
            cases: Array.from({ length: 20 }, () => ({ status: 'active' }))
        },
        reviewManifest: {
            policy: { approval: 'human_required' },
            candidates: [{
                reviewBucket: 'agreement_high_confidence',
                defectClass: 'burn',
                contentSha256: unresolvedHash
            }]
        },
        benchmarkReport: {
            summary: {
                total: 20,
                failedGateChecks: [],
                readyToDisableLegacyFallback: true
            }
        }
    });

    assert.equal(status.hitl.unresolvedHighConfidence, 1);
    assert.equal(status.gate.canDisableLegacyFallback, false);
    assert.equal(
        status.blockers.find(item => item.code === 'human_review_required')?.count,
        1
    );
});
