import { EvidenceItem, ProcessKnowledgeRecord } from '../types';
import { loadProcessKnowledge, scoreTextAgainstQuery, splitKnowledgeItems } from './processKnowledgeService';

interface CauseCandidate {
    stage: string;
    text: string;
    score: number;
}

interface ActionCandidate {
    text: string;
    score: number;
}

interface RankedPath {
    record: ProcessKnowledgeRecord;
    issueScore: number;
    cause?: CauseCandidate;
    action?: ActionCandidate;
    score: number;
}

interface SymptomSignals {
    whitening: boolean;
    ejection: boolean;
    sticking: boolean;
    normalCondition: boolean;
}

const STAGE_LABELS: Record<string, string> = {
    design: '설계',
    machining: '가공',
    assembly: '조립',
    measurement: '측정',
    trial: '시사출',
    feedback: '피드백'
};

const getSymptomSignals = (query: string): SymptomSignals => {
    return {
        whitening: /백화/.test(query),
        ejection: /(취출|튀기|튕기|딱하는 소리|딱 소리)/.test(query),
        sticking: /(물림|스티킹|걸림|붙음|걸리는)/.test(query),
        normalCondition: /(정상 범위|정상범위|조건 정상)/.test(query) && /(사출 조건|사출조건|압력|보압|배압)/.test(query)
    };
};

const applySymptomBias = (
    baseScore: number,
    query: string,
    record: ProcessKnowledgeRecord,
    cause?: CauseCandidate,
    action?: ActionCandidate
): number => {
    const signals = getSymptomSignals(query);
    let score = baseScore;
    const combinedText = [
        record.issueFamily,
        record.issueName,
        record.symptomText || '',
        record.causeHypotheses || '',
        record.countermeasureText || '',
        cause?.text || '',
        action?.text || ''
    ].join(' ');

    if (signals.whitening && /백화/.test(combinedText)) {
        score += 10;
    }
    if (signals.ejection && /(취출|물림|스티킹|튕기|튀기|걸림)/.test(combinedText)) {
        score += 14;
    }
    if (signals.sticking && /(물림|스티킹|걸림|래핑|랩핑)/.test(combinedText)) {
        score += 10;
    }
    if (signals.normalCondition && /(사출 압력|보압|배압|압력 조정)/.test(combinedText)) {
        score -= 12;
    }
    if (record.learningSource === 'hitl_feedback') {
        score += 6;
    }

    return score;
};

const buildCauseCandidates = (record: ProcessKnowledgeRecord, query: string): CauseCandidate[] => {
    const stageEntries = [
        { stage: 'feedback', value: record.causeHypotheses },
        { stage: 'design', value: record.designChecks },
        { stage: 'machining', value: record.machiningChecks },
        { stage: 'assembly', value: record.assemblyChecks },
        { stage: 'measurement', value: record.measurementChecks },
        { stage: 'trial', value: record.trialChecks }
    ];

    return stageEntries
        .flatMap(({ stage, value }) =>
            splitKnowledgeItems(value).map((text) => ({
                stage,
                text,
                score: scoreTextAgainstQuery(query, text, stage === 'feedback' ? 3 : 2.5)
            }))
        )
        .sort((a, b) => b.score - a.score);
};

const buildActionCandidates = (record: ProcessKnowledgeRecord, query: string): ActionCandidate[] => {
    return [...splitKnowledgeItems(record.countermeasureText), ...splitKnowledgeItems(record.commonActions)]
        .map((text) => ({
            text,
            score: scoreTextAgainstQuery(query, text, 2.5)
        }))
        .sort((a, b) => b.score - a.score);
};

const rankPaths = (records: ProcessKnowledgeRecord[], query: string, topK: number): RankedPath[] => {
    const ranked: RankedPath[] = [];

    for (const record of records) {
        const issueScore =
            scoreTextAgainstQuery(query, record.issueName, 3) +
            scoreTextAgainstQuery(query, record.issueFamily, 2) +
            scoreTextAgainstQuery(query, record.symptomText, 2.5) +
            scoreTextAgainstQuery(query, record.processGroup, 1.5) +
            scoreTextAgainstQuery(query, record.productGroup, 1);

        const causes = buildCauseCandidates(record, query);
        const actions = buildActionCandidates(record, query);
        const topCauses = causes.filter((item) => item.score > 0).slice(0, 2);
        const topActions = actions.filter((item) => item.score > 0).slice(0, 2);

        if (issueScore <= 0 && topCauses.length === 0 && topActions.length === 0) {
            continue;
        }

        if (topCauses.length === 0 && topActions.length === 0) {
            ranked.push({
                record,
                issueScore,
                score: applySymptomBias(issueScore, query, record)
            });
            continue;
        }

        if (topCauses.length > 0 && topActions.length === 0) {
            for (const cause of topCauses) {
                ranked.push({
                    record,
                    issueScore,
                    cause,
                    score: applySymptomBias(issueScore * 2 + cause.score * 2.5 + 1, query, record, cause)
                });
            }
            continue;
        }

        if (topCauses.length === 0 && topActions.length > 0) {
            for (const action of topActions) {
                ranked.push({
                    record,
                    issueScore,
                    action,
                    score: applySymptomBias(issueScore * 2 + action.score * 2.5 + 1, query, record, undefined, action)
                });
            }
            continue;
        }

        for (const cause of topCauses) {
            for (const action of topActions) {
                const multiHopBonus = cause.score > 0 && action.score > 0 ? 4 : 0;
                ranked.push({
                    record,
                    issueScore,
                    cause,
                    action,
                    score: applySymptomBias(
                        issueScore * 2 + cause.score * 2.5 + action.score * 2.2 + multiHopBonus,
                        query,
                        record,
                        cause,
                        action
                    )
                });
            }
        }
    }

    return ranked.sort((a, b) => b.score - a.score).slice(0, topK);
};

const formatPathEvidence = (path: RankedPath, index: number): EvidenceItem => {
    const segments = [
        path.record.productGroup,
        `${path.record.processGroup} > ${path.record.issueFamily}`,
        path.record.issueName
    ];

    if (path.cause) {
        segments.push(`${STAGE_LABELS[path.cause.stage] || path.cause.stage}: ${path.cause.text}`);
    }
    if (path.action) {
        segments.push(`대책: ${path.action.text}`);
    }

    const directMatches = [
        path.cause && path.cause.score > 0 ? `원인 직접 매칭(${STAGE_LABELS[path.cause.stage] || path.cause.stage})` : '',
        path.action && path.action.score > 0 ? '대책 직접 매칭' : ''
    ].filter(Boolean);

    return {
        id: `graph-path-${index + 1}`,
        sourceType: 'graph_edge',
        title: path.record.issueName,
        score: path.score,
        content: [
            `Product Group: ${path.record.productGroup}`,
            `Process Path: ${path.record.processGroup} > ${path.record.issueFamily}`,
            `Issue: ${path.record.issueName}`,
            path.record.symptomText ? `Symptom: ${path.record.symptomText}` : '',
            path.cause ? `Cause Node: ${path.cause.text}` : '',
            path.action ? `Countermeasure Node: ${path.action.text}` : '',
            `Learning Source: ${path.record.learningSource || 'process_matrix'}`,
            `Ranking Score: ${path.score.toFixed(1)}`,
            directMatches.length > 0 ? `Direct Match: ${directMatches.join(', ')}` : 'Direct Match: issue-centered',
            `Multi-hop Path: ${segments.join(' -> ')}`
        ].filter(Boolean).join('\n'),
        metadata: {
            productGroup: path.record.productGroup,
            processGroup: path.record.processGroup,
            issueFamily: path.record.issueFamily,
            issueName: path.record.issueName,
            causeStage: path.cause?.stage,
            learningSource: path.record.learningSource,
            feedbackRecordId: path.record.feedbackRecordId,
            directCauseMatch: !!path.cause && path.cause.score > 0,
            directActionMatch: !!path.action && path.action.score > 0
        }
    };
};

export const generateGraphReasoningEvidence = async (query: string, topK = 5): Promise<EvidenceItem[]> => {
    const records = await loadProcessKnowledge();
    if (records.length === 0) {
        return [];
    }

    return rankPaths(records, query, topK).map((path, index) => formatPathEvidence(path, index));
};
