import type { DefectAnalysis } from '../types';

export interface SpecificationAnalysis {
    problem: string;
    cause: string;
    countermeasures: string;
}

type SectionKind = keyof SpecificationAnalysis;

const SECTION_LIMITS: Record<SectionKind, { items: number; characters: number }> = {
    problem: { items: 1, characters: 120 },
    cause: { items: 3, characters: 90 },
    countermeasures: { items: 3, characters: 100 }
};

const REASONING_LINE = /^(?:graph\s*(?:trace|path|matched)|relevant\s+symptoms|retrieval|workflow|evidence|citation|analysis\s+(?:process|reasoning)|분석\s*(?:과정|근거)|추론|판단\s*과정|근거\s*:|출처\s*:|검색\s*(?:경로|결과)|llm\s*보조)/i;
const EMPTY_HEADING = /^(?:문제점|현상|원인|추정\s*원인|발생\s*원인|대책|개선\s*대책|권장\s*대책|조치|확인\s*항목)\s*:?\s*$/i;
const LEADING_LABEL = /^(?:문제점|현상|원인|추정\s*원인|발생\s*원인|대책|개선\s*대책|권장\s*대책|조치|확인\s*항목)\s*:\s*/i;
const TRACE_PATH_LINE = /(?:->|→)/;
const NON_CONTENT_LINE = /^(?:그래프에서 .*찾지 못|원인 경로가 .*충분하지 않|대책 경로가 .*충분하지 않|추가 분석 중|분석 중)/i;

const splitStatements = (value: string): string[] =>
    value
        .replace(/\\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/(?:^|\n)\s*(?:[-*•·▪◦]+|\d+[.)])\s*/g, '\n')
        .split(/\n+|[;；]+|(?<=[.!?。])\s+/)
        .map(statement => statement.trim())
        .filter(Boolean);

const trimStatement = (value: string, maxCharacters: number): string => {
    const cleaned = value
        .replace(/^#{1,6}\s*/, '')
        .replace(/^\*\*(.*?)\*\*$/, '$1')
        .replace(LEADING_LABEL, '')
        .replace(/\s+/g, ' ')
        .trim();

    if (cleaned.length <= maxCharacters) return cleaned;
    const clipped = cleaned.slice(0, maxCharacters + 1);
    const lastSpace = clipped.lastIndexOf(' ');
    const end = lastSpace >= Math.floor(maxCharacters * 0.65) ? lastSpace : maxCharacters;
    return `${cleaned.slice(0, end).trim()}…`;
};

const normalizeForComparison = (value: string): string =>
    value.toLocaleLowerCase().replace(/[\s()[\]{}_\-.,:;/'"“”‘’]/g, '');

const compactSection = (value: unknown, kind: SectionKind): string => {
    if (typeof value !== 'string' || !value.trim()) return '';

    const limits = SECTION_LIMITS[kind];
    const statements: string[] = [];
    const seen = new Set<string>();

    for (const source of splitStatements(value)) {
        const classificationSource = source
            .replace(/^#{1,6}\s*/, '')
            .replace(/^\*\*(.*?)\*\*$/, '$1')
            .trim();
        if (
            REASONING_LINE.test(classificationSource)
            || EMPTY_HEADING.test(classificationSource)
            || TRACE_PATH_LINE.test(classificationSource)
            || NON_CONTENT_LINE.test(classificationSource)
        ) continue;
        const statement = trimStatement(source, limits.characters);
        const comparisonKey = normalizeForComparison(statement);
        if (!statement || !comparisonKey || seen.has(comparisonKey)) continue;

        seen.add(comparisonKey);
        statements.push(statement);
        if (statements.length >= limits.items) break;
    }

    if (kind === 'problem') return statements[0] || '';
    return statements.map((statement, index) => `${index + 1}. ${statement}`).join('\n');
};

export const compactSpecificationAnalysis = (
    analysis: Partial<SpecificationAnalysis>
): SpecificationAnalysis => ({
    problem: compactSection(analysis.problem, 'problem'),
    cause: compactSection(analysis.cause, 'cause'),
    countermeasures: compactSection(analysis.countermeasures, 'countermeasures')
});

export const compactDefectAnalysis = (analysis: DefectAnalysis): DefectAnalysis => {
    const compact = compactSpecificationAnalysis({
        problem: analysis.description,
        cause: analysis.possibleCauses,
        countermeasures: analysis.countermeasures
    });

    return {
        ...analysis,
        description: compact.problem,
        possibleCauses: compact.cause,
        countermeasures: compact.countermeasures
    };
};
