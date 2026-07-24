const fs = require('node:fs');
const path = require('node:path');
const {
  REQUIRED_DEFECT_CLASSES,
  canonicalDefectClass,
  isClassifiableDefectLabel
} = require('../../shared/defect-taxonomy');
const { normalizeVisionObservation } = require('../../visionObservation');

const normalize = value => String(value || '')
  .toLocaleLowerCase()
  .replace(/[\s()[\]{}_\-.,:;/'"]/g, '');

const includesEither = (left, right) => {
  const normalizedLeft = normalize(left);
  const normalizedRight = normalize(right);
  return Boolean(
    normalizedLeft
    && normalizedRight
    && (
      normalizedLeft === normalizedRight
      || normalizedLeft.includes(normalizedRight)
      || normalizedRight.includes(normalizedLeft)
    )
  );
};

const isClassifiable = isClassifiableDefectLabel;

const keywordHit = (text, keywords = []) =>
  keywords.length === 0 || keywords.some(keyword => normalize(text).includes(normalize(keyword)));

const isPlaceholderPath = imagePath =>
  !imagePath || /replace_with|placeholder|todo/i.test(String(imagePath));

const findDuplicateImageGroups = cases => {
  const byHash = new Map();
  for (const testCase of cases) {
    if (!testCase.contentHash) continue;
    const group = byHash.get(testCase.contentHash) || [];
    group.push(testCase);
    byHash.set(testCase.contentHash, group);
  }

  return [...byHash.entries()].flatMap(([contentHash, group]) => {
    if (group.length <= 1) return [];
    const labels = [...new Set(group.map(item => item.expected?.defectType).filter(Boolean))];
    return [{
      type: new Set(labels.map(normalize)).size > 1
        ? 'duplicate_image_conflicting_labels'
        : 'duplicate_image_same_label',
      contentHash,
      caseIds: group.map(item => item.id).sort(),
      labels
    }];
  });
};

const findDuplicateLabelConflicts = cases =>
  findDuplicateImageGroups(cases).filter(
    issue => issue.type === 'duplicate_image_conflicting_labels'
  );

const validateVisionCases = (cases, options = {}) => {
  const fileExists = options.fileExists || fs.existsSync;
  const resolveImagePath = options.resolveImagePath || (imagePath => path.resolve(imagePath));
  const valid = [];
  const invalid = [];

  for (const testCase of cases) {
    if (!testCase?.id) {
      invalid.push({ id: '(missing)', reason: 'case id is required' });
      continue;
    }
    if (!testCase.expected?.defectType) {
      invalid.push({ id: testCase.id, reason: 'expected.defectType is required' });
      continue;
    }
    if (testCase.commonAgentImageId) {
      valid.push({ ...testCase });
      continue;
    }
    if (isPlaceholderPath(testCase.imagePath)) {
      invalid.push({ id: testCase.id, reason: 'imagePath is a placeholder' });
      continue;
    }

    const resolvedImagePath = resolveImagePath(testCase.imagePath, testCase);
    if (!fileExists(resolvedImagePath)) {
      invalid.push({
        id: testCase.id,
        imagePath: resolvedImagePath,
        reason: 'image file does not exist'
      });
      continue;
    }
    valid.push({ ...testCase, resolvedImagePath });
  }

  return { valid, invalid };
};

const evaluateVisionResult = (testCase, execution) => {
  const response = execution.response || {};
  const observation = response.observation || {};
  const evidence = Array.isArray(response.evidence) ? response.evidence : [];
  const visionSummary = normalizeVisionObservation(observation);
  const defectType = visionSummary.primaryCandidate?.defectType || observation.defect_type || '';
  const causesText = [
    ...(observation.possible_causes || []),
    observation.summary || ''
  ].join('\n');
  const countermeasureText = [
    response.answer || '',
    ...(observation.recommended_checks || [])
  ].join('\n');
  const minimumEvidence = testCase.expected?.minEvidenceCount
    ?? testCase.expected?.retrievalExpectation?.minEvidenceCount
    ?? 1;
  const approvedEvidence = evidence.filter(item => item.review_status === 'approved');
  const graphEvidence = approvedEvidence.filter(item =>
    /graph|knowledge_(?:path|entity|relation)/i.test(
      `${item.source_type || ''} ${item.source_ref || ''}`
    )
  );
  const graphPolicyApplied = response.graph_policy_applied === true;
  const graphGrounded =
    approvedEvidence.length >= minimumEvidence
    && (graphPolicyApplied || graphEvidence.length >= minimumEvidence);
  const classifiable = isClassifiable(defectType);
  const numericConfidence = value => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const visionConfidence = numericConfidence(
    response.visionConfidence
    ?? visionSummary.primaryCandidate?.confidence
    ?? observation.confidence
    ?? response.confidence
  );
  const retrievalConfidence = numericConfidence(
    response.retrievalConfidence ?? response.confidence
  );
  const expectedDefectClass =
    testCase.expected.defectClass || canonicalDefectClass(testCase.expected.defectType);
  const actualDefectClass = canonicalDefectClass(defectType);
  const candidateMatchesExpected = candidate => {
    const candidateClass = canonicalDefectClass(candidate.defectType);
    return includesEither(candidate.defectType, testCase.expected.defectType)
      || (
        REQUIRED_DEFECT_CLASSES.includes(expectedDefectClass)
        && candidateClass === expectedDefectClass
      );
  };
  const expectedCandidateIndex = visionSummary.candidates.findIndex(candidate =>
    candidateMatchesExpected(candidate)
  );
  const top1Accurate = expectedCandidateIndex === 0 || (
    visionSummary.candidates.length === 0
    && (
      includesEither(defectType, testCase.expected.defectType)
      || (
        REQUIRED_DEFECT_CLASSES.includes(expectedDefectClass)
        && actualDefectClass === expectedDefectClass
      )
    )
  );
  const top3Accurate = expectedCandidateIndex >= 0 || top1Accurate;
  const explicitDecisionStatus =
    response.visionDecisionStatus
    || observation.decision_status
    || observation.decisionStatus;
  const decisionStatus = ['probable', 'needs_review', 'unclassifiable'].includes(explicitDecisionStatus)
    ? explicitDecisionStatus
    : visionSummary.decisionStatus;
  const acceptedPrediction = decisionStatus === 'probable' && classifiable;
  const unsafeAcceptedError = acceptedPrediction && !top1Accurate;
  const qualityStatus =
    response.qualityStatus
    || response.visionQuality?.status
    || observation.quality_status
    || (visionSummary.qualityConcerns.length > 0 ? 'warn' : 'pass');
  const qualityEligible = qualityStatus !== 'reject';
  const rawCandidates = observation.candidates || observation.top_candidates;
  const visionContractCompliant =
    Array.isArray(rawCandidates)
    && Array.isArray(observation.visible_features || observation.visibleFeatures);
  const checks = {
    http: Boolean(execution.httpOk),
    classifiable,
    defectType: top1Accurate,
    causes: keywordHit(causesText, testCase.expected.possibleCauseKeywords),
    countermeasures: keywordHit(countermeasureText, testCase.expected.countermeasureKeywords),
    evidenceCount: evidence.length >= minimumEvidence,
    approvedEvidence: approvedEvidence.length >= minimumEvidence,
    graphEvidence: graphGrounded
  };

  return {
    id: testCase.id,
    title: testCase.title,
    passed: Object.values(checks).every(Boolean),
    httpOk: checks.http,
    classifiable,
    graphGrounded,
    latencyMs: execution.latencyMs,
    expectedDefectType: testCase.expected.defectType,
    expectedDefectClass,
    actualDefectClass,
    actualDefectType: defectType,
    visibleFeatures: visionSummary.visibleFeatures,
    candidates: visionSummary.candidates,
    top1Accurate,
    top3Accurate,
    expectedCandidateRank: expectedCandidateIndex >= 0 ? expectedCandidateIndex + 1 : null,
    decisionStatus,
    decisionReason: visionSummary.decisionReason,
    requiredAdditionalViews: visionSummary.requiredAdditionalViews,
    qualityConcerns: visionSummary.qualityConcerns,
    abstentionReason: visionSummary.abstentionReason,
    acceptedPrediction,
    unsafeAcceptedError,
    qualityStatus,
    qualityEligible,
    visionContractCompliant,
    confidence: visionConfidence,
    visionConfidence,
    retrievalConfidence,
    evidenceCount: evidence.length,
    approvedEvidenceCount: approvedEvidence.length,
    checks,
    error: execution.error
  };
};

const percentage = (count, total) =>
  total > 0 ? Math.round((count / total) * 1000) / 10 : 0;

const buildConfidenceCalibration = (results, binCount = 5) => {
  const bins = Array.from({ length: binCount }, (_, index) => ({
    lowerBound: index / binCount,
    upperBound: (index + 1) / binCount,
    count: 0,
    confidenceTotal: 0,
    accurate: 0
  }));
  let brierTotal = 0;
  let measured = 0;

  for (const result of results) {
    const rawConfidence = Number(result.visionConfidence ?? result.confidence);
    if (!Number.isFinite(rawConfidence)) continue;
    const confidence = Math.min(1, Math.max(0, rawConfidence));
    const accurate = Boolean(result.top1Accurate ?? result.checks?.defectType);
    const binIndex = Math.min(binCount - 1, Math.floor(confidence * binCount));
    const bin = bins[binIndex];
    bin.count += 1;
    bin.confidenceTotal += confidence;
    if (accurate) bin.accurate += 1;
    brierTotal += (confidence - Number(accurate)) ** 2;
    measured += 1;
  }

  let calibrationError = 0;
  const reliabilityBins = bins
    .filter(bin => bin.count > 0)
    .map(bin => {
      const averageConfidence = bin.confidenceTotal / bin.count;
      const accuracy = bin.accurate / bin.count;
      calibrationError += (bin.count / Math.max(1, measured))
        * Math.abs(averageConfidence - accuracy);
      return {
        lowerBound: bin.lowerBound,
        upperBound: bin.upperBound,
        count: bin.count,
        averageConfidence: Math.round(averageConfidence * 1000) / 1000,
        accuracy: Math.round(accuracy * 1000) / 10
      };
    });

  return {
    calibrationSamples: measured,
    expectedCalibrationError: Math.round(calibrationError * 1000) / 10,
    brierScore: measured > 0 ? Math.round((brierTotal / measured) * 10000) / 10000 : 0,
    reliabilityBins
  };
};

const summarizeVisionBenchmark = (results, minimumSamples = 20, options = {}) => {
  const requiredDefectClasses = options.requiredDefectClasses || REQUIRED_DEFECT_CLASSES;
  const minimumSamplesPerClass = options.minimumSamplesPerClass ?? 2;
  const minimumVisionConfidence = options.minimumVisionConfidence ?? 0.6;
  const minimumConfidentRate = options.minimumConfidentRate ?? 80;
  const minimumClassAccuracy = options.minimumClassAccuracy ?? 50;
  const minimumTop3Accuracy = options.minimumTop3Accuracy ?? 90;
  const minimumSelectiveAccuracy = options.minimumSelectiveAccuracy ?? 90;
  const minimumSelectiveCoverage = options.minimumSelectiveCoverage ?? 60;
  const maximumUnsafeErrorRate = options.maximumUnsafeErrorRate ?? 5;
  const maximumCalibrationError = options.maximumCalibrationError ?? 15;
  const minimumQualityEligibleRate = options.minimumQualityEligibleRate ?? 95;
  const minimumVisionContractComplianceRate =
    options.minimumVisionContractComplianceRate ?? 95;
  const total = results.length;
  const passed = results.filter(result => result.passed).length;
  const httpSuccess = results.filter(result => result.httpOk).length;
  const classifiable = results.filter(result => result.classifiable).length;
  const graphGrounded = results.filter(result => result.graphGrounded).length;
  const defectAccurate = results.filter(result => result.checks?.defectType).length;
  const passRate = percentage(passed, total);
  const httpSuccessRate = percentage(httpSuccess, total);
  const classifiableRate = percentage(classifiable, total);
  const graphGroundedRate = percentage(graphGrounded, total);
  const defectAccuracy = percentage(defectAccurate, total);
  const top1Accurate = results.filter(result =>
    Boolean(result.top1Accurate ?? result.checks?.defectType)
  ).length;
  const top3Accurate = results.filter(result =>
    Boolean(result.top3Accurate ?? result.top1Accurate ?? result.checks?.defectType)
  ).length;
  const acceptedResults = results.filter(result =>
    result.acceptedPrediction ?? result.classifiable
  );
  const acceptedAccurate = acceptedResults.filter(result =>
    Boolean(result.top1Accurate ?? result.checks?.defectType)
  ).length;
  const unsafeAcceptedErrors = results.filter(result =>
    result.unsafeAcceptedError
    ?? (
      (result.acceptedPrediction ?? result.classifiable)
      && !Boolean(result.top1Accurate ?? result.checks?.defectType)
    )
  ).length;
  const wrongResults = results.filter(result =>
    !Boolean(result.top1Accurate ?? result.checks?.defectType)
  );
  const safelyDeferredErrors = wrongResults.filter(result =>
    !(result.acceptedPrediction ?? result.classifiable)
  ).length;
  const qualityEligible = results.filter(result => result.qualityEligible !== false).length;
  const visionContractCompliant = results.filter(result =>
    result.visionContractCompliant !== false
  ).length;
  const top1Accuracy = percentage(top1Accurate, total);
  const top3Accuracy = percentage(top3Accurate, total);
  const selectiveCoverage = percentage(acceptedResults.length, total);
  const selectiveAccuracy = percentage(acceptedAccurate, acceptedResults.length);
  const abstentionRate = percentage(total - acceptedResults.length, total);
  const unsafeErrorRate = percentage(unsafeAcceptedErrors, total);
  const reviewCaptureRate = wrongResults.length > 0
    ? percentage(safelyDeferredErrors, wrongResults.length)
    : 100;
  const qualityEligibleRate = percentage(qualityEligible, total);
  const visionContractComplianceRate = percentage(visionContractCompliant, total);
  const calibration = buildConfidenceCalibration(results, options.calibrationBinCount ?? 5);
  const confident = results.filter(result =>
    Number(result.visionConfidence ?? result.confidence ?? 0) >= minimumVisionConfidence
  ).length;
  const confidentRate = percentage(confident, total);
  const perClass = requiredDefectClasses.map(defectClass => {
    const classResults = results.filter(result =>
      (result.expectedDefectClass || canonicalDefectClass(result.expectedDefectType)) === defectClass
    );
    const accurate = classResults.filter(result => result.checks?.defectType).length;
    const top3ClassAccurate = classResults.filter(result =>
      Boolean(result.top3Accurate ?? result.top1Accurate ?? result.checks?.defectType)
    ).length;
    return {
      defectClass,
      total: classResults.length,
      accurate,
      accuracy: percentage(accurate, classResults.length),
      top3Accurate: top3ClassAccurate,
      top3Accuracy: percentage(top3ClassAccurate, classResults.length),
      requiredSamples: minimumSamplesPerClass,
      covered: classResults.length >= minimumSamplesPerClass
    };
  });
  const coveredClassResults = perClass.filter(item => item.covered);
  const observedDefectClasses = perClass.filter(item => item.total > 0).length;
  const coveredDefectClasses = coveredClassResults.length;
  const classCoverageReady = coveredDefectClasses === requiredDefectClasses.length;
  const minimumObservedClassAccuracy = classCoverageReady
    ? Math.min(...coveredClassResults.map(item => item.accuracy))
    : 0;
  const classAccuracyReady =
    classCoverageReady && minimumObservedClassAccuracy >= minimumClassAccuracy;
  const gateChecks = {
    sampleCount: total >= minimumSamples,
    httpSuccess: httpSuccessRate >= 95,
    classifiable: classifiableRate >= 95,
    defectAccuracy: defectAccuracy >= 80,
    graphGrounding: graphGroundedRate >= 80,
    passRate: passRate >= 80,
    classCoverage: classCoverageReady,
    classAccuracy: classAccuracyReady,
    visionConfidence: confidentRate >= minimumConfidentRate,
    top3Accuracy: top3Accuracy >= minimumTop3Accuracy,
    selectiveAccuracy: selectiveAccuracy >= minimumSelectiveAccuracy,
    selectiveCoverage: selectiveCoverage >= minimumSelectiveCoverage,
    unsafeError: unsafeErrorRate <= maximumUnsafeErrorRate,
    calibration: calibration.expectedCalibrationError <= maximumCalibrationError,
    qualityEligibility: qualityEligibleRate >= minimumQualityEligibleRate,
    visionContract:
      visionContractComplianceRate >= minimumVisionContractComplianceRate
  };

  return {
    total,
    minimumSamples,
    passed,
    failed: total - passed,
    passRate,
    httpSuccessRate,
    classifiableRate,
    graphGroundedRate,
    defectAccuracy,
    top1Accuracy,
    top3Accuracy,
    minimumTop3Accuracy,
    acceptedPredictions: acceptedResults.length,
    selectiveCoverage,
    minimumSelectiveCoverage,
    selectiveAccuracy,
    minimumSelectiveAccuracy,
    abstentionRate,
    unsafeAcceptedErrors,
    unsafeErrorRate,
    maximumUnsafeErrorRate,
    reviewCaptureRate,
    qualityEligible,
    qualityEligibleRate,
    minimumQualityEligibleRate,
    visionContractCompliant,
    visionContractComplianceRate,
    minimumVisionContractComplianceRate,
    maximumCalibrationError,
    ...calibration,
    minimumVisionConfidence,
    minimumConfidentRate,
    confident,
    confidentRate,
    requiredDefectClasses,
    minimumSamplesPerClass,
    observedDefectClasses,
    coveredDefectClasses,
    classCoverageReady,
    minimumClassAccuracy,
    minimumObservedClassAccuracy,
    classAccuracyReady,
    perClass,
    gateChecks,
    failedGateChecks: Object.entries(gateChecks)
      .filter(([, passedCheck]) => !passedCheck)
      .map(([name]) => name),
    readyToDisableLegacyFallback: Object.values(gateChecks).every(Boolean)
  };
};

module.exports = {
  REQUIRED_DEFECT_CLASSES,
  canonicalDefectClass,
  evaluateVisionResult,
  findDuplicateImageGroups,
  findDuplicateLabelConflicts,
  isClassifiable,
  summarizeVisionBenchmark,
  validateVisionCases
};
