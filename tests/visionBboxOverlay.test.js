const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildVisionBboxOverlayItems
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
