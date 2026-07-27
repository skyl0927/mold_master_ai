const asArray = value => Array.isArray(value) ? value : [];

const compact = value => String(value || '').replace(/\s+/g, ' ').trim();

const numberFrom = (...values) => {
  const value = values.find(item => Number.isFinite(Number(item)));
  return value === undefined ? 0 : Number(value);
};

const isBenchmarkReport = artifact =>
  artifact && typeof artifact === 'object' && artifact.summary && Array.isArray(artifact.results);

const sortByCountThenName = items =>
  [...items].sort((left, right) => right.count - left.count || left.view.localeCompare(right.view));

const topMissingViews = summary =>
  sortByCountThenName(asArray(summary.missingCaptureViews)
    .map(item => ({
      view: compact(item.view),
      count: Number(item.count) || 0
    }))
    .filter(item => item.view && item.count > 0));

const coreMissingViews = missingViews =>
  missingViews.filter(item => ['defect_closeup', 'full_part_context'].includes(item.view));

const undercoveredClasses = summary =>
  asArray(summary.perClass)
    .filter(item => item?.covered !== true)
    .map(item => compact(item.defectClass))
    .filter(Boolean);

const zeroAccuracyClasses = summary =>
  asArray(summary.perClass)
    .filter(item => numberFrom(item.total) > 0 && numberFrom(item.accuracy) === 0)
    .map(item => compact(item.defectClass))
    .filter(Boolean);

const confusionPairs = results => {
  const pairs = new Map();
  for (const result of asArray(results)) {
    const top1Accurate = Boolean(result.top1Accurate ?? result.checks?.defectType);
    const expected = compact(result.expectedDefectClass);
    const actual = compact(result.actualDefectClass);
    if (top1Accurate || !expected || !actual || actual === 'unclassified') continue;
    const key = `${expected}->${actual}`;
    const current = pairs.get(key) || {
      expectedDefectClass: expected,
      actualDefectClass: actual,
      count: 0,
      sampleIds: []
    };
    current.count += 1;
    if (compact(result.id)) current.sampleIds.push(compact(result.id));
    pairs.set(key, current);
  }
  return [...pairs.values()]
    .map(pair => ({
      ...pair,
      sampleIds: [...new Set(pair.sampleIds)].sort()
    }))
    .sort((left, right) =>
      right.count - left.count
      || left.expectedDefectClass.localeCompare(right.expectedDefectClass)
      || left.actualDefectClass.localeCompare(right.actualDefectClass)
    );
};

const sampleIdsForMissingProtocol = (results, limit = 8) =>
  asArray(results)
    .filter(result => result.captureProtocol?.ready === false)
    .map(result => compact(result.id))
    .filter(Boolean)
    .slice(0, limit);

const failedGate = (summary, code) =>
  asArray(summary.failedGateChecks).includes(code)
  || summary.gateChecks?.[code] === false;

const track = ({
  code,
  priority,
  owner,
  titleKo,
  descriptionKo,
  commands = [],
  targetViews = [],
  targetDefectClasses = [],
  confusionPairs = [],
  sampleIds = [],
  safetyNoteKo = ''
}) => ({
  code,
  priority,
  owner,
  titleKo,
  descriptionKo,
  commands,
  targetViews,
  targetDefectClasses,
  confusionPairs,
  sampleIds,
  safetyNoteKo,
  serviceWritesAllowed: false
});

const missingEvidencePlan = generatedAt => ({
  schemaVersion: 1,
  contractVersion: 'vision-accuracy-improvement-plan/v1',
  generatedAt,
  status: 'missing_evidence',
  serviceWritesPerformed: false,
  localArtifactsWritten: true,
  policy: {
    requiresHumanReview: true,
    allowGraphPromotion: false,
    allowReferenceLearning: false,
    allowModelTraining: false,
    allowThresholdRelaxation: false
  },
  summary: {
    missingArtifacts: 1,
    totalCases: 0,
    top1Accuracy: 0,
    top3Accuracy: 0,
    classifiableRate: 0,
    confidentRate: 0,
    captureProtocolReadyRate: 0,
    referenceRefreshAllowedNow: false,
    coreMissingViews: [],
    undercoveredDefectClasses: [],
    zeroAccuracyDefectClasses: [],
    failedGateChecks: []
  },
  improvementTracks: [
    track({
      code: 'generate_vision_benchmark',
      priority: 100,
      owner: 'system_operator',
      titleKo: 'Vision benchmark 증거 생성',
      descriptionKo: '비전 정확도 개선 우선순위를 계산하려면 승인 fixture benchmark report가 먼저 필요합니다.',
      commands: [
        'npm run eval:vision:approved',
        'npm run vision:accuracy:improvement-plan'
      ],
      safetyNoteKo: '벤치마크 생성은 artifact-only이며 Graph 승격이나 모델 학습을 수행하지 않습니다.'
    })
  ],
  recommendedAction: '먼저 npm run eval:vision:approved를 실행한 뒤 npm run vision:accuracy:improvement-plan을 다시 실행하세요.'
});

const tracksFor = ({
  summary,
  results,
  missingViews,
  coreViews,
  undercovered,
  zeroAccuracy,
  pairs,
  referenceRefreshAllowedNow,
  referenceRepairGuide
}) => {
  const tracks = [];
  if (
    failedGate(summary, 'captureProtocol')
    || numberFrom(summary.captureProtocolReadyRate) < numberFrom(summary.minimumCaptureProtocolReadyRate, 80)
  ) {
    tracks.push(track({
      code: 'repair_capture_protocol',
      priority: 100,
      owner: 'quality_capture',
      titleKo: '촬영 프로토콜 보강',
      descriptionKo: '비전 AI가 결함 특징을 안정적으로 보려면 전체 제품 맥락, 결함 근접, 필요 시 사광/반대면/유동 합류 시점이 먼저 갖춰져야 합니다.',
      commands: [
        'npm run eval:vision:approved:validate',
        'npm run vision:hitl:review-guide',
        'npm run vision:reference:backfill-plan'
      ],
      targetViews: missingViews.slice(0, 6).map(item => item.view),
      sampleIds: sampleIdsForMissingProtocol(results),
      safetyNoteKo: '캡처 보강 전에는 낮은 품질 이미지를 학습용 reference로 승격하지 않습니다.'
    }));
  }

  if (failedGate(summary, 'classCoverage') || undercovered.length > 0) {
    tracks.push(track({
      code: 'expand_balanced_class_coverage',
      priority: 90,
      owner: 'quality_capture',
      titleKo: '결함군 균형 샘플 확장',
      descriptionKo: '특정 결함군 샘플이 부족하면 Vision top-k 후보가 Graph 근거와 맞아도 일반화가 흔들립니다.',
      commands: [
        'npm run vision:review-packet',
        'npm run vision:hitl:decision-template',
        'npm run vision:hitl:review-guide'
      ],
      targetDefectClasses: undercovered,
      safetyNoteKo: '부족 결함군은 클래스별 최소 승인 샘플 기준을 만족할 때까지 shadow 데이터로만 유지합니다.'
    }));
  }

  if (
    failedGate(summary, 'top3Accuracy')
    || failedGate(summary, 'defectAccuracy')
    || failedGate(summary, 'classAccuracy')
    || zeroAccuracy.length > 0
    || pairs.length > 0
  ) {
    tracks.push(track({
      code: 'build_confusion_and_hard_negative_set',
      priority: 80,
      owner: 'vision_engineer',
      titleKo: '혼동쌍 및 hard negative 세트 구축',
      descriptionKo: '오진 결함쌍과 판정 불가 샘플을 분리해 contrastive reference, few-shot 예시, HITL 검증 세트로 재사용합니다.',
      commands: [
        'npm run eval:vision:approved',
        'npm run vision:accuracy:improvement-plan',
        'npm run vision:reference:repair-guide'
      ],
      targetDefectClasses: zeroAccuracy,
      confusionPairs: pairs,
      safetyNoteKo: '혼동쌍은 모델 보정 후보일 뿐이며, 사람이 검증하기 전에는 원인/대책 Graph에 반영하지 않습니다.'
    }));
  }

  if (
    failedGate(summary, 'classifiable')
    || failedGate(summary, 'visionConfidence')
    || failedGate(summary, 'selectiveCoverage')
    || failedGate(summary, 'selectiveAccuracy')
  ) {
    tracks.push(track({
      code: 'calibrate_abstention_without_lowering_safety',
      priority: 70,
      owner: 'vision_engineer',
      titleKo: '보류/신뢰도 보정',
      descriptionKo: '현재 unsafe accepted error는 낮게 유지하면서, 판정 가능한 이미지의 confidence와 top-k 후보를 안정화합니다.',
      commands: [
        'npm run test:vision-diagnosis-guard',
        'npm run test:vision-consensus-gate',
        'npm run eval:vision:approved'
      ],
      safetyNoteKo: '정확도 수치를 올리기 위해 보류 기준을 낮추는 방식은 금지합니다.'
    }));
  }

  if (!referenceRefreshAllowedNow || referenceRepairGuide?.status === 'action_required') {
    tracks.push(track({
      code: 'hold_reference_learning_until_hitl_closed',
      priority: 60,
      owner: 'common_agent_operator',
      titleKo: 'Reference 학습 보류',
      descriptionKo: 'HITL, 라벨 충돌, 샘플 수량, backfill blocker가 닫히기 전에는 Common Agent reference refresh를 보류합니다.',
      commands: [
        'npm run vision:reference:repair-guide',
        'npm run vision:operational:readiness'
      ],
      safetyNoteKo: '오염된 reference store는 이후 Graph 기반 답변 전체를 왜곡할 수 있으므로 fail-closed를 유지합니다.'
    }));
  }

  if (tracks.length === 0) {
    tracks.push(track({
      code: 'run_shadow_validation',
      priority: 100,
      owner: 'vision_engineer',
      titleKo: 'shadow validation 실행',
      descriptionKo: '벤치마크와 reference gate가 준비되었으므로 운영 반영 전 shadow traffic에서 회귀와 신뢰도 drift를 확인합니다.',
      commands: [
        'npm run eval:vision:approved',
        'npm run eval:vision:release',
        'npm run operational:progress'
      ],
      safetyNoteKo: 'shadow validation은 운영 자동 활성화가 아니며, 최종 반영은 운영자 승인 후 진행합니다.'
    }));
  }

  return tracks.sort((left, right) => right.priority - left.priority || left.code.localeCompare(right.code));
};

const statusFor = ({ summary, tracks, referenceRefreshAllowedNow }) => {
  if (asArray(summary.failedGateChecks).length === 0 && referenceRefreshAllowedNow) {
    return 'ready_for_shadow_validation';
  }
  return tracks.length > 0 ? 'action_required' : 'action_required';
};

const recommendedActionFor = (status, tracks) => {
  if (status === 'ready_for_shadow_validation') {
    return '비전 벤치마크와 reference 전제 조건이 충족됐으므로 shadow validation을 실행하세요.';
  }
  const first = tracks[0];
  if (first?.code === 'repair_capture_protocol') {
    return '촬영 프로토콜 보강을 먼저 진행하세요. 특히 결함 근접 사진과 전체 제품 사진이 비전 정확도 개선의 1차 병목입니다.';
  }
  return first
    ? `${first.titleKo} 작업부터 진행하세요.`
    : '비전 개선 계획을 재생성하세요.';
};

const buildVisionAccuracyImprovementPlan = ({
  generatedAt = new Date().toISOString(),
  benchmarkReport = null,
  referenceRepairGuide = null
} = {}) => {
  if (!isBenchmarkReport(benchmarkReport)) {
    return missingEvidencePlan(generatedAt);
  }

  const summary = benchmarkReport.summary || {};
  const missingViews = topMissingViews(summary);
  const coreViews = coreMissingViews(missingViews);
  const undercovered = undercoveredClasses(summary);
  const zeroAccuracy = zeroAccuracyClasses(summary);
  const pairs = confusionPairs(benchmarkReport.results);
  const referenceRefreshAllowedNow =
    referenceRepairGuide?.summary?.refreshAllowedNow === true
    || referenceRepairGuide?.status === 'ready_for_refresh'
    || referenceRepairGuide?.status === 'passed';
  const tracks = tracksFor({
    summary,
    results: benchmarkReport.results,
    missingViews,
    coreViews,
    undercovered,
    zeroAccuracy,
    pairs,
    referenceRefreshAllowedNow,
    referenceRepairGuide
  });
  const status = statusFor({
    summary,
    tracks,
    referenceRefreshAllowedNow
  });

  return {
    schemaVersion: 1,
    contractVersion: 'vision-accuracy-improvement-plan/v1',
    generatedAt,
    status,
    sourceBenchmarkGeneratedAt: benchmarkReport.generatedAt || null,
    serviceWritesPerformed: false,
    localArtifactsWritten: true,
    policy: {
      requiresHumanReview: true,
      allowGraphPromotion: false,
      allowReferenceLearning: false,
      allowModelTraining: false,
      allowThresholdRelaxation: false
    },
    summary: {
      missingArtifacts: 0,
      totalCases: numberFrom(summary.total),
      minimumSamples: numberFrom(summary.minimumSamples),
      top1Accuracy: numberFrom(summary.top1Accuracy),
      top3Accuracy: numberFrom(summary.top3Accuracy),
      minimumTop3Accuracy: numberFrom(summary.minimumTop3Accuracy),
      classifiableRate: numberFrom(summary.classifiableRate),
      confidentRate: numberFrom(summary.confidentRate),
      graphGroundedRate: numberFrom(summary.graphGroundedRate),
      captureProtocolReadyRate: numberFrom(summary.captureProtocolReadyRate),
      referenceRefreshAllowedNow,
      coreMissingViews: coreViews,
      undercoveredDefectClasses: undercovered,
      zeroAccuracyDefectClasses: zeroAccuracy,
      confusionPairCount: pairs.length,
      failedGateChecks: asArray(summary.failedGateChecks)
    },
    improvementTracks: tracks,
    recommendedAction: recommendedActionFor(status, tracks)
  };
};

module.exports = {
  buildVisionAccuracyImprovementPlan
};
