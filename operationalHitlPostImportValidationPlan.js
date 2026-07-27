const asArray = value => Array.isArray(value) ? value : [];

const compact = value => String(value || '').replace(/\s+/g, ' ').trim();

const unique = values => [...new Set(asArray(values).map(compact).filter(Boolean))];

const REQUIRED_IMPORT_PACKAGE_CONTRACT = 'operational-hitl-common-agent-import-package/v1';

const policy = () => ({
  validationOnly: true,
  requiresHumanReview: true,
  automaticServiceWritesAllowed: false,
  autoApplyAllowed: false,
  allowGraphPromotion: false,
  allowReferenceLearning: false,
  allowModelTraining: false,
  requireApprovedGraphEvidence: true,
  requireReasoningPath: true
});

const emptySummary = () => ({
  missingArtifacts: 0,
  totalTestCases: 0,
  graphRagCases: 0,
  visionRoundtripCases: 0,
  labelConflictCases: 0,
  minimumPassRate: 85
});

const missingImportPackagePlan = (generatedAt, sourceArtifacts) => ({
  schemaVersion: 1,
  contractVersion: 'operational-hitl-post-import-validation-plan/v1',
  generatedAt,
  sourceSystem: 'mold-master-ai',
  targetSystem: 'mold_master_ai_common_agent_graph',
  deliveryMode: 'artifact_only',
  status: 'missing_import_package',
  serviceWritesPerformed: false,
  localArtifactsWritten: true,
  policy: policy(),
  summary: {
    ...emptySummary(),
    missingArtifacts: 1
  },
  blockingImportPackageStatus: null,
  testCases: [],
  recommendedCommands: [],
  sources: {
    importPackage: sourceArtifacts.importPackage || null
  },
  recommendedAction: '먼저 npm run operational:hitl:common-agent-import-package로 Common Agent import package를 생성하세요.'
});

const isReadyImportPackage = importPackage =>
  importPackage?.contractVersion === REQUIRED_IMPORT_PACKAGE_CONTRACT
  && importPackage?.status === 'ready_for_common_agent_review'
  && importPackage?.manualImportAllowed === true
  && importPackage?.serviceWritesPerformed !== true;

const slug = value => compact(value)
  .toLowerCase()
  .replace(/[^0-9a-z가-힣_-]+/gi, '-')
  .replace(/^-+|-+$/g, '')
  || 'case';

const expectedGraphKeywords = item => unique([
  item.defectName,
  ...asArray(item.rootCauseCandidates),
  ...asArray(item.countermeasures)
]).slice(0, 6);

const graphQuestionFor = item => {
  const defectName = compact(item.defectName) || '사출 성형 결함';
  const phenomenon = compact(item.phenomenon);
  const problem = compact(item.problem);
  const context = phenomenon || problem || `${defectName} 현상`;
  return `${context} 이 발생했습니다. Graph DB의 승인 근거만 사용해서 ${defectName}의 추정 원인과 확인 항목, 대책을 간결하게 작성해줘.`;
};

const graphRagCaseFor = item => ({
  id: `graph-${slug(item.caseId || item.defectName)}`,
  testType: 'graph_rag_answer_grounding',
  priority: 'high',
  questionKo: graphQuestionFor(item),
  expectedDefectName: compact(item.defectName),
  expectedEvidenceKeywords: expectedGraphKeywords(item),
  expectedAnswerSections: ['현상', '추정 원인', '확인 항목', '대책', '근거'],
  acceptanceCriteria: [
    '답변에는 Graph 근거 citation 또는 reasoning path가 1개 이상 있어야 한다.',
    '추정 원인에는 승인된 rootCauseCandidates 중 1개 이상이 반영되어야 한다.',
    '대책에는 승인된 countermeasures 중 1개 이상이 반영되어야 한다.',
    'candidate, pending, rejected 근거는 사용하면 안 된다.'
  ],
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
  provenance: {
    sourceQueue: compact(item.sourceQueue),
    sourceCaseId: compact(item.caseId),
    sourceContentSha256: compact(item.sourceContentSha256).toLowerCase(),
    sourceVerificationArtifact: compact(item.provenance?.sourceVerificationArtifact) || null,
    reviewerId: compact(item.reviewerId),
    decidedAt: compact(item.decidedAt)
  }
});

const visionRoundtripCaseFor = item => ({
  id: `vision-${slug(item.queueId || item.contentSha256)}`,
  testType: 'vision_label_roundtrip',
  priority: 'medium',
  questionKo: `${compact(item.defectType)}로 승인된 제조 이미지를 Common Agent dataset에서 조회했을 때 동일 라벨과 class가 유지되는지 확인한다.`,
  contentSha256: compact(item.contentSha256).toLowerCase(),
  expectedLabel: compact(item.defectType),
  expectedDefectClass: compact(item.defectClass),
  acceptanceCriteria: [
    'Common Agent dataset 또는 review export에서 동일 content hash가 approved 상태로 조회되어야 한다.',
    'expectedLabel과 expectedDefectClass가 승인 판정과 일치해야 한다.',
    'Graph/Reference/Model 승격은 별도 운영자 승인 전까지 금지된다.'
  ],
  commonAgentRequest: {
    endpoint: '/v1/datasets/images/export-yolo?review_status=approved',
    method: 'GET',
    expectedContentSha256: compact(item.contentSha256).toLowerCase(),
    expectedDefectClass: compact(item.defectClass)
  },
  provenance: {
    sourceQueue: 'vision_hitl',
    sourceQueueId: compact(item.queueId),
    reviewerId: compact(item.reviewerId),
    decidedAt: compact(item.decidedAt)
  }
});

const labelConflictCaseFor = item => ({
  id: `label-conflict-${slug(item.conflictId || item.contentHash)}`,
  testType: 'label_conflict_resolution_roundtrip',
  priority: 'medium',
  questionKo: `라벨 충돌 ${compact(item.conflictId)}에서 최종 라벨이 ${compact(item.selectedLabel)}로 유지되고 다른 후보 라벨은 학습 대상에서 제외되는지 확인한다.`,
  contentHash: compact(item.contentHash).toLowerCase(),
  affectedCaseIds: unique(item.affectedCaseIds),
  expectedLabel: compact(item.selectedLabel),
  rejectedLabels: unique(item.candidateLabels).filter(label => label !== compact(item.selectedLabel)),
  acceptanceCriteria: [
    '동일 이미지 또는 동일 conflict group의 active label은 expectedLabel 하나로 정리되어야 한다.',
    'rejectedLabels는 approved 학습 export 또는 Graph 근거로 노출되면 안 된다.',
    '충돌 해소 이력에는 reviewerId, reviewComment, decidedAt이 남아야 한다.'
  ],
  commonAgentRequest: {
    endpoint: '/v1/datasets/images/export-yolo?review_status=approved',
    method: 'GET',
    expectedLabel: compact(item.selectedLabel),
    affectedCaseIds: unique(item.affectedCaseIds)
  },
  provenance: {
    sourceQueue: 'label_conflicts',
    sourceConflictId: compact(item.conflictId),
    reviewerId: compact(item.reviewerId),
    decidedAt: compact(item.decidedAt)
  }
});

const testCasesFor = importPackage => [
  ...asArray(importPackage?.payloads?.graphKnowledgeCandidates).map(graphRagCaseFor),
  ...asArray(importPackage?.payloads?.visionApprovalCandidates).map(visionRoundtripCaseFor),
  ...asArray(importPackage?.payloads?.labelConflictResolutions).map(labelConflictCaseFor)
];

const summaryFor = testCases => ({
  ...emptySummary(),
  totalTestCases: testCases.length,
  graphRagCases: testCases.filter(item => item.testType === 'graph_rag_answer_grounding').length,
  visionRoundtripCases: testCases.filter(item => item.testType === 'vision_label_roundtrip').length,
  labelConflictCases: testCases.filter(item => item.testType === 'label_conflict_resolution_roundtrip').length
});

const markdownFor = (plan) => {
  const lines = [
    '# Operational HITL Post-Import Validation Plan',
    '',
    `- 생성 시각: ${plan.generatedAt}`,
    `- 상태: ${plan.status}`,
    `- 테스트 케이스: ${plan.summary.totalTestCases}`,
    `- Graph RAG: ${plan.summary.graphRagCases}`,
    `- Vision 라벨 왕복: ${plan.summary.visionRoundtripCases}`,
    `- 라벨 충돌 해소: ${plan.summary.labelConflictCases}`,
    '- 안전 정책: 검증 전용, 자동 쓰기 금지, Graph/Reference/Model 승격 금지',
    ''
  ];

  if (plan.testCases.length === 0) {
    lines.push('## 차단 상태', '', plan.recommendedAction, '');
    return `${lines.join('\n')}\n`;
  }

  lines.push('| ID | Type | Priority | Expected | Question |', '|---|---|---|---|---|');
  plan.testCases.forEach(item => {
    const expected = compact(item.expectedDefectName || item.expectedLabel || item.expectedDefectClass);
    const question = compact(item.questionKo).replace(/\|/g, '/');
    lines.push(`| ${item.id} | ${item.testType} | ${item.priority} | ${expected} | ${question} |`);
  });
  lines.push('', '## 권장 검증 명령', '');
  plan.recommendedCommands.forEach(command => {
    lines.push('```powershell', command, '```', '');
  });
  return `${lines.join('\n')}\n`;
};

const buildOperationalHitlPostImportValidationPlan = ({
  generatedAt = new Date().toISOString(),
  importPackage = null,
  sourceArtifacts = {}
} = {}) => {
  if (!importPackage || importPackage.contractVersion !== REQUIRED_IMPORT_PACKAGE_CONTRACT) {
    return missingImportPackagePlan(generatedAt, sourceArtifacts);
  }

  if (!isReadyImportPackage(importPackage)) {
    const plan = {
      schemaVersion: 1,
      contractVersion: 'operational-hitl-post-import-validation-plan/v1',
      generatedAt,
      sourceSystem: 'mold-master-ai',
      targetSystem: 'mold_master_ai_common_agent_graph',
      deliveryMode: 'artifact_only',
      status: 'blocked_import_package_not_ready',
      serviceWritesPerformed: false,
      localArtifactsWritten: true,
      policy: policy(),
      summary: emptySummary(),
      blockingImportPackageStatus: compact(importPackage.status),
      testCases: [],
      recommendedCommands: ['npm run operational:hitl:common-agent-import-package'],
      sources: {
        importPackage: sourceArtifacts.importPackage || null
      },
      recommendedAction: 'Common Agent import package가 ready_for_common_agent_review 상태가 될 때까지 HITL 판정과 검증을 먼저 완료하세요.'
    };
    return {
      ...plan,
      markdown: markdownFor(plan)
    };
  }

  const testCases = testCasesFor(importPackage);
  const plan = {
    schemaVersion: 1,
    contractVersion: 'operational-hitl-post-import-validation-plan/v1',
    generatedAt,
    sourceSystem: 'mold-master-ai',
    targetSystem: 'mold_master_ai_common_agent_graph',
    deliveryMode: 'artifact_only',
    status: 'ready_for_post_import_validation',
    serviceWritesPerformed: false,
    localArtifactsWritten: true,
    policy: policy(),
    summary: summaryFor(testCases),
    blockingImportPackageStatus: null,
    testCases,
    recommendedCommands: [
      'npm run eval:graph',
      'npm run test:electron:multimodal',
      'npm run operational:progress'
    ],
    sources: {
      importPackage: sourceArtifacts.importPackage || null,
      labelConflictVerification: importPackage.sources?.labelConflictVerification || null,
      visionHitlVerification: importPackage.sources?.visionHitlVerification || null,
      webKnowledgeVerification: importPackage.sources?.webKnowledgeVerification || null
    },
    recommendedAction: 'Common Agent에 승인 payload를 수동 반영한 뒤 이 테스트 케이스로 Mold Master AI의 Graph 근거 답변, Vision 라벨 유지, 라벨 충돌 해소를 검증하세요.'
  };
  return {
    ...plan,
    markdown: markdownFor(plan)
  };
};

module.exports = {
  buildOperationalHitlPostImportValidationPlan
};
