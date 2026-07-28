const asArray = value => Array.isArray(value) ? value : [];

const compact = value => String(value || '').replace(/\s+/g, ' ').trim();

const unique = values => [...new Set(values.map(compact).filter(Boolean))];

const labelAliases = {
  플로우마크: ['플로우마크', '흐름 자국', 'flow mark', 'flow_mark'],
  '흐름 자국': ['플로우마크', '흐름 자국', 'flow mark', 'flow_mark'],
  웰드라인: ['웰드라인', '웰드 라인', 'weld line', 'weld_line'],
  제팅: ['제팅', 'jetting'],
  백화: ['백화', 'whitening'],
  플래시: ['플래시', '버', '바리', 'flash'],
  수축: ['수축', '싱크', '싱크마크', 'sink'],
  '밀핀 자국': ['밀핀 자국', '이젝터 자국', 'ejection'],
  '표면 긁힘': ['표면 긁힘', '스크래치', 'scratch'],
  '표면 결함': ['표면 결함']
};

const normalizedLabelSet = label => new Set(
  unique([label, ...(labelAliases[compact(label)] || [])]).map(item => item.toLowerCase())
);

const labelMatches = (candidateLabel, observedLabel) => {
  const observed = compact(observedLabel).toLowerCase();
  return Boolean(observed) && normalizedLabelSet(candidateLabel).has(observed);
};

const evidenceCasesFor = decision => asArray(decision?.evidence?.caseEvidence);

const isCaptureProtocolRisk = evidence => {
  const capture = evidence?.captureProtocol || {};
  return compact(capture.imageKind) === 'unknown'
    || capture.roiConfirmed !== true
    || asArray(capture.availableViews).length === 0;
};

const riskFlagsFor = ({ decision, evidenceCases }) => {
  const flags = [];
  if (compact(decision?.conflictType) === 'same_hash_multi_label') {
    flags.push('same_hash_multi_label');
  }
  if (evidenceCases.some(evidence => evidence?.manifestListed === false)) {
    flags.push('manifest_unlisted_fixture');
  }
  if (evidenceCases.some(evidence =>
    compact(evidence?.expectedDefectType)
    && compact(evidence?.sourceReview?.originalVisionDefectType)
    && !labelMatches(evidence.expectedDefectType, evidence.sourceReview.originalVisionDefectType)
  )) {
    flags.push('approved_vs_vision_disagreement');
  }
  if (evidenceCases.some(isCaptureProtocolRisk)) {
    flags.push('capture_protocol_incomplete');
  }
  if (evidenceCases.some(evidence => evidence?.fixtureFound === false)) {
    flags.push('fixture_missing');
  }
  return flags;
};

const evidenceMatrixRow = evidence => ({
  caseId: compact(evidence?.caseId),
  fixtureFound: evidence?.fixtureFound === true,
  manifestListed: evidence?.manifestListed === true,
  manifestStatus: compact(evidence?.manifestStatus),
  fixtureFile: compact(evidence?.fixtureFile),
  fileName: compact(evidence?.fileName),
  expectedDefectType: compact(evidence?.expectedDefectType),
  expectedDefectClass: compact(evidence?.expectedDefectClass),
  priorObservationDefectType: compact(evidence?.sourceReview?.priorObservationDefectType),
  originalVisionDefectType: compact(evidence?.sourceReview?.originalVisionDefectType),
  priorObservationSummary: compact(evidence?.sourceReview?.priorObservationSummary),
  imageKind: compact(evidence?.captureProtocol?.imageKind || 'unknown') || 'unknown',
  roiConfirmed: evidence?.captureProtocol?.roiConfirmed === true,
  availableViews: unique(evidence?.captureProtocol?.availableViews || []),
  humanReviewFocusKo: compact(evidence?.humanReviewFocusKo)
});

const labelEvidenceFor = (candidateLabels, evidenceCases) => candidateLabels.map(label => ({
  label,
  expectedLabelCases: evidenceCases
    .filter(evidence => labelMatches(label, evidence?.expectedDefectType))
    .map(evidence => compact(evidence.caseId))
    .filter(Boolean),
  priorObservationCases: evidenceCases
    .filter(evidence => labelMatches(label, evidence?.sourceReview?.priorObservationDefectType))
    .map(evidence => compact(evidence.caseId))
    .filter(Boolean),
  visionLabelCases: evidenceCases
    .filter(evidence => labelMatches(label, evidence?.sourceReview?.originalVisionDefectType))
    .map(evidence => compact(evidence.caseId))
    .filter(Boolean),
  sourceSummaries: evidenceCases
    .filter(evidence =>
      labelMatches(label, evidence?.expectedDefectType)
      || labelMatches(label, evidence?.sourceReview?.priorObservationDefectType)
      || labelMatches(label, evidence?.sourceReview?.originalVisionDefectType)
    )
    .map(evidence => ({
      caseId: compact(evidence.caseId),
      summary: compact(evidence?.sourceReview?.priorObservationSummary)
    }))
    .filter(item => item.caseId)
}));

const checklistFor = ({ conflictType, riskFlags }) => [
  conflictType === 'same_hash_multi_label'
    ? '동일 hash 이미지가 실제로 같은 원본인지 확인하고, 후보 라벨 중 지배 결함 하나만 확정하세요.'
    : '승인 라벨, prior 관찰 라벨, original Vision 라벨이 서로 다른 이유를 원본 이미지에서 확인하세요.',
  riskFlags.includes('manifest_unlisted_fixture')
    ? 'manifest 미등재 fixture가 있으면 manifest index 복구 또는 해당 case 보류 여부를 결정하세요.'
    : '',
  riskFlags.includes('capture_protocol_incomplete')
    ? 'ROI, 실제 제품 사진 여부, 필수 촬영 시점 부족으로 판정 신뢰도가 떨어지는지 확인하세요.'
    : '',
  '근거가 충분할 때만 keep_label을 선택하고, 애매하면 needs_review 또는 request_recapture를 선택하세요.'
].filter(Boolean);

const reviewPathFor = ({ conflictType, riskFlags }) => {
  if (riskFlags.includes('fixture_missing')) {
    return 'fixture 원본이 누락되어 자동으로 keep_label을 제안할 수 없습니다. 원본 복구 후 재검토하세요.';
  }
  if (conflictType === 'same_hash_multi_label') {
    return '동일 이미지가 여러 라벨로 승인된 상태입니다. 자동으로 keep_label을 제안하지 말고, 원본 이미지와 현장 설명을 사람이 비교해 하나의 정답 라벨 또는 재촬영을 결정하세요.';
  }
  if (riskFlags.includes('approved_vs_vision_disagreement')) {
    return '승인 라벨과 기존 Vision 관찰이 다릅니다. 자동으로 keep_label을 제안하지 말고, 관찰 사실이 결함 taxonomy 기준과 일치하는지 사람이 확인하세요.';
  }
  return '후보 간 직접 충돌은 낮지만, Graph/Reference 학습 전 사람이 최종 라벨을 확인하세요.';
};

const markdownCell = value => {
  const text = compact(value).replace(/\|/g, '/');
  return text.length > 160 ? `${text.slice(0, 157)}...` : text;
};

const listText = values => unique(values || []).join(', ') || '-';

const markdownFor = guide => {
  const lines = [
    '# Label Conflict HITL Review Guide',
    '',
    `- Generated at: ${guide.generatedAt}`,
    `- Status: ${guide.status}`,
    `- Conflicts: ${guide.summary.conflicts}`,
    `- Evidence cases: ${guide.summary.evidenceCases}`,
    `- Manifest-unlisted cases: ${guide.summary.manifestUnlistedCases}`,
    `- Capture protocol risk cases: ${guide.summary.captureProtocolRiskCases}`,
    `- Service writes performed: ${guide.serviceWritesPerformed}`,
    '- Safety: human review required, auto apply blocked, Graph/Reference/Model learning blocked.',
    ''
  ];

  if (guide.items.length === 0) {
    lines.push('No label conflict review items are currently available.');
    return `${lines.join('\n')}\n`;
  }

  guide.items.forEach(item => {
    lines.push(`## ${item.conflictId}`);
    lines.push(`- Type: ${item.conflictType || '-'}`);
    lines.push(`- Candidate labels: ${listText(item.candidateLabels)}`);
    lines.push(`- Affected cases: ${listText(item.affectedCaseIds)}`);
    lines.push(`- Risk flags: ${listText(item.riskFlags)}`);
    lines.push(`- Suggested review path: ${item.suggestedReviewPathKo || '-'}`);
    lines.push('');
    lines.push('### Decision Checklist');
    item.decisionChecklistKo.forEach((check, index) => {
      lines.push(`${index + 1}. ${check}`);
    });
    lines.push('');
    lines.push('### Label Evidence');
    lines.push('| Label | Expected cases | Prior observation cases | Vision label cases | Source summaries |');
    lines.push('|---|---|---|---|---|');
    item.labelEvidence.forEach(label => {
      lines.push(`| ${markdownCell(label.label)} | ${markdownCell(listText(label.expectedLabelCases))} | ${markdownCell(listText(label.priorObservationCases))} | ${markdownCell(listText(label.visionLabelCases))} | ${markdownCell(label.sourceSummaries.map(source => `${source.caseId}: ${source.summary}`).join(' / '))} |`);
    });
    lines.push('');
    lines.push('### Case Evidence');
    lines.push('| Case ID | Fixture | Manifest | Expected | Prior | Vision | Image kind | ROI | Views | Focus |');
    lines.push('|---|---|---|---|---|---|---|---|---|---|');
    item.evidenceMatrix.forEach(evidence => {
      lines.push(`| ${markdownCell(evidence.caseId)} | ${evidence.fixtureFound ? 'found' : 'missing'} | ${evidence.manifestListed ? markdownCell(evidence.manifestStatus || 'listed') : 'unlisted'} | ${markdownCell(evidence.expectedDefectType)} | ${markdownCell(evidence.priorObservationDefectType)} | ${markdownCell(evidence.originalVisionDefectType)} | ${markdownCell(evidence.imageKind)} | ${evidence.roiConfirmed ? 'yes' : 'no'} | ${markdownCell(listText(evidence.availableViews))} | ${markdownCell(evidence.humanReviewFocusKo)} |`);
    });
    lines.push('');
    lines.push('### Prefill Decision Draft');
    lines.push(`- conflictId=${item.prefillDecisionDraft.conflictId}`);
    lines.push(`- action=${item.prefillDecisionDraft.action}`);
    lines.push(`- selectedLabel=${item.prefillDecisionDraft.selectedLabel}`);
    lines.push(`- imageSetConfirmed=${item.prefillDecisionDraft.imageSetConfirmed}`);
    lines.push(`- labelConfirmed=${item.prefillDecisionDraft.labelConfirmed}`);
    lines.push('');
  });

  return `${lines.join('\n')}\n`;
};

const guideItemFor = decision => {
  const evidenceCases = evidenceCasesFor(decision);
  const candidateLabels = unique(decision?.candidateLabels || []);
  const conflictType = compact(decision?.conflictType);
  const riskFlags = riskFlagsFor({ decision, evidenceCases });
  return {
    conflictId: compact(decision?.conflictId),
    conflictType,
    contentHash: compact(decision?.contentHash).toLowerCase(),
    affectedCaseIds: unique(decision?.affectedCaseIds || []),
    candidateLabels,
    riskFlags,
    labelEvidence: labelEvidenceFor(candidateLabels, evidenceCases),
    evidenceMatrix: evidenceCases.map(evidenceMatrixRow),
    decisionChecklistKo: checklistFor({ conflictType, riskFlags }),
    suggestedReviewPathKo: reviewPathFor({ conflictType, riskFlags }),
    prefillDecisionDraft: {
      conflictId: compact(decision?.conflictId),
      action: 'pending',
      selectedLabel: '',
      imageSetConfirmed: false,
      labelConfirmed: false,
      reviewComment: ''
    }
  };
};

const buildVisionApprovedLabelConflictReviewGuide = ({
  generatedAt = new Date().toISOString(),
  decisionTemplate = null,
  sourceArtifacts = {}
} = {}) => {
  const hasTemplate = decisionTemplate
    && decisionTemplate.contractVersion === 'vision-approved-label-conflict-decisions/v1'
    && Array.isArray(decisionTemplate.decisions);
  const decisions = hasTemplate ? asArray(decisionTemplate.decisions) : [];
  const items = decisions.map(guideItemFor);
  const evidenceCases = items.flatMap(item => item.evidenceMatrix);
  const status = !hasTemplate
    ? 'missing_decision_template'
    : items.length > 0 ? 'action_required' : 'clear';

  return {
    schemaVersion: 1,
    contractVersion: 'vision-approved-label-conflict-review-guide/v1',
    generatedAt,
    sourceSystem: 'mold-master-ai',
    targetSystem: 'quality_hitl',
    status,
    serviceWritesPerformed: false,
    localArtifactsWritten: true,
    policy: {
      requiresHumanReview: true,
      autoApplyAllowed: false,
      allowGraphPromotion: false,
      allowReferenceLearning: false,
      allowModelTraining: false
    },
    summary: {
      conflicts: items.length,
      evidenceCases: evidenceCases.length,
      manifestUnlistedCases: evidenceCases.filter(evidence => evidence.manifestListed === false).length,
      captureProtocolRiskCases: evidenceCases.filter(evidence =>
        evidence.imageKind === 'unknown'
        || evidence.roiConfirmed !== true
        || evidence.availableViews.length === 0
      ).length
    },
    items,
    sources: {
      decisionTemplate: sourceArtifacts.decisionTemplate || null
    },
    recommendedAction: status === 'missing_decision_template'
      ? '먼저 npm run vision:label-conflicts:decision-template 명령으로 decision-template artifact를 생성하세요.'
      : status === 'clear'
        ? '라벨 충돌 없음. 다음 readiness blocker를 확인하세요.'
        : 'review guide의 후보 라벨별 근거와 위험 플래그를 확인한 뒤 decision-template을 사람이 채우세요.'
  };
};

const buildVisionApprovedLabelConflictReviewGuideWithMarkdown = options => {
  const guide = buildVisionApprovedLabelConflictReviewGuide(options);
  return {
    ...guide,
    markdown: markdownFor(guide)
  };
};

module.exports = {
  buildVisionApprovedLabelConflictReviewGuide: buildVisionApprovedLabelConflictReviewGuideWithMarkdown
};
