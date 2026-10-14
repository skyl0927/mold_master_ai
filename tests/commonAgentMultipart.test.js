const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const file = path.join(__dirname, '../commonAgentMultipart.js');
const { readMultipartFields } = fs.existsSync(file) ? require(file) : {};
const { createSecureGateway } = require('../commonAgentSecureGateway');

async function encode(form) {
  const request = new Request('http://127.0.0.1:9123/v1/vision/diagnose', { method: 'POST', body: form });
  return { body: new Uint8Array(await request.arrayBuffer()), headers: request.headers };
}

test('reads Unicode fields while draining repeated binary files without changing the body', async () => {
  assert.equal(typeof readMultipartFields, 'function');
  const form = new FormData();
  form.append('persist_mode', 'never');
  form.append('question', '설계 검토');
  for (let i = 0; i < 4; i++) form.append('view_files', new Blob([new Uint8Array([0, 255, 13, 10])]), `${i}.png`);
  const { body, headers } = await encode(form);
  const before = Buffer.from(body);
  const fields = await readMultipartFields(body, headers);
  assert.deepEqual([...fields], [['persist_mode', 'never'], ['question', '설계 검토']]);
  assert.deepEqual(Buffer.from(body), before);
});

test('ambiguous scalar fields and files pretending to be authorization fields fail closed', async () => {
  assert.equal(typeof readMultipartFields, 'function');
  for (const name of ['persist_mode', 'workspace_id', 'project_id', 'user_id', 'metadata_json']) {
    for (const isFile of [false, true]) {
      const form = new FormData();
      form.append(name, 'never');
      if (isFile) form.append(name, new Blob(['always']), 'value.txt');
      else form.append(name, 'always');
      const { body, headers } = await encode(form);
      await assert.rejects(readMultipartFields(body, headers), /multipart/i);
    }
  }
});

test('invalid, truncated, encoded or excessive multipart bodies never authorize an upstream call', async () => {
  assert.equal(typeof readMultipartFields, 'function');
  await assert.rejects(readMultipartFields(new Uint8Array(), new Headers()), /multipart/i);
  const valid = new FormData();
  valid.append('persist_mode', 'never');
  const { body, headers } = await encode(valid);
  await assert.rejects(readMultipartFields(body.slice(0, -10), headers), /multipart/i);
  const excessive = new FormData();
  excessive.append('question', 'x'.repeat(65537));
  const large = await encode(excessive);
  await assert.rejects(readMultipartFields(large.body, large.headers), /multipart/i);
  const many = new FormData();
  for (let i = 0; i < 65; i++) many.append(`field-${i}`, 'value');
  const crowded = await encode(many);
  await assert.rejects(readMultipartFields(crowded.body, crowded.headers), /multipart/i);
  const encoded = Buffer.from('--fixture\r\nContent-Disposition: form-data; name="view_files"; filename="a.png"\r\nContent-Transfer-Encoding: base64\r\n\r\nYQ==\r\n--fixture--\r\n');
  await assert.rejects(readMultipartFields(encoded, new Headers({'content-type': 'multipart/form-data; boundary=fixture'})), /multipart/i);
});

test('gateway validates actual multipart bytes and rejects conflicting no-write claims before forwarding', async () => {
  let calls = 0;
  const grant = { base_url: 'http://127.0.0.1:9123', token: 'TEST-ONLY-TOKEN', actor_id: 'service-test',
    workspace_id: 'workspace-test', project_id: 'project-test', scopes: ['vision:diagnose:no_write'] };
  const gateway = createSecureGateway({ vault: { read: () => grant }, fetchImpl: async () => {calls++; return new Response('{}');} });
  const form = new FormData();
  form.append('persist_mode', 'never');
  form.append('persist_mode', 'always');
  await assert.rejects(gateway.fetch(grant.base_url + '/v1/vision/diagnose', {method:'POST', body:form}), /multipart/i);
  assert.equal(calls, 0);
});
