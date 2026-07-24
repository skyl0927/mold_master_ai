import { ProcessKnowledgeRecord } from '../types';

export interface ProcessKnowledgeMatch extends ProcessKnowledgeRecord {
    score: number;
    matchedFields: string[];
}

let cachedKnowledge: ProcessKnowledgeRecord[] | null = null;

const STOPWORDS = new Set([
    '및',
    '관련',
    '확인',
    '검토',
    '원인',
    '대책',
    '조치',
    '문제',
    '발생',
    '정상',
    '범위',
    '조건'
]);

const normalize = (value?: string): string => (value || '').toLowerCase().replace(/\s+/g, ' ').trim();

export const tokenizeQuery = (value: string): string[] => {
    return normalize(value)
        .split(/[^0-9a-zA-Z가-힣]+/u)
        .map((token) => token.trim())
        .filter((token) => token.length > 0 && !STOPWORDS.has(token));
};

export const splitKnowledgeItems = (value?: string): string[] => {
    const normalized = (value || '').replace(/\r/g, '\n').trim();
    if (!normalized) return [];

    return normalized
        .split(/\n+|[;|]+|(?=\d+\.)|(?=[①-⑳])|(?=[가-힣]\))/u)
        .map((item) => item.replace(/\s+/g, ' ').trim())
        .filter(Boolean);
};

export const scoreTextAgainstQuery = (query: string, text?: string, weight = 1): number => {
    if (!text) return 0;

    const normalizedQuery = normalize(query);
    const normalizedText = normalize(text);
    const queryTokens = tokenizeQuery(query);

    let score = 0;

    for (const token of queryTokens) {
        if (normalizedText === token) {
            score += 6 * weight;
        } else if (normalizedText.startsWith(token)) {
            score += 3 * weight;
        } else if (normalizedText.includes(token)) {
            score += 2 * weight;
        }
    }

    if (normalizedQuery && normalizedText && normalizedText.includes(normalizedQuery)) {
        score += 4 * weight;
    }
    if (normalizedQuery && normalizedText && normalizedQuery.includes(normalizedText)) {
        score += 2 * weight;
    }

    return score;
};

export const loadProcessKnowledge = async (forceReload = false): Promise<ProcessKnowledgeRecord[]> => {
    if (!forceReload && cachedKnowledge) {
        return cachedKnowledge;
    }

    try {
        const records = await window.electronAPI.getProcessKnowledge();
        cachedKnowledge = Array.isArray(records) ? records : [];
    } catch (error) {
        console.error('[processKnowledgeService] Failed to load process knowledge:', error);
        cachedKnowledge = [];
    }

    return cachedKnowledge;
};

export const invalidateProcessKnowledgeCache = (): void => {
    cachedKnowledge = null;
};

export const searchProcessKnowledge = async (query: string, topK = 5): Promise<ProcessKnowledgeMatch[]> => {
    const records = await loadProcessKnowledge();

    const matches = records.map((record) => {
        const fieldScores = [
            ['productGroup', scoreTextAgainstQuery(query, record.productGroup, 1)],
            ['processGroup', scoreTextAgainstQuery(query, record.processGroup, 1.5)],
            ['issueFamily', scoreTextAgainstQuery(query, record.issueFamily, 2)],
            ['issueName', scoreTextAgainstQuery(query, record.issueName, 3)],
            ['symptomText', scoreTextAgainstQuery(query, record.symptomText, 2.5)],
            ['causeHypotheses', scoreTextAgainstQuery(query, record.causeHypotheses, 3)],
            ['countermeasureText', scoreTextAgainstQuery(query, record.countermeasureText, 3)],
            ['designChecks', scoreTextAgainstQuery(query, record.designChecks, 1.5)],
            ['machiningChecks', scoreTextAgainstQuery(query, record.machiningChecks, 1.5)],
            ['assemblyChecks', scoreTextAgainstQuery(query, record.assemblyChecks, 1.5)],
            ['measurementChecks', scoreTextAgainstQuery(query, record.measurementChecks, 1.5)],
            ['trialChecks', scoreTextAgainstQuery(query, record.trialChecks, 2)],
            ['commonActions', scoreTextAgainstQuery(query, record.commonActions, 2)]
        ] as Array<[string, number]>;

        const score = fieldScores.reduce((sum, [, fieldScore]) => sum + fieldScore, 0);
        const matchedFields = fieldScores
            .filter(([, fieldScore]) => fieldScore > 0)
            .map(([field]) => field);

        return {
            ...record,
            score,
            matchedFields
        };
    });

    return matches
        .filter((record) => record.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);
};
