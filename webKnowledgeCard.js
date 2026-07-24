const crypto = require('node:crypto');

const ALLOWED_SOURCE_HOSTS = new Set([
  'commons.wikimedia.org',
  'upload.wikimedia.org',
  'plastics-rubber.basf.com',
  'download.basf.com',
  'solutions.covestro.com',
  'www.celanese.com',
  'celanese.com',
  'zenodo.org',
  'www.mdpi.com',
  'mdpi-res.com',
  'www.ncbi.nlm.nih.gov'
]);

const REUSABLE_LICENSE = /^(?:cc0|public domain|cc by(?:-sa)?(?:-nc)?\s+\d)/i;
const SHA256 = /^[a-f0-9]{64}$/i;

const compactWhitespace = value => String(value || '').replace(/\s+/g, ' ').trim();

const uniqueStrings = values => [...new Set(
  (values || []).map(compactWhitespace).filter(Boolean)
)];

const RECOMMENDATION_SECTION_HEADING =
  /\b(?:PROCESSING CHANGES|(?:MOLD|MACHINE|MATERIAL)-RELATED SOLUTIONS)\b/gi;

const sanitizeRecommendationText = value => compactWhitespace(
  String(value || '').replace(RECOMMENDATION_SECTION_HEADING, ' ')
);

const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');

const parsedHttpUrl = value => {
  try {
    const url = new URL(String(value || ''));
    return ['http:', 'https:'].includes(url.protocol) ? url : null;
  } catch {
    return null;
  }
};

const validateSourceProvenance = source => {
  const errors = [];
  const url = parsedHttpUrl(source?.sourceUrl);
  const reuseMode = String(source?.reuseMode || 'licensed_copy');
  if (!url) {
    errors.push('source_url_invalid');
  } else if (!ALLOWED_SOURCE_HOSTS.has(url.hostname.toLocaleLowerCase())) {
    errors.push('source_host_not_allowed');
  }
  if (!compactWhitespace(source?.publisher)) errors.push('publisher_missing');
  if (!compactWhitespace(source?.title)) errors.push('source_title_missing');
  if (!compactWhitespace(source?.retrievedAt)) errors.push('retrieved_at_missing');
  if (!SHA256.test(String(source?.contentSha256 || ''))) {
    errors.push('content_sha256_invalid');
  }
  if (reuseMode === 'licensed_copy') {
    if (!REUSABLE_LICENSE.test(compactWhitespace(source?.license))) {
      errors.push('license_not_reusable');
    }
    if (!parsedHttpUrl(source?.licenseUrl)) errors.push('license_url_missing');
  } else if (reuseMode !== 'citation_only') {
    errors.push('reuse_mode_invalid');
  }
  return { valid: errors.length === 0, errors };
};

const decodeHtml = value => String(value || '')
  .replace(/&amp;/g, '&')
  .replace(/&quot;/g, '"')
  .replace(/&#39;|&apos;/g, "'")
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>');

const extractBasfDefectLinks = html => {
  const matches = [];
  const seen = new Set();
  const linkPattern = /<a\b[^>]*href=["']([^"']*#page=(\d+))["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of String(html || '').matchAll(linkPattern)) {
    const sourceUrl = parsedHttpUrl(decodeHtml(match[1]));
    if (!sourceUrl || sourceUrl.hostname.toLocaleLowerCase() !== 'download.basf.com') continue;
    const title = compactWhitespace(decodeHtml(match[3].replace(/<[^>]+>/g, '')));
    const pageNumber = Number(match[2]);
    if (!title || !Number.isInteger(pageNumber)) continue;
    const key = `${title.toLocaleLowerCase()}:${pageNumber}`;
    if (seen.has(key)) continue;
    seen.add(key);
    matches.push({
      title,
      pageNumber,
      sourceUrl: sourceUrl.toString()
    });
  }
  return matches.sort((left, right) => left.pageNumber - right.pageNumber);
};

const itemPosition = item => ({
  text: compactWhitespace(item?.str),
  x: Number(item?.transform?.[4]) || 0,
  y: Number(item?.transform?.[5]) || 0
});

const rowsFromItems = (items, predicate) => {
  const rows = [];
  const sorted = (items || [])
    .map(itemPosition)
    .filter(item => item.text && predicate(item))
    .sort((left, right) => (right.y - left.y) || (left.x - right.x));
  for (const item of sorted) {
    const existing = rows.find(row => Math.abs(row.y - item.y) <= 1.5);
    if (existing) {
      existing.parts.push(item);
      continue;
    }
    rows.push({ y: item.y, parts: [item] });
  }
  return rows
    .map(row => ({
      y: row.y,
      text: compactWhitespace(
        row.parts
          .sort((left, right) => left.x - right.x)
          .map(item => item.text)
          .join(' ')
      )
    }))
    .sort((left, right) => right.y - left.y);
};

const groupCauseRows = rows => {
  const groups = [];
  for (const row of rows) {
    const current = groups.at(-1);
    if (!current || current.bottomY - row.y > 14) {
      groups.push({
        topY: row.y,
        bottomY: row.y,
        text: row.text
      });
      continue;
    }
    current.bottomY = row.y;
    current.text = compactWhitespace(`${current.text} ${row.text}`);
  }
  return groups;
};

const groupActionRows = rows => {
  const actions = [];
  for (const row of rows) {
    const startsAction = /^•/.test(row.text);
    if (startsAction || actions.length === 0) {
      actions.push({
        topY: row.y,
        text: compactWhitespace(row.text.replace(/^•\s*/, ''))
      });
      continue;
    }
    const current = actions.at(-1);
    current.text = compactWhitespace(`${current.text} ${row.text}`);
  }
  return actions.filter(action => action.text);
};

const parseBasfTroubleshootingPage = rawItems => {
  const items = (rawItems || []).map(itemPosition);
  const descriptionHeading = items.find(item => /^description$/i.test(item.text));
  const causesHeading = items.find(item => /^causes$/i.test(item.text));
  const recommendationsHeading = items.find(item => /^recommendations$/i.test(item.text));
  if (!descriptionHeading || !causesHeading || !recommendationsHeading) {
    return {
      description: '',
      causes: [],
      errors: ['pdf_layout_headings_missing']
    };
  }

  const descriptionRows = rowsFromItems(rawItems, item =>
    item.y < descriptionHeading.y - 2
    && item.y > causesHeading.y + 2
    && !/^description$/i.test(item.text)
  );
  const causeRows = rowsFromItems(rawItems, item =>
    item.x < recommendationsHeading.x - 10
    && item.y < causesHeading.y - 2
    && item.y > 55
    && !/^causes$/i.test(item.text)
  );
  const actionRows = rowsFromItems(rawItems, item =>
    item.x >= recommendationsHeading.x - 10
    && item.y < recommendationsHeading.y - 2
    && item.y > 55
    && !/^recommendations$/i.test(item.text)
  );
  const causeGroups = groupCauseRows(causeRows);
  const actionGroups = groupActionRows(actionRows);
  const causes = causeGroups.map((cause, index) => {
    const nextCauseTop = causeGroups[index + 1]?.topY ?? -Infinity;
    return {
      text: cause.text,
      actions: actionGroups
        .filter(action => action.topY <= cause.topY + 3 && action.topY > nextCauseTop)
        .map(action => sanitizeRecommendationText(action.text))
        .filter(Boolean)
    };
  });

  return {
    description: compactWhitespace(descriptionRows.map(row => row.text).join(' ')),
    causes,
    errors: []
  };
};

const knowledgeCardEvidenceKey = card => {
  const evidence = Array.isArray(card?.evidence) ? card.evidence[0] : null;
  if (!evidence) return `case:${card?.caseId || ''}`;
  if (card?.sourceKind === 'licensed_image') {
    return `asset:${String(evidence.contentSha256 || '').toLocaleLowerCase()}`;
  }
  return [
    'record',
    String(evidence.contentSha256 || '').toLocaleLowerCase(),
    String(evidence.pageNumber || ''),
    compactWhitespace(evidence.title).toLocaleLowerCase()
  ].join(':');
};

const validateKnowledgeCard = card => {
  const errors = [];
  if (!compactWhitespace(card?.caseId)) errors.push('case_id_missing');
  if (!compactWhitespace(card?.defectName)) errors.push('defect_name_missing');
  if (!compactWhitespace(card?.problem)) errors.push('problem_missing');
  if (!compactWhitespace(card?.phenomenon)) errors.push('phenomenon_missing');
  if (!Array.isArray(card?.causes) || card.causes.length === 0) {
    errors.push('causes_missing');
  } else {
    if (card.causes.some(cause => !compactWhitespace(cause?.text))) {
      errors.push('cause_text_missing');
    }
    if (card.causes.every(cause => !Array.isArray(cause?.actions) || cause.actions.length === 0)
      && (!Array.isArray(card?.actions) || card.actions.length === 0)) {
      errors.push('actions_missing');
    }
  }
  if (!Array.isArray(card?.evidence) || card.evidence.length === 0) {
    errors.push('evidence_missing');
  } else {
    for (const source of card.evidence) {
      errors.push(...validateSourceProvenance(source).errors);
    }
  }
  if (card?.review?.status !== 'candidate') errors.push('review_status_must_be_candidate');
  if (card?.review?.requiresHumanReview !== true) errors.push('human_review_required');
  if (card?.review?.autoApprovalAllowed !== false) errors.push('auto_approval_must_be_false');
  return { valid: errors.length === 0, errors: uniqueStrings(errors) };
};

const deduplicateKnowledgeCards = cards => {
  const seen = new Map();
  const accepted = [];
  const excluded = [];
  for (const card of cards || []) {
    const key = knowledgeCardEvidenceKey(card);
    if (seen.has(key)) {
      excluded.push({
        caseId: card?.caseId,
        duplicateOf: seen.get(key),
        reason: 'duplicate_evidence_hash',
        evidenceKey: key
      });
      continue;
    }
    seen.set(key, card?.caseId);
    accepted.push(card);
  }
  return { cards: accepted, excluded };
};

const evidenceImageFromSource = source => {
  if (!source?.localFile && !source?.assetUrl) return null;
  return {
    image_id: source.imageId || `image-${String(source.contentSha256 || '').slice(0, 12)}`,
    file_name: source.localFile || undefined,
    source_uri: source.assetUrl || source.sourceUrl,
    description: source.title,
    metadata: {
      source_url: source.sourceUrl,
      download_url: source.downloadUrl,
      asset_sha256: source.contentSha256,
      license: source.license,
      license_url: source.licenseUrl,
      author: source.author,
      modifications: source.modifications || []
    }
  };
};

const toTacitKnowledgeTemplate = (cards, options = {}) => {
  const generatedAt = options.generatedAt || new Date().toISOString();
  const documentId = options.documentId || `doc-web-cases-${sha256(generatedAt).slice(0, 12)}`;
  return {
    document_id: documentId,
    source_system: 'mold-master-ai-web-collector',
    file_name: options.fileName || `${documentId}.json`,
    mime_type: 'application/vnd.common-agent.tacit-template+json',
    source_uri: `mold-master://web-defect-cases/${documentId}`,
    title: options.title || '사출 성형 결함 웹 근거 후보 카드',
    project: 'mold-master-ai',
    process_area: '사출 성형',
    metadata: {
      collection_generated_at: generatedAt,
      review_status: 'candidate',
      auto_approval_allowed: false,
      graph_promotion_allowed_before_review: false
    },
    items: (cards || []).map((card, index) => {
      const sourceImages = (card.evidence || [])
        .map(evidenceImageFromSource)
        .filter(Boolean);
      const causeActions = card.causes.flatMap(cause => cause.actions || []);
      const evidence = card.evidence.map(source => ({
        publisher: source.publisher,
        title: source.title,
        source_url: source.sourceUrl,
        download_url: source.downloadUrl,
        page_number: source.pageNumber,
        retrieved_at: source.retrievedAt,
        reuse_mode: source.reuseMode || 'licensed_copy',
        license: source.license,
        license_url: source.licenseUrl,
        author: source.author,
        content_sha256: source.contentSha256,
        evidence_excerpt: source.evidenceExcerpt,
        modifications: source.modifications || []
      }));
      return {
        item_id: card.caseId,
        no: index + 1,
        process_area: '사출 성형',
        problem: card.problem,
        phenomenon: card.phenomenon,
        defect_type: card.defectName,
        location: card.location,
        part: card.part,
        machine: card.machine,
        material: card.material,
        severity: card.severity || '보통',
        cause_candidates: card.causes.map(cause => cause.text),
        cause_labels: uniqueStrings(card.causeLabels || []),
        check_items: uniqueStrings(card.checkItems || []),
        actions: uniqueStrings([...causeActions, ...(card.actions || [])]),
        standards: uniqueStrings(card.evidence.map(source =>
          `${source.publisher}: ${source.title}${source.pageNumber ? ` p.${source.pageNumber}` : ''}`
        )),
        result_effect: card.resultEffect,
        labels: uniqueStrings([
          '사출 성형',
          card.defectName,
          card.defectClass
        ]),
        evidence_images: sourceImages,
        reviewer_comment: compactWhitespace(card?.review?.reviewerComment),
        metadata: {
          case_schema_version: card.schemaVersion,
          source_kind: card.sourceKind,
          defect_class: card.defectClass,
          review_status: 'candidate',
          requires_human_review: true,
          auto_approval_allowed: false,
          graph_promotion_allowed: false,
          local_hitl_status: card?.review?.localHitlStatus || 'pending',
          local_hitl_reviewer: card?.review?.reviewer || '',
          local_hitl_reviewed_at: card?.review?.reviewedAt || '',
          source_content_sha256: card?.review?.sourceContentSha256 || '',
          evidence
        }
      };
    })
  };
};

const buildCollectionSummary = (cards, options = {}) => {
  const targetCards = Number(options.targetCards) || 40;
  const byClass = {};
  for (const card of cards || []) {
    const defectClass = card?.defectClass || 'unclassified';
    byClass[defectClass] = (byClass[defectClass] || 0) + 1;
  }
  return {
    targetCards,
    totalCards: (cards || []).length,
    additionalCardsRequired: Math.max(0, targetCards - (cards || []).length),
    byClass,
    candidate: (cards || []).filter(card => card?.review?.status === 'candidate').length,
    autoApproved: (cards || []).filter(card => card?.review?.autoApprovalAllowed === true).length,
    graphPromoted: (cards || []).filter(card => card?.review?.graphPromoted === true).length
  };
};

module.exports = {
  ALLOWED_SOURCE_HOSTS,
  buildCollectionSummary,
  deduplicateKnowledgeCards,
  extractBasfDefectLinks,
  parseBasfTroubleshootingPage,
  sanitizeRecommendationText,
  toTacitKnowledgeTemplate,
  validateKnowledgeCard,
  validateSourceProvenance
};
