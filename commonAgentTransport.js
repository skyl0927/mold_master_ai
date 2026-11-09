const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const DEFAULT_TIMEOUT_MS = 45000;
const VISION_DIAGNOSIS_TIMEOUT_MS = 180000;
const { getRuntimeChildBridge } = require('./commonAgentChildTransport');

const parseCommonAgentUrl = value => {
  const candidate = String(value || '').trim();
  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error('Common Agent 주소가 올바른 URL이 아닙니다.');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Common Agent는 HTTP 또는 HTTPS 주소만 사용할 수 있습니다.');
  }
  if (parsed.username || parsed.password) {
    throw new Error('Common Agent 인증 정보를 URL에 포함할 수 없습니다.');
  }
  if (parsed.protocol === 'http:' && !LOOPBACK_HOSTS.has(parsed.hostname.toLowerCase())) {
    throw new Error('외부 Common Agent 주소는 HTTPS가 필요합니다. 로컬 개발 서버만 HTTP를 사용할 수 있습니다.');
  }
  return parsed;
};

const normalizeCommonAgentBaseUrl = value =>
  parseCommonAgentUrl(value).toString().replace(/\/+$/, '');

const fetchWithCommonAgentPolicy = async (
  url,
  options = {},
  { fetchImpl, timeoutMs = DEFAULT_TIMEOUT_MS, bridge = globalThis.window?.electronAPI || getRuntimeChildBridge() } = {}
) => {
  const validatedUrl = parseCommonAgentUrl(url).toString();
  if (!fetchImpl && bridge?.commonAgentRequest) {
    if (options.signal?.aborted) throw new Error('Common Agent request cancelled');
    const request = new Request(validatedUrl, { method: options.method || 'GET', headers: options.headers, body: options.body });
    const requestId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    const body = options.body == null ? undefined : new Uint8Array(await request.arrayBuffer());
    const cancel = () => { void bridge.cancelCommonAgentRequest?.(requestId); };
    options.signal?.addEventListener('abort', cancel, { once: true });
    try {
      if (options.signal?.aborted) throw new Error('Common Agent request cancelled');
      const result = await bridge.commonAgentRequest({ url: validatedUrl, method: request.method,
        headers: Object.fromEntries(request.headers), body, timeoutMs, requestId });
      if (options.signal?.aborted) throw new Error('Common Agent request cancelled');
      return new Response([204, 205, 304].includes(result.status) ? null : result.body,
        { status: result.status, headers: result.headers });
    } finally { options.signal?.removeEventListener('abort', cancel); }
  }
  fetchImpl = fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new Error('Common Agent 요청에 사용할 fetch 구현이 없습니다.');
  }

  const boundedTimeoutMs = Number.isFinite(timeoutMs) && timeoutMs > 0
    ? Math.floor(timeoutMs)
    : DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  let timedOut = false;
  const abortFromCaller = () => controller.abort(options.signal?.reason);
  if (options.signal?.aborted) abortFromCaller();
  else options.signal?.addEventListener('abort', abortFromCaller, { once: true });

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, boundedTimeoutMs);

  try {
    return await fetchImpl(validatedUrl, {
      ...options,
      signal: controller.signal
    });
  } catch (error) {
    if (timedOut) {
      throw new Error(`Common Agent 요청 시간이 ${boundedTimeoutMs}ms를 초과했습니다.`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', abortFromCaller);
  }
};

const getAuthenticatedImageUrl = async (url, transportOptions = {}) => {
  const response = await fetchWithCommonAgentPolicy(url, {}, transportOptions);
  if (!response.ok) throw new Error(`Common Agent image request failed: ${response.status}`);
  if (!/^image\/(png|jpeg|webp)(?:;|$)/i.test(response.headers.get('content-type') || '')) {
    throw new Error('Common Agent returned an unsupported image format');
  }
  return URL.createObjectURL(await response.blob());
};

module.exports = {
  DEFAULT_TIMEOUT_MS,
  VISION_DIAGNOSIS_TIMEOUT_MS,
  fetchWithCommonAgentPolicy,
  getAuthenticatedImageUrl,
  normalizeCommonAgentBaseUrl
};
