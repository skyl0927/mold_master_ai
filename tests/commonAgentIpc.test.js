const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const present = fs.existsSync(path.join(__dirname, '../commonAgentIpc.js'));
const { registerCommonAgentIpc } = present ? require('../commonAgentIpc') : {};

function fixture(overrides = {}) {
  const handlers = new Map();
  const owner = { id: 7 };
  const event = { sender: owner, senderFrame: { url: 'file:///C:/app/index.html', parent: null } };
  const vault = { status: () => ({ configured: false }), install: value => ({ configured: true, actor_id: value.actor_id }) };
  registerCommonAgentIpc({ ipcMain: { handle: (name, fn) => handlers.set(name, fn) },
    getOwner: () => owner, getWindow: () => ({}), expectedUrl: 'file:///C:/app/index.html',
    getBaseUrl: () => 'http://127.0.0.1:8000', vault,
    gateway: { fetch: async (_url, options) => new Promise((resolve, reject) => {
      if (options.signal.aborted) reject(new Error('cancelled'));
      options.signal.addEventListener('abort', () => reject(new Error('cancelled')));
      if (!options.headers?.wait) resolve(new Response('ok', { headers: { 'Content-Type': 'text/plain' } }));
    }) },
    dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
    ...overrides
  });
  return { handlers, owner, event };
}

test('IPC pins the configured server even before a key is installed and denies foreign frames', async () => {
  const { handlers, event } = fixture();
  const request = handlers.get('COMMON_AGENT_REQUEST');
  const input = { url: 'http://127.0.0.1:8000/healthz', requestId: 'test-request-1' };
  const output = await request(event, input);
  assert.equal(new TextDecoder().decode(output.body), 'ok');
  await assert.rejects(request(event, { ...input, url: 'https://evil.example/healthz' }), /trusted/i);
  await assert.rejects(request({ ...event, senderFrame: { url: 'https://evil.example', parent: null } }, input), /trusted/i);
});

test('IPC cancellation targets the owned pending request and no broader process', async () => {
  const { handlers, event } = fixture();
  const pending = handlers.get('COMMON_AGENT_REQUEST')(event, {
    url: 'http://127.0.0.1:8000/healthz', headers: { wait: true }, requestId: 'test-request-2'
  });
  assert.equal(await handlers.get('CANCEL_COMMON_AGENT_REQUEST')(event, 'test-request-2'), true);
  await assert.rejects(pending, /cancelled/);
  assert.equal(await handlers.get('CANCEL_COMMON_AGENT_REQUEST')(event, 'test-request-2'), false);
});

test('credential import cancellation never installs or returns a raw secret', async () => {
  const { handlers, event } = fixture();
  assert.deepEqual(await handlers.get('IMPORT_COMMON_AGENT_CREDENTIAL')(event), { configured: false });
});

test('native import pins the saved server rather than trusting the file destination', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mold-master-ipc-unit-'));
  t.after(() => {
    assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith('mold-master-ipc-unit-'));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const filePath = path.join(directory, 'test-only.json');
  const token = `ca_service_v1.${'a'.repeat(32)}.${'b'.repeat(64)}`;
  fs.writeFileSync(filePath, JSON.stringify({ base_url: 'https://evil.example', token }));
  let installed;
  const { handlers, event } = fixture({
    vault: { status: () => ({ configured: false }), install: grant => { installed = grant; return { configured: true }; } },
    dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: [filePath] }), showMessageBox: async () => ({ response: 0 }) }
  });
  const result = await handlers.get('IMPORT_COMMON_AGENT_CREDENTIAL')(event);
  assert.equal(installed.base_url, 'http://127.0.0.1:8000');
  assert.equal(installed.token, token);
  assert.equal(JSON.stringify(result).includes(token), false);
});

test('IPC rejects malformed binary payloads and duplicate pending identifiers', async () => {
  const { handlers, event } = fixture();
  const request = handlers.get('COMMON_AGENT_REQUEST');
  const input = { url: 'http://127.0.0.1:8000/healthz', requestId: 'test-request-3' };
  await assert.rejects(request(event, { ...input, body: { arbitrary: 'object' } }), /payload/);
  const pending = request(event, { ...input, headers: { wait: true } });
  await assert.rejects(request(event, input), /already pending/);
  await handlers.get('CANCEL_COMMON_AGENT_REQUEST')(event, input.requestId);
  await assert.rejects(pending, /cancelled/);
});
