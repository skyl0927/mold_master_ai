const fs = require('node:fs');
const path = require('node:path');
const { normalizeCommonAgentBaseUrl, fetchWithCommonAgentPolicy } = require('./commonAgentTransport');

const SCOPES = new Set(['vision:read', 'vision:diagnose:no_write', 'vision:diagnose:write',
  'datasets:read', 'datasets:export', 'graph:read', 'ask:run', 'documents:ingest']);
const PUBLIC_GET = new Set(['/health', '/healthz', '/openapi.json', '/v1/auth/status']);
const MAX_REQUEST_BYTES = 128 * 1024 * 1024;
const MAX_RESPONSE_BYTES = 32 * 1024 * 1024;

function normalizeBase(value) {
  const base = normalizeCommonAgentBaseUrl(value);
  const url = new URL(base);
  if (url.search || url.hash) throw new Error('Invalid credential base URL');
  return base;
}

function validateGrant(input) {
  if (!input || !/^ca_service_v1\.[a-f0-9]{32}\.[a-f0-9]{64}$/.test(input.token || '')) {
    throw new Error('Invalid program credential');
  }
  if (!/^service-[a-f0-9]{32}$/.test(input.actor_id || '')
      || !/^[a-zA-Z0-9._-]{1,64}$/.test(input.workspace_id || '')
      || !/^[a-zA-Z0-9._-]{1,128}$/.test(input.project_id || '')) throw new Error('Invalid program identity');
  if (input.status !== 'active') throw new Error('Inactive program credential');
  const expires = Date.parse(input.expires_at);
  if (!Number.isFinite(expires) || expires <= Date.now()) throw new Error('Program credential expired');
  if (!Array.isArray(input.scopes) || !input.scopes.length || input.scopes.length > SCOPES.size
      || new Set(input.scopes).size !== input.scopes.length || input.scopes.some(scope => !SCOPES.has(scope))) {
    throw new Error('Invalid program scope');
  }
  return { base_url: normalizeBase(input.base_url), token: input.token, actor_id: input.actor_id,
    workspace_id: input.workspace_id, project_id: input.project_id, status: 'active',
    expires_at: input.expires_at, scopes: [...input.scopes] };
}

function createCredentialVault({ filePath, safeStorage, platform = process.platform }) {
  function requireEncryption() {
    if (!safeStorage?.isEncryptionAvailable() || (platform === 'linux'
        && !['gnome_libsecret', 'kwallet', 'kwallet5', 'kwallet6'].includes(safeStorage.getSelectedStorageBackend?.()))) {
      throw new Error('OS protected storage unavailable; plaintext fallback is forbidden');
    }
  }
  function read() {
    if (!fs.existsSync(filePath)) return null;
    requireEncryption();
    try {
      return validateGrant(JSON.parse(safeStorage.decryptString(fs.readFileSync(filePath))));
    } catch (error) {
      if (error.message === 'Program credential expired') throw error;
      throw new Error('Protected program credential unreadable; import a valid replacement');
    }
  }
  function status() {
    try {
      const value = read();
      if (!value) return { configured: false, state: 'not_configured' };
      const { token: _token, ...view } = value;
      return { ...view, configured: true, state: 'ready' };
    } catch (error) {
      return { configured: true, state: error.message.includes('expired') ? 'expired' : 'unavailable' };
    }
  }
  function install(input) {
    requireEncryption();
    const grant = validateGrant(input);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const temporary = `${filePath}.${process.pid}.tmp`;
    try {
      fs.writeFileSync(temporary, safeStorage.encryptString(JSON.stringify(grant)), { mode: 0o600, flag: 'wx' });
      fs.renameSync(temporary, filePath);
    } finally {
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    }
    return status();
  }
  return { filePath, read, status, install };
}

function requestScope(method, endpoint) {
  if (method === 'GET' && PUBLIC_GET.has(endpoint)) return null;
  if (method === 'GET' && endpoint === '/v1/vision/status') return 'vision:read';
  if (method === 'POST' && endpoint === '/v1/vision/diagnose') return 'vision:diagnose';
  if (method === 'POST' && endpoint === '/v1/ask') return 'ask:run';
  if (method === 'POST' && endpoint === '/v1/graph/paths') return 'graph:read';
  if (method === 'POST' && ['/v1/workflows/ingest-file', '/v1/workflows/ingest-file-async', '/v1/workflows/ingest-files'].includes(endpoint)) return 'documents:ingest';
  if (method === 'GET' && /^\/v1\/datasets\/images\/export(?:\.jsonl|-yolo(?:\.jsonl)?)?$/.test(endpoint)) return 'datasets:export';
  if (method === 'GET' && (endpoint === '/v1/datasets/images'
      || /^\/v1\/datasets\/images\/[a-zA-Z0-9._-]+(?:\/(?:file|annotations|graph-link-audit))?$/.test(endpoint))) return 'datasets:read';
  throw new Error('Program scope does not permit this operation; human login may be required');
}

function enforceClaims(value, grant) {
  if (!value || typeof value !== 'object') return;
  const expected = { user_id: grant.actor_id, workspace_id: grant.workspace_id, project_id: grant.project_id };
  for (const [key, required] of Object.entries(expected)) {
    if (value[key] !== undefined && value[key] !== required) throw new Error('Supplied identity conflicts with program credential');
  }
  if (value.role != null && value.role !== 'service') throw new Error('Program identity cannot claim a human role');
  for (const field of ['workspace', 'metadata', 'filters']) enforceClaims(value[field], grant);
}

async function encodeBody(url, options) {
  const headers = new Headers(options.headers);
  if (options.body == null) return { headers, body: undefined };
  const request = new Request(url, { method: options.method || 'POST', headers, body: options.body });
  const body = new Uint8Array(await request.arrayBuffer());
  if (body.byteLength > MAX_REQUEST_BYTES) throw new Error('Common Agent request exceeds the transfer limit');
  return { headers: new Headers(request.headers), body };
}

async function boundedBytes(response, signal) {
  if (Number(response.headers.get('content-length')) > MAX_RESPONSE_BYTES) {
    await response.body?.cancel();
    throw new Error('Common Agent response exceeds the transfer limit');
  }
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal?.addEventListener('abort', cancel, { once: true });
  let size = 0;
  const chunks = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) throw new Error('Common Agent response exceeds the transfer limit');
      chunks.push(Buffer.from(value));
    }
    if (signal?.aborted) throw new Error('Common Agent request cancelled');
    return Buffer.concat(chunks);
  } finally {
    signal?.removeEventListener('abort', cancel);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

function createSecureGateway({ vault, fetchImpl = globalThis.fetch }) {
  async function perform(url, options, timeoutMs) {
    const grant = vault.read();
    normalizeCommonAgentBaseUrl(url);
    const normalized = new URL(String(url).trim());
    if (normalized.hash) throw new Error('Common Agent request fragments are not permitted');
    const base = grant ? new URL(grant.base_url) : null;
    let endpoint = normalized.pathname;
    if (base) {
      const prefix = base.pathname.replace(/\/$/, '');
      if (normalized.origin !== base.origin || !(endpoint === prefix || endpoint.startsWith(`${prefix}/`))) {
        throw new Error('Program credential is pinned to another trusted base URL');
      }
      endpoint = endpoint.slice(prefix.length) || '/';
    }
    if ([...normalized.searchParams.keys()].some(key => /^(token|api_key|access_token|apikey|service_token)$/i.test(key))) {
      throw new Error('Program credentials must not appear in URLs');
    }
    const method = String(options.method || 'GET').toUpperCase();
    const required = grant ? requestScope(method, endpoint) : null;
    const { headers, body } = await encodeBody(normalized, { ...options, method });
    if (headers.has('authorization') || headers.has('cookie')) throw new Error('Use the protected credential transport, not supplied authentication headers');
    if (grant) {
      const expected = { user_id: grant.actor_id, workspace_id: grant.workspace_id, project_id: grant.project_id };
      for (const [key, value] of Object.entries(expected)) {
        const header = `x-${key.replaceAll('_', '-')}`;
        if ((headers.has(header) && headers.get(header) !== value)
            || normalized.searchParams.getAll(key).some(claim => claim !== value)) throw new Error('Supplied identity conflicts with program credential');
      }
      const contentType = headers.get('content-type') || '';
      let mode;
      if (body && contentType.includes('application/json')) {
        const payload = JSON.parse(Buffer.from(body).toString('utf8'));
        enforceClaims(payload, grant);
      } else if (body && contentType.includes('multipart/form-data')) {
        const form = await require('./commonAgentMultipart').readMultipartFields(body, headers);
        mode = form.get('persist_mode');
        enforceClaims(Object.fromEntries([...form.entries()].filter(([, value]) => typeof value === 'string')), grant);
        if (form.get('metadata_json')) enforceClaims(JSON.parse(form.get('metadata_json')), grant);
      }
      const scope = required === 'vision:diagnose' ? (mode === 'never' ? 'vision:diagnose:no_write' : 'vision:diagnose:write') : required;
      if (scope && !grant.scopes.includes(scope) && !(scope === 'vision:diagnose:no_write' && grant.scopes.includes('vision:diagnose:write'))) {
        throw new Error('Program scope does not permit this operation or no-write mode');
      }
      if (scope) {
        headers.set('authorization', `Bearer ${grant.token}`);
        for (const [key, value] of Object.entries(expected)) headers.set(`x-${key.replaceAll('_', '-')}`, value);
      }
    }
    let response;
    try {
      response = await fetchWithCommonAgentPolicy(normalized.toString(), {
        method, body, headers, signal: options.signal, redirect: 'error', credentials: 'omit'
      }, { fetchImpl, timeoutMs: Math.min(timeoutMs || 45000, 180000) });
    } catch (error) {
      if (options.signal?.aborted) throw new Error('Common Agent request cancelled');
      throw new Error(error.message?.includes('ms') ? 'Common Agent request timed out' : 'Common Agent connection failed; check the trusted server address');
    }
    const bytes = await boundedBytes(response, options.signal);
    if (grant && bytes.includes(Buffer.from(grant.token))) throw new Error('Server response contains a protected credential');
    const safeHeaders = new Headers();
    for (const key of ['content-type', 'cache-control']) {
      if (!response.headers.has(key)) continue;
      const value = response.headers.get(key);
      if (grant && value.includes(grant.token)) throw new Error('Server response header contains a protected credential');
      safeHeaders.set(key, value);
    }
    return new Response([204, 205, 304].includes(response.status) ? null : bytes, { status: response.status, headers: safeHeaders });
  }
  async function fetch(url, options = {}, timeoutMs = 45000) {
    const boundedTimeout = Number.isFinite(timeoutMs) && timeoutMs > 0 ? Math.min(timeoutMs, 180000) : 45000;
    const controller = new AbortController();
    let timedOut = false;
    const abort = () => controller.abort();
    if (options.signal?.aborted) abort();
    else options.signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, boundedTimeout);
    try {
      const response = await perform(url, { ...options, signal: controller.signal }, boundedTimeout);
      if (controller.signal.aborted) throw new Error('Common Agent request cancelled');
      return response;
    } catch (error) {
      if (timedOut) throw new Error('Common Agent request timed out');
      throw error;
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', abort);
    }
  }
  return { fetch };
}

function isTrustedCommonAgentSender(event, owner, expectedUrl) {
  if (!owner || event.sender !== owner || !event.senderFrame || event.senderFrame.parent) return false;
  try {
    const source = new URL(event.senderFrame.url);
    source.hash = '';
    source.search = '';
    return source.toString() === new URL(expectedUrl).toString();
  } catch { return false; }
}

module.exports = { createCredentialVault, createSecureGateway, isTrustedCommonAgentSender };
