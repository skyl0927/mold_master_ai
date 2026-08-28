const fs = require('node:fs');
const path = require('node:path');

const {
  assessNoWriteDiagnosis,
  buildDatasetSnapshot,
  buildNoWriteVisionForm,
  normalizeVisionRuntimeStatus,
  shouldRetryNoWriteDiagnosisStatus,
  summarizeNoWriteMultiviewEvaluation,
  validateNoWriteMultiviewCases
} = require('./lib/no-write-multiview-evaluation');

const root = process.cwd();
const args = process.argv.slice(2);
const valueAfter = flag => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};
const manifestPath = path.resolve(
  valueAfter('--manifest')
    || path.join(root, 'eval', 'vision-no-write-multiview', 'manifest.json')
);
const artifactPath = path.resolve(
  valueAfter('--output')
    || path.join(root, 'artifacts', 'vision-no-write-multiview-report.json')
);
const baselinePath = path.resolve(
  valueAfter('--baseline')
    || path.join(
      root,
      'artifacts',
      'goal-review-20260828',
      'multimodal-vision-benchmark-after-runtime-contract.json'
    )
);
const baseUrl = (
  valueAfter('--base-url')
  || process.env.COMMON_AGENT_URL
  || 'http://127.0.0.1:8000'
).replace(/\/+$/, '');

const validateEndpoint = rawUrl => {
  const parsed = new URL(rawUrl);
  const loopback = ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(parsed.hostname);
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && loopback)) {
    throw new Error('Common Agent evaluation requires HTTPS except for loopback HTTP');
  }
  return parsed.toString().replace(/\/$/, '');
};

const fetchWithTimeout = (url, options = {}, timeoutMs = 180000) => fetch(url, {
  ...options,
  signal: AbortSignal.timeout(timeoutMs)
});

const fetchDatasetSnapshot = async endpoint => {
  const [datasetResponse, statusResponse] = await Promise.all([
    fetchWithTimeout(`${endpoint}/v1/datasets/images?limit=500`, {}, 30000),
    fetchWithTimeout(`${endpoint}/v1/vision/status`, {}, 30000)
  ]);
  const datasetPayload = await datasetResponse.json().catch(() => ({}));
  const statusPayload = await statusResponse.json().catch(() => ({}));
  if (!datasetResponse.ok || !statusResponse.ok) {
    throw new Error(
      `dataset snapshot failed: dataset=${datasetResponse.status} status=${statusResponse.status}`
    );
  }
  return buildDatasetSnapshot(datasetPayload, {
    centralCount: statusPayload.image_dataset_count
  });
};

const loadView = async (endpoint, view) => {
  const response = await fetchWithTimeout(
    `${endpoint}/v1/datasets/images/${encodeURIComponent(view.commonAgentImageId)}/file`,
    {},
    60000
  );
  if (!response.ok) {
    throw new Error(
      `image download failed for ${view.commonAgentImageId}: ${response.status}`
    );
  }
  return {
    ...view,
    bytes: Buffer.from(await response.arrayBuffer()),
    mimeType: response.headers.get('content-type') || view.mimeType || 'image/png'
  };
};

const loadRuntimeAttestation = async endpoint => {
  const response = await fetchWithTimeout(`${endpoint}/v1/vision/status`, {}, 30000);
  const payload = await response.json().catch(() => ({}));
  return { httpOk: response.ok, ...normalizeVisionRuntimeStatus(payload) };
};

const loadBaseline = () => {
  if (!fs.existsSync(baselinePath)) return new Map();
  const report = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
  return new Map((report.results || []).map(result => [
    String(result.id || '').replace(/^approved-/, ''),
    {
      actualDefectType: result.actualDefectType || null,
      actualDefectClass: result.actualDefectClass || null,
      top1Accurate: Boolean(result.top1Accurate),
      top3Accurate: Boolean(result.top3Accurate),
      decisionStatus: result.decisionStatus || null,
      visionConfidence: Number(result.visionConfidence || 0)
    }
  ]));
};

const selectResponseEvidence = payload => ({
  observationSummary: payload?.observation?.summary || null,
  visibleFeatures: payload?.observation?.visible_features || [],
  requiredAdditionalViews: payload?.observation?.required_additional_views || [],
  fusionReport: payload?.fusion_report || null,
  graphGrounding: payload?.graph_grounding || null,
  metadata: payload?.metadata || {},
  traceAttestations: (payload?.reasoning_trace || []).filter(item =>
    /(?:answer_ledger|image_dataset|service_writes|vision_graph|multiview_|evidence_policy)=/i.test(String(item))
  )
});

const writeReport = report => {
  fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
  fs.writeFileSync(artifactPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
};

const sleep = delayMs => new Promise(resolve => setTimeout(resolve, delayMs));

const diagnoseWithTransientRetry = async ({ endpoint, testCase, loadedViews }) => {
  let lastResponse;
  let lastPayload = {};
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const form = buildNoWriteVisionForm(testCase, loadedViews);
    lastResponse = await fetchWithTimeout(`${endpoint}/v1/vision/diagnose`, {
      method: 'POST',
      body: form
    });
    lastPayload = await lastResponse.json().catch(() => ({}));
    if (lastResponse.ok || !shouldRetryNoWriteDiagnosisStatus(lastResponse.status)) {
      return { response: lastResponse, payload: lastPayload, attempts: attempt };
    }
    if (attempt < 2) await sleep(1500);
  }
  return { response: lastResponse, payload: lastPayload, attempts: 2 };
};

const runCase = async ({ endpoint, testCase, before, baseline }) => {
  const startedAt = Date.now();
  try {
    const loadedViews = [];
    for (const view of testCase.views) loadedViews.push(await loadView(endpoint, view));
    const diagnosis = await diagnoseWithTransientRetry({ endpoint, testCase, loadedViews });
    const { response, payload } = diagnosis;
    const after = await fetchDatasetSnapshot(endpoint);
    if (!response.ok) {
      return {
        result: {
          id: testCase.id,
          operationallyValid: false,
          noWriteAttested: false,
          datasetUnchanged: before.fingerprint === after.fingerprint,
          fusionSucceeded: false,
          top1Accurate: false,
          top3Accurate: false,
          graphGrounded: false,
          releaseEvidenceEligible: false,
          attempts: diagnosis.attempts,
          error: `HTTP ${response.status}: ${JSON.stringify(payload)}`
        },
        after
      };
    }
    const assessment = assessNoWriteDiagnosis(testCase, payload, { before, after });
    return {
      result: {
        ...assessment,
        attempts: diagnosis.attempts,
        latencyMs: Date.now() - startedAt,
        sourceViews: testCase.views.map(view => ({
          captureViewTag: view.captureViewTag,
          commonAgentImageId: view.commonAgentImageId,
          singleViewBaseline: baseline.get(view.commonAgentImageId) || null
        })),
        responseEvidence: selectResponseEvidence(payload)
      },
      after
    };
  } catch (error) {
    const after = await fetchDatasetSnapshot(endpoint).catch(() => before);
    return {
      result: {
        id: testCase.id,
        operationallyValid: false,
        noWriteAttested: false,
        datasetUnchanged: before.fingerprint === after.fingerprint,
        fusionSucceeded: false,
        top1Accurate: false,
        top3Accurate: false,
        graphGrounded: false,
        releaseEvidenceEligible: false,
        latencyMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error)
      },
      after
    };
  }
};

const run = async () => {
  const endpoint = validateEndpoint(baseUrl);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const validation = validateNoWriteMultiviewCases(manifest.cases || []);
  if (validation.invalid.length > 0) {
    const report = {
      generatedAt: new Date().toISOString(),
      mode: 'validation_failed',
      manifestPath,
      invalidCases: validation.invalid,
      serviceWritesPerformed: false
    };
    writeReport(report);
    throw new Error(`invalid multiview cases: ${JSON.stringify(validation.invalid)}`);
  }

  const runtimeAttestation = await loadRuntimeAttestation(endpoint);
  const baseline = loadBaseline();
  const initialDatasetSnapshot = await fetchDatasetSnapshot(endpoint);
  let currentSnapshot = initialDatasetSnapshot;
  const results = [];
  for (const testCase of validation.valid) {
    const execution = await runCase({
      endpoint,
      testCase,
      before: currentSnapshot,
      baseline
    });
    results.push(execution.result);
    currentSnapshot = execution.after;
  }
  const summary = summarizeNoWriteMultiviewEvaluation(results);
  const report = {
    generatedAt: new Date().toISOString(),
    mode: 'live_no_write_shadow',
    manifestPath,
    baselinePath: fs.existsSync(baselinePath) ? baselinePath : null,
    commonAgentUrl: endpoint,
    runtimeAttestation,
    initialDatasetSnapshot,
    finalDatasetSnapshot: currentSnapshot,
    summary,
    invalidCases: [],
    results
  };
  writeReport(report);
  console.log(
    `No-write multiview: valid=${summary.operationallyValid}/${summary.total} `
    + `fusion=${summary.fusionSuccessRate}% Top-1=${summary.top1Accuracy}% `
    + `Top-3=${summary.top3Accuracy}% Graph=${summary.graphGroundedRate}%`
  );
  console.log(
    `No-write gate=${summary.noWriteGatePassed} `
    + `release evidence=${summary.releaseEligibleCases}/${summary.total}`
  );
  console.log(`Report: ${artifactPath}`);
  if (!summary.noWriteGatePassed) process.exitCode = 1;
};

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
