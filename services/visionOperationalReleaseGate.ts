export type VisionEvaluationSplit = 'train' | 'validation' | 'holdout';

export interface VisionVersionSnapshot {
    modelVersion: string;
    promptVersion: string;
    graphVersion: string;
}

export interface VisionEvaluationSplitSample {
    caseId: string;
    split: VisionEvaluationSplit;
    capturedAt: string;
    productFamily?: string;
    moldId?: string;
    cameraId?: string;
    captureSessionId?: string;
    contentHash?: string;
}

export interface VisionShadowPrediction {
    accepted: boolean;
    correct: boolean;
    top3Correct: boolean;
    confidence: number;
    latencyMs: number;
}

export interface VisionShadowSample {
    caseId: string;
    evaluatedAt: string;
    productFamily: string;
    moldId?: string;
    cameraId?: string;
    captureSessionId?: string;
    contentHash?: string;
    expectedDefectClass: string;
    humanVerified: boolean;
    baseline: VisionShadowPrediction;
    candidate: VisionShadowPrediction;
}

export type VisionSplitDimension =
    | 'captureDate'
    | 'productFamily'
    | 'moldId'
    | 'cameraId'
    | 'captureSessionId'
    | 'contentHash';

export interface VisionSplitLeakageIssue {
    dimension: VisionSplitDimension;
    value: string;
    splits: VisionEvaluationSplit[];
    caseIds: string[];
}

export interface VisionSplitAudit {
    passed: boolean;
    sampleCount: number;
    issues: VisionSplitLeakageIssue[];
}

export interface VisionOperationalMetrics {
    samples: number;
    top1Accuracy: number;
    top3Accuracy: number;
    acceptedPredictions: number;
    selectiveCoverage: number;
    selectiveAccuracy: number;
    abstentionRate: number;
    unsafeFalsePositiveRate: number;
    expectedCalibrationError: number;
    p95LatencyMs: number;
    minimumClassReproduction: number;
    perClass: Array<{
        defectClass: string;
        samples: number;
        top1Accuracy: number;
    }>;
}

export interface VisionProductCohortCoverage {
    productFamily: string;
    totalSamples: number;
    humanVerifiedSamples: number;
    requiredHumanVerifiedSamples: number;
    ready: boolean;
}

export interface VisionOperationalReleaseChecks {
    versionSnapshot: boolean;
    versionChanged: boolean;
    pairedSamples: boolean;
    minimumSamples: boolean;
    splitIsolation: boolean;
    newProductHumanVerification: boolean;
    top1Accuracy: boolean;
    top3Accuracy: boolean;
    classReproduction: boolean;
    selectiveAccuracy: boolean;
    selectiveCoverage: boolean;
    top1NonRegression: boolean;
    top3NonRegression: boolean;
    selectiveAccuracyNonRegression: boolean;
    unsafeFalsePositive: boolean;
    calibration: boolean;
    latency: boolean;
}

export interface VisionOperationalReleaseReport {
    schemaVersion: 'vision-operational-release/v1';
    generatedAt: string;
    decision: 'promote_candidate' | 'hold_shadow' | 'rollback_required';
    releaseAllowed: boolean;
    baselineVersion: VisionVersionSnapshot;
    candidateVersion: VisionVersionSnapshot;
    rollbackTarget?: VisionVersionSnapshot;
    baseline: VisionOperationalMetrics;
    candidate: VisionOperationalMetrics;
    splitAudit: VisionSplitAudit;
    cohorts: VisionProductCohortCoverage[];
    checks: VisionOperationalReleaseChecks;
    blockingReasons: string[];
}

export interface VisionOperationalReleaseInput {
    baselineVersion: VisionVersionSnapshot;
    candidateVersion: VisionVersionSnapshot;
    samples: VisionShadowSample[];
    splitSamples?: VisionEvaluationSplitSample[];
    newProductFamilies?: string[];
    minimumSamples?: number;
    minimumHumanVerifiedPerNewProduct?: number;
    latencyTargetP95Ms: number;
    generatedAt?: string;
}

export const VISION_OPERATIONAL_RELEASE_STORAGE_KEY =
    'mold-master-ai:vision-operational-release:v1';

const round = (value: number, digits = 4): number => {
    const scale = 10 ** digits;
    return Math.round(value * scale) / scale;
};

const ratio = (count: number, total: number): number =>
    total > 0 ? round(count / total) : 0;

const normalized = (value?: string): string => (value || '').trim().toLocaleLowerCase();

const normalizedDate = (value: string): string => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value.slice(0, 10) : date.toISOString().slice(0, 10);
};

const splitDimensions: Array<{
    dimension: VisionSplitDimension;
    value: (sample: VisionEvaluationSplitSample) => string;
}> = [
    { dimension: 'captureDate', value: sample => normalizedDate(sample.capturedAt) },
    { dimension: 'productFamily', value: sample => normalized(sample.productFamily) },
    { dimension: 'moldId', value: sample => normalized(sample.moldId) },
    { dimension: 'cameraId', value: sample => normalized(sample.cameraId) },
    { dimension: 'captureSessionId', value: sample => normalized(sample.captureSessionId) },
    { dimension: 'contentHash', value: sample => normalized(sample.contentHash) }
];

export const auditVisionEvaluationSplit = (
    samples: VisionEvaluationSplitSample[]
): VisionSplitAudit => {
    const issues: VisionSplitLeakageIssue[] = [];

    for (const { dimension, value: selectValue } of splitDimensions) {
        const groups = new Map<string, VisionEvaluationSplitSample[]>();
        for (const sample of samples) {
            const value = selectValue(sample);
            if (!value) continue;
            const group = groups.get(value) || [];
            group.push(sample);
            groups.set(value, group);
        }

        for (const [value, group] of groups) {
            const splits = [...new Set(group.map(sample => sample.split))].sort();
            if (splits.length <= 1) continue;
            issues.push({
                dimension,
                value,
                splits,
                caseIds: [...new Set(group.map(sample => sample.caseId))].sort()
            });
        }
    }

    return {
        passed: issues.length === 0,
        sampleCount: samples.length,
        issues
    };
};

const percentileNearestRank = (values: number[], percentile: number): number => {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((left, right) => left - right);
    return sorted[Math.max(0, Math.ceil(percentile * sorted.length) - 1)];
};

const expectedCalibrationError = (
    predictions: VisionShadowPrediction[],
    binCount = 10
): number => {
    if (predictions.length === 0) return 0;
    const bins = Array.from({ length: binCount }, () => ({
        count: 0,
        confidence: 0,
        correct: 0
    }));

    for (const prediction of predictions) {
        const confidence = Math.max(0, Math.min(1, prediction.confidence));
        const index = Math.min(binCount - 1, Math.floor(confidence * binCount));
        bins[index].count += 1;
        bins[index].confidence += confidence;
        bins[index].correct += Number(prediction.correct);
    }

    return round(bins.reduce((total, bin) => {
        if (bin.count === 0) return total;
        const averageConfidence = bin.confidence / bin.count;
        const accuracy = bin.correct / bin.count;
        return total + (bin.count / predictions.length) * Math.abs(averageConfidence - accuracy);
    }, 0));
};

const summarizePredictions = (
    samples: VisionShadowSample[],
    side: 'baseline' | 'candidate'
): VisionOperationalMetrics => {
    const predictions = samples.map(sample => sample[side]);
    const accepted = predictions.filter(prediction => prediction.accepted);
    const classNames = [...new Set(samples.map(sample => sample.expectedDefectClass))].sort();
    const perClass = classNames.map(defectClass => {
        const classSamples = samples.filter(sample => sample.expectedDefectClass === defectClass);
        return {
            defectClass,
            samples: classSamples.length,
            top1Accuracy: ratio(
                classSamples.filter(sample => sample[side].correct).length,
                classSamples.length
            )
        };
    });

    return {
        samples: samples.length,
        top1Accuracy: ratio(
            predictions.filter(prediction => prediction.correct).length,
            predictions.length
        ),
        top3Accuracy: ratio(
            predictions.filter(prediction => prediction.top3Correct).length,
            predictions.length
        ),
        acceptedPredictions: accepted.length,
        selectiveCoverage: ratio(accepted.length, predictions.length),
        selectiveAccuracy: ratio(
            accepted.filter(prediction => prediction.correct).length,
            accepted.length
        ),
        abstentionRate: ratio(predictions.length - accepted.length, predictions.length),
        unsafeFalsePositiveRate: ratio(
            predictions.filter(prediction => prediction.accepted && !prediction.correct).length,
            predictions.length
        ),
        expectedCalibrationError: expectedCalibrationError(predictions),
        p95LatencyMs: percentileNearestRank(
            predictions
                .map(prediction => prediction.latencyMs)
                .filter(value => Number.isFinite(value) && value >= 0),
            0.95
        ),
        minimumClassReproduction:
            perClass.length > 0 ? Math.min(...perClass.map(item => item.top1Accuracy)) : 0,
        perClass
    };
};

const isPinnedVersion = (value: string): boolean =>
    Boolean(value.trim())
    && !/(?:^|[-_/])(unconfigured|unknown|unpinned|latest)(?:$|[-_/])/i.test(value);

const hasCompleteVersion = (snapshot: VisionVersionSnapshot): boolean =>
    Boolean(
        isPinnedVersion(snapshot.modelVersion)
        && isPinnedVersion(snapshot.promptVersion)
        && isPinnedVersion(snapshot.graphVersion)
    );

const versionsDiffer = (
    baseline: VisionVersionSnapshot,
    candidate: VisionVersionSnapshot
): boolean =>
    baseline.modelVersion !== candidate.modelVersion
    || baseline.promptVersion !== candidate.promptVersion
    || baseline.graphVersion !== candidate.graphVersion;

const validPrediction = (prediction: VisionShadowPrediction): boolean =>
    typeof prediction.accepted === 'boolean'
    && typeof prediction.correct === 'boolean'
    && typeof prediction.top3Correct === 'boolean'
    && Number.isFinite(prediction.confidence)
    && prediction.confidence >= 0
    && prediction.confidence <= 1
    && Number.isFinite(prediction.latencyMs)
    && prediction.latencyMs >= 0;

const samplesArePaired = (samples: VisionShadowSample[]): boolean => {
    const caseIds = new Set<string>();
    return samples.every(sample => {
        if (!sample.caseId || caseIds.has(sample.caseId)) return false;
        caseIds.add(sample.caseId);
        return validPrediction(sample.baseline) && validPrediction(sample.candidate);
    });
};

const buildCohortCoverage = (
    samples: VisionShadowSample[],
    newProductFamilies: string[],
    requiredSamples: number
): VisionProductCohortCoverage[] => newProductFamilies.map(productFamily => {
    const cohort = samples.filter(sample => sample.productFamily === productFamily);
    const humanVerifiedSamples = cohort.filter(sample => sample.humanVerified).length;
    return {
        productFamily,
        totalSamples: cohort.length,
        humanVerifiedSamples,
        requiredHumanVerifiedSamples: requiredSamples,
        ready: humanVerifiedSamples >= requiredSamples
    };
});

const incompleteCheckNames: Array<keyof VisionOperationalReleaseChecks> = [
    'versionSnapshot',
    'versionChanged',
    'pairedSamples',
    'minimumSamples',
    'splitIsolation',
    'newProductHumanVerification'
];

export const evaluateVisionOperationalRelease = (
    input: VisionOperationalReleaseInput
): VisionOperationalReleaseReport => {
    const minimumSamples = input.minimumSamples ?? 20;
    const minimumHumanVerifiedPerNewProduct =
        input.minimumHumanVerifiedPerNewProduct ?? 30;
    const splitAudit = auditVisionEvaluationSplit(input.splitSamples || []);
    const baseline = summarizePredictions(input.samples, 'baseline');
    const candidate = summarizePredictions(input.samples, 'candidate');
    const cohorts = buildCohortCoverage(
        input.samples,
        input.newProductFamilies || [],
        minimumHumanVerifiedPerNewProduct
    );
    const checks: VisionOperationalReleaseChecks = {
        versionSnapshot:
            hasCompleteVersion(input.baselineVersion)
            && hasCompleteVersion(input.candidateVersion),
        versionChanged: versionsDiffer(input.baselineVersion, input.candidateVersion),
        pairedSamples: samplesArePaired(input.samples),
        minimumSamples: input.samples.length >= minimumSamples,
        splitIsolation: splitAudit.passed,
        newProductHumanVerification: cohorts.every(cohort => cohort.ready),
        top1Accuracy: candidate.top1Accuracy >= 0.8,
        top3Accuracy: candidate.top3Accuracy >= 0.9,
        classReproduction: candidate.minimumClassReproduction >= 0.8,
        selectiveAccuracy: candidate.selectiveAccuracy >= 0.9,
        selectiveCoverage: candidate.selectiveCoverage >= 0.6,
        top1NonRegression: candidate.top1Accuracy >= baseline.top1Accuracy - 0.02,
        top3NonRegression: candidate.top3Accuracy >= baseline.top3Accuracy - 0.01,
        selectiveAccuracyNonRegression:
            candidate.selectiveAccuracy >= baseline.selectiveAccuracy - 0.02,
        unsafeFalsePositive:
            candidate.unsafeFalsePositiveRate <= 0.05
            && candidate.unsafeFalsePositiveRate
                <= baseline.unsafeFalsePositiveRate + 0.01,
        calibration:
            candidate.expectedCalibrationError <= 0.08
            && candidate.expectedCalibrationError
                <= baseline.expectedCalibrationError + 0.02,
        latency:
            candidate.p95LatencyMs <= input.latencyTargetP95Ms
            && (
                baseline.p95LatencyMs === 0
                || candidate.p95LatencyMs <= baseline.p95LatencyMs * 1.25
            )
    };
    const blockingReasons = Object.entries(checks)
        .filter(([, passed]) => !passed)
        .map(([name]) => name);
    const incomplete = incompleteCheckNames.some(name => !checks[name]);
    const decision: VisionOperationalReleaseReport['decision'] = incomplete
        ? 'hold_shadow'
        : blockingReasons.length > 0
            ? 'rollback_required'
            : 'promote_candidate';

    return {
        schemaVersion: 'vision-operational-release/v1',
        generatedAt: input.generatedAt || new Date().toISOString(),
        decision,
        releaseAllowed: decision === 'promote_candidate',
        baselineVersion: { ...input.baselineVersion },
        candidateVersion: { ...input.candidateVersion },
        rollbackTarget:
            decision === 'rollback_required' ? { ...input.baselineVersion } : undefined,
        baseline,
        candidate,
        splitAudit,
        cohorts,
        checks,
        blockingReasons
    };
};

export const saveVisionOperationalReleaseReport = (
    report: VisionOperationalReleaseReport
): void => {
    try {
        localStorage.setItem(VISION_OPERATIONAL_RELEASE_STORAGE_KEY, JSON.stringify(report));
    } catch {
        // Storage may be unavailable in hardened renderer or test environments.
    }
};

const isVersionSnapshot = (value: unknown): value is VisionVersionSnapshot => {
    if (!value || typeof value !== 'object') return false;
    const snapshot = value as Partial<VisionVersionSnapshot>;
    return typeof snapshot.modelVersion === 'string'
        && typeof snapshot.promptVersion === 'string'
        && typeof snapshot.graphVersion === 'string';
};

const isOperationalMetrics = (value: unknown): value is VisionOperationalMetrics => {
    if (!value || typeof value !== 'object') return false;
    const metrics = value as Partial<VisionOperationalMetrics>;
    return [
        metrics.samples,
        metrics.top1Accuracy,
        metrics.top3Accuracy,
        metrics.selectiveCoverage,
        metrics.selectiveAccuracy,
        metrics.unsafeFalsePositiveRate,
        metrics.expectedCalibrationError,
        metrics.p95LatencyMs
    ].every(item => typeof item === 'number' && Number.isFinite(item));
};

export const parseVisionOperationalReleaseReport = (
    raw: string
): VisionOperationalReleaseReport => {
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        throw new Error('Invalid Vision operational release report: JSON parse failed.');
    }
    if (!parsed || typeof parsed !== 'object') {
        throw new Error('Invalid Vision operational release report: object required.');
    }
    const report = parsed as Partial<VisionOperationalReleaseReport>;
    const validDecision = report.decision === 'promote_candidate'
        || report.decision === 'hold_shadow'
        || report.decision === 'rollback_required';
    if (
        report.schemaVersion !== 'vision-operational-release/v1'
        || !validDecision
        || typeof report.generatedAt !== 'string'
        || typeof report.releaseAllowed !== 'boolean'
        || !isVersionSnapshot(report.baselineVersion)
        || !isVersionSnapshot(report.candidateVersion)
        || !isOperationalMetrics(report.baseline)
        || !isOperationalMetrics(report.candidate)
        || !report.splitAudit
        || typeof report.splitAudit.passed !== 'boolean'
        || !Array.isArray(report.cohorts)
        || !report.checks
        || !Array.isArray(report.blockingReasons)
    ) {
        throw new Error('Invalid Vision operational release report: required fields are missing.');
    }
    if (
        report.decision === 'rollback_required'
        && !isVersionSnapshot(report.rollbackTarget)
    ) {
        throw new Error('Invalid Vision operational release report: rollback target is missing.');
    }
    return report as VisionOperationalReleaseReport;
};

export const readVisionOperationalReleaseReport = (): VisionOperationalReleaseReport | null => {
    try {
        const value = localStorage.getItem(VISION_OPERATIONAL_RELEASE_STORAGE_KEY);
        return value ? parseVisionOperationalReleaseReport(value) : null;
    } catch {
        return null;
    }
};

export const clearVisionOperationalReleaseReport = (): void => {
    try {
        localStorage.removeItem(VISION_OPERATIONAL_RELEASE_STORAGE_KEY);
    } catch {
        // Storage may be unavailable in hardened renderer or test environments.
    }
};
