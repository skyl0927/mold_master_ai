const asArray = value => Array.isArray(value) ? value : [];

const compact = value => String(value || '').replace(/\s+/g, ' ').trim();

const unique = values => [...new Set(asArray(values).map(compact).filter(Boolean))];
const joinList = values => unique(values).join(' | ');
const shortText = (value, maxLength = 360) => {
  const text = compact(value);
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
};

const csvEscape = value => {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text)
    ? `"${text.replace(/"/g, '""')}"`
    : text;
};

const count = value => asArray(value).length;

const evidenceSummaryFor = decision => {
  const evidence = asArray(decision?.evidence);
  const primary = evidence[0] || {};
  return {
    evidenceCount: evidence.length,
    primaryPublisher: compact(primary.publisher),
    primaryTitle: compact(primary.title),
    primarySourceUrl: compact(primary.sourceUrl),
    primaryLicense: compact(primary.license),
    citationOnly: evidence.some(item => /citation only|copyright/i.test(compact(item?.license))),
    localFiles: unique(evidence.map(item => item?.localFile))
  };
};

const completenessFor = decision => ({
  reviewedDefectName: compact(decision?.reviewedDefectName) ? 1 : 0,
  reviewedProblem: compact(decision?.reviewedProblem) ? 1 : 0,
  reviewedPhenomenon: compact(decision?.reviewedPhenomenon) ? 1 : 0,
  causeCandidates: count(decision?.causeCandidates),
  suggestedCauseLabels: count(decision?.suggestedCauseLabels),
  suggestedCheckItems: count(decision?.suggestedCheckItems),
  suggestedActions: count(decision?.suggestedActions)
});

const qualityFlagsFor = ({ decision, evidenceSummary, knowledgeCompleteness }) => {
  const flags = [];
  if (decision?.isCurrent === false) flags.push('stale_or_changed_card');
  if (!knowledgeCompleteness.reviewedDefectName) flags.push('missing_defect_name');
  if (!knowledgeCompleteness.reviewedProblem) flags.push('missing_problem');
  if (!knowledgeCompleteness.reviewedPhenomenon) flags.push('missing_phenomenon');
  if (!knowledgeCompleteness.causeCandidates) flags.push('missing_cause_candidates');
  if (!knowledgeCompleteness.suggestedCheckItems) flags.push('missing_suggested_checks');
  if (!knowledgeCompleteness.suggestedActions) flags.push('missing_suggested_actions');
  const approvalCandidate = flags.length === 0
    || flags.every(flag => flag === 'citation_only_source');
  if (approvalCandidate) flags.push('approval_candidate');
  if (evidenceSummary.citationOnly) flags.push('citation_only_source');
  flags.push('human_confirmation_required');
  return unique(flags);
};

const reviewFocusFor = qualityFlags => {
  if (qualityFlags.includes('approval_candidate')) {
    return '승인 후보: 원문 근거와 현장 적용 가능성을 확인한 뒤 approve_card 여부를 결정하세요.';
  }
  return '보완 필요 후보: 누락된 문제/현상/원인/점검/대책 필드를 보강하거나 reject_card를 검토하세요.';
};

const checklistFor = ({ qualityFlags, evidenceSummary }) => [
  '원문/이미지 근거가 결함명, 현상, 원인 후보와 직접 연결되는지 확인하세요.',
  evidenceSummary.citationOnly
    ? '저작권 원문은 citation 근거로만 사용하고 본문에는 요약/재서술된 지식만 남기세요.'
    : '',
  qualityFlags.includes('stale_or_changed_card')
    ? 'stale 카드입니다. 최신 collection hash와 카드 내용을 비교한 뒤 보류 또는 재생성을 검토하세요.'
    : '',
  qualityFlags.includes('missing_cause_candidates')
    ? '원인 후보가 비어 있습니다. approve_card 전에 최소 1개 이상의 원인 후보를 보강하세요.'
    : '',
  qualityFlags.includes('missing_suggested_checks')
    ? '점검 항목이 비어 있습니다. 현장에서 확인 가능한 check item을 추가하세요.'
    : '',
  qualityFlags.includes('missing_suggested_actions')
    ? '대책 항목이 비어 있습니다. 시방서에 들어갈 실행 대책을 추가하세요.'
    : '',
  '승인 시 confirmed=true, reviewerId, decidedAt, reviewComment와 승인 필드를 모두 채우세요.'
].filter(Boolean);

const guideItemFor = decision => {
  const evidenceSummary = evidenceSummaryFor(decision);
  const knowledgeCompleteness = completenessFor(decision);
  const qualityFlags = qualityFlagsFor({
    decision,
    evidenceSummary,
    knowledgeCompleteness
  });
  return {
    caseId: compact(decision?.caseId),
    sourceContentSha256: compact(decision?.sourceContentSha256).toLowerCase(),
    defectClass: compact(decision?.defectClass),
    sourceKind: compact(decision?.sourceKind),
    originalDecision: compact(decision?.originalDecision),
    isCurrent: decision?.isCurrent !== false,
    reviewFocusKo: reviewFocusFor(qualityFlags),
    qualityFlags,
    evidenceSummary,
    knowledgeCompleteness,
    suggestedKnowledge: {
      reviewedDefectName: compact(decision?.reviewedDefectName),
      reviewedProblem: compact(decision?.reviewedProblem),
      reviewedPhenomenon: compact(decision?.reviewedPhenomenon),
      causeCandidates: unique(decision?.causeCandidates),
      suggestedCauseLabels: unique(decision?.suggestedCauseLabels),
      suggestedCheckItems: unique(decision?.suggestedCheckItems),
      suggestedActions: unique(decision?.suggestedActions)
    },
    decisionChecklistKo: checklistFor({ qualityFlags, evidenceSummary }),
    prefillDecisionDraft: {
      caseId: compact(decision?.caseId),
      sourceContentSha256: compact(decision?.sourceContentSha256).toLowerCase(),
      action: 'pending',
      reviewedDefectName: compact(decision?.reviewedDefectName),
      reviewedProblem: compact(decision?.reviewedProblem),
      reviewedPhenomenon: compact(decision?.reviewedPhenomenon),
      causeCandidates: unique(decision?.causeCandidates),
      causeLabels: unique(decision?.suggestedCauseLabels),
      checkItems: unique(decision?.suggestedCheckItems),
      actions: unique(decision?.suggestedActions),
      confirmed: false,
      reviewComment: ''
    }
  };
};

const approvalDecisionFields = [
  'action',
  'reviewerId',
  'decidedAt',
  'reviewComment',
  'confirmed',
  'reviewedDefectName',
  'reviewedProblem',
  'reviewedPhenomenon',
  'causeCandidates',
  'causeLabels',
  'checkItems',
  'actions'
];

const nonApprovalDecisionFields = [
  'action',
  'reviewerId',
  'decidedAt',
  'reviewComment',
  'confirmed'
];

const recommendedActionFor = item => {
  const flags = asArray(item?.qualityFlags);
  const hasRepairFlag = flags.some(flag =>
    flag === 'stale_or_changed_card' || flag.startsWith('missing_')
  );
  if (hasRepairFlag) return 'mark_needs_changes';
  if (flags.includes('approval_candidate')) return 'approve_card';
  return 'mark_needs_changes';
};

const copyrightUseFor = item =>
  item?.evidenceSummary?.citationOnly ? 'citation_only' : 'reusable_summary';

const worksheetRowsFor = items => asArray(items).map(item => {
  const suggested = item?.suggestedKnowledge || {};
  const recommendedAction = recommendedActionFor(item);
  return {
    caseId: compact(item?.caseId),
    defectClass: compact(item?.defectClass),
    sourceKind: compact(item?.sourceKind),
    recommendedAction,
    copyrightUse: copyrightUseFor(item),
    qualityFlags: asArray(item?.qualityFlags).map(compact).filter(Boolean),
    reviewFocusKo: compact(item?.reviewFocusKo),
    reviewedDefectName: compact(suggested.reviewedDefectName),
    reviewedProblem: shortText(suggested.reviewedProblem),
    reviewedPhenomenon: shortText(suggested.reviewedPhenomenon),
    causeCandidates: unique(suggested.causeCandidates).map(value => shortText(value, 180)),
    causeLabels: unique(suggested.suggestedCauseLabels),
    checkItems: unique(suggested.suggestedCheckItems).map(value => shortText(value, 180)),
    actions: unique(suggested.suggestedActions).map(value => shortText(value, 180)),
    evidencePublisher: compact(item?.evidenceSummary?.primaryPublisher),
    evidenceTitle: compact(item?.evidenceSummary?.primaryTitle),
    sourceUrl: compact(item?.evidenceSummary?.primarySourceUrl),
    requiredDecisionFields: recommendedAction === 'approve_card'
      ? approvalDecisionFields
      : nonApprovalDecisionFields
  };
});

const worksheetCsvFor = rows => {
  const headers = [
    'caseId',
    'defectClass',
    'sourceKind',
    'recommendedAction',
    'copyrightUse',
    'qualityFlags',
    'reviewedDefectName',
    'reviewedProblem',
    'reviewedPhenomenon',
    'causeCandidates',
    'causeLabels',
    'checkItems',
    'actions',
    'evidencePublisher',
    'evidenceTitle',
    'sourceUrl',
    'requiredDecisionFields'
  ];
  const lines = [
    headers.join(','),
    ...rows.map(row => headers.map(header => csvEscape(
      Array.isArray(row[header]) ? row[header].join(' | ') : row[header]
    )).join(','))
  ];
  return `${lines.join('\n')}\n`;
};

const worksheetMarkdownFor = ({ generatedAt, status, rows }) => {
  const lines = [
    '# Web Knowledge HITL Review Worksheet',
    '',
    `Generated at: ${generatedAt}`,
    `Status: ${status}`,
    `Rows: ${rows.length}`,
    '',
    'Use this worksheet to review evidence and then fill the JSON decision template.',
    'Do not treat this worksheet as an approval record by itself.',
    ''
  ];
  rows.forEach((row, index) => {
    lines.push(
      `## ${index + 1}. ${row.caseId}`,
      '',
      `- Defect class: ${row.defectClass}`,
      `- Source kind: ${row.sourceKind}`,
      `- Recommended action: ${row.recommendedAction}`,
      `- Copyright use: ${row.copyrightUse}`,
      `- Quality flags: ${row.qualityFlags.join(', ') || 'none'}`,
      `- Review focus: ${row.reviewFocusKo}`,
      `- Evidence: ${row.evidencePublisher || 'unknown'} / ${row.evidenceTitle || 'untitled'}`,
      `- Source URL: ${row.sourceUrl || 'none'}`,
      `- Required decision fields: ${row.requiredDecisionFields.join(', ')}`,
      '',
      'Suggested reviewed knowledge:',
      '',
      `- Defect name: ${row.reviewedDefectName || 'missing'}`,
      `- Problem: ${row.reviewedProblem || 'missing'}`,
      `- Phenomenon: ${row.reviewedPhenomenon || 'missing'}`,
      `- Causes: ${joinList(row.causeCandidates) || 'missing'}`,
      `- Cause labels: ${joinList(row.causeLabels) || 'missing'}`,
      `- Check items: ${joinList(row.checkItems) || 'missing'}`,
      `- Actions: ${joinList(row.actions) || 'missing'}`,
      ''
    );
  });
  return `${lines.join('\n')}\n`;
};

const reviewWorksheetFor = ({ generatedAt, status, items }) => {
  const rows = worksheetRowsFor(items);
  const worksheetStatus = status === 'action_required'
    ? 'ready'
    : status === 'clear'
      ? 'clear'
      : 'not_available';
  return {
    status: worksheetStatus,
    rows,
    markdown: worksheetMarkdownFor({ generatedAt, status, rows }),
    csvText: worksheetCsvFor(rows)
  };
};

const buildWebKnowledgeHitlReviewGuide = ({
  generatedAt = new Date().toISOString(),
  decisionTemplate = null,
  sourceArtifacts = {}
} = {}) => {
  const hasTemplate = decisionTemplate
    && decisionTemplate.contractVersion === 'common-agent-web-knowledge-hitl-decisions-template/v1'
    && Array.isArray(decisionTemplate.decisions);
  const decisions = hasTemplate ? asArray(decisionTemplate.decisions) : [];
  const items = decisions.map(guideItemFor);
  const status = !hasTemplate
    ? 'missing_decision_template'
    : items.length > 0 ? 'action_required' : 'clear';

  return {
    schemaVersion: 1,
    contractVersion: 'web-knowledge-hitl-review-guide/v1',
    generatedAt,
    sourceSystem: 'mold-master-ai',
    targetSystem: 'quality_hitl',
    status,
    serviceWritesPerformed: false,
    localArtifactsWritten: true,
    policy: {
      requiresHumanReview: true,
      autoApplyAllowed: false,
      allowCentralIngestion: false,
      allowGraphPromotion: false,
      allowModelTraining: false
    },
    summary: {
      decisionsPrepared: items.length,
      approvalReadyCandidates: items.filter(item => item.qualityFlags.includes('approval_candidate')).length,
      needsEvidenceRepair: items.filter(item => !item.qualityFlags.includes('approval_candidate')).length,
      citationOnlySources: items.filter(item => item.qualityFlags.includes('citation_only_source')).length,
      staleCards: items.filter(item => item.qualityFlags.includes('stale_or_changed_card')).length
    },
    items,
    sources: {
      decisionTemplate: sourceArtifacts.decisionTemplate || null,
      collectionRoot: sourceArtifacts.collectionRoot || decisionTemplate?.sources?.collectionRoot || null
    },
    reviewWorksheet: reviewWorksheetFor({ generatedAt, status, items }),
    recommendedAction: status === 'missing_decision_template'
      ? '먼저 npm run knowledge:web:hitl:decision-template 명령으로 batch 판정 템플릿을 생성하세요.'
      : status === 'clear'
        ? '추가 Web Case HITL 판정 대상이 없습니다.'
        : 'review guide의 근거/완성도/저작권 주의 플래그를 확인한 뒤 Web Case HITL decision-template을 사람이 채우세요.'
  };
};

module.exports = {
  buildWebKnowledgeHitlReviewGuide
};
