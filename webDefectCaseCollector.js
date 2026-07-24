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
    fileName: 'Sink marks.jpg',
    sourceDefectTitle: 'Sink marks'
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

const OPEN_ACCESS_FIGURE_MAPPINGS = [
  {
    id: 'mdpi-ma16176053-figure-5',
    pmcId: 'PMC10489043',
    sourceDefectTitle: 'Weld line',
    title: 'Figure 5. Optical micrographs of the weld-line area',
    publisher: 'Materials (MDPI)',
    sourceUrl: 'https://www.mdpi.com/1996-1944/16/17/6053',
    licenseVerificationUrl: [
      'https://www.ncbi.nlm.nih.gov/pmc/utils/oa/oa.fcgi',
      '?id=PMC10489043'
    ].join(''),
    assetUrl: [
      'https://mdpi-res.com/d_attachment/materials/materials-16-06053/',
      'article_deploy/html/images/materials-16-06053-g005-550.jpg'
    ].join(''),
    author: 'Sara Liparoti, Giorgia De Piano, Rita Salomone, Roberto Pantani',
    expectedLicense: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    description: [
      'Optical micrographs of micro-injection-molded specimens at 100, 110,',
      'and 115 degrees Celsius in the weld-line area.'
    ].join(' ')
  },
  {
    id: 'mdpi-polymers-13-04087-figure-2',
    pmcId: 'PMC8659061',
    sourceDefectTitle: 'Diesel effect/Burning',
    title: 'Figure 2. Injection-molded part with a burn mark',
    publisher: 'Polymers (MDPI)',
    sourceUrl: 'https://www.mdpi.com/2073-4360/13/23/4087',
    licenseVerificationUrl: [
      'https://www.ncbi.nlm.nih.gov/pmc/utils/oa/oa.fcgi',
      '?id=PMC8659061'
    ].join(''),
    assetUrl: [
      'https://mdpi-res.com/d_attachment/polymers/polymers-13-04087/',
      'article_deploy/html/images/polymers-13-04087-g002-550.jpg'
    ].join(''),
    author: [
      'Jiquan Li', 'Wenyong Liu', 'Xinxin Xia', 'Hangchao Zhou',
      'Liting Jing', 'Xiang Peng', 'Shaofei Jiang'
    ].join(', '),
    expectedLicense: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    description: [
      'Photograph of an injection-molded plate with a localized dark burn mark',
      'at the end of the cavity.'
    ].join(' ')
  },
  {
    id: 'mdpi-polymers-14-04842-figure-14',
    pmcId: 'PMC9696673',
    sourceDefectTitle: 'Sink marks',
    title: 'Figure 14. Sink mark due to material concentration',
    publisher: 'Polymers (MDPI)',
    sourceUrl: 'https://www.mdpi.com/2073-4360/14/22/4842',
    licenseVerificationUrl: [
      'https://www.ncbi.nlm.nih.gov/pmc/utils/oa/oa.fcgi',
      '?id=PMC9696673'
    ].join(''),
    assetUrl: [
      'https://mdpi-res.com/d_attachment/polymers/polymers-14-04842/',
      'article_deploy/html/images/polymers-14-04842-g014-550.jpg'
    ].join(''),
    author: [
      'Janez Gotlih', 'Miran Brezocnik', 'Snehashis Pal',
      'Igor Drstvensek', 'Timi Karner', 'Tomaz Brajlih'
    ].join(', '),
    expectedLicense: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    description: [
      'Photograph and engineering comparison identifying a sink mark caused by',
      'material concentration in an injection-molded housing.'
    ].join(' ')
  },
  {
    id: 'mdpi-polymers-15-03207-figure-2',
    pmcId: 'PMC10422203',
    sourceDefectTitle: 'Flash',
    title: 'Figure 2. Examples of short shot, flash, and sink marks',
    publisher: 'Polymers (MDPI)',
    sourceUrl: 'https://www.mdpi.com/2073-4360/15/15/3207',
    licenseVerificationUrl: [
      'https://www.ncbi.nlm.nih.gov/pmc/utils/oa/oa.fcgi',
      '?id=PMC10422203'
    ].join(''),
    assetUrl: [
      'https://mdpi-res.com/d_attachment/polymers/polymers-15-03207/',
      'article_deploy/html/images/polymers-15-03207-g002-550.jpg'
    ].join(''),
    author: 'Mason Myers, Rachmat Mulyana, Jose M Castro, Ben Hoffman',
    expectedLicense: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    description: [
      'Photographs of injection-molded process-window boundary samples,',
      'including prominent flash around the over-packed sample.'
    ].join(' ')
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

const parseWikimediaApiResponse = (payload, fileName) => {
  const expectedTitle = `File:${fileName}`;
  const pages = Object.values(payload?.query?.pages || {});
  const sourcePage = pages.find(page => page?.title === expectedTitle) || pages[0];
  const sourceImageInfo = sourcePage?.imageinfo?.[0];
  if (!sourcePage || !sourceImageInfo) {
    return {
      title: expectedTitle,
      imageinfo: []
    };
  }

  const sourceMetadata = sourceImageInfo.extmetadata || {};
  const metadata = {};
  for (const name of [
    'LicenseShortName',
    'LicenseUrl',
    'Artist',
    'Credit',
    'ImageDescription'
  ]) {
    const value = stripHtml(sourceMetadata[name]?.value);
    if (value) metadata[name] = { value };
  }

  return {
    title: sourcePage.title || expectedTitle,
    imageinfo: [{
      url: compactWhitespace(sourceImageInfo.url),
      descriptionurl: compactWhitespace(sourceImageInfo.descriptionurl)
        || `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(fileName)}`,
      extmetadata: metadata
    }]
  };
};

const xmlAttribute = (tag, name) => String(tag || '').match(
  new RegExp(`\\b${name}=["']([^"']+)["']`, 'i')
)?.[1] || '';

const parsePmcOpenAccessRecord = (xml, mapping) => {
  const recordTags = String(xml || '').match(/<record\b[^>]*>/gi) || [];
  const recordTag = recordTags.find(tag =>
    xmlAttribute(tag, 'id') === mapping?.pmcId
  );
  if (!recordTag) {
    throw new Error(`PMC open-access record not found: ${mapping?.pmcId || 'unknown'}`);
  }
  const retracted = xmlAttribute(recordTag, 'retracted').toLocaleLowerCase() !== 'no';
  if (retracted) {
    throw new Error(`PMC source is retracted: ${mapping.pmcId}`);
  }
  const sourceLicense = compactWhitespace(xmlAttribute(recordTag, 'license'));
  if (!/^CC BY$/i.test(sourceLicense)) {
    throw new Error(`PMC source license is not CC BY: ${sourceLicense || 'missing'}`);
  }
  return {
    pmcId: mapping.pmcId,
    citation: compactWhitespace(xmlAttribute(recordTag, 'citation')),
    sourceLicense,
    license: mapping.expectedLicense,
    licenseUrl: mapping.licenseUrl,
    retracted: false,
    verifiedAt: new Date().toISOString()
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

const buildOpenAccessFigureCards = ({
  mappings = OPEN_ACCESS_FIGURE_MAPPINGS,
  records,
  basfCards,
  downloadedImages,
  retrievedAt
}) => {
  const basfByTitle = new Map((basfCards || []).map(card => [
    card.metadata.sourceDefectTitle,
    card
  ]));
  const cards = [];
  for (const mapping of mappings || []) {
    const base = basfByTitle.get(mapping.sourceDefectTitle);
    const record = records?.get(mapping.id);
    const downloaded = downloadedImages?.get(mapping.id);
    if (!base || !record || !downloaded || record.retracted) continue;
    const figureEvidence = {
      publisher: mapping.publisher,
      title: mapping.title,
      sourceUrl: mapping.sourceUrl,
      assetUrl: mapping.assetUrl,
      downloadUrl: downloaded.downloadUrl || mapping.assetUrl,
      localFile: downloaded.localFile,
      retrievedAt,
      reuseMode: 'licensed_copy',
      license: record.license,
      licenseUrl: record.licenseUrl,
      author: mapping.author,
      contentSha256: downloaded.contentSha256,
      evidenceExcerpt: mapping.description,
      licenseVerificationUrl: mapping.licenseVerificationUrl,
      sourceRecordId: record.pmcId,
      sourceCitation: record.citation,
      modifications: downloaded.variant
        ? [`Publisher ${downloaded.variant} derivative used for review.`]
        : []
    };
    cards.push({
      ...base,
      caseId: `web-open-access-${safeId(mapping.id)}`,
      sourceKind: 'licensed_image',
      phenomenon: `${mapping.description} ${base.phenomenon}`.slice(0, 2400),
      evidence: [figureEvidence, ...base.evidence],
      review: candidateReview(),
      metadata: {
        ...base.metadata,
        sourceFigureId: mapping.id,
        sourceRecordId: record.pmcId,
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
  openAccessFigureRecords,
  downloadedOpenAccessImages,
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
  const openAccessFigureCards = buildOpenAccessFigureCards({
    records: openAccessFigureRecords,
    basfCards,
    downloadedImages: downloadedOpenAccessImages,
    retrievedAt
  });
  const deduplicated = deduplicateKnowledgeCards([
    ...basfCards,
    ...wikimediaCards,
    ...openAccessFigureCards
  ]);
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
    title: `인터넷 출처 사출 성형 결함 후보 카드 ${cards.length}건`
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
  OPEN_ACCESS_FIGURE_MAPPINGS,
  WIKIMEDIA_CASE_MAPPINGS,
  assembleCandidateCollection,
  buildBasfCards,
  buildOpenAccessFigureCards,
  buildWikimediaCards,
  parsePmcOpenAccessRecord,
  parseWikimediaApiResponse,
  parseWikimediaFilePage,
  wikimediaThumbnailUrl
};
