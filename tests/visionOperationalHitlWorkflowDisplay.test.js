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

test('returns null when no HITL workflow is available to display', () => {
  assert.equal(summarizeVisionOperationalHitlWorkflowDisplay({ tasks: [] }), null);
  assert.equal(summarizeVisionOperationalHitlWorkflowDisplay(null), null);
});
