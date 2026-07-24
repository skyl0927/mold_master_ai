const assert = require('node:assert/strict');
const test = require('node:test');

const {
  evaluateVisionImageQuality
} = require('../visionImageQuality');

const imageData = (width, height, pixelAt) => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const [red, green, blue] = pixelAt(x, y);
      data[offset] = red;
      data[offset + 1] = green;
      data[offset + 2] = blue;
      data[offset + 3] = 255;
    }
  }
  return { width, height, data };
};

test('rejects unreadable image input with a recapture recommendation', () => {
  const report = evaluateVisionImageQuality({});

  assert.equal(report.status, 'reject');
  assert.equal(report.canAnalyze, false);
  assert.equal(report.issues[0].code, 'invalid_image');
});

test('rejects images that are too small for defect diagnosis', () => {
  const report = evaluateVisionImageQuality(
    imageData(96, 96, (x, y) => {
      const value = (x + y) % 2 === 0 ? 80 : 180;
      return [value, value, value];
    })
  );

  assert.equal(report.status, 'reject');
  assert.equal(report.canAnalyze, false);
  assert.ok(report.issues.some(issue => issue.code === 'resolution_too_low'));
});

test('rejects almost completely dark images', () => {
  const report = evaluateVisionImageQuality(
    imageData(320, 320, () => [2, 2, 2])
  );

  assert.equal(report.status, 'reject');
  assert.ok(report.issues.some(issue => issue.code === 'severely_underexposed'));
});

test('rejects almost completely overexposed images', () => {
  const report = evaluateVisionImageQuality(
    imageData(320, 320, () => [254, 254, 254])
  );

  assert.equal(report.status, 'reject');
  assert.ok(report.issues.some(issue => issue.code === 'severely_overexposed'));
});

test('warns but allows analysis for low-detail images', () => {
  const report = evaluateVisionImageQuality(
    imageData(640, 480, () => [128, 128, 128])
  );

  assert.equal(report.status, 'warn');
  assert.equal(report.canAnalyze, true);
  assert.ok(report.issues.some(issue =>
    ['low_contrast', 'possible_blur'].includes(issue.code)
  ));
});

test('accepts a sufficiently detailed and exposed image', () => {
  const report = evaluateVisionImageQuality(
    imageData(640, 480, (x, y) => {
      const value = ((x * 17 + y * 31) % 180) + 35;
      return [value, (value + 47) % 230, (value + 91) % 230];
    })
  );

  assert.equal(report.status, 'pass');
  assert.equal(report.canAnalyze, true);
  assert.equal(report.issues.length, 0);
  assert.ok(report.score >= 80);
});
