const fs = require('node:fs');
const path = require('node:path');
const {
  buildVisionHitlReevaluationManifest,
  buildVisionHitlReevaluationPlan
} = require('../visionHitlReevaluationPlan');

const root = path.resolve(__dirname, '..');
const artifactRoot = path.join(root, 'artifacts');
const evalRoot = path.join(root, 'eval', 'vision-hitl-recheck');

const normalizeBaseUrl = value =>
  String(value || 'http://127.0.0.1:8000').replace(/\/+$/, '');

const numberEnv = (value, fallback) =>
  Number.isFinite(Number(value)) ? Number(value) : fallback;

const boolEnv = (value, fallback) => {
  if (value === undefined) return fallback;
  return !['0', 'false', 'no', 'off'].includes(String(value).trim().toLowerCase());
};

const outputPath = path.resolve(
  process.env.VISION_HITL_REEVALUATION_OUTPUT
  || path.join(artifactRoot, 'vision-hitl-reevaluation-plan.json')
);

const manifestPath = path.resolve(
  process.env.VISION_HITL_REEVALUATION_MANIFEST
  || path.join(evalRoot, 'manifest.json')
);

const fetchJson = async url => {
  const response = await fetch(url);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${response.status} ${JSON.stringify(payload)}`);
  }
  return payload;
};

const writeJson = (targetPath, payload) => {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
};

const run = async () => {
  const agentUrl = normalizeBaseUrl(process.env.COMMON_AGENT_URL || 'http://127.0.0.1:8000');
  const query = new URLSearchParams({
    include_hidden: String(boolEnv(process.env.VISION_HITL_REEVALUATION_INCLUDE_HIDDEN, true)),
    limit: String(numberEnv(process.env.VISION_HITL_REEVALUATION_LIMIT, 500))
  });
  if (process.env.VISION_HITL_REEVALUATION_REVIEW_STATUS) {
    query.set('review_status', process.env.VISION_HITL_REEVALUATION_REVIEW_STATUS);
  }

  const listUrl = `${agentUrl}/v1/datasets/images?${query.toString()}`;
  const response = await fetchJson(listUrl);
  const plan = buildVisionHitlReevaluationPlan({
    items: response.items || []
  });
  const manifest = buildVisionHitlReevaluationManifest(plan);

  writeJson(outputPath, {
    ...plan,
    source: {
      agentUrl,
      listUrl,
      totalFromCommonAgent: response.total ?? null
    },
    benchmarkManifestPath: manifestPath
  });
  writeJson(manifestPath, manifest);

  console.log(JSON.stringify({
    outputPath,
    manifestPath,
    status: plan.status,
    serviceWritesPerformed: plan.serviceWritesPerformed,
    summary: plan.summary,
    recommendedAction: plan.recommendedAction
  }, null, 2));
};

run().catch(error => {
  const plan = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    status: 'failed',
    serviceWritesPerformed: false,
    localArtifactsWritten: true,
    summary: {
      totalInputItems: 0,
      totalHitlReviewItems: 0,
      readyForShadowRecheck: 0,
      waitingForRecapture: 0,
      pendingHumanReview: 0,
      excludedRejected: 0,
      blocked: 0,
      queueCounts: {},
      reasonCounts: {
        common_agent_dataset_query_failed: 1
      }
    },
    items: [],
    blocker: {
      code: 'common_agent_dataset_query_failed',
      detail: error instanceof Error ? error.message : String(error)
    },
    recommendedAction: 'Start or configure Common Agent, then rerun the Vision HITL re-evaluation plan.'
  };
  writeJson(outputPath, plan);
  writeJson(manifestPath, buildVisionHitlReevaluationManifest(plan));
  console.error(error);
  process.exitCode = 1;
});
