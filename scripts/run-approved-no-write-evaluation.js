const fs = require('node:fs');
const path = require('node:path');
const { createScriptFetch } = require('../scriptCommonAgentFetch');

const {
  assessApprovedNoWriteDiagnosis,
  buildApprovedNoWriteVisionForm,
  selectApprovedNoWriteCases,
  summarizeApprovedNoWriteEvaluation
} = require('./lib/approved-no-write-evaluation');
const {
  buildDatasetSnapshot,
  normalizeVisionRuntimeStatus,
  shouldRetryNoWriteDiagnosisStatus
} = require('./lib/no-write-multiview-evaluation');

const root = process.cwd();
const args = process.argv.slice(2);
const valueAfter = flag => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};
const manifestPath = path.resolve(
  valueAfter('--manifest') || path.join(root, 'eval', 'vision-approved', 'manifest.json')
);
const baselinePath = path.resolve(
  valueAfter('--baseline') || path.join(
    root,
    'artifacts',
    'goal-review-20260828',
    'multimodal-vision-benchmark-after-runtime-contract.json'
  )
);
const artifactPath = path.resolve(
  valueAfter('--output') || path.join(
    root,
    'artifacts',
    'approved-vision-no-write-shadow-report.json'
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

const fetchWithTimeout = createScriptFetch({agentUrl:baseUrl});

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

const loadRuntimeAttestation = async endpoint => {
  const response = await fetchWithTimeout(`${endpoint}/v1/vision/status`, {}, 30000);
  const payload = await response.json().catch(() => ({}));
  return { httpOk: response.ok, ...normalizeVisionRuntimeStatus(payload) };
};

const loadFixtures = () => {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const manifestDir = path.dirname(manifestPath);
  return (manifest.cases || [])
    .filter(item => item.status === 'active' || !item.status)
    .map(item => {
      if (!item.file) return item;
      return JSON.parse(fs.readFileSync(path.resolve(manifestDir, item.file), 'utf8'));
    });
};

const loadBaselineResults = () => {
  const report = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
  return report.results || [];
};

const loadImage = async (endpoint, testCase) => {
  const response = await fetchWithTimeout(
    `${endpoint}/v1/datasets/images/${encodeURIComponent(testCase.commonAgentImageId)}/file`,
    {},
    60000
  );
  if (!response.ok) {
    throw new Error(
      `image download failed for ${testCase.commonAgentImageId}: ${response.status}`
    );
  }
  return {
    bytes: Buffer.from(await response.arrayBuffer()),
    mimeType: response.headers.get('content-type') || testCase.mimeType || 'image/png'
  };
};

const sleep = delayMs => new Promise(resolve => setTimeout(resolve, delayMs));

const diagnoseWithTransientRetry = async ({ endpoint, testCase, loadedImage }) => {
  let lastResponse;
  let lastPayload = {};
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    lastResponse = await fetchWithTimeout(`${endpoint}/v1/vision/diagnose`, {
      method: 'POST',
      body: buildApprovedNoWriteVisionForm(testCase, loadedImage)
    });
    lastPayload = await lastResponse.json().catch(() => ({}));
    if (lastResponse.ok || !shouldRetryNoWriteDiagnosisStatus(lastResponse.status)) {
      return { response: lastResponse, payload: lastPayload, attempts: attempt };
    }
    if (attempt < 2) await sleep(1500);
  }
  return { response: lastResponse, payload: lastPayload, attempts: 2 };
};

const selectResponseEvidence = payload => ({
  observationSummary: payload?.observation?.summary || null,
  visibleFeatures: payload?.observation?.visible_features || [],
  requiredAdditionalViews: payload?.observation?.required_additional_views || [],
  graphGrounding: payload?.graph_grounding || null,
  metadata: payload?.metadata || {},
  traceAttestations: (payload?.reasoning_trace || []).filter(item =>
    /(?:answer_ledger|image_dataset|service_writes|vision_graph|evidence_policy)=/i.test(
      String(item)
    )
  )
});

const runCase = async ({ endpoint, testCase, before }) => {
  const startedAt = Date.now();
  try {
    const loadedImage = await loadImage(endpoint, testCase);
    const diagnosis = await diagnoseWithTransientRetry({ endpoint, testCase, loadedImage });
    const after = await fetchDatasetSnapshot(endpoint);
    if (!diagnosis.response.ok) {
      return {
        result: {
          id: testCase.id,
          operationallyValid: false,
          noWriteAttested: false,
          datasetUnchanged: before.fingerprint === after.fingerprint,
          classifiable: false,
          top1Accurate: false,
          top3Accurate: false,
          graphGrounded: false,
          releaseEvidenceEligible: false,
          attempts: diagnosis.attempts,
          error: `HTTP ${diagnosis.response.status}: ${JSON.stringify(diagnosis.payload)}`
        },
        after
      };
    }
    return {
      result: {
        ...assessApprovedNoWriteDiagnosis(testCase, diagnosis.payload, { before, after }),
        attempts: diagnosis.attempts,
        latencyMs: Date.now() - startedAt,
        sourceImage: {
          commonAgentImageId: testCase.commonAgentImageId
        },
        responseEvidence: selectResponseEvidence(diagnosis.payload)
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
        classifiable: false,
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

const writeReport = report => {
  fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
  fs.writeFileSync(artifactPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
};

const run = async () => {
  const endpoint = validateEndpoint(baseUrl);
  const selection = selectApprovedNoWriteCases(loadFixtures(), loadBaselineResults());
  if (selection.valid.length === 0) {
    throw new Error('no approved no-write shadow cases are runnable');
  }

  const runtimeAttestation = await loadRuntimeAttestation(endpoint);
  const initialDatasetSnapshot = await fetchDatasetSnapshot(endpoint);
  let currentSnapshot = initialDatasetSnapshot;
  const results = [];
  for (const testCase of selection.valid) {
    const execution = await runCase({
      endpoint,
      testCase,
      before: currentSnapshot
    });
    results.push(execution.result);
    currentSnapshot = execution.after;
    console.log(
      `[${results.length}/${selection.valid.length}] ${testCase.id} `
      + `no-write=${Boolean(execution.result.noWriteAttested)} `
      + `Top-1=${Boolean(execution.result.top1Accurate)} `
      + `Graph=${Boolean(execution.result.graphGrounded)}`
    );
  }

  const summary = {
    ...summarizeApprovedNoWriteEvaluation(results),
    runtimeAttestationReady: runtimeAttestation.ready === true
  };
  const report = {
    generatedAt: new Date().toISOString(),
    mode: 'live_approved_single_view_no_write_shadow',
    manifestPath,
    baselinePath,
    commonAgentUrl: endpoint,
    runtimeAttestation,
    initialDatasetSnapshot,
    finalDatasetSnapshot: currentSnapshot,
    skippedCases: selection.skipped,
    summary,
    results
  };
  writeReport(report);
  console.log(
    `Approved no-write shadow: valid=${summary.operationallyValid}/${summary.total} `
    + `Top-1=${summary.top1Accuracy}% Top-3=${summary.top3Accuracy}% `
    + `Graph=${summary.graphGroundedRate}%`
  );
  console.log(`No-write gate=${summary.noWriteGatePassed}`);
  console.log(`Report: ${artifactPath}`);
  if (!summary.noWriteGatePassed || !summary.runtimeAttestationReady) process.exitCode = 1;
};

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
