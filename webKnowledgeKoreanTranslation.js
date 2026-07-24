const LATIN_TEXT = /[A-Za-z]{2,}/;
const HANGUL_TEXT = /[가-힣]/;

const compactWhitespace = value => String(value || '').replace(/\s+/g, ' ').trim();

const needsKoreanTranslation = value => {
  const text = compactWhitespace(value);
  return Boolean(text && LATIN_TEXT.test(text) && !HANGUL_TEXT.test(text));
};

const translateWebKnowledgeDraft = async (draft, translate) => {
  if (typeof translate !== 'function') {
    throw new TypeError('A translation function is required.');
  }

  const fields = [
    ['defectName', [draft?.defectName]],
    ['problem', [draft?.problem]],
    ['phenomenon', [draft?.phenomenon]],
    ['causeCandidates', draft?.causeCandidates],
    ['causeLabels', draft?.causeLabels],
    ['checkItems', draft?.checkItems],
    ['actions', draft?.actions]
  ];
  const sourceTexts = fields
    .flatMap(([, values]) => Array.isArray(values) ? values : [])
    .map(compactWhitespace)
    .filter(needsKoreanTranslation);
  const uniqueSourceTexts = [...new Set(sourceTexts)];
  const translatedBySource = new Map();

  // Keep requests sequential to avoid translation-provider rate spikes.
  for (const sourceText of uniqueSourceTexts) {
    const translated = compactWhitespace(await translate(sourceText));
    if (!translated) {
      throw new Error(`Translation provider returned an empty translation: ${sourceText}`);
    }
    translatedBySource.set(sourceText, translated);
  }

  const translateValue = value => {
    const sourceText = compactWhitespace(value);
    return translatedBySource.get(sourceText) || sourceText;
  };
  const translateList = values => (Array.isArray(values) ? values : [])
    .map(translateValue)
    .filter(Boolean);

  return {
    defectName: translateValue(draft?.defectName),
    problem: translateValue(draft?.problem),
    phenomenon: translateValue(draft?.phenomenon),
    causeCandidates: translateList(draft?.causeCandidates),
    causeLabels: translateList(draft?.causeLabels),
    checkItems: translateList(draft?.checkItems),
    actions: translateList(draft?.actions)
  };
};

module.exports = {
  needsKoreanTranslation,
  translateWebKnowledgeDraft
};
