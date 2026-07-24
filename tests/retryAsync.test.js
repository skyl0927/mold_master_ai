const assert = require('node:assert/strict');
const test = require('node:test');

const { retryAsync } = require('../retryAsync');

test('retries a transient failure and returns the successful value', async () => {
  let attempts = 0;
  const value = await retryAsync(async () => {
    attempts += 1;
    if (attempts < 3) throw new Error('temporarily unavailable');
    return 'ok';
  }, {
    attempts: 3,
    delayMs: 0
  });

  assert.equal(value, 'ok');
  assert.equal(attempts, 3);
});

test('throws the final error after all attempts fail', async () => {
  let attempts = 0;
  await assert.rejects(
    retryAsync(async () => {
      attempts += 1;
      throw new Error(`failure-${attempts}`);
    }, {
      attempts: 2,
      delayMs: 0
    }),
    /failure-2/
  );
  assert.equal(attempts, 2);
});
