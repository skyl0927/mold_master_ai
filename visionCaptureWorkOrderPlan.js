const {
  BASE_REQUIRED_VIEWS,
  VIEW_DEFINITIONS,
  requiredViewsFor
} = require('./visionCaptureProtocol');

const CONTRACT_VERSION = 'vision-capture-work-order-plan/v1';

const asArray = value => Array.isArray(value) ? value : [];

const compact = value => String(value || '').replace(/\s+/g, ' ').trim();

const numberFrom = (...values) => {
  const value = values.find(item => Number.isFinite(Number(item)));
  return value === undefined ? 0 : Number(value);
};

const unique = values => [...new Set(values.map(compact).filter(Boolean))];

const isBenchmarkReport = artifact =>
  artifact && typeof artifact === 'object' && artifact.summary && Array.isArray(artifact.results);

const sortCountedViews = items =>
  [...items].sort((left, right) =>
    right.count - left.count || left.view.localeCompare(right.view)
  );

const countViews = values => {
  const counts = new Map();
  for (const view of values.map(compact).filter(Boolean)) {
    counts.set(view, (counts.get(view) || 0) + 1);
  }
  return sortCountedViews([...counts.entries()].map(([view, count]) => ({ view, count })));
};

const coreMissingViews = summary =>
  sortCountedViews(
    asArray(summary?.missingCaptureViews)
      .map(item => ({
        view: compact(item?.view),
        count: Number(item?.count) || 0
      }))
      .filter(item => BASE_REQUIRED_VIEWS.includes(item.view) && item.count > 0)
  );

const classResults = (results, defectClass) =>
  asArray(results).filter(result =>
    compact(result?.expectedDefectClass || result?.expected?.defectClass) === defectClass
  );

const classMissingViews = (results, defectClass, fallbackRequiredViews) => {
  const missingFromResults = classResults(results, defectClass)
    .flatMap(result => asArray(result?.captureProtocol?.missingViews));
  if (missingFromResults.length > 0) return countViews(missingFromResults);
  return fallbackRequiredViews.map(view => ({ view, count: 1 }));
};

const captureInstructionsFor = views =>
  views.map(view => ({
    view,
    label: compact(VIEW_DEFINITIONS[view]?.label) || view,
    instruction: compact(VIEW_DEFINITIONS[view]?.instruction) || view
  }));

const recaptureSampleIdsFor = (results, defectClass, limit = 10) =>
  unique(classResults(results, defectClass)
    .filter(result => result?.captureProtocol?.ready === false)
    .map(result => result?.id))
    .slice(0, limit);

const needsWorkOrder = ({
  currentSamples,
  requiredSamples,
  covered,
  accuracy,
  top3Accuracy,
  minimumClassAccuracy,
  minimumTop3Accuracy,
  recaptureSampleIds
}) =>
  currentSamples < requiredSamples
  || covered !== true
  || (currentSamples > 0 && accuracy < minimumClassAccuracy)
  || (currentSamples > 0 && top3Accuracy < minimumTop3Accuracy)
  || recaptureSampleIds.length > 0;

const priorityFor = ({
  missingApprovedSamples,
  covered,
  currentSamples,
  accuracy,
  top3Accuracy,
  recaptureSampleIds
}) =>
  (missingApprovedSamples * 40)
  + (covered !== true ? 25 : 0)
  + (currentSamples > 0 && accuracy === 0 ? 20 : 0)
  + (currentSamples > 0 && top3Accuracy === 0 ? 10 : 0)
  + Math.min(recaptureSampleIds.length * 3, 15);

const actionTypeFor = (missingApprovedSamples, recaptureSampleIds) => {
  if (missingApprovedSamples > 0 && recaptureSampleIds.length > 0) {
    return 'capture_new_and_recapture_existing_samples';
  }
  if (missingApprovedSamples > 0) return 'capture_new_multiview_samples';
  return 'recapture_missing_views';
};

const missingEvidencePlan = generatedAt => ({
  schemaVersion: 1,
  contractVersion: CONTRACT_VERSION,
  generatedAt,
  status: 'missing_evidence',
  serviceWritesPerformed: false,
  localArtifactsWritten: true,
  policy: {
    requiresHumanReview: true,
    allowGraphPromotion: false,
    allowReferenceLearning: false,
    allowModelTraining: false,
    serviceWritesAllowed: false
  },
  summary: {
    missingArtifacts: 1,
    totalCases: 0,
    top1Accuracy: 0,
    top3Accuracy: 0,
    captureProtocolReadyRate: 0,
    totalWorkOrders: 0,
    totalMissingApprovedSamples: 0,
    totalRecaptureSamples: 0,
    topPriorityDefectClass: null,
    coreMissingViews: []
  },
  workOrders: [],
  nextCommands: [
    'npm run eval:vision:approved',
    'npm run vision:capture:work-orders'
  ],
  recommendedActionKo: '승인 Vision benchmark report를 먼저 생성한 뒤 촬영 work order를 다시 산출하세요.'
});

const workOrdersFor = (benchmarkReport, options = {}) => {
  const summary = benchmarkReport.summary || {};
  const results = asArray(benchmarkReport.results);
  const minimumSamplesPerClass = numberFrom(
    options.minimumSamplesPerClass,
    summary.minimumSamplesPerClass,
    2
  );
  const minimumClassAccuracy = numberFrom(summary.minimumClassAccuracy, 50);
  const minimumTop3Accuracy = numberFrom(summary.minimumTop3Accuracy, 90);

  return asArray(summary.perClass)
    .map(item => {
      const defectClass = compact(item?.defectClass);
      const currentSamples = numberFrom(item?.total);
      const requiredSamples = numberFrom(item?.requiredSamples, minimumSamplesPerClass);
      const missingApprovedSamples = Math.max(0, requiredSamples - currentSamples);
      const accuracy = numberFrom(item?.accuracy);
      const top3Accuracy = numberFrom(item?.top3Accuracy);
      const covered = item?.covered === true;
      const requiredViews = requiredViewsFor(defectClass);
      const recaptureSampleIds = recaptureSampleIdsFor(results, defectClass);
      const missingViews = classMissingViews(results, defectClass, requiredViews);

      return {
        defectClass,
        actionType: actionTypeFor(missingApprovedSamples, recaptureSampleIds),
        priority: priorityFor({
          missingApprovedSamples,
          covered,
          currentSamples,
          accuracy,
          top3Accuracy,
          recaptureSampleIds
        }),
        currentSamples,
        requiredSamples,
        missingApprovedSamples,
        accuracy,
        top3Accuracy,
        covered,
        requiredViews,
        missingViews,
        recaptureSampleIds,
        captureInstructions: captureInstructionsFor(requiredViews),
        serviceWriteAllowed: false
      };
    })
    .filter(order => order.defectClass && needsWorkOrder({
      ...order,
      minimumClassAccuracy,
      minimumTop3Accuracy
    }))
    .sort((left, right) =>
      right.priority - left.priority || left.defectClass.localeCompare(right.defectClass)
    );
};

const buildVisionCaptureWorkOrderPlan = ({
  generatedAt = new Date().toISOString(),
  benchmarkReport = null,
  minimumSamplesPerClass
} = {}) => {
  if (!isBenchmarkReport(benchmarkReport)) {
    return missingEvidencePlan(generatedAt);
  }

  const summary = benchmarkReport.summary || {};
  const workOrders = workOrdersFor(benchmarkReport, { minimumSamplesPerClass });
  const totalMissingApprovedSamples = workOrders.reduce(
    (total, order) => total + order.missingApprovedSamples,
    0
  );
  const totalRecaptureSamples = unique(workOrders.flatMap(order => order.recaptureSampleIds)).length;
  const ready = workOrders.length === 0;

  return {
    schemaVersion: 1,
    contractVersion: CONTRACT_VERSION,
    generatedAt,
    status: ready ? 'ready_for_shadow_validation' : 'capture_required',
    serviceWritesPerformed: false,
    localArtifactsWritten: true,
    policy: {
      requiresHumanReview: !ready,
      allowGraphPromotion: false,
      allowReferenceLearning: false,
      allowModelTraining: false,
      serviceWritesAllowed: false
    },
    summary: {
      missingArtifacts: 0,
      totalCases: numberFrom(summary.total),
      top1Accuracy: numberFrom(summary.top1Accuracy),
      top3Accuracy: numberFrom(summary.top3Accuracy),
      captureProtocolReadyRate: numberFrom(summary.captureProtocolReadyRate),
      totalWorkOrders: workOrders.length,
      totalMissingApprovedSamples,
      totalRecaptureSamples,
      topPriorityDefectClass: workOrders[0]?.defectClass || null,
      coreMissingViews: coreMissingViews(summary)
    },
    workOrders,
    nextCommands: ready
      ? ['npm run eval:vision:release']
      : [
        'npm run vision:capture:work-orders',
        'npm run vision:review-packet',
        'npm run eval:vision:approved'
      ],
    recommendedActionKo: ready
      ? '촬영/정확도 gate가 충족되었습니다. shadow validation release report를 생성하세요.'
      : '우선순위가 높은 결함군부터 필수 시점 촬영과 재촬영을 완료한 뒤 Vision benchmark를 다시 실행하세요.'
  };
};

module.exports = {
  buildVisionCaptureWorkOrderPlan
};
