const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadImageUrls, releaseImageUrls } = fs.existsSync(path.join(__dirname, '../commonAgentImageUrls.js'))
  ? require('../commonAgentImageUrls') : {};

test('image downloads are bounded and independent failures keep the rest of the gallery usable', async () => {
  let live = 0;
  let peak = 0;
  const items = Array.from({ length: 9 }, (_, index) => ({ image_id: String(index) }));
  const result = await loadImageUrls(items, async id => {
    live++; peak = Math.max(peak, live);
    await new Promise(resolve => setTimeout(resolve, 2));
    live--;
    if (id === '4') throw new Error('image unavailable');
    return `blob:${id}`;
  });
  assert.equal(peak, 4);
  assert.equal(Object.keys(result.urls).length, 8);
  assert.deepEqual(result.failures, ['4']);
});

test('only owned blob URLs are revoked on replace or unmount', () => {
  const released = [];
  releaseImageUrls({ one: 'blob:one', two: 'http://localhost/image.png' }, url => released.push(url));
  assert.deepEqual(released, ['blob:one']);
});
