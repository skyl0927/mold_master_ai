const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildOperationalHitlReviewSessionProgress
} = require('../operationalHitlReviewSessionProgress');

const row = overrides => ({
  queueCode: 'vision_label_conflicts',
  decisionId: 'conflict-001',
  displayLabel: '제팅 | 플로우마크',
  recommendedNewAction: 'mark_needs_review',
  recommendationRisk: 'high',
  verificationCommand: 'npm run vision:label-conflicts:verify-decisions -- --decisions "C:\\repo\\workspace\\01.json"',
  ...overrides
});

const reviewSessionPlan = () => ({
  contractVersion: 'operational-hitl-review-session-plan/v1',
  status: 'ready_for_human_review',
  serviceWritesPerformed: false,
  sessions: [
    {
      code: 'label_conflict_session',
      titleKo: '승인 이미지 라벨 충돌 선검토',
      priority: 1,
      rowCount: 2,
      highRiskRows: 2,
      rows: [
        row(),
        row({
          decisionId: 'conflict-002',
          displayLabel: '수축 | 백화'
        })
      ]
    },
    {
      code: 'recapture_session',
      titleKo: '재촬영 요청 검토',
      priority: 2,
      rowCount: 1,
      highRiskRows: 1,
      rows: [
        row({
          queueCode: 'vision_pending_hitl',
          decisionId: 'pending-hitl-001',
          displayLabel: '교육용 도식',
          recommendedNewAction: 'request_recapture',
          verificationCommand: 'npm run vision:hitl:verify-decisions -- --decisions "C:\\repo\\workspace\\02.json"'
        })
      ]
    }
  ],
  summary: {
    totalRows: 3,
    sessionCount: 2,
    highRiskRows: 3
  }
});

const reviewSessionPacket = () => ({
  contractVersion: 'operational-hitl-review-session-packet/v1',
  status: 'ready_for_human_review',
  packetDir: 'C:\\repo\\artifacts\\session-packet-files',
  summary: {
    totalRows: 3,
    sessionPacketCount: 2,
    highRiskRows: 3,
    filesToWrite: 4
  },
  packets: [
    {
      code: 'label_conflict_session',
      csvPath: 'C:\\repo\\artifacts\\session-packet-files\\01-label-conflict-session.csv',
      markdownPath: 'C:\\repo\\artifacts\\session-packet-files\\01-label-conflict-session.md'
    },
    {
      code: 'recapture_session',
      csvPath: 'C:\\repo\\artifacts\\session-packet-files\\02-recapture-session.csv',
      markdownPath: 'C:\\repo\\artifacts\\session-packet-files\\02-recapture-session.md'
    }
  ]
});

const worktableImport = status => ({
  contractVersion: 'operational-hitl-decision-worktable-import/v1',
  status,
  serviceWritesPerformed: false,
  localEditableWritesPerformed: status === 'applied',
  summary: {
    totalRows: 3,
    plannedUpdates: status === 'no_actionable_rows' ? 0 : 3,
    invalidRows: status === 'invalid_worktable' ? 1 : 0,
    appliedUpdates: status === 'applied' ? 3 : 0
  },
  plannedUpdates: status === 'no_actionable_rows'
    ? []
    : [
      {
        queueCode: 'vision_label_conflicts',
        decisionId: 'conflict-001',
        action: 'mark_needs_review',
        verifyCommand: 'npm run vision:label-conflicts:verify-decisions -- --decisions "C:\\repo\\workspace\\01.json"'
      },
      ...(status === 'invalid_worktable' ? [] : [
        {
          queueCode: 'vision_label_conflicts',
          decisionId: 'conflict-002',
          action: 'keep_label',
          verifyCommand: 'npm run vision:label-conflicts:verify-decisions -- --decisions "C:\\repo\\workspace\\01.json"'
        },
        {
          queueCode: 'vision_pending_hitl',
          decisionId: 'pending-hitl-001',
          action: 'request_recapture',
          verifyCommand: 'npm run vision:hitl:verify-decisions -- --decisions "C:\\repo\\workspace\\02.json"'
        }
      ])
    ],
  invalidRows: status === 'invalid_worktable'
    ? [
      {
        queueCode: 'vision_label_conflicts',
        decisionId: 'conflict-002',
        action: 'keep_label',
        code: 'missing_required_fields',
        message: '필수 검토 필드가 부족합니다.',
        missingFields: ['selectedLabel', 'reviewer.id']
      }
    ]
    : []
});

const simulationOnlyWorktableImport = () => ({
  contractVersion: 'operational-hitl-decision-worktable-import/v1',
  status: 'invalid_worktable',
  serviceWritesPerformed: false,
  localEditableWritesPerformed: false,
  summary: {
    totalRows: 3,
    plannedUpdates: 0,
    invalidRows: 3,
    simulationOnlyRows: 3,
    appliedUpdates: 0
  },
  plannedUpdates: [],
  invalidRows: [
    {
      queueCode: 'vision_label_conflicts',
      decisionId: 'conflict-001',
      action: 'mark_needs_review',
      code: 'simulation_only_csv'
    },
    {
      queueCode: 'vision_label_conflicts',
      decisionId: 'conflict-002',
      action: 'mark_needs_review',
      code: 'simulation_only_csv'
    },
    {
      queueCode: 'vision_pending_hitl',
      decisionId: 'pending-hitl-001',
      action: 'request_recapture',
      code: 'simulation_only_csv'
    }
  ]
});

test('summarizes per-session HITL CSV completion and invalid rows without writes', () => {
  const progress = buildOperationalHitlReviewSessionProgress({
    generatedAt: '2026-07-27T17:20:00.000Z',
    reviewSessionPlan: reviewSessionPlan(),
    reviewSessionPacket: reviewSessionPacket(),
    worktableImport: worktableImport('invalid_worktable'),
    sourceArtifacts: {
      reviewSessionPlan: 'C:\\repo\\artifacts\\review-session-plan.json',
      reviewSessionPacket: 'C:\\repo\\artifacts\\review-session-packet.json',
      worktableImport: 'C:\\repo\\artifacts\\worktable-import.json'
    }
  });

  assert.equal(progress.contractVersion, 'operational-hitl-review-session-progress/v1');
  assert.equal(progress.status, 'invalid_worktable');
  assert.equal(progress.serviceWritesPerformed, false);
  assert.equal(progress.policy.autoApplyAllowed, false);
  assert.equal(progress.policy.allowGraphPromotion, false);
  assert.equal(progress.summary.totalRows, 3);
  assert.equal(progress.summary.completedRows, 1);
  assert.equal(progress.summary.pendingRows, 1);
  assert.equal(progress.summary.invalidRows, 1);
  assert.equal(progress.summary.sessionCount, 2);
  assert.equal(progress.summary.completeSessionCount, 0);
  assert.equal(progress.summary.blockedSessionCount, 1);
  assert.equal(progress.summary.packetFiles, 4);
  assert.equal(progress.sessions[0].status, 'invalid_worktable');
  assert.equal(progress.sessions[0].completedRows, 1);
  assert.equal(progress.sessions[0].invalidRows, 1);
  assert.equal(progress.sessions[0].csvPath, 'C:\\repo\\artifacts\\session-packet-files\\01-label-conflict-session.csv');
  assert.deepEqual(progress.sessions[0].invalidRowPreviews, [
    {
      queueCode: 'vision_label_conflicts',
      decisionId: 'conflict-002',
      action: 'keep_label',
      code: 'missing_required_fields',
      missingFields: ['selectedLabel', 'reviewer.id']
    }
  ]);
  assert.equal(progress.sessions[1].status, 'awaiting_human_csv_decisions');
  assert.equal(progress.sessions[1].pendingRows, 1);
  assert.match(progress.recommendedAction, /오류/);
  assert.equal(progress.sources.reviewSessionPacket, 'C:\\repo\\artifacts\\review-session-packet.json');
});

test('treats simulation-only safety smoke imports as ignored evidence instead of invalid human progress', () => {
  const progress = buildOperationalHitlReviewSessionProgress({
    generatedAt: '2026-07-28T03:05:00.000Z',
    reviewSessionPlan: reviewSessionPlan(),
    reviewSessionPacket: reviewSessionPacket(),
    worktableImport: simulationOnlyWorktableImport(),
    sourceArtifacts: {
      worktableImport: 'C:\\repo\\artifacts\\operational-hitl-decision-worktable-import-smoke.json'
    }
  });

  assert.equal(progress.status, 'awaiting_human_csv_decisions');
  assert.equal(progress.summary.totalRows, 3);
  assert.equal(progress.summary.completedRows, 0);
  assert.equal(progress.summary.pendingRows, 3);
  assert.equal(progress.summary.invalidRows, 0);
  assert.equal(progress.summary.ignoredSimulationOnlyRows, 3);
  assert.equal(progress.summary.blockedSessionCount, 0);
  assert.deepEqual(progress.sessions.map(session => session.status), [
    'awaiting_human_csv_decisions',
    'awaiting_human_csv_decisions'
  ]);
  assert.equal(progress.sessions[0].invalidRowPreviews.length, 0);
  assert.match(progress.markdown, /무시된 simulation-only import row: 3/);
});

test('reports ready for explicit worktable apply when every session row is valid', () => {
  const progress = buildOperationalHitlReviewSessionProgress({
    reviewSessionPlan: reviewSessionPlan(),
    reviewSessionPacket: reviewSessionPacket(),
    worktableImport: worktableImport('dry_run_ready')
  });

  assert.equal(progress.status, 'ready_for_worktable_apply');
  assert.equal(progress.summary.completedRows, 3);
  assert.equal(progress.summary.pendingRows, 0);
  assert.equal(progress.summary.invalidRows, 0);
  assert.equal(progress.summary.completeSessionCount, 2);
  assert.deepEqual(progress.sessions.map(session => session.status), [
    'ready_for_worktable_apply',
    'ready_for_worktable_apply'
  ]);
  assert.match(progress.recommendedAction, /worktable-import -- --apply/);
});

test('reports ready for preflight after local editable files have been applied', () => {
  const progress = buildOperationalHitlReviewSessionProgress({
    reviewSessionPlan: reviewSessionPlan(),
    reviewSessionPacket: reviewSessionPacket(),
    worktableImport: worktableImport('applied')
  });

  assert.equal(progress.status, 'ready_for_preflight');
  assert.equal(progress.summary.completedRows, 3);
  assert.equal(progress.summary.completeSessionCount, 2);
  assert.match(progress.recommendedAction, /editable-preflight/);
});

test('fails closed when required session progress evidence is missing', () => {
  const progress = buildOperationalHitlReviewSessionProgress({});

  assert.equal(progress.status, 'missing_evidence');
  assert.equal(progress.serviceWritesPerformed, false);
  assert.deepEqual(progress.summary.missingArtifactNames, [
    'reviewSessionPlan',
    'worktableImport'
  ]);
  assert.deepEqual(progress.sessions, []);
  assert.match(progress.recommendedAction, /review-session-plan/);
});
