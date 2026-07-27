const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildVisionBboxOverlayIndex,
  buildVisionBboxOverlayItems,
  buildVisionBboxOverlayReviewModel
} = require('../visionBboxOverlay');

test('converts normalized observation bbox to percent overlay geometry', () => {
  const overlays = buildVisionBboxOverlayItems({
    primaryCandidate: {
      defectType: '백화',
      supportingObservationIds: ['obs-white']
    },
    visualObservations: [
      {
        observationId: 'obs-white',
        category: 'color',
        description: '리브 주변 유백색 변색',
        region: '리브 기부',
        confidence: 0.91,
        regionBbox: {
          coordinateSystem: 'normalized_xywh',
          x: 0.125,
          y: 0.25,
          width: 0.33,
          height: 0.2,
          confidence: 0.78
        }
      }
    ]
  });

  assert.equal(overlays.length, 1);
  assert.deepEqual(overlays[0].geometry, {
    leftPct: 12.5,
    topPct: 25,
    widthPct: 33,
    heightPct: 20
  });
  assert.equal(overlays[0].observationId, 'obs-white');
  assert.equal(overlays[0].isPrimarySupport, true);
  assert.equal(overlays[0].label, 'obs-white · color · 78%');
});

test('clips overlay boxes so invalid legacy coordinates cannot overflow the image', () => {
  const overlays = buildVisionBboxOverlayItems({
    primaryCandidate: {
      defectType: '플래시',
      supportingObservationIds: []
    },
    visualObservations: [
      {
        observationId: 'obs-edge',
        category: 'boundary',
        description: '파팅라인 외측 돌출',
        region: '파팅라인',
        confidence: 0.88,
        regionBbox: {
          coordinateSystem: 'normalized_xywh',
          x: 0.9,
          y: -0.1,
          width: 0.35,
          height: 0.22,
          confidence: 0.66
        }
      }
    ]
  });

  assert.equal(overlays.length, 1);
  assert.deepEqual(overlays[0].geometry, {
    leftPct: 90,
    topPct: 0,
    widthPct: 10,
    heightPct: 12
  });
  assert.equal(overlays[0].isPrimarySupport, false);
});

test('drops missing, empty, or unsupported bbox entries from the overlay list', () => {
  const overlays = buildVisionBboxOverlayItems({
    visualObservations: [
      {
        observationId: 'obs-none',
        category: 'surface',
        description: 'bbox 없음',
        confidence: 0.5
      },
      {
        observationId: 'obs-pixel',
        category: 'surface',
        description: 'pixel 좌표계',
        confidence: 0.5,
        regionBbox: {
          coordinateSystem: 'pixel_xywh',
          x: 10,
          y: 10,
          width: 100,
          height: 100,
          confidence: 0.5
        }
      },
      {
        observationId: 'obs-empty',
        category: 'surface',
        description: '빈 박스',
        confidence: 0.5,
        regionBbox: {
          coordinateSystem: 'normalized_xywh',
          x: 1,
          y: 1,
          width: 0,
          height: 0,
          confidence: 0.5
        }
      }
    ]
  });

  assert.deepEqual(overlays, []);
});

test('indexes overlay numbers by observation id for reviewer cross-checking', () => {
  const overlayIndex = buildVisionBboxOverlayIndex({
    primaryCandidate: {
      defectType: '웰드라인',
      supportingObservationIds: ['obs-primary']
    },
    visualObservations: [
      {
        observationId: 'obs-secondary',
        category: 'surface',
        description: '비지원 후보 관찰',
        confidence: 0.94,
        regionBbox: {
          coordinateSystem: 'normalized_xywh',
          x: 0.1,
          y: 0.1,
          width: 0.2,
          height: 0.2,
          confidence: 0.94
        }
      },
      {
        observationId: 'obs-primary',
        category: 'line',
        description: '주요 결함 근거 관찰',
        confidence: 0.72,
        regionBbox: {
          coordinateSystem: 'normalized_xywh',
          x: 0.5,
          y: 0.5,
          width: 0.2,
          height: 0.2,
          confidence: 0.72
        }
      }
    ]
  });

  assert.equal(overlayIndex.items.length, 2);
  assert.equal(overlayIndex.items[0].observationId, 'obs-primary');
  assert.equal(overlayIndex.items[0].displayIndex, 1);
  assert.equal(overlayIndex.items[0].tone, 'primary');
  assert.equal(overlayIndex.items[1].observationId, 'obs-secondary');
  assert.equal(overlayIndex.items[1].displayIndex, 2);
  assert.equal(overlayIndex.items[1].tone, 'secondary');
  assert.equal(overlayIndex.byObservationId['obs-primary'].displayIndex, 1);
  assert.equal(overlayIndex.byObservationId['obs-secondary'].displayIndex, 2);
});

test('marks active overlay evidence and dims the remaining review items', () => {
  const visionSummary = {
    primaryCandidate: {
      defectType: '웰드라인',
      supportingObservationIds: ['obs-primary']
    },
    visualObservations: [
      {
        observationId: 'obs-primary',
        category: 'line',
        description: '주요 결함 근거 관찰',
        confidence: 0.8,
        regionBbox: {
          coordinateSystem: 'normalized_xywh',
          x: 0.1,
          y: 0.1,
          width: 0.3,
          height: 0.2,
          confidence: 0.8
        }
      },
      {
        observationId: 'obs-secondary',
        category: 'surface',
        description: '보조 관찰',
        confidence: 0.7,
        regionBbox: {
          coordinateSystem: 'normalized_xywh',
          x: 0.5,
          y: 0.5,
          width: 0.2,
          height: 0.2,
          confidence: 0.7
        }
      }
    ]
  };

  const reviewModel = buildVisionBboxOverlayReviewModel(visionSummary, 'obs-secondary');

  assert.equal(reviewModel.hasActiveFocus, true);
  assert.equal(reviewModel.activeObservationId, 'obs-secondary');
  assert.equal(reviewModel.byObservationId['obs-secondary'].isActive, true);
  assert.equal(reviewModel.byObservationId['obs-secondary'].isDimmed, false);
  assert.equal(reviewModel.byObservationId['obs-primary'].isActive, false);
  assert.equal(reviewModel.byObservationId['obs-primary'].isDimmed, true);

  const missingFocusModel = buildVisionBboxOverlayReviewModel(visionSummary, 'obs-missing');
  assert.equal(missingFocusModel.hasActiveFocus, false);
  assert.equal(missingFocusModel.activeObservationId, '');
  assert.equal(missingFocusModel.byObservationId['obs-primary'].isDimmed, false);
  assert.equal(missingFocusModel.byObservationId['obs-secondary'].isDimmed, false);
});
