const asArray = value => Array.isArray(value) ? value : [];
const compact = value => String(value || '').replace(/\s+/g, ' ').trim();
const normalizeHash = value => compact(value).toLowerCase();

const nonApprovalGroups = [
  ['mark_needs_review', 'needsReviewItems'],
  ['reject_candidate', 'rejectedCandidates'],
  ['request_recapture', 'recaptureRequests']
];

const policy = () => ({
  requiresHumanReview: true,
  autoApplyAllowed: false,
  allowGraphPromotion: false,
  allowReferenceLearning: false,
  allowModelTraining: false
});

const ownerFor = action => ({
  mark_needs_review: 'quality_hitl',
  reject_candidate: 'dataset_curator',
  request_recapture: 'quality_capture'
}[action] || 'quality_hitl');

const nextActionFor = action => ({
  mark_needs_review: 'review_with_additional_context',
  reject_candidate: 'exclude_from_reference_learning',
  request_recapture: 'capture_requested_views'
}[action] || 'review_manually');

const titleFor = action => ({
  mark_needs_review: '추가 근거 검토',
  reject_candidate: 'Vision 후보 반려 반영',
  request_recapture: '재촬영 요청 처리'
}[action] || 'Vision HITL 비승인 조치');

const normalizeRequestedViews = decision =>
  [...new Set(asArray(decision?.requestedViews).map(compact).filter(Boolean))];

const itemFor = ({ action, decision, index }) => ({
  workItemId: `vision-non-approval-${String(index + 1).padStart(3, '0')}`,
  queueId: compact(decision?.queueId),
  contentSha256: normalizeHash(decision?.contentSha256),
  action,
  owner: ownerFor(action),
  titleKo: titleFor(action),
  nextAction: nextActionFor(action),
  defectType: compact(decision?.defectType),
  defectClass: compact(decision?.defectClass),
  reviewerId: compact(decision?.reviewerId),
  reviewComment: compact(decision?.reviewComment),
  decidedAt: compact(decision?.decidedAt),
  requestedViews: normalizeRequestedViews(decision),
  requiresHumanReview: true,
  autoApplyAllowed: false,
  graphPromotionAllowed: false,
  referenceLearningAllowed: false,
  modelTrainingAllowed: false
});

const countBy = (items, key) => Object.fromEntries(
  [...new Set(items.map(item => compact(item?.[key])).filter(Boolean))]
    .sort()
    .map(value => [value, items.filter(item => compact(item?.[key]) === value).length])
);

const handoffFor = items => ({
  contractVersion: 'vision-pending-hitl-non-approval-handoff/v1',
  requestedAction: items.length > 0
    ? 'process_vision_hitl_non_approval_decisions'
    : 'no_non_approval_action_required',
  policy: {
    requiresHumanReview: true,
    allowGraphPromotion: false,
    allowReferenceLearning: false,
    allowModelTraining: false
  },
  items: items.map(item => ({
    workItemId: item.workItemId,
    queueId: item.queueId,
    contentSha256: item.contentSha256,
    action: item.action,
    owner: item.owner,
    nextAction: item.nextAction,
    defectType: item.defectType,
    defectClass: item.defectClass,
    requestedViews: item.requestedViews
  }))
});

const sourcesFor = (decisionVerificationReport, sourceArtifacts = {}) => ({
  decisionVerificationReport: sourceArtifacts.decisionVerificationReport || null,
  queuePacket: sourceArtifacts.queuePacket || decisionVerificationReport?.sources?.queuePacket || null,
  decisionPacket: sourceArtifacts.decisionPacket || decisionVerificationReport?.sources?.decisionPacket || null
});

const summarize = ({ status, items, report, blockingStatus = '' }) => ({
  totalItems: items.length,
  approvalCandidatesExcluded: asArray(report?.importPlan?.approvalCandidates).length,
  needsReviewItems: items.filter(item => item.action === 'mark_needs_review').length,
  rejectedCandidates: items.filter(item => item.action === 'reject_candidate').length,
  recaptureRequests: items.filter(item => item.action === 'request_recapture').length,
  itemsByAction: countBy(items, 'action'),
  itemsByClass: countBy(items, 'defectClass'),
  ...(blockingStatus ? { blockingStatus } : {}),
  status
});

const recommendedActionFor = (status, items) => ({
  missing_decision_verification_report: 'vision:hitl:verify-decisions 보고서를 먼저 생성하세요.',
  not_ready_for_non_approval_worklist: 'Common Agent/HITL 판정을 모두 닫고 ready_for_manual_import 상태로 검증한 뒤 다시 실행하세요.',
  clear: '비승인 HITL 조치가 없습니다. 승인 후보가 있으면 authorization bridge 절차를 진행하세요.',
  action_required: `비승인 HITL 조치 ${items.length}건을 담당자별로 처리하세요. 이 worklist는 Graph 승격과 Reference 학습을 수행하지 않습니다.`
}[status] || 'Vision HITL 비승인 조치 상태를 확인하세요.');

const baseWorklist = ({
  generatedAt,
  status,
  items,
  decisionVerificationReport,
  sourceArtifacts,
  blockingStatus = ''
}) => ({
  schemaVersion: 1,
  contractVersion: 'vision-pending-hitl-non-approval-worklist/v1',
  generatedAt,
  sourceSystem: 'mold-master-ai',
  targetSystem: 'common-agent',
  status,
  serviceWritesPerformed: false,
  localArtifactsWritten: true,
  policy: policy(),
  summary: summarize({
    status,
    items,
    report: decisionVerificationReport,
    blockingStatus
  }),
  items,
  commonAgentHandoff: handoffFor(items),
  sources: sourcesFor(decisionVerificationReport, sourceArtifacts),
  recommendedAction: recommendedActionFor(status, items)
});

const buildVisionPendingHitlNonApprovalWorklist = ({
  generatedAt = new Date().toISOString(),
  decisionVerificationReport = null,
  sourceArtifacts = {}
} = {}) => {
  if (
    decisionVerificationReport?.contractVersion
      !== 'vision-pending-hitl-decision-verification-report/v1'
  ) {
    return baseWorklist({
      generatedAt,
      status: 'missing_decision_verification_report',
      items: [],
      decisionVerificationReport,
      sourceArtifacts
    });
  }

  if (compact(decisionVerificationReport.status) !== 'ready_for_manual_import') {
    return baseWorklist({
      generatedAt,
      status: 'not_ready_for_non_approval_worklist',
      items: [],
      decisionVerificationReport,
      sourceArtifacts,
      blockingStatus: compact(decisionVerificationReport.status)
    });
  }

  let itemIndex = 0;
  const items = nonApprovalGroups.flatMap(([action, key]) =>
    asArray(decisionVerificationReport?.importPlan?.[key])
      .map(decision => itemFor({ action, decision, index: itemIndex++ }))
  );
  const status = items.length > 0 ? 'action_required' : 'clear';

  return baseWorklist({
    generatedAt,
    status,
    items,
    decisionVerificationReport,
    sourceArtifacts
  });
};

module.exports = {
  buildVisionPendingHitlNonApprovalWorklist
};
