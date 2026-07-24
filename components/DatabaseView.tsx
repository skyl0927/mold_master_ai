import React, { useEffect, useState } from 'react';
import {
    DBStats,
    LocalVisionCandidate,
    LocalVisionCandidateScan,
    UserFeedbackData,
    VisionBenchmarkRunResult,
    VisionLabelSuggestion
} from '../types';
import {
    CommonAgentApiService,
    type CommonAgentImageReviewRequest
} from '../services/commonAgentApiService';
import {
    calculateVisionDatasetReadiness,
    VisionDatasetItem,
    VisionDatasetReadiness
} from '../services/visionDatasetReadinessService';
import {
    DEFECT_CLASS_LABELS,
    canonicalDefectClass
} from '../shared/defect-taxonomy';
import {
    buildLocalCandidateReviewRequest,
    resolveLocalCandidateApproval
} from '../localVisionApproval';
import { buildVisionReviewQueue } from '../visionReviewQueue';
import WebKnowledgeReviewPanel from './WebKnowledgeReviewPanel';

interface DatabaseViewProps {
    stats: DBStats | null;
    onClose: () => void;
}

type DatabaseTab = 'common-agent' | 'web-knowledge' | 'stats' | 'legacy';

const statusBadgeClass = (status?: string) => {
    if (status === 'approved') return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300';
    if (status === 'rejected') return 'border-red-500/40 bg-red-500/10 text-red-300';
    if (status === 'needs_review') return 'border-orange-500/40 bg-orange-500/10 text-orange-300';
    return 'border-amber-500/40 bg-amber-500/10 text-amber-300';
};

const reviewBucketPresentation: Record<string, { label: string; className: string }> = {
    agreement_high_confidence: {
        label: '우선 검토 · 원문/AI 일치',
        className: 'bg-emerald-700 text-white'
    },
    agreement_low_confidence: {
        label: '확인 필요 · 저신뢰 일치',
        className: 'bg-amber-700 text-white'
    },
    heuristic_agreement: {
        label: '자동 추정/AI 일치 · 원문 확인',
        className: 'bg-orange-700 text-white'
    },
    class_conflict: {
        label: '라벨 충돌',
        className: 'bg-red-700 text-white'
    },
    unclassifiable: {
        label: '판정 불가/정상 가능',
        className: 'bg-gray-700 text-gray-100'
    },
    pending_audit: {
        label: 'AI 감사 대기',
        className: 'bg-sky-800 text-white'
    }
};

const benchmarkGateLabel: Record<string, string> = {
    sampleCount: '표본 20건',
    httpSuccess: 'HTTP 성공률 95%',
    classifiable: '판정 가능률 95%',
    defectAccuracy: '결함 정확도 80%',
    graphGrounding: 'Graph 근거율 80%',
    passRate: '전체 통과율 80%',
    classCoverage: '필수 결함군별 2건',
    classAccuracy: '결함군별 최저 정확도 50%',
    visionConfidence: 'Vision 신뢰도 0.6 이상 비율 80%'
};

const migrationBlockerLabel: Record<string, string> = {
    common_agent_offline: 'Common Agent 오프라인',
    qa_agent_offline: 'Vision QA 오프라인',
    dataset_query_failed: '승인 데이터셋 조회 실패',
    approved_label_conflicts: '승인 이미지 라벨 충돌',
    human_review_required: '사람 검토 필요',
    benchmark_sampleCount: '승인 표본 부족',
    benchmark_httpSuccess: 'HTTP 성공률 부족',
    benchmark_classifiable: '판정 가능률 부족',
    benchmark_defectAccuracy: '결함 정확도 부족',
    benchmark_graphGrounding: 'Graph 근거율 부족',
    benchmark_passRate: '전체 통과율 부족',
    benchmark_classCoverage: '필수 결함군 표본 부족',
    benchmark_classAccuracy: '결함군별 정확도 부족',
    benchmark_visionConfidence: 'Vision 신뢰도 부족'
};

const VISION_REVIEW_DECISION_REASONS = [
    '정상 형상/결함 미확인',
    '비제조 화면/도표',
    '중복/화질 부족',
    '라벨 근거 부족',
    '현장 정보 필요',
    '전문가 검토 필요'
];

const defaultVisionReviewDecisionReason = (candidate: LocalVisionCandidate) => {
    if (candidate.reviewDecision?.reason) return candidate.reviewDecision.reason;
    if (candidate.likelyNonManufacturing) return '비제조 화면/도표';
    if (candidate.reviewBucket === 'unclassifiable') return '정상 형상/결함 미확인';
    if (candidate.reviewBucket === 'class_conflict') return '라벨 근거 부족';
    return '전문가 검토 필요';
};

const DatabaseView: React.FC<DatabaseViewProps> = ({ stats, onClose }) => {
    const [activeTab, setActiveTab] = useState<DatabaseTab>('common-agent');
    const [feedbackData, setFeedbackData] = useState<UserFeedbackData[]>([]);
    const [visionItems, setVisionItems] = useState<VisionDatasetItem[]>([]);
    const [visionReadiness, setVisionReadiness] = useState<VisionDatasetReadiness | null>(null);
    const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
    const [editedLabels, setEditedLabels] = useState<Record<string, string>>({});
    const [isLoadingVision, setIsLoadingVision] = useState(false);
    const [updatingImageId, setUpdatingImageId] = useState<string | null>(null);
    const [visionStatus, setVisionStatus] = useState('');
    const [isRunningBenchmark, setIsRunningBenchmark] = useState(false);
    const [benchmarkResult, setBenchmarkResult] = useState<VisionBenchmarkRunResult | null>(null);
    const [suggestingImageId, setSuggestingImageId] = useState<string | null>(null);
    const [labelSuggestions, setLabelSuggestions] = useState<Record<string, VisionLabelSuggestion>>({});
    const [localCandidateScan, setLocalCandidateScan] = useState<LocalVisionCandidateScan | null>(null);
    const [localCandidateLabels, setLocalCandidateLabels] = useState<Record<string, string>>({});
    const [localCandidateContexts, setLocalCandidateContexts] = useState<Record<string, string>>({});
    const [localCandidateSuggestions, setLocalCandidateSuggestions] = useState<Record<string, VisionLabelSuggestion>>({});
    const [confirmedWarnings, setConfirmedWarnings] = useState<Record<string, boolean>>({});
    const [confirmedLabelReconciliations, setConfirmedLabelReconciliations] = useState<Record<string, boolean>>({});
    const [confirmedHumanApprovals, setConfirmedHumanApprovals] = useState<Record<string, boolean>>({});
    const [previewLocalCandidateId, setPreviewLocalCandidateId] = useState<string | null>(null);
    const [previewLocalCandidateImage, setPreviewLocalCandidateImage] = useState<{
        dataUrl: string;
        width: number;
        height: number;
        mimeType: string;
        contentSha256: string;
    } | null>(null);
    const [previewLocalCandidateError, setPreviewLocalCandidateError] = useState('');
    const [onlyPriorityReview, setOnlyPriorityReview] = useState(false);
    const [onlyMissingCoverage, setOnlyMissingCoverage] = useState(true);
    const [showExcludedCandidates, setShowExcludedCandidates] = useState(false);
    const [localDecisionReasons, setLocalDecisionReasons] = useState<Record<string, string>>({});
    const [isScanningLocalCandidates, setIsScanningLocalCandidates] = useState(false);
    const [busyLocalCandidateId, setBusyLocalCandidateId] = useState<string | null>(null);

    const fetchLegacyFeedback = async () => {
        const data = await window.electronAPI.getUserFeedback();
        setFeedbackData(data);
    };

    const fetchVisionData = async (options: { clearStatus?: boolean } = {}) => {
        setIsLoadingVision(true);
        if (options.clearStatus !== false) setVisionStatus('');
        try {
            const items = await CommonAgentApiService.loadImageDatasetsWithContentHashes();
            const readiness = calculateVisionDatasetReadiness(items);
            const urls = Object.fromEntries(await Promise.all(
                items.map(async item => [
                    item.image_id,
                    await CommonAgentApiService.getImageDatasetFileUrl(item.image_id)
                ])
            ));
            setVisionItems(items);
            setVisionReadiness(readiness);
            setImageUrls(urls);
            setEditedLabels(Object.fromEntries(
                items.map(item => [
                    item.image_id,
                    String(item.metadata?.proposed_defect_type || item.defect_type || '')
                ])
            ));
        } catch (error) {
            setVisionStatus(
                error instanceof Error ? `Common Agent 조회 실패: ${error.message}` : 'Common Agent 조회 실패'
            );
        } finally {
            setIsLoadingVision(false);
        }
    };

    useEffect(() => {
        if (activeTab === 'common-agent') void fetchVisionData();
        if (activeTab === 'legacy') void fetchLegacyFeedback();
    }, [activeTab]);

    useEffect(() => {
        if (!previewLocalCandidateId) return;
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setPreviewLocalCandidateId(null);
                setPreviewLocalCandidateImage(null);
                setPreviewLocalCandidateError('');
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [previewLocalCandidateId]);

    const conflictIds = new Set(
        visionReadiness?.conflictGroups.flatMap(group => group.imageIds) || []
    );
    const orderedVisionItems = [...visionItems].sort((left, right) => {
        const conflictOrder = Number(conflictIds.has(right.image_id)) - Number(conflictIds.has(left.image_id));
        if (conflictOrder !== 0) return conflictOrder;
        return String(right.created_at || '').localeCompare(String(left.created_at || ''));
    });
    const allLocalReviewQueue = localCandidateScan
        ? buildVisionReviewQueue({
            candidates: localCandidateScan.candidates,
            labelsByCandidateId: localCandidateLabels,
            datasetItems: visionItems,
            defectClassCoverage: visionReadiness?.defectClassCoverage || []
        })
        : [];
    const activeLocalReviewQueue = allLocalReviewQueue.filter(
        item => item.candidate.reviewDecision?.decision !== 'excluded'
    );
    const coveragePriorityCandidateCount = activeLocalReviewQueue.filter(
        item => item.needsCoverage
    ).length;
    const priorityOneCandidateCount = activeLocalReviewQueue.filter(
        item => item.candidate.reviewPriority === 1 && !item.isAlreadyApproved
    ).length;
    const resolvedPriorityOneCandidateCount = activeLocalReviewQueue.filter(
        item => item.candidate.reviewPriority === 1 && item.isAlreadyApproved
    ).length;
    const excludedCandidateCount = allLocalReviewQueue.filter(
        item => item.candidate.reviewDecision?.decision === 'excluded'
    ).length;
    const deferredCandidateCount = allLocalReviewQueue.filter(
        item => item.candidate.reviewDecision?.decision === 'deferred'
    ).length;
    const decisionFilteredLocalReviewQueue = showExcludedCandidates
        ? allLocalReviewQueue
        : activeLocalReviewQueue;
    const priorityFilteredLocalReviewQueue = onlyPriorityReview
        ? decisionFilteredLocalReviewQueue.filter(item => item.candidate.reviewPriority === 1)
        : decisionFilteredLocalReviewQueue;
    const visibleLocalReviewQueue = onlyMissingCoverage
        ? priorityFilteredLocalReviewQueue.filter(item => item.needsCoverage)
        : priorityFilteredLocalReviewQueue;
    const previewLocalCandidate = localCandidateScan?.candidates.find(
        candidate => candidate.candidateId === previewLocalCandidateId
    ) || null;
    const previewReviewIndex = visibleLocalReviewQueue.findIndex(
        item => item.candidate.candidateId === previewLocalCandidateId
    );

    useEffect(() => {
        if (
            localCandidateScan
            && onlyPriorityReview
            && priorityOneCandidateCount === 0
        ) {
            setOnlyPriorityReview(false);
        }
    }, [localCandidateScan, onlyPriorityReview, priorityOneCandidateCount]);

    const reviewVisionItem = async (
        item: VisionDatasetItem,
        decision: 'approve' | 'needs_review' | 'reject'
    ) => {
        const defectType = (editedLabels[item.image_id] || '').trim();
        const defectClass = canonicalDefectClass(defectType);
        const benchmarkClassLabel = DEFECT_CLASS_LABELS[defectClass];
        if (!defectType) {
            setVisionStatus('불량명을 입력한 뒤 검토 상태를 변경하세요.');
            return;
        }
        if (decision === 'approve' && conflictIds.has(item.image_id)) {
            setVisionStatus('동일 이미지에 상충 라벨이 있습니다. 잘못된 중복 레코드를 먼저 반려한 뒤 승인하세요.');
            return;
        }

        setUpdatingImageId(item.image_id);
        setVisionStatus(`${item.image_id} 검토 결과 반영 중...`);
        try {
            await CommonAgentApiService.reviewImageDataset(item.image_id, {
                decision,
                defectType,
                observationSummary: item.observation?.summary || defectType,
                visibleFeatures: item.observation?.visible_features || [],
                possibleCauses: item.observation?.possible_causes || [],
                recommendedChecks: item.observation?.recommended_checks || [],
                labels: Array.from(new Set([defectType, ...(item.labels || [])])),
                processArea: item.process_area || 'injection-molding',
                severity: item.severity,
                question: item.question,
                answer: item.answer,
                comment: decision === 'approve'
                    ? 'Mold Master AI Vision dataset manager approval'
                    : `Mold Master AI Vision dataset manager ${decision}`,
                promoteToGraph: decision === 'approve',
                metadata: {
                    ...(item.metadata || {}),
                    content_sha256: item.metadata?.content_sha256,
                    reviewed_from: 'mold-master-ai-dataset-manager'
                }
            });
            setVisionStatus(
                decision === 'approve'
                    ? benchmarkClassLabel
                        ? `Common Agent 승인 및 Graph 승격 완료 · 벤치마크 결함군: ${benchmarkClassLabel}`
                        : 'Common Agent 승인 및 Graph 승격 완료 · 벤치마크 필수 7개 결함군 외 라벨입니다.'
                    : decision === 'reject'
                        ? '중복/오류 레코드를 반려했습니다.'
                        : '사람 검토 필요 상태로 변경했습니다.'
            );
            await fetchVisionData({ clearStatus: false });
        } catch (error) {
            setVisionStatus(error instanceof Error ? `검토 반영 실패: ${error.message}` : '검토 반영 실패');
        } finally {
            setUpdatingImageId(null);
        }
    };

    const runVisionBenchmark = async () => {
        setIsRunningBenchmark(true);
        setVisionStatus('승인 데이터 동기화 및 비저장 Vision/Graph 벤치마크 실행 중...');
        try {
            const result = await window.electronAPI.runVisionBenchmark();
            setBenchmarkResult(result);
            await fetchVisionData({ clearStatus: false });
            setVisionStatus(
                result.gatePassed
                    ? 'Vision 전환 게이트를 충족했습니다.'
                    : '벤치마크가 완료됐지만 레거시 제거 기준은 아직 충족하지 못했습니다.'
            );
        } catch (error) {
            setVisionStatus(error instanceof Error ? `벤치마크 실패: ${error.message}` : '벤치마크 실패');
        } finally {
            setIsRunningBenchmark(false);
        }
    };

    const suggestVisionLabel = async (item: VisionDatasetItem) => {
        setSuggestingImageId(item.image_id);
        setVisionStatus(`${item.image_id} 비영속 AI 라벨 제안 생성 중...`);
        try {
            const suggestion = await window.electronAPI.suggestVisionLabel(item.image_id, {
                currentLabel: editedLabels[item.image_id],
                question: item.question || item.observation?.summary
            });
            setLabelSuggestions(current => ({
                ...current,
                [item.image_id]: suggestion
            }));
            if (suggestion.classifiable) {
                setEditedLabels(current => ({
                    ...current,
                    [item.image_id]: suggestion.defectType
                }));
                setVisionStatus(
                    `AI 제안 완료: ${suggestion.defectType} (${Math.round(suggestion.confidence * 100)}%) · 아직 저장되지 않았습니다.`
                );
            } else {
                setVisionStatus(
                    `AI 판정 불가: ${suggestion.summary || suggestion.defectType} · 라벨은 변경되지 않았습니다.`
                );
            }
        } catch (error) {
            setVisionStatus(
                error instanceof Error ? `AI 라벨 제안 실패: ${error.message}` : 'AI 라벨 제안 실패'
            );
        } finally {
            setSuggestingImageId(null);
        }
    };

    const openLocalCandidatePreview = async (candidate: LocalVisionCandidate) => {
        setPreviewLocalCandidateId(candidate.candidateId);
        setPreviewLocalCandidateImage(null);
        setPreviewLocalCandidateError('');
        try {
            const image = await window.electronAPI.getLocalVisionCandidateImage(
                candidate.candidateId
            );
            setPreviewLocalCandidateImage(image);
        } catch (error) {
            setPreviewLocalCandidateError(
                error instanceof Error ? error.message : '원본 이미지를 불러오지 못했습니다.'
            );
        }
    };

    const closeLocalCandidatePreview = () => {
        setPreviewLocalCandidateId(null);
        setPreviewLocalCandidateImage(null);
        setPreviewLocalCandidateError('');
    };

    const navigateLocalCandidatePreview = (offset: number) => {
        if (previewReviewIndex < 0) return;
        const nextItem = visibleLocalReviewQueue[previewReviewIndex + offset];
        if (nextItem) void openLocalCandidatePreview(nextItem.candidate);
    };

    const applyLocalCandidateScan = (
        result: LocalVisionCandidateScan,
        preparedPacket = false
    ) => {
        setLocalCandidateScan(result);
        setLocalCandidateLabels(Object.fromEntries(
            result.candidates.map(candidate => [
                candidate.candidateId,
                candidate.proposedDefectType || ''
            ])
        ));
        setLocalCandidateContexts(Object.fromEntries(
            result.candidates.map(candidate => [
                candidate.candidateId,
                candidate.fieldContext || ''
            ])
        ));
        setLocalCandidateSuggestions({});
        setConfirmedWarnings({});
        setConfirmedLabelReconciliations({});
        setConfirmedHumanApprovals({});
        closeLocalCandidatePreview();
        setOnlyPriorityReview(
            preparedPacket && result.candidates.some(candidate => candidate.reviewPriority === 1)
        );
        // Prepared packets can include total-sample supplements for classes whose
        // per-class coverage is already complete, so show the full priority queue.
        setOnlyMissingCoverage(!preparedPacket);
        setShowExcludedCandidates(false);
        setLocalDecisionReasons(Object.fromEntries(
            result.candidates.map(candidate => [
                candidate.candidateId,
                defaultVisionReviewDecisionReason(candidate)
            ])
        ));
        setVisionStatus(
            `로컬 후보 ${result.summary.uniqueCandidates}건 · 중복 제외 ${result.summary.duplicatesSkipped}건`
            + ` · 기존 등록 ${result.summary.existingMatches}건 · 주의 ${result.summary.likelyNonManufacturing}건`
        );
    };

    const scanLocalCandidates = async (preparedPacket = false) => {
        setIsScanningLocalCandidates(true);
        setVisionStatus(
            preparedPacket
                ? '준비된 검토 패킷의 이미지 해시와 우선순위를 확인 중입니다. DB에는 저장하지 않습니다.'
                : '로컬 폴더에서 이미지 해시와 미리보기를 생성 중입니다. 원본은 변경되지 않습니다.'
        );
        try {
            const existingHashes = visionItems
                .map(item => String(item.metadata?.content_sha256 || '').trim())
                .filter(Boolean);
            const result = preparedPacket
                ? await window.electronAPI.scanPreparedVisionReviewPacket(existingHashes)
                : await window.electronAPI.scanLocalVisionCandidates(existingHashes);
            if (!result) {
                setVisionStatus('로컬 후보 폴더 선택을 취소했습니다.');
                return;
            }
            applyLocalCandidateScan(result, preparedPacket);
        } catch (error) {
            setVisionStatus(
                error instanceof Error
                    ? `${preparedPacket ? '준비된 패킷' : '로컬 후보'} 검색 실패: ${error.message}`
                    : '로컬 후보 검색 실패'
            );
        } finally {
            setIsScanningLocalCandidates(false);
        }
    };

    const suggestLocalCandidateLabel = async (candidate: LocalVisionCandidate) => {
        setBusyLocalCandidateId(candidate.candidateId);
        setVisionStatus(`${candidate.fileName} 비영속 AI 라벨 제안 생성 중...`);
        try {
            const suggestion = await window.electronAPI.suggestLocalVisionLabel(candidate.candidateId, {
                currentLabel: localCandidateLabels[candidate.candidateId],
                question: localCandidateContexts[candidate.candidateId]
            });
            setLocalCandidateSuggestions(current => ({
                ...current,
                [candidate.candidateId]: suggestion
            }));
            if (suggestion.classifiable) {
                setLocalCandidateLabels(current => ({
                    ...current,
                    [candidate.candidateId]: suggestion.defectType
                }));
                setConfirmedLabelReconciliations(current => ({
                    ...current,
                    [candidate.candidateId]: false
                }));
                setConfirmedHumanApprovals(current => ({
                    ...current,
                    [candidate.candidateId]: false
                }));
                setVisionStatus(
                    `AI 제안 완료: ${suggestion.defectType} (${Math.round(suggestion.confidence * 100)}%)`
                    + ' · 아직 DB에 저장되지 않았습니다.'
                );
            } else {
                setVisionStatus('AI가 제조 결함으로 판정하지 못했습니다. 후보 라벨과 DB는 변경되지 않았습니다.');
            }
        } catch (error) {
            setVisionStatus(error instanceof Error ? `로컬 후보 AI 제안 실패: ${error.message}` : '로컬 후보 AI 제안 실패');
        } finally {
            setBusyLocalCandidateId(null);
        }
    };

    const importLocalCandidate = async (candidate: LocalVisionCandidate) => {
        const defectType = String(localCandidateLabels[candidate.candidateId] || '').trim();
        const defectClass = canonicalDefectClass(defectType);
        if (!DEFECT_CLASS_LABELS[defectClass]) {
            setVisionStatus('20건 전환 게이트의 필수 7개 결함군 라벨을 입력하거나 AI 제안 후 확인하세요.');
            return;
        }
        if (candidate.likelyNonManufacturing && !confirmedWarnings[candidate.candidateId]) {
            setVisionStatus('스크린샷/차트 가능성 경고를 확인한 뒤 제조 제품 사진임을 체크하세요.');
            return;
        }
        if (
            candidate.requiresLabelReconciliation
            && !confirmedLabelReconciliations[candidate.candidateId]
        ) {
            setVisionStatus('원문 라벨과 Vision 제안의 차이를 검토하고 최종 라벨을 확인하세요.');
            return;
        }

        setBusyLocalCandidateId(candidate.candidateId);
        setVisionStatus(`${candidate.fileName}을 Common Agent 검토 후보로 등록 중...`);
        try {
            const result = await window.electronAPI.importLocalVisionCandidate(candidate.candidateId, {
                defectType,
                question: localCandidateContexts[candidate.candidateId],
                labelReconciled: Boolean(confirmedLabelReconciliations[candidate.candidateId])
            });
            setLocalCandidateScan(current => current ? {
                ...current,
                candidates: current.candidates.map(item => item.candidateId === candidate.candidateId
                    ? { ...item, alreadyRegistered: true }
                    : item)
            } : current);
            setVisionStatus(
                `${result.imageId} 후보 등록 완료 · 아직 승인되지 않았습니다.`
                + ' 아래 Common Agent 카드에서 라벨을 재확인한 뒤 승인 + Graph를 실행하세요.'
            );
            await fetchVisionData({ clearStatus: false });
        } catch (error) {
            setVisionStatus(error instanceof Error ? `로컬 후보 등록 실패: ${error.message}` : '로컬 후보 등록 실패');
        } finally {
            setBusyLocalCandidateId(null);
        }
    };

    const approveLocalCandidate = async (candidate: LocalVisionCandidate) => {
        const defectType = String(localCandidateLabels[candidate.candidateId] || '').trim();
        const defectClass = canonicalDefectClass(defectType);
        if (!DEFECT_CLASS_LABELS[defectClass]) {
            setVisionStatus('20건 전환 게이트의 필수 7개 결함군 라벨을 입력하고 확인하세요.');
            return;
        }
        if (!confirmedHumanApprovals[candidate.candidateId]) {
            setVisionStatus('이미지와 최종 결함 라벨을 사람이 직접 확인해야 승인할 수 있습니다.');
            return;
        }
        if (candidate.likelyNonManufacturing && !confirmedWarnings[candidate.candidateId]) {
            setVisionStatus('스크린샷/차트 가능성 경고를 확인한 뒤 제조 제품 사진임을 체크하세요.');
            return;
        }
        if (
            candidate.requiresLabelReconciliation
            && !confirmedLabelReconciliations[candidate.candidateId]
        ) {
            setVisionStatus('원문 라벨과 Vision 제안을 검토하고 최종 라벨을 확인하세요.');
            return;
        }

        setBusyLocalCandidateId(candidate.candidateId);
        setVisionStatus(`${candidate.fileName} 사람 승인 및 Graph 승격 준비 중...`);
        let imageId = '';
        let registeredThisAttempt = false;
        try {
            const approvalPlan = resolveLocalCandidateApproval({
                candidate,
                datasetItems: visionItems,
                defectType
            });
            if (approvalPlan.mode === 'already_approved') {
                setVisionStatus(`${approvalPlan.imageId}는 이미 동일 라벨로 승인 및 Graph 반영된 이미지입니다.`);
                return;
            }

            let datasetItem = approvalPlan.datasetItem;
            if (approvalPlan.mode === 'register_then_review') {
                const imported = await window.electronAPI.importLocalVisionCandidate(candidate.candidateId, {
                    defectType,
                    question: localCandidateContexts[candidate.candidateId],
                    labelReconciled: Boolean(confirmedLabelReconciliations[candidate.candidateId])
                });
                imageId = imported.imageId;
                registeredThisAttempt = true;
                datasetItem = {
                    image_id: imageId,
                    defect_type: defectType,
                    review_status: imported.reviewStatus,
                    question: localCandidateContexts[candidate.candidateId],
                    labels: [defectType],
                    process_area: 'injection-molding',
                    metadata: {
                        content_sha256: candidate.contentSha256,
                        proposed_defect_type: defectType
                    }
                };
                setLocalCandidateScan(current => current ? {
                    ...current,
                    candidates: current.candidates.map(item => item.candidateId === candidate.candidateId
                        ? { ...item, alreadyRegistered: true }
                        : item)
                } : current);
            } else {
                imageId = approvalPlan.imageId || '';
            }
            if (!imageId || !datasetItem) {
                throw new Error('Common Agent 검토 대상 이미지 ID를 확인하지 못했습니다.');
            }

            await CommonAgentApiService.reviewImageDataset(
                imageId,
                buildLocalCandidateReviewRequest({
                    candidate,
                    datasetItem,
                    defectType,
                    fieldContext: localCandidateContexts[candidate.candidateId]
                }) as CommonAgentImageReviewRequest
            );
            setVisionStatus(
                `${imageId} 사람 승인 + Graph 승격 완료 · 결함군 ${DEFECT_CLASS_LABELS[defectClass]}`
            );
            await fetchVisionData({ clearStatus: false });
        } catch (error) {
            if (registeredThisAttempt) {
                await fetchVisionData({ clearStatus: false }).catch(() => undefined);
            }
            const detail = error instanceof Error ? error.message : '알 수 없는 오류';
            setVisionStatus(
                registeredThisAttempt
                    ? `후보 등록은 보존되었지만 승인/Graph 승격 실패: ${detail}`
                    : `사람 승인/Graph 승격 실패: ${detail}`
            );
        } finally {
            setBusyLocalCandidateId(null);
        }
    };

    const setLocalReviewDecision = async (
        candidate: LocalVisionCandidate,
        decision: 'deferred' | 'excluded' | 'clear'
    ) => {
        const reason = localDecisionReasons[candidate.candidateId] || '';
        if (decision !== 'clear' && !reason.trim()) {
            setVisionStatus('보류 또는 제외 사유를 선택하세요.');
            return;
        }
        setBusyLocalCandidateId(candidate.candidateId);
        setVisionStatus(`${candidate.fileName} 로컬 HITL 판정 저장 중...`);
        try {
            const record = await window.electronAPI.setLocalVisionReviewDecision(
                candidate.candidateId,
                {
                    decision,
                    reason: decision === 'clear' ? undefined : reason
                }
            );
            setLocalCandidateScan(current => current ? {
                ...current,
                candidates: current.candidates.map(item =>
                    item.candidateId === candidate.candidateId
                        ? { ...item, reviewDecision: record }
                        : item
                ),
                summary: {
                    ...current.summary,
                    deferredDecisions: current.candidates.filter(item =>
                        (item.candidateId === candidate.candidateId
                            ? record
                            : item.reviewDecision)?.decision === 'deferred'
                    ).length,
                    excludedDecisions: current.candidates.filter(item =>
                        (item.candidateId === candidate.candidateId
                            ? record
                            : item.reviewDecision)?.decision === 'excluded'
                    ).length
                }
            } : current);
            setConfirmedHumanApprovals(current => ({
                ...current,
                [candidate.candidateId]: false
            }));
            setVisionStatus(
                decision === 'clear'
                    ? '로컬 HITL 판정을 해제했습니다. 후보가 활성 검토 큐로 돌아왔습니다.'
                    : decision === 'excluded'
                        ? '후보를 로컬 검토 큐에서 제외했습니다. Common Agent/Graph에는 기록하지 않았습니다.'
                        : '후보를 보류했습니다. Common Agent/Graph에는 기록하지 않았습니다.'
            );
        } catch (error) {
            setVisionStatus(
                error instanceof Error
                    ? `로컬 HITL 판정 저장 실패: ${error.message}`
                    : '로컬 HITL 판정 저장 실패'
            );
        } finally {
            setBusyLocalCandidateId(null);
        }
    };

    if (!stats) return null;

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="dataset-manager-title"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-1 sm:p-2"
            onClick={onClose}
        >
            <div
                data-testid="dataset-manager-modal"
                className="flex h-[98vh] max-h-[98vh] w-[calc(100vw-0.5rem)] max-w-[1600px] flex-col overflow-hidden rounded-lg border border-gray-600 bg-gray-800 shadow-2xl"
                onClick={event => event.stopPropagation()}
            >
                <header className="flex shrink-0 items-center justify-between border-b border-gray-700 bg-gray-900 px-5 py-3">
                    <div>
                        <h2 id="dataset-manager-title" className="text-xl font-bold text-white">Knowledge & Dataset Control</h2>
                        <p className="mt-1 text-xs text-gray-500">Common Agent가 운영 데이터와 Graph의 기준 시스템입니다.</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="rounded px-3 py-1 text-xl font-bold text-gray-300 transition-colors hover:bg-red-600 hover:text-white"
                        aria-label="Close dataset manager"
                    >
                        x
                    </button>
                </header>

                <nav
                    data-testid="dataset-manager-tabs"
                    aria-label="Dataset sections"
                    className="dataset-tab-scrollbar flex min-h-[54px] shrink-0 items-center gap-1 overflow-x-auto border-b border-gray-600 bg-gray-950/70 px-2 py-2"
                >
                    {([
                        ['common-agent', `Common Agent Vision (${visionItems.length})`],
                        ['web-knowledge', 'Web Case HITL (40)'],
                        ['stats', 'Local Rollback Structure'],
                        ['legacy', `Legacy Feedback (${feedbackData.length})`]
                    ] as Array<[DatabaseTab, string]>).map(([tab, label]) => (
                        <button
                            key={tab}
                            className={`h-9 whitespace-nowrap rounded-md border px-5 text-sm font-bold transition-colors ${
                                activeTab === tab
                                    ? 'border-cyan-500 bg-cyan-950/70 text-cyan-100 shadow-[inset_0_-2px_0_#22d3ee]'
                                    : 'border-gray-700 bg-gray-900/70 text-gray-400 hover:border-gray-500 hover:text-white'
                            }`}
                            onClick={() => setActiveTab(tab)}
                        >
                            {label}
                        </button>
                    ))}
                </nav>

                <div
                    data-testid="dataset-manager-scroll"
                    className="dataset-scrollbar min-h-0 flex-1 overflow-y-scroll bg-gray-800 p-4 text-sm lg:p-5"
                >
                    {activeTab === 'common-agent' && (
                        <div className="space-y-4">
                            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-cyan-900/70 bg-cyan-950/20 p-4">
                                <div>
                                    <p className="font-bold text-cyan-100">승인 Vision 데이터 품질 게이트</p>
                                    <p className="mt-1 text-xs text-gray-300">
                                        {visionReadiness
                                            ? `유효 승인 ${visionReadiness.cleanApproved}/20 · 추가 필요 ${visionReadiness.additionalCleanImagesRequired} · 동일 이미지 중복 ${visionReadiness.duplicateRecords}건 · 충돌 ${visionReadiness.conflictGroups.length}그룹`
                                            : isLoadingVision ? '원본 파일 해시와 검토 상태 확인 중...' : '데이터 없음'}
                                    </p>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => void fetchVisionData()}
                                        disabled={isLoadingVision || isRunningBenchmark}
                                        className="rounded bg-cyan-700 px-3 py-2 text-xs font-bold text-white hover:bg-cyan-600 disabled:opacity-50"
                                    >
                                        {isLoadingVision ? '검사 중' : '데이터 새로고침'}
                                    </button>
                                    <button
                                        onClick={runVisionBenchmark}
                                        disabled={isRunningBenchmark || isLoadingVision || visionItems.length === 0}
                                        className="rounded bg-indigo-700 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        {isRunningBenchmark ? '평가 중...' : 'Vision 벤치마크 실행'}
                                    </button>
                                </div>
                            </div>

                            {visionReadiness && (
                                <div className="rounded-lg border border-gray-700 bg-gray-900/50 p-3">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <p className="text-xs font-bold text-gray-200">API 비용 없는 승인 데이터 수집 현황</p>
                                        <p className="text-[10px] text-gray-500">
                                            관측 {visionReadiness.observedDefectClasses}/7 · 검증 {visionReadiness.coveredDefectClasses}/7
                                            {visionReadiness.unmappedCleanApproved > 0
                                                ? ` · 대상 외 ${visionReadiness.unmappedCleanApproved}건`
                                                : ''}
                                        </p>
                                    </div>
                                    <div className="mt-2 flex flex-wrap gap-1.5">
                                        {visionReadiness.defectClassCoverage.map(item => (
                                            <span
                                                key={item.defectClass}
                                                className={`rounded border px-2 py-1 text-[10px] ${
                                                    item.covered
                                                        ? 'border-emerald-700 bg-emerald-950/40 text-emerald-200'
                                                        : item.count > 0
                                                            ? 'border-amber-700 bg-amber-950/40 text-amber-200'
                                                            : 'border-gray-700 bg-gray-950/50 text-gray-500'
                                                }`}
                                            >
                                                {DEFECT_CLASS_LABELS[item.defectClass] || item.defectClass}{' '}
                                                <strong>{item.count}/{item.required}</strong>
                                                {!item.covered && <span> · 부족 {item.missing}</span>}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <section className="rounded-lg border border-sky-900/70 bg-sky-950/15 p-4">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                        <p className="font-bold text-sky-100">로컬 제조 이미지 후보 인벤토리</p>
                                        <p className="mt-1 text-xs text-gray-400">
                                            폴더 검사와 SHA-256 중복 제거는 PC 안에서만 실행됩니다. AI 제안도 클릭 전에는 호출되지 않습니다.
                                        </p>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            onClick={() => void scanLocalCandidates(true)}
                                            disabled={isLoadingVision || isScanningLocalCandidates || Boolean(busyLocalCandidateId)}
                                            className="rounded bg-emerald-700 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                            {isScanningLocalCandidates ? '패킷 확인 중...' : '준비된 검토 패킷'}
                                        </button>
                                        <button
                                            onClick={() => void scanLocalCandidates(false)}
                                            disabled={isLoadingVision || isScanningLocalCandidates || Boolean(busyLocalCandidateId)}
                                            className="rounded bg-sky-700 px-3 py-2 text-xs font-bold text-white hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                            {isLoadingVision
                                                ? '기존 해시 확인 중...'
                                                : isScanningLocalCandidates
                                                    ? '폴더 검사 중...'
                                                    : '로컬 후보 폴더 선택'}
                                        </button>
                                    </div>
                                </div>

                                {localCandidateScan && (
                                    <div className="mt-4 space-y-3">
                                        <div className="flex flex-wrap gap-2 text-[10px] text-gray-300">
                                            <span className="rounded bg-gray-900 px-2 py-1">발견 {localCandidateScan.summary.discoveredImageFiles}</span>
                                            <span className="rounded bg-gray-900 px-2 py-1">고유 후보 {localCandidateScan.summary.uniqueCandidates}</span>
                                            <span className="rounded bg-gray-900 px-2 py-1">파일 중복 제외 {localCandidateScan.summary.duplicatesSkipped}</span>
                                            <span className="rounded bg-gray-900 px-2 py-1">기존 등록 {localCandidateScan.summary.existingMatches}</span>
                                            <span className="rounded bg-gray-900 px-2 py-1">주의 필요 {localCandidateScan.summary.likelyNonManufacturing}</span>
                                            <span className="rounded bg-amber-950 px-2 py-1 text-amber-100">보류 {deferredCandidateCount}</span>
                                            <span className="rounded bg-red-950 px-2 py-1 text-red-100">제외 {excludedCandidateCount}</span>
                                            {resolvedPriorityOneCandidateCount > 0 && (
                                                <span className="rounded bg-emerald-950 px-2 py-1 text-emerald-100">
                                                    1순위 해소 완료 {resolvedPriorityOneCandidateCount}
                                                </span>
                                            )}
                                            {localCandidateScan.summary.manifestMatched > 0 && (
                                                <span className="rounded bg-sky-900/70 px-2 py-1 text-sky-100">
                                                    원문 연결 {localCandidateScan.summary.manifestMatched}
                                                </span>
                                            )}
                                            {localCandidateScan.summary.manifestHashMismatches > 0 && (
                                                <span className="rounded bg-red-900/70 px-2 py-1 text-red-100">
                                                    원문 해시 불일치 {localCandidateScan.summary.manifestHashMismatches}
                                                </span>
                                            )}
                                            {localCandidateScan.summary.truncated && (
                                                <span className="rounded bg-amber-900/70 px-2 py-1 text-amber-100">표시 상한 적용</span>
                                            )}
                                        </div>
                                        <p className="truncate font-mono text-[10px] text-gray-500">{localCandidateScan.rootPath}</p>
                                        <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-blue-900/60 bg-blue-950/20 p-2">
                                            <p className="text-[10px] text-blue-100">
                                                현재 승인 데이터 기준 미충족 결함군 우선 후보
                                                {' '}<strong>{coveragePriorityCandidateCount}</strong>건
                                                {' · '}원문/AI 신뢰도와 기존 등록 여부를 함께 반영
                                            </p>
                                            <div className="flex flex-wrap gap-1">
                                                {priorityOneCandidateCount > 0 && (
                                                    <button
                                                        type="button"
                                                        aria-pressed={onlyPriorityReview}
                                                        onClick={() => setOnlyPriorityReview(current => !current)}
                                                        className={`rounded px-2 py-1 text-[9px] font-bold ${
                                                            onlyPriorityReview
                                                                ? 'bg-emerald-600 text-white'
                                                                : 'bg-gray-800 text-gray-300'
                                                        }`}
                                                    >
                                                        1순위 사람 검토 ({priorityOneCandidateCount})
                                                    </button>
                                                )}
                                                <button
                                                    type="button"
                                                    aria-pressed={onlyMissingCoverage}
                                                    onClick={() => setOnlyMissingCoverage(true)}
                                                    className={`rounded px-2 py-1 text-[9px] font-bold ${
                                                        onlyMissingCoverage
                                                            ? 'bg-blue-600 text-white'
                                                            : 'bg-gray-800 text-gray-300'
                                                    }`}
                                                >
                                                    미충족 결함군만 ({coveragePriorityCandidateCount})
                                                </button>
                                                <button
                                                    type="button"
                                                    aria-pressed={!onlyMissingCoverage}
                                                    onClick={() => setOnlyMissingCoverage(false)}
                                                    className={`rounded px-2 py-1 text-[9px] font-bold ${
                                                        !onlyMissingCoverage
                                                            ? 'bg-blue-600 text-white'
                                                            : 'bg-gray-800 text-gray-300'
                                                    }`}
                                                >
                                                    전체 후보 ({allLocalReviewQueue.length})
                                                </button>
                                                <button
                                                    type="button"
                                                    aria-pressed={showExcludedCandidates}
                                                    onClick={() => setShowExcludedCandidates(current => !current)}
                                                    className={`rounded px-2 py-1 text-[9px] font-bold ${
                                                        showExcludedCandidates
                                                            ? 'bg-red-700 text-white'
                                                            : 'bg-gray-800 text-gray-300'
                                                    }`}
                                                >
                                                    {showExcludedCandidates
                                                        ? '제외 후보 숨기기'
                                                        : `제외 포함 (${excludedCandidateCount})`}
                                                </button>
                                            </div>
                                        </div>

                                        {visibleLocalReviewQueue.length === 0 ? (
                                            <div className="rounded border border-dashed border-gray-700 p-5 text-center text-xs text-gray-500">
                                                {localCandidateScan.candidates.length === 0
                                                    ? '지원 이미지가 없거나 모든 파일이 제한 조건에서 제외되었습니다.'
                                                    : onlyPriorityReview
                                                        ? '현재 조건에 해당하는 1순위 사람이 검토할 후보가 없습니다. 1순위 필터를 해제해 다른 자료를 검토하세요.'
                                                        : '현재 미충족 결함군에 해당하는 후보가 없습니다. 전체 후보를 선택해 다른 자료를 검토하세요.'}
                                            </div>
                                        ) : (
                                            <div className="grid gap-3 lg:grid-cols-2">
                                                {visibleLocalReviewQueue.slice(0, 40).map(queueItem => {
                                                    const candidate = queueItem.candidate;
                                                    const label = localCandidateLabels[candidate.candidateId] || '';
                                                    const defectClass = canonicalDefectClass(label);
                                                    const isRequiredClass = Boolean(DEFECT_CLASS_LABELS[defectClass]);
                                                    const suggestion = localCandidateSuggestions[candidate.candidateId];
                                                    const isBusy = busyLocalCandidateId === candidate.candidateId;
                                                    const warningConfirmed = confirmedWarnings[candidate.candidateId];
                                                    const reconciliationConfirmed =
                                                        confirmedLabelReconciliations[candidate.candidateId];
                                                    const humanApprovalConfirmed =
                                                        confirmedHumanApprovals[candidate.candidateId];
                                                    const isAlreadyApproved = queueItem.isAlreadyApproved;
                                                    const isRegistered = queueItem.isRegistered;
                                                    const reviewDecision = candidate.reviewDecision;
                                                    const hasReviewDecision = Boolean(reviewDecision);
                                                    const reviewPresentation = candidate.reviewBucket
                                                        ? reviewBucketPresentation[candidate.reviewBucket]
                                                        : null;
                                                    return (
                                                        <article
                                                            key={candidate.candidateId}
                                                            className={`overflow-hidden rounded border ${
                                                                isAlreadyApproved || reviewDecision?.decision === 'excluded'
                                                                    ? 'border-gray-700 bg-gray-900/40 opacity-65'
                                                                    : reviewDecision?.decision === 'deferred'
                                                                        ? 'border-amber-800/70 bg-amber-950/10'
                                                                    : candidate.likelyNonManufacturing
                                                                        ? 'border-amber-700/70 bg-amber-950/10'
                                                                        : 'border-sky-900/70 bg-gray-900/50'
                                                            }`}
                                                        >
                                                            <div className="flex min-h-36">
                                                                <button
                                                                    type="button"
                                                                    aria-label={`확대 보기 ${candidate.fileName}`}
                                                                    onClick={() => void openLocalCandidatePreview(candidate)}
                                                                    className="group relative flex w-36 shrink-0 items-center justify-center bg-black/70 focus:outline-none focus:ring-2 focus:ring-cyan-400"
                                                                >
                                                                    <img
                                                                        src={candidate.previewDataUrl}
                                                                        alt={candidate.fileName}
                                                                        className="max-h-36 w-full object-contain"
                                                                    />
                                                                    <span className="absolute bottom-2 right-2 rounded bg-black/75 px-2 py-1 text-[9px] font-bold text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus:opacity-100">
                                                                        원본 확대
                                                                    </span>
                                                                </button>
                                                                <div className="min-w-0 flex-1 p-3">
                                                                    <div className="flex flex-wrap gap-1">
                                                                        {reviewPresentation && (
                                                                            <span
                                                                                className={`rounded px-2 py-0.5 text-[9px] font-bold ${reviewPresentation.className}`}
                                                                                title={(candidate.reviewReasons || []).join('\n')}
                                                                            >
                                                                                {candidate.reviewPriority
                                                                                    ? `${candidate.reviewPriority}순위 · `
                                                                                    : ''}
                                                                                {reviewPresentation.label}
                                                                            </span>
                                                                        )}
                                                                        {queueItem.needsCoverage && (
                                                                            <span className="rounded bg-blue-800 px-2 py-0.5 text-[9px] font-bold text-blue-50">
                                                                                {queueItem.defectClassLabel} 추가 {queueItem.coverageMissing}건 필요
                                                                            </span>
                                                                        )}
                                                                        {reviewDecision && (
                                                                            <span className={`rounded px-2 py-0.5 text-[9px] font-bold ${
                                                                                reviewDecision.decision === 'excluded'
                                                                                    ? 'bg-red-800 text-red-100'
                                                                                    : 'bg-amber-800 text-amber-100'
                                                                            }`}>
                                                                                {reviewDecision.decision === 'excluded'
                                                                                    ? '로컬 제외'
                                                                                    : '로컬 보류'}
                                                                            </span>
                                                                        )}
                                                                        {isRegistered && (
                                                                            <span className={`rounded px-2 py-0.5 text-[9px] font-bold ${
                                                                                isAlreadyApproved
                                                                                    ? 'bg-emerald-800 text-emerald-100'
                                                                                    : 'bg-gray-700 text-gray-200'
                                                                            }`}>
                                                                                {isAlreadyApproved ? '승인/Graph 완료' : '검토 후보 등록됨'}
                                                                            </span>
                                                                        )}
                                                                        {candidate.likelyNonManufacturing && (
                                                                            <span className="rounded bg-amber-700 px-2 py-0.5 text-[9px] font-bold text-white">
                                                                                스크린샷/차트 가능성
                                                                            </span>
                                                                        )}
                                                                        {candidate.sourceLineage && (
                                                                            <span className="rounded bg-sky-800 px-2 py-0.5 text-[9px] font-bold text-white">
                                                                                {candidate.sourceLineage.webCaseId
                                                                                    ? 'Web Case 출처'
                                                                                    : candidate.sourceLineage.knowledgeId
                                                                                    ? '원문 카드 연결'
                                                                                    : '원문 문서 연결'}
                                                                            </span>
                                                                        )}
                                                                        {candidate.requiresLabelReconciliation && (
                                                                            <span className={`rounded px-2 py-0.5 text-[9px] font-bold text-white ${
                                                                                candidate.labelEvidence?.conflict
                                                                                    ? 'bg-red-700'
                                                                                    : 'bg-amber-700'
                                                                            }`}>
                                                                                {candidate.labelEvidence?.conflict
                                                                                    ? '원문/AI 라벨 충돌'
                                                                                    : '사람 라벨 확인'}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    <p className="mt-2 truncate text-xs font-bold text-white" title={candidate.relativePath}>
                                                                        {candidate.fileName}
                                                                    </p>
                                                                    <p className="mt-1 truncate font-mono text-[9px] text-gray-500">{candidate.relativePath}</p>
                                                                    <p className="mt-1 text-[9px] text-gray-500">
                                                                        {candidate.width} x {candidate.height} · {(candidate.sizeBytes / 1024).toFixed(0)} KB
                                                                    </p>
                                                                    {candidate.sourceLineage && (
                                                                        <div className="mt-1 text-[9px] text-sky-300">
                                                                            <p className="line-clamp-2">
                                                                                {candidate.sourceLineage.documentTitle
                                                                                    || candidate.sourceLineage.knowledgeId
                                                                                    || candidate.sourceLineage.sourceTitle
                                                                                    || candidate.sourceLineage.webCaseId}
                                                                                {candidate.sourceLineage.slideNumber
                                                                                    ? ` · slide ${candidate.sourceLineage.slideNumber}`
                                                                                    : ''}
                                                                            </p>
                                                                            {candidate.sourceLineage.webCaseId && (
                                                                                <p className="mt-0.5 text-emerald-300">
                                                                                    {candidate.sourceLineage.sourcePublisher || 'Web source'}
                                                                                    {candidate.sourceLineage.license
                                                                                        ? ` · ${candidate.sourceLineage.license}`
                                                                                        : ''}
                                                                                </p>
                                                                            )}
                                                                        </div>
                                                                    )}
                                                                    <input
                                                                        value={label}
                                                                        list="required-vision-defect-labels"
                                                                        onChange={event => {
                                                                            setLocalCandidateLabels(current => ({
                                                                                ...current,
                                                                                [candidate.candidateId]: event.target.value
                                                                            }));
                                                                            setConfirmedLabelReconciliations(current => ({
                                                                                ...current,
                                                                                [candidate.candidateId]: false
                                                                            }));
                                                                            setConfirmedHumanApprovals(current => ({
                                                                                ...current,
                                                                                [candidate.candidateId]: false
                                                                            }));
                                                                        }}
                                                                        placeholder="사람 검토 결함명"
                                                                        disabled={isAlreadyApproved || hasReviewDecision || isBusy}
                                                                        className="mt-2 w-full rounded border border-gray-600 bg-gray-950 px-2 py-1.5 text-xs font-bold text-white outline-none focus:border-sky-500 disabled:opacity-50"
                                                                        aria-label={`${candidate.candidateId} local defect label`}
                                                                    />
                                                                    <p className={`mt-1 text-[9px] ${isRequiredClass ? 'text-sky-300' : 'text-amber-300'}`}>
                                                                        {isRequiredClass
                                                                            ? `필수 결함군: ${DEFECT_CLASS_LABELS[defectClass]}`
                                                                            : '필수 7개 결함군 라벨 확인 필요'}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                            <div className="border-t border-gray-700 p-3">
                                                                <input
                                                                    value={localCandidateContexts[candidate.candidateId] || ''}
                                                                    onChange={event => setLocalCandidateContexts(current => ({
                                                                        ...current,
                                                                        [candidate.candidateId]: event.target.value
                                                                    }))}
                                                                    placeholder="발생 위치·조건·취출음 등 현장 설명(선택)"
                                                                    disabled={isAlreadyApproved || hasReviewDecision || isBusy}
                                                                    className="w-full rounded border border-gray-700 bg-gray-950 px-2 py-1.5 text-[10px] text-gray-200 outline-none focus:border-sky-600 disabled:opacity-50"
                                                                    aria-label={`${candidate.candidateId} local field context`}
                                                                />
                                                                {suggestion && (
                                                                    <div className={`mt-2 rounded border p-2 text-[10px] ${
                                                                        suggestion.classifiable
                                                                            ? 'border-cyan-900 bg-cyan-950/30 text-cyan-100'
                                                                            : 'border-amber-900 bg-amber-950/30 text-amber-100'
                                                                    }`}>
                                                                        <strong>
                                                                            {suggestion.classifiable
                                                                                ? `비영속 AI 제안 · ${Math.round(suggestion.confidence * 100)}%`
                                                                                : '비영속 AI 판정 불가 · 라벨 미변경'}
                                                                        </strong>
                                                                        <p className="mt-1 line-clamp-2 opacity-80">{suggestion.summary}</p>
                                                                    </div>
                                                                )}
                                                                {candidate.labelEvidence && candidate.requiresLabelReconciliation && (
                                                                    <div className={`mt-2 rounded border p-2 text-[10px] ${
                                                                        candidate.labelEvidence.conflict
                                                                            ? 'border-red-800 bg-red-950/30 text-red-100'
                                                                            : 'border-emerald-800 bg-emerald-950/30 text-emerald-100'
                                                                    }`}>
                                                                        <strong>
                                                                            {candidate.labelEvidence.conflict
                                                                                ? '라벨 근거 충돌 · 자동 승인 금지'
                                                                                : '원문/AI 일치 · 사람 확인 필요'}
                                                                        </strong>
                                                                        <p className="mt-1">
                                                                            원문: {candidate.labelEvidence.sourceLabel || '없음'}
                                                                            {' · '}Vision: {candidate.labelEvidence.visionSuggestedLabel || '판정 불가'}
                                                                            {Number.isFinite(candidate.labelEvidence.visionConfidence)
                                                                                ? ` (${Math.round(Number(candidate.labelEvidence.visionConfidence) * 100)}%)`
                                                                                : ''}
                                                                        </p>
                                                                        {candidate.labelEvidence.visionSummary && (
                                                                            <p className="mt-1 line-clamp-2 opacity-80">
                                                                                {candidate.labelEvidence.visionSummary}
                                                                            </p>
                                                                        )}
                                                                    </div>
                                                                )}
                                                                {candidate.likelyNonManufacturing && !isAlreadyApproved && !hasReviewDecision && (
                                                                    <label className="mt-2 flex items-start gap-2 text-[10px] text-amber-200">
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={Boolean(warningConfirmed)}
                                                                            onChange={event => setConfirmedWarnings(current => ({
                                                                                ...current,
                                                                                [candidate.candidateId]: event.target.checked
                                                                            }))}
                                                                        />
                                                                        화면 자료가 아니라 실제 제조 제품·금형 사진임을 확인했습니다.
                                                                    </label>
                                                                )}
                                                                {candidate.requiresLabelReconciliation && !isAlreadyApproved && !hasReviewDecision && (
                                                                    <label className="mt-2 flex items-start gap-2 text-[10px] text-red-200">
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={Boolean(reconciliationConfirmed)}
                                                                            onChange={event => setConfirmedLabelReconciliations(current => ({
                                                                                ...current,
                                                                                [candidate.candidateId]: event.target.checked
                                                                            }))}
                                                                            aria-label={`${candidate.candidateId} label reconciliation`}
                                                                        />
                                                                        원문과 Vision의 차이를 검토하고 입력한 최종 결함 라벨을 확인했습니다.
                                                                    </label>
                                                                )}
                                                                {!isAlreadyApproved && !hasReviewDecision && (
                                                                    <label className="mt-2 flex items-start gap-2 rounded border border-blue-900/70 bg-blue-950/30 p-2 text-[10px] text-blue-100">
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={Boolean(humanApprovalConfirmed)}
                                                                            onChange={event => setConfirmedHumanApprovals(current => ({
                                                                                ...current,
                                                                                [candidate.candidateId]: event.target.checked
                                                                            }))}
                                                                            aria-label={`${candidate.fileName} 이미지를 직접 확인했고 승인`}
                                                                        />
                                                                        이미지를 직접 확인했고 입력한 결함 라벨로 Common Agent 승인 및 Graph 승격하는 데 동의합니다.
                                                                    </label>
                                                                )}
                                                                {!isAlreadyApproved && (
                                                                    <div className="mt-2 rounded border border-gray-700 bg-gray-950/50 p-2">
                                                                        {reviewDecision ? (
                                                                            <div className="flex flex-wrap items-center justify-between gap-2 text-[10px]">
                                                                                <span className="text-gray-300">
                                                                                    {reviewDecision.reason}
                                                                                    {' · '}
                                                                                    {new Date(reviewDecision.decidedAt).toLocaleString()}
                                                                                </span>
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => void setLocalReviewDecision(candidate, 'clear')}
                                                                                    disabled={Boolean(busyLocalCandidateId)}
                                                                                    className="rounded bg-gray-700 px-2 py-1 font-bold text-white hover:bg-gray-600 disabled:opacity-40"
                                                                                >
                                                                                    판정 해제
                                                                                </button>
                                                                            </div>
                                                                        ) : (
                                                                            <div className="flex flex-wrap gap-2">
                                                                                <select
                                                                                    value={localDecisionReasons[candidate.candidateId] || ''}
                                                                                    onChange={event => setLocalDecisionReasons(current => ({
                                                                                        ...current,
                                                                                        [candidate.candidateId]: event.target.value
                                                                                    }))}
                                                                                    disabled={Boolean(busyLocalCandidateId)}
                                                                                    aria-label={`${candidate.fileName} HITL 판정 사유`}
                                                                                    className="min-w-40 flex-1 rounded border border-gray-700 bg-gray-900 px-2 py-1 text-[10px] text-gray-200"
                                                                                >
                                                                                    {VISION_REVIEW_DECISION_REASONS.map(reason => (
                                                                                        <option key={reason} value={reason}>{reason}</option>
                                                                                    ))}
                                                                                </select>
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => void setLocalReviewDecision(candidate, 'deferred')}
                                                                                    disabled={Boolean(busyLocalCandidateId)}
                                                                                    className="rounded bg-amber-700 px-2 py-1 text-[10px] font-bold text-white hover:bg-amber-600 disabled:opacity-40"
                                                                                >
                                                                                    보류
                                                                                </button>
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => void setLocalReviewDecision(candidate, 'excluded')}
                                                                                    disabled={Boolean(busyLocalCandidateId)}
                                                                                    className="rounded bg-red-800 px-2 py-1 text-[10px] font-bold text-white hover:bg-red-700 disabled:opacity-40"
                                                                                >
                                                                                    후보 제외
                                                                                </button>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                )}
                                                                <div className="mt-3 flex flex-wrap gap-2">
                                                                    <button
                                                                        onClick={() => void suggestLocalCandidateLabel(candidate)}
                                                                        disabled={isAlreadyApproved || hasReviewDecision || Boolean(busyLocalCandidateId)}
                                                                        className="rounded bg-cyan-800 px-3 py-1.5 text-[10px] font-bold text-white hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-40"
                                                                    >
                                                                        {isBusy ? '처리 중...' : 'AI 라벨 제안'}
                                                                    </button>
                                                                    <button
                                                                        onClick={() => void importLocalCandidate(candidate)}
                                                                        disabled={
                                                                            isRegistered
                                                                            || hasReviewDecision
                                                                            || Boolean(busyLocalCandidateId)
                                                                            || !isRequiredClass
                                                                            || (candidate.likelyNonManufacturing && !warningConfirmed)
                                                                            || (
                                                                                candidate.requiresLabelReconciliation
                                                                                && !reconciliationConfirmed
                                                                            )
                                                                        }
                                                                        className="rounded bg-emerald-700 px-3 py-1.5 text-[10px] font-bold text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-40"
                                                                    >
                                                                        검토 후보 등록
                                                                    </button>
                                                                    <button
                                                                        onClick={() => void approveLocalCandidate(candidate)}
                                                                        disabled={
                                                                            isAlreadyApproved
                                                                            || hasReviewDecision
                                                                            || Boolean(busyLocalCandidateId)
                                                                            || !isRequiredClass
                                                                            || !humanApprovalConfirmed
                                                                            || (candidate.likelyNonManufacturing && !warningConfirmed)
                                                                            || (
                                                                                candidate.requiresLabelReconciliation
                                                                                && !reconciliationConfirmed
                                                                            )
                                                                        }
                                                                        className="rounded bg-blue-700 px-3 py-1.5 text-[10px] font-bold text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-40"
                                                                    >
                                                                        {isAlreadyApproved
                                                                            ? '승인 완료'
                                                                            : isRegistered
                                                                                ? '승인 + Graph'
                                                                                : '등록 + 승인 + Graph'}
                                                                    </button>
                                                                    <span className="self-center text-[9px] text-gray-500">
                                                                        사람 확인 전에는 승인 및 Graph 기록 없음
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        </article>
                                                    );
                                                })}
                                            </div>
                                        )}
                                        {visibleLocalReviewQueue.length > 40 && (
                                            <p className="text-center text-[10px] text-gray-500">
                                                현재 필터의 우선 후보 40건을 표시합니다. 더 작은 대상 폴더를 선택하면 나머지 파일을 검토할 수 있습니다.
                                            </p>
                                        )}
                                        <datalist id="required-vision-defect-labels">
                                            {Object.values(DEFECT_CLASS_LABELS).map(label => (
                                                <option key={label} value={label} />
                                            ))}
                                        </datalist>
                                    </div>
                                )}
                            </section>

                            {benchmarkResult && (
                                <div className={`rounded-lg border p-4 ${
                                    benchmarkResult.gatePassed
                                        ? 'border-emerald-700 bg-emerald-950/20'
                                        : 'border-amber-700 bg-amber-950/20'
                                }`}>
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <p className="font-bold text-white">최신 Vision/Graph 실측 결과</p>
                                        <span className={`rounded px-2 py-1 text-[10px] font-bold ${
                                            benchmarkResult.gatePassed ? 'bg-emerald-700 text-white' : 'bg-amber-700 text-white'
                                        }`}>
                                            {benchmarkResult.gatePassed ? 'FALLBACK 제거 가능' : 'FALLBACK 유지'}
                                        </span>
                                    </div>
                                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-gray-300 md:grid-cols-4 xl:grid-cols-7">
                                        <span>표본 <strong className="text-white">{benchmarkResult.report.summary.total}</strong></span>
                                        <span>HTTP <strong className="text-white">{benchmarkResult.report.summary.httpSuccessRate}%</strong></span>
                                        <span>판정 가능 <strong className="text-white">{benchmarkResult.report.summary.classifiableRate}%</strong></span>
                                        <span>결함 정확도 <strong className="text-white">{benchmarkResult.report.summary.defectAccuracy}%</strong></span>
                                        <span>Graph 근거 <strong className="text-white">{benchmarkResult.report.summary.graphGroundedRate}%</strong></span>
                                        <span>
                                            결함군 <strong className="text-white">
                                                {benchmarkResult.report.summary.observedDefectClasses}/
                                                {benchmarkResult.report.summary.requiredDefectClasses.length}
                                            </strong>
                                            <span className="ml-1 text-gray-500">
                                                (검증 {benchmarkResult.report.summary.coveredDefectClasses}/
                                                {benchmarkResult.report.summary.requiredDefectClasses.length})
                                            </span>
                                        </span>
                                        <span>Vision 신뢰 <strong className="text-white">{benchmarkResult.report.summary.confidentRate}%</strong></span>
                                    </div>
                                    {benchmarkResult.report.summary.failedGateChecks.length > 0 && (
                                        <p className="mt-2 text-[10px] text-amber-300">
                                            미통과 조건: {benchmarkResult.report.summary.failedGateChecks
                                                .map(check => benchmarkGateLabel[check] || check)
                                                .join(' · ')}
                                        </p>
                                    )}
                                    {benchmarkResult.gateStatus && (
                                        <div className="mt-3 rounded border border-cyan-900/70 bg-cyan-950/20 p-3">
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                <p className="text-xs font-bold text-cyan-100">
                                                    통합 마이그레이션 게이트
                                                </p>
                                                <span className="rounded bg-gray-800 px-2 py-1 text-[9px] font-bold text-gray-300">
                                                    조회 전용 · 자동 승인 없음
                                                </span>
                                            </div>
                                            <div className="mt-2 grid grid-cols-2 gap-2 text-[10px] text-gray-300 md:grid-cols-3 xl:grid-cols-7">
                                                <span>
                                                    Common Agent{' '}
                                                    <strong className={benchmarkResult.gateStatus.services.commonAgent.online
                                                        ? 'text-emerald-300'
                                                        : 'text-red-300'}>
                                                        {benchmarkResult.gateStatus.services.commonAgent.online ? 'ONLINE' : 'OFFLINE'}
                                                    </strong>
                                                </span>
                                                <span>
                                                    Vision QA{' '}
                                                    <strong className={benchmarkResult.gateStatus.services.qaAgent.online
                                                        ? 'text-emerald-300'
                                                        : 'text-red-300'}>
                                                        {benchmarkResult.gateStatus.services.qaAgent.online ? 'ONLINE' : 'OFFLINE'}
                                                    </strong>
                                                </span>
                                                <span>
                                                    유효 승인{' '}
                                                    <strong className="text-white">
                                                        {benchmarkResult.gateStatus.approved.cleanRunnable}/
                                                        {benchmarkResult.gateStatus.gate.minimumSamples}
                                                    </strong>
                                                </span>
                                                <span>
                                                    추가 필요{' '}
                                                    <strong className="text-amber-200">
                                                        {benchmarkResult.gateStatus.gate.additionalCleanApprovalsRequired}
                                                    </strong>
                                                </span>
                                                <span>
                                                    라벨 충돌{' '}
                                                    <strong className={benchmarkResult.gateStatus.approved.conflictGroups > 0
                                                        ? 'text-red-300'
                                                        : 'text-emerald-300'}>
                                                        {benchmarkResult.gateStatus.approved.conflictGroups}
                                                    </strong>
                                                </span>
                                                <span>
                                                    중복 제외{' '}
                                                    <strong className="text-gray-200">
                                                        {benchmarkResult.gateStatus.approved.duplicatesExcluded}
                                                    </strong>
                                                </span>
                                                <span>
                                                    미해소 HITL{' '}
                                                    <strong className={benchmarkResult.gateStatus.hitl.unresolvedHighConfidence > 0
                                                        ? 'text-amber-200'
                                                        : 'text-emerald-300'}>
                                                        {benchmarkResult.gateStatus.hitl.unresolvedHighConfidence}
                                                    </strong>
                                                </span>
                                            </div>
                                            {benchmarkResult.gateStatus.blockers.length > 0 && (
                                                <div className="mt-2 flex flex-wrap gap-1">
                                                    {benchmarkResult.gateStatus.blockers.map((blocker, index) => (
                                                        <span
                                                            key={`${blocker.code}-${index}`}
                                                            className="rounded border border-amber-800/70 bg-amber-950/30 px-2 py-1 text-[9px] text-amber-200"
                                                        >
                                                            {migrationBlockerLabel[blocker.code] || blocker.code}
                                                            {typeof blocker.count === 'number' ? ` ${blocker.count}건` : ''}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                            <p className="mt-2 text-[10px] text-cyan-100">
                                                다음 조치: {benchmarkResult.gateStatus.recommendedAction}
                                            </p>
                                            <p className="mt-2 break-all font-mono text-[9px] text-gray-500">
                                                {benchmarkResult.gateStatusPath}
                                            </p>
                                        </div>
                                    )}
                                    <div className="mt-3 flex flex-wrap gap-1.5">
                                        {benchmarkResult.report.summary.perClass.map(item => (
                                            <span
                                                key={item.defectClass}
                                                className={`rounded border px-2 py-1 text-[10px] ${
                                                    item.covered
                                                        ? 'border-emerald-700 bg-emerald-950/40 text-emerald-200'
                                                        : item.total > 0
                                                            ? 'border-amber-700 bg-amber-950/40 text-amber-200'
                                                            : 'border-gray-700 bg-gray-900/50 text-gray-500'
                                                }`}
                                            >
                                                {DEFECT_CLASS_LABELS[item.defectClass] || item.defectClass}{' '}
                                                <strong>{item.total}/{item.requiredSamples}</strong>
                                                {item.total > 0 && <span> · 정확도 {item.accuracy}%</span>}
                                            </span>
                                        ))}
                                    </div>
                                    <p className="mt-2 break-all font-mono text-[10px] text-gray-500">{benchmarkResult.reportPath}</p>
                                </div>
                            )}

                            {visionStatus && (
                                <div className={`rounded border p-3 text-xs ${
                                    visionStatus.includes('실패') || visionStatus.includes('상충') || visionStatus.includes('입력')
                                        ? 'border-red-800 bg-red-950/30 text-red-200'
                                        : 'border-emerald-800 bg-emerald-950/30 text-emerald-200'
                                }`}>
                                    {visionStatus}
                                </div>
                            )}

                            {orderedVisionItems.length === 0 && !isLoadingVision ? (
                                <div className="flex min-h-[240px] items-center justify-center rounded border border-dashed border-gray-700 text-gray-500">
                                    Common Agent Vision 데이터가 없습니다.
                                </div>
                            ) : (
                                <div className="grid gap-4 lg:grid-cols-2">
                                    {orderedVisionItems.map(item => {
                                        const isConflict = conflictIds.has(item.image_id);
                                        const isUpdating = updatingImageId === item.image_id;
                                        const isSuggesting = suggestingImageId === item.image_id;
                                        const suggestion = labelSuggestions[item.image_id];
                                        return (
                                            <article
                                                key={item.image_id}
                                                className={`overflow-hidden rounded-lg border ${
                                                    isConflict ? 'border-red-600/70 bg-red-950/10' : 'border-gray-650 bg-gray-750'
                                                }`}
                                            >
                                                <div className="flex min-h-40">
                                                    <div className="flex w-40 shrink-0 items-center justify-center bg-black/70">
                                                        {imageUrls[item.image_id] ? (
                                                            <img
                                                                src={imageUrls[item.image_id]}
                                                                alt={item.defect_type || item.image_id}
                                                                className="max-h-40 w-full object-contain"
                                                            />
                                                        ) : (
                                                            <span className="text-xs text-gray-600">No preview</span>
                                                        )}
                                                    </div>
                                                    <div className="min-w-0 flex-1 p-4">
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${statusBadgeClass(item.review_status)}`}>
                                                                {(item.review_status || 'candidate').toUpperCase()}
                                                            </span>
                                                            {isConflict && (
                                                                <span className="rounded bg-red-700 px-2 py-0.5 text-[10px] font-bold text-white">LABEL CONFLICT</span>
                                                            )}
                                                        </div>
                                                        <p className="mt-2 truncate font-mono text-[10px] text-gray-500">{item.image_id}</p>
                                                        <label className="mt-3 block text-[10px] font-bold text-gray-400">검토 불량명</label>
                                                        <input
                                                            value={editedLabels[item.image_id] || ''}
                                                            onChange={event => setEditedLabels(current => ({
                                                                ...current,
                                                                [item.image_id]: event.target.value
                                                            }))}
                                                            className="mt-1 w-full rounded border border-gray-600 bg-gray-900 px-3 py-2 text-sm font-bold text-white outline-none focus:border-cyan-500"
                                                            aria-label={`${item.image_id} defect label`}
                                                        />
                                                        <p className={`mt-1 text-[10px] ${
                                                            DEFECT_CLASS_LABELS[canonicalDefectClass(editedLabels[item.image_id])]
                                                                ? 'text-cyan-400'
                                                                : 'text-gray-500'
                                                        }`}>
                                                            {DEFECT_CLASS_LABELS[canonicalDefectClass(editedLabels[item.image_id])]
                                                                ? `벤치마크 결함군: ${DEFECT_CLASS_LABELS[canonicalDefectClass(editedLabels[item.image_id])]}`
                                                                : '벤치마크 필수 7개 결함군 외 라벨'}
                                                        </p>
                                                        <p className="mt-2 line-clamp-2 text-xs text-gray-400">
                                                            {item.observation?.summary || item.question || '현상 설명 없음'}
                                                        </p>
                                                        {suggestion && (
                                                            <div className={`mt-2 rounded border p-2 text-[10px] ${
                                                                suggestion.classifiable
                                                                    ? 'border-cyan-800/70 bg-cyan-950/30 text-cyan-100'
                                                                    : 'border-amber-800/70 bg-amber-950/30 text-amber-100'
                                                            }`}>
                                                                <div className="flex items-center justify-between gap-2">
                                                                    <strong>
                                                                        {suggestion.classifiable ? '비영속 AI 제안' : '비영속 AI 판정 불가'}
                                                                    </strong>
                                                                    <span>
                                                                        {suggestion.classifiable
                                                                            ? `${Math.round(suggestion.confidence * 100)}%`
                                                                            : '라벨 미변경'}
                                                                    </span>
                                                                </div>
                                                                <p className="mt-1 line-clamp-2 text-cyan-100/80">
                                                                    {suggestion.summary || suggestion.defectType}
                                                                </p>
                                                                <p className="mt-1 text-amber-200">
                                                                    {suggestion.classifiable
                                                                        ? '검토 후 승인 버튼을 눌러야 DB·Graph에 반영됩니다.'
                                                                        : '실제 제품 사진을 다시 등록하거나 이 레코드를 반려하세요.'}
                                                                </p>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="flex flex-wrap gap-2 border-t border-gray-700 p-3">
                                                    <button
                                                        onClick={() => void suggestVisionLabel(item)}
                                                        disabled={isUpdating || isSuggesting}
                                                        className="rounded bg-cyan-800 px-3 py-1.5 text-xs font-bold text-white hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-40"
                                                    >
                                                        {isSuggesting ? 'AI 판정 중...' : 'AI 라벨 제안'}
                                                    </button>
                                                    <button
                                                        onClick={() => reviewVisionItem(item, 'approve')}
                                                        disabled={isUpdating || isSuggesting || isConflict}
                                                        title={isConflict ? '상충 중복 레코드를 먼저 반려하세요.' : '승인 후 Graph 승격'}
                                                        className="rounded bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-40"
                                                    >
                                                        승인 + Graph
                                                    </button>
                                                    <button
                                                        onClick={() => reviewVisionItem(item, 'needs_review')}
                                                        disabled={isUpdating}
                                                        className="rounded bg-amber-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-600 disabled:opacity-40"
                                                    >
                                                        검토 보류
                                                    </button>
                                                    <button
                                                        onClick={() => reviewVisionItem(item, 'reject')}
                                                        disabled={isUpdating}
                                                        className="ml-auto rounded bg-red-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-600 disabled:opacity-40"
                                                    >
                                                        오류 레코드 반려
                                                    </button>
                                                </div>
                                            </article>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'stats' && (
                        <div className="space-y-6 font-mono">
                            <div>
                                <div className="mb-3 text-indigo-300">[Local Rollback Store: MoldMasterDB]</div>
                                <div className="space-y-2 rounded border border-gray-700 bg-gray-900 p-4">
                                    <div className="flex justify-between text-gray-200"><span>Images</span><span>{stats.imageCount} files</span></div>
                                    <div className="flex justify-between text-gray-200"><span>Training Set</span><span>{stats.trainingSetCount} legacy samples</span></div>
                                    <div className="flex justify-between text-gray-200"><span>Vector Store</span><span>{stats.vectorCount} legacy chunks</span></div>
                                    <div className="flex justify-between text-gray-200"><span>Knowledge Matrix</span><span>{stats.knowledgeMatrixCount || 0} legacy rows</span></div>
                                    <div className="flex justify-between text-gray-200"><span>Feedback Records</span><span>{stats.defectCount || 0} records</span></div>
                                </div>
                            </div>
                            <div className="rounded border border-amber-800/60 bg-amber-950/20 p-4 text-xs text-amber-200">
                                이 데이터는 전환 검증과 롤백 증거로만 보존됩니다. 현재 분석, RAG, Graph 게시의 기준 데이터는 Common Agent입니다.
                            </div>
                        </div>
                    )}

                    {activeTab === 'web-knowledge' && <WebKnowledgeReviewPanel />}

                    {activeTab === 'legacy' && (
                        <div className="space-y-3">
                            <p className="rounded border border-gray-700 bg-gray-900 p-3 text-xs text-gray-400">
                                과거 로컬 HITL 기록의 읽기 전용 보관함입니다. 여기의 상태는 Common Agent SQL 또는 Graph를 변경하지 않습니다.
                            </p>
                            {feedbackData.length === 0 ? (
                                <div className="flex min-h-[240px] items-center justify-center rounded border border-dashed border-gray-700 text-gray-500">
                                    저장된 과거 피드백이 없습니다.
                                </div>
                            ) : feedbackData.map(item => (
                                <div key={item.id} className="rounded border border-gray-600 bg-gray-700/50 p-4">
                                    <div className="mb-2 flex flex-wrap items-center gap-2">
                                        <span className="font-bold text-indigo-300">{item.analysis.defectType || 'Unknown'}</span>
                                        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusBadgeClass(item.status)}`}>
                                            {item.status.toUpperCase()}
                                        </span>
                                        <span className="text-xs text-gray-500">{new Date(item.timestamp).toLocaleString()}</span>
                                    </div>
                                    <p className="whitespace-pre-wrap text-xs text-gray-300">{item.analysis.description || '-'}</p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
            {previewLocalCandidate && (
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-label="후보 이미지 확대 검토"
                    className="fixed inset-0 z-[60] flex items-center justify-center bg-black/95 p-4"
                    onClick={event => {
                        event.stopPropagation();
                        closeLocalCandidatePreview();
                    }}
                >
                    <div
                        className="flex max-h-[94vh] w-full max-w-7xl flex-col overflow-hidden rounded-xl border border-cyan-800/80 bg-gray-950 shadow-2xl"
                        onClick={event => event.stopPropagation()}
                    >
                        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-800 bg-gray-900 px-5 py-4">
                            <div className="min-w-0">
                                <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">
                                    Human Review · Original Image
                                </p>
                                <h3 className="mt-1 truncate text-lg font-bold text-white">
                                    {previewLocalCandidate.fileName}
                                </h3>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="rounded bg-cyan-950/70 px-2 py-1 text-[10px] font-bold text-cyan-200">
                                    검토 후보 {previewReviewIndex + 1} / {visibleLocalReviewQueue.length}
                                </span>
                                <span className="rounded bg-gray-800 px-2 py-1 text-[10px] text-gray-300">
                                    {previewLocalCandidate.width} × {previewLocalCandidate.height}
                                </span>
                                <button
                                    type="button"
                                    aria-label="이전 검토 후보"
                                    onClick={() => navigateLocalCandidatePreview(-1)}
                                    disabled={previewReviewIndex <= 0}
                                    className="rounded border border-gray-700 px-2 py-1.5 text-xs font-bold text-gray-200 hover:border-cyan-500 disabled:cursor-not-allowed disabled:opacity-35"
                                >
                                    이전
                                </button>
                                <button
                                    type="button"
                                    aria-label="다음 검토 후보"
                                    onClick={() => navigateLocalCandidatePreview(1)}
                                    disabled={previewReviewIndex < 0 || previewReviewIndex >= visibleLocalReviewQueue.length - 1}
                                    className="rounded border border-gray-700 px-2 py-1.5 text-xs font-bold text-gray-200 hover:border-cyan-500 disabled:cursor-not-allowed disabled:opacity-35"
                                >
                                    다음
                                </button>
                                <button
                                    type="button"
                                    aria-label="확대 보기 닫기"
                                    onClick={closeLocalCandidatePreview}
                                    className="rounded border border-gray-700 px-3 py-1.5 text-sm font-bold text-gray-200 hover:border-red-500 hover:bg-red-950/40"
                                >
                                    닫기 (Esc)
                                </button>
                            </div>
                        </header>
                        <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_360px]">
                            <div className="flex min-h-[420px] items-center justify-center overflow-auto bg-black p-4">
                                {previewLocalCandidateImage ? (
                                    <img
                                        src={previewLocalCandidateImage.dataUrl}
                                        alt={`${previewLocalCandidate.fileName} 원본`}
                                        className="max-h-[76vh] max-w-full object-contain"
                                    />
                                ) : previewLocalCandidateError ? (
                                    <p className="max-w-lg rounded border border-red-800 bg-red-950/40 p-4 text-sm text-red-200">
                                        {previewLocalCandidateError}
                                    </p>
                                ) : (
                                    <p className="text-sm text-cyan-200">원본 이미지 무결성 확인 및 로딩 중...</p>
                                )}
                            </div>
                            <aside className="overflow-y-auto border-l border-gray-800 bg-gray-900/80 p-5">
                                <section>
                                    <h4 className="text-xs font-bold text-cyan-200">원문/AI 비교</h4>
                                    <dl className="mt-3 space-y-3 text-xs">
                                        <div>
                                            <dt className="text-gray-500">원문 라벨</dt>
                                            <dd className="mt-1 font-bold text-white">
                                                {previewLocalCandidate.labelEvidence?.sourceLabel
                                                    || previewLocalCandidate.proposedDefectType
                                                    || '근거 없음'}
                                            </dd>
                                        </div>
                                        <div>
                                            <dt className="text-gray-500">Vision 제안</dt>
                                            <dd className="mt-1 font-bold text-white">
                                                {previewLocalCandidate.labelEvidence?.visionSuggestedLabel || '제안 없음'}
                                                {typeof previewLocalCandidate.labelEvidence?.visionConfidence === 'number'
                                                    ? ` · ${Math.round(previewLocalCandidate.labelEvidence.visionConfidence * 100)}%`
                                                    : ''}
                                            </dd>
                                        </div>
                                        <div>
                                            <dt className="text-gray-500">현재 검토 라벨</dt>
                                            <dd className="mt-1 font-bold text-emerald-300">
                                                {localCandidateLabels[previewLocalCandidate.candidateId] || '미입력'}
                                            </dd>
                                        </div>
                                    </dl>
                                    <label className="mt-4 flex items-start gap-2 rounded border border-blue-800/80 bg-blue-950/40 p-3 text-[10px] leading-4 text-blue-100">
                                        <input
                                            type="checkbox"
                                            checked={Boolean(
                                                confirmedHumanApprovals[previewLocalCandidate.candidateId]
                                            )}
                                            onChange={event => setConfirmedHumanApprovals(current => ({
                                                ...current,
                                                [previewLocalCandidate.candidateId]: event.target.checked
                                            }))}
                                            aria-label="원본을 확인했고 현재 결함 라벨로 승인 및 Graph 승격에 동의"
                                            className="mt-0.5"
                                        />
                                        <span>
                                            원본을 확인했고 현재 결함 라벨로 승인 및 Graph 승격에 동의합니다.
                                            <strong className="mt-1 block text-blue-300">
                                                이 체크만으로 서버 저장은 실행되지 않습니다.
                                            </strong>
                                        </span>
                                    </label>
                                </section>
                                <section className="mt-5 border-t border-gray-800 pt-4">
                                    <h4 className="text-xs font-bold text-cyan-200">Vision 관찰 요약</h4>
                                    <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-gray-300">
                                        {previewLocalCandidate.labelEvidence?.visionSummary || '관찰 요약 없음'}
                                    </p>
                                </section>
                                <section className="mt-5 border-t border-gray-800 pt-4">
                                    <h4 className="text-xs font-bold text-cyan-200">현장·원문 문맥</h4>
                                    <p className="mt-2 max-h-44 overflow-y-auto whitespace-pre-wrap text-xs leading-5 text-gray-300">
                                        {localCandidateContexts[previewLocalCandidate.candidateId]
                                            || previewLocalCandidate.fieldContext
                                            || '추가 문맥 없음'}
                                    </p>
                                </section>
                                {previewLocalCandidate.sourceLineage?.webCaseId && (
                                    <section className="mt-5 border-t border-gray-800 pt-4">
                                        <h4 className="text-xs font-bold text-cyan-200">Web Case 출처·라이선스</h4>
                                        <dl className="mt-2 space-y-2 text-[10px] text-gray-300">
                                            <div>
                                                <dt className="text-gray-500">Case ID</dt>
                                                <dd className="mt-0.5 break-all font-mono">
                                                    {previewLocalCandidate.sourceLineage.webCaseId}
                                                </dd>
                                            </div>
                                            <div>
                                                <dt className="text-gray-500">출처</dt>
                                                <dd className="mt-0.5">
                                                    {previewLocalCandidate.sourceLineage.sourcePublisher || '-'}
                                                    {previewLocalCandidate.sourceLineage.sourceTitle
                                                        ? ` · ${previewLocalCandidate.sourceLineage.sourceTitle}`
                                                        : ''}
                                                </dd>
                                            </div>
                                            <div>
                                                <dt className="text-gray-500">라이선스</dt>
                                                <dd className="mt-0.5 text-emerald-300">
                                                    {previewLocalCandidate.sourceLineage.license || '확인 필요'}
                                                </dd>
                                            </div>
                                            {previewLocalCandidate.sourceLineage.sourceRecordId && (
                                                <div>
                                                    <dt className="text-gray-500">라이선스 원장 ID</dt>
                                                    <dd className="mt-0.5 font-mono">
                                                        {previewLocalCandidate.sourceLineage.sourceRecordId}
                                                    </dd>
                                                </div>
                                            )}
                                            {previewLocalCandidate.sourceLineage.sourceCitation && (
                                                <div>
                                                    <dt className="text-gray-500">문헌 인용</dt>
                                                    <dd className="mt-0.5">
                                                        {previewLocalCandidate.sourceLineage.sourceCitation}
                                                    </dd>
                                                </div>
                                            )}
                                        </dl>
                                        <div className="mt-3 flex flex-wrap gap-2">
                                            {previewLocalCandidate.sourceLineage.sourceUrl && (
                                                <a
                                                    href={previewLocalCandidate.sourceLineage.sourceUrl}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="inline-flex rounded border border-sky-700 px-2 py-1 text-[10px] font-bold text-sky-200 hover:bg-sky-950"
                                                >
                                                    원문 출처 열기
                                                </a>
                                            )}
                                            {previewLocalCandidate.sourceLineage.licenseVerificationUrl && (
                                                <a
                                                    href={previewLocalCandidate.sourceLineage.licenseVerificationUrl}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="inline-flex rounded border border-emerald-700 px-2 py-1 text-[10px] font-bold text-emerald-200 hover:bg-emerald-950"
                                                >
                                                    라이선스 원장 열기
                                                </a>
                                            )}
                                        </div>
                                    </section>
                                )}
                                <section className="mt-5 border-t border-gray-800 pt-4">
                                    <h4 className="text-xs font-bold text-cyan-200">검토 근거</h4>
                                    <div className="mt-2 flex flex-wrap gap-1">
                                        {(previewLocalCandidate.reviewReasons || []).length > 0
                                            ? previewLocalCandidate.reviewReasons?.map(reason => (
                                                <span
                                                    key={reason}
                                                    className="rounded border border-gray-700 bg-gray-950 px-2 py-1 text-[10px] text-gray-300"
                                                >
                                                    {reason}
                                                </span>
                                            ))
                                            : <span className="text-xs text-gray-500">추가 근거 없음</span>}
                                    </div>
                                </section>
                                <p className="mt-5 break-all border-t border-gray-800 pt-4 font-mono text-[9px] text-gray-600">
                                    SHA-256 {previewLocalCandidate.contentSha256}
                                </p>
                            </aside>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DatabaseView;
