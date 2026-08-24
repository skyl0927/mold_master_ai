const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildDimensionEvidence,
  formatDimensionEvidenceForPrompt,
  formatDimensionEvidenceForReport
} = require('../dimensionEvidence');

const automaticDimension = {
  id: 'dim-1',
  tool: 'dimension',
  text: '5.50 mm',
  measuredValue: 5.5,
  displayValue: 5.5,
  unit: 'mm',
  calibrationId: 'cal-1',
  manualOverride: false,
  measurementConfidence: 'reference',
  measurementReviewStatus: 'candidate',
  points: [{ x: 0, y: 0 }, { x: 55, y: 0 }]
};

test('returns a stable agent observation contract for candidate measurements', () => {
  const evidence = buildDimensionEvidence([automaticDimension]);

  assert.equal(evidence.status, 'warning');
  assert.match(evidence.summary, /1개/);
  assert.deepEqual(evidence.next_actions, ['사람 검토 후 승인 또는 보정']);
  assert.deepEqual(evidence.artifacts, []);
  assert.equal(evidence.measurementCount, 1);
  assert.equal(evidence.approvedCount, 0);
  assert.equal(evidence.graphPromotionAllowed, false);
  assert.deepEqual(evidence.measurements[0], {
    id: 'dim-1',
    label: '5.50 mm',
    measuredValue: 5.5,
    displayValue: 5.5,
    unit: 'mm',
    calibrationId: 'cal-1',
    manualOverride: false,
    confidence: 'reference',
    reviewStatus: 'candidate',
    source: 'manual_calibration',
    graphPromotionAllowed: false
  });
});

test('allows graph promotion only when every measurement is approved', () => {
  const evidence = buildDimensionEvidence([{
    ...automaticDimension,
    measurementReviewStatus: 'approved'
  }]);

  assert.equal(evidence.status, 'success');
  assert.equal(evidence.approvedCount, 1);
  assert.equal(evidence.graphPromotionAllowed, true);
  assert.deepEqual(evidence.next_actions, []);
});

test('manual overrides remain explicit in the prompt evidence', () => {
  const evidence = buildDimensionEvidence([{
    ...automaticDimension,
    id: 'dim-manual',
    displayValue: 5.2,
    text: '5.20 mm',
    manualOverride: true,
    measurementReviewStatus: 'approved'
  }]);
  const prompt = formatDimensionEvidenceForPrompt(evidence);

  assert.match(prompt, /표시 5\.20 mm/);
  assert.match(prompt, /자동 5\.50 mm/);
  assert.match(prompt, /수동 보정/);
  assert.match(prompt, /검토 승인/);
});

test('ignores legacy px dimensions as real-world measurement evidence', () => {
  const evidence = buildDimensionEvidence([{
    id: 'legacy',
    tool: 'dimension',
    text: '100px',
    unit: 'px',
    legacyDimension: true,
    points: [{ x: 0, y: 0 }, { x: 100, y: 0 }]
  }]);

  assert.equal(evidence.status, 'warning');
  assert.equal(evidence.measurementCount, 0);
  assert.equal(evidence.graphPromotionAllowed, false);
  assert.match(evidence.summary, /실단위 치수 증거 없음/);
});

test('formats approved measurements for report exports without exposing reasoning traces', () => {
  const evidence = buildDimensionEvidence([{
    ...automaticDimension,
    displayValue: 5.2,
    text: '5.20 mm',
    manualOverride: true,
    measurementReviewStatus: 'approved'
  }]);

  assert.equal(
    formatDimensionEvidenceForReport(evidence),
    '5.20 mm (자동 5.50 mm, 수동 보정, 승인)'
  );
});
