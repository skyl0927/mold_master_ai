const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildWebKnowledgeHitlReviewGuide
} = require('../webKnowledgeHitlReviewGuide');

const decisionTemplate = {
  contractVersion: 'common-agent-web-knowledge-hitl-decisions-template/v1',
  status: 'template_ready',
  summary: {
    decisionsPrepared: 2,
    currentApprovalsMissing: 40
  },
  decisions: [
    {
      caseId: 'web-basf-04-weld-line',
      sourceContentSha256: 'a'.repeat(64),
      defectClass: 'weld_line',
      sourceKind: 'technical_guide',
      originalDecision: 'pending',
      isCurrent: true,
      action: 'pending',
      reviewedDefectName: '웰드라인',
      reviewedProblem: '유동 선단 합류부에 선형 자국이 발생한다.',
      reviewedPhenomenon: '합류부 표면에 선 모양 흔적이 확인된다.',
      causeCandidates: ['유동 선단 온도 저하 또는 합류 압력 부족'],
      suggestedCauseLabels: ['유동 선단'],
      suggestedCheckItems: ['게이트 위치와 합류부 온도를 확인한다.'],
      suggestedActions: ['금형 온도를 조정한다.', '사출 속도를 조정한다.'],
      evidence: [{
        publisher: 'BASF',
        title: 'Weld line guide',
        sourceUrl: 'https://download.basf.com/example.pdf',
        license: 'Copyrighted technical reference; citation only',
        contentSha256: 'b'.repeat(64),
        localFile: 'web-knowledge/web-basf-04.pdf'
      }]
    },
    {
      caseId: 'web-case-weak',
      sourceContentSha256: 'c'.repeat(64),
      defectClass: 'other',
      sourceKind: 'web_article',
      originalDecision: 'needs_changes',
      isCurrent: false,
      action: 'pending',
      reviewedDefectName: '',
      reviewedProblem: '결함 설명이 부족하다.',
      reviewedPhenomenon: '',
      causeCandidates: [],
      suggestedCauseLabels: [],
      suggestedCheckItems: [],
      suggestedActions: [],
      evidence: []
    }
  ],
  sources: {
    collectionRoot: 'artifacts/web-injection-defect-cases'
  }
};

test('builds a no-write Web Knowledge HITL review guide from the decision template', () => {
  const guide = buildWebKnowledgeHitlReviewGuide({
    generatedAt: '2026-07-27T15:20:00.000Z',
    decisionTemplate,
    sourceArtifacts: {
      decisionTemplate: 'artifacts/common-agent-web-knowledge-hitl-decisions-template.json'
    }
  });

  assert.equal(guide.contractVersion, 'web-knowledge-hitl-review-guide/v1');
  assert.equal(guide.status, 'action_required');
  assert.equal(guide.serviceWritesPerformed, false);
  assert.equal(guide.policy.autoApplyAllowed, false);
  assert.equal(guide.policy.allowCentralIngestion, false);
  assert.equal(guide.policy.allowGraphPromotion, false);
  assert.equal(guide.summary.decisionsPrepared, 2);
  assert.equal(guide.summary.approvalReadyCandidates, 1);
  assert.equal(guide.summary.needsEvidenceRepair, 1);
  assert.equal(guide.summary.citationOnlySources, 1);
  assert.equal(guide.summary.staleCards, 1);

  const first = guide.items[0];
  assert.equal(first.caseId, 'web-basf-04-weld-line');
  assert.equal(first.reviewFocusKo, '승인 후보: 원문 근거와 현장 적용 가능성을 확인한 뒤 approve_card 여부를 결정하세요.');
  assert.deepEqual(first.qualityFlags, [
    'approval_candidate',
    'citation_only_source',
    'human_confirmation_required'
  ]);
  assert.equal(first.evidenceSummary.evidenceCount, 1);
  assert.equal(first.evidenceSummary.primaryPublisher, 'BASF');
  assert.equal(first.knowledgeCompleteness.causeCandidates, 1);
  assert.equal(first.knowledgeCompleteness.suggestedActions, 2);
  assert.match(first.decisionChecklistKo[0], /원문\/이미지 근거/);
  assert.equal(first.prefillDecisionDraft.action, 'pending');
  assert.equal(first.prefillDecisionDraft.reviewedDefectName, '웰드라인');
  assert.equal(first.prefillDecisionDraft.confirmed, false);

  const second = guide.items[1];
  assert.deepEqual(second.qualityFlags, [
    'stale_or_changed_card',
    'missing_defect_name',
    'missing_phenomenon',
    'missing_cause_candidates',
    'missing_suggested_checks',
    'missing_suggested_actions',
    'human_confirmation_required'
  ]);
  assert.equal(second.reviewFocusKo, '보완 필요 후보: 누락된 문제/현상/원인/점검/대책 필드를 보강하거나 reject_card를 검토하세요.');
  assert.equal(guide.sources.decisionTemplate, 'artifacts/common-agent-web-knowledge-hitl-decisions-template.json');
});

test('fails closed when Web Knowledge HITL decision template is missing', () => {
  const guide = buildWebKnowledgeHitlReviewGuide({
    decisionTemplate: null
  });

  assert.equal(guide.status, 'missing_decision_template');
  assert.equal(guide.summary.decisionsPrepared, 0);
  assert.deepEqual(guide.items, []);
  assert.match(guide.recommendedAction, /knowledge:web:hitl:decision-template/);
  assert.equal(guide.policy.allowGraphPromotion, false);
});

test('returns clear guide when there are no Web Knowledge HITL decisions', () => {
  const guide = buildWebKnowledgeHitlReviewGuide({
    decisionTemplate: {
      contractVersion: 'common-agent-web-knowledge-hitl-decisions-template/v1',
      status: 'clear',
      decisions: []
    }
  });

  assert.equal(guide.status, 'clear');
  assert.equal(guide.summary.decisionsPrepared, 0);
  assert.deepEqual(guide.items, []);
  assert.match(guide.recommendedAction, /추가 Web Case HITL 판정 대상이 없습니다/);
});
