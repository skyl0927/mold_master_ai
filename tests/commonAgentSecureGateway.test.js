const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const exists = fs.existsSync(path.join(__dirname, '../commonAgentSecureGateway.js'));
const { createCredentialVault, createSecureGateway, isTrustedCommonAgentSender } = exists
  ? require('../commonAgentSecureGateway') : {};
const TOKEN = `ca_service_v1.${'a'.repeat(32)}.${'b'.repeat(64)}`;
const encryption = {
  isEncryptionAvailable: () => true,
  getSelectedStorageBackend: () => 'dpapi',
  encryptString: value => Buffer.from(value).map(byte => byte ^ 91),
  decryptString: value => Buffer.from(value).map(byte => byte ^ 91).toString('utf8'),
};
const grant = baseUrl => ({ base_url: baseUrl, token: TOKEN, actor_id: `service-${'c'.repeat(32)}`,
  workspace_id: 'workspace-test', project_id: 'project-test', status: 'active',
  expires_at: new Date(Date.now() + 600000).toISOString(),
  scopes: ['vision:read', 'vision:diagnose:no_write', 'datasets:read', 'graph:read', 'ask:run'] });

function setup(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mold-master-auth-unit-'));
  t.after(() => {
    assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith('mold-master-auth-unit-'));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  return createCredentialVault({ filePath: path.join(directory, 'credential.enc'), safeStorage: encryption });
}

test('credential is encrypted, never returned by status, and no plaintext fallback is allowed', t => {
  const vault = setup(t);
  const value = grant('http://127.0.0.1:8000');
  vault.install(value);
  assert.equal(vault.status().configured, true);
  assert.equal(JSON.stringify(vault.status()).includes(TOKEN), false);
  assert.equal(fs.readFileSync(vault.filePath).includes(TOKEN), false);
  const unsafe = createCredentialVault({ filePath: vault.filePath, safeStorage: { ...encryption, isEncryptionAvailable: () => false } });
  assert.throws(() => unsafe.read(), /protected storage/i);
  const plaintext = createCredentialVault({ filePath: vault.filePath, platform: 'linux', safeStorage: { ...encryption, getSelectedStorageBackend: () => 'basic_text' } });
  assert.throws(() => plaintext.install(value), /protected storage/i);
});

test('expiry, malformed scope, hostile base URL and mismatched actor fail closed', t => {
  const vault = setup(t);
  assert.throws(() => vault.install({ ...grant('http://localhost:8000'), expires_at: '2000-01-01T00:00:00Z' }), /expired/i);
  assert.throws(() => vault.install({ ...grant('http://localhost:8000'), scopes: ['admin:*'] }), /scope/i);
  assert.throws(() => vault.install({ ...grant('http://localhost:8000'), actor_id: 'human-admin' }), /identity/i);
  assert.throws(() => vault.install(grant('https://agent.example/api?token=oops')), /base URL/i);
});

test('pinned gateway injects service identity, blocks redirects and human mutations', async t => {
  const vault = setup(t);
  vault.install(grant('https://agent.example/api'));
  let calls = 0;
  let options;
  const gateway = createSecureGateway({ vault, fetchImpl: async (_url, request) => {
    calls++;
    options = request;
    return new Response('{}', { headers: { 'Content-Type': 'application/json', 'Set-Cookie': 'secret=1' } });
  } });
  const result = await gateway.fetch('https://agent.example/api/v1/graph/paths', { method: 'POST', body: '{}' });
  assert.equal(options.headers.get('authorization'), `Bearer ${TOKEN}`);
  assert.equal(options.headers.get('x-user-id'), grant('').actor_id);
  assert.equal(options.headers.get('x-project-id'), 'project-test');
  assert.equal(options.redirect, 'error');
  assert.equal(options.credentials, 'omit');
  assert.equal(result.headers.get('set-cookie'), null);
  for (const url of ['https://other.example/v1/ask', 'https://agent.example/api2/v1/ask', 'https://agent.example/api/v1/ask?token=oops']) {
    await assert.rejects(gateway.fetch(url, { method: 'POST' }));
  }
  await assert.rejects(gateway.fetch('https://agent.example/api/v1/feedback', { method: 'POST', body: '{}' }), /human|scope/i);
  await assert.rejects(gateway.fetch('https://agent.example/api/v1/datasets/images/export.jsonl'), /scope/i);
  assert.equal(calls, 1);
});

test('no-write multipart is preserved and mismatched tenant claims are rejected, not rewritten', async t => {
  const vault = setup(t);
  vault.install(grant('http://localhost:8000'));
  let calls = 0;
  const gateway = createSecureGateway({ vault, fetchImpl: async (_url, options) => {
    calls++;
    const form = await new Response(options.body, { headers: options.headers }).formData();
    assert.equal(form.get('persist_mode'), 'never');
    assert.equal(form.getAll('view_files').length, 2);
    return new Response('{"persisted_to_dataset":false,"service_writes_performed":false}');
  } });
  const form = new FormData();
  form.set('persist_mode', 'never');
  form.append('view_files', new Blob(['first']), 'first.png');
  form.append('view_files', new Blob(['second']), 'second.png');
  await gateway.fetch('http://localhost:8000/v1/vision/diagnose', { method: 'POST', body: form });
  form.set('persist_mode', 'always');
  await assert.rejects(gateway.fetch('http://localhost:8000/v1/vision/diagnose', { method: 'POST', body: form }), /scope|no.write/i);
  await assert.rejects(gateway.fetch('http://localhost:8000/v1/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"workspace":{"user_id":"human-admin"}}' }), /identity/i);
  assert.equal(calls, 1);
});

test('real HTTP binary retrieval is authenticated and response bodies cannot leak the token', async t => {
  const server = http.createServer((request, response) => {
    assert.equal(request.headers.authorization, `Bearer ${TOKEN}`);
    if (request.url.includes('/leak/')) return response.end(TOKEN);
    response.writeHead(200, { 'Content-Type': 'image/png' });
    response.end(Buffer.from([137, 80, 78, 71]));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const vault = setup(t);
  const base = `http://127.0.0.1:${server.address().port}`;
  vault.install(grant(base));
  const gateway = createSecureGateway({ vault });
  const response = await gateway.fetch(`${base}/v1/datasets/images/test/file`);
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [137, 80, 78, 71]);
  await assert.rejects(gateway.fetch(`${base}/v1/datasets/images/leak/file`), /credential/i);
});

test('only the registered main window top-level local app frame may use credential IPC', () => {
  const owner = { id: 7 };
  const expectedUrl = 'file:///C:/app/index.html';
  const top = { url: expectedUrl, parent: null };
  const event = { sender: owner, senderFrame: top };
  assert.equal(isTrustedCommonAgentSender(event, owner, expectedUrl), true);
  assert.equal(isTrustedCommonAgentSender({ ...event, sender: { id: 8 } }, owner, expectedUrl), false);
  assert.equal(isTrustedCommonAgentSender({ ...event, senderFrame: { url: expectedUrl, parent: top } }, owner, expectedUrl), false);
  assert.equal(isTrustedCommonAgentSender({ ...event, senderFrame: { url: 'https://evil.example', parent: null } }, owner, expectedUrl), false);
});

test('timeout covers a stalled response body as well as response headers', async t => {
  const vault = setup(t);
  vault.install(grant('http://localhost:8000'));
  const gateway = createSecureGateway({ vault, fetchImpl: async () => new Response(new ReadableStream({ start() {} })) });
  await assert.rejects(Promise.race([
    gateway.fetch('http://localhost:8000/v1/datasets/images/test/file', {}, 15),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Response body has no deadline')), 80))
  ]), /timed out/i);
});

test('whitelisted response headers cannot leak the protected token', async t => {
  const vault = setup(t);
  vault.install(grant('http://localhost:8000'));
  const gateway = createSecureGateway({ vault, fetchImpl: async () => new Response('{}', {
    headers: { 'Cache-Control': `private=${TOKEN}` }
  }) });
  await assert.rejects(gateway.fetch('http://localhost:8000/v1/vision/status'), /credential/i);
});

test('Windows protected storage does not call the Linux-only backend selector', t => {
  const vault = setup(t);
  const windows = createCredentialVault({ filePath: vault.filePath, platform: 'win32', safeStorage: {
    ...encryption, getSelectedStorageBackend: () => { throw new Error('Linux-only method'); }
  } });
  assert.equal(windows.install(grant('http://localhost:8000')).configured, true);
});

test('request normalization preserves slash characters inside query values', async t => {
  const vault = setup(t);
  vault.install(grant('http://localhost:8000'));
  let observed;
  const gateway = createSecureGateway({ vault, fetchImpl: async url => { observed = url; return new Response('{}'); } });
  await gateway.fetch('http://localhost:8000/v1/datasets/images?source_path=part/');
  assert.equal(new URL(observed).searchParams.get('source_path'), 'part/');
});
