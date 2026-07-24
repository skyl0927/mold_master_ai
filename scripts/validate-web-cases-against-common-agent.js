const fs = require('node:fs');
const path = require('node:path');

const {
  findLatestWebKnowledgeCollection,
  loadWebKnowledgeCollection
} = require('../webKnowledgeReviewStore');
const {
  suggestCauseLabels,
  suggestCheckItems
} = require('../webKnowledgeCardReviewLedger');
const { toTacitKnowledgeTemplate } = require('../webKnowledgeCard');

const baseUrl = String(
  process.env.COMMON_AGENT_URL || 'http://127.0.0.1:8000'
).replace(/\/+$/, '');
const outputPath = path.resolve(
  process.argv[2]
  || path.join(process.cwd(), 'artifacts', 'web-knowledge-common-agent-validation.json')
);

const postJson = async (url, payload, timeoutMs = 45000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(`${response.status} ${JSON.stringify(body)}`);
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
};

const main = async () => {
  const rootPath = findLatestWebKnowledgeCollection({
    configuredRoot: process.env.MOLD_MASTER_WEB_CASE_ROOT,
    artifactsRoot: path.join(process.cwd(), 'artifacts')
  });
  const collection = loadWebKnowledgeCollection(rootPath);
  const generatedAt = new Date().toISOString();
  const results = [];

  for (const card of collection.cards) {
    const probeCard = {
      ...card,
      causeLabels: suggestCauseLabels(card),
      checkItems: suggestCheckItems(card),
      review: {
        ...card.review,
        localHitlStatus: 'readiness_probe',
        reviewerComment: 'Automated schema readiness probe only; human HITL review is still pending.'
      }
    };
    const template = toTacitKnowledgeTemplate([probeCard], {
      generatedAt,
      documentId: `probe-${card.caseId}`,
      fileName: `probe-${card.caseId}.json`
    });
    template.metadata = {
      ...template.metadata,
      readiness_probe: true,
      local_hitl_approved: false,
      graph_promotion_allowed_before_review: false
    };
    try {
      const validation = await postJson(
        `${baseUrl}/v1/ingestions/template/validate`,
        template
      );
      results.push({
        caseId: card.caseId,
        defectName: card.defectName,
        sourceKind: card.sourceKind,
        readyToIngestAfterHitl: validation.ready_to_ingest === true,
        qualityScore: validation.quality_score,
        errorCount: validation.error_count,
        warningCount: validation.warning_count,
        infoCount: validation.info_count,
        issues: validation.issues || []
      });
    } catch (error) {
      results.push({
        caseId: card.caseId,
        defectName: card.defectName,
        sourceKind: card.sourceKind,
        readyToIngestAfterHitl: false,
        requestError: error instanceof Error ? error.message : String(error)
      });
    }
  }

  const passed = results.filter(item => item.readyToIngestAfterHitl).length;
  const report = {
    generatedAt,
    commonAgentUrl: baseUrl,
    collectionRoot: rootPath,
    mode: 'non_persisting_template_validation',
    humanApprovalsCreated: 0,
    centralIngestionsCreated: 0,
    graphPromotionsCreated: 0,
    total: results.length,
    passed,
    failed: results.length - passed,
    minimumQualityScore: Math.min(...results.map(item => Number(item.qualityScore) || 0)),
    results
  };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify({
    outputPath,
    total: report.total,
    passed: report.passed,
    failed: report.failed,
    minimumQualityScore: report.minimumQualityScore,
    humanApprovalsCreated: report.humanApprovalsCreated,
    centralIngestionsCreated: report.centralIngestionsCreated,
    graphPromotionsCreated: report.graphPromotionsCreated
  }, null, 2));
  if (report.failed > 0) process.exitCode = 1;
};

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
