const compact = value => String(value || '').replace(/\s+/g, ' ').trim();

const asArray = value => Array.isArray(value) ? value : [];

const normalizeBaseUrl = value =>
  String(value || 'http://127.0.0.1:8000').replace(/\/+$/, '');

const assertAuthorizedPayload = (target, index) => {
  const payload = target?.reviewPayload || {};
  const prefix = `targets[${index}]`;
  if (payload.decision !== 'approve') {
    throw new Error(`${prefix} reviewPayload.decision must be approve for learning-ready backfill.`);
  }
  if (payload.promote_to_graph !== false) {
    throw new Error(`${prefix} reviewPayload.promote_to_graph must be false for reference backfill.`);
  }
  if (payload.metadata?.reference_backfill_human_authorized !== true) {
    throw new Error(`${prefix} is missing human backfill authorization metadata.`);
  }
  if (payload.observation?.contract_version !== 'vision-observation/v2') {
    throw new Error(`${prefix} reviewPayload.observation must be vision-observation/v2.`);
  }
  if (payload.observation?.image_kind !== 'physical_product') {
    throw new Error(`${prefix} reviewPayload.observation.image_kind must be physical_product.`);
  }
  if (payload.observation?.normality_status !== 'defect_visible') {
    throw new Error(`${prefix} reviewPayload.observation.normality_status must be defect_visible.`);
  }
  if (!payload.metadata?.capture_session_id || !payload.metadata?.capture_view_tag) {
    throw new Error(`${prefix} must include capture_session_id and capture_view_tag metadata.`);
  }
  if (payload.metadata?.capture_protocol_ready !== true) {
    throw new Error(`${prefix} capture_protocol_ready metadata must be true.`);
  }
};

const buildVisionReferenceBackfillApplyRequests = ({
  writePlan,
  agentUrl = 'http://127.0.0.1:8000'
} = {}) => {
  const baseUrl = normalizeBaseUrl(agentUrl);
  return asArray(writePlan?.targets).map((target, index) => {
    assertAuthorizedPayload(target, index);
    const imageId = compact(target.imageId);
    if (!imageId) throw new Error(`targets[${index}] imageId is required.`);
    return {
      imageId,
      method: 'POST',
      url: `${baseUrl}/v1/datasets/images/${encodeURIComponent(imageId)}/review`,
      body: target.reviewPayload
    };
  });
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

const learningReadySignals = payload => ({
  reviewStatus: compact(payload?.item?.review_status),
  observationContractVersion: compact(payload?.item?.observation?.contract_version),
  captureProtocolReady: payload?.item?.metadata?.capture_protocol_ready === true
});

const runVisionReferenceBackfillApply = async ({
  writePlan,
  agentUrl = 'http://127.0.0.1:8000',
  apply = false,
  generatedAt = new Date().toISOString(),
  fetchJson = defaultFetchJson
} = {}) => {
  const requests = buildVisionReferenceBackfillApplyRequests({ writePlan, agentUrl });
  const report = {
    schemaVersion: 1,
    generatedAt,
    authorizationId: compact(writePlan?.authorizationId),
    backfillPlanDigest: compact(writePlan?.backfillPlanDigest),
    agentUrl: normalizeBaseUrl(agentUrl),
    applyRequested: apply === true,
    serviceWritesPerformed: apply === true,
    requestCount: requests.length,
    requests,
    results: [],
    completed: false
  };

  if (!apply) {
    return {
      ...report,
      completed: true,
      recommendedAction:
        'Dry-run only. Review the request bodies, then rerun with --apply only after confirming Common Agent is upgraded.'
    };
  }

  for (const request of requests) {
    try {
      const payload = await fetchJson(request.url, {
        method: request.method,
        body: JSON.stringify(request.body)
      });
      report.results.push({
        imageId: request.imageId,
        status: 'applied',
        response: payload,
        learningReadySignals: learningReadySignals(payload)
      });
    } catch (error) {
      report.results.push({
        imageId: request.imageId,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error)
      });
      return {
        ...report,
        completed: false,
        recommendedAction:
          'Stop. Resolve the failed Common Agent write before applying remaining backfill targets.'
      };
    }
  }

  return {
    ...report,
    completed: true,
    recommendedAction:
      'Rerun learning-ready Vision export and then refresh the Vision reference store.'
  };
};

module.exports = {
  buildVisionReferenceBackfillApplyRequests,
  runVisionReferenceBackfillApply
};
