const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildVisionRetrievalQuery,
  normalizeVisionObservation,
  parseProviderVisionObservationText,
  parseVisionObservationText
} = require('../visionObservation');

test('parses and ranks a structured Top-3 Vision observation', () => {
  const observation = parseVisionObservationText(JSON.stringify({
    contract_version: 'vision-observation/v2',
    image_kind: 'physical_product',
    normality_status: 'defect_visible',
    observations: [
      {
        observation_id: 'obs-boundary-1',
        category: 'boundary',
        description: '\uC120\uD615 \uACBD\uACC4',
        region: 'ROI \uC911\uC559',
        confidence: 0.91
      },
      {
        observation_id: 'obs-gloss-1',
        category: 'contrast',
        description: '\uC720\uB3D9 \uBC29\uD5A5 \uAD11\uD0DD\uCC28',
        region: 'ROI \uC6B0\uCE21',
        confidence: 0.83
      }
    ],
    candidates: [
      {
        defect_type: '\uD50C\uB85C\uC6B0\uB9C8\uD06C',
        confidence: 0.31,
        supporting_observation_ids: ['obs-gloss-1']
      },
      {
        defect_type: '\uC6F0\uB4DC\uB77C\uC778',
        confidence: 0.54,
        supporting_observation_ids: ['obs-boundary-1'],
        contradicting_observation_ids: ['obs-gloss-1']
      },
      {
        defect_type: '\uC81C\uD305',
        confidence: 0.15,
        supporting_observation_ids: ['obs-gloss-1']
      }
    ],
    required_additional_views: ['\uC0AC\uAD11 \uCD2C\uC601']
  }));

  assert.deepEqual(
    observation.candidates.map(candidate => candidate.defectType),
    ['\uC6F0\uB4DC\uB77C\uC778', '\uD50C\uB85C\uC6B0\uB9C8\uD06C', '\uC81C\uD305']
  );
  assert.equal(observation.decisionStatus, 'needs_review');
  assert.match(observation.decisionReason, /margin/i);
  assert.deepEqual(observation.requiredAdditionalViews, ['\uC0AC\uAD11 \uCD2C\uC601']);
  assert.equal(observation.contractVersion, 'vision-observation/v2');
  assert.equal(observation.groundingStatus, 'grounded');
  assert.equal(observation.visualObservations[0].observationId, 'obs-boundary-1');
  assert.deepEqual(
    observation.candidates[0].supportingObservationIds,
    ['obs-boundary-1']
  );
});

test('marks a separated high-confidence candidate with independent visual evidence as probable, not confirmed', () => {
  const observation = normalizeVisionObservation({
    contract_version: 'vision-observation/v2',
    image_kind: 'physical_product',
    normality_status: 'defect_visible',
    observations: [
      {
        observation_id: 'obs-flash-1',
        category: 'geometry',
        description: '\uD30C\uD305\uB77C\uC778 \uBC16\uC73C\uB85C \uC5C7\uC740 \uB3CC\uCD9C',
        region: '\uD30C\uD305\uB77C\uC778',
        confidence: 0.92
      },
      {
        observation_id: 'obs-boundary-1',
        category: 'boundary',
        description: '\uAE08\uD615 \uACBD\uACC4 \uC678\uCE21\uC73C\uB85C \uC5F0\uC18D\uB418\uB294 \uC587\uC740 \uC120\uD615 \uD615\uC0C1',
        region: '\uD30C\uD305\uB77C\uC778',
        confidence: 0.88
      }
    ],
    candidates: [
      {
        defect_type: '\uD50C\uB798\uC2DC',
        confidence: 0.84,
        supporting_observation_ids: ['obs-flash-1', 'obs-boundary-1']
      },
      {
        defect_type: '\uC2A4\uD06C\uB798\uCE58',
        confidence: 0.21,
        supporting_observation_ids: ['obs-boundary-1']
      }
    ]
  });

  assert.equal(observation.decisionStatus, 'probable');
  assert.equal(observation.primaryCandidate.defectType, '\uD50C\uB798\uC2DC');
  assert.equal(observation.safetyGate.status, 'reliable');
  assert.equal(observation.safetyGate.autoGraphCandidateUseAllowed, true);
});

test('downgrades a high-confidence candidate when supporting bbox evidence is weak', () => {
  const observation = normalizeVisionObservation({
    contract_version: 'vision-observation/v2',
    image_kind: 'physical_product',
    normality_status: 'defect_visible',
    observations: [
      {
        observation_id: 'obs-white-region',
        category: 'color',
        description: 'milky white discoloration near a rib',
        region: 'rib base',
        region_bbox: {
          coordinate_system: 'normalized_xywh',
          x: 0,
          y: 0,
          width: 1,
          height: 1,
          confidence: 0.42
        },
        confidence: 0.94
      },
      {
        observation_id: 'obs-location',
        category: 'location',
        description: 'suspect area is near the rib base',
        region: 'rib base',
        region_bbox: {
          coordinate_system: 'normalized_xywh',
          x: 0.12,
          y: 0.14,
          width: 0.28,
          height: 0.2,
          confidence: 0.84
        },
        confidence: 0.88
      }
    ],
    candidates: [
      {
        defect_type: 'whitening',
        confidence: 0.86,
        supporting_observation_ids: ['obs-white-region', 'obs-location'],
        contradicting_observation_ids: []
      },
      {
        defect_type: 'sink mark',
        confidence: 0.18,
        supporting_observation_ids: ['obs-location'],
        contradicting_observation_ids: ['obs-white-region']
      }
    ]
  });

  assert.equal(observation.decisionStatus, 'needs_review');
  assert.equal(observation.decisionReason, 'vision_safety_gate_requires_review');
  assert.equal(observation.safetyGate.status, 'needs_review');
  assert.equal(observation.safetyGate.autoGraphCandidateUseAllowed, false);
  assert.equal(observation.safetyGate.supportPixelGroundingCount, 2);
  assert.equal(observation.safetyGate.weakPixelGroundingCount, 1);
  assert.ok(observation.safetyGate.reasons.includes('low_region_bbox_confidence'));
  assert.ok(observation.safetyGate.reasons.includes('overbroad_region_bbox'));
});

test('applies a stricter bbox grounding profile for close-up defect views', () => {
  const observation = normalizeVisionObservation({
    contract_version: 'vision-observation/v2',
    image_kind: 'physical_product',
    normality_status: 'defect_visible',
    capture_view_tag: 'defect_closeup',
    observations: [
      {
        observation_id: 'obs-whitening-color',
        category: 'color',
        description: 'localized milky whitening near the rib edge',
        region: 'rib edge close-up',
        region_bbox: {
          coordinate_system: 'normalized_xywh',
          x: 0.08,
          y: 0.1,
          width: 0.75,
          height: 0.8,
          confidence: 0.68
        },
        confidence: 0.92
      },
      {
        observation_id: 'obs-whitening-location',
        category: 'location',
        description: 'defect candidate is around the rib base',
        region: 'rib base close-up',
        region_bbox: {
          coordinate_system: 'normalized_xywh',
          x: 0.18,
          y: 0.18,
          width: 0.32,
          height: 0.24,
          confidence: 0.82
        },
        confidence: 0.9
      }
    ],
    candidates: [
      {
        defect_type: 'whitening',
        confidence: 0.88,
        supporting_observation_ids: ['obs-whitening-color', 'obs-whitening-location'],
        contradicting_observation_ids: []
      },
      {
        defect_type: 'sink mark',
        confidence: 0.18,
        supporting_observation_ids: ['obs-whitening-location'],
        contradicting_observation_ids: ['obs-whitening-color']
      }
    ]
  });

  assert.equal(observation.decisionStatus, 'needs_review');
  assert.equal(observation.safetyGate.bboxGroundingProfileId, 'defect_closeup_precision');
  assert.equal(observation.safetyGate.bboxGroundingThresholds.minConfidence, 0.72);
  assert.equal(observation.safetyGate.bboxGroundingThresholds.maxArea, 0.55);
  assert.equal(observation.safetyGate.autoGraphCandidateUseAllowed, false);
  assert.ok(observation.safetyGate.reasons.includes('low_region_bbox_confidence'));
  assert.ok(observation.safetyGate.reasons.includes('overbroad_region_bbox'));
});

test('downgrades a high-confidence candidate when only one visual observation supports it', () => {
  const observation = normalizeVisionObservation({
    contract_version: 'vision-observation/v2',
    image_kind: 'physical_product',
    normality_status: 'defect_visible',
    observations: [{
      observation_id: 'obs-white-1',
      category: 'color',
      description: '\uB9AC\uBE0C \uAE30\uBD80\uC5D0 \uC720\uBC31\uC0C9 \uBCC0\uC0C9',
      region: '\uB9AC\uBE0C \uC8FC\uBCC0',
      confidence: 0.94
    }],
    candidates: [
      {
        defect_type: '\uBC31\uD654',
        confidence: 0.91,
        supporting_observation_ids: ['obs-white-1']
      },
      {
        defect_type: '\uBC00\uD540 \uC790\uAD6D',
        confidence: 0.16,
        supporting_observation_ids: ['obs-white-1']
      }
    ]
  });

  assert.equal(observation.candidates.length, 2);
  assert.equal(observation.primaryCandidate.defectType, '\uBC31\uD654');
  assert.equal(observation.decisionStatus, 'needs_review');
  assert.equal(observation.decisionReason, 'vision_safety_gate_requires_review');
  assert.equal(observation.safetyGate.status, 'needs_review');
  assert.equal(observation.safetyGate.autoGraphCandidateUseAllowed, false);
  assert.ok(observation.safetyGate.reasons.includes('insufficient_independent_visual_evidence'));
});

test('falls back safely from the legacy Defect and Desc format', () => {
  const observation = parseVisionObservationText(
    'Defect: \uBC31\uD654 | Desc: \uB9AC\uBE0C \uC8FC\uBCC0\uC758 \uD750\uB9B0 \uC720\uBC31\uC0C9 \uBCC0\uC0C9'
  );

  assert.equal(observation.candidates.length, 1);
  assert.equal(observation.candidates[0].defectType, '\uBC31\uD654');
  assert.equal(observation.decisionStatus, 'needs_review');
});

test('normalizes a Common Agent observation that only contains defect_type', () => {
  const observation = normalizeVisionObservation({
    defect_type: '\uC6F0\uB4DC\uB77C\uC778',
    confidence: 0.72,
    visible_features: ['\uC720\uB3D9 \uD569\uB958\uBD80\uC758 \uAC00\uB294 \uC120']
  });

  assert.equal(observation.candidates.length, 1);
  assert.equal(observation.primaryCandidate.defectType, '\uC6F0\uB4DC\uB77C\uC778');
  assert.equal(observation.primaryCandidate.confidence, 0.72);
  assert.equal(observation.decisionStatus, 'needs_review');
});

test('treats an explicit unclassifiable label as abstention, not as a defect candidate', () => {
  const observation = normalizeVisionObservation({
    defect_type: '\uD310\uC815 \uBD88\uAC00',
    confidence: 0.93,
    summary: '\uACB0\uD568 \uD615\uC0C1\uC744 \uAD6C\uBD84\uD560 \uC218 \uC5C6\uC74C'
  });

  assert.equal(observation.candidates.length, 0);
  assert.equal(observation.primaryCandidate, null);
  assert.equal(observation.decisionStatus, 'unclassifiable');
});

test('builds Graph retrieval from observations and all candidates, not only Top-1', () => {
  const observation = normalizeVisionObservation({
    contract_version: 'vision-observation/v2',
    image_kind: 'physical_product',
    normality_status: 'defect_visible',
    observations: [
      {
        observation_id: 'obs-circle',
        category: 'boundary',
        description: '\uC6D0\uD615 \uACBD\uACC4',
        region: '\uCDE8\uCD9C\uBD80',
        confidence: 0.9
      },
      {
        observation_id: 'obs-white',
        category: 'color',
        description: '\uCDE8\uCD9C\uBD80 \uC8FC\uBCC0 \uBC31\uD654',
        region: '\uB9AC\uBE0C \uC8FC\uBCC0',
        confidence: 0.88
      }
    ],
    candidates: [
      {
        defect_type: '\uBC00\uD540 \uC790\uAD6D',
        confidence: 0.61,
        supporting_observation_ids: ['obs-circle', 'obs-white']
      },
      {
        defect_type: '\uBC31\uD654',
        confidence: 0.55,
        supporting_observation_ids: ['obs-white']
      },
      {
        defect_type: '\uC2F1\uD06C\uB9C8\uD06C',
        confidence: 0.22,
        supporting_observation_ids: ['obs-circle']
      }
    ]
  });

  const query = buildVisionRetrievalQuery(
    observation,
    '\uCDE8\uCD9C \uC2DC \uB531 \uC18C\uB9AC\uC640 \uD568\uAED8 \uC81C\uD488\uC774 \uD280\uC5B4\uB098\uC634'
  );

  assert.match(query, /\uC6D0\uD615 \uACBD\uACC4/);
  assert.match(query, /\uBC00\uD540 \uC790\uAD6D/);
  assert.match(query, /\uBC31\uD654/);
  assert.match(query, /\uC2F1\uD06C\uB9C8\uD06C/);
  assert.match(query, /\uB531 \uC18C\uB9AC/);
  assert.match(query, /obs-circle/);
  assert.match(query, /boundary/);
});

test('rejects a V2 defect candidate that cites no valid visual observation', () => {
  const observation = normalizeVisionObservation({
    contract_version: 'vision-observation/v2',
    image_kind: 'physical_product',
    normality_status: 'defect_visible',
    observations: [{
      observation_id: 'obs-color',
      category: 'color',
      description: '\uC720\uBC31\uC0C9 \uBCC0\uC0C9',
      region: 'ROI',
      confidence: 0.82
    }],
    candidates: [{
      defect_type: '\uBC31\uD654',
      confidence: 0.91,
      supporting_observation_ids: ['obs-missing']
    }]
  });

  assert.equal(observation.candidates.length, 0);
  assert.equal(observation.decisionStatus, 'unclassifiable');
  assert.equal(observation.groundingStatus, 'invalid');
  assert.ok(observation.validationIssues.includes('candidate_without_observation_evidence'));
});

test('V2 observations without an explicit ID cannot be used as defect evidence', () => {
  const observation = normalizeVisionObservation({
    contract_version: 'vision-observation/v2',
    image_kind: 'physical_product',
    normality_status: 'defect_visible',
    observations: [{
      category: 'color',
      description: '\uC720\uBC31\uC0C9 \uBCC0\uC0C9',
      confidence: 0.9
    }],
    candidates: [{
      defect_type: '\uBC31\uD654',
      confidence: 0.94,
      supporting_observation_ids: ['obs-1']
    }]
  });

  assert.equal(observation.visualObservations.length, 0);
  assert.equal(observation.candidates.length, 0);
  assert.equal(observation.groundingStatus, 'invalid');
  assert.ok(observation.validationIssues.includes('missing_visual_observations'));
});

test('hard-negative normal evidence overrides a high-confidence defect guess', () => {
  const observation = normalizeVisionObservation({
    contract_version: 'vision-observation/v2',
    image_kind: 'physical_product',
    normality_status: 'no_defect_visible',
    observations: [{
      observation_id: 'obs-normal',
      category: 'geometry',
      description: '\uBC18\uBCF5 \uC6D0\uD615 \uD615\uC0C1\uC774 \uBAA8\uB450 \uAC19\uC740 \uD06C\uAE30\uC640 \uAC04\uACA9\uC73C\uB85C \uBC30\uCE58\uB428',
      region: '\uCDE8\uCD9C\uBD80',
      confidence: 0.94
    }],
    candidates: [{
      defect_type: '\uBC00\uD540 \uC790\uAD6D',
      confidence: 0.95,
      supporting_observation_ids: ['obs-normal']
    }]
  });

  assert.equal(observation.candidates.length, 0);
  assert.equal(observation.primaryCandidate, null);
  assert.equal(observation.decisionStatus, 'unclassifiable');
  assert.equal(observation.abstentionReason, 'no_visible_defect');
});

test('document images never produce physical defect candidates', () => {
  const observation = normalizeVisionObservation({
    contract_version: 'vision-observation/v2',
    image_kind: 'document_or_diagram',
    normality_status: 'defect_visible',
    observations: [{
      observation_id: 'obs-line',
      category: 'boundary',
      description: '\uB3C4\uBA74\uC758 \uC120\uD615 \uACBD\uACC4',
      confidence: 0.99
    }],
    candidates: [{
      defect_type: '\uC6F0\uB4DC\uB77C\uC778',
      confidence: 0.98,
      supporting_observation_ids: ['obs-line']
    }]
  });

  assert.equal(observation.candidates.length, 0);
  assert.equal(observation.decisionStatus, 'unclassifiable');
  assert.equal(observation.abstentionReason, 'non_physical_image');
});

test('legacy unlinked candidates can be displayed but never become probable', () => {
  const observation = normalizeVisionObservation({
    visible_features: ['\uD30C\uD305\uB77C\uC778 \uBC16\uC73C\uB85C \uC5C7\uC740 \uB3CC\uCD9C'],
    candidates: [
      { defect_type: '\uD50C\uB798\uC2DC', confidence: 0.9 },
      { defect_type: '\uC2A4\uD06C\uB798\uCE58', confidence: 0.1 }
    ]
  });

  assert.equal(observation.candidates.length, 2);
  assert.equal(observation.groundingStatus, 'legacy');
  assert.equal(observation.decisionStatus, 'needs_review');
  assert.equal(observation.decisionReason, 'legacy_observation_contract');
});

test('rejected image quality suppresses high-confidence defect candidates', () => {
  const observation = normalizeVisionObservation({
    contract_version: 'vision-observation/v2',
    image_kind: 'physical_product',
    normality_status: 'defect_visible',
    quality_status: 'reject',
    quality_concerns: ['motion blur', 'ROI too small'],
    observations: [{
      observation_id: 'obs-white',
      category: 'color',
      description: '\uD750\uB9B0 \uBC31\uC0C9 \uC601\uC5ED',
      region: '\uCDE8\uCD9C\uBD80',
      confidence: 0.88
    }],
    candidates: [{
      defect_type: '\uBC31\uD654',
      confidence: 0.96,
      supporting_observation_ids: ['obs-white']
    }]
  });

  assert.equal(observation.qualityStatus, 'reject');
  assert.equal(observation.candidates.length, 0);
  assert.equal(observation.primaryCandidate, null);
  assert.equal(observation.decisionStatus, 'unclassifiable');
  assert.equal(observation.decisionReason, 'image_quality_rejected');
  assert.equal(observation.abstentionReason, 'image_quality_rejected');
  assert.ok(observation.validationIssues.includes('image_quality_rejected'));
});

test('Graph retrieval query does not include candidates from rejected quality images', () => {
  const query = buildVisionRetrievalQuery({
    contract_version: 'vision-observation/v2',
    image_kind: 'physical_product',
    normality_status: 'defect_visible',
    quality_status: 'fail',
    quality_concerns: ['over exposure'],
    observations: [{
      observation_id: 'obs-line',
      category: 'boundary',
      description: '\uC120\uD615 \uACBD\uACC4\uAC00 \uBCF4\uC784',
      confidence: 0.91
    }],
    candidates: [{
      defect_type: '\uC6F0\uB4DC\uB77C\uC778',
      confidence: 0.94,
      supporting_observation_ids: ['obs-line']
    }]
  }, '\uCDE8\uCD9C\uC2DC \uC18C\uC74C \uBC1C\uC0DD');

  assert.match(query, /Quality status: reject/);
  assert.match(query, /Candidate defects: unclassifiable/);
  assert.doesNotMatch(query, /\uC6F0\uB4DC\uB77C\uC778/);
});

test('blocking quality concerns reject candidates even when provider omits quality status', () => {
  const observation = normalizeVisionObservation({
    contract_version: 'vision-observation/v2',
    image_kind: 'physical_product',
    normality_status: 'defect_visible',
    quality_concerns: ['motion blur hides the defect edge', 'ROI too small for surface diagnosis'],
    observations: [
      {
        observation_id: 'obs-color',
        category: 'color',
        description: '\uB9AC\uBE0C \uC8FC\uBCC0\uC5D0 \uD750\uB9B0 \uC720\uBC31\uC0C9 \uC601\uC5ED',
        region: '\uB9AC\uBE0C \uAE30\uBD80',
        confidence: 0.9
      },
      {
        observation_id: 'obs-location',
        category: 'location',
        description: '\uC758\uC2EC \uC601\uC5ED\uC774 ROI \uD558\uB2E8\uC5D0 \uC77C\uBD80\uB9CC \uD3EC\uD568\uB428',
        region: 'ROI \uD558\uB2E8',
        confidence: 0.86
      }
    ],
    candidates: [
      {
        defect_type: '\uBC31\uD654',
        confidence: 0.93,
        supporting_observation_ids: ['obs-color', 'obs-location']
      },
      {
        defect_type: '\uC2F1\uD06C',
        confidence: 0.12,
        supporting_observation_ids: ['obs-location']
      }
    ]
  });

  assert.equal(observation.qualityStatus, 'reject');
  assert.equal(observation.candidates.length, 0);
  assert.equal(observation.decisionStatus, 'unclassifiable');
  assert.equal(observation.decisionReason, 'image_quality_rejected');
  assert.equal(observation.safetyGate.candidateUsePolicy, 'do_not_use_vision_candidate');
  assert.ok(observation.validationIssues.includes('image_quality_rejected'));
});

test('Graph retrieval query carries the Vision safety gate for weakly grounded candidates', () => {
  const query = buildVisionRetrievalQuery({
    contract_version: 'vision-observation/v2',
    image_kind: 'physical_product',
    normality_status: 'defect_visible',
    observations: [{
      observation_id: 'obs-white-1',
      category: 'color',
      description: '\uB9AC\uBE0C \uC8FC\uBCC0 \uBC31\uD654',
      region: '\uB9AC\uBE0C',
      confidence: 0.9
    }],
    candidates: [
      {
        defect_type: '\uBC31\uD654',
        confidence: 0.92,
        supporting_observation_ids: ['obs-white-1']
      },
      {
        defect_type: '\uC2F1\uD06C\uB9C8\uD06C',
        confidence: 0.18,
        supporting_observation_ids: ['obs-white-1']
      }
    ]
  }, '\uCDE8\uCD9C \uC2DC \uB531 \uC18C\uB9AC');

  assert.match(query, /Vision safety gate: needs_review/);
  assert.match(query, /candidate_use_policy: graph_cross_check_only/);
  assert.match(query, /insufficient_independent_visual_evidence/);
});

test('provider Vision parser accepts a schema-compliant v2 observation contract', () => {
  const observation = parseProviderVisionObservationText(JSON.stringify({
    contract_version: 'vision-observation/v2',
    image_kind: 'physical_product',
    normality_status: 'defect_visible',
    observations: [
      {
        observation_id: 'obs-color-1',
        category: 'color',
        description: '\uB9AC\uBE0C \uC8FC\uBCC0 \uC720\uBC31\uC0C9 \uBCC0\uC0C9',
        region: '\uB9AC\uBE0C \uC8FC\uBCC0',
        region_bbox: {
          coordinate_system: 'normalized_xywh',
          x: 0.12,
          y: 0.22,
          width: 0.31,
          height: 0.18,
          confidence: 0.87
        },
        confidence: 0.91
      },
      {
        observation_id: 'obs-location-1',
        category: 'location',
        description: '\uBCC0\uC0C9\uC774 \uB9AC\uBE0C \uAE30\uBD80\uC5D0 \uAD6D\uBD80\uC801\uC73C\uB85C \uC9D1\uC911\uB428',
        region: '\uB9AC\uBE0C \uAE30\uBD80',
        region_bbox: {
          coordinate_system: 'normalized_xywh',
          x: 0.18,
          y: 0.26,
          width: 0.24,
          height: 0.16,
          confidence: 0.82
        },
        confidence: 0.88
      }
    ],
    candidates: [
      {
        defect_type: '\uBC31\uD654',
        confidence: 0.84,
        supporting_observation_ids: ['obs-color-1', 'obs-location-1'],
        contradicting_observation_ids: []
      },
      {
        defect_type: '\uC2F1\uD06C',
        confidence: 0.12,
        supporting_observation_ids: ['obs-location-1'],
        contradicting_observation_ids: ['obs-color-1']
      }
    ],
    required_additional_views: [],
    quality_concerns: [],
    abstention_reason: ''
  }));

  assert.equal(observation.providerContractValid, true);
  assert.deepEqual(observation.providerContractErrors, []);
  assert.equal(observation.primaryCandidate.defectType, '\uBC31\uD654');
  assert.deepEqual(observation.visualObservations[0].regionBbox, {
    coordinateSystem: 'normalized_xywh',
    x: 0.12,
    y: 0.22,
    width: 0.31,
    height: 0.18,
    confidence: 0.87
  });
  assert.doesNotMatch(observation.validationIssues.join(','), /provider_contract/);
});

test('provider Vision parser blocks invalid normalized observation bbox contracts', () => {
  const observation = parseProviderVisionObservationText(JSON.stringify({
    contract_version: 'vision-observation/v2',
    image_kind: 'physical_product',
    normality_status: 'defect_visible',
    observations: [{
      observation_id: 'obs-color-1',
      category: 'color',
      description: '\uC720\uBC31\uC0C9 \uBCC0\uC0C9',
      region: '\uB9AC\uBE0C',
      region_bbox: {
        coordinate_system: 'pixel_xywh',
        x: 1.2,
        y: 0.2,
        width: 0,
        height: 0.3,
        confidence: 0.8
      },
      confidence: 0.9
    }],
    candidates: [{
      defect_type: '\uBC31\uD654',
      confidence: 0.88,
      supporting_observation_ids: ['obs-color-1'],
      contradicting_observation_ids: []
    }],
    required_additional_views: [],
    quality_concerns: [],
    abstention_reason: ''
  }));

  assert.equal(observation.providerContractValid, false);
  assert.ok(observation.providerContractErrors.includes('invalid_enum:observations[0].region_bbox.coordinate_system'));
  assert.ok(observation.providerContractErrors.includes('maximum:observations[0].region_bbox.x'));
  assert.ok(observation.providerContractErrors.includes('minimum:observations[0].region_bbox.width'));
  assert.equal(observation.candidates.length, 0);
  assert.equal(observation.decisionStatus, 'unclassifiable');
});

test('Graph retrieval query includes normalized bbox evidence when present', () => {
  const query = buildVisionRetrievalQuery({
    contract_version: 'vision-observation/v2',
    image_kind: 'physical_product',
    normality_status: 'defect_visible',
    observations: [
      {
        observation_id: 'obs-white',
        category: 'color',
        description: '\uB9AC\uBE0C \uC8FC\uBCC0 \uBC31\uD654',
        region: '\uB9AC\uBE0C',
        region_bbox: {
          coordinate_system: 'normalized_xywh',
          x: 0.125,
          y: 0.25,
          width: 0.33,
          height: 0.2,
          confidence: 0.78
        },
        confidence: 0.9
      },
      {
        observation_id: 'obs-location',
        category: 'location',
        description: '\uCDE8\uCD9C \uD540 \uC778\uC811\uBD80',
        region: '\uCDE8\uCD9C\uBD80',
        region_bbox: {
          coordinate_system: 'normalized_xywh',
          x: 0.1,
          y: 0.2,
          width: 0.4,
          height: 0.3,
          confidence: 0.7
        },
        confidence: 0.86
      }
    ],
    candidates: [
      {
        defect_type: '\uBC31\uD654',
        confidence: 0.84,
        supporting_observation_ids: ['obs-white', 'obs-location'],
        contradicting_observation_ids: []
      },
      {
        defect_type: '\uC2F1\uD06C',
        confidence: 0.22,
        supporting_observation_ids: ['obs-location'],
        contradicting_observation_ids: ['obs-white']
      }
    ],
    required_additional_views: [],
    quality_concerns: [],
    abstention_reason: ''
  });

  assert.match(query, /bbox: normalized_xywh x=0\.125 y=0\.250 w=0\.330 h=0\.200 conf=0\.78/);
});

test('provider Vision parser blocks schema violations instead of silently repairing them', () => {
  const observation = parseProviderVisionObservationText(JSON.stringify({
    contract_version: 'vision-observation/v2',
    image_kind: 'photo_of_product',
    normality_status: 'defect_visible',
    observations: [{
      observation_id: 'obs-color-1',
      category: 'color',
      description: '\uC720\uBC31\uC0C9 \uBCC0\uC0C9',
      region: '\uB9AC\uBE0C',
      confidence: 0.9
    }],
    candidates: [{
      defect_type: '\uBC31\uD654',
      confidence: 0.88,
      supporting_observation_ids: ['obs-color-1'],
      contradicting_observation_ids: []
    }],
    required_additional_views: [],
    abstention_reason: ''
  }));

  assert.equal(observation.providerContractValid, false);
  assert.ok(observation.providerContractErrors.includes('missing_required:quality_concerns'));
  assert.ok(observation.providerContractErrors.includes('invalid_enum:image_kind'));
  assert.ok(observation.validationIssues.includes('provider_contract_invalid'));
  assert.equal(observation.decisionStatus, 'unclassifiable');
  assert.equal(observation.safetyGate.status, 'blocked');
  assert.equal(observation.safetyGate.candidateUsePolicy, 'do_not_use_vision_candidate');
  assert.equal(observation.candidates.length, 0);
});

test('provider Vision parser blocks non-JSON provider responses', () => {
  const observation = parseProviderVisionObservationText('\uC774 \uC774\uBBF8\uC9C0\uB294 \uBC31\uD654\uB85C \uBCF4\uC785\uB2C8\uB2E4.');

  assert.equal(observation.providerContractValid, false);
  assert.ok(observation.providerContractErrors.includes('provider_contract_json_parse_failed'));
  assert.ok(observation.validationIssues.includes('provider_contract_invalid'));
  assert.equal(observation.decisionStatus, 'unclassifiable');
  assert.equal(observation.primaryCandidate, null);
});
