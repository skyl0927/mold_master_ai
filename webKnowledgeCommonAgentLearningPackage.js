const crypto = require('node:crypto');

const asArray = value => Array.isArray(value) ? value : [];

const compact = value => String(value || '').replace(/\s+/g, ' ').trim();

const unique = values => [...new Set(asArray(values).map(compact).filter(Boolean))];

const WEB_READINESS_CONTRACT = 'web-knowledge-operational-readiness/v1';
const WEB_VERIFICATION_CONTRACT = 'web-knowledge-hitl-decision-verification-report/v1';

const sha256 = value => crypto.createHash('sha256').update(String(value || '')).digest('hex');

const emptyPayload = () => ({
  approvedKnowledgeItems: [],
  tacitKnowledgeTemplate: {
    document_id: '',
    source_system: 'mold-master-ai',
    file_name: 'web-knowledge-common-agent-learning-candidates.json',
    mime_type: 'application/vnd.common-agent.tacit-template+json',
    title: '사출 성형 결함 Web Case 승인 후보',
    items: [],
    metadata: {
      review_status: 'empty',
      requires_common_agent_human_review: true,
      automatic_service_writes_allowed: false
    }
  },
  graphRoundtripCases: []
});

const policy = () => ({
  requiresHumanReview: true,
  automaticServiceWritesAllowed: false,
  manualImportRequiresOperatorApproval: true,
  allowCentralIngestionWithoutCommonAgentReview: false,
  allowGraphPromotion: false,
  allowReferenceLearning: false,
  allowModelTraining: false,
  graphPromotionMode: 'disabled_until_common_agent_central_approval',
  modelTrainingMode: 'disabled_until_post_import_roundtrip_passes'
});

const readinessGatePassed = (readiness, gateName) =>
  readiness?.gates?.[gateName]?.passed === true;

const verificationUpdates = verificationReport =>
  asArray(verificationReport?.importPlan?.localLedgerUpdates);

const approvedUpdates = verificationReport =>
  verificationUpdates(verificationReport)
    .filter(update => compact(update?.decision) === 'approved');

const nonApprovedUpdates = verificationReport =>
  verificationUpdates(verificationReport)
    .filter(update => compact(update?.decision) !== 'approved');

const statusFor = ({ readiness, verificationReport }) => {
  if (!readiness || readiness.contractVersion !== WEB_READINESS_CONTRACT) {
    return 'missing_readiness';
  }
  if (readiness.serviceWritesPerformed === true) return 'unsafe_readiness';
  if (!verificationReport || verificationReport.contractVersion !== WEB_VERIFICATION_CONTRACT) {
    return 'invalid_verification_report';
  }
  if (verificationReport.serviceWritesPerformed === true) return 'unsafe_verification_report';
  if (verificationReport.status !== 'ready_for_local_hitl_import') {
    return 'blocked_verification_not_ready';
  }
  if (
    !readinessGatePassed(readiness, 'collection')
    || !readinessGatePassed(readiness, 'qualityAudit')
    || !readinessGatePassed(readiness, 'commonAgentValidation')
  ) {
    return 'blocked_pre_hitl_gates_incomplete';
  }
  if (!readinessGatePassed(readiness, 'localHitl')) {
    return 'blocked_local_hitl_incomplete';
  }
  if (
    readiness.status === 'ready_for_graph_roundtrip'
    || readiness.readyForGraphRoundtrip === true
    || readinessGatePassed(readiness, 'centralApproval')
  ) {
    return 'ready_for_graph_roundtrip_validation';
  }
  return 'ready_for_common_agent_manual_import';
};

const readyForPayload = status =>
  status === 'ready_for_common_agent_manual_import'
  || status === 'ready_for_graph_roundtrip_validation';

const knowledgeItemFor = ({ update, sourceArtifact }) => ({
  sourceQueue: 'web_knowledge_hitl',
  commonAgentAction: 'stage_web_knowledge_candidate',
  caseId: compact(update.caseId),
  sourceContentSha256: compact(update.sourceContentSha256).toLowerCase(),
  defectName: compact(update.defectName),
  problem: compact(update.problem),
  phenomenon: compact(update.phenomenon),
  rootCauseCandidates: unique(update.causeCandidates),
  causeLabels: unique(update.causeLabels),
  checkItems: unique(update.checkItems),
  countermeasures: unique(update.actions),
  reviewerId: compact(update.reviewer),
  reviewComment: compact(update.reviewerComment),
  decidedAt: compact(update.decidedAt),
  requiresCommonAgentHumanReview: true,
  centralIngestionAllowed: false,
  graphPromotionAllowed: false,
  referenceLearningAllowed: false,
  modelTrainingAllowed: false,
  provenance: {
    sourceSystem: 'mold-master-ai',
    sourceVerificationArtifact: sourceArtifact || null,
    sourceDecision: compact(update.decision),
    sourceContentSha256: compact(update.sourceContentSha256).toLowerCase(),
    reviewerId: compact(update.reviewer),
    decidedAt: compact(update.decidedAt)
  }
});

const templateItemFor = (item, index) => ({
  item_id: item.caseId,
  no: index + 1,
  process_area: '사출 성형',
  problem: item.problem,
  phenomenon: item.phenomenon,
  defect_type: item.defectName,
  cause_candidates: item.rootCauseCandidates,
  cause_labels: item.causeLabels,
  check_items: item.checkItems,
  actions: item.countermeasures,
  labels: unique(['사출 성형', item.defectName, ...item.causeLabels]),
  reviewer_comment: item.reviewComment,
  metadata: {
    source_queue: item.sourceQueue,
    source_content_sha256: item.sourceContentSha256,
    local_hitl_status: 'approved',
    local_hitl_reviewer: item.reviewerId,
    local_hitl_reviewed_at: item.decidedAt,
    requires_common_agent_human_review: true,
    graph_promotion_allowed: false,
    reference_learning_allowed: false,
    model_training_allowed: false
  }
});

const tacitTemplateFor = ({ generatedAt, items, sourceArtifacts }) => {
  const documentId = `web-hitl-learning-${sha256(`${generatedAt}:${items.length}`).slice(0, 12)}`;
  return {
    document_id: documentId,
    source_system: 'mold-master-ai',
    file_name: `${documentId}.json`,
    mime_type: 'application/vnd.common-agent.tacit-template+json',
    source_uri: `mold-master://web-knowledge/hitl-learning/${documentId}`,
    title: '사출 성형 결함 Web Case 승인 후보',
    project: 'mold-master-ai',
    process_area: '사출 성형',
    metadata: {
      generated_at: generatedAt,
      review_status: 'candidate',
      local_hitl_approved: true,
      requires_common_agent_human_review: true,
      auto_approval_allowed: false,
      graph_promotion_allowed_before_review: false,
      source_readiness_artifact: sourceArtifacts.readiness || null,
      source_verification_artifact: sourceArtifacts.verificationReport || null
    },
    items: items.map(templateItemFor)
  };
};

const slug = value => compact(value)
  .toLowerCase()
  .replace(/[^0-9a-z가-힣_-]+/gi, '-')
  .replace(/^-+|-+$/g, '')
  || 'case';

const graphQuestionFor = item => {
  const context = item.phenomenon || item.problem || `${item.defectName} 현상`;
  return `${context} 발생 시 승인된 Graph 근거만 사용해서 ${item.defectName}의 원인, 확인 항목, 대책을 간결하게 답변하세요.`;
};

const graphRoundtripCaseFor = item => ({
  id: `graph-${slug(item.caseId || item.defectName)}`,
  testType: 'graph_rag_answer_grounding',
  priority: 'high',
  questionKo: graphQuestionFor(item),
  expectedDefectName: item.defectName,
  expectedEvidenceKeywords: unique([
    item.defectName,
    ...item.rootCauseCandidates,
    ...item.countermeasures
  ]).slice(0, 6),
  commonAgentRequest: {
    endpoint: '/v1/ask',
    method: 'POST',
    question: graphQuestionFor(item),
    top_k: 8,
    filters: {
      include_rag: true,
      include_reasoning_paths: true,
      include_knowledge_graph: true,
      include_knowledge_relations: true,
      evidence_policy: 'graph_approved_only',
      source_app: 'mold-master-ai',
      validation_case_id: `graph-${slug(item.caseId || item.defectName)}`
    }
  },
  acceptanceCriteria: [
    'Graph citation 또는 reasoning path가 1개 이상 있어야 합니다.',
    '답변 원인에는 승인된 rootCauseCandidates 중 1개 이상이 반영되어야 합니다.',
    '답변 대책에는 승인된 countermeasures 중 1개 이상이 반영되어야 합니다.',
    'candidate, pending, rejected 근거를 사용하면 실패입니다.'
  ],
  provenance: item.provenance
});

const payloadFor = ({ generatedAt, verificationReport, sourceArtifacts }) => {
  const sourceArtifact = sourceArtifacts.verificationReport
    || verificationReport?.sources?.decisionPacket
    || null;
  const approvedItems = approvedUpdates(verificationReport).map(update =>
    knowledgeItemFor({ update, sourceArtifact })
  );
  return {
    approvedKnowledgeItems: approvedItems,
    tacitKnowledgeTemplate: tacitTemplateFor({
      generatedAt,
      items: approvedItems,
      sourceArtifacts
    }),
    graphRoundtripCases: approvedItems.map(graphRoundtripCaseFor)
  };
};

const summaryFor = ({ status, verificationReport, payload, readiness }) => {
  const hasPayload = readyForPayload(status);
  return {
    targetCardCount: Number(readiness?.summary?.targetCardCount) || 40,
    approvedHitlCards: Number(readiness?.summary?.approvedHitlCards) || 0,
    centralIngestedCandidates: Number(readiness?.summary?.centralIngestedCandidates) || 0,
    centralApprovedDocuments: Number(readiness?.summary?.centralApprovedDocuments) || 0,
    approvedSourceRows: hasPayload ? approvedUpdates(verificationReport).length : 0,
    nonApprovedRows: hasPayload ? nonApprovedUpdates(verificationReport).length : 0,
    packagedKnowledgeItems: payload.approvedKnowledgeItems.length,
    graphRoundtripCases: payload.graphRoundtripCases.length
  };
};

const recommendedActionFor = status => ({
  missing_readiness: '먼저 npm run knowledge:web:readiness로 Web Knowledge 운영 readiness를 생성하세요.',
  unsafe_readiness: 'serviceWritesPerformed=true readiness artifact는 폐기하고 no-write 상태로 다시 생성하세요.',
  invalid_verification_report: 'Web Case HITL decision verification report를 다시 생성하세요.',
  unsafe_verification_report: 'serviceWritesPerformed=true verification report는 패키징하지 않습니다. no-write 검증 artifact로 다시 생성하세요.',
  blocked_verification_not_ready: 'Common Agent/Web HITL decision 파일을 완성하고 knowledge:web:hitl:verify-decisions를 통과시키세요.',
  blocked_pre_hitl_gates_incomplete: '수집, 품질 audit, Common Agent 비저장 검증 gate를 먼저 통과시키세요.',
  blocked_local_hitl_incomplete: 'Web Case HITL 승인 목표 수를 먼저 채우세요.',
  ready_for_common_agent_manual_import: '승인된 Web Case 후보만 Common Agent 수동 import 검토로 넘기세요. 자동 Graph/학습 반영은 계속 금지됩니다.',
  ready_for_graph_roundtrip_validation: 'Common Agent 중앙 승인까지 끝났습니다. graph_approved_only 왕복 검증을 실행하세요.'
}[status] || 'Web Knowledge Common Agent 패키지 상태를 확인하세요.');

const buildWebKnowledgeCommonAgentLearningPackage = ({
  generatedAt = new Date().toISOString(),
  readiness = null,
  verificationReport = null,
  sourceArtifacts = {}
} = {}) => {
  const status = statusFor({ readiness, verificationReport });
  const payload = readyForPayload(status)
    ? payloadFor({ generatedAt, verificationReport, sourceArtifacts })
    : emptyPayload();
  const summary = summaryFor({ status, verificationReport, payload, readiness });

  return {
    schemaVersion: 1,
    contractVersion: 'web-knowledge-common-agent-learning-package/v1',
    generatedAt,
    sourceSystem: 'mold-master-ai',
    targetSystem: 'common_agent',
    deliveryMode: 'artifact_only',
    status,
    manualImportAllowed: status === 'ready_for_common_agent_manual_import',
    readyForGraphRoundtripValidation: status === 'ready_for_graph_roundtrip_validation',
    serviceWritesPerformed: false,
    localArtifactsWritten: true,
    policy: policy(),
    summary,
    payload,
    commonAgentReviewRequest: {
      reviewType: 'web_knowledge_learning_candidate_import',
      requestedAction: status === 'ready_for_graph_roundtrip_validation'
        ? 'run_graph_approved_only_roundtrip'
        : status === 'ready_for_common_agent_manual_import'
          ? 'manual_candidate_import_review'
          : 'complete_web_knowledge_hitl_gates',
      requiresHumanReview: true,
      allowGraphPromotion: false,
      allowReferenceLearning: false,
      allowModelTraining: false,
      itemCount: payload.approvedKnowledgeItems.length
    },
    sources: {
      readiness: sourceArtifacts.readiness || null,
      verificationReport: sourceArtifacts.verificationReport || null,
      collectionRoot: readiness?.sources?.collectionRoot || verificationReport?.sources?.collectionRoot || null,
      reviewLedger: readiness?.sources?.reviewLedger || verificationReport?.sources?.reviewLedger || null,
      decisionPacket: verificationReport?.sources?.decisionPacket || null
    },
    recommendedAction: recommendedActionFor(status)
  };
};

module.exports = {
  buildWebKnowledgeCommonAgentLearningPackage
};
