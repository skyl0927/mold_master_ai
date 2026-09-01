const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const args = process.argv.slice(2);
const valueAfter = flag => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};
const manifestPath = path.resolve(valueAfter('--manifest') || 'local-vision-probe.json');
const outputPath = path.resolve(
  valueAfter('--output') || path.join('artifacts', 'local-vision-no-write-probe.json')
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
    throw new Error('local Vision probe requires HTTPS except for loopback HTTP');
  }
  return parsed.toString().replace(/\/$/, '');
};

const fetchWithTimeout = (url, options = {}, timeoutMs = 180000) => fetch(url, {
  ...options,
  signal: AbortSignal.timeout(timeoutMs)
});

const mimeForPath = filePath => ({
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp'
}[path.extname(filePath).toLocaleLowerCase()] || 'application/octet-stream');

const fingerprintDataset = payload => {
  const items = payload?.items || payload?.images || payload?.records || [];
  const stable = items.map(item => ({
    id: item.id || item.image_id || null,
    hash: item.sha256 || item.content_hash || null,
    status: item.review_status || item.status || null
  })).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  return crypto.createHash('sha256').update(JSON.stringify(stable)).digest('hex');
};

const fetchSnapshot = async endpoint => {
  const [datasetResponse, statusResponse] = await Promise.all([
    fetchWithTimeout(`${endpoint}/v1/datasets/images?limit=500`, {}, 30000),
    fetchWithTimeout(`${endpoint}/v1/vision/status`, {}, 30000)
  ]);
  const dataset = await datasetResponse.json().catch(() => ({}));
  const status = await statusResponse.json().catch(() => ({}));
  if (!datasetResponse.ok || !statusResponse.ok) {
    throw new Error(`snapshot failed: dataset=${datasetResponse.status} status=${statusResponse.status}`);
  }
  return {
    count: Number(status.image_dataset_count ?? dataset.total ?? 0),
    fingerprint: fingerprintDataset(dataset),
    runtime: {
      status: status.status,
      qaStatus: status.qa_agent?.status,
      model: status.qa_agent?.vision_model,
      promptVersion: status.qa_agent?.vision_prompt_version,
      imageDetail: status.qa_agent?.vision_image_detail
    }
  };
};

const defaultQuestion = [
  '같은 실물 사출품의 동일한 관심 위치를 촬영한 하나의 증거 그룹입니다.',
  '파일명, 기존 라벨, 표시 색상 또는 과거 판정을 정답으로 사용하지 마세요.',
  '각 사진에서 직접 보이는 형상과 표면 특징을 먼저 분리 관찰한 뒤 동일 위치 근거만 융합하세요.',
  '전경 사진에서 관심 위치가 명확하지 않거나 시점 간 근거가 다르면 결함을 추측하지 말고 사람 검토와 추가 촬영을 요청하세요.',
  '원인과 대책은 최상위 Vision 후보와 일치하는 승인 Graph 경로가 있을 때만 제시하세요.'
].join('\n');

const validateManifest = manifest => {
  const cases = Array.isArray(manifest?.cases) ? manifest.cases : [];
  if (cases.length === 0) throw new Error('probe manifest requires at least one case');
  for (const testCase of cases) {
    const views = Array.isArray(testCase.views) ? testCase.views : [];
    if (!testCase.id || views.length < 1 || views.length > 8) {
      throw new Error(`invalid probe case: ${testCase.id || '(missing id)'}`);
    }
    if (views.filter(view => view.isPrimary === true).length !== 1) {
      throw new Error(`${testCase.id} requires exactly one primary view`);
    }
    for (const view of views) {
      if (!view.path || !view.captureViewTag || !fs.existsSync(path.resolve(view.path))) {
        throw new Error(`${testCase.id} contains an unreadable or incomplete view`);
      }
    }
  }
  return cases;
};

const buildForm = testCase => {
  const orderedViews = [...testCase.views].sort((left, right) =>
    Number(Boolean(right.isPrimary)) - Number(Boolean(left.isPrimary))
  );
  const form = new FormData();
  const manifest = orderedViews.map((view, index) => {
    const filePath = path.resolve(view.path);
    const mimeType = mimeForPath(filePath);
    const neutralName = `view-${String(index + 1).padStart(2, '0')}${path.extname(filePath).toLocaleLowerCase()}`;
    const blob = new Blob([fs.readFileSync(filePath)], { type: mimeType });
    form.append(index === 0 ? 'file' : 'view_files', blob, neutralName);
    return {
      local_image_id: `${testCase.id}-view-${index + 1}`,
      capture_view_tag: view.captureViewTag,
      image_kind: 'physical_product',
      capture_source: 'file',
      is_primary: index === 0
    };
  });
  form.append('question', testCase.question || defaultQuestion);
  form.append('source_system', 'mold-master-ai-local-no-write-probe');
  form.append('persist_mode', 'never');
  form.append('process_area', 'injection-molding');
  form.append('rag_category', 'all');
  form.append('session_id', `local-no-write-${testCase.id}`);
  form.append('view_manifest_json', JSON.stringify(manifest));
  form.append('metadata_json', JSON.stringify({
    probe_case_id: testCase.id,
    diagnosis_group_id: testCase.diagnosisGroupId || testCase.id,
    blind_evaluation: true,
    release_evidence_eligible: false,
    capture_view_tags: manifest.map(item => item.capture_view_tag)
  }));
  return { form, manifest };
};

const summarizePayload = payload => ({
  candidates: (payload?.observation?.candidates || []).slice(0, 3).map((candidate, index) => ({
    rank: index + 1,
    defectType: candidate.defect_type,
    confidence: candidate.confidence
  })),
  decisionStatus: payload?.observation?.decision_status || null,
  decisionReason: payload?.observation?.decision_reason || null,
  abstentionReason: payload?.observation?.abstention_reason || null,
  requiredAdditionalViews: payload?.observation?.required_additional_views || [],
  fusion: payload?.fusion_report ? {
    requestedViewCount: payload.fusion_report.requested_view_count,
    validViewCount: payload.fusion_report.valid_view_count,
    disagreementScore: payload.fusion_report.disagreement_score,
    decisionStatus: payload.fusion_report.decision_status,
    decisionReason: payload.fusion_report.decision_reason,
    candidateSupport: payload.fusion_report.candidate_support
  } : null,
  graph: payload?.graph_grounding ? {
    graphGrounded: payload.graph_grounding.graph_grounded,
    topCandidateSupported: payload.graph_grounding.top_candidate_supported,
    approvedPathCount: payload.graph_grounding.approved_path_count,
    topCandidateApprovedPathCount: payload.graph_grounding.top_candidate_approved_path_count,
    citationCount: payload.graph_grounding.citation_count,
    decisionStatus: payload.graph_grounding.decision_status,
    decisionReason: payload.graph_grounding.decision_reason
  } : null,
  contract: {
    persistMode: payload?.metadata?.persist_mode,
    persistedToDataset: payload?.metadata?.persisted_to_dataset,
    serviceWritesPerformed: payload?.metadata?.service_writes_performed,
    generalRetrievalSuppressed: payload?.metadata?.general_retrieval_suppressed,
    evidenceScope: payload?.metadata?.vision_answer_evidence_scope,
    queryCanonicalTerms: payload?.metadata?.query_canonical_terms
  }
});

const run = async () => {
  const endpoint = validateEndpoint(baseUrl);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const cases = validateManifest(manifest);
  const before = await fetchSnapshot(endpoint);
  const results = [];

  for (const testCase of cases) {
    const startedAt = Date.now();
    const built = buildForm(testCase);
    const response = await fetchWithTimeout(`${endpoint}/v1/vision/diagnose`, {
      method: 'POST',
      body: built.form
    });
    const payload = await response.json().catch(() => ({}));
    results.push({
      caseId: testCase.id,
      httpStatus: response.status,
      ok: response.ok,
      latencyMs: Date.now() - startedAt,
      viewManifest: built.manifest,
      summary: summarizePayload(payload),
      payload
    });
  }

  const after = await fetchSnapshot(endpoint);
  const noWriteDatasetUnchanged = before.count === after.count
    && before.fingerprint === after.fingerprint;
  const noWriteResponseAttested = results.every(result =>
    result.ok
    && result.summary.contract.persistMode === 'never'
    && result.summary.contract.persistedToDataset === false
    && result.summary.contract.serviceWritesPerformed === false
  );
  const report = {
    generatedAt: new Date().toISOString(),
    mode: 'local_physical_images_no_write',
    manifestPath,
    commonAgentUrl: endpoint,
    before,
    after,
    noWriteDatasetUnchanged,
    noWriteResponseAttested,
    results
  };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  for (const result of results) {
    const candidates = result.summary.candidates
      .map(candidate => `${candidate.rank}:${candidate.defectType || '-'}`)
      .join(', ');
    console.log(
      `${result.caseId}: HTTP ${result.httpStatus}, ${result.summary.decisionStatus}, `
      + `candidates=[${candidates}], graph=${result.summary.graph?.topCandidateApprovedPathCount || 0}`
    );
  }
  console.log(`No-write response=${noWriteResponseAttested}, dataset unchanged=${noWriteDatasetUnchanged}`);
  console.log(`Report: ${outputPath}`);
  if (!noWriteResponseAttested || !noWriteDatasetUnchanged) process.exitCode = 1;
};

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
