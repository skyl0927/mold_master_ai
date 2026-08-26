const INSPECTION_CARD_TABS = Object.freeze([
  Object.freeze({ id: 'capture', labelKo: '촬영 정보' }),
  Object.freeze({ id: 'phenomenon', labelKo: '현상 설명' }),
  Object.freeze({ id: 'analysis', labelKo: '분석' })
]);

const SUPPORTED_PANELS = new Set(INSPECTION_CARD_TABS.map(tab => tab.id));

function toggleInspectionCardPanel(openPanels, imageId, panel) {
  if (!imageId || typeof imageId !== 'string') throw new TypeError('image id is required');
  if (!SUPPORTED_PANELS.has(panel)) throw new RangeError(`unsupported inspection card panel: ${panel}`);

  const current = openPanels && typeof openPanels === 'object' ? openPanels : {};
  const next = { ...current };
  if (next[imageId] === panel) {
    delete next[imageId];
  } else {
    next[imageId] = panel;
  }
  return next;
}

module.exports = {
  INSPECTION_CARD_TABS,
  toggleInspectionCardPanel
};
