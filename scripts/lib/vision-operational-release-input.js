const toMap = results => {
  const map = new Map();
  for (const result of results || []) {
    if (!result?.id) continue;
    if (map.has(result.id)) {
      throw new Error(`Duplicate benchmark case id: ${result.id}`);
    }
    map.set(result.id, result);
  }
  return map;
};

const finiteNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toPrediction = result => ({
  accepted: Boolean(result.acceptedPrediction ?? result.classifiable),
  correct: Boolean(result.top1Accurate ?? result.checks?.defectType),
  top3Correct: Boolean(
    result.top3Accurate
    ?? result.top1Accurate
    ?? result.checks?.defectType
  ),
  confidence: Math.max(
    0,
    Math.min(1, finiteNumber(result.visionConfidence ?? result.confidence))
  ),
  latencyMs: Math.max(0, finiteNumber(result.latencyMs))
});

const normalizedCaseMetadata = value => {
  if (!Array.isArray(value)) return value || {};
  return Object.fromEntries(
    value
      .filter(item => item?.caseId)
      .map(item => [item.caseId, item])
  );
};

const hasRequiredMetadata = metadata => Boolean(
  metadata
  && metadata.evaluatedAt
  && metadata.productFamily
  && metadata.expectedDefectClass
  && typeof metadata.humanVerified === 'boolean'
);

const buildShadowReleaseInput = (baselineReport, candidateReport, config) => {
  const baselineById = toMap(baselineReport?.results);
  const candidateById = toMap(candidateReport?.results);
  const baselineIds = [...baselineById.keys()];
  const candidateIds = [...candidateById.keys()];
  const pairedCaseIds = baselineIds
    .filter(caseId => candidateById.has(caseId))
    .sort();
  const metadataByCase = normalizedCaseMetadata(config?.caseMetadata);
  const missingMetadataCaseIds = pairedCaseIds
    .filter(caseId => !hasRequiredMetadata(metadataByCase[caseId]));
  const samples = pairedCaseIds
    .filter(caseId => !missingMetadataCaseIds.includes(caseId))
    .map(caseId => {
      const metadata = metadataByCase[caseId];
      return {
        caseId,
        evaluatedAt: metadata.evaluatedAt,
        productFamily: metadata.productFamily,
        moldId: metadata.moldId,
        cameraId: metadata.cameraId,
        captureSessionId: metadata.captureSessionId,
        contentHash: metadata.contentHash,
        expectedDefectClass: metadata.expectedDefectClass,
        humanVerified: metadata.humanVerified,
        baseline: toPrediction(baselineById.get(caseId)),
        candidate: toPrediction(candidateById.get(caseId))
      };
    });

  return {
    gateInput: {
      baselineVersion: config.baselineVersion,
      candidateVersion: config.candidateVersion,
      samples,
      splitSamples: config.splitSamples || [],
      newProductFamilies: config.newProductFamilies || [],
      minimumSamples: config.minimumSamples,
      minimumHumanVerifiedPerNewProduct:
        config.minimumHumanVerifiedPerNewProduct,
      latencyTargetP95Ms: config.latencyTargetP95Ms,
      generatedAt: config.generatedAt
    },
    diagnostics: {
      baselineCases: baselineIds.length,
      candidateCases: candidateIds.length,
      pairedCases: pairedCaseIds.length,
      usablePairedCases: samples.length,
      baselineOnlyCaseIds: baselineIds
        .filter(caseId => !candidateById.has(caseId))
        .sort(),
      candidateOnlyCaseIds: candidateIds
        .filter(caseId => !baselineById.has(caseId))
        .sort(),
      missingMetadataCaseIds
    }
  };
};

module.exports = {
  buildShadowReleaseInput
};
