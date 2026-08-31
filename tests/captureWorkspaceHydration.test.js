const assert = require('node:assert/strict');
const test = require('node:test');

const { isCaptureWorkspaceHydrated } = require('../captureWorkspaceProtocol');

test('blocks workspace sync until every restored image is present in renderer state', () => {
  const restoredIds = ['capture-full', 'capture-close'];

  assert.equal(isCaptureWorkspaceHydrated(restoredIds, []), false);
  assert.equal(isCaptureWorkspaceHydrated(restoredIds, [{ id: 'capture-full' }]), false);
  assert.equal(isCaptureWorkspaceHydrated(restoredIds, [
    { id: 'capture-full' },
    { id: 'capture-close' }
  ]), true);
});

test('an empty persisted workspace hydrates immediately', () => {
  assert.equal(isCaptureWorkspaceHydrated([], []), true);
});
