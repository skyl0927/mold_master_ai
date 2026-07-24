import { EvidenceItem, RetrievalMode, RetrievalResult } from '../types';
import {
    CommonAgentApiService,
    CommonAgentGraphPathNode
} from './commonAgentApiService';
import { generateGraphReasoningEvidence } from './graphReasoningService';
import { searchProcessKnowledge } from './processKnowledgeService';
import { getRelevantChunks } from './vectorStoreService';

interface RetrieveOptions {
    mode?: RetrievalMode;
    topK?: number;
    category?: string;
}

const buildEvidenceId = (prefix: string, index: number) => `${prefix}-${index + 1}`;

const normalizeModeUsed = (requested: RetrievalMode, hasLocal: boolean, hasRemote: boolean, hasGraph: boolean): RetrievalMode => {
    if (requested === 'graph_only') {
        return hasGraph ? 'graph_only' : 'direct';
    }

    if (requested === 'hybrid') {
        if (hasLocal && hasRemote) return 'hybrid';
        if (hasLocal) return 'local_rag';
        if (hasRemote) return 'remote_rag';
        return 'direct';
    }

    if (requested === 'local_rag') return hasLocal ? 'local_rag' : 'direct';
    if (requested === 'remote_rag') return hasRemote ? 'remote_rag' : 'direct';
    return 'direct';
};

const collectCitations = (items: EvidenceItem[]): string[] => {
    return Array.from(new Set(items
        .map((item) => item.metadata?.sourceFileName || item.title)
        .filter(Boolean) as string[]));
};

const buildLocalEvidence = async (query: string, topK: number): Promise<EvidenceItem[]> => {
    const chunks = await getRelevantChunks(query, topK);
    return chunks.map((chunk, index) => ({
        id: buildEvidenceId('vector', index),
        sourceType: 'vector',
        title: chunk.sourceFileName,
        content: chunk.text,
        metadata: {
            sourceFileName: chunk.sourceFileName
        }
    }));
};

const buildProcessKnowledgeEvidence = async (query: string, topK: number): Promise<EvidenceItem[]> => {
    const matches = await searchProcessKnowledge(query, topK);
    return matches.map((match, index) => ({
        id: buildEvidenceId('process-knowledge', index),
        sourceType: 'process_knowledge',
        title: `${match.productGroup} | ${match.issueName}`,
        score: match.score,
        content: [
            `Product Group: ${match.productGroup}`,
            `Process Group: ${match.processGroup}`,
            `Issue Family: ${match.issueFamily}`,
            `Issue: ${match.issueName}`,
            match.symptomText ? `Symptom: ${match.symptomText}` : '',
            match.causeHypotheses ? `Cause Hypotheses: ${match.causeHypotheses}` : '',
            match.countermeasureText ? `Countermeasures: ${match.countermeasureText}` : '',
            `Matched Fields: ${match.matchedFields.join(', ') || 'issueName'}`,
            match.designChecks ? `Design Checks: ${match.designChecks}` : '',
            match.machiningChecks ? `Machining Checks: ${match.machiningChecks}` : '',
            match.assemblyChecks ? `Assembly Checks: ${match.assemblyChecks}` : '',
            match.measurementChecks ? `Measurement Checks: ${match.measurementChecks}` : '',
            match.trialChecks ? `Trial Checks: ${match.trialChecks}` : '',
            match.commonActions ? `Common Actions: ${match.commonActions}` : '',
            match.learningSource ? `Learning Source: ${match.learningSource}` : ''
        ].filter(Boolean).join('\n'),
        metadata: {
            productGroup: match.productGroup,
            processGroup: match.processGroup,
            issueFamily: match.issueFamily,
            issueName: match.issueName
        }
    }));
};

const buildRemoteEvidence = async (query: string, category: string): Promise<{ evidence: EvidenceItem[]; citations: string[]; remoteAnswer?: string }> => {
    const response = await CommonAgentApiService.askKnowledge(query, { category });
    const citations = Array.from(new Set(
        (response.evidence || []).map((item) => item.source_ref || item.node_id || '').filter(Boolean)
    ));
    const evidence: EvidenceItem[] = (response.evidence || []).map((item, index) => ({
        id: item.node_id || buildEvidenceId('common-agent', index),
        sourceType: item.source_type?.includes('relation') || item.source_type?.includes('path')
            ? 'graph_edge'
            : item.source_type?.includes('graph') ? 'graph_node' : 'remote_source',
        title: item.cluster_label || item.source_ref || item.node_id,
        content: item.text,
        score: item.score,
        metadata: {
            sourceFileName: item.source_ref,
            sourceType: item.source_type,
            reviewStatus: item.review_status,
            ...item.metadata
        }
    }));

    if (response.answer) {
        evidence.push({
            id: 'remote-rag-summary',
            sourceType: 'remote_rag',
            title: 'Common Agent Answer',
            content: response.answer,
            metadata: {
                confidence: response.confidence,
                reasoningTrace: response.reasoning_trace || []
            }
        });
    }

    return {
        evidence,
        citations,
        remoteAnswer: response.answer
    };
};

const findNodeByRole = (nodes: CommonAgentGraphPathNode[], role: string): CommonAgentGraphPathNode | undefined =>
    nodes.find(node => node.label.toLocaleLowerCase().includes(role));

const buildRemoteGraphEvidence = async (query: string, limit: number): Promise<EvidenceItem[]> => {
    const graph = await CommonAgentApiService.queryGraphPaths(query, {
        topK: limit,
        maxHops: 3
    });

    return (graph.paths || []).map((path, index) => {
        const issue = findNodeByRole(path.nodes, 'problem') || findNodeByRole(path.nodes, 'issue');
        const cause = findNodeByRole(path.nodes, 'cause');
        const action = findNodeByRole(path.nodes, 'countermeasure')
            || findNodeByRole(path.nodes, 'action')
            || findNodeByRole(path.nodes, 'solution');
        return {
            id: path.path_id || buildEvidenceId('graph-path', index),
            sourceType: 'graph_edge',
            title: `Common Agent Graph Path ${index + 1}`,
            score: path.score,
            content: [
                issue ? `Issue: ${issue.name}` : '',
                cause ? `Cause Node: ${cause.name}` : '',
                action ? `Countermeasure Node: ${action.name}` : '',
                `Multi-hop Path: ${path.path_text}`
            ].filter(Boolean).join('\n'),
            metadata: {
                documentId: path.document_id,
                reviewStatus: path.review_status,
                nodes: path.nodes,
                relationships: path.relationships
            }
        } satisfies EvidenceItem;
    });
};

export const retrieveKnowledge = async (query: string, options: RetrieveOptions = {}): Promise<RetrievalResult> => {
    const mode = options.mode || 'hybrid';
    const topK = options.topK || 5;
    const category = options.category || 'all';

    let localDocumentEvidence: EvidenceItem[] = [];
    let processKnowledgeEvidence: EvidenceItem[] = [];
    let graphReasoningEvidence: EvidenceItem[] = [];
    let remoteGraphEvidence: EvidenceItem[] = [];
    let remoteEvidence: EvidenceItem[] = [];
    let citations: string[] = [];
    let remoteAnswer = '';

    if (mode === 'local_rag' || mode === 'hybrid') {
        try {
            localDocumentEvidence = await buildLocalEvidence(query, topK);
        } catch (error) {
            console.warn('[retrievalOrchestrator] Local vector retrieval failed:', error);
        }
    }

    if (mode !== 'direct') {
        try {
            processKnowledgeEvidence = await buildProcessKnowledgeEvidence(query, topK);
        } catch (error) {
            console.warn('[retrievalOrchestrator] Process knowledge retrieval failed:', error);
        }

        try {
            graphReasoningEvidence = await generateGraphReasoningEvidence(query, topK);
        } catch (error) {
            console.warn('[retrievalOrchestrator] Local graph reasoning failed:', error);
        }

        try {
            remoteGraphEvidence = await buildRemoteGraphEvidence(query, Math.max(3, Math.min(topK, 8)));
        } catch (error) {
            console.warn('[retrievalOrchestrator] Remote graph retrieval failed:', error);
        }
    }

    if (mode === 'remote_rag' || mode === 'hybrid') {
        try {
            const remote = await buildRemoteEvidence(query, category);
            remoteEvidence = remote.evidence;
            citations = remote.citations;
            remoteAnswer = remote.remoteAnswer || '';
        } catch (error) {
            console.warn('[retrievalOrchestrator] Remote retrieval failed:', error);
        }
    }

    const graphEvidence = [
        ...graphReasoningEvidence,
        ...remoteGraphEvidence,
        ...processKnowledgeEvidence
    ];
    const localEvidence = [
        ...processKnowledgeEvidence,
        ...graphReasoningEvidence,
        ...localDocumentEvidence,
        ...remoteGraphEvidence
    ];
    const evidence = mode === 'graph_only'
        ? graphEvidence
        : [...localEvidence, ...remoteEvidence];
    const hasLocal = (mode === 'graph_only' ? graphEvidence : localEvidence).length > 0;
    const hasRemote = remoteEvidence.length > 0;
    const hasGraph = graphEvidence.length > 0;

    citations = Array.from(new Set([
        ...citations,
        ...collectCitations(processKnowledgeEvidence),
        ...collectCitations(graphReasoningEvidence),
        ...collectCitations(localDocumentEvidence),
        ...collectCitations(remoteGraphEvidence)
    ]));

    return {
        modeRequested: mode,
        modeUsed: normalizeModeUsed(mode, hasLocal, hasRemote, hasGraph),
        evidence,
        citations,
        remoteAnswer
    };
};

export const formatEvidenceContext = (result: RetrievalResult, maxItems = 6): string => {
    if (!result.evidence.length) return '';

    return result.evidence
        .slice(0, maxItems)
        .map((item, index) => {
            const title = item.title ? ` | ${item.title}` : '';
            return `[Evidence ${index + 1} | ${item.sourceType}${title}]\n${item.content}`;
        })
        .join('\n\n');
};
