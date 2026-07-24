const assert = require('node:assert/strict');
const test = require('node:test');

const {
  BASF_DEFECT_LABELS,
  WIKIMEDIA_CASE_MAPPINGS,
  assembleCandidateCollection,
  buildBasfCards,
  buildWikimediaCards,
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

test('Wikimedia connector selects 16 licensed visual cards without auto-qualifying Vision truth', () => {
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
  assert.equal(cards.length, 16);
  assert.ok(cards.every(card => card.sourceKind === 'licensed_image'));
  assert.ok(cards.every(card => card.review.requiresHumanReview === true));
  assert.ok(cards.every(card => card.metadata.visionBenchmarkEligible === false));
  assert.ok(cards.every(card => card.evidence[0].localFile.startsWith('images/')));
});

test('Wikimedia coverage keeps two independent sink examples and trims redundant flash examples', () => {
  const sinkMappings = WIKIMEDIA_CASE_MAPPINGS.filter(
    mapping => mapping.sourceDefectTitle === 'Sink marks'
  );
  const flashMappings = WIKIMEDIA_CASE_MAPPINGS.filter(
    mapping => mapping.sourceDefectTitle === 'Flash'
  );

  assert.equal(WIKIMEDIA_CASE_MAPPINGS.length, 16);
  assert.deepEqual(
    sinkMappings.map(mapping => mapping.fileName).sort(),
    ['Defek Kecut.png', 'Sink marks.jpg']
  );
  assert.equal(flashMappings.length, 2);
});

test('assembled collection reaches 40 valid cards with no approval or Graph writes', () => {
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
    retrievedAt,
    targetCards: 40
  });

  assert.equal(result.cards.length, 40);
  assert.equal(result.summary.totalCards, 40);
  assert.equal(result.summary.additionalCardsRequired, 0);
  assert.equal(result.summary.autoApproved, 0);
  assert.equal(result.summary.graphPromoted, 0);
  assert.equal(result.invalid.length, 0);
  assert.equal(result.template.items.length, 40);
  assert.equal(result.template.metadata.review_status, 'candidate');
});
