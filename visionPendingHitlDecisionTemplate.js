const asArray = value => Array.isArray(value) ? value : [];

const compact = value => String(value || '').replace(/\s+/g, ' ').trim();

const unique = values => [...new Set(values.map(compact).filter(Boolean))];

const normalizeHash = value => compact(value).toLowerCase();

const defaultActions = [
  'approve_candidate',
  'mark_needs_review',
  'reject_candidate',
  'request_recapture'
];

const requiredFieldsByAction = {
  approve_candidate: [
    'action',
    'approvedDefectType',
    'manufacturingImageConfirmed',
    'labelConfirmed',
    'reviewer.id',
    'decidedAt',
    'reviewComment'
  ],
  mark_needs_review: [
    'action',
    'reviewer.id',
    'decidedAt',
    'reviewComment'
  ],
  reject_candidate: [
    'action',
    'reviewer.id',
    'decidedAt',
    'reviewComment'
  ],
  request_recapture: [
    'action',
    'requestedViews',
    'reviewer.id',
    'decidedAt',
    'reviewComment'
  ]
};

const itemHash = item => normalizeHash(
  item?.contentSha256
  || item?.payload?.contentSha256
  || item?.payload?.contentHash
);

const actionsFor = item => {
  const actions = asArray(item?.allowedDecisions)
    .map(decision => compact(decision?.action))
    .filter(Boolean);
  return actions.length > 0 ? actions : defaultActions;
};

const pendingByClass = items => items.reduce((counts, item) => {
  const key = compact(item?.defectClass || item?.payload?.defectClass || 'unknown');
  return {
    ...counts,
    [key]: (counts[key] || 0) + 1
  };
}, {});

const decisionTemplateFor = item => {
  const defectType = compact(item?.defectType || item?.payload?.defectType);
  const defectClass = compact(item?.defectClass || item?.payload?.defectClass);
  const evidence = item?.evidence || {};
  return {
    queueId: compact(item?.queueId),
    contentSha256: itemHash(item),
    defectType,
    defectClass,
    action: 'pending',
    allowedActions: actionsFor(item),
    requiredFieldsByAction,
    approvedDefectType: defectType,
    manufacturingImageConfirmed: false,
    labelConfirmed: false,
    requestedViews: [],
    decidedAt: '',
    reviewComment: '',
    evidence: {
      sourceLabel: compact(evidence.sourceLabel || item?.payload?.sourceLabel),
      visionSuggestedLabel: compact(evidence.visionSuggestedLabel || item?.payload?.visionSuggestedLabel),
      visionConfidence: Number(evidence.visionConfidence ?? item?.payload?.visionConfidence ?? 0),
      visionSummary: compact(evidence.visionSummary || item?.payload?.visionSummary),
      reviewReasons: unique(evidence.reviewReasons || [])
    },
    source: {
      sourceKind: compact(item?.sourceKind || item?.payload?.sourceKind),
      relativePath: compact(item?.relativePath || item?.payload?.relativePath)
    },
    reviewerGuidance: '원본 이미지를 열어 결함 라벨과 제조 이미지 여부를 확인한 뒤 action, decidedAt, reviewComment를 채우세요.'
  };
};

const recommendedActionFor = status => ({
  missing_queue_packet: 'vision:hitl:pending-packet 명령으로 미해결 HITL queue packet을 먼저 생성하세요.',
  clear: '검토 대상 없음. 다른 readiness blocker를 확인하세요.',
  template_ready: '이 템플릿을 Common Agent/HITL 담당자가 채운 뒤 vision:hitl:verify-decisions로 검증하세요.'
}[status] || 'HITL decision template 상태를 확인하세요.');

const buildVisionPendingHitlDecisionTemplate = ({
  generatedAt = new Date().toISOString(),
  queuePacket = null,
  sourceArtifacts = {}
} = {}) => {
  const hasQueue = queuePacket && Array.isArray(queuePacket?.items);
  const queueItems = hasQueue ? asArray(queuePacket.items) : [];
  const status = !hasQueue
    ? 'missing_queue_packet'
    : queueItems.length > 0 ? 'template_ready' : 'clear';
  const decisions = status === 'template_ready'
    ? queueItems.map(decisionTemplateFor)
    : [];

  return {
    schemaVersion: 1,
    contractVersion: 'common-agent-hitl-review-decisions/v1',
    templateVersion: 'common-agent-hitl-review-decisions-template/v1',
    generatedAt,
    sourceSystem: 'mold-master-ai',
    targetSystem: 'common-agent',
    status,
    reviewer: {
      id: '',
      name: ''
    },
    reviewedAt: '',
    serviceWritesPerformed: false,
    localArtifactsWritten: true,
    policy: {
      requiresHumanReview: true,
      autoApplyAllowed: false,
      allowGraphPromotion: false,
      allowReferenceLearning: false,
      allowModelTraining: false
    },
    instructions: [
      '각 queue item의 원본 이미지를 직접 열어 제조 이미지와 결함 라벨을 확인하세요.',
      '승인하려면 action=approve_candidate, manufacturingImageConfirmed=true, labelConfirmed=true, approvedDefectType, decidedAt, reviewComment를 채우세요.',
      '근거가 부족하면 mark_needs_review, 부적합하면 reject_candidate, 추가 촬영이 필요하면 request_recapture를 선택하세요.',
      '작성 후 npm run vision:hitl:verify-decisions -- --decisions <작성파일> 로 검증하세요.',
      '이 템플릿은 자동 승인, Graph 승격, Reference 학습, SQL 쓰기를 수행하지 않습니다.'
    ],
    summary: {
      queueItems: queueItems.length,
      decisionsPrepared: decisions.length,
      pendingByClass: queuePacket?.summary?.pendingByClass || pendingByClass(queueItems)
    },
    verification: {
      command: 'npm run vision:hitl:verify-decisions -- --decisions <filled-common-agent-hitl-decisions.json>',
      expectedContractVersion: 'vision-pending-hitl-decision-verification-report/v1'
    },
    decisions,
    sources: {
      queuePacket: sourceArtifacts.queuePacket || null
    },
    recommendedAction: recommendedActionFor(status)
  };
};

module.exports = {
  buildVisionPendingHitlDecisionTemplate,
  requiredFieldsByAction
};
