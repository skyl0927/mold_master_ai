const {
  buildCollectionSummary,
  deduplicateKnowledgeCards,
  sanitizeRecommendationText,
  toTacitKnowledgeTemplate,
  validateKnowledgeCard
} = require('./webKnowledgeCard');
const { canonicalDefectClass } = require('./shared/defect-taxonomy');

const BASF_DEFECT_LABELS = {
  'Weld line': '웰드라인',
  Delamination: '박리',
  'Diesel effect/Burning': '흑점/탄화',
  'Black specks': '흑점/탄화',
  'Sink marks': '싱크',
  'Demolding problems': '취출/이형',
  Jetting: '제팅',
  'Gloss variations': '광택 불균일',
  Flash: '플래시',
  'Cold slug': '콜드 슬러그',
  'Air entrapment': '공기 갇힘',
  Voids: '보이드',
  'Dull spots': '무광 반점',
  'Record grooves effect': '유동 자국',
  'Colored streaks': '착색 줄무늬',
  'Moisture streaks': '은줄/수분 줄무늬',
  'Streaks with reinforcements': '보강재 줄무늬',
  'Burning streaks': '탄화 줄무늬',
  'Tiger lines': '타이거 라인',
  'Stress crack formation': '응력 균열',
  'Unmolten material': '미용융 수지',
  'Short shot': '미성형',
  Warpage: '변형/휨',
  'Plate-out/Mold deposit': '금형 퇴적물'
};

const WIKIMEDIA_CASE_MAPPINGS = [
  {
    fileName: 'Moulded plastic model aeroplane kit flash.jpg',
    sourceDefectTitle: 'Flash'
  },
  {
    fileName: 'Flashes di bakul.png',
    sourceDefectTitle: 'Flash'
  },
  {
    fileName: 'Defek burr.png',
    sourceDefectTitle: 'Flash'
  },
  {
    fileName: 'Defek terbakar.png',
    sourceDefectTitle: 'Diesel effect/Burning'
  },
  {
    fileName: 'Defek bintik hitam.png',
    sourceDefectTitle: 'Black specks'
  },
  {
    fileName: 'Defek mark aliran.png',
    sourceDefectTitle: 'Record grooves effect'
  },
  {
    fileName: 'Defek retak.png',
    sourceDefectTitle: 'Stress crack formation'
  },
  {
    fileName: 'Defek Jetting.png',
    sourceDefectTitle: 'Jetting'
  },
  {
    fileName: 'Jetting (Injection Molding Defect).png',
    sourceDefectTitle: 'Jetting'
  },
  {
    fileName: 'Defek Isian Kurang Penuh.png',
    sourceDefectTitle: 'Short shot'
  },
  {
    fileName: 'Injection moulding defects.jpg',
    sourceDefectTitle: 'Short shot'
  },
  {
    fileName: 'Defek Kecut.png',
    sourceDefectTitle: 'Sink marks'
  },
  {
    fileName: 'Defek gelembung.png',
    sourceDefectTitle: 'Voids'
  },
  {
    fileName: 'Porosities in a plastic part - garden chair.jpg',
    sourceDefectTitle: 'Voids'
  },
  {
    fileName: 'Defek Garis Perak.png',
    sourceDefectTitle: 'Moisture streaks'
  },
  {
    fileName: 'Defek Warpage.png',
    sourceDefectTitle: 'Warpage'
  }
];

const compactWhitespace = value => String(value || '').replace(/\s+/g, ' ').trim();
const uniqueStrings = values => [...new Set(
  (values || []).map(compactWhitespace).filter(Boolean)
)];

const stripHtml = value => compactWhitespace(
  String(value || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#58;/g, ':')
);

const htmlAttribute = (html, tagPattern, attribute) => {
  const tag = String(html || '').match(tagPattern)?.[0] || '';
  return tag.match(new RegExp(`${attribute}=["']([^"']+)["']`, 'i'))?.[1] || '';
};

const tableValueAfterId = (html, idName) => {
  const encodedName = idName.replace(/_/g, '(?:_|&#95;)');
  const pattern = new RegExp(
    `<td\\b[^>]*id=["']${encodedName}["'][^>]*>[\\s\\S]*?<\\/td>\\s*<td\\b[^>]*>([\\s\\S]*?)<\\/td>`,
    'i'
  );
  return stripHtml(String(html || '').match(pattern)?.[1] || '');
};

const parseWikimediaFilePage = (html, fileName) => {
  const imageUrl = htmlAttribute(
    html,
    /<meta\b[^>]*property=["']og:image["'][^>]*>/i,
    'content'
  );
  const sourceUrl = htmlAttribute(
    html,
    /<link\b[^>]*rel=["']canonical["'][^>]*>/i,
    'href'
  ) || `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(fileName)}`;
  const licenseMatch = String(html || '').match(
    /\b(CC\s+BY(?:-NC)?(?:-SA)?\s+\d(?:\.\d)?|CC0|Public domain)\b/i
  );
  const license = compactWhitespace(licenseMatch?.[1] || '');
  const licenseUrl = htmlAttribute(
    html,
    /<a\b[^>]*href=["']https:\/\/creativecommons\.org\/(?:licenses|publicdomain)\/[^"']+["'][^>]*>/i,
    'href'
  ) || (license.toLocaleLowerCase() === 'public domain'
    ? 'https://creativecommons.org/publicdomain/mark/1.0/'
    : '');
  return {
    title: `File:${fileName}`,
    imageinfo: [{
      url: imageUrl,
      descriptionurl: sourceUrl,
      extmetadata: {
        LicenseShortName: { value: license },
        LicenseUrl: { value: licenseUrl },
        Artist: { value: tableValueAfterId(html, 'fileinfotpl_aut') },
        ImageDescription: {
          value: tableValueAfterId(html, 'fileinfotpl_desc')
            || `${fileName} injection molding defect example`
        }
      }
    }]
  };
};

const wikimediaThumbnailUrl = (originalUrl, width = 640) => {
  const url = new URL(String(originalUrl || ''));
  if (url.hostname !== 'upload.wikimedia.org' || !url.pathname.includes('/commons/')) {
    throw new Error(`Unsupported Wikimedia image URL: ${originalUrl}`);
  }
  const standardWidths = [20, 40, 60, 120, 250, 330, 500, 960, 1280, 1920, 3840];
  const requestedWidth = Math.max(20, Math.min(3840, Math.floor(Number(width) || 640)));
  const pixelWidth = [...standardWidths].reverse().find(value => value <= requestedWidth)
    || standardWidths[0];
  const thumbMarker = '/wikipedia/commons/thumb/';
  let thumbBasePath;
  let fileName;
  if (url.pathname.includes(thumbMarker)) {
    const parts = url.pathname.split(thumbMarker)[1].split('/');
    fileName = parts[2];
    thumbBasePath = `${thumbMarker}${parts.slice(0, 3).join('/')}`;
  } else {
    fileName = pathBasename(url.pathname);
    thumbBasePath = url.pathname.replace('/commons/', '/commons/thumb/');
  }
  url.pathname = `${thumbBasePath}/${pixelWidth}px-${fileName}`;
  return url.toString();
};

const pathBasename = value => String(value || '').split('/').filter(Boolean).at(-1) || '';

const safeId = value => String(value || '')
  .normalize('NFKD')
  .toLocaleLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '')
  .slice(0, 64);

const candidateReview = () => ({
  status: 'candidate',
  requiresHumanReview: true,
  autoApprovalAllowed: false,
  graphPromoted: false
});

const buildBasfCards = ({
  links,
  parsedPages,
  pdfSha256,
  retrievedAt
}) => (links || [])
  .filter(link => Object.hasOwn(BASF_DEFECT_LABELS, link.title))
  .map(link => {
    const parsed = parsedPages.get(link.pageNumber) || {
      description: '',
      causes: [],
      errors: ['pdf_page_missing']
    };
    const defectName = BASF_DEFECT_LABELS[link.title];
    const causes = (parsed.causes || [])
      .map(cause => ({
        ...cause,
        text: compactWhitespace(cause?.text),
        actions: uniqueStrings(
          (cause?.actions || []).map(sanitizeRecommendationText)
        )
      }))
      .filter(cause => cause.text && cause.actions.length > 0);
    const actions = uniqueStrings(causes.flatMap(cause => cause.actions));
    const checkItems = actions.filter(action =>
      /^(?:check|inspect|verify|analy[sz]e|measure|clean)\b/i.test(compactWhitespace(action))
    );
    return {
      schemaVersion: 1,
      caseId: `web-basf-${String(link.pageNumber).padStart(2, '0')}-${safeId(link.title)}`,
      sourceKind: 'technical_guide',
      defectName,
      defectClass: canonicalDefectClass(defectName),
      problem: `사출 성형품에서 ${defectName} 결함이 발생한다.`,
      phenomenon: compactWhitespace(parsed.description),
      causes,
      checkItems,
      actions,
      evidence: [{
        publisher: 'BASF Performance Materials',
        title: `Injection-Molding Problems in Engineering Thermoplastics - ${link.title}`,
        sourceUrl: link.sourceUrl,
        pageNumber: link.pageNumber,
        retrievedAt,
        reuseMode: 'citation_only',
        license: 'Copyrighted technical reference; citation only',
        contentSha256: pdfSha256,
        evidenceExcerpt: compactWhitespace(parsed.description).slice(0, 1600)
      }],
      review: candidateReview(),
      metadata: {
        sourceDefectTitle: link.title,
        sourcePageNumber: link.pageNumber,
        extractionErrors: parsed.errors || [],
        visionBenchmarkEligible: false,
        knowledgeScope: 'diagnostic_candidate'
      }
    };
  });

const metadataValue = (metadata, name) => stripHtml(metadata?.[name]?.value);

const buildWikimediaCards = ({
  pages,
  basfCards,
  downloadedImages,
  retrievedAt
}) => {
  const pagesByName = new Map((pages || []).map(page => [
    String(page?.title || '').replace(/^File:/, ''),
    page
  ]));
  const basfByTitle = new Map((basfCards || []).map(card => [
    card.metadata.sourceDefectTitle,
    card
  ]));
  const cards = [];

  for (const mapping of WIKIMEDIA_CASE_MAPPINGS) {
    const page = pagesByName.get(mapping.fileName);
    const base = basfByTitle.get(mapping.sourceDefectTitle);
    const downloaded = downloadedImages.get(mapping.fileName);
    const imageInfo = page?.imageinfo?.[0];
    if (!page || !base || !downloaded || !imageInfo) continue;
    const metadata = imageInfo.extmetadata || {};
    const license = metadataValue(metadata, 'LicenseShortName');
    const licenseUrl = metadataValue(metadata, 'LicenseUrl')
      || (license === 'Public domain'
        ? 'https://creativecommons.org/publicdomain/mark/1.0/'
        : '');
    const description = metadataValue(metadata, 'ImageDescription')
      || `${mapping.fileName} 시각 사례`;
    const wikiEvidence = {
      publisher: 'Wikimedia Commons',
      title: mapping.fileName,
      sourceUrl: imageInfo.descriptionurl,
      assetUrl: imageInfo.url,
      downloadUrl: downloaded.downloadUrl || imageInfo.url,
      localFile: downloaded.localFile,
      retrievedAt,
      reuseMode: 'licensed_copy',
      license,
      licenseUrl,
      author: metadataValue(metadata, 'Artist') || metadataValue(metadata, 'Credit'),
      contentSha256: downloaded.contentSha256,
      evidenceExcerpt: description,
      modifications: downloaded.variant
        ? [`Wikimedia ${downloaded.variant} derivative used for bandwidth-safe review.`]
        : []
    };
    cards.push({
      ...base,
      caseId: `web-wikimedia-${safeId(mapping.fileName)}`,
      sourceKind: 'licensed_image',
      phenomenon: `${description} ${base.phenomenon}`.slice(0, 2400),
      evidence: [wikiEvidence, ...base.evidence],
      review: candidateReview(),
      metadata: {
        ...base.metadata,
        sourceFileName: mapping.fileName,
        sourceDefectTitle: mapping.sourceDefectTitle,
        visionBenchmarkEligible: false,
        benchmarkBlockers: [
          'external_label_requires_hitl',
          'photographic_evidence_not_confirmed'
        ],
        knowledgeScope: 'diagnostic_candidate'
      }
    });
  }
  return cards;
};

const assembleCandidateCollection = ({
  basfLinks,
  parsedPages,
  basfPdfSha256,
  wikimediaPages,
  downloadedImages,
  retrievedAt,
  targetCards = 40
}) => {
  const basfCards = buildBasfCards({
    links: basfLinks,
    parsedPages,
    pdfSha256: basfPdfSha256,
    retrievedAt
  });
  const wikimediaCards = buildWikimediaCards({
    pages: wikimediaPages,
    basfCards,
    downloadedImages,
    retrievedAt
  });
  const deduplicated = deduplicateKnowledgeCards([...basfCards, ...wikimediaCards]);
  const invalid = deduplicated.cards
    .map(card => ({ card, validation: validateKnowledgeCard(card) }))
    .filter(item => !item.validation.valid)
    .map(item => ({
      caseId: item.card.caseId,
      errors: item.validation.errors
    }));
  const validIds = new Set(
    deduplicated.cards
      .filter(card => !invalid.some(item => item.caseId === card.caseId))
      .map(card => card.caseId)
  );
  const cards = deduplicated.cards.filter(card => validIds.has(card.caseId));
  const summary = buildCollectionSummary(cards, { targetCards });
  const template = toTacitKnowledgeTemplate(cards, {
    documentId: `doc-web-injection-defect-cases-${retrievedAt.slice(0, 10).replace(/-/g, '')}`,
    generatedAt: retrievedAt,
    title: '인터넷 출처 사출 성형 결함 후보 카드 40건'
  });
  return {
    cards,
    invalid,
    excluded: deduplicated.excluded,
    summary,
    template,
    policy: {
      persistence: 'none',
      autoApproval: false,
      graphPromotion: false,
      requiresHumanReview: true
    }
  };
};

module.exports = {
  BASF_DEFECT_LABELS,
  WIKIMEDIA_CASE_MAPPINGS,
  assembleCandidateCollection,
  buildBasfCards,
  buildWikimediaCards,
  parseWikimediaFilePage,
  wikimediaThumbnailUrl
};
