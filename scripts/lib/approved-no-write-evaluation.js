const crypto = require('node:crypto');

const {
  canonicalDefectClass,
  isClassifiable
} = require('./multimodal-benchmark');

const percentage = (count, total) =>
  total > 0 ? Math.round((count / total) * 1000) / 10 : 0;

const sha256 = value => crypto
  .createHash('sha256')
  .update(String(value || ''))
  .digest('hex');

const selectApprovedNoWriteCases = (fixtures, baselineResults) => {
  const fixtureById = new Map((fixtures || []).map(item => [item.id, item]));
  const seen = new Set();
  const valid = [];
  const skipped = [];

  for (const baseline of baselineResults || []) {
    const id = baseline?.id;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const fixture = fixtureById.get(id);
    if (!fixture) {
      skipped.push({ id, reason: 'approved fixture is missing' });
      continue;
    }
    if (fixture.sourceReview?.labelConflictResolution?.action === 'request_recapture') {
      skipped.push({ id, reason: 'physical recapture is required' });
      continue;
    }
    if (fixture.sourceReview?.reviewStatus !== 'approved') {
      skipped.push({ id, reason: 'fixture is not human-approved' });
      continue;
    }
    if (!fixture.commonAgentImageId || !fixture.expected?.defectType) {
      skipped.push({ id, reason: 'fixture image or expected label is missing' });
      continue;
    }
    valid.push({
      ...fixture,
      evidenceStatus: 'approved_holdout_shadow',
      releaseEvidenceEligible: false
    });
  }

  return { valid, skipped };
};

const extensionForMime = mimeType => ({
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif'
}[String(mimeType || '').toLocaleLowerCase()] || '.png');

const buildBlindQuestion = () => [
  '실물 사출품 또는 제조 품질 증거 이미지 한 장을 블라인드 판정하세요.',
  '파일명, 기존 라벨, 과거 판정, 현장 메모를 사용하지 말고 픽셀에서 직접 관찰되는 사실만 사용하세요.',
  '기능 형상, 조명 반사, 반복 표면 질감과 실제 결함 후보를 분리하세요.',
  '시각 근거가 부족하면 결함을 추측하지 말고 판정 불가 또는 사람 검토 필요로 처리하세요.',
  '원인과 대책은 승인된 Graph DB 근거가 있는 경우에만 확정하고, 부족한 내용은 학습 불가 LLM 참고로 분리하세요.'
].join('\n');

const buildApprovedNoWriteVisionForm = (testCase, loadedImage) => {
  const blindCaseToken = sha256(testCase.id).slice(0, 16);
  const mimeType = loadedImage.mimeType || testCase.mimeType || 'image/png';
  const form = new FormData();
  form.append(
    'file',
    new Blob([loadedImage.bytes], { type: mimeType }),
    `approved-view${extensionForMime(mimeType)}`
  );
  form.append('question', buildBlindQuestion());
  form.append('source_system', 'mold-master-ai-approved-shadow-benchmark');
  form.append('persist_mode', 'never');
  form.append('process_area', 'injection-molding');
  form.append('rag_category', 'all');
  form.append('session_id', `mold-master-approved-shadow-${blindCaseToken}`);
  form.append('metadata_json', JSON.stringify({
    benchmark_case_token: blindCaseToken,
    evidence_status: 'approved_holdout_shadow',
    release_evidence_eligible: false,
    blind_evaluation: true,
    multiview_provenance: 'legacy_approved_single_view'
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

const assessApprovedNoWriteDiagnosis = (testCase, payload, snapshots = {}) => {
  const metadata = payload?.metadata || {};
  const trace = payload?.reasoning_trace || [];
  const candidates = normalizeCandidates(payload);
  const candidateClasses = candidates.map(candidate =>
    canonicalDefectClass(candidate.defect_type)
  );
  const expectedClass = testCase.expected?.defectClass
    || canonicalDefectClass(testCase.expected?.defectType);
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
    && snapshots.before.centralCount === snapshots.after.centralCount
    && snapshots.before.fingerprint === snapshots.after.fingerprint
  );
  const top1Accurate = candidateClasses[0] === expectedClass;
  const top3Accurate = candidateClasses.slice(0, 3).includes(expectedClass);
  const actualDefectType = candidates[0]?.defect_type || null;

  return {
    id: testCase.id,
    evidenceStatus: testCase.evidenceStatus,
    expectedDefectType: testCase.expected.defectType,
    expectedDefectClass: expectedClass,
    actualDefectType,
    actualDefectClass: candidateClasses[0] || null,
    candidates: candidates.slice(0, 3).map((candidate, index) => ({
      rank: index + 1,
      defectType: candidate.defect_type,
      defectClass: candidateClasses[index],
      confidence: Number(candidate.confidence || 0)
    })),
    classifiable: isClassifiable(actualDefectType),
    decisionStatus: payload?.observation?.decision_status || null,
    decisionReason: payload?.observation?.decision_reason || null,
    requiredAdditionalViews: payload?.observation?.required_additional_views || [],
    top1Accurate,
    top3Accurate,
    graphGrounded: graph.graph_grounded === true,
    graphDecisionStatus: graph.decision_status || null,
    graphDecisionReason: graph.decision_reason || null,
    approvedGraphPathCount: Number(graph.approved_path_count || 0),
    graphCitationCount: Number(graph.citation_count || 0),
    noWriteAttested,
    datasetUnchanged,
    beforeDatasetFingerprint: snapshots.before?.fingerprint || null,
    afterDatasetFingerprint: snapshots.after?.fingerprint || null,
    operationallyValid: noWriteAttested && datasetUnchanged,
    releaseEvidenceEligible: false,
    releaseBlockReason: 'legacy approved single-view evidence is shadow quality evidence only',
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

const summarizeApprovedNoWriteEvaluation = results => {
  const total = results.length;
  const operationallyValid = results.filter(item => item.operationallyValid).length;
  const noWriteAttested = results.filter(item => item.noWriteAttested).length;
  const datasetUnchanged = results.filter(item => item.datasetUnchanged).length;
  const classifiable = results.filter(item => item.classifiable).length;
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
    classifiable,
    classifiableRate: percentage(classifiable, total),
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
    evidenceScope: 'approved_single_view_shadow_quality_only',
    nextGate: 'governed physical multiview recapture'
  };
};

module.exports = {
  assessApprovedNoWriteDiagnosis,
  buildApprovedNoWriteVisionForm,
  selectApprovedNoWriteCases,
  summarizeApprovedNoWriteEvaluation
};
