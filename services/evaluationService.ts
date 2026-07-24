import { DefectAnalysis, RetrievalMode } from '../types';

export interface EvaluationFixture {
    id: string;
    title: string;
    expected: {
        defectType: string;
        severity?: string;
        possibleCauseKeywords?: string[];
        countermeasureKeywords?: string[];
        retrievalExpectation?: {
            allowModes?: RetrievalMode[];
            minEvidenceCount?: number;
            requireCitation?: boolean;
        };
    };
}

export interface EvaluationReport {
    fixtureId: string;
    title: string;
    passed: boolean;
    checks: Array<{
        name: string;
        passed: boolean;
        details: string;
    }>;
    score: {
        passed: number;
        total: number;
    };
}

const normalize = (value: string): string => value.trim().toLowerCase();

const includesKeyword = (text: string, keyword: string): boolean => {
    return normalize(text).includes(normalize(keyword));
};

const countKeywordHits = (text: string, keywords: string[] = []): number => {
    return keywords.filter((keyword) => includesKeyword(text, keyword)).length;
};

export const evaluateAnalysisAgainstFixture = (
    analysis: DefectAnalysis,
    fixture: EvaluationFixture
): EvaluationReport => {
    const checks: EvaluationReport['checks'] = [];

    const defectTypePass =
        normalize(analysis.defectType) === normalize(fixture.expected.defectType) ||
        includesKeyword(analysis.defectType, fixture.expected.defectType) ||
        includesKeyword(fixture.expected.defectType, analysis.defectType);
    checks.push({
        name: 'defectType',
        passed: defectTypePass,
        details: `expected="${fixture.expected.defectType}", actual="${analysis.defectType}"`
    });

    if (fixture.expected.severity) {
        const severityPass = normalize(analysis.severity) === normalize(fixture.expected.severity);
        checks.push({
            name: 'severity',
            passed: severityPass,
            details: `expected="${fixture.expected.severity}", actual="${analysis.severity}"`
        });
    }

    if (fixture.expected.possibleCauseKeywords?.length) {
        const hits = countKeywordHits(analysis.possibleCauses, fixture.expected.possibleCauseKeywords);
        checks.push({
            name: 'possibleCauses',
            passed: hits > 0,
            details: `matched ${hits}/${fixture.expected.possibleCauseKeywords.length} keywords`
        });
    }

    if (fixture.expected.countermeasureKeywords?.length) {
        const hits = countKeywordHits(analysis.countermeasures, fixture.expected.countermeasureKeywords);
        checks.push({
            name: 'countermeasures',
            passed: hits > 0,
            details: `matched ${hits}/${fixture.expected.countermeasureKeywords.length} keywords`
        });
    }

    if (fixture.expected.retrievalExpectation && analysis.retrievalSummary) {
        const { allowModes, minEvidenceCount, requireCitation } = fixture.expected.retrievalExpectation;

        if (allowModes?.length) {
            checks.push({
                name: 'retrievalMode',
                passed: allowModes.includes(analysis.retrievalSummary.modeUsed),
                details: `allowed=${allowModes.join(', ')}, actual=${analysis.retrievalSummary.modeUsed}`
            });
        }

        if (typeof minEvidenceCount === 'number') {
            checks.push({
                name: 'evidenceCount',
                passed: analysis.retrievalSummary.evidenceCount >= minEvidenceCount,
                details: `expected>=${minEvidenceCount}, actual=${analysis.retrievalSummary.evidenceCount}`
            });
        }

        if (requireCitation) {
            checks.push({
                name: 'citations',
                passed: analysis.retrievalSummary.citations.length > 0,
                details: `citations=${analysis.retrievalSummary.citations.length}`
            });
        }
    }

    const passedCount = checks.filter((check) => check.passed).length;

    return {
        fixtureId: fixture.id,
        title: fixture.title,
        passed: checks.every((check) => check.passed),
        checks,
        score: {
            passed: passedCount,
            total: checks.length
        }
    };
};
