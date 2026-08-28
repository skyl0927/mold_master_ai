const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  COMMON_AGENT_HEALTH_PATHS,
  COMMON_AGENT_PRIMARY_HEALTH_PATH
} = require('../commonAgentHealthPolicy');

test('renderer health checks use the supported Vision status contract first', () => {
  assert.equal(COMMON_AGENT_PRIMARY_HEALTH_PATH, '/v1/vision/status');
  assert.deepEqual(COMMON_AGENT_HEALTH_PATHS, [
    '/v1/vision/status',
    '/healthz',
    '/health'
  ]);
});

test('renderer CSP contains no Chromium-invalid IPv6 wildcard source', () => {
  const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');

  assert.doesNotMatch(html, /http:\/\/\[::1\]:\*/);
  assert.match(html, /http:\/\/127\.0\.0\.1:\*/);
  assert.match(html, /http:\/\/localhost:\*/);
});
