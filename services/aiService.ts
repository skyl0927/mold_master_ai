import { GoogleGenAI, Type } from "@google/genai";
import OpenAI from "openai";
import type { ResponseFormatJSONSchema } from 'openai/resources/shared';
import { DefectAnalysis, RetrievalMode, VisionObservationSummary } from '../types';
import { buildVisionRetrievalQuery, parseVisionObservationText } from '../visionObservation';
import { buildOpenAiVisionObservationResponseFormat } from '../visionStructuredOutputSchema';
import {
    buildVisionDiagnosisGuard,
    buildVisionGuardAbstentionAnalysis,
    guardDefectAnalysisForVisionRisk
} from '../visionDiagnosisGuard';
import {
    getClients,
    handleApiError,
    OPENAI_EFFICIENT_MODEL,
    OPENAI_PRIMARY_MODEL,
    OPENAI_VISION_MAX_COMPLETION_TOKENS
} from './aiCore';
import {
    buildGraphFirstDraft,
    buildGraphGroundedAnswer,
    buildGraphGroundedDefectAnalysis,
    mergeGraphDraftWithLlmAnalysis,
    shouldSupplementWithLlm
} from './graphFirstWorkflowService';
import { formatEvidenceContext, retrieveKnowledge } from './retrievalOrchestrator';
import { compactDefectAnalysis } from './reportContentFormatter';

const ensureString = (value: any): string => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value.map((item) => ensureString(item)).join('\n');
    if (typeof value === 'object') {
        return Object.entries(value)
            .map(([key, itemValue]) => `${key}: ${ensureString(itemValue)}`)
            .join('\n');
    }
    return String(value);
};

const getConversationTranscript = (messages: any[]): string => {
    return messages
        .map((message) => `${message.role === 'user' ? 'User' : 'Assistant'}: ${ensureString(message.text)}`)
        .join('\n');
};

const callDirectChatModel = async (messages: any[], evidenceContext: string, graphDraftContext: string): Promise<string> => {
    const { provider, client } = await getClients();
    const question = ensureString(messages[messages.length - 1]?.text);
    const transcript = getConversationTranscript(messages.slice(-8));

    const prompt = `
You are Mold Master AI, a senior injection-molding troubleshooting assistant.
Answer in Korean unless the user clearly asks for another language.

Conversation:
${transcript}

${graphDraftContext ? `Graph-grounded draft:
${graphDraftContext}

Rules:
- Treat graph-grounded draft as primary engineering evidence.
- Only supplement missing parts with general LLM knowledge.
- If you add non-graph knowledge, make it clear that it is supplementary inference.` : ''}

${evidenceContext ? `Additional evidence:
${evidenceContext}` : ''}

User question:
${question}
    `.trim();

    if (provider === 'gemini' && client instanceof GoogleGenAI) {
        const response = await client.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts: [{ text: prompt }] },
        });
        return response.text?.trim() || '';
    }

    if (provider === 'openai' && client instanceof OpenAI) {
        const response = await client.chat.completions.create({
            model: OPENAI_PRIMARY_MODEL,
            messages: [
                { role: 'system', content: 'You are Mold Master AI, a senior injection-molding troubleshooting assistant. Reply in Korean by default.' },
                { role: 'user', content: prompt }
            ],
        });
        return response.choices[0].message.content?.trim() || '';
    }

    return '';
};

const analyzeImageWithVisionModel = async (
    base64Data: string
): Promise<{
    defectHint: string;
    visualDescription: string;
    visionSummary: VisionObservationSummary;
}> => {
    const { provider, client } = await getClients();

    const visionPrompt = `
You are an expert injection molding visual inspector.
Perform a blind visual observation of this image. Do not use field context and do not infer hidden process causes.

 Requirements:
 - Output in Korean.
 - Use only pixels in the image. Do not infer process settings, root causes, hidden geometry, checks, or countermeasures.
 - Classify documents, CAD, diagrams, and screenshots as document_or_diagram and return no physical defect candidate.
 - Treat repeated, symmetric, and mold-functional geometry as normal unless an actual abnormality is visible.
 - Describe only visible color, surface, geometry, boundary, location, orientation, repetition, and contrast.
 - Give each observation a unique observation_id and return up to 3 competing defect candidates.
 - Every candidate must cite one or more valid supporting_observation_ids.
 - Confidence is a number from 0 to 1 and is not a final judgment.
 - If the image is insufficient, use an empty candidate list and explain abstention_reason.
 - State which additional views or lighting would distinguish the candidates.
 - Return only valid JSON in this exact shape:
 {
   "contract_version": "vision-observation/v2",
   "image_kind": "physical_product | document_or_diagram | unknown",
   "normality_status": "defect_visible | no_defect_visible | uncertain",
   "observations": [
     {
       "observation_id": "obs-1",
       "category": "color | boundary | geometry | surface | location | repetition | orientation | contrast | other",
       "description": "string",
       "region": "string",
       "confidence": 0.0
     }
   ],
   "candidates": [
     {
       "defect_type": "string",
       "confidence": 0.0,
       "supporting_observation_ids": ["obs-1"],
       "contradicting_observation_ids": []
     }
  ],
  "required_additional_views": ["string"],
  "quality_concerns": ["string"],
  "abstention_reason": "string"
}
    `.trim();

    let rawObservation = '';

    if (provider === 'gemini' && client instanceof GoogleGenAI) {
        const response = await client.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: {
                parts: [
                    { inlineData: { mimeType: 'image/png', data: base64Data } },
                    { text: visionPrompt }
                ]
            },
            config: { responseMimeType: 'application/json' }
        });
        rawObservation = response.text || '';
    } else if (provider === 'openai' && client instanceof OpenAI) {
        const response = await client.chat.completions.create({
            model: OPENAI_PRIMARY_MODEL,
            messages: [
                { role: 'system', content: 'You are an expert injection molding engineer. Output in Korean.' },
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: visionPrompt },
                        { type: 'image_url', image_url: { url: `data:image/png;base64,${base64Data}` } }
                    ]
                }
            ],
            response_format: buildOpenAiVisionObservationResponseFormat() as ResponseFormatJSONSchema,
            max_completion_tokens: OPENAI_VISION_MAX_COMPLETION_TOKENS
        });
        rawObservation = response.choices[0].message.content || '';
    }

    const visionSummary = parseVisionObservationText(rawObservation) as VisionObservationSummary;
    const defectHint = visionSummary.primaryCandidate?.defectType || '판정 불가';
    const visualDescription = [
        ...visionSummary.visibleFeatures,
        ...(visionSummary.primaryCandidate?.supportingFeatures || [])
    ].filter(Boolean).slice(0, 5).join(', ')
        || visionSummary.abstentionReason
        || '사진에서 신뢰할 수 있는 결함 특징을 확인하지 못했습니다.';

    return { defectHint, visualDescription, visionSummary };
};

const createLlmBackedAnalysis = async (
    base64Data: string,
    defectHint: string,
    visualDescription: string,
    retrieval: Awaited<ReturnType<typeof retrieveKnowledge>>,
    graphGroundedAnalysis: DefectAnalysis | null
): Promise<DefectAnalysis> => {
    const { provider, client } = await getClients();
    const graphDraft = buildGraphFirstDraft(retrieval);
    const evidenceContext = formatEvidenceContext(retrieval, 6);
    const graphDraftContext = graphGroundedAnalysis
        ? [
            `Issue: ${graphGroundedAnalysis.defectType}`,
            `Phenomenon: ${graphGroundedAnalysis.description}`,
            `Possible Causes:\n${graphGroundedAnalysis.possibleCauses}`,
            `Countermeasures:\n${graphGroundedAnalysis.countermeasures}`,
            graphDraft.graphTrace.length > 0 ? `Graph Trace:\n${graphDraft.graphTrace.join('\n')}` : ''
        ].filter(Boolean).join('\n\n')
        : '';

    const reportPrompt = `
Role: Senior Mold Improvement Specialist.
Task: Build a troubleshooting report for an injection-molding defect.

Visual defect hint: ${defectHint}
Visual observation: ${visualDescription}

${graphDraftContext ? `Primary graph-grounded draft:
${graphDraftContext}` : 'No reliable graph path was found.'}

Additional evidence:
${evidenceContext || 'No additional internal evidence found.'}

Return valid JSON with:
{
  "defectType": string,
  "severity": "High" | "Medium" | "Low",
  "description": string,
  "possibleCauses": string,
  "countermeasures": string
}

Rules:
- Write all fields in Korean.
- Prefer graph-grounded issue/cause/countermeasure when available.
- Only fill missing gaps with general LLM knowledge.
- Do not overwrite a graph-grounded cause/countermeasure with generic advice.
- Write for direct insertion into an engineering specification.
- description: one factual sentence, maximum 120 characters.
- possibleCauses: maximum 3 short cause statements; no reasoning process or evidence explanation.
- countermeasures: maximum 3 specific action statements; no background explanation.
- Never include Graph Trace, retrieval path, citations, confidence, or chain-of-thought in these fields.
    `.trim();

    let llmAnalysis: DefectAnalysis = {
        defectType: defectHint,
        severity: 'Medium',
        description: visualDescription,
        possibleCauses: '추가 분석 중입니다.',
        countermeasures: '추가 분석 중입니다.',
        rawOutput: '',
        retrievalSummary: {
            modeUsed: retrieval.modeUsed,
            citations: retrieval.citations,
            evidenceCount: retrieval.evidence.length,
            graphTrace: graphDraft.graphTrace,
            graphGrounded: graphDraft.graphGrounded,
            llmSupplemented: true
        }
    };

    if (provider === 'gemini' && client instanceof GoogleGenAI) {
        const response = await client.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: {
                parts: [
                    { inlineData: { mimeType: 'image/png', data: base64Data } },
                    { text: reportPrompt }
                ]
            },
            config: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        defectType: { type: Type.STRING },
                        severity: { type: Type.STRING },
                        description: { type: Type.STRING },
                        possibleCauses: { type: Type.STRING },
                        countermeasures: { type: Type.STRING }
                    }
                }
            }
        });

        const jsonResponse = JSON.parse(response.text || '{}');
        llmAnalysis = {
            defectType: ensureString(jsonResponse.defectType || defectHint),
            severity: ensureString(jsonResponse.severity || 'Medium'),
            description: ensureString(jsonResponse.description || visualDescription),
            possibleCauses: ensureString(jsonResponse.possibleCauses),
            countermeasures: ensureString(jsonResponse.countermeasures),
            rawOutput: response.text || '',
            retrievalSummary: {
                modeUsed: retrieval.modeUsed,
                citations: retrieval.citations,
                evidenceCount: retrieval.evidence.length,
                graphTrace: graphDraft.graphTrace,
                graphGrounded: graphDraft.graphGrounded,
                llmSupplemented: true
            }
        };
    } else if (provider === 'openai' && client instanceof OpenAI) {
        const response = await client.chat.completions.create({
            model: OPENAI_PRIMARY_MODEL,
            messages: [
                { role: 'system', content: 'You are a senior mold improvement specialist. Output only valid JSON.' },
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: reportPrompt },
                        { type: 'image_url', image_url: { url: `data:image/png;base64,${base64Data}` } }
                    ]
                }
            ],
            response_format: { type: 'json_object' }
        });

        const content = response.choices[0].message.content || '{}';
        const jsonResponse = JSON.parse(content);
        llmAnalysis = {
            defectType: ensureString(jsonResponse.defectType || defectHint),
            severity: ensureString(jsonResponse.severity || 'Medium'),
            description: ensureString(jsonResponse.description || visualDescription),
            possibleCauses: ensureString(jsonResponse.possibleCauses),
            countermeasures: ensureString(jsonResponse.countermeasures),
            rawOutput: content,
            retrievalSummary: {
                modeUsed: retrieval.modeUsed,
                citations: retrieval.citations,
                evidenceCount: retrieval.evidence.length,
                graphTrace: graphDraft.graphTrace,
                graphGrounded: graphDraft.graphGrounded,
                llmSupplemented: true
            }
        };
    }

    return compactDefectAnalysis(mergeGraphDraftWithLlmAnalysis(graphGroundedAnalysis, llmAnalysis));
};

export const analyzeMoldDefect = async (
    base64Data: string,
    retrievalMode: RetrievalMode = 'hybrid',
    fieldContext = ''
): Promise<DefectAnalysis> => {
    try {
        const { defectHint, visualDescription, visionSummary } = await analyzeImageWithVisionModel(base64Data);
        const diagnosisGuard = buildVisionDiagnosisGuard(visionSummary);
        if (!diagnosisGuard.allowGraphRetrieval) {
            return buildVisionGuardAbstentionAnalysis(visionSummary, {
                modeUsed: retrievalMode,
                rawOutput: JSON.stringify({ visionSummary, diagnosisGuard }, null, 2)
            });
        }
        const retrieval = await retrieveKnowledge(buildVisionRetrievalQuery(visionSummary, fieldContext), {
            mode: retrievalMode,
            topK: retrievalMode === 'graph_only' ? 5 : 4,
            category: 'all'
        });

        const graphGroundedAnalysis = buildGraphGroundedDefectAnalysis(defectHint, visualDescription, retrieval);
        const graphDraft = buildGraphFirstDraft(retrieval);

        if (retrievalMode === 'graph_only' && graphGroundedAnalysis) {
            return guardDefectAnalysisForVisionRisk(
                { ...graphGroundedAnalysis, visionSummary },
                visionSummary
            );
        }

        if (graphGroundedAnalysis && !shouldSupplementWithLlm(graphDraft)) {
            return guardDefectAnalysisForVisionRisk({
                ...graphGroundedAnalysis,
                visionSummary,
                retrievalSummary: {
                    ...graphGroundedAnalysis.retrievalSummary,
                    graphGrounded: true,
                    llmSupplemented: false
                }
            }, visionSummary);
        }

        if (!diagnosisGuard.allowLlmSupplement && !graphGroundedAnalysis) {
            return guardDefectAnalysisForVisionRisk({
                defectType: defectHint,
                severity: '-',
                description: visualDescription,
                possibleCauses: '',
                countermeasures: '',
                rawOutput: JSON.stringify({ visionSummary, diagnosisGuard }, null, 2),
                visionSummary,
                retrievalSummary: {
                    modeUsed: retrieval.modeUsed,
                    citations: retrieval.citations,
                    evidenceCount: retrieval.evidence.length,
                    graphTrace: graphDraft.graphTrace,
                    graphGrounded: false,
                    llmSupplemented: false
                }
            }, visionSummary);
        }

        const analysis = await createLlmBackedAnalysis(
            base64Data,
            defectHint,
            visualDescription,
            retrieval,
            graphGroundedAnalysis
        );
        return guardDefectAnalysisForVisionRisk({ ...analysis, visionSummary }, visionSummary);
    } catch (error) {
        throw handleApiError(error);
    }
};

export const streamChatResponse = async (
    messages: any[],
    useRag: boolean,
    onChunk: (text: string) => void,
    retrievalMode: RetrievalMode = useRag ? 'hybrid' : 'direct'
): Promise<void> => {
    try {
        const question = ensureString(messages[messages.length - 1]?.text);
        const retrieval = useRag
            ? await retrieveKnowledge(question, { mode: retrievalMode, topK: retrievalMode === 'graph_only' ? 5 : 5, category: 'all' })
            : await retrieveKnowledge(question, { mode: 'direct', topK: 0, category: 'all' });
        const graphDraft = buildGraphFirstDraft(retrieval);
        const evidenceContext = useRag ? formatEvidenceContext(retrieval, 6) : '';
        const graphDraftContext = graphDraft.graphGrounded
            ? [
                graphDraft.issueCandidates.length > 0 ? `Issue: ${graphDraft.issueCandidates.join(', ')}` : '',
                graphDraft.causes.length > 0 ? `Causes: ${graphDraft.causes.join(', ')}` : '',
                graphDraft.countermeasures.length > 0 ? `Countermeasures: ${graphDraft.countermeasures.join(', ')}` : '',
                graphDraft.graphTrace.length > 0 ? `Trace:\n${graphDraft.graphTrace.join('\n')}` : ''
            ].filter(Boolean).join('\n\n')
            : '';

        const answer = retrievalMode === 'graph_only'
            ? buildGraphGroundedAnswer(question, retrieval)
            : await callDirectChatModel(messages, evidenceContext, graphDraftContext);
        const references = Array.from(new Set([
            ...retrieval.citations,
            ...retrieval.evidence
                .map((item) => item.metadata?.sourceFileName || item.title)
                .filter(Boolean) as string[]
        ]));
        const retrievalHeader = useRag
            ? `[Retrieval: ${retrieval.modeUsed} | Evidence: ${retrieval.evidence.length} | Graph: ${graphDraft.graphGrounded ? 'grounded' : 'weak'}]`
            : '[Retrieval: direct]';

        onChunk(`${retrievalHeader}\n\n${answer || '응답을 생성하지 못했습니다.'}`);

        if (graphDraft.graphTrace.length > 0) {
            onChunk(`\n\n---\n**Graph Trace**\n${graphDraft.graphTrace.map((trace, index) => `${index + 1}. ${trace}`).join('\n')}`);
        }

        if (references.length > 0) {
            onChunk(`\n\n---\n**참고 문서**\n${references.map((fileName) => `- ${fileName}`).join('\n')}`);
        }
    } catch (error) {
        console.error('Chat Error', error);
        onChunk(`채팅 처리 중 오류가 발생했습니다.\n\n오류 내용: ${ensureString(error)}`);
    }
};

const LANGUAGE_NAMES: Record<string, string> = {
    ko: 'Korean',
    en: 'English',
    ja: 'Japanese',
    zh: 'Chinese',
    th: 'Thai'
};

export const translateText = async (text: string, targetLang: string): Promise<string> => {
    try {
        const { provider, client } = await getClients();
        const langName = LANGUAGE_NAMES[targetLang] || 'English';

        const prompt = `Translate the following text to ${langName}. Output only the translated text.\n\n${text}`;

        if (provider === 'gemini' && client instanceof GoogleGenAI) {
            const response = await client.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: { parts: [{ text: prompt }] },
            });
            return response.text?.trim() || text;
        }

        if (provider === 'openai' && client instanceof OpenAI) {
            const response = await client.chat.completions.create({
                model: OPENAI_EFFICIENT_MODEL,
                messages: [
                    { role: 'system', content: `You are a professional translator. Translate text to ${langName}. Output only the translation.` },
                    { role: 'user', content: text }
                ]
            });
            return response.choices[0].message.content?.trim() || text;
        }

        return text;
    } catch (error) {
        console.error('Translation error:', error);
        throw handleApiError(error);
    }
};
