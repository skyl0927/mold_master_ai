import { DefectAnalysis, RetrievalMode, VisionObservationSummary } from '../types';
import { normalizeVisionObservation } from '../visionObservation';
import { getAgentServerBaseUrl } from './runtimeConfig';
import { compactDefectAnalysis } from './reportContentFormatter';
import type { VisionDatasetItem } from './visionDatasetReadinessService';

export interface CommonAgentObservation {
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
    decision: 'approve' | 'needs_review' | 'reject' | 'edit';
    defectType: string;
    observationSummary: string;
    visibleFeatures?: string[];
    possibleCauses?: string[];
    recommendedChecks?: string[];
    labels?: string[];
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
    created_at?: string;
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
        const possibleCauses = observation.possible_causes || [];
        const recommendedChecks = observation.recommended_checks || [];
        const evidence = response.evidence || [];
        const metadataCandidates = response.metadata?.vision_candidates || response.metadata?.top_candidates;
        const visionSummary = normalizeVisionObservation({
            ...observation,
            candidates: observation.candidates || observation.top_candidates || metadataCandidates
        }) as VisionObservationSummary;

        return compactDefectAnalysis({
            defectType: visionSummary.primaryCandidate?.defectType
                || observation.defect_type
                || '판정 불가 (사람 검토 필요)',
            severity: observation.severity || 'Medium',
            description: observation.summary || response.answer || '',
            possibleCauses: possibleCauses.length > 0 ? possibleCauses.join('\n') : '',
            countermeasures: recommendedChecks.join('\n'),
            rawOutput: JSON.stringify(response, null, 2),
            visionSummary,
            retrievalSummary: {
                modeUsed,
                citations: evidence.map(item => item.source_ref || item.node_id || '').filter(Boolean),
                evidenceCount: evidence.length,
                graphTrace: response.retrieval_query ? [response.retrieval_query] : [],
                graphGrounded: evidence.some(item => item.source_type === 'knowledge_path' || item.source_type === 'knowledge_relation'),
                llmSupplemented: true
            }
        });
    }
}
