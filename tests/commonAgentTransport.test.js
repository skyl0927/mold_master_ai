const assert = require('node:assert/strict');
const test = require('node:test');

const {
  normalizeCommonAgentBaseUrl,
  fetchWithCommonAgentPolicy
} = require('../commonAgentTransport');

test('Common Agent transport permits HTTP only for loopback development endpoints', () => {
  assert.equal(
    normalizeCommonAgentBaseUrl(' http://127.0.0.1:8000/ '),
    'http://127.0.0.1:8000'
  );
  assert.equal(
    normalizeCommonAgentBaseUrl('http://localhost:8103/'),
    'http://localhost:8103'
  );
  assert.equal(
    normalizeCommonAgentBaseUrl('http://[::1]:8000/'),
    'http://[::1]:8000'
  );
});

test('Common Agent transport requires HTTPS for every non-loopback endpoint', () => {
  assert.equal(
    normalizeCommonAgentBaseUrl('https://agent.example.com/api/'),
    'https://agent.example.com/api'
  );
  assert.throws(
    () => normalizeCommonAgentBaseUrl('http://218.151.133.137:5011'),
    /외부 Common Agent 주소는 HTTPS가 필요합니다/
  );
  assert.throws(
    () => normalizeCommonAgentBaseUrl('http://192.168.0.10:5011'),
    /외부 Common Agent 주소는 HTTPS가 필요합니다/
  );
});

test('Common Agent transport rejects credentials and unsupported URL schemes', () => {
  assert.throws(
    () => normalizeCommonAgentBaseUrl('https://user:password@agent.example.com'),
    /인증 정보를 URL에 포함할 수 없습니다/
  );
  assert.throws(
    () => normalizeCommonAgentBaseUrl('file:///tmp/agent'),
    /HTTP 또는 HTTPS 주소만 사용할 수 있습니다/
  );
  assert.throws(
    () => normalizeCommonAgentBaseUrl('not-a-url'),
    /올바른 URL이 아닙니다/
  );
});

test('Common Agent transport aborts a stalled request within the configured timeout', async () => {
  const fetchImpl = (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      reject(error);
    });
  });

  await assert.rejects(
    fetchWithCommonAgentPolicy(
      'https://agent.example.com/healthz',
      {},
      { fetchImpl, timeoutMs: 10 }
    ),
    /Common Agent 요청 시간이 10ms를 초과했습니다/
  );
});

test('Common Agent transport passes a validated URL and abort signal to fetch', async () => {
  let observed = null;
  const response = { ok: true, status: 200 };
  const fetchImpl = async (url, options) => {
    observed = { url, options };
    return response;
  };

  const result = await fetchWithCommonAgentPolicy(
    'https://agent.example.com/v1/ask',
    { method: 'POST' },
    { fetchImpl, timeoutMs: 100 }
  );

  assert.equal(result, response);
  assert.equal(observed.url, 'https://agent.example.com/v1/ask');
  assert.equal(observed.options.method, 'POST');
  assert.equal(observed.options.signal instanceof AbortSignal, true);
});
