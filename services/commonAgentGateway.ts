import {
    AiOrchestrationMode,
    DefectAnalysis,
    RetrievalMode,
    CaptureImageKind,
    CaptureSource,
    CaptureViewTag,
    VisionDecisionStatus,
    VisionImageQualityReport,
    VisionReferenceBenchmarkGateMode,
    VisionRuntimeVersionSnapshot,
    VisionClassifierSummary
} from '../types';
import { analyzeMoldDefect } from './aiService';
import { streamChatResponse } from './aiService';
import { CommonAgentApiService } from './commonAgentApiService';
import { MultimodalDiagnosisContext } from './diagnosisContextService';
import { getRuntimeConfig } from './runtimeConfig';

export const DIAGNOSIS_COMPARISON_STORAGE_KEY = 'mold-master-ai:diagnosis-comparisons:v1';
const MAX_COMPARISON_RECORDS = 50;

export interface DiagnosisCandidate {
    source: 'common_agent' | 'legacy';
    analysis: DefectAnalysis;
    commonAgentImageId?: string;
    commonAgentImageIdsByLocalId?: Record<string, string>;
    durationMs?: number;
}

export interface DiagnosisComparisonRecord {
    id: string;
    imageId: string;
    createdAt: string;
    strategy: AiOrchestrationMode;
    selectedSource: DiagnosisCandidate['source'];
    fallbackUsed: boolean;
    commonAgentSuccess: boolean;
    legacySuccess: boolean;
    commonAgentDurationMs?: number;
    legacyDurationMs?: number;
    defectTypeAgreement?: boolean;
    commonAgentClassifiable?: boolean;
    legacyClassifiable?: boolean;
    contextProvided?: boolean;
    annotationCount?: number;
    roiCount?: number;
    ocrProvided?: boolean;
    commonAgentDefectType?: string;
    legacyDefectType?: string;
    commonAgentError?: string;
    legacyError?: string;
    retrievalMode?: RetrievalMode;
    evidenceCount?: number;
    graphGrounded?: boolean;
    llmSupplemented?: boolean;
    visionGraphConflict?: boolean;
    graphAutoFinalizeAllowed?: boolean;
    graphApprovedPathCount?: number;
    graphCitationCount?: number;
    visionClassifierStatus?: VisionClassifierSummary['status'];
    visionClassifierAgreementWithVisionTop1?: boolean | null;
    visionClassifierTopCandidate?: string;
    visionClassifierReferenceCount?: number;
    visionClassifierMinimumReferenceSupport?: number;
    llmSupplementTrainingEligible?: boolean;
    visionQualityStatus?: VisionImageQualityReport['status'];
    visionQualityScore?: number;
    visionQualityIssueCodes?: string[];
    visionDecisionStatus?: VisionDecisionStatus;
    visionCandidateCount?: number;
    visionViewCount?: number;
    visionDisagreementScore?: number;
    visionFusionDecisionReason?: string;
    selectionReason?: 'strategy_default' | 'richer_vision_contract';
    commonAgentVersionSnapshot?: VisionRuntimeVersionSnapshot;
    legacyVersionSnapshot?: VisionRuntimeVersionSnapshot;
}

export interface DiagnosisGatewayResult {
    analysis: DefectAnalysis;
    source: DiagnosisCandidate['source'];
    commonAgentImageId?: string;
    commonAgentImageIdsByLocalId?: Record<string, string>;
    comparison: DiagnosisComparisonRecord;
}

export interface DiagnosisSessionImage {
    imageId: string;
    dataUrl: string;
    fileName?: string;
    captureViewTag: CaptureViewTag;
    captureImageKind: CaptureImageKind;
    captureSource: CaptureSource;
    isPrimary: boolean;
    visionQuality?: VisionImageQualityReport;
}

export interface DiagnosisTransitionReadiness {
    total: number;
    commonAgentSuccessRate: number;
    legacySuccessRate: number;
    fallbackRate: number;
    agreementRate: number;
    comparableCount: number;
    classifiableCount: number;
    classifiableRate: number;
    readyForCommonAgentPrimary: boolean;
}

export interface DiagnosisLatencySummary {
    sampleCount: number;
    p50: number;
    p95: number;
    average: number;
}

export interface DiagnosisFailureReason {
    source: DiagnosisCandidate['source'];
    message: string;
    count: number;
    lastSeenAt: string;
}

export interface DiagnosisObservabilityAction {
    code:
        | 'review_classifier_disagreement'
        | 'collect_classifier_references'
        | 'maintain_classifier_shadow_gate';
    severity: 'info' | 'warning';
    message: string;
}

export interface DiagnosisObservability {
    total: number;
    commonAgentLatencyMs: DiagnosisLatencySummary;
    legacyLatencyMs: DiagnosisLatencySummary;
    commonAgentFailures: number;
    legacyFailures: number;
    graphGroundedRate: number;
    llmSupplementedRate: number;
    graphCitationCoverageRate: number;
    visionGraphConflictRate: number;
    graphAutoFinalizeRate: number;
    averageApprovedGraphPaths: number;
    visionClassifierAgreementRate: number;
    visionClassifierDisagreementRate: number;
    visionClassifierInsufficientReferenceRate: number;
    averageClassifierReferenceCount: number;
    visionClassifierRecommendedActions: DiagnosisObservabilityAction[];
    ungroundedLlmTrainingLeakCount: number;
    averageEvidenceCount: number;
    contextProvidedRate: number;
    roiContextRate: number;
    ocrContextRate: number;
    selectedSources: Record<DiagnosisCandidate['source'], number>;
    retrievalModes: Record<RetrievalMode, number>;
    metricSamples: {
        graphGrounded: number;
        llmSupplemented: number;
        graphValidation: number;
        visionClassifier: number;
        evidence: number;
        contextProvided: number;
        roiContext: number;
        ocrContext: number;
    };
    failureReasons: DiagnosisFailureReason[];
    latestRecordAt?: string;
}

export interface CommonAgentChatResult {
    text: string;
    source: 'common_agent' | 'legacy';
    fallbackUsed: boolean;
}

interface DiagnosisExecution {
    selected: DiagnosisCandidate;
    commonAgent?: DiagnosisCandidate;
    legacy?: DiagnosisCandidate;
    commonAgentError?: string;
    legacyError?: string;
    fallbackUsed: boolean;
}

export interface VisionReferenceBenchmarkGateResult {
    mode: VisionReferenceBenchmarkGateMode;
    checked: boolean;
    ready: boolean;
    failedChecks: string[];
    embeddingModelVersion?: string;
    embeddingProvider?: string;
    embeddingModelName?: string;
    embeddingDimensions?: number;
    embeddingDevice?: string;
    embeddingRuntime?: string;
    embeddingProductionReady?: boolean;
    message?: string;
}

export const selectValidatedDiagnosis = (
    execution: DiagnosisExecution
): {
    candidate: DiagnosisCandidate;
    reason: 'strategy_default' | 'richer_vision_contract';
} => {
    const commonAgentCandidates =
        execution.commonAgent?.analysis.visionSummary?.candidates.length || 0;
    const legacyCandidates =
        execution.legacy?.analysis.visionSummary?.candidates.length || 0;
    if (
        execution.selected.source === 'common_agent'
        && execution.legacy
        && commonAgentCandidates < 2
        && legacyCandidates >= 2
    ) {
        return {
            candidate: execution.legacy,
            reason: 'richer_vision_contract'
        };
    }
    return {
        candidate: execution.selected,
        reason: 'strategy_default'
    };
};

const normalizeText = (value?: string): string =>
    (value || '').toLocaleLowerCase().replace(/[\s()[\]{}_\-.,:;/'"]/g, '');

export const isUsableDefectType = (value?: string): boolean => {
    const normalized = normalizeText(value);
    if (!normalized) return false;
    return ![
        'commonagentdiagnosis',
        'unknown',
        'unclassified',
        '판정불가',
        '미정',
        '불분명',
        '확인불가'
    ].some(marker => normalized.includes(marker));
};

export const defectTypesAgree = (left?: string, right?: string): boolean => {
    const normalizedLeft = normalizeText(left);
    const normalizedRight = normalizeText(right);
    if (!normalizedLeft || !normalizedRight) return false;
    return normalizedLeft === normalizedRight
        || normalizedLeft.includes(normalizedRight)
        || normalizedRight.includes(normalizedLeft);
};

const errorMessage = (error: unknown): string =>
    error instanceof Error ? error.message : String(error);

const runTimed = async (executor: () => Promise<DiagnosisCandidate>): Promise<DiagnosisCandidate> => {
    const startedAt = performance.now();
    const result = await executor();
    return { ...result, durationMs: Math.round(performance.now() - startedAt) };
};

const benchmarkGateMessage = (
    failedChecks: string[],
    evaluatedCount?: number
): string => [
    'Common Agent Vision reference benchmark gate failed.',
    failedChecks.length > 0 ? `failed=${failedChecks.join(',')}` : '',
    typeof evaluatedCount === 'number' ? `evaluated=${evaluatedCount}` : ''
].filter(Boolean).join(' ');

export const assertVisionReferenceBenchmarkReady = async (
    config: Awaited<ReturnType<typeof getRuntimeConfig>>
): Promise<VisionReferenceBenchmarkGateResult> => {
    const mode = config?.visionReferenceBenchmarkGateMode || 'off';
    if (mode === 'off') {
        return {
            mode,
            checked: false,
            ready: true,
            failedChecks: []
        };
    }
    if (!config?.visionReferenceBenchmarkModelVersion) {
        const message = 'Common Agent Vision reference benchmark model version is not configured.';
        if (mode === 'enforce') throw new Error(message);
        console.warn(`[CommonAgentGateway] ${message}`);
        return {
            mode,
            checked: false,
            ready: false,
            failedChecks: ['modelVersionMissing'],
            message
        };
    }

    const report = await CommonAgentApiService.benchmarkCurrentVisionReferences({
        embedding_model_version: config.visionReferenceBenchmarkModelVersion,
        minimum_samples: config.visionReferenceBenchmarkMinimumSamples,
        required_defect_types: config.visionReferenceBenchmarkRequiredDefectTypes,
        minimum_samples_per_class: config.visionReferenceBenchmarkMinimumSamplesPerClass,
        minimum_top1_accuracy: config.visionReferenceBenchmarkMinimumTop1Accuracy,
        minimum_top3_accuracy: config.visionReferenceBenchmarkMinimumTop3Accuracy
    });
    if (report.ready_for_graph_retrieval) {
        return {
            mode,
            checked: true,
            ready: true,
            failedChecks: [],
            embeddingModelVersion: report.embedding_model_version,
            embeddingProvider: report.embedding_provider || undefined,
            embeddingModelName: report.embedding_model_name || undefined,
            embeddingDimensions: report.embedding_dimensions || undefined,
            embeddingDevice: report.embedding_device || undefined,
            embeddingRuntime: report.embedding_runtime || undefined,
            embeddingProductionReady: report.embedding_production_ready ?? undefined
        };
    }

    const message = benchmarkGateMessage(
        report.failed_gate_checks || [],
        report.evaluated_count
    );
    if (mode === 'enforce') throw new Error(message);
    console.warn(`[CommonAgentGateway] ${message}`);
    return {
        mode,
        checked: true,
        ready: false,
        failedChecks: report.failed_gate_checks || [],
        embeddingModelVersion: report.embedding_model_version,
        embeddingProvider: report.embedding_provider || undefined,
        embeddingModelName: report.embedding_model_name || undefined,
        embeddingDimensions: report.embedding_dimensions || undefined,
        embeddingDevice: report.embedding_device || undefined,
        embeddingRuntime: report.embedding_runtime || undefined,
        embeddingProductionReady: report.embedding_production_ready ?? undefined,
        message
    };
};

export const executeDiagnosisStrategy = async (
    strategy: AiOrchestrationMode,
    runCommonAgent: () => Promise<DiagnosisCandidate>,
    runLegacy: () => Promise<DiagnosisCandidate>
): Promise<DiagnosisExecution> => {
    if (strategy === 'legacy') {
        const legacy = await runTimed(runLegacy);
        return { selected: legacy, legacy, fallbackUsed: false };
    }

    if (strategy === 'common_agent_primary') {
        try {
            const commonAgent = await runTimed(runCommonAgent);
            return { selected: commonAgent, commonAgent, fallbackUsed: false };
        } catch (commonAgentError) {
            try {
                const legacy = await runTimed(runLegacy);
                return {
                    selected: legacy,
                    legacy,
                    commonAgentError: errorMessage(commonAgentError),
                    fallbackUsed: true
                };
            } catch (legacyError) {
                throw new Error(
                    `Common Agent와 기존 AI 진단이 모두 실패했습니다. `
                    + `Common Agent: ${errorMessage(commonAgentError)} / 기존 AI: ${errorMessage(legacyError)}`
                );
            }
        }
    }

    const [commonAgentResult, legacyResult] = await Promise.allSettled([
        runTimed(runCommonAgent),
        runTimed(runLegacy)
    ]);
    const commonAgent = commonAgentResult.status === 'fulfilled' ? commonAgentResult.value : undefined;
    const legacy = legacyResult.status === 'fulfilled' ? legacyResult.value : undefined;

    if (!commonAgent && !legacy) {
        throw new Error(
            `Common Agent와 기존 AI 진단이 모두 실패했습니다. `
            + `Common Agent: ${errorMessage((commonAgentResult as PromiseRejectedResult).reason)} / `
            + `기존 AI: ${errorMessage((legacyResult as PromiseRejectedResult).reason)}`
        );
    }

    return {
        selected: commonAgent || legacy!,
        commonAgent,
        legacy,
        commonAgentError: commonAgentResult.status === 'rejected' ? errorMessage(commonAgentResult.reason) : undefined,
        legacyError: legacyResult.status === 'rejected' ? errorMessage(legacyResult.reason) : undefined,
        fallbackUsed: !commonAgent && Boolean(legacy)
    };
};

const dataUrlToFile = (dataUrl: string, fileName: string): File => {
    const [header, payload] = dataUrl.split(',', 2);
    if (!header || !payload) throw new Error('진단 이미지 데이터 형식이 올바르지 않습니다.');
    const mimeType = header.match(/^data:([^;]+);base64$/)?.[1] || 'image/png';
    const binary = atob(payload);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    return new File([bytes], fileName, { type: mimeType });
};

const isVisionClassifiable = (analysis?: DefectAnalysis): boolean => Boolean(
    analysis
    && isUsableDefectType(analysis.defectType)
    && (!analysis.visionSummary || analysis.visionSummary.decisionStatus === 'probable')
);

const persistComparison = (record: DiagnosisComparisonRecord): void => {
    try {
        const previous = JSON.parse(localStorage.getItem(DIAGNOSIS_COMPARISON_STORAGE_KEY) || '[]');
        const records = Array.isArray(previous) ? previous : [];
        localStorage.setItem(
            DIAGNOSIS_COMPARISON_STORAGE_KEY,
            JSON.stringify([record, ...records].slice(0, MAX_COMPARISON_RECORDS))
        );
    } catch (error) {
        console.warn('[CommonAgentGateway] Failed to persist comparison telemetry:', error);
    }
};

export const readDiagnosisComparisons = (): DiagnosisComparisonRecord[] => {
    try {
        const records = JSON.parse(localStorage.getItem(DIAGNOSIS_COMPARISON_STORAGE_KEY) || '[]');
        return Array.isArray(records) ? records : [];
    } catch {
        return [];
    }
};

export const clearDiagnosisComparisons = (): void => {
    try {
        localStorage.removeItem(DIAGNOSIS_COMPARISON_STORAGE_KEY);
    } catch {
        // Storage can be unavailable in hardened renderer environments.
    }
};

export const calculateTransitionReadiness = (
    records: DiagnosisComparisonRecord[],
    minimumSamples = 20
): DiagnosisTransitionReadiness => {
    const total = records.length;
    const comparable = records.filter(record =>
        record.commonAgentSuccess
        && record.legacySuccess
        && record.defectTypeAgreement !== undefined
        && (!record.commonAgentDefectType || isUsableDefectType(record.commonAgentDefectType))
        && (!record.legacyDefectType || isUsableDefectType(record.legacyDefectType))
    );
    const rate = (count: number, denominator = total): number =>
        denominator > 0 ? Math.round((count / denominator) * 1000) / 10 : 0;
    const commonAgentSuccessRate = rate(records.filter(record => record.commonAgentSuccess).length);
    const legacySuccessRate = rate(records.filter(record => record.legacySuccess).length);
    const fallbackRate = rate(records.filter(record => record.fallbackUsed).length);
    const classifiable = records.filter(record =>
        record.commonAgentSuccess
        && (record.commonAgentClassifiable ?? isUsableDefectType(record.commonAgentDefectType))
    );
    const agreementRate = rate(
        comparable.filter(record =>
            record.commonAgentDefectType && record.legacyDefectType
                ? defectTypesAgree(record.commonAgentDefectType, record.legacyDefectType)
                : record.defectTypeAgreement
        ).length,
        comparable.length
    );

    return {
        total,
        commonAgentSuccessRate,
        legacySuccessRate,
        fallbackRate,
        agreementRate,
        comparableCount: comparable.length,
        classifiableCount: classifiable.length,
        classifiableRate: rate(classifiable.length),
        readyForCommonAgentPrimary: total >= minimumSamples
            && commonAgentSuccessRate >= 95
            && fallbackRate <= 5
            && classifiable.length >= minimumSamples
            && comparable.length >= minimumSamples
            && agreementRate >= 80
    };
};

const roundedRate = (count: number, total: number): number =>
    total > 0 ? Math.round((count / total) * 1000) / 10 : 0;

const roundedAverage = (values: number[]): number =>
    values.length > 0
        ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10
        : 0;

const percentileNearestRank = (values: number[], percentile: number): number => {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((left, right) => left - right);
    const index = Math.max(0, Math.ceil(percentile * sorted.length) - 1);
    return sorted[index];
};

const summarizeLatency = (values: Array<number | undefined>): DiagnosisLatencySummary => {
    const valid = values.filter((value): value is number =>
        typeof value === 'number' && Number.isFinite(value) && value >= 0
    );
    return {
        sampleCount: valid.length,
        p50: percentileNearestRank(valid, 0.5),
        p95: percentileNearestRank(valid, 0.95),
        average: roundedAverage(valid)
    };
};

const compactFailureMessage = (value: string): string => {
    const compact = value.replace(/\s+/g, ' ').trim();
    return compact.length <= 160 ? compact : `${compact.slice(0, 159).trim()}…`;
};

const buildVisionClassifierRecommendedActions = ({
    sampleCount,
    agreementRate,
    disagreementRate,
    insufficientReferenceRate,
    averageReferenceCount
}: {
    sampleCount: number;
    agreementRate: number;
    disagreementRate: number;
    insufficientReferenceRate: number;
    averageReferenceCount: number;
}): DiagnosisObservabilityAction[] => {
    if (sampleCount === 0) return [];
    const actions: DiagnosisObservabilityAction[] = [];
    if (disagreementRate > 0) {
        actions.push({
            code: 'review_classifier_disagreement',
            severity: 'warning',
            message: `Classifier 불일치 ${disagreementRate}%: 촬영 프로토콜, ROI 품질, 라벨 taxonomy alias를 우선 검토하세요.`
        });
    }
    if (insufficientReferenceRate > 0) {
        actions.push({
            code: 'collect_classifier_references',
            severity: 'warning',
            message: `Classifier 참조 부족 ${insufficientReferenceRate}%: 부족 결함군의 승인 이미지를 추가 수집하고 reference store를 refresh하세요.`
        });
    }
    if (actions.length === 0 && agreementRate >= 80 && averageReferenceCount >= 3) {
        actions.push({
            code: 'maintain_classifier_shadow_gate',
            severity: 'info',
            message: `Classifier 합의율 ${agreementRate}%: Shadow 기록을 유지하며 운영 릴리스 게이트 기준 충족 여부를 확인하세요.`
        });
    }
    return actions;
};

export const calculateDiagnosisObservability = (
    records: DiagnosisComparisonRecord[]
): DiagnosisObservability => {
    const total = records.length;
    const selectedSources: DiagnosisObservability['selectedSources'] = {
        common_agent: 0,
        legacy: 0
    };
    const retrievalModes: DiagnosisObservability['retrievalModes'] = {
        direct: 0,
        local_rag: 0,
        remote_rag: 0,
        hybrid: 0,
        graph_only: 0
    };
    const failures = new Map<string, DiagnosisFailureReason>();
    const graphMeasured = records.filter(record => typeof record.graphGrounded === 'boolean');
    const llmMeasured = records.filter(record => typeof record.llmSupplemented === 'boolean');
    const graphValidationMeasured = records.filter(record =>
        typeof record.graphAutoFinalizeAllowed === 'boolean'
    );
    const conflictMeasured = records.filter(record =>
        typeof record.visionGraphConflict === 'boolean'
    );
    const approvedPathMeasured = records.filter(record =>
        typeof record.graphApprovedPathCount === 'number'
        && Number.isFinite(record.graphApprovedPathCount)
    );
    const classifierMeasured = records.filter(record =>
        typeof record.visionClassifierStatus === 'string'
    );
    const classifierReferenceMeasured = records.filter(record =>
        typeof record.visionClassifierReferenceCount === 'number'
        && Number.isFinite(record.visionClassifierReferenceCount)
    );
    const groundedRecords = graphMeasured.filter(record => record.graphGrounded === true);
    const evidenceMeasured = records.filter(record =>
        typeof record.evidenceCount === 'number' && Number.isFinite(record.evidenceCount)
    );
    const contextMeasured = records.filter(record => typeof record.contextProvided === 'boolean');
    const roiMeasured = records.filter(record => typeof record.roiCount === 'number');
    const ocrMeasured = records.filter(record => typeof record.ocrProvided === 'boolean');
    const visionClassifierAgreementRate = roundedRate(
        classifierMeasured.filter(record => record.visionClassifierStatus === 'agreed').length,
        classifierMeasured.length
    );
    const visionClassifierDisagreementRate = roundedRate(
        classifierMeasured.filter(record => record.visionClassifierStatus === 'disagreed').length,
        classifierMeasured.length
    );
    const visionClassifierInsufficientReferenceRate = roundedRate(
        classifierMeasured.filter(record => record.visionClassifierStatus === 'insufficient_reference').length,
        classifierMeasured.length
    );
    const averageClassifierReferenceCount = roundedAverage(
        classifierReferenceMeasured.map(record => record.visionClassifierReferenceCount!)
    );

    for (const record of records) {
        selectedSources[record.selectedSource] += 1;
        if (record.retrievalMode) retrievalModes[record.retrievalMode] += 1;

        const entries: Array<[DiagnosisCandidate['source'], string | undefined]> = [
            ['common_agent', record.commonAgentError],
            ['legacy', record.legacyError]
        ];
        for (const [source, rawMessage] of entries) {
            if (!rawMessage) continue;
            const message = compactFailureMessage(rawMessage);
            const key = `${source}:${message}`;
            const previous = failures.get(key);
            failures.set(key, {
                source,
                message,
                count: (previous?.count || 0) + 1,
                lastSeenAt: !previous || record.createdAt > previous.lastSeenAt
                    ? record.createdAt
                    : previous.lastSeenAt
            });
        }
    }

    return {
        total,
        commonAgentLatencyMs: summarizeLatency(records.map(record => record.commonAgentDurationMs)),
        legacyLatencyMs: summarizeLatency(records.map(record => record.legacyDurationMs)),
        commonAgentFailures: records.filter(record => Boolean(record.commonAgentError)).length,
        legacyFailures: records.filter(record => Boolean(record.legacyError)).length,
        graphGroundedRate: roundedRate(
            graphMeasured.filter(record => record.graphGrounded === true).length,
            graphMeasured.length
        ),
        llmSupplementedRate: roundedRate(
            llmMeasured.filter(record => record.llmSupplemented === true).length,
            llmMeasured.length
        ),
        graphCitationCoverageRate: roundedRate(
            groundedRecords.filter(record => (record.graphCitationCount || 0) > 0).length,
            groundedRecords.length
        ),
        visionGraphConflictRate: roundedRate(
            conflictMeasured.filter(record => record.visionGraphConflict === true).length,
            conflictMeasured.length
        ),
        graphAutoFinalizeRate: roundedRate(
            graphValidationMeasured.filter(record => record.graphAutoFinalizeAllowed === true).length,
            graphValidationMeasured.length
        ),
        averageApprovedGraphPaths: roundedAverage(
            approvedPathMeasured.map(record => record.graphApprovedPathCount!)
        ),
        visionClassifierAgreementRate,
        visionClassifierDisagreementRate,
        visionClassifierInsufficientReferenceRate,
        averageClassifierReferenceCount,
        visionClassifierRecommendedActions: buildVisionClassifierRecommendedActions({
            sampleCount: classifierMeasured.length,
            agreementRate: visionClassifierAgreementRate,
            disagreementRate: visionClassifierDisagreementRate,
            insufficientReferenceRate: visionClassifierInsufficientReferenceRate,
            averageReferenceCount: averageClassifierReferenceCount
        }),
        ungroundedLlmTrainingLeakCount: records.filter(record =>
            record.graphGrounded === false
            && record.llmSupplemented === true
            && record.llmSupplementTrainingEligible === true
        ).length,
        averageEvidenceCount: roundedAverage(evidenceMeasured.map(record => record.evidenceCount!)),
        contextProvidedRate: roundedRate(
            contextMeasured.filter(record => record.contextProvided === true).length,
            contextMeasured.length
        ),
        roiContextRate: roundedRate(
            roiMeasured.filter(record => (record.roiCount || 0) > 0).length,
            roiMeasured.length
        ),
        ocrContextRate: roundedRate(
            ocrMeasured.filter(record => record.ocrProvided === true).length,
            ocrMeasured.length
        ),
        selectedSources,
        retrievalModes,
        metricSamples: {
            graphGrounded: graphMeasured.length,
            llmSupplemented: llmMeasured.length,
            graphValidation: graphValidationMeasured.length,
            visionClassifier: classifierMeasured.length,
            evidence: evidenceMeasured.length,
            contextProvided: contextMeasured.length,
            roiContext: roiMeasured.length,
            ocrContext: ocrMeasured.length
        },
        failureReasons: [...failures.values()].sort((left, right) =>
            right.count - left.count || right.lastSeenAt.localeCompare(left.lastSeenAt)
        ),
        latestRecordAt: records
            .map(record => record.createdAt)
            .filter(Boolean)
            .sort()
            .at(-1)
    };
};

export class CommonAgentGateway {
    static async diagnoseImage(options: {
        imageId: string;
        dataUrl: string;
        fileName?: string;
        retrievalMode?: RetrievalMode;
        strategy?: AiOrchestrationMode;
        diagnosisContext?: MultimodalDiagnosisContext;
        visionQuality?: VisionImageQualityReport;
        sessionImages?: DiagnosisSessionImage[];
    }): Promise<DiagnosisGatewayResult> {
        const config = await getRuntimeConfig();
        const strategy = options.strategy || config?.aiOrchestrationMode || 'dual_validation';
        const retrievalMode = options.retrievalMode || 'hybrid';
        const fileName = options.fileName || `${options.imageId}.png`;

        const execution = await executeDiagnosisStrategy(
            strategy,
            async () => {
                await assertVisionReferenceBenchmarkReady(config);
                const sessionViews = (options.sessionImages || [])
                    .filter(item => !item.isPrimary && item.imageId !== options.imageId)
                    .map(item => ({
                        file: dataUrlToFile(
                            item.dataUrl,
                            item.fileName || `${item.imageId}.png`
                        ),
                        localImageId: item.imageId,
                        captureViewTag: item.captureViewTag,
                        imageKind: item.captureImageKind,
                        captureSource: item.captureSource
                    }));
                const response = await CommonAgentApiService.diagnoseImage(
                    dataUrlToFile(options.dataUrl, fileName),
                    {
                        question: options.diagnosisContext?.question,
                        sourceSystem: 'mold-master-ai',
                        processArea: 'injection-molding',
                        persistMode: 'classifiable_only',
                        sessionViews,
                        sessionId: typeof options.diagnosisContext?.metadata.capture_session_id === 'string'
                            ? options.diagnosisContext.metadata.capture_session_id
                            : undefined,
                        metadata: {
                            local_image_id: options.imageId,
                            retrieval_mode: retrievalMode,
                            orchestration_strategy: strategy,
                            vision_quality_status: options.visionQuality?.status,
                            vision_quality_score: options.visionQuality?.score,
                            vision_quality_issue_codes: options.visionQuality?.issues.map(issue => issue.code),
                            multiview_requested: sessionViews.length > 0,
                            multiview_view_count: sessionViews.length + 1,
                            multiview_view_tags: (options.sessionImages || [])
                                .map(item => item.captureViewTag),
                            ...options.diagnosisContext?.metadata
                        }
                    }
                );
                return {
                    source: 'common_agent',
                    analysis: CommonAgentApiService.toDefectAnalysis(response, retrievalMode),
                    commonAgentImageId: response.metadata?.persisted_to_dataset === false
                        ? undefined
                        : response.image_id,
                    commonAgentImageIdsByLocalId: Object.fromEntries(
                        (response.view_observations || [])
                            .filter(item => item.local_image_id && item.image_id)
                            .map(item => [item.local_image_id as string, item.image_id as string])
                    )
                };
            },
            async () => ({
                source: 'legacy',
                analysis: await analyzeMoldDefect(
                    options.dataUrl.split(',')[1],
                    retrievalMode,
                    options.diagnosisContext?.question
                )
            })
        );
        const validatedSelection = selectValidatedDiagnosis(execution);
        const selectedCandidate = validatedSelection.candidate;

        const commonAgentDefectType = execution.commonAgent?.analysis.defectType;
        const legacyDefectType = execution.legacy?.analysis.defectType;
        const defectTypeAgreement = execution.commonAgent && execution.legacy
            && isUsableDefectType(commonAgentDefectType)
            && isUsableDefectType(legacyDefectType)
            ? defectTypesAgree(
                commonAgentDefectType,
                legacyDefectType
            )
            : undefined;
        const selectedAnalysis = defectTypeAgreement === false && selectedCandidate.analysis.visionSummary
            ? {
                ...selectedCandidate.analysis,
                visionSummary: {
                    ...selectedCandidate.analysis.visionSummary,
                    decisionStatus: 'needs_review' as const,
                    decisionReason: 'dual_model_disagreement'
                }
            }
            : selectedCandidate.analysis;
        const classifierSummary = selectedAnalysis.visionSummary?.classifierSummary;
        const comparisonId = `comparison-${options.imageId}-${Date.now()}`;
        const comparison: DiagnosisComparisonRecord = {
            id: comparisonId,
            imageId: options.imageId,
            createdAt: new Date().toISOString(),
            strategy,
            selectedSource: selectedCandidate.source,
            fallbackUsed: execution.fallbackUsed,
            commonAgentSuccess: Boolean(execution.commonAgent),
            legacySuccess: Boolean(execution.legacy),
            commonAgentDurationMs: execution.commonAgent?.durationMs,
            legacyDurationMs: execution.legacy?.durationMs,
            defectTypeAgreement,
            commonAgentClassifiable: isVisionClassifiable(execution.commonAgent?.analysis),
            legacyClassifiable: isVisionClassifiable(execution.legacy?.analysis),
            contextProvided: options.diagnosisContext?.metadata.context_provided || false,
            annotationCount: options.diagnosisContext?.metadata.annotation_count || 0,
            roiCount: options.diagnosisContext?.metadata.roi_count || 0,
            ocrProvided: options.diagnosisContext?.metadata.ocr_provided || false,
            commonAgentDefectType,
            legacyDefectType,
            commonAgentError: execution.commonAgentError,
            legacyError: execution.legacyError,
            retrievalMode,
            evidenceCount: selectedAnalysis.retrievalSummary?.evidenceCount || 0,
            graphGrounded: selectedAnalysis.retrievalSummary?.graphGrounded === true,
            llmSupplemented: selectedAnalysis.retrievalSummary?.llmSupplemented === true,
            visionGraphConflict: selectedAnalysis.retrievalSummary?.graphValidation?.visionGraphConflict,
            graphAutoFinalizeAllowed: selectedAnalysis.retrievalSummary?.graphValidation?.autoFinalizeAllowed,
            graphApprovedPathCount: selectedAnalysis.retrievalSummary?.graphValidation?.approvedPathCount,
            graphCitationCount: selectedAnalysis.retrievalSummary?.graphValidation?.citationCount,
            visionClassifierStatus: classifierSummary?.status,
            visionClassifierAgreementWithVisionTop1: classifierSummary?.agreementWithVisionTop1,
            visionClassifierTopCandidate: classifierSummary?.topCandidate?.defectType,
            visionClassifierReferenceCount: classifierSummary?.topCandidate?.referenceCount,
            visionClassifierMinimumReferenceSupport: classifierSummary?.minimumReferenceSupport,
            llmSupplementTrainingEligible: selectedAnalysis.retrievalSummary?.graphValidation?.llmSupplementTrainingEligible,
            visionQualityStatus: options.visionQuality?.status,
            visionQualityScore: options.visionQuality?.score,
            visionQualityIssueCodes: options.visionQuality?.issues.map(issue => issue.code),
            visionDecisionStatus: selectedAnalysis.visionSummary?.decisionStatus,
            visionCandidateCount: selectedAnalysis.visionSummary?.candidates.length,
            visionViewCount: selectedAnalysis.visionSummary?.fusionSummary?.validViewCount,
            visionDisagreementScore: selectedAnalysis.visionSummary?.fusionSummary?.disagreementScore,
            visionFusionDecisionReason: selectedAnalysis.visionSummary?.fusionSummary?.decisionReason,
            selectionReason: validatedSelection.reason,
            commonAgentVersionSnapshot:
                execution.commonAgent?.analysis.retrievalSummary?.runtimeVersions,
            legacyVersionSnapshot:
                execution.legacy?.analysis.retrievalSummary?.runtimeVersions
        };
        persistComparison(comparison);

        return {
            analysis: {
                ...selectedAnalysis,
                orchestrationSummary: {
                    strategy,
                    selectedSource: selectedCandidate.source,
                    fallbackUsed: execution.fallbackUsed,
                    selectionReason: validatedSelection.reason,
                    comparisonId,
                    defectTypeAgreement
                }
            },
            source: selectedCandidate.source,
            commonAgentImageId: execution.commonAgent?.commonAgentImageId,
            commonAgentImageIdsByLocalId: execution.commonAgent?.commonAgentImageIdsByLocalId,
            comparison
        };
    }

    static async askQuestion(options: {
        messages: Array<{ role: 'user' | 'model'; text: string }>;
        useKnowledge: boolean;
        retrievalMode: RetrievalMode;
        sessionId: string;
    }): Promise<CommonAgentChatResult> {
        const config = await getRuntimeConfig();
        const strategy = config?.aiOrchestrationMode || 'dual_validation';

        const runLegacy = async (): Promise<CommonAgentChatResult> => {
            let text = '';
            await streamChatResponse(
                options.messages,
                options.useKnowledge,
                chunk => { text += chunk; },
                options.useKnowledge ? options.retrievalMode : 'direct'
            );
            return { text, source: 'legacy', fallbackUsed: strategy !== 'legacy' };
        };

        if (strategy === 'legacy') return await runLegacy();

        try {
            const question = options.messages[options.messages.length - 1]?.text || '';
            const response = await CommonAgentApiService.askKnowledge(question, {
                topK: options.retrievalMode === 'graph_only' ? 5 : 6,
                category: options.retrievalMode === 'graph_only' ? undefined : 'mold-master',
                sessionId: options.sessionId,
                includeRag: options.useKnowledge,
                evidencePolicy: options.retrievalMode === 'graph_only'
                    ? 'graph_approved_only'
                    : 'balanced'
            });
            const citations = Array.from(new Set(
                (response.evidence || [])
                    .map(item => item.source_ref || item.node_id || '')
                    .filter(Boolean)
            ));
            const trace = response.reasoning_trace || [];
            const parts = [
                `[COMMON AGENT | Confidence ${Math.round((response.confidence || 0) * 100)}% | Evidence ${(response.evidence || []).length}]`,
                response.answer || '응답을 생성하지 못했습니다.',
                trace.length > 0 ? `---\nGraph / Retrieval Trace\n${trace.map((item, index) => `${index + 1}. ${item}`).join('\n')}` : '',
                options.useKnowledge
                    ? `---\n근거\n${citations.length > 0
                        ? citations.map(item => `- ${item}`).join('\n')
                        : '- Common Agent가 연결된 승인 근거를 반환하지 않았습니다. 일반 추론으로만 참고하세요.'}`
                    : ''
            ].filter(Boolean);
            return {
                text: parts.join('\n\n'),
                source: 'common_agent',
                fallbackUsed: false
            };
        } catch (error) {
            console.warn('[CommonAgentGateway] Chat fallback to legacy:', error);
            return await runLegacy();
        }
    }
}
