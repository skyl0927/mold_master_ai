const compact = value => String(value || '').replace(/\s+/g, ' ').trim();

const asArray = value => Array.isArray(value) ? value : [];

const countBy = (items, selector) => items.reduce((counts, item) => {
  const key = selector(item);
  counts[key] = (counts[key] || 0) + 1;
  return counts;
}, {});

const benchmarkCaseFor = item =>
  item?.benchmarkCaseCandidate || item?.benchmark_case_candidate || null;

const caseIdFor = item => compact(benchmarkCaseFor(item)?.id || item?.caseId || item?.case_id);

const resultsById = benchmarkReport => new Map(
  asArray(benchmarkReport?.results).map(result => [compact(result?.id), result])
);

const isQualityRejected = result =>
  result?.qualityEligible === false || compact(result?.qualityStatus) === 'reject';

const isCaptureProtocolRejected = result =>
  result?.captureProtocol && result.captureProtocol.ready === false;

const isVisionContractRejected = result =>
  result?.visionContractCompliant === false;

const isHttpFailed = result => result?.httpOk !== true;

const isAcceptedPredictionMissing = result => result?.acceptedPrediction !== true;

const isTop1Mismatch = result => result?.top1Accurate !== true;

const isTop3Mismatch = result => result?.top3Accurate !== true;

const safeBool = value => value === true;

const buildReasons = result => {
  const reasons = [];
  if (!result) return ['missing_benchmark_result'];
  if (isHttpFailed(result)) reasons.push('benchmark_http_failed');
  if (isQualityRejected(result)) reasons.push('image_quality_rejected');
  if (isCaptureProtocolRejected(result)) reasons.push('capture_protocol_not_ready');
  if (isVisionContractRejected(result)) reasons.push('vision_contract_failed');
  if (safeBool(result.unsafeAcceptedError)) reasons.push('unsafe_accepted_error');
  if (isTop1Mismatch(result)) reasons.push('top1_mismatch');
  if (isTop3Mismatch(result)) reasons.push('expected_label_not_in_top3');
  if (isAcceptedPredictionMissing(result)) reasons.push('model_abstained_or_needs_review');
  return reasons;
};

const statusForReasons = reasons => {
  if (reasons.includes('missing_benchmark_result')) return 'missing_benchmark_result';
  if (
    reasons.includes('image_quality_rejected')
    || reasons.includes('capture_protocol_not_ready')
  ) {
    return 'needs_recapture';
  }
  if (reasons.includes('unsafe_accepted_error')) return 'unsafe_recheck_failed';
  if (reasons.length > 0) return 'needs_hitl_review';
  return 'passed_shadow_recheck';
};

const buildHumanApprovalCandidate = (item, result, generatedAt, benchmarkReport) => ({
  decision: 'approve',
  defect_type: compact(item.defectType),
  labels: [compact(item.defectType)].filter(Boolean),
  promote_to_graph: false,
  force_promote: false,
  comment: 'HITL corrected Vision result passed shadow recheck. Human approval is still required before reference learning.',
  metadata: {
    source_app: 'mold-master-ai',
    hitl_recheck_verified: true,
    hitl_recheck_verified_at: generatedAt,
    hitl_recheck_case_id: caseIdFor(item),
    hitl_recheck_benchmark_generated_at: benchmarkReport?.generatedAt || null,
    hitl_recheck_top1_accurate: result.top1Accurate === true,
    hitl_recheck_top3_accurate: result.top3Accurate === true,
    hitl_recheck_accepted_prediction: result.acceptedPrediction === true,
    hitl_recheck_unsafe_accepted_error: result.unsafeAcceptedError === true,
    reference_learning_candidate_after_recheck: true,
    fine_tuning_auto_start_allowed: false
  }
});

const classifyRecheckItem = ({ item, result, generatedAt, benchmarkReport }) => {
  if (item?.status !== 'ready_for_shadow_recheck') {
    return {
      imageId: compact(item?.imageId),
      caseId: caseIdFor(item),
      defectType: compact(item?.defectType),
      defectClass: compact(item?.defectClass),
      status: compact(item?.status) || 'skipped',
      reasons: asArray(item?.reasons),
      humanApprovalCandidate: null,
      missingCaptureViews: [],
      serviceWriteAllowed: false
    };
  }

  const reasons = buildReasons(result);
  const status = statusForReasons(reasons);
  return {
    imageId: compact(item.imageId),
    caseId: caseIdFor(item),
    defectType: compact(item.defectType),
    defectClass: compact(item.defectClass),
    status,
    reasons,
    actualDefectType: compact(result?.actualDefectType),
    actualDefectClass: compact(result?.actualDefectClass),
    visionConfidence: Number(result?.visionConfidence ?? result?.confidence) || 0,
    missingCaptureViews: asArray(result?.captureProtocol?.missingViews).map(compact).filter(Boolean),
    humanApprovalCandidate: status === 'passed_shadow_recheck'
      ? buildHumanApprovalCandidate(item, result, generatedAt, benchmarkReport)
      : null,
    serviceWriteAllowed: false
  };
};

const buildBlockers = summary => {
  const blockers = [];
  if (summary.needsHitlReview > 0) {
    blockers.push({ code: 'hitl_recheck_review_required', count: summary.needsHitlReview });
  }
  if (summary.needsRecapture > 0) {
    blockers.push({ code: 'hitl_recheck_recapture_required', count: summary.needsRecapture });
  }
  if (summary.unsafeAcceptedErrors > 0) {
    blockers.push({ code: 'hitl_recheck_unsafe_error', count: summary.unsafeAcceptedErrors });
  }
  if (summary.missingBenchmarkResults > 0) {
    blockers.push({ code: 'hitl_recheck_missing_benchmark_result', count: summary.missingBenchmarkResults });
  }
  return blockers;
};

const buildRecommendedAction = summary => {
  if (summary.needsRecapture > 0) {
    return 'Recapture rejected or incomplete HITL recheck images, then rerun the HITL recheck benchmark.';
  }
  if (summary.unsafeAcceptedErrors > 0 || summary.needsHitlReview > 0) {
    return 'Return failed HITL recheck cases to human review and update labels or capture protocol before reference learning.';
  }
  if (summary.missingBenchmarkResults > 0) {
    return 'Rerun the HITL recheck benchmark so every candidate has a result.';
  }
  if (summary.readyForHumanApproval > 0) {
    return 'Human reviewer can approve the verified recheck candidates for reference learning. Keep Graph promotion disabled.';
  }
  return 'No HITL recheck candidates were evaluated.';
};

const buildVisionHitlReevaluationPostCheck = ({
  plan = {},
  benchmarkReport = {},
  generatedAt = new Date().toISOString()
} = {}) => {
  const resultMap = resultsById(benchmarkReport);
  const recheckItems = asArray(plan.items).filter(item =>
    item?.status === 'ready_for_shadow_recheck'
  );
  const items = recheckItems.map(item => classifyRecheckItem({
    item,
    result: resultMap.get(caseIdFor(item)),
    generatedAt,
    benchmarkReport
  }));
  const statusCounts = countBy(items, item => item.status);
  const unsafeAcceptedErrors = statusCounts.unsafe_recheck_failed || 0;
  const summary = {
    totalRecheckCandidates: recheckItems.length,
    evaluatedBenchmarkResults: resultMap.size,
    readyForHumanApproval: statusCounts.passed_shadow_recheck || 0,
    needsHitlReview: (statusCounts.needs_hitl_review || 0) + unsafeAcceptedErrors,
    needsRecapture: statusCounts.needs_recapture || 0,
    unsafeAcceptedErrors,
    missingBenchmarkResults: statusCounts.missing_benchmark_result || 0,
    statusCounts
  };
  const blockers = buildBlockers(summary);

  return {
    schemaVersion: 1,
    generatedAt,
    status: blockers.length === 0 && summary.readyForHumanApproval > 0
      ? 'ready_for_human_approval'
      : recheckItems.length === 0
        ? 'empty'
        : 'action_required',
    serviceWritesPerformed: false,
    readyForReferenceRefresh: false,
    planGeneratedAt: plan.generatedAt || null,
    benchmarkGeneratedAt: benchmarkReport.generatedAt || null,
    benchmarkManifestPath: benchmarkReport.manifestPath || null,
    summary,
    blockers,
    items,
    recommendedAction: buildRecommendedAction(summary)
  };
};

module.exports = {
  buildVisionHitlReevaluationPostCheck
};
