const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildOperationalHitlReviewSessionPacket
} = require('../operationalHitlReviewSessionPacket');

const row = overrides => ({
  queueCode: 'vision_label_conflicts',
  decisionId: 'conflict-001',
  displayLabel: '제팅 | 플로우마크',
  recommendedNewAction: 'mark_needs_review',
  recommendationRisk: 'high',
  recommendationReasonKo: '라벨 충돌 항목은 원본 동일 hash와 지배 결함 확인 전까지 needs_review 격리가 안전합니다.',
  requiredHumanChecksKo: '동일 hash 원본 이미지와 후보 라벨 중 실제 지배 결함을 확인하세요.',
  copyableFields: [
    {
      worktableColumn: 'newAction',
      suggestedColumn: 'recommendedNewAction',
      value: 'mark_needs_review'
    },
    {
      worktableColumn: 'reviewComment',
      suggestedColumn: 'suggestedReviewComment',
      value: '라벨 충돌이 있어 원본 확인 전까지 학습 후보에서 격리합니다.'
    }
  ],
  manualConfirmationFields: ['selectedLabel', 'imageSetConfirmed', 'labelConfirmed', 'reviewer.id', 'decidedAt'],
  copyToWorktableInstructionKo: '사람이 추천 내용을 검토한 뒤 원본 worktable CSV의 newAction 및 필수 필드에 필요한 값만 옮겨 적으세요.',
  editablePath: 'C:\\repo\\workspace\\01-vision-label-conflicts.decisions.json',
  verificationCommand: 'npm run vision:label-conflicts:verify-decisions -- --decisions "C:\\repo\\workspace\\01-vision-label-conflicts.decisions.json"',
  ...overrides
});

const sessionPlan = sessions => ({
  contractVersion: 'operational-hitl-review-session-plan/v1',
  status: sessions.length > 0 ? 'ready_for_human_review' : 'clear',
  serviceWritesPerformed: false,
  summary: {
    totalRows: sessions.reduce((total, session) => total + session.rows.length, 0),
    sessionCount: sessions.length,
    highRiskRows: sessions.reduce((total, session) => total + session.highRiskRows, 0)
  },
  sessions,
  sources: {
    worktableSuggestion: 'C:\\repo\\artifacts\\operational-hitl-decision-worktable-suggestion.json'
  }
});

test('builds no-write per-session HITL review CSV and Markdown packets', () => {
  const packet = buildOperationalHitlReviewSessionPacket({
    generatedAt: '2026-07-27T16:30:00.000Z',
    reviewSessionPlan: sessionPlan([
      {
        code: 'label_conflict_session',
        titleKo: '승인 이미지 라벨 충돌 선검토',
        titleEn: 'Label conflict review',
        priority: 1,
        guidanceKo: '동일 hash 원본 이미지와 후보 라벨 중 실제 지배 결함을 먼저 확인하세요.',
        highRiskRows: 1,
        rows: [
          row()
        ]
      },
      {
        code: 'recapture_session',
        titleKo: '재촬영 요청 검토',
        titleEn: 'Recapture review',
        priority: 2,
        guidanceKo: '실제 제조 이미지 여부와 필요한 재촬영 view를 확정하세요.',
        highRiskRows: 1,
        rows: [
          row({
            queueCode: 'vision_pending_hitl',
            decisionId: 'pending-hitl-001',
            displayLabel: '교육용 도식',
            recommendedNewAction: 'request_recapture',
            recommendationReasonKo: '비전 설명에 도식/비제조 이미지 위험이 있어 학습 승인보다 재촬영 요청으로 검토하는 것이 안전합니다.',
            copyableFields: [
              {
                worktableColumn: 'newAction',
                suggestedColumn: 'recommendedNewAction',
                value: 'request_recapture'
              },
              {
                worktableColumn: 'requestedViews',
                suggestedColumn: 'suggestedRequestedViews',
                value: '제품 전체 정면 | 결함부 근접'
              }
            ],
            manualConfirmationFields: ['reviewer.id', 'decidedAt', 'reviewComment']
          })
        ]
      }
    ]),
    sourceArtifacts: {
      reviewSessionPlan: 'C:\\repo\\artifacts\\operational-hitl-review-session-plan.json'
    }
  });

  assert.equal(packet.contractVersion, 'operational-hitl-review-session-packet/v1');
  assert.equal(packet.status, 'ready_for_human_review');
  assert.equal(packet.serviceWritesPerformed, false);
  assert.equal(packet.policy.autoPopulateNewActionAllowed, false);
  assert.equal(packet.policy.autoApplyAllowed, false);
  assert.equal(packet.policy.allowGraphPromotion, false);
  assert.equal(packet.summary.totalRows, 2);
  assert.equal(packet.summary.sessionPacketCount, 2);
  assert.equal(packet.summary.filesToWrite, 4);
  assert.equal(packet.summary.highRiskRows, 2);
  assert.deepEqual(
    packet.packets.map(item => item.fileBase),
    ['01-label-conflict-session', '02-recapture-session']
  );
  assert.match(packet.packets[0].csv, /sessionCode,sessionTitleKo,priority,queueCode/);
  assert.match(packet.packets[0].csv, /"제팅 \| 플로우마크"/);
  assert.match(packet.packets[0].csv, /newAction=mark_needs_review/);
  assert.match(packet.packets[0].csv, /selectedLabel \| imageSetConfirmed \| labelConfirmed/);
  assert.match(packet.packets[0].markdown, /Label conflict review/);
  assert.match(packet.packets[0].markdown, /자동 적용 금지/);
  assert.match(packet.recommendedAction, /세션별 CSV/);
  assert.equal(packet.sources.reviewSessionPlan, 'C:\\repo\\artifacts\\operational-hitl-review-session-plan.json');
});

test('returns clear packet when review session plan has no sessions', () => {
  const packet = buildOperationalHitlReviewSessionPacket({
    reviewSessionPlan: sessionPlan([])
  });

  assert.equal(packet.status, 'clear');
  assert.equal(packet.summary.totalRows, 0);
  assert.deepEqual(packet.packets, []);
  assert.match(packet.recommendedAction, /추가 세션 패킷이 없습니다/);
});

test('fails closed when review session plan evidence is missing', () => {
  const packet = buildOperationalHitlReviewSessionPacket({});

  assert.equal(packet.status, 'missing_evidence');
  assert.equal(packet.serviceWritesPerformed, false);
  assert.equal(packet.summary.missingArtifacts, 1);
  assert.deepEqual(packet.packets, []);
  assert.match(packet.recommendedAction, /review-session-plan/);
});
