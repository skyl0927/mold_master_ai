const countBy = (items, key) => {
    const counts = {};
    for (const item of items || []) {
        const value = String(item?.[key] || 'unknown');
        counts[value] = (counts[value] || 0) + 1;
    }
    return counts;
};

const countByDefectClass = candidates => {
    const counts = {};
    for (const candidate of candidates || []) {
        const defectClass = String(candidate?.defectClass || 'unknown');
        counts[defectClass] = (counts[defectClass] || 0) + 1;
    }
    return counts;
};

const asArray = value => Array.isArray(value) ? value : [];

const normalizedHash = value => {
    const hash = String(value || '').trim().toLowerCase();
    return /^[a-f0-9]{64}$/.test(hash) ? hash : '';
};

const terminalReviewHashes = datasetItems => new Set(
    asArray(datasetItems)
        .filter(item => ['approved', 'rejected'].includes(String(item?.review_status || '')))
        .map(item => normalizedHash(item?.metadata?.content_sha256))
        .filter(Boolean)
);

const healthState = value => ({
    online: value?.online === true,
    url: String(value?.url || ''),
    detail: value?.detail || null,
    error: value?.error ? String(value.error) : undefined
});

const missingClassCoverage = summary =>
    asArray(summary?.perClass)
        .filter(item => !item.covered)
        .map(item => ({
            defectClass: item.defectClass,
            current: Number(item.total) || 0,
            required: Number(item.requiredSamples) || 0,
            missing: Math.max(0, (Number(item.requiredSamples) || 0) - (Number(item.total) || 0))
        }));

const buildBlockers = ({
    agent,
    qa,
    datasetError,
    conflictGroups,
    benchmarkSummary,
    hitl,
    visionReference,
    visionReferenceBackfill
}) => {
    const blockers = [];
    if (!agent.online) blockers.push({ code: 'common_agent_offline', detail: agent.error || agent.url });
    if (!qa.online) blockers.push({ code: 'qa_agent_offline', detail: qa.error || qa.url });
    if (datasetError) {
        blockers.push({ code: 'dataset_query_failed', detail: String(datasetError) });
    }
    if (conflictGroups > 0) {
        blockers.push({ code: 'approved_label_conflicts', count: conflictGroups });
    }
    for (const check of asArray(benchmarkSummary?.failedGateChecks)) {
        blockers.push({ code: `benchmark_${check}` });
    }
    if (hitl.unresolvedHighConfidence > 0) {
        blockers.push({
            code: 'human_review_required',
            count: hitl.unresolvedHighConfidence
        });
    }
    if (visionReference.required && !visionReference.readyForGraphRetrieval) {
        blockers.push({
            code: 'vision_reference_gate_failed',
            details: visionReference.blockers
        });
    }
    if (visionReferenceBackfill.needsHitlBackfill > 0) {
        blockers.push({
            code: 'vision_reference_backfill_required',
            count: visionReferenceBackfill.needsHitlBackfill
        });
    }
    return blockers;
};

const summarizeVisionReferenceGate = report => {
    if (!report) {
        return {
            required: false,
            readyForGraphRetrieval: true,
            referenceCount: 0,
            modelVersion: '',
            productionReady: null,
            evaluatedCount: 0,
            top1Accuracy: 0,
            top3Accuracy: 0,
            failedGateChecks: [],
            blockers: [],
            recommendedAction: ''
        };
    }
    const referenceStore = report.referenceStore || {};
    const benchmark = report.benchmark || {};
    return {
        required: true,
        status: String(report.status || 'unknown'),
        readyForGraphRetrieval: report.readyForGraphRetrieval === true,
        referenceCount: Number(referenceStore.referenceCount) || 0,
        modelVersion: String(referenceStore.modelVersion || ''),
        provider: referenceStore.provider || null,
        modelName: referenceStore.modelName || null,
        dimensions: referenceStore.dimensions || null,
        device: referenceStore.device || null,
        runtime: referenceStore.runtime || null,
        productionReady: referenceStore.productionReady ?? null,
        evaluatedCount: Number(benchmark.evaluatedCount) || 0,
        top1Accuracy: Number(benchmark.top1Accuracy) || 0,
        top3Accuracy: Number(benchmark.top3Accuracy) || 0,
        failedGateChecks: asArray(benchmark.failedGateChecks),
        blockers: asArray(report.blockers),
        recommendedAction: String(report.recommendedAction || ''),
        artifactGeneratedAt: report.generatedAt || null
    };
};

const summarizeVisionReferenceBackfill = report => {
    const summary = report?.summary || {};
    return {
        required: Boolean(report),
        status: String(report?.status || 'not_run'),
        total: Number(summary.total) || 0,
        eligibleReferenceCandidates: Number(summary.eligibleReferenceCandidates) || 0,
        needsHitlBackfill: Number(summary.needsHitlBackfill) || 0,
        blocked: Number(summary.blocked) || 0,
        reasonCounts: summary.reasonCounts || {},
        recommendedAction: String(report?.recommendedAction || ''),
        artifactGeneratedAt: report?.generatedAt || null
    };
};

const buildMigrationGateStatus = ({
    generatedAt = new Date().toISOString(),
    agentHealth = {},
    qaHealth = {},
    dataset = {},
    approvedManifest = {},
    reviewManifest = {},
    benchmarkReport = {},
    visionReferenceReport = null,
    visionReferenceBackfillPlan = null
}) => {
    const agent = healthState(agentHealth);
    const qa = healthState(qaHealth);
    const datasetItems = asArray(dataset.items);
    const approvedCases = asArray(approvedManifest.cases);
    const benchmarkSummary = benchmarkReport.summary || {};
    const reviewCandidates = asArray(reviewManifest.candidates);
    const auditSummary = reviewManifest.auditSummary || {};
    const highConfidenceCandidates = reviewCandidates.filter(
        candidate => candidate.reviewBucket === 'agreement_high_confidence'
    );
    const highConfidenceAgreements = Number(
        auditSummary.reviewBucketCounts?.agreement_high_confidence
    ) || highConfidenceCandidates.length;
    const reviewedHashes = terminalReviewHashes(datasetItems);
    const resolvedKnownHighConfidence = highConfidenceCandidates.filter(candidate => {
        const hash = normalizedHash(candidate.contentSha256);
        return hash && reviewedHashes.has(hash);
    }).length;
    const unresolvedHighConfidence = Math.max(
        0,
        highConfidenceAgreements - resolvedKnownHighConfidence
    );
    const cleanRunnable = approvedCases.filter(item => item.status === 'active').length;
    const conflictIssues = asArray(approvedManifest.qualityIssues).filter(
        issue => [
            'duplicate_image_conflicting_labels',
            'approved_label_observation_conflict'
        ].includes(issue.type)
    );
    const conflictGroups = conflictIssues.length;
    const conflicts = conflictIssues.map(issue => issue.type === 'approved_label_observation_conflict'
        ? {
            contentHash: '',
            caseIds: [String(issue.caseId || '')].filter(Boolean),
            labels: [issue.approvedLabel, issue.observationLabel].map(String)
        }
        : {
            contentHash: normalizedHash(issue.contentHash),
            caseIds: asArray(issue.caseIds).map(String),
            labels: asArray(issue.labels).map(String)
        }
    );
    const minimumSamples = Number(
        benchmarkSummary.minimumSamples || approvedManifest.minimumSamples || 20
    );
    const hitl = {
        totalCandidates: Number(auditSummary.total) || reviewCandidates.length,
        highConfidenceAgreements,
        resolvedHighConfidence: resolvedKnownHighConfidence,
        unresolvedHighConfidence,
        classConflicts: Number(auditSummary.reviewBucketCounts?.class_conflict) || 0,
        unclassifiable: Number(auditSummary.reviewBucketCounts?.unclassifiable) || 0,
        shortlistByClass: countByDefectClass(highConfidenceCandidates),
        approvalPolicy: reviewManifest.policy?.approval || 'human_required',
        autoApprovalAllowed: false
    };
    const failedChecks = asArray(benchmarkSummary.failedGateChecks);
    const visionReference = summarizeVisionReferenceGate(visionReferenceReport);
    const visionReferenceBackfill = summarizeVisionReferenceBackfill(visionReferenceBackfillPlan);
    const canDisableLegacyFallback = benchmarkSummary.readyToDisableLegacyFallback === true
        && agent.online
        && qa.online
        && !dataset.error
        && conflictGroups === 0
        && hitl.unresolvedHighConfidence === 0
        && visionReference.readyForGraphRetrieval === true;
    const blockers = buildBlockers({
        agent,
        qa,
        datasetError: dataset.error,
        conflictGroups,
        benchmarkSummary,
        hitl,
        visionReference,
        visionReferenceBackfill
    });

    return {
        schemaVersion: 1,
        generatedAt,
        services: {
            commonAgent: agent,
            qaAgent: qa
        },
        dataset: {
            total: Number(dataset.total) || datasetItems.length,
            reviewStatuses: countBy(datasetItems, 'review_status'),
            error: dataset.error ? String(dataset.error) : undefined
        },
        approved: {
            registered: approvedCases.length,
            cleanRunnable,
            needsReview: approvedCases.filter(item => item.status === 'needs_review').length,
            duplicatesExcluded: approvedCases.filter(item => item.status === 'duplicate').length,
            conflictGroups,
            conflicts
        },
        hitl,
        benchmark: {
            sampleCount: Number(benchmarkSummary.total) || 0,
            passRate: Number(benchmarkSummary.passRate) || 0,
            httpSuccessRate: Number(benchmarkSummary.httpSuccessRate) || 0,
            classifiableRate: Number(benchmarkSummary.classifiableRate) || 0,
            defectAccuracy: Number(benchmarkSummary.defectAccuracy) || 0,
            graphGroundedRate: Number(benchmarkSummary.graphGroundedRate) || 0,
            captureProtocolReadyRate:
                Number(benchmarkSummary.captureProtocolReadyRate) || 0
        },
        visionReference,
        visionReferenceBackfill,
        gate: {
            minimumSamples,
            additionalCleanApprovalsRequired: Math.max(0, minimumSamples - cleanRunnable),
            failedChecks,
            missingClassCoverage: missingClassCoverage(benchmarkSummary),
            canDisableLegacyFallback
        },
        blockers,
        recommendedAction: canDisableLegacyFallback
            ? '안전 게이트가 충족되었습니다. 직접 LLM fallback 제거 변경을 별도 릴리스로 검증하세요.'
            : visionReference.required && !visionReference.readyForGraphRetrieval
                ? visionReferenceBackfill.needsHitlBackfill > 0
                    ? visionReferenceBackfill.recommendedAction
                    : visionReference.recommendedAction
                    || 'Common Agent Vision Reference Store를 갱신하고 reference benchmark gate를 먼저 통과시키세요.'
                : hitl.unresolvedHighConfidence > 0
                ? `고신뢰 후보 ${hitl.unresolvedHighConfidence}건을 사람이 검토하고 명확한 표본만 승인하세요.`
                : failedChecks.includes('captureProtocol')
                    ? '결함별 필수 촬영 시점과 실제 성형품 여부를 보완한 뒤 Vision 벤치마크를 다시 실행하세요.'
                    : '명확한 제조 결함 표본을 추가 수집한 뒤 승인 Vision 벤치마크를 다시 실행하세요.',
        writesPerformed: false
    };
};

module.exports = {
    buildMigrationGateStatus
};
