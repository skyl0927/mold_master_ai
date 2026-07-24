const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const {
  WIKIMEDIA_CASE_MAPPINGS,
  assembleCandidateCollection,
  parseWikimediaApiResponse,
  wikimediaThumbnailUrl
} = require('../webDefectCaseCollector');
const {
  extractBasfDefectLinks,
  parseBasfTroubleshootingPage
} = require('../webKnowledgeCard');
const { PoliteHttpClient } = require('../webCrawlerPolicy');

const BASF_LANDING_URL = [
  'https://plastics-rubber.basf.com/global/en/performance_polymers',
  'services/product_support_troubleshooting/injection_moulding_troubleshooter'
].join('/');

const args = process.argv.slice(2);
const option = name => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

const runId = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, '');
const outputRoot = path.resolve(
  option('--output')
  || path.join(process.cwd(), 'artifacts', `web-injection-defect-cases-${runId}`)
);
const targetCards = Number(option('--target') || 40);
const minimumIntervalMs = Number(option('--minimum-interval-ms') || 750);

const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');

const safeFileName = value => String(value || '')
  .normalize('NFKC')
  .replace(/[<>:"/\\|?*\x00-\x1f]/g, '-')
  .replace(/\s+/g, '-')
  .replace(/-+/g, '-')
  .replace(/^-|-$/g, '')
  .slice(0, 120);

const readResponseBytes = async response => {
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}: ${response.url}`);
  }
  return Buffer.from(await response.arrayBuffer());
};

const buildVisionCandidateManifest = collection => {
  const candidates = collection.cards
    .filter(card => card.sourceKind === 'licensed_image')
    .map(card => {
      const imageEvidence = card.evidence[0];
      return {
        relativePath: imageEvidence.localFile,
        defectType: card.defectName,
        defectClass: card.defectClass,
        labelProvenance: 'web_source_inferred',
        fieldContext: [
          card.problem,
          card.phenomenon,
          `출처: ${imageEvidence.publisher} - ${imageEvidence.title}`,
          `라이선스: ${imageEvidence.license}`
        ].filter(Boolean).join('\n').slice(0, 2400),
        contentSha256: imageEvidence.contentSha256,
        sourceLineage: {
          sourceUrl: imageEvidence.sourceUrl,
          assetUrl: imageEvidence.assetUrl,
          sourceTitle: imageEvidence.title,
          publisher: imageEvidence.publisher,
          author: imageEvidence.author,
          license: imageEvidence.license,
          licenseUrl: imageEvidence.licenseUrl,
          sourceReviewStatus: 'review_needed',
          caseId: card.caseId,
          webCollected: true
        },
        labelEvidence: {
          sourceLabel: card.defectName,
          conflict: true,
          nonPersisting: true
        },
        requiresLabelReconciliation: true,
        reviewPriority: 5,
        reviewBucket: 'external_source_requires_hitl',
        reviewReasons: [
          '외부 자료의 결함 라벨을 원본 이미지와 대조해야 합니다.',
          '사진 또는 도식 여부를 확인하기 전에는 Vision 벤치마크 표본으로 사용할 수 없습니다.'
        ]
      };
    });
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    policy: {
      persistence: 'none',
      autoApproval: false,
      graphPromotion: false,
      requiresHumanReview: true,
      visionBenchmarkEligibility: 'blocked_until_photographic_hitl_confirmation'
    },
    summary: {
      candidates: candidates.length,
      classes: [...new Set(candidates.map(item => item.defectClass))],
      autoApproved: 0,
      graphPromoted: 0
    },
    candidates
  };
};

const main = async () => {
  if (!Number.isInteger(targetCards) || targetCards <= 0) {
    throw new Error(`--target must be a positive integer: ${targetCards}`);
  }
  const client = new PoliteHttpClient({ minimumIntervalMs });
  const retrievedAt = new Date().toISOString();

  const landingResponse = await client.fetch(BASF_LANDING_URL, {
    accept: 'text/html'
  });
  if (!landingResponse.ok) {
    throw new Error(`BASF landing page failed: HTTP ${landingResponse.status}`);
  }
  const landingHtml = await landingResponse.text();
  const basfLinks = extractBasfDefectLinks(landingHtml);
  if (basfLinks.length !== 24) {
    throw new Error(`Expected 24 BASF defect links, received ${basfLinks.length}`);
  }

  const pdfUrl = new URL(basfLinks[0].sourceUrl);
  pdfUrl.hash = '';
  const pdfResponse = await client.fetch(pdfUrl.toString(), {
    accept: 'application/pdf',
    timeoutMs: 120000
  });
  const pdfBytes = await readResponseBytes(pdfResponse);
  const pdfSha256 = sha256(pdfBytes);
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdf = await pdfjs.getDocument({
    data: new Uint8Array(pdfBytes),
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true
  }).promise;
  const parsedPages = new Map();
  for (const link of basfLinks) {
    const page = await pdf.getPage(link.pageNumber);
    const content = await page.getTextContent();
    parsedPages.set(link.pageNumber, parseBasfTroubleshootingPage(content.items));
  }

  await fs.mkdir(path.join(outputRoot, 'images'), { recursive: true });
  const wikimediaPages = [];
  const downloadedImages = new Map();
  for (const [index, mapping] of WIKIMEDIA_CASE_MAPPINGS.entries()) {
    const sourceUrl = `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(mapping.fileName)}`;
    const apiUrl = new URL('https://commons.wikimedia.org/w/api.php');
    apiUrl.search = new URLSearchParams({
      action: 'query',
      format: 'json',
      prop: 'imageinfo',
      iiprop: 'url|extmetadata',
      titles: `File:${mapping.fileName}`
    }).toString();
    const sourceResponse = await client.fetch(apiUrl.toString(), {
      accept: 'application/json',
      officialApi: true
    });
    if (!sourceResponse.ok) continue;
    const page = parseWikimediaApiResponse(await sourceResponse.json(), mapping.fileName);
    wikimediaPages.push(page);
    const imageInfo = page?.imageinfo?.[0];
    if (!imageInfo?.url) continue;
    const extension = path.extname(new URL(imageInfo.url).pathname) || '.img';
    const fileName = [
      String(index + 1).padStart(2, '0'),
      safeFileName(path.basename(mapping.fileName, path.extname(mapping.fileName)))
    ].join('-') + extension.toLocaleLowerCase();
    const relativePath = path.posix.join('images', fileName);
    const absolutePath = path.join(outputRoot, relativePath);
    let bytes = await fs.readFile(absolutePath).catch(() => null);
    let mimeType = '';
    let downloadUrl = imageInfo.url;
    let variant = 'original_cached_before_thumbnail_policy';
    if (!bytes || bytes.length === 0) {
      downloadUrl = wikimediaThumbnailUrl(imageInfo.url, 500);
      variant = '500px-standard-thumbnail';
      const imageResponse = await client.fetch(downloadUrl, {
        accept: 'image/*',
        timeoutMs: 120000
      });
      bytes = await readResponseBytes(imageResponse);
      mimeType = imageResponse.headers.get('content-type') || 'application/octet-stream';
      await fs.writeFile(absolutePath, bytes);
    }
    downloadedImages.set(mapping.fileName, {
      localFile: relativePath,
      contentSha256: sha256(bytes),
      sizeBytes: bytes.length,
      mimeType: mimeType || 'application/octet-stream',
      downloadUrl,
      variant
    });
    await fs.writeFile(
      path.join(outputRoot, 'collection-progress.json'),
      `${JSON.stringify({
        updatedAt: new Date().toISOString(),
        currentFile: mapping.fileName,
        completedImages: downloadedImages.size,
        targetImages: WIKIMEDIA_CASE_MAPPINGS.length,
        networkAudit: client.report(),
        commonAgentSqlWrites: false,
        graphWrites: false,
        approvals: false
      }, null, 2)}\n`,
      'utf8'
    );
  }

  const collection = assembleCandidateCollection({
    basfLinks,
    parsedPages,
    basfPdfSha256: pdfSha256,
    wikimediaPages,
    downloadedImages,
    retrievedAt,
    targetCards
  });
  const visionManifest = buildVisionCandidateManifest(collection);
  const report = {
    schemaVersion: 1,
    generatedAt: retrievedAt,
    outputRoot,
    sourceSummary: {
      basfDefectLinks: basfLinks.length,
      basfPdfPages: pdf.numPages,
      wikimediaFilePages: wikimediaPages.length,
      wikimediaSelectedImages: downloadedImages.size
    },
    collection: collection.summary,
    invalid: collection.invalid,
    excluded: collection.excluded,
    policy: collection.policy,
    networkAudit: client.report(),
    writesPerformed: {
      localArtifacts: true,
      commonAgentSql: false,
      graph: false,
      approvals: false
    }
  };

  await Promise.all([
    fs.writeFile(
      path.join(outputRoot, 'cards.json'),
      `${JSON.stringify(collection.cards, null, 2)}\n`,
      'utf8'
    ),
    fs.writeFile(
      path.join(outputRoot, 'common-agent-tacit-template.json'),
      `${JSON.stringify(collection.template, null, 2)}\n`,
      'utf8'
    ),
    fs.writeFile(
      path.join(outputRoot, 'vision-candidates.json'),
      `${JSON.stringify(visionManifest, null, 2)}\n`,
      'utf8'
    ),
    fs.writeFile(
      path.join(outputRoot, 'collection-report.json'),
      `${JSON.stringify(report, null, 2)}\n`,
      'utf8'
    )
  ]);

  const success = collection.summary.totalCards === targetCards
    && collection.invalid.length === 0
    && collection.summary.autoApproved === 0
    && collection.summary.graphPromoted === 0;
  console.log(JSON.stringify({
    outputRoot,
    cards: collection.summary.totalCards,
    targetCards,
    sourceSummary: report.sourceSummary,
    invalid: collection.invalid.length,
    excluded: collection.excluded.length,
    securityWarnings: report.networkAudit.securityWarnings,
    commonAgentSqlWrites: false,
    graphWrites: false,
    approvals: false,
    success
  }, null, 2));
  if (!success) process.exitCode = 1;
};

main().catch(async error => {
  await fs.mkdir(outputRoot, { recursive: true }).catch(() => {});
  await fs.writeFile(
    path.join(outputRoot, 'collection-error.json'),
    `${JSON.stringify({
      generatedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
      commonAgentSqlWrites: false,
      graphWrites: false,
      approvals: false
    }, null, 2)}\n`,
    'utf8'
  ).catch(() => {});
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exitCode = 1;
});
