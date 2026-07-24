const {
  DEFECT_CLASS_LABELS,
  REQUIRED_DEFECT_CLASSES,
  canonicalDefectClass
} = require('./shared/defect-taxonomy');

const SHA256 = /^[a-f0-9]{64}$/i;

const compactWhitespace = value => String(value || '').replace(/\s+/g, ' ').trim();

const countByClass = candidates => Object.fromEntries(
  REQUIRED_DEFECT_CLASSES
    .map(defectClass => [
      defectClass,
      candidates.filter(candidate => candidate.defectClass === defectClass).length
    ])
    .filter(([, count]) => count > 0)
);

const buildWebCaseVisionCandidateManifest = ({
  collection,
  approvedClassCounts = {},
  minimumSamplesPerClass = 2,
  currentApprovedSamples,
  minimumTotalSamples,
  missingOnly = true,
  generatedAt = new Date().toISOString()
}) => {
  if (!collection?.integrity?.valid || !Array.isArray(collection?.cards)) {
    throw new Error('A verified web knowledge collection is required.');
  }
  const minimumPerClass = Math.max(1, Number(minimumSamplesPerClass) || 2);
  const seenHashes = new Set();
  const eligible = [];
  let duplicatesSkipped = 0;
  let invalidSkipped = 0;

  for (const card of collection.cards) {
    if (card?.sourceKind !== 'licensed_image') continue;
    const declaredClass = compactWhitespace(card.defectClass);
    const defectClass = REQUIRED_DEFECT_CLASSES.includes(declaredClass)
      ? declaredClass
      : canonicalDefectClass(card.defectName);
    if (!REQUIRED_DEFECT_CLASSES.includes(defectClass)) continue;
    const evidence = (card.evidence || []).find(item => item?.localFile);
    const contentSha256 = compactWhitespace(evidence?.contentSha256).toLowerCase();
    if (!evidence?.localFile || !SHA256.test(contentSha256)) {
      invalidSkipped += 1;
      continue;
    }
    if (seenHashes.has(contentSha256)) {
      duplicatesSkipped += 1;
      continue;
    }
    seenHashes.add(contentSha256);
    eligible.push({
      relativePath: String(evidence.localFile).replace(/\\/g, '/'),
      defectType: DEFECT_CLASS_LABELS[defectClass] || card.defectName,
      defectClass,
      labelProvenance: 'web_case_source_label',
      fieldContext: [
        `Web Case: ${card.defectName}`,
        card.problem ? `문제: ${compactWhitespace(card.problem)}` : '',
        card.phenomenon ? `현상: ${compactWhitespace(card.phenomenon)}` : '',
        `출처: ${compactWhitespace(evidence.publisher)} · ${compactWhitespace(evidence.title)}`,
        evidence.license ? `라이선스: ${compactWhitespace(evidence.license)}` : ''
      ].filter(Boolean).join('\n').slice(0, 4000),
      contentSha256,
      requiresLabelReconciliation: true,
      labelEvidence: {
        sourceLabel: card.defectName,
        conflict: true
      },
      sourceLineage: {
        webCaseId: card.caseId,
        sourcePublisher: evidence.publisher,
        sourceTitle: evidence.title,
        sourceUrl: evidence.sourceUrl,
        downloadUrl: evidence.downloadUrl,
        license: evidence.license,
        licenseUrl: evidence.licenseUrl,
        licenseVerificationUrl: evidence.licenseVerificationUrl,
        sourceRecordId: evidence.sourceRecordId,
        sourceCitation: evidence.sourceCitation,
        author: evidence.author,
        retrievedAt: evidence.retrievedAt,
        evidenceContentSha256: contentSha256,
        sourceReviewStatus: card.review?.status || 'candidate'
      }
    });
  }

  const selectedCounts = Object.fromEntries(
    REQUIRED_DEFECT_CLASSES.map(defectClass => [defectClass, 0])
  );
  const candidates = [];
  const selectedHashes = new Set();
  for (const candidate of eligible) {
    if (!missingOnly) {
      selectedCounts[candidate.defectClass] += 1;
      candidates.push({
        ...candidate,
        selectionReason: 'all_eligible'
      });
      selectedHashes.add(candidate.contentSha256);
      continue;
    }
    const approved = Math.max(0, Number(approvedClassCounts[candidate.defectClass]) || 0);
    const missing = Math.max(0, minimumPerClass - approved);
    if (selectedCounts[candidate.defectClass] >= missing) continue;
    selectedCounts[candidate.defectClass] += 1;
    candidates.push({
      ...candidate,
      selectionReason: 'class_coverage'
    });
    selectedHashes.add(candidate.contentSha256);
  }
  const classCoverageSelected = candidates.length;
  const hasTotalGate = Number.isFinite(Number(currentApprovedSamples))
    && Number.isFinite(Number(minimumTotalSamples));
  const approvedTotal = hasTotalGate
    ? Math.max(0, Number(currentApprovedSamples))
    : 0;
  const requiredTotal = hasTotalGate
    ? Math.max(0, Number(minimumTotalSamples))
    : 0;
  const additionalTotalSamplesRequired = hasTotalGate
    ? Math.max(0, requiredTotal - approvedTotal)
    : 0;
  if (missingOnly && hasTotalGate && candidates.length < additionalTotalSamplesRequired) {
    for (const candidate of eligible) {
      if (candidates.length >= additionalTotalSamplesRequired) break;
      if (selectedHashes.has(candidate.contentSha256)) continue;
      candidates.push({
        ...candidate,
        selectionReason: 'total_sample_supplement'
      });
      selectedHashes.add(candidate.contentSha256);
    }
  }
  const supplementalSelected = candidates.filter(
    candidate => candidate.selectionReason === 'total_sample_supplement'
  ).length;
  const selectedByClass = countByClass(candidates);
  const eligibleByClass = countByClass(eligible);
  const remainingAfterCandidates = Object.fromEntries(
    Object.keys(eligibleByClass)
      .map(defectClass => {
        const approved = Math.max(0, Number(approvedClassCounts[defectClass]) || 0);
        const selected = selectedByClass[defectClass] || 0;
        return [
          defectClass,
          Math.max(0, minimumPerClass - approved - selected)
        ];
      })
      .filter(([, remaining]) => remaining > 0)
  );

  return {
    schemaVersion: 1,
    generatedAt,
    source: {
      collectionRoot: collection.rootPath,
      cardCount: collection.integrity.cardCount,
      verifiedImages: collection.integrity.verifiedImages
    },
    policy: {
      persistence: 'none',
      autoApproval: false,
      graphPromotion: false,
      approval: 'human_required',
      hashVerification: 'sha256'
    },
    summary: {
      eligible: eligible.length,
      selected: candidates.length,
      eligibleByClass,
      selectedByClass,
      remainingAfterCandidates,
      classCoverageSelected,
      supplementalSelected,
      additionalTotalSamplesRequired,
      additionalTotalSamplesAfterCandidates: hasTotalGate
        ? Math.max(0, additionalTotalSamplesRequired - candidates.length)
        : 0,
      duplicatesSkipped,
      invalidSkipped
    },
    candidates
  };
};

module.exports = {
  buildWebCaseVisionCandidateManifest
};
