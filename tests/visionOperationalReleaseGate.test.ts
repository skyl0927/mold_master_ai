import assert from 'node:assert/strict';
import test from 'node:test';

import {
    auditVisionEvaluationSplit,
    evaluateVisionOperationalRelease,
    parseVisionOperationalReleaseReport,
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
        latencyTargetP95Ms: 1500
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
    assert.deepEqual(report.decisionCard.targetVersion, candidateVersion);
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
