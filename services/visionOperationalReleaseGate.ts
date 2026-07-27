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

export type VisionOperationalReleaseDecision =
    | 'promote_candidate'
    | 'hold_shadow'
    | 'rollback_required';

export type VisionOperationalDecisionStatus =
    | 'ready_to_promote'
    | 'shadow_hold'
    | 'rollback_required';

export type VisionOperationalDecisionAction =
    | 'activate_candidate'
    | 'continue_shadow_and_collect'
    | 'restore_baseline_snapshot';

export type VisionOperationalEvidenceKind =
    | 'baseline_benchmark'
    | 'candidate_benchmark'
    | 'release_config'
    | 'release_report'
    | 'common_agent_dataset_export'
    | 'common_agent_review_packet'
    | 'graph_snapshot'
    | 'graph_release_evidence';

export interface VisionOperationalEvidenceReference {
    kind: VisionOperationalEvidenceKind;
    uri: string;
    sha256?: string;
    generatedAt?: string;
    label?: string;
}

export interface VisionOperationalEvidenceBundle {
    contractVersion: 'vision-operational-evidence-bundle/v1';
    items: VisionOperationalEvidenceReference[];
    complete: boolean;
    missingEvidence: string[];
}

export type VisionOperationalEvidenceAlignmentCheck =
    | 'completeEvidenceBundle'
    | 'localArtifactHashesPresent'
    | 'commonAgentDatasetExportPinned'
    | 'graphSnapshotPinned'
    | 'graphSnapshotMatchesCandidateGraphVersion';

export interface VisionOperationalEvidenceAlignmentIssue {
    check: VisionOperationalEvidenceAlignmentCheck;
    kind?: VisionOperationalEvidenceKind;
    severity: 'warning' | 'critical';
    message: string;
}

export interface VisionOperationalEvidenceAlignment {
    contractVersion: 'vision-operational-evidence-alignment/v1';
    passed: boolean;
    checks: Record<VisionOperationalEvidenceAlignmentCheck, boolean>;
    issues: VisionOperationalEvidenceAlignmentIssue[];
}

export interface VisionOperationalDecisionCard {
    contractVersion: 'vision-operational-decision-card/v1';
    status: VisionOperationalDecisionStatus;
    severity: 'success' | 'warning' | 'critical';
    primaryAction: VisionOperationalDecisionAction;
    title: string;
    summary: string;
    operatorSteps: string[];
    blockingReasons: string[];
    targetVersion: VisionVersionSnapshot;
    evidenceBundle: VisionOperationalEvidenceBundle;
    requiresHumanApproval: true;
    autoApplyAllowed: false;
}

export interface VisionOperationalOperatorDecision {
    contractVersion: 'vision-operational-operator-decision/v1';
    status: 'confirmed';
    action: VisionOperationalDecisionAction;
    decisionCardStatus: VisionOperationalDecisionStatus;
    reportDecision: VisionOperationalReleaseDecision;
    reportGeneratedAt: string;
    decidedAt: string;
    operator: string;
    comment: string;
    confirmed: true;
    targetVersion: VisionVersionSnapshot;
    blockingReasons: string[];
    evidenceBundle: VisionOperationalEvidenceBundle;
    autoApplied: false;
}

export interface VisionOperationalOperatorDecisionInput {
    action: VisionOperationalDecisionAction;
    targetVersion: VisionVersionSnapshot;
    operator: string;
    comment: string;
    confirmed: boolean;
    decidedAt?: string;
}

export interface VisionOperationalReleaseReport {
    schemaVersion: 'vision-operational-release/v1';
    generatedAt: string;
    decision: VisionOperationalReleaseDecision;
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
    evidenceBundle: VisionOperationalEvidenceBundle;
    decisionCard: VisionOperationalDecisionCard;
    operatorDecision?: VisionOperationalOperatorDecision;
}

export type VisionOperationalReleaseHistoryStatus =
    | 'no_history'
    | 'blocked_missing_evidence'
    | 'awaiting_operator_decision'
    | 'confirmed';

export interface VisionOperationalReleaseHistoryEntry {
    id: string;
    recordedAt: string;
    decision: VisionOperationalReleaseDecision;
    action: VisionOperationalDecisionAction;
    candidateVersion: VisionVersionSnapshot;
    targetVersion: VisionVersionSnapshot;
    evidenceComplete: boolean;
    operatorConfirmed: boolean;
    report: VisionOperationalReleaseReport;
}

export interface VisionOperationalReleaseHistory {
    schemaVersion: 'vision-operational-release-history/v1';
    updatedAt: string;
    entries: VisionOperationalReleaseHistoryEntry[];
}

export interface VisionOperationalReleaseHistorySummary {
    totalReports: number;
    completeEvidenceReports: number;
    operatorConfirmedReports: number;
    promoteCandidates: number;
    shadowHolds: number;
    rollbackRequired: number;
    latestStatus: VisionOperationalReleaseHistoryStatus;
    latestReportId?: string;
    latestDecision?: VisionOperationalReleaseDecision;
    latestAction?: VisionOperationalDecisionAction;
    latestCandidateVersion?: VisionVersionSnapshot;
}

export type VisionOperationalReleaseTrendAction =
    | 'collect_operational_evidence'
    | 'improve_candidate_metrics'
    | 'confirm_operator_decision'
    | 'maintain_confirmed_release'
    | 'collect_first_release_report';

export interface VisionOperationalReleaseBlockingReasonTrend {
    name: string;
    count: number;
    latest: boolean;
}

export interface VisionOperationalReleaseTrendSummary {
    contractVersion: 'vision-operational-release-trend/v1';
    historyWindowSize: number;
    evidenceReadyRate: number;
    operatorConfirmationRate: number;
    latestActionCode: VisionOperationalReleaseTrendAction;
    latestActionLabel: string;
    topBlockingReasons: VisionOperationalReleaseBlockingReasonTrend[];
    narrative: string;
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
    evidenceBundle?: Partial<VisionOperationalEvidenceBundle>;
}

export const VISION_OPERATIONAL_RELEASE_STORAGE_KEY =
    'mold-master-ai:vision-operational-release:v1';
export const VISION_OPERATIONAL_RELEASE_HISTORY_STORAGE_KEY =
    'mold-master-ai:vision-operational-release-history:v1';

const VISION_OPERATIONAL_RELEASE_HISTORY_LIMIT = 50;

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

const requiredEvidenceKinds: VisionOperationalEvidenceKind[] = [
    'baseline_benchmark',
    'candidate_benchmark',
    'release_config',
    'common_agent_dataset_export',
    'graph_snapshot'
];

const evidenceKinds = new Set<VisionOperationalEvidenceKind>([
    ...requiredEvidenceKinds,
    'release_report',
    'common_agent_review_packet',
    'graph_release_evidence'
]);

const isEvidenceKind = (value: unknown): value is VisionOperationalEvidenceKind =>
    typeof value === 'string' && evidenceKinds.has(value as VisionOperationalEvidenceKind);

const normalizedEvidenceItem = (
    value: unknown
): VisionOperationalEvidenceReference | null => {
    if (!value || typeof value !== 'object') return null;
    const item = value as Partial<VisionOperationalEvidenceReference>;
    const uri = typeof item.uri === 'string' ? item.uri.trim() : '';
    if (!isEvidenceKind(item.kind) || !uri) return null;
    return {
        kind: item.kind,
        uri,
        ...(typeof item.sha256 === 'string' && item.sha256.trim()
            ? { sha256: item.sha256.trim() }
            : {}),
        ...(typeof item.generatedAt === 'string' && item.generatedAt.trim()
            ? { generatedAt: item.generatedAt.trim() }
            : {}),
        ...(typeof item.label === 'string' && item.label.trim()
            ? { label: item.label.trim() }
            : {})
    };
};

export const normalizeVisionOperationalEvidenceBundle = (
    value?: Partial<VisionOperationalEvidenceBundle>
): VisionOperationalEvidenceBundle => {
    const seen = new Set<string>();
    const items = (Array.isArray(value?.items) ? value.items : [])
        .map(normalizedEvidenceItem)
        .filter((item): item is VisionOperationalEvidenceReference => Boolean(item))
        .sort((left, right) =>
            `${left.kind}:${left.uri}`.localeCompare(`${right.kind}:${right.uri}`)
        )
        .filter(item => {
            const key = `${item.kind}:${item.uri}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    const presentKinds = new Set(items.map(item => item.kind));
    const missingEvidence = requiredEvidenceKinds.filter(kind => !presentKinds.has(kind));
    return {
        contractVersion: 'vision-operational-evidence-bundle/v1',
        items,
        complete: missingEvidence.length === 0,
        missingEvidence
    };
};

const evidenceItemsForKind = (
    bundle: VisionOperationalEvidenceBundle,
    kind: VisionOperationalEvidenceKind
): VisionOperationalEvidenceReference[] =>
    bundle.items.filter(item => item.kind === kind);

const hasValidSha256 = (item: VisionOperationalEvidenceReference): boolean =>
    typeof item.sha256 === 'string' && /^[a-f0-9]{64}$/i.test(item.sha256);

const evidenceText = (item: VisionOperationalEvidenceReference): string =>
    [item.uri, item.label, item.generatedAt, item.sha256]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase();

const isPinnedEvidenceUri = (uri: string): boolean =>
    Boolean(uri.trim())
    && !/(?:^|[-_/:.])(latest|unknown|unconfigured|unpinned|placeholder|example|yyyy|mm|dd)(?:$|[-_/:.])/i
        .test(uri);

export const auditVisionOperationalEvidenceAlignment = (
    report: Pick<
        VisionOperationalReleaseReport,
        'candidateVersion' | 'evidenceBundle' | 'decisionCard'
    >
): VisionOperationalEvidenceAlignment => {
    const bundle = normalizeVisionOperationalEvidenceBundle(report.evidenceBundle);
    const localArtifactHashesPresent = ([
        'baseline_benchmark',
        'candidate_benchmark',
        'release_config'
    ] as VisionOperationalEvidenceKind[]).every(kind =>
        evidenceItemsForKind(bundle, kind).some(hasValidSha256)
    );
    const commonAgentItems = evidenceItemsForKind(bundle, 'common_agent_dataset_export');
    const commonAgentDatasetExportPinned = commonAgentItems.length > 0
        && commonAgentItems.every(item => isPinnedEvidenceUri(item.uri));
    const graphSnapshotItems = evidenceItemsForKind(bundle, 'graph_snapshot');
    const graphSnapshotPinned = graphSnapshotItems.length > 0
        && graphSnapshotItems.every(item => isPinnedEvidenceUri(item.uri));
    const candidateGraphVersion = report.candidateVersion.graphVersion
        .trim()
        .toLocaleLowerCase();
    const graphSnapshotMatchesCandidateGraphVersion = Boolean(candidateGraphVersion)
        && graphSnapshotItems.some(item => evidenceText(item).includes(candidateGraphVersion));
    const checks: Record<VisionOperationalEvidenceAlignmentCheck, boolean> = {
        completeEvidenceBundle: bundle.complete,
        localArtifactHashesPresent,
        commonAgentDatasetExportPinned,
        graphSnapshotPinned,
        graphSnapshotMatchesCandidateGraphVersion
    };
    const issues: VisionOperationalEvidenceAlignmentIssue[] = [];

    if (!checks.completeEvidenceBundle) {
        issues.push({
            check: 'completeEvidenceBundle',
            severity: 'critical',
            message: `Missing operational evidence: ${bundle.missingEvidence.join(', ')}`
        });
    }
    if (!checks.localArtifactHashesPresent) {
        issues.push({
            check: 'localArtifactHashesPresent',
            severity: 'critical',
            message:
                'Baseline, candidate, and release config artifacts must include SHA-256 hashes.'
        });
    }
    if (!checks.commonAgentDatasetExportPinned) {
        issues.push({
            check: 'commonAgentDatasetExportPinned',
            kind: 'common_agent_dataset_export',
            severity: 'critical',
            message:
                'Common Agent dataset export evidence must be a pinned export URI, not a placeholder or latest alias.'
        });
    }
    if (!checks.graphSnapshotPinned) {
        issues.push({
            check: 'graphSnapshotPinned',
            kind: 'graph_snapshot',
            severity: 'critical',
            message:
                'Graph snapshot evidence must be a pinned snapshot URI, not a placeholder or latest alias.'
        });
    }
    if (!checks.graphSnapshotMatchesCandidateGraphVersion) {
        issues.push({
            check: 'graphSnapshotMatchesCandidateGraphVersion',
            kind: 'graph_snapshot',
            severity: 'critical',
            message:
                `Graph snapshot evidence must reference candidate graph version ${report.candidateVersion.graphVersion}.`
        });
    }

    return {
        contractVersion: 'vision-operational-evidence-alignment/v1',
        passed: issues.every(issue => issue.severity !== 'critical'),
        checks,
        issues
    };
};

type VisionOperationalDecisionCardSource = Pick<
    VisionOperationalReleaseReport,
    | 'decision'
    | 'baselineVersion'
    | 'candidateVersion'
    | 'rollbackTarget'
    | 'blockingReasons'
    | 'evidenceBundle'
>;

export const buildVisionOperationalDecisionCard = (
    source: VisionOperationalDecisionCardSource
): VisionOperationalDecisionCard => {
    if (source.decision === 'promote_candidate') {
        return {
            contractVersion: 'vision-operational-decision-card/v1',
            status: 'ready_to_promote',
            severity: 'success',
            primaryAction: 'activate_candidate',
            title: '후보 Vision 버전 승격 대기',
            summary:
                '모든 운영 게이트를 통과했습니다. 사람 승인 후 후보 버전을 운영 활성화할 수 있습니다.',
            operatorSteps: [
                '후보 모델, 프롬프트, Graph 버전 스냅샷을 최종 확인합니다.',
                '최근 HITL 오답 또는 보류 항목이 새 결함군에 집중되지 않는지 확인합니다.',
                '승인 후 후보 버전을 활성화하고 24시간 Shadow 모니터링을 유지합니다.'
            ],
            blockingReasons: [...source.blockingReasons],
            targetVersion: { ...source.candidateVersion },
            evidenceBundle: normalizeVisionOperationalEvidenceBundle(source.evidenceBundle),
            requiresHumanApproval: true,
            autoApplyAllowed: false
        };
    }

    if (source.decision === 'rollback_required') {
        return {
            contractVersion: 'vision-operational-decision-card/v1',
            status: 'rollback_required',
            severity: 'critical',
            primaryAction: 'restore_baseline_snapshot',
            title: '기준 Vision 버전 롤백 필요',
            summary:
                '후보 버전이 안전 기준을 위반했습니다. 운영 전환을 중단하고 기준 스냅샷 복원을 준비합니다.',
            operatorSteps: [
                '후보 버전 활성화를 중단하고 롤백 대상 스냅샷을 확인합니다.',
                '차단 기준별 실패 케이스를 HITL 검토 큐로 보냅니다.',
                '기준 버전으로 복원한 뒤 후보는 추가 학습 데이터로 재평가합니다.'
            ],
            blockingReasons: [...source.blockingReasons],
            targetVersion: { ...(source.rollbackTarget || source.baselineVersion) },
            evidenceBundle: normalizeVisionOperationalEvidenceBundle(source.evidenceBundle),
            requiresHumanApproval: true,
            autoApplyAllowed: false
        };
    }

    return {
        contractVersion: 'vision-operational-decision-card/v1',
        status: 'shadow_hold',
        severity: 'warning',
        primaryAction: 'continue_shadow_and_collect',
        title: 'Shadow 모드 유지 및 데이터 보강',
        summary:
            '운영 승격 전 필수 증거가 부족합니다. 후보 버전은 Shadow 평가에서 유지하고 부족한 항목을 보강합니다.',
        operatorSteps: [
            '차단 기준을 기준으로 부족한 holdout 샘플 또는 새 제품군 HITL 검증을 보강합니다.',
            '동일 baseline/candidate 쌍으로 Shadow 평가를 다시 실행합니다.',
            '새 보고서를 등록해 결정 카드가 승격 또는 롤백으로 바뀌는지 확인합니다.'
        ],
        blockingReasons: [...source.blockingReasons],
        targetVersion: { ...source.candidateVersion },
        evidenceBundle: normalizeVisionOperationalEvidenceBundle(source.evidenceBundle),
        requiresHumanApproval: true,
        autoApplyAllowed: false
    };
};

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
    const evidenceBundle = normalizeVisionOperationalEvidenceBundle(input.evidenceBundle);
    const incomplete = incompleteCheckNames.some(name => !checks[name]);
    const decision: VisionOperationalReleaseReport['decision'] = incomplete
        ? 'hold_shadow'
        : blockingReasons.length > 0
            ? 'rollback_required'
            : 'promote_candidate';

    const reportWithoutCard: Omit<VisionOperationalReleaseReport, 'decisionCard'> = {
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
        blockingReasons,
        evidenceBundle
    };
    return {
        ...reportWithoutCard,
        decisionCard: buildVisionOperationalDecisionCard(reportWithoutCard)
    };
};

export const attachVisionOperationalOperatorDecision = (
    report: VisionOperationalReleaseReport,
    input: VisionOperationalOperatorDecisionInput
): VisionOperationalReleaseReport => {
    const operator = input.operator.trim();
    const comment = input.comment.trim();
    if (!input.confirmed) {
        throw new Error('Vision operator decision confirmation is required.');
    }
    if (!operator) {
        throw new Error('Vision operator decision operator is required.');
    }
    if (!comment) {
        throw new Error('Vision operator decision comment is required.');
    }
    if (input.action !== report.decisionCard.primaryAction) {
        throw new Error('Vision operator decision does not match release card action.');
    }
    if (!sameVersionSnapshot(input.targetVersion, report.decisionCard.targetVersion)) {
        throw new Error('Vision operator decision target version does not match release card target.');
    }
    if (!report.decisionCard.evidenceBundle.complete) {
        throw new Error('Vision operator decision evidence bundle is incomplete.');
    }
    const evidenceAlignment = auditVisionOperationalEvidenceAlignment(report);
    if (!evidenceAlignment.passed) {
        throw new Error(
            `Vision operator decision evidence alignment failed: ${
                evidenceAlignment.issues.map(issue => issue.check).join(', ')
            }`
        );
    }
    return {
        ...report,
        operatorDecision: {
            contractVersion: 'vision-operational-operator-decision/v1',
            status: 'confirmed',
            action: input.action,
            decisionCardStatus: report.decisionCard.status,
            reportDecision: report.decision,
            reportGeneratedAt: report.generatedAt,
            decidedAt: input.decidedAt || new Date().toISOString(),
            operator,
            comment,
            confirmed: true,
            targetVersion: { ...input.targetVersion },
            blockingReasons: [...report.decisionCard.blockingReasons],
            evidenceBundle: normalizeVisionOperationalEvidenceBundle(
                report.decisionCard.evidenceBundle
            ),
            autoApplied: false
        }
    };
};

export const saveVisionOperationalReleaseReport = (
    report: VisionOperationalReleaseReport
): void => {
    try {
        localStorage.setItem(VISION_OPERATIONAL_RELEASE_STORAGE_KEY, JSON.stringify(report));
        recordVisionOperationalReleaseHistory(report);
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

const sameVersionSnapshot = (
    left: VisionVersionSnapshot,
    right: VisionVersionSnapshot
): boolean =>
    left.modelVersion === right.modelVersion
    && left.promptVersion === right.promptVersion
    && left.graphVersion === right.graphVersion;

const sameStringList = (left: string[], right: string[]): boolean =>
    left.length === right.length && left.every((item, index) => item === right[index]);

const sameEvidenceItems = (
    left: VisionOperationalEvidenceReference[],
    right: VisionOperationalEvidenceReference[]
): boolean =>
    left.length === right.length
    && left.every((item, index) => {
        const other = right[index];
        return item.kind === other.kind
            && item.uri === other.uri
            && item.sha256 === other.sha256
            && item.generatedAt === other.generatedAt
            && item.label === other.label;
    });

const sameEvidenceBundle = (
    left: VisionOperationalEvidenceBundle,
    right: VisionOperationalEvidenceBundle
): boolean =>
    left.contractVersion === right.contractVersion
    && left.complete === right.complete
    && sameStringList(left.missingEvidence, right.missingEvidence)
    && sameEvidenceItems(left.items, right.items);

const isOperationalEvidenceBundle = (
    value: unknown
): value is VisionOperationalEvidenceBundle => {
    if (!value || typeof value !== 'object') return false;
    const bundle = value as Partial<VisionOperationalEvidenceBundle>;
    const normalizedBundle = normalizeVisionOperationalEvidenceBundle(bundle);
    return bundle.contractVersion === 'vision-operational-evidence-bundle/v1'
        && Array.isArray(bundle.items)
        && bundle.items.every(item => normalizedEvidenceItem(item) !== null)
        && bundle.complete === normalizedBundle.complete
        && Array.isArray(bundle.missingEvidence)
        && bundle.missingEvidence.every(item => typeof item === 'string')
        && sameStringList(bundle.missingEvidence, normalizedBundle.missingEvidence);
};

const isOperationalDecisionCardCore = (
    value: unknown
): value is Omit<VisionOperationalDecisionCard, 'evidenceBundle'> => {
    if (!value || typeof value !== 'object') return false;
    const card = value as Partial<VisionOperationalDecisionCard>;
    return card.contractVersion === 'vision-operational-decision-card/v1'
        && (
            card.status === 'ready_to_promote'
            || card.status === 'shadow_hold'
            || card.status === 'rollback_required'
        )
        && (
            card.severity === 'success'
            || card.severity === 'warning'
            || card.severity === 'critical'
        )
        && (
            card.primaryAction === 'activate_candidate'
            || card.primaryAction === 'continue_shadow_and_collect'
            || card.primaryAction === 'restore_baseline_snapshot'
        )
        && typeof card.title === 'string'
        && card.title.trim().length > 0
        && typeof card.summary === 'string'
        && card.summary.trim().length > 0
        && Array.isArray(card.operatorSteps)
        && card.operatorSteps.length > 0
        && card.operatorSteps.every(step => typeof step === 'string' && step.trim().length > 0)
        && Array.isArray(card.blockingReasons)
        && card.blockingReasons.every(reason => typeof reason === 'string')
        && isVersionSnapshot(card.targetVersion)
        && card.requiresHumanApproval === true
        && card.autoApplyAllowed === false;
};

const isOperationalDecisionCard = (
    value: unknown
): value is VisionOperationalDecisionCard => {
    if (!isOperationalDecisionCardCore(value)) return false;
    const card = value as Partial<VisionOperationalDecisionCard>;
    return isOperationalEvidenceBundle(card.evidenceBundle);
};

const isOperationalOperatorDecision = (
    value: unknown
): value is VisionOperationalOperatorDecision => {
    if (!value || typeof value !== 'object') return false;
    const decision = value as Partial<VisionOperationalOperatorDecision>;
    return decision.contractVersion === 'vision-operational-operator-decision/v1'
        && decision.status === 'confirmed'
        && (
            decision.action === 'activate_candidate'
            || decision.action === 'continue_shadow_and_collect'
            || decision.action === 'restore_baseline_snapshot'
        )
        && (
            decision.decisionCardStatus === 'ready_to_promote'
            || decision.decisionCardStatus === 'shadow_hold'
            || decision.decisionCardStatus === 'rollback_required'
        )
        && (
            decision.reportDecision === 'promote_candidate'
            || decision.reportDecision === 'hold_shadow'
            || decision.reportDecision === 'rollback_required'
        )
        && typeof decision.reportGeneratedAt === 'string'
        && typeof decision.decidedAt === 'string'
        && typeof decision.operator === 'string'
        && decision.operator.trim().length > 0
        && typeof decision.comment === 'string'
        && decision.comment.trim().length > 0
        && decision.confirmed === true
        && isVersionSnapshot(decision.targetVersion)
        && Array.isArray(decision.blockingReasons)
        && decision.blockingReasons.every(reason => typeof reason === 'string')
        && isOperationalEvidenceBundle(decision.evidenceBundle)
        && decision.autoApplied === false;
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
    const reportWithOptionalCard = report as Omit<VisionOperationalReleaseReport, 'decisionCard'> & {
        decisionCard?: VisionOperationalDecisionCard;
    };
    const evidenceBundle = normalizeVisionOperationalEvidenceBundle(report.evidenceBundle);
    if (report.evidenceBundle && !isOperationalEvidenceBundle(report.evidenceBundle)) {
        throw new Error('Invalid Vision operational release report: evidence bundle is malformed.');
    }
    const expectedCard = buildVisionOperationalDecisionCard({
        ...reportWithOptionalCard,
        evidenceBundle
    });
    if (report.decisionCard) {
        const cardEvidence = (report.decisionCard as Partial<VisionOperationalDecisionCard>)
            .evidenceBundle;
        if (
            !isOperationalDecisionCardCore(report.decisionCard)
            || (cardEvidence !== undefined && !isOperationalEvidenceBundle(cardEvidence))
            || report.decisionCard.status !== expectedCard.status
            || report.decisionCard.severity !== expectedCard.severity
            || report.decisionCard.primaryAction !== expectedCard.primaryAction
            || !sameVersionSnapshot(report.decisionCard.targetVersion, expectedCard.targetVersion)
            || !sameStringList(report.decisionCard.blockingReasons, expectedCard.blockingReasons)
            || (
                cardEvidence !== undefined
                && !sameEvidenceBundle(cardEvidence, expectedCard.evidenceBundle)
            )
        ) {
            throw new Error('Invalid Vision operational release report: decision card is inconsistent.');
        }
    }
    if (report.operatorDecision) {
        if (!isOperationalOperatorDecision(report.operatorDecision)) {
            throw new Error('Invalid Vision operational release report: operator decision is malformed.');
        }
        if (
            report.operatorDecision.action !== expectedCard.primaryAction
            || report.operatorDecision.decisionCardStatus !== expectedCard.status
            || report.operatorDecision.reportDecision !== report.decision
            || report.operatorDecision.reportGeneratedAt !== report.generatedAt
            || !sameVersionSnapshot(report.operatorDecision.targetVersion, expectedCard.targetVersion)
            || !sameStringList(report.operatorDecision.blockingReasons, expectedCard.blockingReasons)
            || !sameEvidenceBundle(report.operatorDecision.evidenceBundle, expectedCard.evidenceBundle)
        ) {
            throw new Error('Invalid Vision operational release report: operator decision is stale.');
        }
    }
    return {
        ...reportWithOptionalCard,
        evidenceBundle,
        decisionCard: expectedCard,
        operatorDecision: report.operatorDecision
    };
};

const historyTimestamp = (value: string): number => {
    const time = Date.parse(value);
    return Number.isNaN(time) ? 0 : time;
};

export const buildVisionOperationalReleaseReportId = (
    report: VisionOperationalReleaseReport
): string => [
    report.schemaVersion,
    report.generatedAt,
    report.decision,
    report.baselineVersion.modelVersion,
    report.baselineVersion.promptVersion,
    report.baselineVersion.graphVersion,
    report.candidateVersion.modelVersion,
    report.candidateVersion.promptVersion,
    report.candidateVersion.graphVersion
].join('|');

const buildVisionOperationalReleaseHistoryEntry = (
    report: VisionOperationalReleaseReport,
    recordedAt: string
): VisionOperationalReleaseHistoryEntry => {
    const canonicalReport = parseVisionOperationalReleaseReport(JSON.stringify(report));
    return {
        id: buildVisionOperationalReleaseReportId(canonicalReport),
        recordedAt,
        decision: canonicalReport.decision,
        action: canonicalReport.decisionCard.primaryAction,
        candidateVersion: { ...canonicalReport.candidateVersion },
        targetVersion: { ...canonicalReport.decisionCard.targetVersion },
        evidenceComplete: canonicalReport.decisionCard.evidenceBundle.complete,
        operatorConfirmed: canonicalReport.operatorDecision?.status === 'confirmed',
        report: canonicalReport
    };
};

const sortVisionOperationalReleaseHistoryEntries = (
    entries: VisionOperationalReleaseHistoryEntry[]
): VisionOperationalReleaseHistoryEntry[] =>
    [...entries].sort((left, right) =>
        historyTimestamp(right.recordedAt) - historyTimestamp(left.recordedAt)
        || historyTimestamp(right.report.generatedAt) - historyTimestamp(left.report.generatedAt)
        || right.id.localeCompare(left.id)
    );

export const upsertVisionOperationalReleaseHistory = (
    history: VisionOperationalReleaseHistory | null | undefined,
    report: VisionOperationalReleaseReport,
    recordedAt = new Date().toISOString()
): VisionOperationalReleaseHistory => {
    const entry = buildVisionOperationalReleaseHistoryEntry(report, recordedAt);
    const existingEntries = history?.schemaVersion === 'vision-operational-release-history/v1'
        ? history.entries
        : [];
    const entries = sortVisionOperationalReleaseHistoryEntries([
        entry,
        ...existingEntries.filter(existing => existing.id !== entry.id)
    ]).slice(0, VISION_OPERATIONAL_RELEASE_HISTORY_LIMIT);

    return {
        schemaVersion: 'vision-operational-release-history/v1',
        updatedAt: recordedAt,
        entries
    };
};

export const summarizeVisionOperationalReleaseHistory = (
    history: VisionOperationalReleaseHistory | null | undefined
): VisionOperationalReleaseHistorySummary => {
    const entries = sortVisionOperationalReleaseHistoryEntries(
        history?.schemaVersion === 'vision-operational-release-history/v1'
            ? history.entries
            : []
    );
    const latest = entries[0];
    const latestStatus: VisionOperationalReleaseHistoryStatus = !latest
        ? 'no_history'
        : !latest.evidenceComplete
            ? 'blocked_missing_evidence'
            : latest.operatorConfirmed
                ? 'confirmed'
                : 'awaiting_operator_decision';

    return {
        totalReports: entries.length,
        completeEvidenceReports: entries.filter(entry => entry.evidenceComplete).length,
        operatorConfirmedReports: entries.filter(entry => entry.operatorConfirmed).length,
        promoteCandidates: entries.filter(entry => entry.decision === 'promote_candidate').length,
        shadowHolds: entries.filter(entry => entry.decision === 'hold_shadow').length,
        rollbackRequired: entries.filter(entry => entry.decision === 'rollback_required').length,
        latestStatus,
        latestReportId: latest?.id,
        latestDecision: latest?.decision,
        latestAction: latest?.action,
        latestCandidateVersion: latest ? { ...latest.candidateVersion } : undefined
    };
};

const trendActionLabel = (action: VisionOperationalReleaseTrendAction): string => {
    if (action === 'collect_operational_evidence') return '운영 근거 패킷 보강';
    if (action === 'improve_candidate_metrics') return '후보 Vision 성능 개선';
    if (action === 'confirm_operator_decision') return '담당자 운영 확인 필요';
    if (action === 'maintain_confirmed_release') return '확인된 운영 판단 유지';
    return '첫 운영 평가 보고서 등록';
};

const blockingReasonPriority = (reason: string): number => {
    const priorities: Record<string, number> = {
        minimumSamples: 100,
        newProductHumanVerification: 95,
        splitIsolation: 90,
        top1Accuracy: 85,
        classReproduction: 80,
        top3Accuracy: 75,
        selectiveAccuracy: 70,
        selectiveCoverage: 65,
        unsafeFalsePositive: 60,
        calibration: 55,
        latency: 50
    };
    return priorities[reason] ?? 0;
};

const decideTrendAction = (
    latest: VisionOperationalReleaseHistoryEntry | undefined
): VisionOperationalReleaseTrendAction => {
    if (!latest) return 'collect_first_release_report';
    if (!latest.evidenceComplete) return 'collect_operational_evidence';
    if (latest.operatorConfirmed) return 'maintain_confirmed_release';
    if (latest.report.decision === 'promote_candidate') return 'confirm_operator_decision';
    return 'improve_candidate_metrics';
};

const trendNarrative = (
    latest: VisionOperationalReleaseHistoryEntry | undefined,
    action: VisionOperationalReleaseTrendAction,
    topBlockingReasons: VisionOperationalReleaseBlockingReasonTrend[]
): string => {
    if (!latest) {
        return '운영 평가 보고서가 아직 없습니다. baseline/candidate shadow benchmark를 먼저 등록하세요.';
    }
    const topReason = topBlockingReasons[0]?.name;
    if (action === 'collect_operational_evidence') {
        return `운영 지표와 별개로 중앙 증거가 부족합니다. ${
            latest.report.evidenceBundle.missingEvidence.join(', ') || 'evidenceBundle'
        } 항목을 보강하세요.`;
    }
    if (action === 'confirm_operator_decision') {
        return '운영 근거와 지표가 준비됐습니다. 담당자 확인을 저장하면 release history가 확정됩니다.';
    }
    if (action === 'maintain_confirmed_release') {
        return '최신 운영 판단이 담당자 확인까지 완료됐습니다. 다음 후보는 같은 절차로 shadow 비교하세요.';
    }
    return `운영 근거는 준비됐지만 후보 지표가 부족합니다. ${
        topReason ? `${topReason} 차단 원인을 우선 개선하세요.` : '차단 원인을 보강하세요.'
    }`;
};

export const summarizeVisionOperationalReleaseTrend = (
    history: VisionOperationalReleaseHistory | null | undefined
): VisionOperationalReleaseTrendSummary => {
    const entries = sortVisionOperationalReleaseHistoryEntries(
        history?.schemaVersion === 'vision-operational-release-history/v1'
            ? history.entries
            : []
    );
    const latest = entries[0];
    const reasonCounts = new Map<string, { count: number; latest: boolean }>();
    for (const entry of entries) {
        for (const reason of entry.report.blockingReasons) {
            const current = reasonCounts.get(reason) || { count: 0, latest: false };
            reasonCounts.set(reason, {
                count: current.count + 1,
                latest: current.latest || entry.id === latest?.id
            });
        }
    }
    const topBlockingReasons = [...reasonCounts.entries()]
        .map(([name, value]) => ({
            name,
            count: value.count,
            latest: value.latest
        }))
        .sort((left, right) =>
            blockingReasonPriority(right.name) - blockingReasonPriority(left.name)
            || right.count - left.count
            || Number(right.latest) - Number(left.latest)
            || left.name.localeCompare(right.name)
        )
        .slice(0, 5);
    const latestActionCode = decideTrendAction(latest);

    return {
        contractVersion: 'vision-operational-release-trend/v1',
        historyWindowSize: entries.length,
        evidenceReadyRate: entries.length > 0
            ? round((entries.filter(entry => entry.evidenceComplete).length / entries.length) * 100, 1)
            : 0,
        operatorConfirmationRate: entries.length > 0
            ? round((entries.filter(entry => entry.operatorConfirmed).length / entries.length) * 100, 1)
            : 0,
        latestActionCode,
        latestActionLabel: trendActionLabel(latestActionCode),
        topBlockingReasons,
        narrative: trendNarrative(latest, latestActionCode, topBlockingReasons)
    };
};

export const parseVisionOperationalReleaseHistory = (
    raw: string
): VisionOperationalReleaseHistory => {
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        throw new Error('Invalid Vision operational release history: JSON parse failed.');
    }
    if (!parsed || typeof parsed !== 'object') {
        throw new Error('Invalid Vision operational release history: object required.');
    }
    const history = parsed as Partial<VisionOperationalReleaseHistory>;
    if (
        history.schemaVersion !== 'vision-operational-release-history/v1'
        || typeof history.updatedAt !== 'string'
        || !Array.isArray(history.entries)
    ) {
        throw new Error('Invalid Vision operational release history: required fields are missing.');
    }
    const entries = history.entries.map(entry => {
        if (!entry || typeof entry !== 'object') {
            throw new Error('Invalid Vision operational release history: entry object required.');
        }
        const candidate = entry as Partial<VisionOperationalReleaseHistoryEntry>;
        if (
            typeof candidate.id !== 'string'
            || typeof candidate.recordedAt !== 'string'
            || !candidate.report
        ) {
            throw new Error('Invalid Vision operational release history: entry fields are missing.');
        }
        const rebuilt = buildVisionOperationalReleaseHistoryEntry(
            parseVisionOperationalReleaseReport(JSON.stringify(candidate.report)),
            candidate.recordedAt
        );
        if (candidate.id !== rebuilt.id) {
            throw new Error('Invalid Vision operational release history: entry id is stale.');
        }
        return rebuilt;
    });

    return {
        schemaVersion: 'vision-operational-release-history/v1',
        updatedAt: history.updatedAt,
        entries: sortVisionOperationalReleaseHistoryEntries(entries)
            .slice(0, VISION_OPERATIONAL_RELEASE_HISTORY_LIMIT)
    };
};

export const readVisionOperationalReleaseHistory = (): VisionOperationalReleaseHistory => {
    try {
        const value = localStorage.getItem(VISION_OPERATIONAL_RELEASE_HISTORY_STORAGE_KEY);
        return value
            ? parseVisionOperationalReleaseHistory(value)
            : {
                schemaVersion: 'vision-operational-release-history/v1',
                updatedAt: '',
                entries: []
            };
    } catch {
        return {
            schemaVersion: 'vision-operational-release-history/v1',
            updatedAt: '',
            entries: []
        };
    }
};

export const saveVisionOperationalReleaseHistory = (
    history: VisionOperationalReleaseHistory
): void => {
    try {
        localStorage.setItem(
            VISION_OPERATIONAL_RELEASE_HISTORY_STORAGE_KEY,
            JSON.stringify(history)
        );
    } catch {
        // Storage may be unavailable in hardened renderer or test environments.
    }
};

export const recordVisionOperationalReleaseHistory = (
    report: VisionOperationalReleaseReport,
    recordedAt = new Date().toISOString()
): VisionOperationalReleaseHistory => {
    const history = upsertVisionOperationalReleaseHistory(
        readVisionOperationalReleaseHistory(),
        report,
        recordedAt
    );
    saveVisionOperationalReleaseHistory(history);
    return history;
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

export const clearVisionOperationalReleaseHistory = (): void => {
    try {
        localStorage.removeItem(VISION_OPERATIONAL_RELEASE_HISTORY_STORAGE_KEY);
    } catch {
        // Storage may be unavailable in hardened renderer or test environments.
    }
};
