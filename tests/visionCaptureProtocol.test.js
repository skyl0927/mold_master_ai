const assert = require('node:assert/strict');
const test = require('node:test');

const {
  assessVisionCaptureProtocol,
  inferVisionImageKind,
  normalizeViewTags
} = require('../visionCaptureProtocol');
const {
  summarizeVisionBenchmark
} = require('../scripts/lib/multimodal-benchmark');

test('document and CAD evidence is not treated as a physical defect photo', () => {
  const imageKind = inferVisionImageKind({
    metadata: {
      vision_suggestion_summary:
        '제공 이미지는 실제 성형품 외관 사진이 아니라 CAD/설명 슬라이드입니다.'
    }
  });
  const assessment = assessVisionCaptureProtocol({
    expected: { defectClass: 'burn' },
    captureProtocol: { imageKind }
  });

  assert.equal(imageKind, 'document_or_diagram');
  assert.equal(assessment.status, 'not_visually_verifiable');
  assert.equal(assessment.ready, false);
  assert.match(assessment.recommendation, /실제 성형품/);
});

test('Korean concept drawings are quarantined from visual diagnosis', () => {
  assert.equal(inferVisionImageKind({
    metadata: {
      vision_suggestion_summary:
        '도면은 커브 게이트 절단부 형상을 설명하는 개념도입니다.'
    }
  }), 'document_or_diagram');
});

test('whitening requires context, close-up, oblique light, and ejection location', () => {
  const assessment = assessVisionCaptureProtocol({
    expected: { defectClass: 'whitening' },
    captureProtocol: {
      imageKind: 'physical_product',
      availableViews: ['full_part_context', 'defect_closeup']
    }
  });

  assert.equal(assessment.status, 'needs_views');
  assert.deepEqual(
    assessment.missingViews.sort(),
    ['ejection_location', 'oblique_light'].sort()
  );
  assert.match(assessment.recommendation, /사선광/);
});

test('short shot is ready only with fill-end context and a good-part reference', () => {
  const assessment = assessVisionCaptureProtocol({
    expected: { defectClass: 'short_shot' },
    captureProtocol: {
      imageKind: 'physical_product',
      availableViews: [
        'full_part_context',
        'defect_closeup',
        'fill_end_context',
        'reference_part'
      ]
    }
  });

  assert.equal(assessment.status, 'ready');
  assert.equal(assessment.ready, true);
  assert.deepEqual(assessment.missingViews, []);
});

test('unknown image kind requests metadata instead of claiming readiness', () => {
  const assessment = assessVisionCaptureProtocol({
    expected: { defectClass: 'sink' },
    captureProtocol: {
      imageKind: 'unknown',
      availableViews: ['full_part_context', 'defect_closeup']
    }
  });

  assert.equal(assessment.status, 'needs_metadata');
  assert.equal(assessment.ready, false);
});

test('normalizes a single capture view string without splitting characters', () => {
  assert.deepEqual(normalizeViewTags('raking-light'), ['oblique_light']);
});

test('benchmark exposes capture protocol readiness as a fail-closed gate', () => {
  const summary = summarizeVisionBenchmark([
    {
      id: 'ready',
      passed: true,
      httpOk: true,
      classifiable: true,
      graphGrounded: true,
      expectedDefectClass: 'whitening',
      visionConfidence: 0.9,
      top1Accurate: true,
      top3Accurate: true,
      acceptedPrediction: true,
      qualityEligible: true,
      visionContractCompliant: true,
      captureProtocol: { ready: true, status: 'ready', missingViews: [] },
      checks: { defectType: true }
    },
    {
      id: 'missing-views',
      passed: false,
      httpOk: true,
      classifiable: false,
      graphGrounded: true,
      expectedDefectClass: 'whitening',
      visionConfidence: 0,
      top1Accurate: false,
      top3Accurate: false,
      acceptedPrediction: false,
      qualityEligible: true,
      visionContractCompliant: true,
      captureProtocol: {
        ready: false,
        status: 'needs_views',
        missingViews: ['oblique_light']
      },
      checks: { defectType: false }
    }
  ], 2, {
    requiredDefectClasses: ['whitening'],
    minimumSamplesPerClass: 1,
    minimumClassAccuracy: 0,
    minimumConfidentRate: 0,
    minimumCaptureProtocolReadyRate: 80
  });

  assert.equal(summary.captureProtocolReadyRate, 50);
  assert.deepEqual(summary.missingCaptureViews, [
    { view: 'oblique_light', count: 1 }
  ]);
  assert.equal(summary.gateChecks.captureProtocol, false);
  assert.ok(summary.failedGateChecks.includes('captureProtocol'));
});
