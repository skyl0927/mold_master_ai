const assert = require('node:assert/strict');
const test = require('node:test');

const {
  summarizeVisionOperationalHitlWorkflowDisplay,
  summarizeVisionOperationalLabelConflictWorkflowDisplay
} = require('../visionOperationalHitlWorkflowDisplay');

test('summarizes awaiting HITL workflow for Settings UI display', () => {
  const display = summarizeVisionOperationalHitlWorkflowDisplay({
    tasks: [{
      code: 'close_hitl_reviews',
      workflowStatus: {
        status: 'awaiting_human_review',
        queue: {
          pendingHighConfidence: 12
        },
        template: {
          decisionsPrepared: 12
        },
        verification: {
          pendingQueueItems: 12,
          invalidDecisions: 0,
          acceptedDecisions: 0
        },
        nextCommand: 'npm run vision:hitl:verify-decisions -- --decisions <filled-common-agent-hitl-decisions.json>',
        nextActionKo: 'Common Agent/HITL 판정 파일을 작성하고 검증하세요.'
      }
    }]
  });

  assert.equal(display.title, 'HITL Workflow');
  assert.equal(display.statusLabel, '판정 작성/검증 대기');
  assert.equal(display.severity, 'warning');
  assert.equal(display.summaryText, '큐 12건 · 템플릿 12건 · 미판정 12건');
  assert.equal(display.nextCommand, 'npm run vision:hitl:verify-decisions -- --decisions <filled-common-agent-hitl-decisions.json>');
  assert.match(display.nextActionKo, /판정 파일/);
  assert.deepEqual(display.safetyBadges, [
    '자동 적용 금지',
    'Graph 승격 금지',
    'Reference 학습 금지'
  ]);
});

test('highlights invalid decisions before manual import is allowed', () => {
  const display = summarizeVisionOperationalHitlWorkflowDisplay({
    commonAgentHandoff: {
      items: [{
        taskCode: 'close_hitl_reviews',
        workflowStatus: {
          status: 'invalid_decisions',
          queue: {
            pendingHighConfidence: 12
          },
          template: {
            decisionsPrepared: 12
          },
          verification: {
            pendingQueueItems: 12,
            invalidDecisions: 3,
            acceptedDecisions: 0
          },
          nextCommand: 'npm run vision:hitl:verify-decisions -- --decisions <filled-common-agent-hitl-decisions.json>',
          nextActionKo: '유효하지 않은 HITL 판정을 수정하고 다시 검증하세요.'
        }
      }]
    }
  });

  assert.equal(display.statusLabel, '판정 오류 수정 필요');
  assert.equal(display.severity, 'danger');
  assert.equal(display.summaryText, '큐 12건 · 템플릿 12건 · 미판정 12건 · 오류 3건');
  assert.match(display.nextActionKo, /수정/);
});

test('shows the authorization bridge as the next step after decision verification is ready', () => {
  const display = summarizeVisionOperationalHitlWorkflowDisplay({
    tasks: [{
      code: 'close_hitl_reviews',
      workflowStatus: {
        status: 'ready_for_manual_import',
        queue: {
          pendingHighConfidence: 12
        },
        template: {
          decisionsPrepared: 12
        },
        verification: {
          pendingQueueItems: 0,
          invalidDecisions: 0,
          acceptedDecisions: 12
        },
        nonApprovalWorklist: {
          status: 'action_required',
          totalItems: 4,
          needsReviewItems: 1,
          rejectedCandidates: 1,
          recaptureRequests: 2
        },
        nextCommand: 'npm run vision:hitl:authorization-bridge -- --decision-verification <vision-pending-hitl-decision-verification-report.json>',
        nextCommands: [
          'npm run vision:hitl:authorization-bridge -- --decision-verification <vision-pending-hitl-decision-verification-report.json>',
          'npm run vision:hitl:non-approval-worklist -- --decision-verification <vision-pending-hitl-decision-verification-report.json>'
        ],
        nextActionKo: '검증된 판정을 authorization bridge로 변환하세요.'
      }
    }]
  });

  assert.equal(display.statusLabel, '수동 Import 준비');
  assert.equal(display.severity, 'success');
  assert.equal(display.summaryText, '큐 12건 · 템플릿 12건 · 검증 12건 · 미판정 0건 · 비승인 조치 4건');
  assert.match(display.nextCommand, /vision:hitl:authorization-bridge/);
  assert.deepEqual(display.nextCommands, [
    'npm run vision:hitl:authorization-bridge -- --decision-verification <vision-pending-hitl-decision-verification-report.json>',
    'npm run vision:hitl:non-approval-worklist -- --decision-verification <vision-pending-hitl-decision-verification-report.json>'
  ]);
  assert.match(display.nextActionKo, /authorization bridge/);
});

test('returns null when no HITL workflow is available to display', () => {
  assert.equal(summarizeVisionOperationalHitlWorkflowDisplay({ tasks: [] }), null);
  assert.equal(summarizeVisionOperationalHitlWorkflowDisplay(null), null);
});

test('summarizes approved label conflict workflow for Settings UI display', () => {
  const display = summarizeVisionOperationalLabelConflictWorkflowDisplay({
    tasks: [{
      code: 'resolve_label_conflicts',
      workflowStatus: {
        status: 'dry_run_ready',
        packet: {
          conflicts: 4
        },
        template: {
          decisionsPrepared: 4
        },
        verification: {
          acceptedDecisions: 4,
          invalidDecisions: 0,
          pendingConflicts: 0
        },
        apply: {
          plannedCaseUpdates: 5,
          appliedCaseUpdates: 0,
          localFixtureWritesPerformed: false
        },
        nextCommand: 'npm run vision:label-conflicts:apply -- --verification <vision-approved-label-conflict-decision-verification-report.json> --apply',
        nextActionKo: 'dry-run 결과를 확인한 뒤 사람이 승인하면 --apply로 로컬 fixture에 반영하세요.'
      }
    }]
  });

  assert.equal(display.title, 'Label Conflict Workflow');
  assert.equal(display.statusLabel, 'Apply 승인 대기');
  assert.equal(display.severity, 'warning');
  assert.equal(display.summaryText, '충돌 4건 · 템플릿 4건 · 검증 4건 · 미해결 0건 · 적용계획 5건');
  assert.match(display.nextCommand, /vision:label-conflicts:apply/);
  assert.match(display.nextActionKo, /--apply/);
  assert.deepEqual(display.safetyBadges, [
    '자동 적용 금지',
    'Graph 승격 금지',
    'Reference 학습 금지'
  ]);
});

test('highlights applied label conflict workflow as requiring post-HITL verification', () => {
  const display = summarizeVisionOperationalLabelConflictWorkflowDisplay({
    commonAgentHandoff: {
      items: [{
        taskCode: 'resolve_label_conflicts',
        workflowStatus: {
          status: 'applied',
          packet: {
            conflicts: 4
          },
          template: {
            decisionsPrepared: 4
          },
          verification: {
            acceptedDecisions: 4,
            invalidDecisions: 0,
            pendingConflicts: 0
          },
          apply: {
            plannedCaseUpdates: 5,
            appliedCaseUpdates: 5,
            localFixtureWritesPerformed: true
          },
          nextCommand: 'npm run migration:verify-post-hitl',
          nextActionKo: 'post-HITL 검증을 다시 실행하세요.'
        }
      }]
    }
  });

  assert.equal(display.statusLabel, '로컬 반영 완료');
  assert.equal(display.severity, 'success');
  assert.equal(display.summaryText, '충돌 4건 · 템플릿 4건 · 검증 4건 · 미해결 0건 · 적용계획 5건 · 반영 5건');
  assert.equal(display.nextCommand, 'npm run migration:verify-post-hitl');
});

test('returns null when no label conflict workflow is available to display', () => {
  assert.equal(summarizeVisionOperationalLabelConflictWorkflowDisplay({ tasks: [] }), null);
  assert.equal(summarizeVisionOperationalLabelConflictWorkflowDisplay(null), null);
});
