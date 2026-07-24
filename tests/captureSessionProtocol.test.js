const assert = require('node:assert/strict');
const test = require('node:test');

const {
  assessCaptureImageForDiagnosis,
  buildCaptureMetadata,
  createCaptureSessionId,
  summarizeCaptureSession
} = require('../captureSessionProtocol');

const image = (overrides = {}) => ({
  id: overrides.id || 'image-1',
  captureSessionId: 'session-1',
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
    capture_view_tags: ['full_part_context'],
    vision_image_kind: 'physical_product',
    capture_source: 'camera',
    capture_protocol_ready: true,
    capture_available_views: ['full_part_context', 'defect_closeup'],
    capture_missing_views: []
  });
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
