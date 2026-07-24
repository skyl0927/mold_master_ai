const fs = require('node:fs');
const path = require('node:path');
const {
  REQUIRED_DEFECT_CLASSES,
  canonicalDefectClass,
  isClassifiableDefectLabel
} = require('../../shared/defect-taxonomy');

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
  const defectType = observation.defect_type || '';
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
    response.visionConfidence ?? observation.confidence ?? response.confidence
  );
  const retrievalConfidence = numericConfidence(
    response.retrievalConfidence ?? response.confidence
  );
  const expectedDefectClass =
    testCase.expected.defectClass || canonicalDefectClass(testCase.expected.defectType);
  const actualDefectClass = canonicalDefectClass(defectType);
  const taxonomyEquivalent = REQUIRED_DEFECT_CLASSES.includes(expectedDefectClass)
    && actualDefectClass === expectedDefectClass;
  const checks = {
    http: Boolean(execution.httpOk),
    classifiable,
    defectType: includesEither(defectType, testCase.expected.defectType)
      || taxonomyEquivalent,
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

const summarizeVisionBenchmark = (results, minimumSamples = 20, options = {}) => {
  const requiredDefectClasses = options.requiredDefectClasses || REQUIRED_DEFECT_CLASSES;
  const minimumSamplesPerClass = options.minimumSamplesPerClass ?? 2;
  const minimumVisionConfidence = options.minimumVisionConfidence ?? 0.6;
  const minimumConfidentRate = options.minimumConfidentRate ?? 80;
  const minimumClassAccuracy = options.minimumClassAccuracy ?? 50;
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
  const confident = results.filter(result =>
    Number(result.visionConfidence ?? result.confidence ?? 0) >= minimumVisionConfidence
  ).length;
  const confidentRate = percentage(confident, total);
  const perClass = requiredDefectClasses.map(defectClass => {
    const classResults = results.filter(result =>
      (result.expectedDefectClass || canonicalDefectClass(result.expectedDefectType)) === defectClass
    );
    const accurate = classResults.filter(result => result.checks?.defectType).length;
    return {
      defectClass,
      total: classResults.length,
      accurate,
      accuracy: percentage(accurate, classResults.length),
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
    visionConfidence: confidentRate >= minimumConfidentRate
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
