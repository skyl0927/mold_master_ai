const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const {
  DEFECT_CLASS_LABELS,
  REQUIRED_DEFECT_CLASSES,
  canonicalDefectClass
} = require('../shared/defect-taxonomy');

const args = process.argv.slice(2);
const option = name => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

const agentUrl = String(
  option('--agent-url')
  || process.env.COMMON_AGENT_URL
  || 'http://127.0.0.1:8000'
).replace(/\/+$/, '');
const reviewSessionId = String(option('--session') || '').trim();
const outputRoot = path.resolve(
  option('--output')
  || path.join(process.cwd(), 'artifacts', 'knowledge-card-vision-candidates', reviewSessionId)
);

const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');

const mimeExtension = mimeType => {
  if (mimeType.includes('jpeg')) return '.jpg';
  if (mimeType.includes('webp')) return '.webp';
  if (mimeType.includes('bmp')) return '.bmp';
  return '.png';
};

const safeName = value => String(value || '')
  .normalize('NFKC')
  .replace(/[<>:"/\\|?*\x00-\x1f]/g, '-')
  .replace(/\s+/g, '-')
  .replace(/-+/g, '-')
  .replace(/^-|-$/g, '')
  .slice(0, 80);

const fetchJson = async url => {
  const response = await fetch(url);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${JSON.stringify(payload)}`);
  }
  return payload;
};

const main = async () => {
  if (!reviewSessionId) {
    throw new Error('Usage: node scripts/sync-knowledge-card-vision-candidates.js --session <review-session-id>');
  }

  const session = await fetchJson(
    `${agentUrl}/v1/knowledge-cards/review-sessions/${encodeURIComponent(reviewSessionId)}`
  );
  await fs.mkdir(outputRoot, { recursive: true });
  const seenHashes = new Set();
  const candidates = [];
  const skipped = [];

  for (const card of session.cards || []) {
    const title = String(card?.identity?.title || '').trim();
    const defectClass = canonicalDefectClass(title);
    const figures = Array.isArray(card?.figure_blocks) ? card.figure_blocks : [];
    if (!REQUIRED_DEFECT_CLASSES.includes(defectClass) || figures.length === 0) {
      skipped.push({
        knowledgeId: card?.identity?.knowledge_id,
        title,
        defectClass,
        reason: figures.length === 0 ? 'no_figures' : 'outside_required_taxonomy'
      });
      continue;
    }

    for (const figure of figures) {
      const assetUri = String(figure?.asset_uri || '').trim();
      if (!assetUri.startsWith('/v1/assets/embedded-images/')) {
        skipped.push({
          knowledgeId: card?.identity?.knowledge_id,
          figureId: figure?.figure_id,
          reason: 'unsupported_asset_uri'
        });
        continue;
      }

      const response = await fetch(`${agentUrl}${assetUri}`);
      if (!response.ok) {
        skipped.push({
          knowledgeId: card?.identity?.knowledge_id,
          figureId: figure?.figure_id,
          reason: `download_${response.status}`
        });
        continue;
      }
      const content = Buffer.from(await response.arrayBuffer());
      const contentSha256 = sha256(content);
      if (seenHashes.has(contentSha256)) {
        skipped.push({
          knowledgeId: card?.identity?.knowledge_id,
          figureId: figure?.figure_id,
          reason: 'duplicate_hash'
        });
        continue;
      }
      seenHashes.add(contentSha256);

      const extension = mimeExtension(response.headers.get('content-type') || 'image/png');
      const fileName = [
        defectClass,
        `s${String(figure?.slide_number || card?.metadata?.slide_number || 0).padStart(3, '0')}`,
        safeName(figure?.figure_id || `figure-${candidates.length + 1}`)
      ].join('__') + extension;
      await fs.writeFile(path.join(outputRoot, fileName), content);

      const problemText = (card?.knowledge_intent?.problem_to_prevent || [])
        .map(value => String(value || '').trim())
        .filter(Boolean)
        .join(' ')
        .slice(0, 1600);
      candidates.push({
        relativePath: fileName,
        defectType: DEFECT_CLASS_LABELS[defectClass],
        defectClass,
        fieldContext: [
          `원문 카드: ${title}`,
          problemText ? `원문 현상: ${problemText}` : '',
          figure?.caption ? `그림 문맥: ${figure.caption}` : ''
        ].filter(Boolean).join('\n').slice(0, 2000),
        contentSha256,
        sourceLineage: {
          reviewSessionId,
          sourceDocumentId: card?.source_standard?.source_document_id,
          documentVersionId: card?.source_standard?.document_version_id,
          documentTitle: card?.source_standard?.document_title,
          knowledgeId: card?.identity?.knowledge_id,
          cardVersion: card?.card_version,
          slideNumber: figure?.slide_number || card?.metadata?.slide_number,
          figureId: figure?.figure_id,
          evidenceId: figure?.evidence_id,
          assetUri,
          sourceContentHash: figure?.content_hash,
          sourceReviewStatus: card?.validation?.status || 'review_needed'
        }
      });
    }
  }

  const manifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: {
      commonAgentUrl: agentUrl,
      reviewSessionId,
      status: session.status
    },
    policy: {
      persistence: 'none',
      autoApproval: false,
      graphPromotion: false,
      requiresHumanReview: true
    },
    summary: {
      candidates: candidates.length,
      skipped: skipped.length,
      classes: [...new Set(candidates.map(item => item.defectClass))]
    },
    candidates,
    skipped
  };
  const manifestPath = path.join(outputRoot, 'vision-candidates.json');
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  console.log(JSON.stringify({
    reviewSessionId,
    outputRoot,
    manifestPath,
    candidates: candidates.length,
    classes: manifest.summary.classes,
    skipped: skipped.length,
    persistedToDataset: false
  }, null, 2));
};

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
