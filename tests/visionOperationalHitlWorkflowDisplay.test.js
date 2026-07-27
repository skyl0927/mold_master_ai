const assert = require('node:assert/strict');
const test = require('node:test');

const {
  summarizeVisionOperationalHitlWorkflowDisplay
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
