const assert = require('node:assert/strict');
const test = require('node:test');

const {
  INSPECTION_CARD_TABS,
  toggleInspectionCardPanel
} = require('../inspectionCardPanel');

test('defines the compact inspection card tabs in operator workflow order', () => {
  assert.deepEqual(INSPECTION_CARD_TABS, [
    { id: 'capture', labelKo: '촬영 정보' },
    { id: 'phenomenon', labelKo: '현상 설명' },
    { id: 'analysis', labelKo: '분석' }
  ]);
});

test('opens one panel per image and closes it when the active tab is clicked again', () => {
  const opened = toggleInspectionCardPanel({}, 'image-1', 'capture');
  assert.deepEqual(opened, { 'image-1': 'capture' });

  const switched = toggleInspectionCardPanel(opened, 'image-1', 'analysis');
  assert.deepEqual(switched, { 'image-1': 'analysis' });

  const closed = toggleInspectionCardPanel(switched, 'image-1', 'analysis');
  assert.deepEqual(closed, {});
});

test('keeps expanded panels isolated between image cards', () => {
  const first = toggleInspectionCardPanel({}, 'image-1', 'phenomenon');
  const second = toggleInspectionCardPanel(first, 'image-2', 'analysis');

  assert.deepEqual(second, {
    'image-1': 'phenomenon',
    'image-2': 'analysis'
  });
  assert.deepEqual(first, { 'image-1': 'phenomenon' });
  assert.throws(() => toggleInspectionCardPanel(second, '', 'capture'), /image id/i);
  assert.throws(() => toggleInspectionCardPanel(second, 'image-3', 'unknown'), /unsupported/i);
});
