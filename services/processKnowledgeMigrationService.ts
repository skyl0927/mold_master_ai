import { ProcessKnowledgeRecord } from '../types';
import { CommonAgentApiService } from './commonAgentApiService';

const field = (label: string, value?: string): string =>
    value?.trim() ? `- ${label}: ${value.trim()}` : '';

export const buildProcessKnowledgeMigrationMarkdown = (
    records: ProcessKnowledgeRecord[]
): string => {
    const sections = records.map((record, index) => [
        `## ${index + 1}. ${record.issueName || 'Unnamed issue'}`,
        `- Source record: knowledge_matrix:${record.id ?? 'unknown'}`,
        `- Source sheet: ${record.sourceSheet || 'unknown'}${record.sourceRow ? ` row ${record.sourceRow}` : ''}`,
        field('Product group', record.productGroup),
        field('Process group', record.processGroup),
        field('Issue family', record.issueFamily),
        field('Symptom', record.symptomText),
        field('Cause hypotheses', record.causeHypotheses),
        field('Countermeasures', record.countermeasureText),
        field('Design checks', record.designChecks),
        field('Machining checks', record.machiningChecks),
        field('Assembly checks', record.assemblyChecks),
        field('Measurement checks', record.measurementChecks),
        field('Trial checks', record.trialChecks),
        field('Common actions', record.commonActions),
        field('Learning source', record.learningSource)
    ].filter(Boolean).join('\n'));

    return [
        '# Mold Master Process Knowledge Migration',
        '',
        'This document is a traceable snapshot of approved local process knowledge.',
        'Common Agent should extract Issue, Symptom, Cause, Countermeasure, Process, and Product relations.',
        '',
        ...sections
    ].join('\n\n');
};

export interface ProcessKnowledgeMigrationResult {
    documentId: string;
    recordCount: number;
    persistedToSql: boolean;
    persistedToGraph: boolean;
    approved: boolean;
}

export const migrateLocalProcessKnowledge = async (): Promise<ProcessKnowledgeMigrationResult> => {
    const records = await window.electronAPI.getProcessKnowledge();
    if (!Array.isArray(records) || records.length === 0) {
        throw new Error('이전할 로컬 공정 지식이 없습니다.');
    }

    const markdown = buildProcessKnowledgeMigrationMarkdown(records);
    const response = await CommonAgentApiService.ingestDocument(
        'mold-master-process-knowledge.md',
        new TextEncoder().encode(markdown),
        {
            mimeType: 'text/markdown',
            category: 'mold-master-process-knowledge',
            knowledgeScope: 'process_knowledge',
            sourceUri: 'mold-master://knowledge-matrix/snapshot'
        }
    );
    await CommonAgentApiService.submitFeedback({
        targetType: 'document',
        targetId: response.document_id,
        decision: 'approve',
        comment: 'Approved migration of curated Mold Master knowledge_matrix records.',
        metadata: {
            migration_source: 'knowledge_matrix',
            source_app: 'mold-master-ai',
            record_count: records.length,
            curation_basis: 'process_matrix_and_approved_hitl'
        }
    });

    return {
        documentId: response.document_id,
        recordCount: records.length,
        persistedToSql: response.persisted_to_sql,
        persistedToGraph: response.persisted_to_graph,
        approved: true
    };
};
