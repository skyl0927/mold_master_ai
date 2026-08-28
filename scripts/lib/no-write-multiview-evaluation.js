const crypto = require('node:crypto');

const { canonicalDefectClass } = require('./multimodal-benchmark');

const percentage = (count, total) =>
  total > 0 ? Math.round((count / total) * 1000) / 10 : 0;

const stableValue = value => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map(key => [key, stableValue(value[key])])
  );
};

const sha256 = value => crypto
  .createHash('sha256')
  .update(typeof value === 'string' ? value : JSON.stringify(stableValue(value)))
  .digest('hex');

const buildDatasetSnapshot = (payload, options = {}) => {
  const items = Array.isArray(payload) ? payload : (payload?.items || []);
  const orderedItems = [...items].sort((left, right) =>
    String(left?.image_id || '').localeCompare(String(right?.image_id || ''))
  );
  const centralCount = Number.isFinite(Number(options.centralCount))
    ? Number(options.centralCount)
    : orderedItems.length;
  return {
    count: orderedItems.length,
    centralCount,
    imageIds: orderedItems.map(item => item.image_id).filter(Boolean),
    fingerprint: sha256({ centralCount, items: orderedItems })
  };
};

const normalizeVisionRuntimeStatus = payload => {
  const qaAgent = payload?.qa_agent || payload || {};
  const status = payload?.status || qaAgent.status || null;
  const normalized = {
    status,
    provider: qaAgent.provider || null,
    visionModel: qaAgent.vision_model || null,
    visionPromptVersion: qaAgent.vision_prompt_version || null,
    visionImageDetail: qaAgent.vision_image_detail || null,
    imageDatasetCount: Number.isFinite(Number(payload?.image_dataset_count))
      ? Number(payload.image_dataset_count)
      : null
  };
  return {
    ...normalized,
    ready: status === 'ready'
      && qaAgent.status === 'ready'
      && Boolean(normalized.visionModel)
      && Boolean(normalized.visionPromptVersion)
      && Boolean(normalized.visionImageDetail)
  };
};

const shouldRetryNoWriteDiagnosisStatus = status =>
  Number(status) === 429 || Number(status) >= 500;

const validateNoWriteMultiviewCases = cases => {
  const valid = [];
  const invalid = [];

  for (const testCase of cases || []) {
    const id = testCase?.id || '(missing)';
    const views = Array.isArray(testCase?.views) ? testCase.views : [];
    const primaryViews = views.filter(view => view?.isPrimary === true);
    const imageIds = views.map(view => view?.commonAgentImageId).filter(Boolean);
    const viewTags = views.map(view => view?.captureViewTag).filter(Boolean);
    let reason = '';

    if (!testCase?.id) reason = 'case id is required';
    else if (testCase.evidenceStatus !== 'provisional_pair') {
      reason = 'evidenceStatus must be provisional_pair';
    } else if (!testCase.expected?.defectType || !testCase.expected?.defectClass) {
      reason = 'expected defect type and class are required';
    } else if (views.length < 2) reason = 'at least two views are required';
    else if (primaryViews.length !== 1) reason = 'exactly one primary view is required';
    else if (imageIds.length !== views.length || viewTags.length !== views.length) {
      reason = 'every view requires an image id and capture view tag';
    } else if (new Set(imageIds).size !== imageIds.length) {
      reason = 'view image ids must be unique';
    } else if (new Set(viewTags).size !== viewTags.length) {
      reason = 'capture view tags must be unique';
    }

    if (reason) invalid.push({ id, reason });
    else valid.push(testCase);
  }

  return { valid, invalid };
};

const extensionForMime = mimeType => ({
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif'
}[String(mimeType || '').toLocaleLowerCase()] || '.png');

const buildBlindQuestion = () => [
  '동일한 실물 사출품을 서로 다른 거리와 시점에서 촬영한 이미지입니다.',
  '파일명, 기존 라벨, 과거 판정, 현장 메모를 사용하지 말고 픽셀에서 관찰되는 사실만으로 블라인드 판정하세요.',
  '각 시점의 관찰을 먼저 분리한 뒤 공통 근거와 충돌 근거를 융합하세요.',
  '시각 근거가 부족하면 결함을 추측하지 말고 판정 불가 또는 사람 검토 필요로 처리하고 필요한 추가 시점을 제시하세요.',
  '원인과 대책은 승인된 Graph DB 근거가 있는 경우에만 확정하고, 부족한 내용은 학습 불가 LLM 참고로 분리하세요.'
].join('\n');

const buildNoWriteVisionForm = (testCase, loadedViews) => {
  const orderedViews = [...loadedViews].sort((left, right) =>
    Number(Boolean(right.isPrimary)) - Number(Boolean(left.isPrimary))
  );
  const blindCaseToken = sha256(testCase.id).slice(0, 16);
  const form = new FormData();
  const manifest = [];

  orderedViews.forEach((view, index) => {
    const neutralName = `view-${String(index + 1).padStart(2, '0')}${extensionForMime(view.mimeType)}`;
    const blob = new Blob([view.bytes], { type: view.mimeType || 'image/png' });
    if (index === 0) form.append('file', blob, neutralName);
    else form.append('view_files', blob, neutralName);
    manifest.push({
      local_image_id: `blind-view-${String(index + 1).padStart(2, '0')}`,
      capture_view_tag: view.captureViewTag,
      image_kind: 'physical_product',
      capture_source: 'file',
      is_primary: index === 0
    });
  });

  form.append('question', buildBlindQuestion());
  form.append('source_system', 'mold-master-ai-shadow-benchmark');
  form.append('persist_mode', 'never');
  form.append('process_area', 'injection-molding');
  form.append('rag_category', 'all');
  form.append('session_id', `mold-master-shadow-${blindCaseToken}`);
  form.append('view_manifest_json', JSON.stringify(manifest));
  form.append('metadata_json', JSON.stringify({
    benchmark_case_token: blindCaseToken,
    evidence_status: 'provisional_pair',
    release_evidence_eligible: false,
    blind_evaluation: true,
    capture_view_tags: manifest.map(item => item.capture_view_tag),
    multiview_provenance: 'existing_same_part_pair'
  }));
  return form;
};

const includesTraceAttestation = (trace, key) => (trace || []).some(item =>
  String(item).toLocaleLowerCase().includes(`${key}=false`)
);

const normalizeCandidates = payload => {
  const observation = payload?.observation || {};
  const candidates = Array.isArray(observation.candidates)
    ? observation.candidates
    : [];
  if (candidates.length > 0) return candidates;
  if (!observation.defect_type) return [];
  return [{ defect_type: observation.defect_type, confidence: observation.confidence || 0 }];
};

const assessNoWriteDiagnosis = (testCase, payload, snapshots = {}) => {
  const metadata = payload?.metadata || {};
  const trace = payload?.reasoning_trace || [];
  const candidates = normalizeCandidates(payload);
  const expectedClass = testCase.expected.defectClass
    || canonicalDefectClass(testCase.expected.defectType);
  const candidateClasses = candidates.map(candidate =>
    canonicalDefectClass(candidate.defect_type)
  );
  const fusion = payload?.fusion_report || {};
  const graph = payload?.graph_grounding || {};
  const noWriteAttested = metadata.persist_mode === 'never'
    && metadata.persisted_to_dataset === false
    && metadata.service_writes_performed === false
    && includesTraceAttestation(trace, 'answer_ledger_persisted')
    && includesTraceAttestation(trace, 'image_dataset_persisted')
    && includesTraceAttestation(trace, 'service_writes_performed');
  const datasetUnchanged = Boolean(
    snapshots.before
    && snapshots.after
    && snapshots.before.count === snapshots.after.count
    && snapshots.before.fingerprint === snapshots.after.fingerprint
  );
  const fusionSucceeded = Number(fusion.requested_view_count) >= 2
    && Number(fusion.valid_view_count) >= 2;
  const top1Accurate = candidateClasses[0] === expectedClass;
  const top3Accurate = candidateClasses.slice(0, 3).includes(expectedClass);
  const operationallyValid = noWriteAttested && datasetUnchanged && fusionSucceeded;

  return {
    id: testCase.id,
    evidenceStatus: testCase.evidenceStatus,
    expectedDefectType: testCase.expected.defectType,
    expectedDefectClass: expectedClass,
    actualDefectType: candidates[0]?.defect_type || null,
    actualDefectClass: candidateClasses[0] || null,
    candidates: candidates.slice(0, 3).map((candidate, index) => ({
      rank: index + 1,
      defectType: candidate.defect_type,
      defectClass: candidateClasses[index],
      confidence: Number(candidate.confidence || 0)
    })),
    decisionStatus: payload?.observation?.decision_status || fusion.decision_status || null,
    decisionReason: payload?.observation?.decision_reason || fusion.decision_reason || null,
    requiredAdditionalViews: payload?.observation?.required_additional_views || [],
    top1Accurate,
    top3Accurate,
    fusionSucceeded,
    requestedViewCount: Number(fusion.requested_view_count || 0),
    validViewCount: Number(fusion.valid_view_count || 0),
    disagreementScore: Number(fusion.disagreement_score || 0),
    graphGrounded: graph.graph_grounded === true,
    graphDecisionStatus: graph.decision_status || null,
    graphDecisionReason: graph.decision_reason || null,
    approvedGraphPathCount: Number(graph.approved_path_count || 0),
    graphCitationCount: Number(graph.citation_count || 0),
    groundedCauses: graph.grounded_causes || [],
    groundedCountermeasures: graph.grounded_countermeasures || [],
    noWriteAttested,
    datasetUnchanged,
    beforeDatasetFingerprint: snapshots.before?.fingerprint || null,
    afterDatasetFingerprint: snapshots.after?.fingerprint || null,
    operationallyValid,
    releaseEvidenceEligible: false,
    releaseBlockReason: 'provisional existing-view pair is not a governed physical recapture set',
    responseAttestation: {
      persistMode: metadata.persist_mode || null,
      persistedToDataset: metadata.persisted_to_dataset,
      serviceWritesPerformed: metadata.service_writes_performed,
      traceAnswerLedgerPersistedFalse: includesTraceAttestation(
        trace,
        'answer_ledger_persisted'
      ),
      traceDatasetPersistedFalse: includesTraceAttestation(trace, 'image_dataset_persisted'),
      traceServiceWritesFalse: includesTraceAttestation(trace, 'service_writes_performed')
    }
  };
};

const summarizeNoWriteMultiviewEvaluation = results => {
  const total = results.length;
  const operationallyValid = results.filter(item => item.operationallyValid).length;
  const noWriteAttested = results.filter(item => item.noWriteAttested).length;
  const datasetUnchanged = results.filter(item => item.datasetUnchanged).length;
  const fusionSucceeded = results.filter(item => item.fusionSucceeded).length;
  const top1Accurate = results.filter(item => item.top1Accurate).length;
  const top3Accurate = results.filter(item => item.top3Accurate).length;
  const graphGrounded = results.filter(item => item.graphGrounded).length;
  const releaseEligibleCases = results.filter(item => item.releaseEvidenceEligible).length;
  return {
    total,
    operationallyValid,
    operationalValidityRate: percentage(operationallyValid, total),
    noWriteAttested,
    noWriteGatePassed: total > 0
      && noWriteAttested === total
      && datasetUnchanged === total,
    datasetUnchanged,
    fusionSucceeded,
    fusionSuccessRate: percentage(fusionSucceeded, total),
    top1Accurate,
    top1Accuracy: percentage(top1Accurate, total),
    top3Accurate,
    top3Accuracy: percentage(top3Accurate, total),
    graphGrounded,
    graphGroundedRate: percentage(graphGrounded, total),
    releaseEligibleCases,
    readyForOperationalRelease: total > 0
      && operationallyValid === total
      && releaseEligibleCases === total,
    evidenceScope: 'shadow_quality_only',
    nextGate: 'governed physical multiview recapture'
  };
};

module.exports = {
  assessNoWriteDiagnosis,
  buildDatasetSnapshot,
  buildNoWriteVisionForm,
  normalizeVisionRuntimeStatus,
  shouldRetryNoWriteDiagnosisStatus,
  summarizeNoWriteMultiviewEvaluation,
  validateNoWriteMultiviewCases
};
