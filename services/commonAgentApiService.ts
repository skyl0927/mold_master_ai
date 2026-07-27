import {
    DefectAnalysis,
    RetrievalMode,
    VisionObservationCategory,
    VisionObservationSummary,
    VisionFusionSummary,
    VisionViewEvidence,
    VisionGraphGroundingSummary
} from '../types';
import { normalizeVisionObservation } from '../visionObservation';
import { guardDefectAnalysisForVisionRisk } from '../visionDiagnosisGuard';
import { getAgentServerBaseUrl } from './runtimeConfig';
import { compactDefectAnalysis } from './reportContentFormatter';
import type { VisionDatasetItem } from './visionDatasetReadinessService';

export interface CommonAgentObservation {
    contract_version?: string;
    image_kind?: 'physical_product' | 'document_or_diagram' | 'unknown';
    normality_status?: 'defect_visible' | 'no_defect_visible' | 'uncertain';
    observations?: Array<{
        observation_id: string;
        category: VisionObservationCategory;
        description: string;
        region?: string;
        confidence?: number;
        source?: 'image';
    }>;
    summary?: string;
    defect_type?: string;
    process_area?: string;
    severity?: string;
    visible_features?: string[];
    possible_causes?: string[];
    recommended_checks?: string[];
    labels?: string[];
    confidence?: number;
    raw_output?: string;
    candidates?: Array<Record<string, any>>;
    top_candidates?: Array<Record<string, any>>;
    required_additional_views?: string[];
    quality_concerns?: string[];
    abstention_reason?: string;
}

export interface CommonAgentEvidence {
    node_id?: string;
    text?: string;
    score?: number;
    source_type?: string;
    source_ref?: string;
    cluster_label?: string;
    review_status?: string;
    metadata?: Record<string, any>;
}

export interface CommonAgentAskResponse {
    query_id?: string;
    answer: string;
    confidence: number;
    evidence: CommonAgentEvidence[];
    reasoning_trace?: string[];
    session_id?: string;
}

export interface CommonAgentGraphPathNode {
    entity_id: string;
    label: string;
    name: string;
    evidence_text?: string;
    confidence?: number;
    review_status?: string;
}

export interface CommonAgentGraphPathRelationship {
    relationship_id: string;
    relation_type: string;
    evidence_text?: string;
    confidence?: number;
    review_status?: string;
}

export interface CommonAgentGraphPath {
    path_id: string;
    document_id: string;
    path_text: string;
    nodes: CommonAgentGraphPathNode[];
    relationships: CommonAgentGraphPathRelationship[];
    score: number;
    review_status?: string;
}

export interface CommonAgentGraphPathResponse {
    question: string;
    paths: CommonAgentGraphPath[];
}

export interface CommonAgentFeedbackResponse {
    status: string;
    target_id: string;
    review_status: string;
    document_id?: string;
    query_id?: string;
}

export interface CommonAgentImageReviewRequest {
    decision: 'approve' | 'needs_review' | 'reject' | 'edit' | 'recapture';
    defectType: string;
    observationSummary: string;
    visibleFeatures?: string[];
    possibleCauses?: string[];
    recommendedChecks?: string[];
    labels?: string[];
    observation?: CommonAgentObservation;
    processArea?: string;
    severity?: string;
    question?: string;
    answer?: string;
    comment?: string;
    promoteToGraph?: boolean;
    forcePromote?: boolean;
    metadata?: Record<string, any>;
}

export interface CommonAgentImageReviewResponse {
    status: 'reviewed';
    next_action: string;
    item: {
        image_id: string;
        defect_type?: string;
        review_status: string;
        metadata?: Record<string, any>;
    };
    promotion?: {
        image_id: string;
        document_id: string;
        review_status: string;
        entities: number;
        relations: number;
    };
}

export interface CommonAgentIngestResponse {
    document_id: string;
    review_status: string;
    persisted_to_sql: boolean;
    persisted_to_graph: boolean;
}

export interface CommonAgentVisionDiagnosis {
    image_id: string;
    file_name: string;
    mime_type: string;
    source_system: string;
    question?: string;
    observation?: CommonAgentObservation;
    retrieval_query?: string;
    answer?: string;
    confidence?: number;
    evidence?: CommonAgentEvidence[];
    review_status?: string;
    metadata?: Record<string, any>;
    view_observations?: CommonAgentVisionViewObservation[];
    fusion_report?: CommonAgentVisionFusionReport;
    graph_grounding?: CommonAgentVisionGraphGroundingReport;
    created_at?: string;
}

export interface CommonAgentVisionViewObservation {
    view_id: string;
    local_image_id?: string;
    image_id?: string;
    file_name: string;
    capture_view_tag: string;
    is_primary: boolean;
    observation: CommonAgentObservation;
}

export interface CommonAgentVisionFusionReport {
    contract_version: 'vision-fusion/v1';
    requested_view_count: number;
    valid_view_count: number;
    available_view_tags: string[];
    missing_required_views: string[];
    disagreement_score: number;
    candidate_support: Array<{
        defect_type: string;
        fused_confidence: number;
        supporting_view_ids: string[];
        contradicting_view_ids: string[];
        supporting_view_count: number;
        supporting_observation_ids: string[];
        contradicting_observation_ids: string[];
    }>;
    decision_status: 'probable' | 'needs_review' | 'unclassifiable';
    decision_reason: string;
}

export interface CommonAgentVisionGraphPathCitation {
    path_id: string;
    document_id: string;
    path_text: string;
    hop_count: number;
    score: number;
    review_status: string;
    evidence_ids: string[];
}

export interface CommonAgentVisionGraphCandidateGrounding {
    defect_type: string;
    vision_rank: number;
    vision_confidence: number;
    status: 'supported' | 'weak' | 'unverified';
    direct_match_score: number;
    multihop_score: number;
    context_match_score: number;
    graph_support_score: number;
    approved_path_count: number;
    causes: string[];
    countermeasures: string[];
    citations: CommonAgentVisionGraphPathCitation[];
    rejected_path_reasons: string[];
}

export interface CommonAgentVisionGraphGroundingReport {
    contract_version: 'vision-graph-grounding/v1';
    candidate_grounding: CommonAgentVisionGraphCandidateGrounding[];
    graph_grounded: boolean;
    top_candidate_supported: boolean;
    vision_graph_conflict: boolean;
    approved_path_count: number;
    citation_count: number;
    grounded_causes: string[];
    grounded_countermeasures: string[];
    requires_human_review: boolean;
    auto_finalize_allowed: boolean;
    llm_supplement_allowed: boolean;
    llm_supplement_training_eligible: false;
    decision_status: 'grounded' | 'needs_review' | 'unverified';
    decision_reason: string;
}

export interface CommonAgentSessionViewUpload {
    file: File;
    localImageId: string;
    captureViewTag: string;
    imageKind: 'physical_product' | 'document_or_diagram' | 'unknown';
    captureSource: 'camera' | 'screen' | 'file' | 'mobile';
}

export interface NormalizedBbox {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface CommonAgentAnnotationRequest {
    label: string;
    annotation_type: 'bbox';
    bbox: NormalizedBbox & { coordinate_system: 'normalized_xywh' };
    review_status: 'candidate' | 'approved' | 'rejected' | 'needs_review';
    source_app: string;
    created_by?: string;
    note?: string;
    metadata?: Record<string, any>;
}

export interface CommonAgentAnnotation {
    annotation_id: string;
    image_id: string;
    label: string;
    annotation_type: string;
    bbox?: NormalizedBbox & { coordinate_system: string };
    review_status: string;
    source_app: string;
    metadata?: Record<string, any>;
}

export interface CommonAgentLearningReadyVisionExportItem {
    image_id: string;
    file_name: string;
    mime_type: string;
    file_url: string;
    review_status: 'approved' | 'candidate' | 'needs_review' | 'rejected';
    split: 'train' | 'val' | 'test';
    split_key?: string;
    class_name: string;
    labels: string[];
    defect_type?: string;
    process_area?: string;
    severity?: string;
    capture_session_id?: string;
    capture_view_tag?: string;
    capture_protocol_ready: boolean;
    learning_candidate_eligible: boolean;
    content_hash?: string;
    product_family?: string;
    mold_id?: string;
    confidence?: number;
    vision_confidence?: number;
    graph_document_id?: string;
    annotation_count: number;
}

export interface CommonAgentLearningReadyVisionExport {
    dataset_name: string;
    format: 'classification_manifest';
    learning_ready_only: boolean;
    capture_ready_count: number;
    excluded_counts: Record<string, number>;
    items: CommonAgentLearningReadyVisionExportItem[];
    total: number;
    split_counts: Record<string, number>;
    defect_type_counts: Record<string, number>;
    warnings: string[];
    generated_at?: string;
}

export interface CommonAgentVisionReferenceBenchmarkRequest {
    embedding_model_version: string;
    top_k?: number;
    minimum_reference_support?: number;
    minimum_samples?: number;
    required_defect_types?: string[];
    minimum_samples_per_class?: number;
    minimum_top1_accuracy?: number;
    minimum_top3_accuracy?: number;
}

export interface CommonAgentVisionReferenceBenchmarkResponse {
    embedding_model_version: string;
    embedding_provider?: string | null;
    embedding_model_name?: string | null;
    embedding_dimensions?: number | null;
    embedding_device?: string | null;
    embedding_runtime?: string | null;
    embedding_production_ready?: boolean | null;
    reference_count: number;
    evaluated_count: number;
    top1_accuracy: number;
    top3_accuracy: number;
    required_defect_types: string[];
    per_class: Array<{
        defect_type: string;
        total: number;
        top1_correct: number;
        top3_correct: number;
        top1_accuracy: number;
        top3_accuracy: number;
        required_samples: number;
        covered: boolean;
    }>;
    gate_checks: Record<string, boolean>;
    failed_gate_checks: string[];
    ready_for_graph_retrieval: boolean;
    results?: Array<Record<string, any>>;
    warnings: string[];
}

export interface CommonAgentVisionReferenceCurrentStatus {
    ready: boolean;
    status: 'ready' | 'missing' | 'invalid';
    store_dir?: string | null;
    manifest_id?: string | null;
    manifest_path?: string | null;
    embedding_model_version?: string | null;
    embedding_provider?: string | null;
    embedding_model_name?: string | null;
    embedding_dimensions?: number | null;
    embedding_device?: string | null;
    embedding_runtime?: string | null;
    embedding_production_ready?: boolean | null;
    reference_count: number;
    source_item_count?: number;
    source_learning_ready_only?: boolean;
    generated_at?: string | null;
    updated_at?: string | null;
    warnings: string[];
    message?: string | null;
}

export interface CommonAgentVisionReferenceRefreshResponse {
    status: string;
    manifest_id: string;
    reference_count: number;
    store_dir: string;
    embedding_model_version?: string | null;
    warnings: string[];
}

const getAgentUrl = async (path: string): Promise<string> => {
    const baseUrl = await getAgentServerBaseUrl();
    return `${baseUrl}${path}`;
};

const postJson = async <T>(path: string, payload: unknown): Promise<T> => {
    const response = await fetch(await getAgentUrl(path), {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const detail = await response.text();
        throw new Error(`Common Agent request failed: ${response.status} ${response.statusText} - ${detail}`);
    }

    return await response.json() as T;
};

const patchJson = async <T>(path: string, payload: unknown): Promise<T> => {
    const response = await fetch(await getAgentUrl(path), {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const detail = await response.text();
        throw new Error(`Common Agent request failed: ${response.status} ${response.statusText} - ${detail}`);
    }

    return await response.json() as T;
};

const getJson = async <T>(path: string): Promise<T> => {
    const response = await fetch(await getAgentUrl(path));
    if (!response.ok) {
        const detail = await response.text();
        throw new Error(`Common Agent request failed: ${response.status} ${response.statusText} - ${detail}`);
    }
    return await response.json() as T;
};

const normalizeLabel = (value?: string): string =>
    (value || '').toLocaleLowerCase().replace(/[\s()[\]{}_\-.,:;/'"]/g, '');

const sha256Hex = async (content: ArrayBuffer): Promise<string> => {
    const digest = await crypto.subtle.digest('SHA-256', content);
    return Array.from(new Uint8Array(digest))
        .map(byte => byte.toString(16).padStart(2, '0'))
        .join('');
};

export class CommonAgentApiService {
    static async checkServerStatus(): Promise<boolean> {
        try {
            const response = await fetch(await getAgentUrl('/healthz'));
            return response.ok;
        } catch {
            return false;
        }
    }

    static async diagnoseImage(
        imageFile: File,
        options: {
            question?: string;
            sourceSystem?: string;
            processArea?: string;
            ragCategory?: string;
            metadata?: Record<string, any>;
            sessionId?: string;
            persistMode?: 'always' | 'classifiable_only';
            sessionViews?: CommonAgentSessionViewUpload[];
        } = {}
    ): Promise<CommonAgentVisionDiagnosis> {
        const formData = new FormData();
        formData.append('file', imageFile);
        formData.append(
            'question',
            options.question || [
                '이 현장 이미지의 문제점, 원인, 대책을 시방서 문장으로 작성하세요.',
                '문제점은 관찰 사실 1문장, 원인과 대책은 각각 핵심 3개 이내로 작성하고 추론 과정과 검색 경로는 제외하세요.'
            ].join(' ')
        );
        formData.append('source_system', options.sourceSystem || 'mold-master-ai');
        formData.append('persist_mode', options.persistMode || 'classifiable_only');
        if (options.processArea) formData.append('process_area', options.processArea);
        if (options.ragCategory) formData.append('rag_category', options.ragCategory);
        if (options.sessionId) formData.append('session_id', options.sessionId);
        if (options.metadata) formData.append('metadata_json', JSON.stringify(options.metadata));
        const primaryViewTag = Array.isArray(options.metadata?.capture_view_tags)
            ? String(options.metadata.capture_view_tags[0] || '')
            : '';
        const viewManifest = [{
            local_image_id: String(options.metadata?.local_image_id || imageFile.name),
            capture_view_tag: primaryViewTag,
            image_kind: String(options.metadata?.vision_image_kind || 'unknown'),
            capture_source: String(options.metadata?.capture_source || 'file'),
            is_primary: true
        }];
        for (const sessionView of options.sessionViews || []) {
            formData.append('view_files', sessionView.file);
            viewManifest.push({
                local_image_id: sessionView.localImageId,
                capture_view_tag: sessionView.captureViewTag,
                image_kind: sessionView.imageKind,
                capture_source: sessionView.captureSource,
                is_primary: false
            });
        }
        if ((options.sessionViews || []).length > 0) {
            formData.append('view_manifest_json', JSON.stringify(viewManifest));
        }

        const response = await fetch(await getAgentUrl('/v1/vision/diagnose'), {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const detail = await response.text();
            throw new Error(`Common Agent vision diagnose failed: ${response.status} ${response.statusText} - ${detail}`);
        }

        return await response.json() as CommonAgentVisionDiagnosis;
    }

    static async askKnowledge(
        question: string,
        options: {
            topK?: number;
            category?: string;
            sessionId?: string;
            includeRag?: boolean;
            evidencePolicy?: 'balanced' | 'graph_only' | 'graph_approved_only';
        } = {}
    ): Promise<CommonAgentAskResponse> {
        return await postJson<CommonAgentAskResponse>('/v1/ask', {
            question,
            top_k: options.topK || 5,
            session_id: options.sessionId || `mold-master-${Date.now()}`,
            filters: {
                include_rag: options.includeRag ?? true,
                rag_category: options.category || 'all',
                include_reasoning_paths: true,
                include_knowledge_graph: true,
                include_knowledge_relations: true,
                evidence_policy: options.evidencePolicy || 'balanced',
                source_app: 'mold-master-ai'
            }
        });
    }

    static async queryGraphPaths(
        question: string,
        options: { topK?: number; maxHops?: number } = {}
    ): Promise<CommonAgentGraphPathResponse> {
        return await postJson<CommonAgentGraphPathResponse>('/v1/graph/paths', {
            question,
            top_k: options.topK || 5,
            max_hops: options.maxHops || 3,
            filters: {
                review_status: 'approved',
                source_app: 'mold-master-ai'
            }
        });
    }

    static async submitFeedback(payload: {
        targetType: 'document' | 'image_dataset' | 'image_annotation' | 'answer';
        targetId: string;
        decision: 'approve' | 'edit' | 'reject' | 'correct' | 'partially_correct' | 'incorrect' | 'insufficient_evidence';
        comment?: string;
        metadata?: Record<string, any>;
    }): Promise<CommonAgentFeedbackResponse> {
        return await postJson<CommonAgentFeedbackResponse>('/v1/feedback', {
            target_type: payload.targetType,
            target_id: payload.targetId,
            decision: payload.decision,
            comment: payload.comment,
            metadata: {
                source_app: 'mold-master-ai',
                ...payload.metadata
            }
        });
    }

    static async reviewImageDataset(
        imageId: string,
        payload: CommonAgentImageReviewRequest
    ): Promise<CommonAgentImageReviewResponse> {
        return await postJson<CommonAgentImageReviewResponse>(
            `/v1/datasets/images/${encodeURIComponent(imageId)}/review`,
            {
                decision: payload.decision,
                defect_type: payload.defectType,
                observation_summary: payload.observationSummary,
                visible_features: payload.visibleFeatures || [],
                possible_causes: payload.possibleCauses || [],
                recommended_checks: payload.recommendedChecks || [],
                labels: payload.labels || [payload.defectType],
                observation: payload.observation,
                process_area: payload.processArea || 'injection-molding',
                severity: payload.severity,
                question: payload.question,
                answer: payload.answer,
                comment: payload.comment,
                promote_to_graph: payload.promoteToGraph || false,
                force_promote: payload.forcePromote || false,
                metadata: {
                    source_app: 'mold-master-ai',
                    ...payload.metadata
                }
            }
        );
    }

    static async updateImageDatasetMetadata(
        imageId: string,
        metadata: Record<string, any>
    ): Promise<VisionDatasetItem> {
        return await patchJson<VisionDatasetItem>(
            `/v1/datasets/images/${encodeURIComponent(imageId)}`,
            {
                metadata: {
                    source_app: 'mold-master-ai',
                    ...metadata
                }
            }
        );
    }

    static async findApprovedImageLabelConflicts(options: {
        contentSha256: string;
        defectType: string;
        excludeImageId?: string;
    }): Promise<Array<{ imageId: string; defectType: string }>> {
        const response = await getJson<{
            items: Array<{
                image_id: string;
                defect_type?: string;
                review_status: string;
                metadata?: Record<string, any>;
            }>;
        }>('/v1/datasets/images?review_status=approved&include_hidden=true&limit=500');
        const expectedLabel = normalizeLabel(options.defectType);
        return (response.items || [])
            .filter(item =>
                item.image_id !== options.excludeImageId
                && item.review_status === 'approved'
                && item.metadata?.content_sha256 === options.contentSha256
                && Boolean(item.defect_type)
                && normalizeLabel(item.defect_type) !== expectedLabel
            )
            .map(item => ({
                imageId: item.image_id,
                defectType: item.defect_type || ''
            }));
    }

    static async listImageDatasets(options: {
        reviewStatus?: string;
        includeHidden?: boolean;
        limit?: number;
    } = {}): Promise<{ items: VisionDatasetItem[]; total: number }> {
        const query = new URLSearchParams({
            include_hidden: String(options.includeHidden ?? true),
            limit: String(options.limit || 500)
        });
        if (options.reviewStatus) query.set('review_status', options.reviewStatus);
        return await getJson<{ items: VisionDatasetItem[]; total: number }>(
            `/v1/datasets/images?${query.toString()}`
        );
    }

    static async loadImageDatasetsWithContentHashes(): Promise<VisionDatasetItem[]> {
        const response = await this.listImageDatasets({ includeHidden: true, limit: 500 });
        const items = response.items.map(item => ({
            ...item,
            metadata: { ...(item.metadata || {}) }
        }));
        const pending = items.filter(item =>
            item.review_status === 'approved' && !item.metadata?.content_sha256
        );
        let cursor = 0;

        const worker = async () => {
            while (cursor < pending.length) {
                const item = pending[cursor++];
                try {
                    const response = await fetch(
                        await getAgentUrl(`/v1/datasets/images/${encodeURIComponent(item.image_id)}/file`)
                    );
                    if (!response.ok) continue;
                    item.metadata = {
                        ...(item.metadata || {}),
                        content_sha256: await sha256Hex(await response.arrayBuffer())
                    };
                } catch {
                    // Missing files remain visible through the missing-hash quality metric.
                }
            }
        };

        await Promise.all(Array.from(
            { length: Math.min(4, pending.length) },
            () => worker()
        ));
        return items;
    }

    static async getImageDatasetFileUrl(imageId: string): Promise<string> {
        return await getAgentUrl(`/v1/datasets/images/${encodeURIComponent(imageId)}/file`);
    }

    static async loadLearningReadyVisionExport(options: {
        minConfidence?: number;
        minVisionConfidence?: number;
        limit?: number;
        workspaceId?: string;
        projectId?: string;
    } = {}): Promise<CommonAgentLearningReadyVisionExport> {
        const query = new URLSearchParams({
            review_status: 'approved',
            learning_ready_only: 'true',
            limit: String(options.limit || 500)
        });
        if (options.minConfidence !== undefined) {
            query.set('min_confidence', String(options.minConfidence));
        }
        if (options.minVisionConfidence !== undefined) {
            query.set('min_vision_confidence', String(options.minVisionConfidence));
        }
        if (options.workspaceId) query.set('workspace_id', options.workspaceId);
        if (options.projectId) query.set('project_id', options.projectId);

        return await getJson<CommonAgentLearningReadyVisionExport>(
            `/v1/datasets/images/export?${query.toString()}`
        );
    }

    static async benchmarkCurrentVisionReferences(
        payload: CommonAgentVisionReferenceBenchmarkRequest
    ): Promise<CommonAgentVisionReferenceBenchmarkResponse> {
        return await postJson<CommonAgentVisionReferenceBenchmarkResponse>(
            '/v1/vision/classifier/benchmark-current',
            payload
        );
    }

    static async getCurrentVisionReferenceStatus(): Promise<CommonAgentVisionReferenceCurrentStatus> {
        return await getJson<CommonAgentVisionReferenceCurrentStatus>(
            '/v1/vision/classifier/references/current'
        );
    }

    static async refreshVisionReferences(): Promise<CommonAgentVisionReferenceRefreshResponse> {
        return await postJson<CommonAgentVisionReferenceRefreshResponse>(
            '/v1/vision/classifier/references/refresh',
            {}
        );
    }

    static async ingestDocument(
        fileName: string,
        content: Uint8Array,
        options: {
            mimeType?: string;
            category?: string;
            knowledgeScope?: string;
            sourceUri?: string;
        } = {}
    ): Promise<CommonAgentIngestResponse> {
        const formData = new FormData();
        const bytes = new Uint8Array(content);
        const file = new File(
            [bytes.buffer],
            fileName,
            { type: options.mimeType || 'application/octet-stream' }
        );
        formData.append('file', file);
        formData.append('source_system', 'mold-master-ai');
        formData.append(
            'source_uri',
            options.sourceUri || `mold-master://manual-rag/${encodeURIComponent(fileName)}`
        );
        formData.append('metadata_json', JSON.stringify({
            source_app: 'mold-master-ai',
            knowledge_scope: options.knowledgeScope || 'manual_rag',
            rag_category: options.category || 'mold-master'
        }));

        const response = await fetch(await getAgentUrl('/v1/workflows/ingest-file'), {
            method: 'POST',
            body: formData
        });
        if (!response.ok) {
            const detail = await response.text();
            throw new Error(`Common Agent document ingest failed: ${response.status} ${response.statusText} - ${detail}`);
        }
        return await response.json() as CommonAgentIngestResponse;
    }

    static async deleteDocument(documentId: string): Promise<void> {
        const response = await fetch(await getAgentUrl(
            `/v1/documents/${encodeURIComponent(documentId)}?confirm=true&delete_graph=true`
        ), { method: 'DELETE' });
        if (!response.ok) {
            const detail = await response.text();
            throw new Error(`Common Agent document delete failed: ${response.status} ${response.statusText} - ${detail}`);
        }
    }

    static async listAnnotations(imageId: string): Promise<CommonAgentAnnotation[]> {
        const response = await fetch(await getAgentUrl(`/v1/datasets/images/${encodeURIComponent(imageId)}/annotations`));
        if (!response.ok) {
            const detail = await response.text();
            throw new Error(`Common Agent annotation list failed: ${response.status} ${response.statusText} - ${detail}`);
        }
        const data = await response.json();
        return data.items || [];
    }

    static async createAnnotation(
        imageId: string,
        payload: CommonAgentAnnotationRequest
    ): Promise<CommonAgentAnnotation> {
        return await postJson<CommonAgentAnnotation>(
            `/v1/datasets/images/${encodeURIComponent(imageId)}/annotations`,
            payload
        );
    }

    static toDefectAnalysis(response: CommonAgentVisionDiagnosis, modeUsed: RetrievalMode = 'graph_only'): DefectAnalysis {
        const observation = response.observation || {};
        const evidence = response.evidence || [];
        const metadataCandidates = response.metadata?.vision_candidates || response.metadata?.top_candidates;
        const visionSummary = normalizeVisionObservation({
            ...observation,
            candidates: observation.candidates || observation.top_candidates || metadataCandidates
        }) as VisionObservationSummary;
        const isGroundedV2 = visionSummary.contractVersion === 'vision-observation/v2';
        const graphGrounding = response.graph_grounding;
        const possibleCauses = graphGrounding?.graph_grounded
            ? graphGrounding.grounded_causes
            : isGroundedV2 ? [] : observation.possible_causes || [];
        const recommendedChecks = graphGrounding?.graph_grounded
            ? graphGrounding.grounded_countermeasures
            : isGroundedV2 ? [] : observation.recommended_checks || [];
        const visualDescription = visionSummary.visibleFeatures.join('; ');
        const fusionSummary: VisionFusionSummary | undefined = response.fusion_report
            ? {
                contractVersion: response.fusion_report.contract_version,
                requestedViewCount: response.fusion_report.requested_view_count,
                validViewCount: response.fusion_report.valid_view_count,
                availableViewTags: response.fusion_report.available_view_tags,
                missingRequiredViews: response.fusion_report.missing_required_views,
                disagreementScore: response.fusion_report.disagreement_score,
                candidateSupport: response.fusion_report.candidate_support.map(item => ({
                    defectType: item.defect_type,
                    fusedConfidence: item.fused_confidence,
                    supportingViewIds: item.supporting_view_ids,
                    contradictingViewIds: item.contradicting_view_ids,
                    supportingViewCount: item.supporting_view_count
                })),
                decisionStatus: response.fusion_report.decision_status,
                decisionReason: response.fusion_report.decision_reason
            }
            : undefined;
        const viewEvidence: VisionViewEvidence[] | undefined = response.view_observations?.map(item => {
            const normalized = normalizeVisionObservation(item.observation) as VisionObservationSummary;
            return {
                viewId: item.view_id,
                localImageId: item.local_image_id,
                serverImageId: item.image_id,
                fileName: item.file_name,
                captureViewTag: item.capture_view_tag,
                isPrimary: item.is_primary,
                observationCount: normalized.visualObservations.length,
                topCandidate: normalized.primaryCandidate?.defectType,
                confidence: normalized.primaryCandidate?.confidence || 0,
                decisionStatus: normalized.decisionStatus
            };
        });
        const graphValidation: VisionGraphGroundingSummary | undefined = graphGrounding
            ? {
                contractVersion: graphGrounding.contract_version,
                candidateGrounding: graphGrounding.candidate_grounding.map(item => ({
                    defectType: item.defect_type,
                    visionRank: item.vision_rank,
                    visionConfidence: item.vision_confidence,
                    status: item.status,
                    directMatchScore: item.direct_match_score,
                    multihopScore: item.multihop_score,
                    contextMatchScore: item.context_match_score,
                    supportScore: item.graph_support_score,
                    approvedPathCount: item.approved_path_count,
                    causes: item.causes,
                    countermeasures: item.countermeasures,
                    citations: item.citations.map(citation => ({
                        pathId: citation.path_id,
                        documentId: citation.document_id,
                        pathText: citation.path_text,
                        hopCount: citation.hop_count,
                        score: citation.score,
                        reviewStatus: citation.review_status,
                        evidenceIds: citation.evidence_ids
                    })),
                    rejectedPathReasons: item.rejected_path_reasons
                })),
                graphGrounded: graphGrounding.graph_grounded,
                topCandidateSupported: graphGrounding.top_candidate_supported,
                visionGraphConflict: graphGrounding.vision_graph_conflict,
                approvedPathCount: graphGrounding.approved_path_count,
                citationCount: graphGrounding.citation_count,
                groundedCauses: graphGrounding.grounded_causes,
                groundedCountermeasures: graphGrounding.grounded_countermeasures,
                requiresHumanReview: graphGrounding.requires_human_review,
                autoFinalizeAllowed: graphGrounding.auto_finalize_allowed,
                llmSupplementAllowed: graphGrounding.llm_supplement_allowed,
                llmSupplementTrainingEligible: graphGrounding.llm_supplement_training_eligible,
                decisionStatus: graphGrounding.decision_status,
                decisionReason: graphGrounding.decision_reason
            }
            : undefined;
        const enrichedVisionSummary: VisionObservationSummary = {
            ...visionSummary,
            decisionStatus: graphValidation?.requiresHumanReview
                ? 'needs_review'
                : visionSummary.decisionStatus,
            decisionReason: graphValidation?.requiresHumanReview
                ? graphValidation.decisionReason
                : visionSummary.decisionReason,
            fusionSummary,
            viewEvidence
        };
        const graphCitations = graphValidation?.candidateGrounding.flatMap(item =>
            item.citations.map(citation => citation.pathId)
        ) || [];
        const graphTrace = graphValidation?.candidateGrounding.flatMap(item =>
            item.citations.map(citation => citation.pathText)
        ) || [];

        const analysis = compactDefectAnalysis({
            defectType: visionSummary.primaryCandidate?.defectType
                || (!isGroundedV2 ? observation.defect_type : undefined)
                || '판정 불가 (사람 검토 필요)',
            severity: observation.severity || (isGroundedV2 ? '-' : 'Medium'),
            description: visualDescription || observation.summary || '',
            possibleCauses: possibleCauses.length > 0 ? possibleCauses.join('\n') : '',
            countermeasures: recommendedChecks.join('\n'),
            rawOutput: JSON.stringify(response, null, 2),
            visionSummary: enrichedVisionSummary,
            retrievalSummary: {
                modeUsed,
                citations: graphGrounding
                    ? Array.from(new Set(graphCitations))
                    : evidence.map(item => item.source_ref || item.node_id || '').filter(Boolean),
                evidenceCount: graphGrounding
                    ? Math.max(evidence.length, graphGrounding.approved_path_count)
                    : evidence.length,
                graphTrace: graphGrounding
                    ? Array.from(new Set(graphTrace))
                    : response.retrieval_query ? [response.retrieval_query] : [],
                graphGrounded: graphGrounding
                    ? graphGrounding.graph_grounded
                    : evidence.some(item => item.source_type === 'knowledge_path' || item.source_type === 'knowledge_relation'),
                llmSupplemented: response.metadata?.llm_supplement_used === true,
                runtimeVersions: (
                    response.metadata?.vision_model_version
                    && response.metadata?.vision_prompt_version
                    && response.metadata?.vision_graph_version
                ) ? {
                    modelVersion: response.metadata.vision_model_version,
                    promptVersion: response.metadata.vision_prompt_version,
                    graphVersion: response.metadata.vision_graph_version
                } : undefined,
                graphValidation
            }
        });
        return isGroundedV2
            ? guardDefectAnalysisForVisionRisk(analysis, enrichedVisionSummary, { graphValidation })
            : analysis;
    }
}
