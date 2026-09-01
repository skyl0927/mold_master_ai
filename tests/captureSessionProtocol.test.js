const assert = require('node:assert/strict');
const test = require('node:test');

const {
  assessCaptureImageForDiagnosis,
  buildCaptureEvidenceMergePlan,
  buildRecaptureCaptureGuidance,
  buildRecaptureSourceFromReview,
  buildRecaptureSourceFromWorkOrder,
  buildCaptureMetadata,
  collectSessionDiagnosisImages,
  createCaptureSessionId,
  findResumableRecaptureSession,
  inferRecaptureViewTags,
  resolveCaptureLearningEligibility,
  selectDiagnosisTargetIds,
  summarizeCaptureSession
} = require('../captureSessionProtocol');

const image = (overrides = {}) => ({
  id: overrides.id || 'image-1',
  captureSessionId: 'session-1',
  diagnosisGroupId: 'defect-group-1',
  captureViewTag: 'full_part_context',
  captureImageKind: 'physical_product',
  captureSource: 'camera',
  ...overrides
});

test('one capture view is blocked and reports the missing close-up', () => {
  const summary = summarizeCaptureSession([
    image()
  ], 'session-1');

  assert.equal(summary.ready, false);
  assert.equal(summary.status, 'needs_views');
  assert.deepEqual(summary.availableViews, ['full_part_context']);
  assert.deepEqual(summary.missingViews, ['defect_closeup']);
  assert.match(summary.message, /결함 근접 사진/);
});

test('full context and defect close-up make a physical capture session ready', () => {
  const images = [
    image(),
    image({
      id: 'image-2',
      captureViewTag: 'defect_closeup'
    })
  ];
  const summary = summarizeCaptureSession(images, 'session-1');
  const assessment = assessCaptureImageForDiagnosis(images[0], images);

  assert.equal(summary.ready, true);
  assert.equal(summary.status, 'ready');
  assert.deepEqual(summary.missingViews, []);
  assert.equal(assessment.ready, true);
});

test('restores the latest incomplete recapture work order after app restart', () => {
  const recaptureSource = {
    workOrderId: 'vision-non-approval-008',
    reviewDecisionId: 'pending-hitl-007',
    requiredViewTags: ['full_part_context', 'defect_closeup']
  };
  const resumable = findResumableRecaptureSession([
    image({
      id: 'older-complete-full',
      captureSessionId: 'older-session',
      recaptureSource
    }),
    image({
      id: 'older-complete-close',
      captureSessionId: 'older-session',
      captureViewTag: 'defect_closeup',
      recaptureSource
    }),
    image({
      id: 'latest-incomplete-full',
      captureSessionId: 'latest-session',
      recaptureSource
    })
  ]);

  assert.equal(resumable.sessionId, 'latest-session');
  assert.equal(resumable.recaptureSource.workOrderId, 'vision-non-approval-008');
  assert.deepEqual(resumable.summary.missingViews, ['defect_closeup']);
});

test('does not reopen a recapture work order whose required views are complete', () => {
  const recaptureSource = {
    workOrderId: 'completed-work-order',
    requiredViewTags: ['full_part_context', 'defect_closeup']
  };
  const resumable = findResumableRecaptureSession([
    image({ id: 'complete-full', recaptureSource }),
    image({ id: 'complete-close', captureViewTag: 'defect_closeup', recaptureSource })
  ]);

  assert.equal(resumable, null);
});

test('selected full context and close-up from different sessions can be planned as one evidence set', () => {
  const images = [
    image({
      id: 'full-view',
      captureSessionId: 'session-full',
      captureViewTag: 'full_part_context'
    }),
    image({
      id: 'closeup-view',
      captureSessionId: 'session-closeup',
      captureViewTag: 'defect_closeup'
    })
  ];

  const plan = buildCaptureEvidenceMergePlan({
    images,
    selectedIds: ['full-view', 'closeup-view']
  });

  assert.equal(plan.canMerge, true);
  assert.equal(plan.targetSessionId, 'session-full');
  assert.equal(plan.selectedCount, 2);
  assert.equal(plan.readyAfterMerge, true);
  assert.deepEqual(plan.missingViews, []);
  assert.deepEqual(plan.changedImageIds, ['closeup-view']);
});

test('evidence merge plan refuses one selected image and reports missing required views', () => {
  const plan = buildCaptureEvidenceMergePlan({
    images: [
      image({
        id: 'full-view',
        captureViewTag: 'full_part_context'
      })
    ],
    selectedIds: ['full-view']
  });

  assert.equal(plan.canMerge, false);
  assert.equal(plan.readyAfterMerge, false);
  assert.deepEqual(plan.missingViews, ['defect_closeup']);
  assert.match(plan.message, /2/);
});

test('duplicate view tags do not satisfy the two-view protocol', () => {
  const summary = summarizeCaptureSession([
    image(),
    image({ id: 'image-2' })
  ], 'session-1');

  assert.equal(summary.imageCount, 2);
  assert.equal(summary.uniqueViewCount, 1);
  assert.equal(summary.ready, false);
  assert.deepEqual(summary.missingViews, ['defect_closeup']);
});

test('document images are not eligible for physical defect diagnosis', () => {
  const images = [
    image({
      captureImageKind: 'document_or_diagram'
    }),
    image({
      id: 'image-2',
      captureViewTag: 'defect_closeup'
    })
  ];
  const assessment = assessCaptureImageForDiagnosis(images[0], images);

  assert.equal(assessment.ready, false);
  assert.equal(assessment.status, 'not_visually_verifiable');
  assert.match(assessment.message, /실제 성형품/);
});

test('a document-only session is quarantined before target selection', () => {
  const summary = summarizeCaptureSession([
    image({
      captureImageKind: 'document_or_diagram'
    })
  ], 'session-1');

  assert.equal(summary.ready, false);
  assert.equal(summary.status, 'not_visually_verifiable');
  assert.equal(summary.physicalImageCount, 0);
});

test('an empty named session still requests capture metadata', () => {
  const summary = summarizeCaptureSession([], 'empty-session');

  assert.equal(summary.ready, false);
  assert.equal(summary.status, 'needs_metadata');
  assert.equal(summary.imageCount, 0);
});

test('a pending recapture work order exposes all required views before the first photo', () => {
  const summary = summarizeCaptureSession([], 'recapture-session', {
    workOrderId: 'work-order-before-first-photo',
    requiredViewTags: [
      'full_part_context',
      'defect_closeup',
      'parting_line_context',
      'edge_profile'
    ]
  });

  assert.equal(summary.ready, false);
  assert.equal(summary.status, 'needs_metadata');
  assert.deepEqual(summary.requiredViews, [
    'full_part_context',
    'defect_closeup',
    'parting_line_context',
    'edge_profile'
  ]);
  assert.deepEqual(summary.missingViews, summary.requiredViews);
});

test('untracked images fail closed instead of bypassing the protocol', () => {
  const assessment = assessCaptureImageForDiagnosis(image({
    captureSessionId: undefined,
    captureViewTag: undefined,
    captureImageKind: 'unknown'
  }), []);

  assert.equal(assessment.ready, false);
  assert.equal(assessment.status, 'needs_metadata');
  assert.match(assessment.message, /촬영 세션/);
});

test('capture metadata preserves session lineage for Common Agent', () => {
  const images = [
    image(),
    image({
      id: 'image-2',
      captureViewTag: 'defect_closeup'
    })
  ];
  const metadata = buildCaptureMetadata(images[0], images);

  assert.deepEqual(metadata, {
    capture_session_id: 'session-1',
    diagnosis_group_id: 'defect-group-1',
    capture_view_tags: ['full_part_context'],
    vision_image_kind: 'physical_product',
    capture_source: 'camera',
    capture_protocol_ready: true,
    capture_available_views: ['full_part_context', 'defect_closeup'],
    capture_missing_views: []
  });
});

test('capture metadata preserves fresh recapture lineage for Common Agent', () => {
  const recaptured = image({
    id: 'image-recapture-fresh',
    captureViewTag: 'defect_closeup',
    recaptureSource: {
      localImageId: 'image-original',
      commonAgentImageId: 'agent-image-original',
      reviewDecisionId: 'review-recapture-1',
      safetyGateReasons: ['low_region_bbox_confidence', 'overbroad_region_bbox'],
      requiredAdditionalViews: [
        'bbox 신뢰도 보강: 초점/조명 보정 후 동일 위치 재촬영',
        'bbox 범위 축소: 결함 부위가 프레임 중앙에 오도록 근접 재촬영'
      ],
      bboxGroundingProfileId: 'defect_closeup_precision'
    }
  });
  const metadata = buildCaptureMetadata(recaptured, [
    image({ id: 'image-original', commonAgentImageId: 'agent-image-original' }),
    recaptured
  ]);

  assert.equal(metadata.recapture_lineage_protocol_version, 'vision-recapture-lineage/v1');
  assert.equal(metadata.recapture_source_local_image_id, 'image-original');
  assert.equal(metadata.recapture_source_common_agent_image_id, 'agent-image-original');
  assert.equal(metadata.recapture_review_decision_id, 'review-recapture-1');
  assert.deepEqual(metadata.recapture_safety_gate_reasons, [
    'low_region_bbox_confidence',
    'overbroad_region_bbox'
  ]);
  assert.deepEqual(metadata.recapture_required_additional_views, [
    'bbox 신뢰도 보강: 초점/조명 보정 후 동일 위치 재촬영',
    'bbox 범위 축소: 결함 부위가 프레임 중앙에 오도록 근접 재촬영'
  ]);
  assert.equal(metadata.recapture_bbox_grounding_profile_id, 'defect_closeup_precision');
  assert.equal(metadata.recapture_guidance_protocol_version, 'vision-recapture-capture-guidance/v1');
  assert.equal(metadata.recapture_recommended_view_tag, 'defect_closeup');
  assert.equal(metadata.recapture_guidance_message, '재촬영 권장 시점: 결함 근접 사진');
  assert.deepEqual(metadata.recapture_guidance_reason_codes, [
    'low_region_bbox_confidence',
    'overbroad_region_bbox'
  ]);
  assert.deepEqual(metadata.recapture_guidance_instructions, [
    'bbox 신뢰도 보강: 초점/조명 보정 후 동일 위치 재촬영',
    'bbox 범위 축소: 결함 부위가 프레임 중앙에 오도록 근접 재촬영',
    '결함 경계와 주변 정상면이 함께 보이도록 근접 촬영'
  ]);
  assert.equal(metadata.recapture_guidance_fulfilled, true);
  assert.equal(metadata.recapture_guidance_fulfillment_status, 'fulfilled');
  assert.deepEqual(metadata.recapture_actual_view_tags, ['defect_closeup']);
});

test('HITL recapture review builds next-capture lineage from vision safety evidence', () => {
  const source = buildRecaptureSourceFromReview({
    image: image({
      id: 'image-original',
      commonAgentImageId: 'agent-image-original'
    }),
    analysis: {
      visionSummary: {
        requiredAdditionalViews: [
          'bbox 신뢰도 보강: 초점/조명 보정 후 동일 위치 재촬영',
          'bbox 범위 축소: 결함 부위가 프레임 중앙에 오도록 근접 재촬영'
        ],
        safetyGate: {
          reasons: ['low_region_bbox_confidence', 'overbroad_region_bbox'],
          bboxGroundingProfileId: 'defect_closeup_precision'
        }
      }
    },
    reviewDecisionId: 'review-recapture-1'
  });

  assert.deepEqual(source, {
    localImageId: 'image-original',
    commonAgentImageId: 'agent-image-original',
    reviewDecisionId: 'review-recapture-1',
    safetyGateReasons: ['low_region_bbox_confidence', 'overbroad_region_bbox'],
    requiredAdditionalViews: [
      'bbox 신뢰도 보강: 초점/조명 보정 후 동일 위치 재촬영',
      'bbox 범위 축소: 결함 부위가 프레임 중앙에 오도록 근접 재촬영'
    ],
    bboxGroundingProfileId: 'defect_closeup_precision',
    workOrderId: 'review-recapture-1',
    requiredViewTags: ['full_part_context', 'defect_closeup']
  });
});

test('governed capture work order builds recapture lineage with every required Korean view', () => {
  const source = buildRecaptureSourceFromWorkOrder({
    workItemId: 'vision-non-approval-008',
    queueId: 'pending-hitl-007',
    defectClass: 'flash',
    actionType: 'hitl_recapture_requested_views',
    requiredViews: [
      '제품 전체와 결함 위치가 함께 보이는 사진',
      '플래시 후보 부위의 초점 고정 근접 사진',
      '파팅라인 또는 게이트 경계 맥락 사진',
      '잉여 수지 두께가 보이는 측면 사진'
    ],
    captureInstructions: [
      {
        view: '잉여 수지 두께가 보이는 측면 사진',
        instruction: '잉여 수지 두께가 보이는 측면 사진'
      }
    ],
    reviewComment: '결함 부위 중심의 다중 시점 재촬영이 필요합니다.'
  });

  assert.equal(source.workOrderId, 'vision-non-approval-008');
  assert.equal(source.reviewDecisionId, 'pending-hitl-007');
  assert.deepEqual(source.safetyGateReasons, ['governed_capture_work_order']);
  assert.deepEqual(source.requiredAdditionalViews, [
    '제품 전체와 결함 위치가 함께 보이는 사진',
    '플래시 후보 부위의 초점 고정 근접 사진',
    '파팅라인 또는 게이트 경계 맥락 사진',
    '잉여 수지 두께가 보이는 측면 사진'
  ]);
  assert.deepEqual(source.requiredViewTags, [
    'full_part_context',
    'defect_closeup',
    'parting_line_context',
    'edge_profile'
  ]);
});

test('governed weld-line work order requires the normal comparison specimen', () => {
  const source = buildRecaptureSourceFromWorkOrder({
    workItemId: 'vision-non-approval-007',
    queueId: 'pending-hitl-006',
    defectClass: 'weld_line',
    requiredViews: [
      '주석과 확대 연결선이 없는 원본 전체 시편 사진',
      '유동 합류부의 동일 배율 근접 현미경 원본',
      '동일 배율 정상 비교 시편'
    ]
  });

  assert.deepEqual(source.requiredViewTags, [
    'full_part_context',
    'defect_closeup',
    'reference_part',
    'flow_convergence_context'
  ]);
});

test('recapture capture guidance recommends a defect close-up for weak bbox grounding', () => {
  const guidance = buildRecaptureCaptureGuidance({
    safetyGateReasons: ['overbroad_region_bbox'],
    requiredAdditionalViews: [
      'bbox 범위 축소: 결함 부위가 프레임 중앙에 오도록 근접 재촬영'
    ],
    bboxGroundingProfileId: 'defect_closeup_precision'
  });

  assert.deepEqual(guidance, {
    protocolVersion: 'vision-recapture-capture-guidance/v1',
    active: true,
    recommendedViewTag: 'defect_closeup',
    reasonCodes: ['overbroad_region_bbox'],
    instructions: [
      'bbox 범위 축소: 결함 부위가 프레임 중앙에 오도록 근접 재촬영',
      '결함 경계와 주변 정상면이 함께 보이도록 근접 촬영'
    ],
    requiredViewTags: ['full_part_context', 'defect_closeup'],
    message: '재촬영 권장 시점: 결함 근접 사진'
  });
});

test('recapture instructions infer every defect-specific view instead of only the first match', () => {
  const source = {
    reviewDecisionId: 'review-burn-1',
    requiredAdditionalViews: [
      '게이트부터 충전 말단까지 보이도록 촬영',
      '결함부와 인접 벤트 또는 가스 배출 위치를 함께 촬영'
    ]
  };

  assert.deepEqual(inferRecaptureViewTags(source), [
    'fill_end_context',
    'vent_context'
  ]);
  assert.deepEqual(buildRecaptureCaptureGuidance(source).requiredViewTags, [
    'full_part_context',
    'defect_closeup',
    'fill_end_context',
    'vent_context'
  ]);
});

test('a recapture work order remains blocked until every defect-specific view is captured', () => {
  const recaptureSource = {
    workOrderId: 'work-order-flash-1',
    reviewDecisionId: 'review-flash-1',
    requiredAdditionalViews: [
      '결함부와 파팅라인 위치가 함께 보이도록 촬영',
      '얇은 잉여 수지의 돌출 높이가 보이도록 측면에서 촬영'
    ],
    requiredViewTags: [
      'full_part_context',
      'defect_closeup',
      'parting_line_context',
      'edge_profile'
    ]
  };
  const baseViews = [
    image({ id: 'flash-full', recaptureSource }),
    image({ id: 'flash-close', captureViewTag: 'defect_closeup', recaptureSource })
  ];

  const baseSummary = summarizeCaptureSession(baseViews, 'session-1');
  assert.equal(baseSummary.ready, false);
  assert.deepEqual(baseSummary.requiredViews, [
    'full_part_context',
    'defect_closeup',
    'parting_line_context',
    'edge_profile'
  ]);
  assert.deepEqual(baseSummary.missingViews, [
    'parting_line_context',
    'edge_profile'
  ]);

  const partingSummary = summarizeCaptureSession([
    ...baseViews,
    image({ id: 'flash-parting', captureViewTag: 'parting_line_context', recaptureSource })
  ], 'session-1');
  assert.equal(partingSummary.ready, false);
  assert.deepEqual(partingSummary.missingViews, ['edge_profile']);

  const completeImages = [
    ...baseViews,
    image({ id: 'flash-parting', captureViewTag: 'parting_line_context', recaptureSource }),
    image({ id: 'flash-edge', captureViewTag: 'edge_profile', recaptureSource })
  ];
  const completeSummary = summarizeCaptureSession(completeImages, 'session-1');
  assert.equal(completeSummary.ready, true);
  assert.deepEqual(completeSummary.missingViews, []);
});

test('evidence merge preserves recapture work-order requirements', () => {
  const recaptureSource = {
    workOrderId: 'work-order-flash-merge',
    requiredViewTags: [
      'full_part_context',
      'defect_closeup',
      'parting_line_context',
      'edge_profile'
    ]
  };
  const images = [
    image({ id: 'merge-full', captureSessionId: 'full', recaptureSource }),
    image({ id: 'merge-close', captureSessionId: 'close', captureViewTag: 'defect_closeup', recaptureSource })
  ];

  const incomplete = buildCaptureEvidenceMergePlan({
    images,
    selectedIds: images.map(item => item.id)
  });
  assert.equal(incomplete.readyAfterMerge, false);
  assert.deepEqual(incomplete.requiredViews, [
    'full_part_context',
    'defect_closeup',
    'parting_line_context',
    'edge_profile'
  ]);
  assert.deepEqual(incomplete.missingViews, [
    'parting_line_context',
    'edge_profile'
  ]);
});

test('evidence merge rejects images from different recapture work orders', () => {
  const images = [
    image({
      id: 'order-a-full',
      captureSessionId: 'session-a',
      recaptureSource: {
        workOrderId: 'work-order-a',
        requiredViewTags: ['full_part_context', 'defect_closeup']
      }
    }),
    image({
      id: 'order-b-close',
      captureSessionId: 'session-b',
      captureViewTag: 'defect_closeup',
      recaptureSource: {
        workOrderId: 'work-order-b',
        requiredViewTags: ['full_part_context', 'defect_closeup']
      }
    })
  ];

  const plan = buildCaptureEvidenceMergePlan({
    images,
    selectedIds: images.map(item => item.id)
  });

  assert.equal(plan.canMerge, false);
  assert.equal(plan.workOrderConflict, true);
  assert.deepEqual(plan.workOrderIds, ['work-order-a', 'work-order-b']);
  assert.match(plan.message, /서로 다른 재촬영 작업지시/);
});

test('recapture metadata exposes work-order identity and all required views', () => {
  const recaptureSource = {
    workOrderId: 'work-order-flash-metadata',
    reviewDecisionId: 'review-flash-metadata',
    requiredViewTags: [
      'full_part_context',
      'defect_closeup',
      'parting_line_context',
      'edge_profile'
    ]
  };
  const images = [
    image({ id: 'metadata-full', recaptureSource }),
    image({ id: 'metadata-close', captureViewTag: 'defect_closeup', recaptureSource })
  ];
  const metadata = buildCaptureMetadata(images[0], images);

  assert.equal(metadata.recapture_work_order_id, 'work-order-flash-metadata');
  assert.deepEqual(metadata.recapture_required_view_tags, [
    'full_part_context',
    'defect_closeup',
    'parting_line_context',
    'edge_profile'
  ]);
  assert.equal(metadata.capture_protocol_ready, false);
  assert.equal(metadata.recapture_guidance_fulfilled, false);
  assert.deepEqual(metadata.capture_missing_views, [
    'parting_line_context',
    'edge_profile'
  ]);
});

test('recapture capture guidance recommends oblique light when lighting evidence is requested', () => {
  const guidance = buildRecaptureCaptureGuidance({
    safetyGateReasons: ['low_region_bbox_confidence'],
    requiredAdditionalViews: [
      'bbox 신뢰도 보강: 초점/조명 보정 후 동일 위치 재촬영',
      '사선광으로 표면 광택 차이를 확인'
    ]
  });

  assert.equal(guidance.active, true);
  assert.equal(guidance.recommendedViewTag, 'oblique_light');
  assert.ok(guidance.instructions.some(item => item.includes('사선광')));
  assert.ok(guidance.instructions.some(item => item.includes('초점/조명')));
});

test('recapture metadata flags a fresh image captured with the wrong view tag', () => {
  const recaptured = image({
    id: 'image-recapture-wrong-view',
    captureViewTag: 'full_part_context',
    recaptureSource: {
      localImageId: 'image-original',
      commonAgentImageId: 'agent-image-original',
      reviewDecisionId: 'review-recapture-1',
      safetyGateReasons: ['overbroad_region_bbox'],
      requiredAdditionalViews: [
        'bbox 범위 축소: 결함 부위가 프레임 중앙에 오도록 근접 재촬영'
      ],
      bboxGroundingProfileId: 'defect_closeup_precision'
    }
  });

  const metadata = buildCaptureMetadata(recaptured, [
    image({ id: 'image-original', commonAgentImageId: 'agent-image-original' }),
    recaptured
  ]);

  assert.equal(metadata.recapture_recommended_view_tag, 'defect_closeup');
  assert.deepEqual(metadata.recapture_actual_view_tags, ['full_part_context']);
  assert.equal(metadata.recapture_guidance_fulfilled, false);
  assert.equal(metadata.recapture_guidance_fulfillment_status, 'view_mismatch');
  assert.equal(metadata.recapture_missing_recommended_view_tag, 'defect_closeup');
});

test('capture learning eligibility blocks approved recaptures with guidance view mismatch', () => {
  const recaptured = image({
    id: 'image-recapture-wrong-view',
    captureViewTag: 'full_part_context',
    recaptureSource: {
      localImageId: 'image-original',
      commonAgentImageId: 'agent-image-original',
      reviewDecisionId: 'review-recapture-1',
      safetyGateReasons: ['overbroad_region_bbox'],
      requiredAdditionalViews: [
        'bbox 범위 축소: 결함 부위가 프레임 중앙에 오도록 근접 재촬영'
      ],
      bboxGroundingProfileId: 'defect_closeup_precision'
    }
  });
  const metadata = buildCaptureMetadata(recaptured, [
    image({ id: 'image-original', commonAgentImageId: 'agent-image-original' }),
    recaptured
  ]);

  assert.deepEqual(resolveCaptureLearningEligibility('approved', metadata), {
    eligible: false,
    reason: 'recapture_guidance_view_mismatch'
  });
});

test('capture learning eligibility allows approved recaptures after recommended view fulfillment', () => {
  const recaptured = image({
    id: 'image-recapture-fulfilled',
    captureViewTag: 'defect_closeup',
    recaptureSource: {
      localImageId: 'image-original',
      commonAgentImageId: 'agent-image-original',
      reviewDecisionId: 'review-recapture-1',
      safetyGateReasons: ['overbroad_region_bbox'],
      requiredAdditionalViews: [
        'bbox 범위 축소: 결함 부위가 프레임 중앙에 오도록 근접 재촬영'
      ],
      bboxGroundingProfileId: 'defect_closeup_precision'
    }
  });
  const metadata = buildCaptureMetadata(recaptured, [
    image({ id: 'image-original', commonAgentImageId: 'agent-image-original' }),
    recaptured
  ]);

  assert.deepEqual(resolveCaptureLearningEligibility('approved', metadata), {
    eligible: true,
    reason: 'approved_capture_ready'
  });
});

test('session diagnosis collects every physical view with the selected image first', () => {
  const selected = image({
    id: 'image-closeup',
    captureViewTag: 'defect_closeup'
  });
  const full = image({
    id: 'image-full',
    captureViewTag: 'full_part_context'
  });
  const oblique = image({
    id: 'image-oblique',
    captureViewTag: 'oblique_light'
  });
  const document = image({
    id: 'image-document',
    captureViewTag: 'reference_part',
    captureImageKind: 'document_or_diagram'
  });
  const otherSession = image({
    id: 'image-other-session',
    captureSessionId: 'session-2',
    captureViewTag: 'reference_part'
  });

  const collected = collectSessionDiagnosisImages(
    selected,
    [full, document, selected, otherSession, oblique]
  );

  assert.deepEqual(
    collected.map(item => item.id),
    ['image-closeup', 'image-full', 'image-oblique']
  );
  assert.deepEqual(
    collected.map(item => item.captureViewTag),
    ['defect_closeup', 'full_part_context', 'oblique_light']
  );
});

test('session diagnosis never mixes different defect evidence groups', () => {
  const selected = image({
    id: 'scratch-closeup',
    diagnosisGroupId: 'scratch-target',
    captureViewTag: 'defect_closeup'
  });
  const scratchContext = image({
    id: 'scratch-context',
    diagnosisGroupId: 'scratch-target',
    captureViewTag: 'full_part_context'
  });
  const ribBurr = image({
    id: 'rib-burr',
    diagnosisGroupId: 'rib-target',
    captureViewTag: 'oblique_light'
  });

  const collected = collectSessionDiagnosisImages(
    selected,
    [scratchContext, ribBurr, selected]
  );

  assert.deepEqual(
    collected.map(item => item.id),
    ['scratch-closeup', 'scratch-context']
  );
});

test('one full-part context photo can support multiple isolated defect groups', () => {
  const sharedContext = image({
    id: 'shared-full-context',
    diagnosisGroupId: 'most-recent-group',
    captureViewTag: 'full_part_context'
  });
  const leafCloseup = image({
    id: 'leaf-closeup',
    diagnosisGroupId: 'leaf-group',
    captureViewTag: 'defect_closeup'
  });
  const ribCloseup = image({
    id: 'rib-closeup',
    diagnosisGroupId: 'rib-group',
    captureViewTag: 'defect_closeup'
  });
  const images = [sharedContext, leafCloseup, ribCloseup];

  assert.deepEqual(
    collectSessionDiagnosisImages(leafCloseup, images).map(item => item.id),
    ['leaf-closeup', 'shared-full-context']
  );
  assert.deepEqual(
    collectSessionDiagnosisImages(ribCloseup, images).map(item => item.id),
    ['rib-closeup', 'shared-full-context']
  );
  assert.equal(
    summarizeCaptureSession(images, 'session-1', undefined, 'leaf-group').ready,
    true
  );
  assert.equal(
    summarizeCaptureSession(images, 'session-1', undefined, 'rib-group').ready,
    true
  );
});

test('ungrouped photos fail closed instead of being fused by capture session alone', () => {
  const ungrouped = image({
    id: 'ungrouped-closeup',
    diagnosisGroupId: undefined,
    captureViewTag: 'defect_closeup'
  });
  const assessment = assessCaptureImageForDiagnosis(ungrouped, [
    ungrouped,
    image({
      id: 'ungrouped-context',
      diagnosisGroupId: undefined,
      captureViewTag: 'full_part_context'
    })
  ]);

  assert.equal(assessment.ready, false);
  assert.equal(assessment.status, 'needs_group');
  assert.match(assessment.message, /동일 결함 위치/);
  assert.deepEqual(collectSessionDiagnosisImages(ungrouped, [ungrouped]), []);
});

test('evidence merge plan creates one explicit defect evidence group', () => {
  const plan = buildCaptureEvidenceMergePlan({
    images: [
      image({ id: 'merge-context', diagnosisGroupId: undefined }),
      image({
        id: 'merge-closeup',
        diagnosisGroupId: undefined,
        captureViewTag: 'defect_closeup'
      })
    ],
    selectedIds: ['merge-context', 'merge-closeup']
  });

  assert.equal(plan.canMerge, true);
  assert.match(plan.targetDiagnosisGroupId, /^defect-group-/);
  assert.deepEqual(plan.changedImageIds, ['merge-context', 'merge-closeup']);
});

test('batch diagnosis selects one representative per session and skips busy sessions', () => {
  const images = [
    image({ id: 'session-1-full' }),
    image({ id: 'session-1-close', captureViewTag: 'defect_closeup' }),
    image({
      id: 'session-2-full',
      captureSessionId: 'session-2'
    }),
    image({
      id: 'session-2-close',
      captureSessionId: 'session-2',
      captureViewTag: 'defect_closeup'
    }),
    image({
      id: 'session-3-full',
      captureSessionId: 'session-3'
    })
  ];

  const targets = selectDiagnosisTargetIds(
    images,
    [
      'session-1-full',
      'session-1-close',
      'session-2-full',
      'session-2-close',
      'session-3-full'
    ],
    ['session-2-close']
  );

  assert.deepEqual(targets, ['session-1-full', 'session-3-full']);
});

test('batch diagnosis selects each defect group independently within one session', () => {
  const images = [
    image({ id: 'scratch-full', diagnosisGroupId: 'scratch' }),
    image({ id: 'scratch-close', diagnosisGroupId: 'scratch', captureViewTag: 'defect_closeup' }),
    image({ id: 'burr-full', diagnosisGroupId: 'burr' }),
    image({ id: 'burr-close', diagnosisGroupId: 'burr', captureViewTag: 'defect_closeup' })
  ];

  const targets = selectDiagnosisTargetIds(
    images,
    images.map(item => item.id)
  );

  assert.deepEqual(targets, ['scratch-full', 'burr-full']);
});

test('unknown capture values are normalized to safe metadata defaults', () => {
  const metadata = buildCaptureMetadata(image({
    captureImageKind: 'other',
    captureSource: 'clipboard',
    captureViewTag: 'not-a-view'
  }), []);

  assert.equal(metadata.vision_image_kind, 'unknown');
  assert.equal(metadata.capture_source, 'file');
  assert.deepEqual(metadata.capture_view_tags, []);
  assert.equal(metadata.capture_protocol_ready, false);
});

test('capture session IDs are source-prefixed and collision resistant', () => {
  const first = createCaptureSessionId('camera', 1721800000000, () => 0.123456789);
  const second = createCaptureSessionId('screen', 1721800000000, () => 0.987654321);

  assert.match(first, /^capture-camera-/);
  assert.match(second, /^capture-screen-/);
  assert.notEqual(first, second);
});

test('capture session IDs sanitize an empty source', () => {
  const sessionId = createCaptureSessionId('', 1721800000000, () => 0);

  assert.match(sessionId, /^capture-capture-/);
});
