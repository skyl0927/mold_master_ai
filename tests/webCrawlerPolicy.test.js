const assert = require('node:assert/strict');
const test = require('node:test');

const {
  PoliteHttpClient,
  assertAllowedSourceUrl,
  evaluateRobotsTxt,
  runtimeSecurityWarnings
} = require('../webCrawlerPolicy');

test('robots policy applies the longest matching allow or disallow rule', () => {
  const robots = `
    User-agent: *
    Disallow: /private/
    Allow: /private/public/

    User-agent: MoldMasterKnowledgeCollector
    Disallow: /api/internal/
    Allow: /api/
  `;
  assert.equal(
    evaluateRobotsTxt(robots, '/api/public/search', 'MoldMasterKnowledgeCollector').allowed,
    true
  );
  assert.equal(
    evaluateRobotsTxt(robots, '/api/internal/secrets', 'MoldMasterKnowledgeCollector').allowed,
    false
  );
  assert.equal(
    evaluateRobotsTxt(robots, '/private/public/example', 'OtherBot').allowed,
    true
  );
  assert.equal(
    evaluateRobotsTxt(robots, '/private/example', 'OtherBot').allowed,
    false
  );
});

test('source URL policy rejects non-HTTPS and non-allowlisted hosts', () => {
  assert.doesNotThrow(() =>
    assertAllowedSourceUrl('https://commons.wikimedia.org/w/api.php')
  );
  assert.throws(
    () => assertAllowedSourceUrl('http://commons.wikimedia.org/w/api.php'),
    /HTTPS/
  );
  assert.throws(
    () => assertAllowedSourceUrl('https://example.invalid/image.png'),
    /allowlist/
  );
});

test('runtime security report exposes disabled TLS verification', () => {
  assert.deepEqual(
    runtimeSecurityWarnings({ NODE_TLS_REJECT_UNAUTHORIZED: '0' }),
    ['tls_certificate_verification_disabled']
  );
  assert.deepEqual(runtimeSecurityWarnings({}), []);
});

test('polite client retries HTTP 429 using a bounded backoff', async () => {
  let targetCalls = 0;
  const fetchImpl = async url => {
    if (url.pathname === '/robots.txt') {
      return new Response('', { status: 404 });
    }
    targetCalls += 1;
    if (targetCalls === 1) {
      return new Response('slow down', {
        status: 429,
        headers: { 'retry-after': '0' }
      });
    }
    return new Response('ok', { status: 200 });
  };
  const client = new PoliteHttpClient({
    fetchImpl,
    minimumIntervalMs: 1,
    retryBaseMs: 1,
    maxRetries: 2
  });
  const response = await client.fetch('https://commons.wikimedia.org/wiki/File:Example.png');
  assert.equal(response.status, 200);
  assert.equal(targetCalls, 2);
  assert.equal(client.report().retries, 1);
});
