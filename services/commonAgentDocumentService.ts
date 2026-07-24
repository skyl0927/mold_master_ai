import type { ReportItem } from './reportService';
import { getAgentServerBaseUrl } from './runtimeConfig';
import { compactSpecificationAnalysis } from './reportContentFormatter';

export type CommonAgentDraftType = 'review_report' | 'specification_revision';
export type CommonAgentDraftStatus = 'draft' | 'review_pending' | 'approved' | 'rejected' | 'exported';

export interface CommonAgentCaseRequest {
    case_id: string;
    title: string;
    status?: 'open' | 'in_review' | 'resolved' | 'archived';
    process_area?: string;
    product_group?: string;
    source_system?: string;
    source_refs?: string[];
    workspace?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
}

export interface CommonAgentDraftSection {
    section_id: string;
    section_type: 'spec' | 'undercut' | 'problem' | 'custom';
    title?: string;
    problem?: string;
    cause?: string;
    countermeasures?: string;
    source_image_ids?: string[];
    evidence_refs?: string[];
    metadata?: Record<string, unknown>;
}

export interface CommonAgentDraftRequest {
    case_id: string;
    draft_type: CommonAgentDraftType;
    title: string;
    layout_id?: string;
    basic_info?: Record<string, unknown>;
    sections: CommonAgentDraftSection[];
    source_image_ids?: string[];
    workspace?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
}

export interface CommonAgentDraftItem {
    draft_id: string;
    case_id?: string;
    status: CommonAgentDraftStatus;
    version?: number;
    sections?: CommonAgentDraftSection[];
    [key: string]: unknown;
}

export interface CommonAgentAssistRequest {
    case_id: string;
    draft_type?: CommonAgentDraftType;
    title?: string;
    problem_description: string;
    question?: string;
    source_image_ids?: string[];
    existing_sections?: CommonAgentDraftSection[];
    top_k?: number;
    evidence_policy?: 'graph_only' | 'graph_approved_only';
    allow_llm_supplement?: boolean;
    workspace?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
}

export interface CommonAgentAssistResponse {
    draft: CommonAgentDraftItem;
    graph_grounded: boolean;
    llm_supplemented: boolean;
    evidence_count: number;
    retrieval_trace: string[];
    workflow_trace: string[];
    warnings: string[];
}

export interface DocumentDraftAssistPayload {
    caseRequest: CommonAgentCaseRequest;
    assistRequest: CommonAgentAssistRequest;
}

export interface DocumentDraftSyncPayload {
    caseRequest: CommonAgentCaseRequest;
    draftRequest: CommonAgentDraftRequest;
}

const uniqueStrings = (values: Array<string | undefined | null>): string[] =>
    [...new Set(values.map(value => value?.trim()).filter((value): value is string => Boolean(value)))];

const normalizeSectionType = (value: string | undefined): CommonAgentDraftSection['section_type'] => {
    if (value === 'spec' || value === 'undercut' || value === 'problem' || value === 'custom') return value;
    return 'problem';
};

export const buildDocumentDraftSyncPayload = (
    layoutId: string | undefined,
    basicInfo: Record<string, any> = {},
    reportItems: ReportItem[],
    options: { now?: number } = {}
): DocumentDraftSyncPayload => {
    const now = options.now ?? Date.now();
    const caseId = String(basicInfo.caseId || `case-mold-master-${now}`);
    const partLabel = [basicInfo.modelName, basicInfo.partName].filter(Boolean).join(' ').trim();
    const title = String(basicInfo.reportTitle || partLabel || `Mold Master Review ${now}`);
    const draftType: CommonAgentDraftType = basicInfo.draftType === 'specification_revision'
        ? 'specification_revision'
        : 'review_report';

    const sections = reportItems.map((item, index): CommonAgentDraftSection => {
        const sourceImageIds = uniqueStrings(
            item.images.map(image => image.commonAgentImageId || image.id)
        );
        const evidenceRefs = uniqueStrings(item.images.flatMap(image => [
            ...(image.analysis?.retrievalSummary?.citations || []),
            ...(image.analysis?.retrievalSummary?.graphTrace || [])
        ]).concat(item.assist?.evidenceRefs || []));
        return {
            section_id: item.id || `section-${index + 1}`,
            section_type: normalizeSectionType(item.sectionType),
            title: item.customTitle,
            problem: item.analysis.problem,
            cause: item.analysis.cause,
            countermeasures: item.analysis.countermeasures,
            source_image_ids: sourceImageIds,
            evidence_refs: evidenceRefs,
            metadata: {
                graph_grounded: item.assist?.graphGrounded
                    ?? item.images.some(image => image.analysis?.retrievalSummary?.graphGrounded === true),
                llm_supplemented: item.assist?.llmSupplemented
                    ?? item.images.some(image => image.analysis?.retrievalSummary?.llmSupplemented === true),
                assist_draft_id: item.assist?.draftId,
                assist_workflow_trace: item.assist?.workflowTrace || [],
                assist_warnings: item.assist?.warnings || []
            }
        };
    });
    const sourceImageIds = uniqueStrings(sections.flatMap(section => section.source_image_ids || []));
    const workspace = basicInfo.workspace && typeof basicInfo.workspace === 'object'
        ? basicInfo.workspace
        : undefined;

    return {
        caseRequest: {
            case_id: caseId,
            title,
            process_area: basicInfo.processArea,
            product_group: basicInfo.productGroup,
            source_system: 'mold-master-ai',
            source_refs: sourceImageIds,
            workspace,
            metadata: { layout_id: layoutId || null }
        },
        draftRequest: {
            case_id: caseId,
            draft_type: draftType,
            title,
            layout_id: layoutId,
            basic_info: basicInfo,
            sections,
            source_image_ids: sourceImageIds,
            workspace,
            metadata: {
                source_app: 'mold-master-ai',
                generated_at: new Date(now).toISOString()
            }
        }
    };
};

const postJson = async <T>(path: string, payload: unknown): Promise<T> => {
    const baseUrl = await getAgentServerBaseUrl();
    const response = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    if (!response.ok) {
        const detail = await response.text();
        throw new Error(`Common Agent document request failed: ${response.status} ${detail}`);
    }
    return await response.json() as T;
};

export class CommonAgentDocumentService {
    static async assistDraft(payload: DocumentDraftAssistPayload): Promise<CommonAgentAssistResponse> {
        await postJson('/v1/cases', payload.caseRequest);
        const response = await postJson<CommonAgentAssistResponse>('/v1/report-drafts/assist', {
            evidence_policy: 'graph_approved_only',
            allow_llm_supplement: true,
            ...payload.assistRequest,
            question: [
                payload.assistRequest.question,
                '시방서에 바로 사용할 수 있도록 간결하게 작성하세요.',
                '문제점은 관찰 사실 1문장, 원인은 핵심 3개 이내, 대책은 실행 조치 3개 이내로 작성하세요.',
                '추론 과정, Graph 경로, 검색 과정, 근거 설명, 중복 문장은 본문에 포함하지 마세요.'
            ].filter(Boolean).join(' '),
            metadata: {
                ...payload.assistRequest.metadata,
                output_profile: 'concise_specification',
                max_problem_items: 1,
                max_cause_items: 3,
                max_countermeasure_items: 3
            }
        });
        return {
            ...response,
            draft: {
                ...response.draft,
                sections: response.draft.sections?.map(section => {
                    const concise = compactSpecificationAnalysis({
                        problem: section.problem,
                        cause: section.cause,
                        countermeasures: section.countermeasures
                    });
                    return {
                        ...section,
                        problem: concise.problem,
                        cause: concise.cause,
                        countermeasures: concise.countermeasures
                    };
                })
            }
        };
    }

    static async syncDraft(
        payload: DocumentDraftSyncPayload,
        options: { verified?: boolean } = {}
    ): Promise<CommonAgentDraftItem> {
        await postJson('/v1/cases', payload.caseRequest);
        let draft = await postJson<CommonAgentDraftItem>('/v1/report-drafts', payload.draftRequest);
        if (!options.verified) return draft;

        draft = await postJson<CommonAgentDraftItem>(
            `/v1/report-drafts/${encodeURIComponent(draft.draft_id)}/submit`,
            { comment: 'Verified in Mold Master AI', workspace: payload.draftRequest.workspace }
        );
        return await postJson<CommonAgentDraftItem>(
            `/v1/report-drafts/${encodeURIComponent(draft.draft_id)}/review`,
            {
                decision: 'approve',
                comment: 'Approved by Mold Master report verification',
                workspace: payload.draftRequest.workspace,
                metadata: { source_app: 'mold-master-ai' }
            }
        );
    }
}
