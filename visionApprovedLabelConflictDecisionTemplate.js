const asArray = value => Array.isArray(value) ? value : [];

const compact = value => String(value || '').replace(/\s+/g, ' ').trim();

const unique = values => [...new Set(values.map(compact).filter(Boolean))];

const defaultActions = [
  'keep_label',
  'mark_needs_review',
  'reject_conflicting_cases',
  'request_recapture'
];

const requiredFieldsByAction = {
  keep_label: [
    'action',
    'selectedLabel',
    'imageSetConfirmed',
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
  reject_conflicting_cases: [
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

const actionsFor = conflict => {
  const actions = asArray(conflict?.decisionOptions)
    .map(option => compact(option?.action))
    .filter(Boolean);
  return actions.length > 0 ? unique(actions) : defaultActions;
};

const conflictsByType = conflicts => conflicts.reduce((counts, conflict) => {
  const key = compact(conflict?.conflictType || 'unknown');
  return {
    ...counts,
    [key]: (counts[key] || 0) + 1
  };
}, {});

const decisionTemplateFor = conflict => ({
  conflictId: compact(conflict?.conflictId),
  contentHash: compact(conflict?.contentHash).toLowerCase(),
  affectedCaseIds: unique(conflict?.affectedCaseIds || []),
  candidateLabels: unique(conflict?.candidateLabels || []),
  conflictType: compact(conflict?.conflictType),
  action: 'pending',
  allowedActions: actionsFor(conflict),
  requiredFieldsByAction,
  selectedLabel: '',
  imageSetConfirmed: false,
  labelConfirmed: false,
  requestedViews: [],
  decidedAt: '',
  reviewComment: '',
  evidence: {
    decisionOptions: asArray(conflict?.decisionOptions).map(option => ({
      action: compact(option?.action),
      label: compact(option?.label),
      result: compact(option?.result)
    })).filter(option => option.action)
  },
  reviewerGuidance: '원본 이미지/동일 hash 그룹을 사람이 확인한 뒤 정답 라벨 유지, needs_review, rejected, 재촬영 중 하나를 선택하세요. 이 템플릿은 자동 승격, Graph 쓰기, Reference 학습을 수행하지 않습니다.'
});

const recommendedActionFor = status => ({
  missing_conflict_packet: 'vision:label-conflicts:packet 명령으로 승인 라벨 충돌 검토 패킷을 먼저 생성하세요.',
  clear: '승인 라벨 충돌 없음. 다음 readiness blocker를 확인하세요.',
  template_ready: '이 템플릿을 품질/HITL 담당자가 채운 뒤 vision:label-conflicts:verify-decisions로 검증하세요.'
}[status] || '승인 라벨 충돌 decision template 상태를 확인하세요.');

const buildVisionApprovedLabelConflictDecisionTemplate = ({
  generatedAt = new Date().toISOString(),
  conflictPacket = null,
  sourceArtifacts = {}
} = {}) => {
  const hasConflictPacket = conflictPacket
    && conflictPacket.contractVersion === 'vision-approved-label-conflict-review-packet/v1'
    && Array.isArray(conflictPacket.conflicts);
  const conflicts = hasConflictPacket ? asArray(conflictPacket.conflicts) : [];
  const status = !hasConflictPacket
    ? 'missing_conflict_packet'
    : conflicts.length > 0 ? 'template_ready' : 'clear';
  const decisions = status === 'template_ready'
    ? conflicts.map(decisionTemplateFor)
    : [];

  return {
    schemaVersion: 1,
    contractVersion: 'vision-approved-label-conflict-decisions/v1',
    templateVersion: 'vision-approved-label-conflict-decisions-template/v1',
    generatedAt,
    sourceSystem: 'mold-master-ai',
    targetSystem: 'quality_hitl',
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
      '각 충돌 그룹의 원본 이미지와 동일 hash 여부를 사람이 직접 확인하세요.',
      '정답 라벨을 확정하려면 action=keep_label, selectedLabel, imageSetConfirmed=true, labelConfirmed=true, decidedAt, reviewComment를 채우세요.',
      '근거가 부족하면 mark_needs_review, 부적합하면 reject_conflicting_cases, 추가 촬영이 필요하면 request_recapture를 선택하세요.',
      '작성 후 npm run vision:label-conflicts:verify-decisions -- --decisions <작성파일> 로 검증하세요.',
      '이 템플릿은 자동 승인, Graph 승격, Reference 학습, SQL 쓰기를 수행하지 않습니다.'
    ],
    summary: {
      conflicts: conflicts.length,
      decisionsPrepared: decisions.length,
      conflictsByType: conflictsByType(conflicts)
    },
    verification: {
      command: 'npm run vision:label-conflicts:verify-decisions -- --decisions <filled-vision-label-conflict-decisions.json>',
      expectedContractVersion: 'vision-approved-label-conflict-decision-verification-report/v1'
    },
    decisions,
    sources: {
      conflictPacket: sourceArtifacts.conflictPacket || null
    },
    recommendedAction: recommendedActionFor(status)
  };
};

module.exports = {
  buildVisionApprovedLabelConflictDecisionTemplate,
  requiredFieldsByAction
};
