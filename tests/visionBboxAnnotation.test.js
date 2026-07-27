const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildVisionBboxAnnotationPayloads
} = require('../visionBboxAnnotation');

const visionSummary = {
  primaryCandidate: {
    defectType: '백화',
    supportingObservationIds: ['obs-white', 'obs-location']
  },
  visualObservations: [
    {
      observationId: 'obs-white',
      category: 'color',
      description: '리브 기부의 유백색 변색',
      region: '리브 기부',
      confidence: 0.91,
      regionBbox: {
        coordinateSystem: 'normalized_xywh',
        x: 0.12,
        y: 0.22,
        width: 0.31,
        height: 0.18,
        confidence: 0.87
      }
    },
    {
      observationId: 'obs-edge',
      category: 'boundary',
      description: '취출 방향 주변 경계 변화',
      region: '취출부',
      confidence: 0.81,
      regionBbox: {
        coordinateSystem: 'normalized_xywh',
        x: 0.55,
        y: 0.2,
        width: 0.16,
        height: 0.2,
        confidence: 0.72
      }
    }
  ]
};

test('builds Common Agent candidate annotations from Vision observation bboxes', () => {
  const payloads = buildVisionBboxAnnotationPayloads({
    image: {
      id: 'local-image-1',
      commonAgentImageId: 'image-common-1',
      captureSessionId: 'capture-session-1',
      captureViewTag: 'defect_closeup',
      captureImageKind: 'physical_product',
      captureSource: 'camera',
      analysis: {
        defectType: '백화',
        visionSummary
      }
    }
  });

  assert.equal(payloads.length, 2);
  assert.deepEqual(payloads[0], {
    label: '백화',
    annotation_type: 'bbox',
    bbox: {
      coordinate_system: 'normalized_xywh',
      x: 0.12,
      y: 0.22,
      width: 0.31,
      height: 0.18
    },
    review_status: 'candidate',
    source_app: 'mold-master-ai',
    note: 'vision observation bbox candidate',
    metadata: {
      local_image_id: 'local-image-1',
      common_agent_image_id: 'image-common-1',
      local_vision_observation_id: 'obs-white',
      vision_observation_category: 'color',
      vision_observation_region: '리브 기부',
      vision_observation_description: '리브 기부의 유백색 변색',
      vision_observation_confidence: 0.91,
      vision_bbox_confidence: 0.87,
      vision_primary_support: true,
      vision_candidate_defect_type: '백화',
      capture_session_id: 'capture-session-1',
      capture_view_tags: ['defect_closeup'],
      vision_image_kind: 'physical_product',
      capture_source: 'camera',
      source: 'vision-observation/v2'
    }
  });
  assert.equal(payloads[1].label, 'vision_boundary_roi');
  assert.equal(payloads[1].metadata.vision_primary_support, false);
});

test('skips observations that were already synced to Common Agent annotations', () => {
  const payloads = buildVisionBboxAnnotationPayloads({
    image: {
      id: 'local-image-1',
      commonAgentImageId: 'image-common-1',
      analysis: {
        defectType: '백화',
        visionSummary
      }
    },
    existingAnnotations: [
      {
        annotation_id: 'ann-1',
        image_id: 'image-common-1',
        annotation_type: 'bbox',
        review_status: 'candidate',
        source_app: 'mold-master-ai',
        metadata: {
          local_vision_observation_id: 'obs-white'
        }
      }
    ]
  });

  assert.equal(payloads.length, 1);
  assert.equal(payloads[0].metadata.local_vision_observation_id, 'obs-edge');
});

test('drops unsupported or empty Vision bboxes from annotation payloads', () => {
  const payloads = buildVisionBboxAnnotationPayloads({
    image: {
      id: 'local-image-1',
      analysis: {
        defectType: '백화',
        visionSummary: {
          primaryCandidate: {
            defectType: '백화',
            supportingObservationIds: []
          },
          visualObservations: [
            {
              observationId: 'obs-none',
              category: 'color',
              description: 'bbox 없음'
            },
            {
              observationId: 'obs-pixel',
              category: 'surface',
              description: 'pixel bbox',
              regionBbox: {
                coordinateSystem: 'pixel_xywh',
                x: 10,
                y: 10,
                width: 50,
                height: 50,
                confidence: 0.5
              }
            },
            {
              observationId: 'obs-empty',
              category: 'surface',
              description: 'empty bbox',
              regionBbox: {
                coordinateSystem: 'normalized_xywh',
                x: 0.2,
                y: 0.2,
                width: 0,
                height: 0,
                confidence: 0.5
              }
            }
          ]
        }
      }
    }
  });

  assert.deepEqual(payloads, []);
});
