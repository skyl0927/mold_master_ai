const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildOperationalHitlHumanDecisionBrief
} = require('../operationalHitlHumanDecisionBrief');

const pipelineStatus = () => ({
  contractVersion: 'operational-hitl-pipeline-status/v1',
  status: 'action_required',
  currentStage: {
    code: 'awaiting_human_csv_decisions',
    titleKo: 'CSV HITL 판정 입력 대기'
  },
  serviceWritesPerformed: false,
  summary: {
    totalDecisionInputsMissing: 56,
    worktableRows: 3,
    worktableReviewSessionCount: 2,
    worktableReviewSessionHighRiskRows: 2,
    worktableReviewSessionProgressCompletedRows: 0,
    worktableReviewSessionProgressPendingRows: 3,
    worktableReviewSessionProgressInvalidRows: 0
  },
  nextActions: [
    {
      code: 'fill_worktable_csv',
      titleKo: 'CSV 작업표 HITL 판정 입력',
      commands: [
        'npm run operational:hitl:worktable-import',
        'npm run operational:hitl:session-progress'
      ]
    }
  ],
  sources: {
    worktableCsv: 'C:\\repo\\artifacts\\operational-hitl-decision-worktable-export.csv'
  }
});

const reviewSessionPlan = () => ({
  contractVersion: 'operational-hitl-review-session-plan/v1',
  status: 'ready_for_human_review',
  serviceWritesPerformed: false,
  summary: {
    totalRows: 3,
    sessionCount: 2,
    highRiskRows: 2
  },
  sessions: [
    {
      code: 'label_conflict_session',
      titleKo: '승인 이미지 라벨 충돌 선검토',
      priority: 1,
      highRiskRows: 2,
      guidanceKo: '동일 hash 원본 이미지와 후보 라벨 중 실제 지배 결함을 먼저 확인하세요.',
      rows: [
        {
          queueCode: 'vision_label_conflicts',
          decisionId: 'conflict-001',
          displayLabel: '제팅 | 플로우마크',
          recommendedNewAction: 'mark_needs_review',
          recommendationRisk: 'high',
          recommendationReasonKo: '라벨 충돌은 원본 확인 전까지 needs_review 격리가 안전합니다.',
          requiredHumanChecksKo: '원본 이미지와 후보 라벨 중 실제 지배 결함을 확인하세요.',
          copyableFields: [
            {
              worktableColumn: 'newAction',
              value: 'mark_needs_review'
            },
            {
              worktableColumn: 'reviewComment',
              value: '라벨 충돌이 있어 원본 확인 전까지 학습 후보에서 격리합니다.'
            }
          ],
          manualConfirmationFields: [
            'selectedLabel',
            'imageSetConfirmed',
            'labelConfirmed',
            'reviewer.id',
            'decidedAt',
            'requestedViews'
          ],
          copyToWorktableInstructionKo: '원본 worktable CSV에 필요한 값만 옮겨 적으세요.',
          verificationCommand: 'npm run vision:label-conflicts:verify-decisions -- --decisions "C:\\repo\\workspace\\01.json"'
        },
        {
          queueCode: 'vision_label_conflicts',
          decisionId: 'conflict-002',
          displayLabel: '수축 | 백화',
          recommendedNewAction: 'mark_needs_review',
          recommendationRisk: 'high',
          copyableFields: [
            {
              worktableColumn: 'newAction',
              value: 'mark_needs_review'
            }
          ],
          manualConfirmationFields: ['selectedLabel', 'reviewer.id', 'decidedAt'],
          verificationCommand: 'npm run vision:label-conflicts:verify-decisions -- --decisions "C:\\repo\\workspace\\01.json"'
        }
      ]
    },
    {
      code: 'web_card_approval_session',
      titleKo: 'Web 지식 카드 승인 후보 검토',
      priority: 4,
      highRiskRows: 0,
      guidanceKo: '출처 신뢰도와 현장 적용성을 확인하세요.',
      rows: [
        {
          queueCode: 'web_knowledge_hitl',
          decisionId: 'web-basf-04-weld-line',
          displayLabel: '웰드라인',
          recommendedNewAction: 'approve_card',
          recommendationRisk: 'medium',
          copyableFields: [
            {
              worktableColumn: 'newAction',
              value: 'approve_card'
            },
            {
              worktableColumn: 'actions',
              value: 'Increase the melt temperature and clean the venting channels. This intentionally long field should stay available in JSON but be shortened in the Markdown brief so the operator can scan the next action quickly.'
            }
          ],
          manualConfirmationFields: ['confirmed', 'reviewer.id', 'decidedAt'],
          verificationCommand: 'npm run knowledge:web:hitl:verify-decisions -- --decisions "C:\\repo\\workspace\\03.json"'
        }
      ]
    }
  ]
});

const reviewSessionPacket = () => ({
  contractVersion: 'operational-hitl-review-session-packet/v1',
  status: 'ready_for_human_review',
  serviceWritesPerformed: false,
  summary: {
    totalRows: 3,
    sessionPacketCount: 2,
    filesToWrite: 4
  },
  packets: [
    {
      code: 'label_conflict_session',
      csvPath: 'C:\\repo\\packet\\01-label-conflict-session.csv',
      markdownPath: 'C:\\repo\\packet\\01-label-conflict-session.md'
    },
    {
      code: 'web_card_approval_session',
      csvPath: 'C:\\repo\\packet\\04-web-card-approval-session.csv',
      markdownPath: 'C:\\repo\\packet\\04-web-card-approval-session.md'
    }
  ]
});

const reviewSessionProgress = () => ({
  contractVersion: 'operational-hitl-review-session-progress/v1',
  status: 'awaiting_human_csv_decisions',
  serviceWritesPerformed: false,
  summary: {
    totalRows: 3,
    completedRows: 0,
    pendingRows: 3,
    invalidRows: 0,
    sessionCount: 2
  },
  sessions: [
    {
      code: 'label_conflict_session',
      status: 'awaiting_human_csv_decisions',
      completedRows: 0,
      pendingRows: 2,
      invalidRows: 0
    },
    {
      code: 'web_card_approval_session',
      status: 'awaiting_human_csv_decisions',
      completedRows: 0,
      pendingRows: 1,
      invalidRows: 0
    }
  ]
});

test('builds a no-write human decision brief for the next HITL session', () => {
  const brief = buildOperationalHitlHumanDecisionBrief({
    generatedAt: '2026-07-28T03:30:00.000Z',
    pipelineStatus: pipelineStatus(),
    reviewSessionPlan: reviewSessionPlan(),
    reviewSessionPacket: reviewSessionPacket(),
    reviewSessionProgress: reviewSessionProgress(),
    sourceArtifacts: {
      pipelineStatus: 'C:\\repo\\artifacts\\pipeline-status.json',
      reviewSessionPlan: 'C:\\repo\\artifacts\\review-session-plan.json',
      reviewSessionPacket: 'C:\\repo\\artifacts\\review-session-packet.json',
      reviewSessionProgress: 'C:\\repo\\artifacts\\review-session-progress.json'
    }
  });

  assert.equal(brief.contractVersion, 'operational-hitl-human-decision-brief/v1');
  assert.equal(brief.status, 'ready_for_human_entry');
  assert.equal(brief.serviceWritesPerformed, false);
  assert.equal(brief.policy.autoApplyAllowed, false);
  assert.equal(brief.policy.allowGraphPromotion, false);
  assert.equal(brief.summary.totalRows, 3);
  assert.equal(brief.summary.pendingRows, 3);
  assert.equal(brief.summary.invalidRows, 0);
  assert.equal(brief.summary.highRiskRows, 2);
  assert.equal(brief.summary.nextSessionCode, 'label_conflict_session');
  assert.equal(brief.summary.nextDecisionId, 'conflict-001');
  assert.equal(brief.worktableCsvPath, 'C:\\repo\\artifacts\\operational-hitl-decision-worktable-export.csv');
  assert.deepEqual(brief.operatorSteps.map(step => step.code), [
    'open_session_packet',
    'review_source_evidence',
    'fill_original_worktable_csv',
    'dry_run_import',
    'refresh_progress'
  ]);
  assert.equal(brief.sessions.length, 2);
  assert.equal(brief.sessions[0].pendingRows, 2);
  assert.equal(brief.sessions[0].csvPath, 'C:\\repo\\packet\\01-label-conflict-session.csv');
  assert.deepEqual(brief.sessions[0].nextRows[0].copyableFields, [
    'newAction=mark_needs_review',
    'reviewComment=라벨 충돌이 있어 원본 확인 전까지 학습 후보에서 격리합니다.'
  ]);
  assert.deepEqual(brief.sessions[0].nextRows[0].manualConfirmationFields, [
    'selectedLabel',
    'imageSetConfirmed',
    'labelConfirmed',
    'reviewer.id',
    'decidedAt',
    'requestedViews'
  ]);
  assert.match(brief.markdown, /Operational HITL Human Decision Brief/);
  assert.match(brief.markdown, /다음 세션: 승인 이미지 라벨 충돌 선검토/);
  assert.match(brief.markdown, /원본 worktable CSV/);
  assert.match(brief.markdown, /세션 패킷에서 전체 확인/);
  assert.doesNotMatch(brief.markdown, /This intentionally long field should stay available in JSON/);
  assert.equal(brief.sources.pipelineStatus, 'C:\\repo\\artifacts\\pipeline-status.json');
});

test('surfaces invalid rows before additional pending work', () => {
  const progress = reviewSessionProgress();
  progress.status = 'invalid_worktable';
  progress.summary.invalidRows = 1;
  progress.summary.pendingRows = 2;
  progress.sessions[0].status = 'invalid_worktable';
  progress.sessions[0].invalidRows = 1;
  progress.sessions[0].pendingRows = 1;

  const brief = buildOperationalHitlHumanDecisionBrief({
    pipelineStatus: pipelineStatus(),
    reviewSessionPlan: reviewSessionPlan(),
    reviewSessionPacket: reviewSessionPacket(),
    reviewSessionProgress: progress
  });

  assert.equal(brief.status, 'fix_invalid_human_entries');
  assert.equal(brief.summary.invalidRows, 1);
  assert.equal(brief.summary.nextSessionCode, 'label_conflict_session');
  assert.match(brief.recommendedAction, /오류 row/);
  assert.match(brief.markdown, /오류 row부터 수정/);
});

test('fails closed when required brief evidence is missing', () => {
  const brief = buildOperationalHitlHumanDecisionBrief({});

  assert.equal(brief.status, 'missing_evidence');
  assert.equal(brief.serviceWritesPerformed, false);
  assert.deepEqual(brief.summary.missingArtifactNames, [
    'pipelineStatus',
    'reviewSessionPlan'
  ]);
  assert.deepEqual(brief.sessions, []);
  assert.match(brief.recommendedAction, /pipeline-status/);
});
