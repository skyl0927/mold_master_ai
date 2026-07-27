import assert from 'node:assert/strict';
import test from 'node:test';

import {
    auditVisionEvaluationSplit,
    auditVisionOperationalEvidenceAlignment,
    attachVisionOperationalOperatorDecision,
    evaluateVisionOperationalRelease,
    parseVisionOperationalReleaseReport,
    summarizeVisionOperationalReleaseHistory,
    upsertVisionOperationalReleaseHistory,
    VisionOperationalEvidenceBundle,
    VisionShadowSample,
    VisionVersionSnapshot
} from '../services/visionOperationalReleaseGate';

const baselineVersion: VisionVersionSnapshot = {
    modelVersion: 'vision-model-2026.06',
    promptVersion: 'vision-prompt-v5',
    graphVersion: 'approved-graph-42'
};

const candidateVersion: VisionVersionSnapshot = {
    modelVersion: 'vision-model-2026.07',
    promptVersion: 'vision-prompt-v6',
    graphVersion: 'approved-graph-43'
};

const completeEvidenceBundle: VisionOperationalEvidenceBundle = {
    contractVersion: 'vision-operational-evidence-bundle/v1',
    items: [
        {
            kind: 'baseline_benchmark',
            uri: 'file:///artifacts/baseline-vision-report.json',
            sha256: 'a'.repeat(64)
        },
        {
            kind: 'candidate_benchmark',
            uri: 'file:///artifacts/candidate-vision-report.json',
            sha256: 'b'.repeat(64)
        },
        {
            kind: 'release_config',
            uri: 'file:///artifacts/vision-release-config.json',
            sha256: 'c'.repeat(64)
        },
        {
            kind: 'common_agent_dataset_export',
            uri: 'common-agent://datasets/images/export/approved-holdout-20260727'
        },
        {
            kind: 'graph_snapshot',
            uri: 'neo4j://mold-master/approved-graph-43'
        }
    ],
    complete: true,
    missingEvidence: []
};

const makeShadowSamples = (
    count = 30,
    candidateWrong = 1,
    baselineWrong = 3
): VisionShadowSample[] => Array.from({ length: count }, (_, index) => {
    const baselineCorrect = index >= baselineWrong;
    const candidateCorrect = index >= candidateWrong;
    return {
        caseId: `case-${index + 1}`,
        evaluatedAt: `2026-07-${String(index + 1).padStart(2, '0')}T09:00:00.000Z`,
        productFamily: 'NEW-GRILLE',
        moldId: `MOLD-${index + 1}`,
        cameraId: `CAM-${index + 1}`,
        captureSessionId: `SESSION-${index + 1}`,
        contentHash: `HASH-${index + 1}`,
        expectedDefectClass: 'whitening',
        humanVerified: true,
        baseline: {
            accepted: true,
            correct: baselineCorrect,
            top3Correct: true,
            confidence: baselineCorrect ? 0.95 : 0.05,
            latencyMs: 480
        },
        candidate: {
            accepted: true,
            correct: candidateCorrect,
            top3Correct: true,
            confidence: candidateCorrect ? 0.95 : 0.05,
            latencyMs: 520
        }
    };
});

test('evaluation split audit blocks leakage across date, product, mold, camera, session, and content hash', () => {
    const audit = auditVisionEvaluationSplit([
        {
            caseId: 'train-1',
            split: 'train',
            capturedAt: '2026-07-24T01:00:00.000Z',
            productFamily: 'GRILLE',
            moldId: 'M-100',
            cameraId: 'CAM-01',
            captureSessionId: 'SESSION-1',
            contentHash: 'same-image'
        },
        {
            caseId: 'holdout-1',
            split: 'holdout',
            capturedAt: '2026-07-24T10:00:00.000Z',
            productFamily: 'GRILLE',
            moldId: 'M-100',
            cameraId: 'CAM-01',
            captureSessionId: 'SESSION-1',
            contentHash: 'same-image'
        }
    ]);

    assert.equal(audit.passed, false);
    assert.deepEqual(
        new Set(audit.issues.map(issue => issue.dimension)),
        new Set([
            'captureDate',
            'productFamily',
            'moldId',
            'cameraId',
            'captureSessionId',
            'contentHash'
        ])
    );
});

test('release gate holds shadow mode when versions or new-family human verification are incomplete', () => {
    const report = evaluateVisionOperationalRelease({
        baselineVersion,
        candidateVersion: {
            ...candidateVersion,
            promptVersion: ''
        },
        samples: makeShadowSamples(10, 0, 1),
        newProductFamilies: ['NEW-GRILLE'],
        latencyTargetP95Ms: 1500
    });

    assert.equal(report.decision, 'hold_shadow');
    assert.equal(report.releaseAllowed, false);
    assert.equal(report.checks.versionSnapshot, false);
    assert.equal(report.checks.newProductHumanVerification, false);
    assert.equal(report.rollbackTarget, undefined);
});

test('release gate promotes a candidate only after paired shadow metrics pass every safety gate', () => {
    const report = evaluateVisionOperationalRelease({
        baselineVersion,
        candidateVersion,
        samples: makeShadowSamples(),
        newProductFamilies: ['NEW-GRILLE'],
        latencyTargetP95Ms: 1500,
        evidenceBundle: completeEvidenceBundle
    });

    assert.equal(report.decision, 'promote_candidate');
    assert.equal(report.releaseAllowed, true);
    assert.equal(report.candidate.top1Accuracy, 0.9667);
    assert.equal(report.candidate.top3Accuracy, 1);
    assert.equal(report.candidate.selectiveAccuracy, 0.9667);
    assert.equal(report.candidate.expectedCalibrationError, 0.05);
    assert.equal(report.candidate.p95LatencyMs, 520);
    assert.equal(report.candidate.minimumClassReproduction, 0.9667);
    assert.equal(report.cohorts[0].humanVerifiedSamples, 30);
    assert.equal(Object.values(report.checks).every(Boolean), true);
    assert.equal(report.decisionCard.status, 'ready_to_promote');
    assert.equal(report.decisionCard.primaryAction, 'activate_candidate');
    assert.deepEqual(report.decisionCard.targetVersion, candidateVersion);
    assert.equal(report.decisionCard.requiresHumanApproval, true);
    assert.equal(report.decisionCard.autoApplyAllowed, false);
    assert.equal(report.evidenceBundle.complete, true);
    assert.equal(report.decisionCard.evidenceBundle.items.length, 5);
});

test('release gate selects the exact baseline snapshot when candidate safety regresses', () => {
    const report = evaluateVisionOperationalRelease({
        baselineVersion,
        candidateVersion,
        samples: makeShadowSamples(30, 7, 1).map((sample, index) => ({
            ...sample,
            candidate: {
                ...sample.candidate,
                confidence: sample.candidate.correct ? 0.98 : 0.92,
                latencyMs: index === 29 ? 2600 : 1800
            }
        })),
        newProductFamilies: ['NEW-GRILLE'],
        latencyTargetP95Ms: 1500
    });

    assert.equal(report.decision, 'rollback_required');
    assert.equal(report.releaseAllowed, false);
    assert.deepEqual(report.rollbackTarget, baselineVersion);
    assert.equal(report.checks.top1NonRegression, false);
    assert.equal(report.checks.unsafeFalsePositive, false);
    assert.equal(report.checks.calibration, false);
    assert.equal(report.checks.latency, false);
    assert.equal(report.decisionCard.status, 'rollback_required');
    assert.equal(report.decisionCard.primaryAction, 'restore_baseline_snapshot');
    assert.deepEqual(report.decisionCard.targetVersion, baselineVersion);
    assert.equal(report.decisionCard.severity, 'critical');
});

test('release report parser accepts only a complete operational gate artifact', () => {
    const validReport = evaluateVisionOperationalRelease({
        baselineVersion,
        candidateVersion,
        samples: makeShadowSamples(),
        newProductFamilies: ['NEW-GRILLE'],
        latencyTargetP95Ms: 1500
    });

    assert.equal(
        parseVisionOperationalReleaseReport(JSON.stringify(validReport)).decision,
        'promote_candidate'
    );
    assert.throws(
        () => parseVisionOperationalReleaseReport('{"decision":"promote_candidate"}'),
        /invalid vision operational release report/i
    );
});

test('release gate marks evidence incomplete until benchmark and central evidence are attached', () => {
    const report = evaluateVisionOperationalRelease({
        baselineVersion,
        candidateVersion,
        samples: makeShadowSamples(),
        newProductFamilies: ['NEW-GRILLE'],
        latencyTargetP95Ms: 1500
    });

    assert.equal(report.evidenceBundle.complete, false);
    assert.deepEqual(report.decisionCard.evidenceBundle.missingEvidence, [
        'baseline_benchmark',
        'candidate_benchmark',
        'release_config',
        'common_agent_dataset_export',
        'graph_snapshot'
    ]);
});

test('release decision card keeps shadow hold as an explicit data collection action', () => {
    const report = evaluateVisionOperationalRelease({
        baselineVersion,
        candidateVersion: {
            ...candidateVersion,
            graphVersion: ''
        },
        samples: makeShadowSamples(12, 1, 2),
        newProductFamilies: ['NEW-GRILLE'],
        latencyTargetP95Ms: 1500
    });

    assert.equal(report.decision, 'hold_shadow');
    assert.equal(report.decisionCard.status, 'shadow_hold');
    assert.equal(report.decisionCard.primaryAction, 'continue_shadow_and_collect');
    assert.deepEqual(report.decisionCard.targetVersion, {
        ...candidateVersion,
        graphVersion: ''
    });
    assert.equal(report.decisionCard.severity, 'warning');
    assert.deepEqual(report.decisionCard.blockingReasons, report.blockingReasons);
    assert.ok(report.decisionCard.operatorSteps.some(step => step.includes('Shadow')));
});

test('release parser enriches legacy reports with a decision card', () => {
    const report = evaluateVisionOperationalRelease({
        baselineVersion,
        candidateVersion,
        samples: makeShadowSamples(30, 8, 1),
        newProductFamilies: ['NEW-GRILLE'],
        latencyTargetP95Ms: 1500
    });
    const { decisionCard: _decisionCard, ...legacyReport } = report;

    const parsed = parseVisionOperationalReleaseReport(JSON.stringify(legacyReport));

    assert.equal(parsed.decision, 'rollback_required');
    assert.equal(parsed.decisionCard.primaryAction, 'restore_baseline_snapshot');
    assert.deepEqual(parsed.decisionCard.targetVersion, baselineVersion);
});

test('release parser enriches a legacy decision card that has no evidence bundle', () => {
    const report = evaluateVisionOperationalRelease({
        baselineVersion,
        candidateVersion,
        samples: makeShadowSamples(),
        newProductFamilies: ['NEW-GRILLE'],
        latencyTargetP95Ms: 1500,
        evidenceBundle: completeEvidenceBundle
    });
    const { evidenceBundle: _cardEvidence, ...legacyDecisionCard } = report.decisionCard;
    const { evidenceBundle: _reportEvidence, ...legacyReport } = report;

    const parsed = parseVisionOperationalReleaseReport(JSON.stringify({
        ...legacyReport,
        decisionCard: legacyDecisionCard
    }));

    assert.equal(parsed.decisionCard.evidenceBundle.complete, false);
    assert.deepEqual(parsed.decisionCard.evidenceBundle.missingEvidence, [
        'baseline_benchmark',
        'candidate_benchmark',
        'release_config',
        'common_agent_dataset_export',
        'graph_snapshot'
    ]);
});

test('release parser rejects a malformed decision card instead of trusting stale operator actions', () => {
    const validReport = evaluateVisionOperationalRelease({
        baselineVersion,
        candidateVersion,
        samples: makeShadowSamples(),
        newProductFamilies: ['NEW-GRILLE'],
        latencyTargetP95Ms: 1500
    });

    assert.throws(
        () => parseVisionOperationalReleaseReport(JSON.stringify({
            ...validReport,
            decisionCard: {
                ...validReport.decisionCard,
                primaryAction: 'activate_candidate',
                targetVersion: baselineVersion
            }
        })),
        /invalid vision operational release report/i
    );
});

test('operator decision records approval only when it matches the release card action and target snapshot', () => {
    const report = evaluateVisionOperationalRelease({
        baselineVersion,
        candidateVersion,
        samples: makeShadowSamples(),
        newProductFamilies: ['NEW-GRILLE'],
        latencyTargetP95Ms: 1500,
        evidenceBundle: completeEvidenceBundle
    });

    const approved = attachVisionOperationalOperatorDecision(report, {
        action: 'activate_candidate',
        targetVersion: candidateVersion,
        operator: 'quality-lead',
        comment: 'Holdout 지표와 Graph snapshot을 확인함.',
        confirmed: true,
        decidedAt: '2026-07-27T08:00:00.000Z'
    });

    assert.equal(approved.operatorDecision?.status, 'confirmed');
    assert.equal(approved.operatorDecision?.action, 'activate_candidate');
    assert.equal(approved.operatorDecision?.decisionCardStatus, 'ready_to_promote');
    assert.equal(approved.operatorDecision?.reportGeneratedAt, report.generatedAt);
    assert.deepEqual(approved.operatorDecision?.targetVersion, candidateVersion);
    assert.equal(approved.operatorDecision?.autoApplied, false);
    assert.equal(approved.operatorDecision?.evidenceBundle.complete, true);
});

test('evidence alignment requires pinned Common Agent export and candidate Graph snapshot', () => {
    const report = evaluateVisionOperationalRelease({
        baselineVersion,
        candidateVersion,
        samples: makeShadowSamples(),
        newProductFamilies: ['NEW-GRILLE'],
        latencyTargetP95Ms: 1500,
        evidenceBundle: completeEvidenceBundle
    });
    const alignment = auditVisionOperationalEvidenceAlignment(report);

    assert.equal(alignment.passed, true);
    assert.equal(alignment.checks.completeEvidenceBundle, true);
    assert.equal(alignment.checks.commonAgentDatasetExportPinned, true);
    assert.equal(alignment.checks.graphSnapshotMatchesCandidateGraphVersion, true);
    assert.deepEqual(alignment.issues, []);
});

test('operator decision refuses complete but stale Graph evidence', () => {
    const staleEvidenceBundle: VisionOperationalEvidenceBundle = {
        ...completeEvidenceBundle,
        items: completeEvidenceBundle.items.map(item =>
            item.kind === 'graph_snapshot'
                ? { ...item, uri: 'neo4j://mold-master/approved-graph-legacy' }
                : item
        )
    };
    const report = evaluateVisionOperationalRelease({
        baselineVersion,
        candidateVersion,
        samples: makeShadowSamples(),
        newProductFamilies: ['NEW-GRILLE'],
        latencyTargetP95Ms: 1500,
        evidenceBundle: staleEvidenceBundle
    });
    const alignment = auditVisionOperationalEvidenceAlignment(report);

    assert.equal(report.decisionCard.evidenceBundle.complete, true);
    assert.equal(alignment.passed, false);
    assert.equal(alignment.checks.graphSnapshotMatchesCandidateGraphVersion, false);
    assert.ok(alignment.issues.some(issue =>
        issue.check === 'graphSnapshotMatchesCandidateGraphVersion'
    ));
    assert.throws(
        () => attachVisionOperationalOperatorDecision(report, {
            action: 'activate_candidate',
            targetVersion: candidateVersion,
            operator: 'quality-lead',
            comment: 'Graph snapshot 불일치 상태 확인.',
            confirmed: true
        }),
        /evidence alignment failed/i
    );
});

test('operator decision refuses confirmation until release evidence is complete', () => {
    const report = evaluateVisionOperationalRelease({
        baselineVersion,
        candidateVersion,
        samples: makeShadowSamples(),
        newProductFamilies: ['NEW-GRILLE'],
        latencyTargetP95Ms: 1500
    });

    assert.throws(
        () => attachVisionOperationalOperatorDecision(report, {
            action: 'activate_candidate',
            targetVersion: candidateVersion,
            operator: 'quality-lead',
            comment: '근거 미연결 상태 확인.',
            confirmed: true
        }),
        /evidence bundle is incomplete/i
    );
});

test('operator decision refuses mismatched action, target, missing confirmation, and empty comment', () => {
    const report = evaluateVisionOperationalRelease({
        baselineVersion,
        candidateVersion,
        samples: makeShadowSamples(30, 7, 1).map((sample, index) => ({
            ...sample,
            candidate: {
                ...sample.candidate,
                confidence: sample.candidate.correct ? 0.98 : 0.92,
                latencyMs: index === 29 ? 2600 : 1800
            }
        })),
        newProductFamilies: ['NEW-GRILLE'],
        latencyTargetP95Ms: 1500,
        evidenceBundle: completeEvidenceBundle
    });
    const validInput = {
        action: 'restore_baseline_snapshot' as const,
        targetVersion: baselineVersion,
        operator: 'quality-lead',
        comment: '안전 기준 미달로 기준 버전 복원을 승인함.',
        confirmed: true,
        decidedAt: '2026-07-27T08:05:00.000Z'
    };

    assert.throws(
        () => attachVisionOperationalOperatorDecision(report, {
            ...validInput,
            action: 'activate_candidate'
        }),
        /operator decision does not match/i
    );
    assert.throws(
        () => attachVisionOperationalOperatorDecision(report, {
            ...validInput,
            targetVersion: candidateVersion
        }),
        /target version does not match/i
    );
    assert.throws(
        () => attachVisionOperationalOperatorDecision(report, {
            ...validInput,
            confirmed: false
        }),
        /confirmation is required/i
    );
    assert.throws(
        () => attachVisionOperationalOperatorDecision(report, {
            ...validInput,
            comment: ' '
        }),
        /comment is required/i
    );
});

test('release parser keeps a valid operator decision and rejects a stale one after report mutation', () => {
    const report = evaluateVisionOperationalRelease({
        baselineVersion,
        candidateVersion,
        samples: makeShadowSamples(),
        newProductFamilies: ['NEW-GRILLE'],
        latencyTargetP95Ms: 1500,
        generatedAt: '2026-07-27T07:00:00.000Z',
        evidenceBundle: completeEvidenceBundle
    });
    const approved = attachVisionOperationalOperatorDecision(report, {
        action: 'activate_candidate',
        targetVersion: candidateVersion,
        operator: 'quality-lead',
        comment: '승격 조건과 차단 기준 없음 확인.',
        confirmed: true,
        decidedAt: '2026-07-27T08:00:00.000Z'
    });

    assert.equal(
        parseVisionOperationalReleaseReport(JSON.stringify(approved)).operatorDecision?.status,
        'confirmed'
    );
    assert.throws(
        () => parseVisionOperationalReleaseReport(JSON.stringify({
            ...approved,
            operatorDecision: {
                ...approved.operatorDecision,
                targetVersion: baselineVersion
            }
        })),
        /operator decision is stale/i
    );
    assert.throws(
        () => parseVisionOperationalReleaseReport(JSON.stringify({
            ...approved,
            operatorDecision: {
                ...approved.operatorDecision,
                evidenceBundle: {
                    ...approved.operatorDecision?.evidenceBundle,
                    items: approved.operatorDecision?.evidenceBundle.items.map((item, index) =>
                        index === 0
                            ? { ...item, uri: 'file:///artifacts/changed-baseline.json' }
                            : item
                    )
                }
            }
        })),
        /operator decision is stale/i
    );
});

test('release history upserts an operator-confirmed report without duplicating the same release artifact', () => {
    const report = evaluateVisionOperationalRelease({
        baselineVersion,
        candidateVersion,
        samples: makeShadowSamples(),
        newProductFamilies: ['NEW-GRILLE'],
        latencyTargetP95Ms: 1500,
        generatedAt: '2026-07-27T07:00:00.000Z',
        evidenceBundle: completeEvidenceBundle
    });
    const firstHistory = upsertVisionOperationalReleaseHistory(
        undefined,
        report,
        '2026-07-27T08:00:00.000Z'
    );

    assert.equal(firstHistory.schemaVersion, 'vision-operational-release-history/v1');
    assert.equal(firstHistory.entries.length, 1);
    assert.equal(firstHistory.entries[0].operatorConfirmed, false);
    assert.equal(
        summarizeVisionOperationalReleaseHistory(firstHistory).latestStatus,
        'awaiting_operator_decision'
    );

    const approved = attachVisionOperationalOperatorDecision(report, {
        action: 'activate_candidate',
        targetVersion: candidateVersion,
        operator: 'quality-lead',
        comment: '승격 조건과 운영 근거를 확인함.',
        confirmed: true,
        decidedAt: '2026-07-27T08:10:00.000Z'
    });
    const updatedHistory = upsertVisionOperationalReleaseHistory(
        firstHistory,
        approved,
        '2026-07-27T08:11:00.000Z'
    );
    const summary = summarizeVisionOperationalReleaseHistory(updatedHistory);

    assert.equal(updatedHistory.entries.length, 1);
    assert.equal(updatedHistory.entries[0].operatorConfirmed, true);
    assert.equal(updatedHistory.entries[0].recordedAt, '2026-07-27T08:11:00.000Z');
    assert.equal(summary.totalReports, 1);
    assert.equal(summary.completeEvidenceReports, 1);
    assert.equal(summary.operatorConfirmedReports, 1);
    assert.equal(summary.latestStatus, 'confirmed');
    assert.equal(summary.latestDecision, 'promote_candidate');
    assert.equal(summary.latestAction, 'activate_candidate');
    assert.deepEqual(summary.latestCandidateVersion, candidateVersion);
});

test('release history summary distinguishes missing evidence, awaiting approval, and empty states', () => {
    const emptySummary = summarizeVisionOperationalReleaseHistory(undefined);
    assert.equal(emptySummary.latestStatus, 'no_history');
    assert.equal(emptySummary.totalReports, 0);

    const incompleteEvidenceReport = evaluateVisionOperationalRelease({
        baselineVersion,
        candidateVersion,
        samples: makeShadowSamples(),
        newProductFamilies: ['NEW-GRILLE'],
        latencyTargetP95Ms: 1500,
        generatedAt: '2026-07-27T07:00:00.000Z'
    });
    const blockedHistory = upsertVisionOperationalReleaseHistory(
        undefined,
        incompleteEvidenceReport,
        '2026-07-27T08:00:00.000Z'
    );
    assert.equal(
        summarizeVisionOperationalReleaseHistory(blockedHistory).latestStatus,
        'blocked_missing_evidence'
    );

    const completeEvidenceReport = evaluateVisionOperationalRelease({
        baselineVersion,
        candidateVersion,
        samples: makeShadowSamples(),
        newProductFamilies: ['NEW-GRILLE'],
        latencyTargetP95Ms: 1500,
        generatedAt: '2026-07-27T07:05:00.000Z',
        evidenceBundle: completeEvidenceBundle
    });
    const awaitingHistory = upsertVisionOperationalReleaseHistory(
        blockedHistory,
        completeEvidenceReport,
        '2026-07-27T08:05:00.000Z'
    );
    const summary = summarizeVisionOperationalReleaseHistory(awaitingHistory);

    assert.equal(summary.totalReports, 2);
    assert.equal(summary.completeEvidenceReports, 1);
    assert.equal(summary.operatorConfirmedReports, 0);
    assert.equal(summary.latestStatus, 'awaiting_operator_decision');
    assert.equal(summary.promoteCandidates, 2);
    assert.equal(summary.shadowHolds, 0);
    assert.equal(summary.rollbackRequired, 0);
});
