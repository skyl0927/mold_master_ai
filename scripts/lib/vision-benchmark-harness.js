const REQUIRED_RUNTIME_FIELDS = [
  'vision_model',
  'vision_prompt_version',
  'vision_image_detail'
];

const buildBlindVisionQuestion = testCase => [
  'Perform a blind manufacturing visual inspection using only pixels in the supplied image.',
  'Do not use field notes, prior labels, process conditions, expected defects, root causes, or corrective actions.',
  testCase?.roiNormalized
    ? 'The image has already been cropped to the reviewer-selected ROI. Inspect only visible evidence in that crop.'
    : 'Inspect only visible evidence in the full image.',
  'Return the structured Vision observation contract configured by the Vision service.',
  'If the pixels do not support a defect candidate, abstain and request the additional view needed.'
].join('\n');

const buildGraphRetrievalQuestion = ({ testCase, visionSummary, observation }) => {
  const candidateLines = (visionSummary?.candidates || []).map((candidate, index) => [
    `${index + 1}. ${candidate.defectType} (${Math.round(candidate.confidence * 100)}%)`,
    candidate.supportingFeatures?.length
      ? `일치 근거: ${candidate.supportingFeatures.join(', ')}`
      : '',
    candidate.contradictingFeatures?.length
      ? `불일치 근거: ${candidate.contradictingFeatures.join(', ')}`
      : ''
  ].filter(Boolean).join(' | '));

  return [
    '다음 blind Vision 관찰과 현장 설명을 교차 검증해 사출성형 문제를 분석하세요.',
    `현장 설명: ${testCase?.inputNotes || '추가 현장 설명 없음'}`,
    `Vision decision status: ${visionSummary?.decisionStatus || 'unclassifiable'}`,
    `Vision candidates:\n${candidateLines.join('\n') || 'unclassified'}`,
    `Visible features: ${(visionSummary?.visibleFeatures || []).join(', ')}`,
    `Vision summary: ${observation?.summary || ''}`,
    '원인과 대책은 승인된 Graph DB 근거를 우선 사용하고 부족한 부분만 LLM 지식으로 보조하세요.'
  ].join('\n');
};

const assessVisionRuntimeStatus = (payload = {}, error) => {
  const missingFields = REQUIRED_RUNTIME_FIELDS.filter(field =>
    typeof payload[field] !== 'string' || payload[field].trim().length === 0
  );
  return {
    ready: !error && missingFields.length === 0,
    missingFields,
    error: error || null,
    modelVersion: payload.vision_model || null,
    promptVersion: payload.vision_prompt_version || null,
    imageDetail: payload.vision_image_detail || null,
    provider: payload.provider || null,
    status: payload.status || null
  };
};

const applyVisionRuntimeGate = (summary, attestation) => {
  const runtimeReady = Boolean(attestation?.ready);
  const failedGateChecks = [...(summary.failedGateChecks || [])];
  if (!runtimeReady && !failedGateChecks.includes('runtimeAttestation')) {
    failedGateChecks.push('runtimeAttestation');
  }
  return {
    ...summary,
    runtimeAttestationReady: runtimeReady,
    gateChecks: {
      ...(summary.gateChecks || {}),
      runtimeAttestation: runtimeReady
    },
    failedGateChecks,
    readyToDisableLegacyFallback:
      Boolean(summary.readyToDisableLegacyFallback) && runtimeReady
  };
};

module.exports = {
  applyVisionRuntimeGate,
  assessVisionRuntimeStatus,
  buildBlindVisionQuestion,
  buildGraphRetrievalQuestion
};
