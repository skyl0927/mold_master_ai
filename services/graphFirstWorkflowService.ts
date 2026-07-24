import { DefectAnalysis, EvidenceItem, RetrievalResult } from '../types';
import { compactDefectAnalysis } from './reportContentFormatter';

interface GraphFact {
    issue?: string;
    symptom?: string;
    cause?: string;
    action?: string;
    processPath?: string;
    trace: string;
    score?: number;
}

interface GraphFirstDraft {
    issueCandidates: string[];
    symptoms: string[];
    causes: string[];
    countermeasures: string[];
    graphTrace: string[];
    graphGrounded: boolean;
}

const NON_DIAGNOSTIC_TEXT = /(field_feedback|human review|report verified|verified review artifact|reviewed defect|approved|rejected)/i;

const splitItems = (value?: string): string[] =>
    (value || '')
        .replace(/\r/g, '\n')
        .split(/\n+|[;|]+|(?=\d+\.)|(?=[A-Za-z]\))|(?=[가-힣]\))/u)
        .map((item) => item.replace(/\s+/g, ' ').trim())
        .filter(Boolean);

const uniqueTop = (values: Array<string | undefined>, limit: number): string[] =>
    Array.from(new Set(values.map((value) => (value || '').trim()).filter(Boolean))).slice(0, limit);

const parsePrefixedLines = (content: string): Record<string, string> => {
    const parsed: Record<string, string> = {};
    const lines = content.split('\n').map((line) => line.trim()).filter(Boolean);

    for (const line of lines) {
        const separatorIndex = line.indexOf(':');
        if (separatorIndex < 0) continue;

        const key = line.slice(0, separatorIndex).trim();
        const value = line.slice(separatorIndex + 1).trim();
        if (!key || !value) continue;
        parsed[key] = value;
    }

    return parsed;
};

const isDiagnosticEvidence = (item: EvidenceItem): boolean => {
    const text = [item.title || '', item.content || ''].join('\n');
    return !NON_DIAGNOSTIC_TEXT.test(text);
};

const parseGraphEdgeFact = (item: EvidenceItem): GraphFact | null => {
    if (item.sourceType !== 'graph_edge' || !isDiagnosticEvidence(item)) {
        return null;
    }

    const parsed = parsePrefixedLines(item.content);
    const issue = parsed['Issue'];
    const symptom = parsed['Symptom'];
    const cause = parsed['Cause Node'];
    const action = parsed['Countermeasure Node'];
    const processPath = parsed['Process Path'];
    const trace = parsed['Multi-hop Path'] || [issue, cause, action].filter(Boolean).join(' -> ');

    if (!issue && !cause && !action && !trace) {
        return null;
    }

    return {
        issue,
        symptom,
        cause,
        action,
        processPath,
        trace,
        score: item.score
    };
};

const parseProcessKnowledgeFact = (item: EvidenceItem): GraphFact | null => {
    if (item.sourceType !== 'process_knowledge' || !isDiagnosticEvidence(item)) {
        return null;
    }

    const parsed = parsePrefixedLines(item.content);
    const issue = parsed['Issue'];
    const symptom = parsed['Symptom'];
    const causeText = [
        parsed['Cause Hypotheses'],
        parsed['Design Checks'],
        parsed['Machining Checks'],
        parsed['Assembly Checks'],
        parsed['Measurement Checks'],
        parsed['Trial Checks']
    ].filter(Boolean).join('\n');
    const actionText = [parsed['Countermeasures'], parsed['Common Actions']].filter(Boolean).join('\n');
    const causes = splitItems(causeText);
    const actions = splitItems(actionText);
    const processPath = [parsed['Product Group'], parsed['Process Group'], parsed['Issue Family']].filter(Boolean).join(' > ');
    const traceSegments = [processPath, issue, causes[0] ? `원인:${causes[0]}` : '', actions[0] ? `대책:${actions[0]}` : ''].filter(Boolean);

    if (!issue && causes.length === 0 && actions.length === 0) {
        return null;
    }

    return {
        issue,
        symptom,
        cause: causes[0],
        action: actions[0],
        processPath,
        trace: traceSegments.join(' -> '),
        score: item.score
    };
};

const extractGraphFacts = (retrieval: RetrievalResult): GraphFact[] =>
    retrieval.evidence
        .flatMap((item) => {
            const graphEdgeFact = parseGraphEdgeFact(item);
            if (graphEdgeFact) return [graphEdgeFact];

            const processFact = parseProcessKnowledgeFact(item);
            if (processFact) return [processFact];

            return [];
        })
        .sort((a, b) => (b.score || 0) - (a.score || 0));

export const buildGraphFirstDraft = (retrieval: RetrievalResult): GraphFirstDraft => {
    const facts = extractGraphFacts(retrieval);

    return {
        issueCandidates: uniqueTop(facts.map((fact) => fact.issue), 3),
        symptoms: uniqueTop(facts.map((fact) => fact.symptom), 3),
        causes: uniqueTop(facts.map((fact) => fact.cause), 3),
        countermeasures: uniqueTop(facts.map((fact) => fact.action), 3),
        graphTrace: uniqueTop(facts.map((fact) => fact.trace), 5),
        graphGrounded: facts.length > 0
    };
};

export const shouldSupplementWithLlm = (draft: GraphFirstDraft): boolean =>
    !draft.graphGrounded || draft.issueCandidates.length === 0 || draft.causes.length === 0 || draft.countermeasures.length === 0;

export const buildGraphGroundedAnswer = (question: string, retrieval: RetrievalResult): string => {
    const draft = buildGraphFirstDraft(retrieval);

    if (!draft.graphGrounded) {
        return [
            '[Graph Answer]',
            `질문: ${question}`,
            '그래프에서 진단에 사용할 결함/원인/대책 경로를 찾지 못했습니다.',
            '현재 질문은 로컬 공정 지식이나 진단 그래프를 더 보강한 뒤 다시 확인하는 편이 좋습니다.'
        ].join('\n\n');
    }

    return [
        '[Graph Answer]',
        `질문: ${question}`,
        draft.issueCandidates.length > 0 ? `그래프 중심 이슈: ${draft.issueCandidates.join(', ')}` : '',
        draft.symptoms.length > 0 ? `관찰된 현상 후보: ${draft.symptoms.join(', ')}` : '',
        draft.causes.length > 0 ? `주요 원인 후보: ${draft.causes.join(', ')}` : '원인 경로가 아직 충분하지 않습니다.',
        draft.countermeasures.length > 0 ? `권장 대책: ${draft.countermeasures.join(', ')}` : '대책 경로가 아직 충분하지 않습니다.',
        draft.graphTrace.length > 0 ? `Graph Trace:\n${draft.graphTrace.map((trace, index) => `${index + 1}. ${trace}`).join('\n')}` : ''
    ].filter(Boolean).join('\n\n');
};

export const buildGraphGroundedDefectAnalysis = (
    defectHint: string,
    visualDescription: string,
    retrieval: RetrievalResult
): DefectAnalysis | null => {
    const draft = buildGraphFirstDraft(retrieval);
    if (!draft.graphGrounded) {
        return null;
    }

    const phenomenonLines = [
        visualDescription,
        draft.issueCandidates.length > 0 ? `Graph Matched Issue: ${draft.issueCandidates.join(', ')}` : '',
        draft.symptoms.length > 0 ? `Relevant Symptoms: ${draft.symptoms.join(', ')}` : ''
    ].filter(Boolean);

    return compactDefectAnalysis({
        defectType: draft.issueCandidates[0] || defectHint,
        severity: 'Medium',
        description: phenomenonLines.join('\n'),
        possibleCauses: draft.causes.length > 0
            ? draft.causes.map((cause, index) => `${index + 1}. ${cause}`).join('\n')
            : '그래프에서 직접 연결된 원인 경로를 찾지 못했습니다.',
        countermeasures: draft.countermeasures.length > 0
            ? draft.countermeasures.map((action, index) => `${index + 1}. ${action}`).join('\n')
            : '그래프에서 직접 연결된 대책 경로를 찾지 못했습니다.',
        rawOutput: buildGraphGroundedAnswer(`${defectHint} ${visualDescription}`.trim(), retrieval),
        retrievalSummary: {
            modeUsed: retrieval.modeUsed,
            citations: retrieval.citations,
            evidenceCount: retrieval.evidence.length,
            graphTrace: draft.graphTrace,
            graphGrounded: true,
            llmSupplemented: false
        }
    });
};

export const mergeGraphDraftWithLlmAnalysis = (
    draftAnalysis: DefectAnalysis | null,
    llmAnalysis: DefectAnalysis
): DefectAnalysis => {
    if (!draftAnalysis) {
        return compactDefectAnalysis({
            ...llmAnalysis,
            retrievalSummary: {
                ...llmAnalysis.retrievalSummary,
                graphGrounded: false,
                llmSupplemented: true
            }
        });
    }

    const graphCauses = draftAnalysis.possibleCauses && !draftAnalysis.possibleCauses.includes('찾지 못했습니다.');
    const graphActions = draftAnalysis.countermeasures && !draftAnalysis.countermeasures.includes('찾지 못했습니다.');

    return compactDefectAnalysis({
        defectType: draftAnalysis.defectType || llmAnalysis.defectType,
        severity: llmAnalysis.severity || draftAnalysis.severity,
        description: draftAnalysis.description || llmAnalysis.description,
        possibleCauses: graphCauses ? draftAnalysis.possibleCauses : llmAnalysis.possibleCauses,
        countermeasures: graphActions ? draftAnalysis.countermeasures : llmAnalysis.countermeasures,
        rawOutput: llmAnalysis.rawOutput,
        retrievalSummary: {
            ...(llmAnalysis.retrievalSummary || draftAnalysis.retrievalSummary),
            graphTrace: draftAnalysis.retrievalSummary?.graphTrace || llmAnalysis.retrievalSummary?.graphTrace || [],
            graphGrounded: true,
            llmSupplemented: true
        }
    });
};
