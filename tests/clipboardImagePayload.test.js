const assert = require('node:assert/strict');
const test = require('node:test');

const { parseClipboardPngDataUrl } = require('../clipboardImagePayload');

test('accepts a non-empty PNG data URL for native clipboard transfer', () => {
  const parsed = parseClipboardPngDataUrl('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB');

  assert.equal(parsed.mimeType, 'image/png');
  assert.equal(parsed.dataUrl, 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB');
  assert.ok(parsed.payloadByteLength > 0);
});

test('rejects missing, non-PNG, malformed, and empty clipboard payloads', () => {
  assert.throws(() => parseClipboardPngDataUrl(), /required/i);
  assert.throws(() => parseClipboardPngDataUrl('data:image/jpeg;base64,AAAA'), /PNG/i);
  assert.throws(() => parseClipboardPngDataUrl('data:image/png;base64,'), /empty/i);
  assert.throws(() => parseClipboardPngDataUrl('data:image/png;base64,@@@'), /base64/i);
});
