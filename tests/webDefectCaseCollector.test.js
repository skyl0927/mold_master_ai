const assert = require('node:assert/strict');
const test = require('node:test');

const {
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
} = require('../webDefectCaseCollector');

const retrievedAt = '2026-07-24T00:00:00.000Z';
const basfPdfSha256 = 'c'.repeat(64);

const basfLinks = Object.keys(BASF_DEFECT_LABELS).map((title, index) => ({
  title,
  pageNumber: 4 + (index * 2),
  sourceUrl: `https://download.basf.com/injection-guide.pdf?view=#page=${4 + (index * 2)}`
}));

const parsedPages = new Map(basfLinks.map(link => [
  link.pageNumber,
  {
    description: `${link.title} visible symptom from the official troubleshooting guide.`,
    causes: [{
      text: `${link.title} verified cause`,
      actions: [`${link.title} corrective action`]
    }],
    errors: []
  }
]));

const wikimediaPages = WIKIMEDIA_CASE_MAPPINGS.map((mapping, index) => ({
  title: `File:${mapping.fileName}`,
  imageinfo: [{
    url: `https://upload.wikimedia.org/wikipedia/commons/test/${encodeURIComponent(mapping.fileName)}`,
    descriptionurl: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(mapping.fileName)}`,
    extmetadata: {
      LicenseShortName: { value: index === 0 ? 'Public domain' : 'CC BY-SA 4.0' },
      LicenseUrl: {
        value: index === 0
          ? 'https://creativecommons.org/publicdomain/mark/1.0/'
          : 'https://creativecommons.org/licenses/by-sa/4.0/'
      },
      Artist: { value: `Author ${index + 1}` },
      ImageDescription: { value: `${mapping.fileName} injection molding defect example` }
    }
  }]
}));

test('official BASF defect catalog produces 24 citation-only candidate cards', () => {
  const cards = buildBasfCards({
    links: basfLinks,
    parsedPages,
    pdfSha256: basfPdfSha256,
    retrievedAt
  });
  assert.equal(cards.length, 24);
  assert.ok(cards.every(card => card.sourceKind === 'technical_guide'));
  assert.ok(cards.every(card => card.review.status === 'candidate'));
  assert.ok(cards.every(card => card.evidence[0].reuseMode === 'citation_only'));
  assert.ok(cards.every(card => card.evidence[0].contentSha256 === basfPdfSha256));
});

test('BASF cards remove duplicate actions and section-heading artifacts', () => {
  const noisyParsedPages = new Map(parsedPages);
  noisyParsedPages.set(basfLinks[0].pageNumber, {
    description: 'Weld line symptom.',
    causes: [{
      text: 'Two melt fronts meet.',
      actions: [
        'PROCESSING CHANGES',
        'Increase melt temperature.',
        'Increase melt temperature.',
        'Clean the venting channels. MOLD-RELATED SOLUTIONS'
      ]
    }],
    errors: []
  });
  const [card] = buildBasfCards({
    links: basfLinks,
    parsedPages: noisyParsedPages,
    pdfSha256: basfPdfSha256,
    retrievedAt
  });
  assert.deepEqual(card.actions, [
    'Increase melt temperature.',
    'Clean the venting channels.'
  ]);
  assert.equal(new Set(card.actions).size, card.actions.length);
});

test('Wikimedia file HTML yields image, author, description, and license metadata', () => {
  const html = `
    <link rel="canonical" href="https://commons.wikimedia.org/wiki/File:Defek_terbakar.png">
    <meta property="og:image" content="https://upload.wikimedia.org/wikipedia/commons/4/48/Defek_terbakar.png">
    <td id="fileinfotpl&#95;desc">Description</td>
    <td class="description"><div>Burning defects in injection moulding parts</div></td>
    <td id="fileinfotpl&#95;aut">Author</td>
    <td><a href="/wiki/User:Encik_Tekateki">Encik Tekateki</a></td>
    <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>
  `;
  const page = parseWikimediaFilePage(html, 'Defek terbakar.png');
  assert.equal(page.title, 'File:Defek terbakar.png');
  assert.equal(
    page.imageinfo[0].url,
    'https://upload.wikimedia.org/wikipedia/commons/4/48/Defek_terbakar.png'
  );
  assert.equal(page.imageinfo[0].extmetadata.LicenseShortName.value, 'CC BY-SA 4.0');
  assert.equal(page.imageinfo[0].extmetadata.Artist.value, 'Encik Tekateki');
  assert.match(page.imageinfo[0].extmetadata.ImageDescription.value, /Burning defects/);
});

test('Wikimedia API metadata is authoritative for license and strips author HTML', () => {
  const page = parseWikimediaApiResponse({
    query: {
      pages: {
        123: {
          title: 'File:Sink marks.jpg',
          imageinfo: [{
            url: 'https://upload.wikimedia.org/wikipedia/commons/6/63/Sink_marks.jpg',
            descriptionurl: 'https://commons.wikimedia.org/wiki/File:Sink_marks.jpg',
            extmetadata: {
              LicenseShortName: { value: 'CC BY-SA 4.0' },
              LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/4.0' },
              Artist: {
                value: '<span class="vcard"><a href="/wiki/User:Nalbarian">Nalbarian</a></span>'
              },
              ImageDescription: {
                value: '<div>Sink marks are an injection moulding defect.</div>'
              }
            }
          }]
        }
      }
    }
  }, 'Sink marks.jpg');

  assert.equal(page.title, 'File:Sink marks.jpg');
  assert.equal(page.imageinfo[0].extmetadata.LicenseShortName.value, 'CC BY-SA 4.0');
  assert.equal(
    page.imageinfo[0].extmetadata.LicenseUrl.value,
    'https://creativecommons.org/licenses/by-sa/4.0'
  );
  assert.equal(page.imageinfo[0].extmetadata.Artist.value, 'Nalbarian');
  assert.equal(
    page.imageinfo[0].extmetadata.ImageDescription.value,
    'Sink marks are an injection moulding defect.'
  );
});

test('Wikimedia originals are converted to documented bandwidth-saving thumbnails', () => {
  assert.equal(
    wikimediaThumbnailUrl(
      'https://upload.wikimedia.org/wikipedia/commons/f/fe/Defek_Isian_Kurang_Penuh.png',
      640
    ),
    'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fe/Defek_Isian_Kurang_Penuh.png/500px-Defek_Isian_Kurang_Penuh.png'
  );
  assert.equal(
    wikimediaThumbnailUrl(
      'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2a/Porosities_in_a_plastic_part.jpg/960px-Porosities_in_a_plastic_part.jpg',
      640
    ),
    'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2a/Porosities_in_a_plastic_part.jpg/500px-Porosities_in_a_plastic_part.jpg'
  );
});

test('Wikimedia connector selects 15 licensed visual cards without auto-qualifying Vision truth', () => {
  const basfCards = buildBasfCards({
    links: basfLinks,
    parsedPages,
    pdfSha256: basfPdfSha256,
    retrievedAt
  });
  const cards = buildWikimediaCards({
    pages: wikimediaPages,
    basfCards,
    downloadedImages: new Map(WIKIMEDIA_CASE_MAPPINGS.map((mapping, index) => [
      mapping.fileName,
      {
        localFile: `images/${mapping.fileName}`,
        contentSha256: String(index + 1).padStart(64, '0')
      }
    ])),
    retrievedAt
  });
  assert.equal(cards.length, 15);
  assert.ok(cards.every(card => card.sourceKind === 'licensed_image'));
  assert.ok(cards.every(card => card.review.requiresHumanReview === true));
  assert.ok(cards.every(card => card.metadata.visionBenchmarkEligible === false));
  assert.ok(cards.every(card => card.evidence[0].localFile.startsWith('images/')));
});

test('PMC open-access record creates one CC BY weld-line figure candidate', () => {
  const [mapping] = OPEN_ACCESS_FIGURE_MAPPINGS;
  const record = parsePmcOpenAccessRecord(`
    <OA>
      <record
        id="PMC10489043"
        citation="Materials (Basel). 2023 Sep 3; 16(17):6053"
        license="CC BY"
        retracted="no">
        <link format="tgz" href="ftp://ftp.ncbi.nlm.nih.gov/example.tar.gz" />
      </record>
    </OA>
  `, mapping);
  assert.equal(record.pmcId, 'PMC10489043');
  assert.equal(record.license, 'CC BY 4.0');
  assert.equal(record.retracted, false);

  const basfCards = buildBasfCards({
    links: basfLinks,
    parsedPages,
    pdfSha256: basfPdfSha256,
    retrievedAt
  });
  const cards = buildOpenAccessFigureCards({
    mappings: OPEN_ACCESS_FIGURE_MAPPINGS,
    records: new Map([[mapping.id, record]]),
    basfCards,
    downloadedImages: new Map([[
      mapping.id,
      {
        localFile: 'images/16-mdpi-weld-line-figure-5.jpg',
        contentSha256: 'f'.repeat(64),
        sizeBytes: 78685,
        mimeType: 'image/jpeg',
        downloadUrl: mapping.assetUrl,
        variant: 'publisher-550px-derivative'
      }
    ]]),
    retrievedAt
  });

  assert.equal(cards.length, 1);
  assert.equal(cards[0].defectClass, 'weld_line');
  assert.equal(cards[0].evidence[0].license, 'CC BY 4.0');
  assert.equal(cards[0].evidence[0].licenseUrl, 'https://creativecommons.org/licenses/by/4.0/');
  assert.equal(cards[0].review.autoApprovalAllowed, false);
  assert.equal(cards[0].metadata.visionBenchmarkEligible, false);
});

test('open-access mappings add three independent defect figures for the total gate', () => {
  assert.equal(OPEN_ACCESS_FIGURE_MAPPINGS.length, 4);
  assert.deepEqual(
    OPEN_ACCESS_FIGURE_MAPPINGS.map(mapping => mapping.pmcId),
    ['PMC10489043', 'PMC8659061', 'PMC9696673', 'PMC10422203']
  );
  assert.deepEqual(
    OPEN_ACCESS_FIGURE_MAPPINGS.slice(1).map(mapping => mapping.sourceDefectTitle),
    ['Diesel effect/Burning', 'Sink marks', 'Flash']
  );
  assert.equal(
    new Set(OPEN_ACCESS_FIGURE_MAPPINGS.map(mapping => mapping.assetUrl)).size,
    OPEN_ACCESS_FIGURE_MAPPINGS.length
  );
});

test('Wikimedia coverage keeps two independent sink examples and trims redundant flash examples', () => {
  const sinkMappings = WIKIMEDIA_CASE_MAPPINGS.filter(
    mapping => mapping.sourceDefectTitle === 'Sink marks'
  );
  const flashMappings = WIKIMEDIA_CASE_MAPPINGS.filter(
    mapping => mapping.sourceDefectTitle === 'Flash'
  );

  assert.equal(WIKIMEDIA_CASE_MAPPINGS.length, 15);
  assert.deepEqual(
    sinkMappings.map(mapping => mapping.fileName).sort(),
    ['Defek Kecut.png', 'Sink marks.jpg']
  );
  assert.equal(flashMappings.length, 2);
});

test('assembled collection exceeds the 40-card target with no approval or Graph writes', () => {
  const result = assembleCandidateCollection({
    basfLinks,
    parsedPages,
    basfPdfSha256,
    wikimediaPages,
    downloadedImages: new Map(WIKIMEDIA_CASE_MAPPINGS.map((mapping, index) => [
      mapping.fileName,
      {
        localFile: `images/${mapping.fileName}`,
        contentSha256: String(index + 1).padStart(64, '0')
      }
    ])),
    openAccessFigureRecords: new Map(OPEN_ACCESS_FIGURE_MAPPINGS.map(mapping => [
      mapping.id,
      {
        pmcId: mapping.pmcId,
        citation: 'Materials (Basel). 2023 Sep 3; 16(17):6053',
        license: 'CC BY 4.0',
        licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
        retracted: false
      }
    ])),
    downloadedOpenAccessImages: new Map(OPEN_ACCESS_FIGURE_MAPPINGS.map((mapping, index) => [
      mapping.id,
      {
        localFile: `images/${mapping.id}.jpg`,
        contentSha256: String(index + 100).padStart(64, '0'),
        sizeBytes: 78685,
        mimeType: 'image/jpeg',
        downloadUrl: mapping.assetUrl,
        variant: 'publisher-550px-derivative'
      }
    ])),
    retrievedAt,
    targetCards: 40
  });

  assert.equal(result.cards.length, 43);
  assert.equal(result.summary.totalCards, 43);
  assert.equal(result.summary.additionalCardsRequired, 0);
  assert.equal(result.summary.autoApproved, 0);
  assert.equal(result.summary.graphPromoted, 0);
  assert.equal(result.invalid.length, 0);
  assert.equal(result.template.items.length, 43);
  assert.equal(result.template.metadata.review_status, 'candidate');
});
