const fs = require('node:fs');
const path = require('node:path');
const {
  buildVisionReferenceBackfillPlan
} = require('../visionReferenceBackfillPlan');

const root = path.resolve(__dirname, '..');
const artifactRoot = path.join(root, 'artifacts');
const outputPath = path.resolve(
  process.env.VISION_REFERENCE_BACKFILL_OUTPUT
  || path.join(artifactRoot, 'vision-reference-backfill-plan.json')
);

const normalizeBaseUrl = value =>
  String(value || 'http://127.0.0.1:8000').replace(/\/+$/, '');

const numberEnv = (value, fallback) =>
  Number.isFinite(Number(value)) ? Number(value) : fallback;

const boolEnv = (value, fallback) => {
  if (value === undefined) return fallback;
  return !['0', 'false', 'no', 'off'].includes(String(value).trim().toLowerCase());
};

const fetchJson = async url => {
  const response = await fetch(url);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${response.status} ${JSON.stringify(payload)}`);
  }
  return payload;
};

const run = async () => {
  const agentUrl = normalizeBaseUrl(process.env.COMMON_AGENT_URL || 'http://127.0.0.1:8000');
  const query = new URLSearchParams({
    review_status: process.env.VISION_REFERENCE_BACKFILL_REVIEW_STATUS || 'approved',
    include_hidden: String(boolEnv(process.env.VISION_REFERENCE_BACKFILL_INCLUDE_HIDDEN, true)),
    limit: String(numberEnv(process.env.VISION_REFERENCE_BACKFILL_LIMIT, 500))
  });
  const listUrl = `${agentUrl}/v1/datasets/images?${query.toString()}`;
  const response = await fetchJson(listUrl);
  const plan = buildVisionReferenceBackfillPlan({
    items: response.items || []
  });

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify({
    ...plan,
    source: {
      agentUrl,
      listUrl,
      totalFromCommonAgent: response.total ?? null
    }
  }, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    outputPath,
    status: plan.status,
    serviceWritesPerformed: plan.serviceWritesPerformed,
    summary: plan.summary,
    recommendedAction: plan.recommendedAction
  }, null, 2));
};

run().catch(error => {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const plan = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    status: 'failed',
    serviceWritesPerformed: false,
    localArtifactsWritten: true,
    summary: {
      total: 0,
      eligibleReferenceCandidates: 0,
      needsHitlBackfill: 0,
      blocked: 0,
      reasonCounts: {
        common_agent_dataset_query_failed: 1
      }
    },
    items: [],
    blocker: {
      code: 'common_agent_dataset_query_failed',
      detail: error instanceof Error ? error.message : String(error)
    },
    recommendedAction: 'Start or configure Common Agent, then rerun the Vision reference backfill plan.'
  };
  fs.writeFileSync(outputPath, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');
  console.error(error);
  process.exitCode = 1;
});
