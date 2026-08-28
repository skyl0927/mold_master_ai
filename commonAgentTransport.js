const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const DEFAULT_TIMEOUT_MS = 45000;

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
  { fetchImpl = globalThis.fetch, timeoutMs = DEFAULT_TIMEOUT_MS } = {}
) => {
  const validatedUrl = parseCommonAgentUrl(url).toString();
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

module.exports = {
  DEFAULT_TIMEOUT_MS,
  fetchWithCommonAgentPolicy,
  normalizeCommonAgentBaseUrl
};
