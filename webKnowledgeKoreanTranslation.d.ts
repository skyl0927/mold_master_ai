export interface WebKnowledgeTranslationDraft {
  defectName: string;
  problem: string;
  phenomenon: string;
  causeCandidates: string[];
  causeLabels: string[];
  checkItems: string[];
  actions: string[];
}

export function needsKoreanTranslation(value: string): boolean;

export function translateWebKnowledgeDraft(
  draft: WebKnowledgeTranslationDraft,
  translate: (text: string) => Promise<string>
): Promise<WebKnowledgeTranslationDraft>;
