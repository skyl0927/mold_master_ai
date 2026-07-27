const {
  canonicalDefectClass
} = require('./shared/defect-taxonomy');

const compact = value => String(value || '').replace(/\s+/g, ' ').trim();

const asArray = value => Array.isArray(value) ? value : [];

const firstCompact = (...values) => {
  for (const value of values) {
    const text = compact(value);
    if (text) return text;
  }
  return '';
};

const normalizeImageId = value => firstCompact(
  value?.imageId,
  value?.image_id,
  value?.id
);

const metadataOf = value => value?.metadata || value?.extra_metadata || {};

const exportedLabelOf = item => firstCompact(
  item?.defect_type,
  item?.defectType,
  item?.class_name,
  item?.className,
  item?.label,
  asArray(item?.labels)[0]
);

const expectedLabelOf = request => {
  const body = request?.body || {};
  return firstCompact(
    body.defect_type,
    body.defectType,
    body.class_name,
    body.className,
    asArray(body.labels)[0],
    asArray(body.observation?.candidates)[0]?.defect_type
  );
};

const expectedMetadataOf = request => metadataOf(request?.body);

const reviewStatusOf = item => firstCompact(item?.review_status, item?.reviewStatus);

const captureSignalOf = item => {
  const metadata = metadataOf(item);
  return {
    ready: metadata.capture_protocol_ready === true || item?.capture_protocol_ready === true,
    sessionId: firstCompact(metadata.capture_session_id, item?.capture_session_id),
    viewTag: firstCompact(metadata.capture_view_tag, item?.capture_view_tag)
  };
};

const addBlocker = (blockers, code, detail, imageId) => {
  blockers.push({
    code,
    imageId: compact(imageId) || undefined,
    detail
  });
};

const indexByImageId = items => {
  const index = new Map();
  for (const item of asArray(items)) {
    const imageId = normalizeImageId(item);
    if (imageId && !index.has(imageId)) index.set(imageId, item);
  }
  return index;
};

const buildAppliedTargets = applyReport => {
  const requestsById = indexByImageId(asArray(applyReport?.requests));
  return asArray(applyReport?.results)
    .filter(result => compact(result?.status) === 'applied')
    .map(result => {
      const imageId = normalizeImageId(result);
      const request = requestsById.get(imageId) || {};
      const expectedMetadata = expectedMetadataOf(request);
      return {
        imageId,
        expectedDefectLabel: expectedLabelOf(request),
        expectedDefectClass: canonicalDefectClass(expectedLabelOf(request)),
        expectedCaptureSessionId: compact(expectedMetadata.capture_session_id),
        expectedCaptureViewTag: compact(expectedMetadata.capture_view_tag)
      };
    })
    .filter(target => target.imageId);
};

const summarizeTargets = targets => {
  const count = status => targets.filter(item => item.status === status).length;
  return {
    appliedTargets: targets.length,
    verifiedLearningReady: count('verified_learning_ready'),
    blockedTargets: count('blocked'),
    missingFromLearningReadyExport: count('missing_from_learning_ready_export')
  };
};

const buildVisionReferenceBackfillPostApplyReport = ({
  applyReport,
  learningReadyExport,
  generatedAt = new Date().toISOString()
} = {}) => {
  const blockers = [];
  const exportItems = asArray(learningReadyExport?.items || learningReadyExport?.records);
  const exportById = indexByImageId(exportItems);
  const appliedTargets = buildAppliedTargets(applyReport);

  if (applyReport?.applyRequested !== true || applyReport?.serviceWritesPerformed !== true) {
    addBlocker(
      blockers,
      'apply_report_did_not_perform_service_writes',
      'Reference refresh requires a real --apply report, not a dry-run report.'
    );
  }
  if (applyReport?.completed !== true) {
    addBlocker(
      blockers,
      'apply_report_incomplete',
      'Backfill apply report did not complete successfully.'
    );
  }
  if (appliedTargets.length === 0) {
    addBlocker(
      blockers,
      'no_applied_backfill_targets',
      'No applied backfill targets were found in the apply report.'
    );
  }

  const targets = appliedTargets.map(target => {
    const exported = exportById.get(target.imageId);
    const targetBlockers = [];
    if (!exported) {
      addBlocker(
        targetBlockers,
        'applied_target_missing_from_learning_ready_export',
        'Applied target is not present in Common Agent learning-ready export.',
        target.imageId
      );
      blockers.push(...targetBlockers);
      return {
        ...target,
        status: 'missing_from_learning_ready_export',
        blockers: targetBlockers
      };
    }

    const reviewStatus = reviewStatusOf(exported);
    const exportedLabel = exportedLabelOf(exported);
    const exportedDefectClass = canonicalDefectClass(exportedLabel);
    const capture = captureSignalOf(exported);

    if (reviewStatus !== 'approved') {
      addBlocker(
        targetBlockers,
        'learning_ready_export_not_approved',
        `Expected approved review_status, got ${reviewStatus || 'empty'}.`,
        target.imageId
      );
    }

    if (!capture.ready || !capture.sessionId || !capture.viewTag) {
      addBlocker(
        targetBlockers,
        'capture_protocol_not_learning_ready',
        'Exported item is missing capture_protocol_ready=true, capture_session_id, or capture_view_tag.',
        target.imageId
      );
    }

    if (target.expectedCaptureSessionId && capture.sessionId !== target.expectedCaptureSessionId) {
      addBlocker(
        targetBlockers,
        'capture_session_mismatch',
        `Expected capture_session_id ${target.expectedCaptureSessionId}, got ${capture.sessionId || 'empty'}.`,
        target.imageId
      );
    }

    if (target.expectedCaptureViewTag && capture.viewTag !== target.expectedCaptureViewTag) {
      addBlocker(
        targetBlockers,
        'capture_view_mismatch',
        `Expected capture_view_tag ${target.expectedCaptureViewTag}, got ${capture.viewTag || 'empty'}.`,
        target.imageId
      );
    }

    if (target.expectedDefectClass !== exportedDefectClass) {
      addBlocker(
        targetBlockers,
        'defect_label_mismatch',
        `Expected ${target.expectedDefectClass}, got ${exportedDefectClass}.`,
        target.imageId
      );
    }

    blockers.push(...targetBlockers);
    return {
      ...target,
      exportedDefectLabel: exportedLabel,
      exportedDefectClass,
      reviewStatus,
      captureProtocolReady: capture.ready,
      captureSessionId: capture.sessionId,
      captureViewTag: capture.viewTag,
      status: targetBlockers.length === 0 ? 'verified_learning_ready' : 'blocked',
      blockers: targetBlockers
    };
  });

  const summary = summarizeTargets(targets);
  const readyForReferenceRefresh =
    blockers.length === 0
    && summary.appliedTargets > 0
    && summary.verifiedLearningReady === summary.appliedTargets;

  return {
    schemaVersion: 1,
    generatedAt,
    status: readyForReferenceRefresh ? 'ready' : 'blocked',
    readyForReferenceRefresh,
    localArtifactsWritten: true,
    serviceWritesPerformed: false,
    source: {
      applyReportGeneratedAt: compact(applyReport?.generatedAt),
      learningReadyExportTotal: Number.isFinite(Number(learningReadyExport?.total))
        ? Number(learningReadyExport.total)
        : exportItems.length
    },
    summary,
    targets,
    blockers,
    recommendedAction: readyForReferenceRefresh
      ? 'Learning-ready export verified. Refresh the Vision reference store, then run the Vision/Graph benchmark gate.'
      : 'Do not refresh the Vision reference store yet. Resolve the listed post-apply blockers first.'
  };
};

module.exports = {
  buildVisionReferenceBackfillPostApplyReport
};
