const { REQUIRED_DEFECT_CLASSES } = require('./shared/defect-taxonomy');

const DEFAULT_MODEL_VERSION = 'dinov2:facebook/dinov2-base';

const asArray = value => Array.isArray(value) ? value : [];

const numberOrDefault = (value, fallback) =>
  Number.isFinite(Number(value)) ? Number(value) : fallback;

const normalizeBaseUrl = value =>
  String(value || 'http://127.0.0.1:8000').replace(/\/+$/, '');

const endpoint = (agentUrl, path) => `${normalizeBaseUrl(agentUrl)}${path}`;

const buildVisionReferenceBenchmarkRequest = ({
  currentStatus = {},
  modelVersion,
  requiredDefectTypes = REQUIRED_DEFECT_CLASSES,
  minimumReferenceSupport = 3,
  minimumSamples = 20,
  minimumSamplesPerClass = 2,
  minimumTop1Accuracy = 0.8,
  minimumTop3Accuracy = 0.9
} = {}) => ({
  embedding_model_version:
    modelVersion
    || currentStatus.embedding_model_version
    || DEFAULT_MODEL_VERSION,
  minimum_reference_support: numberOrDefault(minimumReferenceSupport, 3),
  minimum_samples: numberOrDefault(minimumSamples, 20),
  required_defect_types: [...requiredDefectTypes],
  minimum_samples_per_class: numberOrDefault(minimumSamplesPerClass, 2),
  minimum_top1_accuracy: numberOrDefault(minimumTop1Accuracy, 0.8),
  minimum_top3_accuracy: numberOrDefault(minimumTop3Accuracy, 0.9)
});

const storeBlocker = status => {
  if (status?.ready === true) return null;
  return {
    code: status?.status === 'invalid'
      ? 'reference_store_invalid'
      : 'reference_store_missing',
    detail: String(status?.message || status?.status || 'current reference store is not ready')
  };
};

const prototypeBlocker = status => {
  if (!status || status.embedding_production_ready !== false) return null;
  return {
    code: 'prototype_embedding_model',
    modelVersion: String(status.embedding_model_version || '')
  };
};

const benchmarkBlockers = report => {
  if (!report) return [];
  if (report.ready_for_graph_retrieval === true) return [];
  return asArray(report.failed_gate_checks).length
    ? asArray(report.failed_gate_checks).map(check => ({
      code: `benchmark_${check}`
    }))
    : [{ code: 'benchmark_not_ready' }];
};

const buildVisionReferenceOperationalReport = ({
  generatedAt = new Date().toISOString(),
  agentUrl,
  refreshAttempted = false,
  beforeStatus = null,
  refreshResult = null,
  refreshError = null,
  afterStatus = beforeStatus,
  benchmarkRequest = null,
  benchmarkReport = null,
  benchmarkError = null
} = {}) => {
  const blockers = [];
  const statusBlocker = storeBlocker(afterStatus);
  const prototype = prototypeBlocker(afterStatus);
  if (statusBlocker) blockers.push(statusBlocker);
  if (prototype) blockers.push(prototype);
  if (refreshError) {
    blockers.push({
      code: 'reference_refresh_failed',
      detail: String(refreshError)
    });
  }
  if (benchmarkError) {
    blockers.push({
      code: 'reference_benchmark_failed',
      detail: String(benchmarkError)
    });
  }
  blockers.push(...benchmarkBlockers(benchmarkReport));

  const readyForGraphRetrieval =
    afterStatus?.ready === true
    && afterStatus?.embedding_production_ready !== false
    && benchmarkReport?.ready_for_graph_retrieval === true
    && blockers.length === 0;

  return {
    schemaVersion: 1,
    generatedAt,
    status: readyForGraphRetrieval ? 'passed' : 'blocked',
    readyForGraphRetrieval,
    agentUrl: normalizeBaseUrl(agentUrl),
    refreshAttempted,
    benchmarkExecuted: Boolean(benchmarkReport || benchmarkError),
    serviceWritesPerformed: refreshAttempted && Boolean(refreshResult) && !refreshError,
    localArtifactsWritten: true,
    referenceStore: {
      before: beforeStatus,
      after: afterStatus,
      ready: afterStatus?.ready === true,
      referenceCount: Number(afterStatus?.reference_count) || 0,
      modelVersion: afterStatus?.embedding_model_version || null,
      provider: afterStatus?.embedding_provider || null,
      modelName: afterStatus?.embedding_model_name || null,
      dimensions: afterStatus?.embedding_dimensions || null,
      device: afterStatus?.embedding_device || null,
      runtime: afterStatus?.embedding_runtime || null,
      productionReady: afterStatus?.embedding_production_ready ?? null,
      warnings: asArray(afterStatus?.warnings)
    },
    refresh: refreshResult,
    benchmark: {
      request: benchmarkRequest,
      report: benchmarkReport,
      evaluatedCount: Number(benchmarkReport?.evaluated_count) || 0,
      top1Accuracy: Number(benchmarkReport?.top1_accuracy) || 0,
      top3Accuracy: Number(benchmarkReport?.top3_accuracy) || 0,
      failedGateChecks: asArray(benchmarkReport?.failed_gate_checks)
    },
    blockers,
    recommendedAction: readyForGraphRetrieval
      ? 'Mold Master AI Vision benchmark gate can stay in shadow and collect production traces before enforce mode.'
      : statusBlocker
        ? 'Run the Common Agent Vision reference refresh after the server and approved multi-view dataset are available.'
        : prototype
          ? 'Regenerate the reference store with DINOv2 or SigLIP2 production embeddings.'
          : 'Resolve the benchmark failed gate checks, then rerun the Vision reference operational gate.'
  };
};

const defaultFetchJson = async (url, options = {}) => {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...(options.body ? { 'content-type': 'application/json' } : {})
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${response.status} ${JSON.stringify(payload)}`);
  }
  return payload;
};

const errorText = error => error instanceof Error ? error.message : String(error);

const runVisionReferenceOperationalGate = async ({
  agentUrl = 'http://127.0.0.1:8000',
  refresh = true,
  generatedAt = new Date().toISOString(),
  fetchJson = defaultFetchJson,
  benchmarkOptions = {}
} = {}) => {
  const baseUrl = normalizeBaseUrl(agentUrl);
  let beforeStatus = null;
  let afterStatus = null;
  let refreshResult = null;
  let refreshError = null;
  let benchmarkRequest = null;
  let benchmarkReport = null;
  let benchmarkError = null;

  const currentUrl = endpoint(baseUrl, '/v1/vision/classifier/references/current');
  const refreshUrl = endpoint(baseUrl, '/v1/vision/classifier/references/refresh');
  const benchmarkUrl = endpoint(baseUrl, '/v1/vision/classifier/benchmark-current');

  try {
    beforeStatus = await fetchJson(currentUrl);
  } catch (error) {
    beforeStatus = {
      ready: false,
      status: 'invalid',
      reference_count: 0,
      message: `GET ${currentUrl}: ${errorText(error)}`
    };
  }

  afterStatus = beforeStatus;
  if (refresh) {
    try {
      refreshResult = await fetchJson(
        refreshUrl,
        { method: 'POST', body: '{}' }
      );
      afterStatus = await fetchJson(currentUrl);
    } catch (error) {
      refreshError = `POST ${refreshUrl}: ${errorText(error)}`;
    }
  }

  if (afterStatus?.ready === true && afterStatus?.embedding_model_version) {
    benchmarkRequest = buildVisionReferenceBenchmarkRequest({
      currentStatus: afterStatus,
      ...benchmarkOptions
    });
    try {
      benchmarkReport = await fetchJson(
        benchmarkUrl,
        { method: 'POST', body: JSON.stringify(benchmarkRequest) }
      );
    } catch (error) {
      benchmarkError = `POST ${benchmarkUrl}: ${errorText(error)}`;
    }
  }

  return buildVisionReferenceOperationalReport({
    generatedAt,
    agentUrl: baseUrl,
    refreshAttempted: refresh,
    beforeStatus,
    refreshResult,
    refreshError,
    afterStatus,
    benchmarkRequest,
    benchmarkReport,
    benchmarkError
  });
};

module.exports = {
  DEFAULT_MODEL_VERSION,
  buildVisionReferenceBenchmarkRequest,
  buildVisionReferenceOperationalReport,
  runVisionReferenceOperationalGate
};
