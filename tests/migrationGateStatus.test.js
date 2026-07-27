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
            qualityIssues: [{
                type: 'duplicate_image_conflicting_labels',
                contentHash: 'f'.repeat(64),
                caseIds: ['approved-image-a', 'approved-image-b'],
                labels: ['표면 결함', '플래시']
            }],
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
    assert.deepEqual(status.approved.conflicts, [{
        contentHash: 'f'.repeat(64),
        caseIds: ['approved-image-a', 'approved-image-b'],
        labels: ['표면 결함', '플래시']
    }]);
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

test('approved label and original Vision conflicts block fallback retirement', () => {
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
            qualityIssues: [{
                type: 'approved_label_observation_conflict',
                caseId: 'approved-image-conflict',
                approvedLabel: '\uC218\uCD95',
                observationLabel: '\uBC31\uD654',
                approvedClass: 'other:\uC218\uCD95',
                observationClass: 'whitening'
            }],
            cases: [
                ...Array.from({ length: 19 }, () => ({ status: 'active' })),
                { status: 'needs_review' }
            ]
        },
        benchmarkReport: {
            summary: {
                total: 20,
                failedGateChecks: [],
                readyToDisableLegacyFallback: true
            }
        }
    });

    assert.equal(status.approved.conflictGroups, 1);
    assert.deepEqual(status.approved.conflicts, [{
        contentHash: '',
        caseIds: ['approved-image-conflict'],
        labels: ['\uC218\uCD95', '\uBC31\uD654']
    }]);
    assert.equal(status.gate.canDisableLegacyFallback, false);
    assert.equal(
        status.blockers.find(item => item.code === 'approved_label_conflicts')?.count,
        1
    );
});

test('capture protocol failure recommends collecting the missing views', () => {
    const status = buildMigrationGateStatus({
        agentHealth: { online: true },
        qaHealth: { online: true },
        dataset: { items: [] },
        approvedManifest: {
            minimumSamples: 20,
            qualityIssues: [],
            cases: []
        },
        benchmarkReport: {
            summary: {
                captureProtocolReadyRate: 25,
                failedGateChecks: ['captureProtocol'],
                readyToDisableLegacyFallback: false
            }
        }
    });

    assert.equal(status.benchmark.captureProtocolReadyRate, 25);
    assert.equal(
        status.blockers.some(item => item.code === 'benchmark_captureProtocol'),
        true
    );
    assert.match(status.recommendedAction, /필수 촬영 시점/);
});

test('passing Vision reference operational gate is required before fallback retirement', () => {
    const status = buildMigrationGateStatus({
        agentHealth: { online: true },
        qaHealth: { online: true },
        dataset: {
            total: 20,
            items: Array.from({ length: 20 }, () => ({ review_status: 'approved' }))
        },
        approvedManifest: {
            minimumSamples: 20,
            qualityIssues: [],
            cases: Array.from({ length: 20 }, () => ({ status: 'active' }))
        },
        benchmarkReport: {
            summary: {
                total: 20,
                failedGateChecks: [],
                readyToDisableLegacyFallback: true
            }
        },
        visionReferenceReport: {
            status: 'passed',
            readyForGraphRetrieval: true,
            referenceStore: {
                referenceCount: 42,
                modelVersion: 'dinov2:facebook/dinov2-base',
                productionReady: true
            },
            benchmark: {
                evaluatedCount: 42,
                top1Accuracy: 0.91,
                top3Accuracy: 0.97,
                failedGateChecks: []
            },
            blockers: []
        }
    });

    assert.equal(status.visionReference.readyForGraphRetrieval, true);
    assert.equal(status.visionReference.referenceCount, 42);
    assert.equal(status.gate.canDisableLegacyFallback, true);
    assert.deepEqual(status.blockers, []);
});

test('blocked Vision reference operational gate prevents fallback retirement', () => {
    const status = buildMigrationGateStatus({
        agentHealth: { online: true },
        qaHealth: { online: true },
        dataset: {
            total: 20,
            items: Array.from({ length: 20 }, () => ({ review_status: 'approved' }))
        },
        approvedManifest: {
            minimumSamples: 20,
            qualityIssues: [],
            cases: Array.from({ length: 20 }, () => ({ status: 'active' }))
        },
        benchmarkReport: {
            summary: {
                total: 20,
                failedGateChecks: [],
                readyToDisableLegacyFallback: true
            }
        },
        visionReferenceReport: {
            status: 'blocked',
            readyForGraphRetrieval: false,
            referenceStore: {
                referenceCount: 0,
                modelVersion: null,
                productionReady: null
            },
            benchmark: {
                evaluatedCount: 0,
                failedGateChecks: []
            },
            blockers: [{
                code: 'reference_store_invalid',
                detail: 'GET http://agent.test/v1/vision/classifier/references/current: fetch failed'
            }]
        }
    });

    assert.equal(status.visionReference.readyForGraphRetrieval, false);
    assert.equal(status.gate.canDisableLegacyFallback, false);
    assert.deepEqual(status.blockers, [{
        code: 'vision_reference_gate_failed',
        details: [{
            code: 'reference_store_invalid',
            detail: 'GET http://agent.test/v1/vision/classifier/references/current: fetch failed'
        }]
    }]);
    assert.match(status.recommendedAction, /Reference Store/);
});

test('Vision reference backfill plan explains why reference learning is blocked', () => {
    const status = buildMigrationGateStatus({
        agentHealth: { online: true },
        qaHealth: { online: true },
        dataset: {
            total: 19,
            items: Array.from({ length: 19 }, () => ({ review_status: 'approved' }))
        },
        approvedManifest: {
            minimumSamples: 20,
            qualityIssues: [],
            cases: Array.from({ length: 19 }, () => ({ status: 'active' }))
        },
        benchmarkReport: {
            summary: {
                total: 19,
                failedGateChecks: [],
                readyToDisableLegacyFallback: false
            }
        },
        visionReferenceReport: {
            status: 'blocked',
            readyForGraphRetrieval: false,
            referenceStore: {
                referenceCount: 0
            },
            benchmark: {
                evaluatedCount: 0,
                failedGateChecks: []
            },
            blockers: [{ code: 'reference_store_missing' }]
        },
        visionReferenceBackfillPlan: {
            status: 'action_required',
            summary: {
                total: 19,
                eligibleReferenceCandidates: 0,
                needsHitlBackfill: 19,
                blocked: 0,
                reasonCounts: {
                    legacy_vision_contract: 19,
                    missing_capture_session: 19,
                    missing_capture_view_tag: 19,
                    capture_protocol_not_ready: 19
                }
            },
            recommendedAction: 'Review the HITL backfill targets before reference refresh.'
        }
    });

    assert.equal(status.visionReferenceBackfill.needsHitlBackfill, 19);
    assert.equal(status.visionReferenceBackfill.reasonCounts.legacy_vision_contract, 19);
    assert.match(status.recommendedAction, /HITL backfill/i);
    assert.deepEqual(status.blockers, [
        {
            code: 'vision_reference_gate_failed',
            details: [{ code: 'reference_store_missing' }]
        },
        {
            code: 'vision_reference_backfill_required',
            count: 19
        }
    ]);
});

test('post-apply backfill verification blocks reference refresh when applied rows are not learning-ready', () => {
    const status = buildMigrationGateStatus({
        agentHealth: { online: true },
        qaHealth: { online: true },
        dataset: {
            total: 20,
            items: Array.from({ length: 20 }, () => ({ review_status: 'approved' }))
        },
        approvedManifest: {
            minimumSamples: 20,
            qualityIssues: [],
            cases: Array.from({ length: 20 }, () => ({ status: 'active' }))
        },
        benchmarkReport: {
            summary: {
                total: 20,
                failedGateChecks: [],
                readyToDisableLegacyFallback: true
            }
        },
        visionReferenceReport: {
            status: 'passed',
            readyForGraphRetrieval: true,
            referenceStore: { referenceCount: 20 },
            benchmark: { evaluatedCount: 20, failedGateChecks: [] },
            blockers: []
        },
        visionReferenceBackfillPostApplyVerification: {
            status: 'blocked',
            readyForReferenceRefresh: false,
            summary: {
                appliedTargets: 2,
                verifiedLearningReady: 1,
                blockedTargets: 1,
                missingFromLearningReadyExport: 1
            },
            blockers: [{
                code: 'applied_target_missing_from_learning_ready_export',
                imageId: 'image-missing'
            }],
            recommendedAction: 'Do not refresh the Vision reference store yet.'
        }
    });

    assert.equal(status.visionReferenceBackfillPostApply.readyForReferenceRefresh, false);
    assert.equal(status.gate.canDisableLegacyFallback, false);
    assert.deepEqual(status.blockers, [{
        code: 'vision_reference_backfill_post_apply_verification_failed',
        details: [{
            code: 'applied_target_missing_from_learning_ready_export',
            imageId: 'image-missing'
        }]
    }]);
    assert.match(status.recommendedAction, /Do not refresh/);
});

test('ready post-apply backfill verification keeps fallback retirement eligible', () => {
    const status = buildMigrationGateStatus({
        agentHealth: { online: true },
        qaHealth: { online: true },
        dataset: {
            total: 20,
            items: Array.from({ length: 20 }, () => ({ review_status: 'approved' }))
        },
        approvedManifest: {
            minimumSamples: 20,
            qualityIssues: [],
            cases: Array.from({ length: 20 }, () => ({ status: 'active' }))
        },
        benchmarkReport: {
            summary: {
                total: 20,
                failedGateChecks: [],
                readyToDisableLegacyFallback: true
            }
        },
        visionReferenceReport: {
            status: 'passed',
            readyForGraphRetrieval: true,
            referenceStore: { referenceCount: 20 },
            benchmark: { evaluatedCount: 20, failedGateChecks: [] },
            blockers: []
        },
        visionReferenceBackfillPostApplyVerification: {
            status: 'ready',
            readyForReferenceRefresh: true,
            summary: {
                appliedTargets: 2,
                verifiedLearningReady: 2,
                blockedTargets: 0,
                missingFromLearningReadyExport: 0
            },
            blockers: []
        }
    });

    assert.equal(status.visionReferenceBackfillPostApply.readyForReferenceRefresh, true);
    assert.equal(status.gate.canDisableLegacyFallback, true);
    assert.deepEqual(status.blockers, []);
});

test('Vision reference API missing action is surfaced by migration gate', () => {
    const status = buildMigrationGateStatus({
        agentHealth: { online: true },
        qaHealth: { online: true },
        dataset: {
            total: 20,
            items: Array.from({ length: 20 }, () => ({ review_status: 'approved' }))
        },
        approvedManifest: {
            minimumSamples: 20,
            qualityIssues: [],
            cases: Array.from({ length: 20 }, () => ({ status: 'active' }))
        },
        benchmarkReport: {
            summary: {
                total: 20,
                failedGateChecks: [],
                readyToDisableLegacyFallback: true
            }
        },
        visionReferenceReport: {
            status: 'blocked',
            readyForGraphRetrieval: false,
            recommendedAction:
                'Upgrade or restart Common Agent with the Vision reference API endpoints, then rerun the operational gate.',
            referenceStore: {
                referenceCount: 0,
                modelVersion: null,
                productionReady: null
            },
            benchmark: {
                evaluatedCount: 0,
                failedGateChecks: []
            },
            blockers: [
                {
                    code: 'reference_api_missing',
                    detail: 'GET http://agent.test/v1/vision/classifier/references/current: 404 {"detail":"Not Found"}'
                },
                {
                    code: 'reference_refresh_api_missing',
                    detail: 'POST http://agent.test/v1/vision/classifier/references/refresh: 404 {"detail":"Not Found"}'
                }
            ]
        }
    });

    assert.equal(status.gate.canDisableLegacyFallback, false);
    assert.match(status.visionReference.recommendedAction, /Upgrade or restart Common Agent/);
    assert.match(status.recommendedAction, /Common Agent.*Vision reference API/);
    assert.deepEqual(status.blockers, [{
        code: 'vision_reference_gate_failed',
        details: [
            {
                code: 'reference_api_missing',
                detail: 'GET http://agent.test/v1/vision/classifier/references/current: 404 {"detail":"Not Found"}'
            },
            {
                code: 'reference_refresh_api_missing',
                detail: 'POST http://agent.test/v1/vision/classifier/references/refresh: 404 {"detail":"Not Found"}'
            }
        ]
    }]);
});
