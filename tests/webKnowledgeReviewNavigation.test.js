const assert = require('node:assert/strict');
const test = require('node:test');

const { nextPendingReviewCaseId } = require('../webKnowledgeReviewNavigation');

const item = (caseId, decision = 'pending', isCurrent = true) => ({
  card: { caseId },
  decision,
  isCurrent
});

test('next pending review wraps after the current card', () => {
  const queue = [
    item('a', 'approved'),
    item('b', 'pending'),
    item('c', 'pending')
  ];
  assert.equal(nextPendingReviewCaseId(queue, 'b'), 'c');
  assert.equal(nextPendingReviewCaseId(queue, 'c'), 'b');
});

test('stale decisions are prioritized as pending review work', () => {
  const queue = [
    item('a', 'approved'),
    item('b', 'approved', false),
    item('c', 'rejected')
  ];
  assert.equal(nextPendingReviewCaseId(queue, 'a'), 'b');
});

test('no pending work returns an empty case id', () => {
  assert.equal(nextPendingReviewCaseId([
    item('a', 'approved'),
    item('b', 'rejected')
  ], 'a'), '');
});
