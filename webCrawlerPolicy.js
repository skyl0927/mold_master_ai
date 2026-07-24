const { ALLOWED_SOURCE_HOSTS } = require('./webKnowledgeCard');

const DEFAULT_USER_AGENT = 'MoldMasterKnowledgeCollector/1.0';

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

const normalizeAgent = value => String(value || '')
  .toLocaleLowerCase()
  .replace(/[^a-z0-9_-]/g, '');

const parseRobotsTxt = value => {
  const groups = [];
  let current = null;
  for (const rawLine of String(value || '').split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const delimiter = line.indexOf(':');
    if (delimiter < 0) continue;
    const field = line.slice(0, delimiter).trim().toLocaleLowerCase();
    const entry = line.slice(delimiter + 1).trim();
    if (field === 'user-agent') {
      if (!current || current.rules.length > 0) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(normalizeAgent(entry));
      continue;
    }
    if (!current || !['allow', 'disallow'].includes(field)) continue;
    if (field === 'disallow' && !entry) continue;
    current.rules.push({
      directive: field,
      path: entry
    });
  }
  return groups;
};

const evaluateRobotsTxt = (robotsTxt, pathname, userAgent = DEFAULT_USER_AGENT) => {
  const groups = parseRobotsTxt(robotsTxt);
  const normalizedAgent = normalizeAgent(userAgent.split('/')[0]);
  const specific = groups.filter(group =>
    group.agents.some(agent => agent !== '*' && normalizedAgent.includes(agent))
  );
  const applicable = specific.length > 0
    ? specific
    : groups.filter(group => group.agents.includes('*'));
  const rules = applicable.flatMap(group => group.rules);
  const matches = rules
    .filter(rule => String(pathname || '/').startsWith(rule.path))
    .sort((left, right) =>
      (right.path.length - left.path.length)
      || (left.directive === 'allow' ? -1 : 1)
    );
  const selected = matches[0];
  return {
    allowed: !selected || selected.directive === 'allow',
    matchedRule: selected || null,
    userAgent: normalizedAgent
  };
};

const assertAllowedSourceUrl = value => {
  let url;
  try {
    url = new URL(String(value || ''));
  } catch {
    throw new Error(`Invalid source URL: ${value}`);
  }
  if (url.protocol !== 'https:') {
    throw new Error(`Source URL must use HTTPS: ${url.toString()}`);
  }
  if (!ALLOWED_SOURCE_HOSTS.has(url.hostname.toLocaleLowerCase())) {
    throw new Error(`Source host is not in the allowlist: ${url.hostname}`);
  }
  return url;
};

const runtimeSecurityWarnings = environment => {
  const warnings = [];
  if (String(environment?.NODE_TLS_REJECT_UNAUTHORIZED || '') === '0') {
    warnings.push('tls_certificate_verification_disabled');
  }
  return warnings;
};

class PoliteHttpClient {
  constructor(options = {}) {
    this.fetchImpl = options.fetchImpl || fetch;
    this.userAgent = options.userAgent || DEFAULT_USER_AGENT;
    this.minimumIntervalMs = Number(options.minimumIntervalMs) || 750;
    this.timeoutMs = Number(options.timeoutMs) || 30000;
    this.maxRetries = Number.isInteger(options.maxRetries) ? options.maxRetries : 3;
    this.retryBaseMs = Number(options.retryBaseMs) || 2000;
    this.maximumRetryAfterMs = Number(options.maximumRetryAfterMs) || 15000;
    this.robotsCache = new Map();
    this.lastRequestAt = new Map();
    this.audit = [];
    this.retryCount = 0;
  }

  async waitForHost(origin) {
    const previous = this.lastRequestAt.get(origin) || 0;
    const delay = Math.max(0, this.minimumIntervalMs - (Date.now() - previous));
    if (delay > 0) await sleep(delay);
    this.lastRequestAt.set(origin, Date.now());
  }

  async rawFetch(url, options = {}) {
    await this.waitForHost(url.origin);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs || this.timeoutMs);
    try {
      const response = await this.fetchImpl(url, {
        ...options,
        headers: {
          'user-agent': this.userAgent,
          accept: options.accept || '*/*',
          ...(options.headers || {})
        },
        signal: controller.signal
      });
      this.audit.push({
        url: url.toString(),
        status: response.status,
        fetchedAt: new Date().toISOString()
      });
      return response;
    } finally {
      clearTimeout(timeout);
    }
  }

  async robotsPolicy(url) {
    if (this.robotsCache.has(url.origin)) return this.robotsCache.get(url.origin);
    const robotsUrl = new URL('/robots.txt', url.origin);
    const response = await this.rawFetch(robotsUrl, {
      accept: 'text/plain',
      timeoutMs: Math.min(this.timeoutMs, 15000)
    });
    let policy;
    if (response.ok) {
      policy = {
        status: response.status,
        text: await response.text(),
        assumedAllowed: false
      };
    } else if (response.status >= 400 && response.status < 500 && response.status !== 429) {
      policy = {
        status: response.status,
        text: '',
        assumedAllowed: true
      };
    } else {
      throw new Error(`robots.txt unavailable for ${url.origin}: HTTP ${response.status}`);
    }
    this.robotsCache.set(url.origin, policy);
    return policy;
  }

  async fetch(value, options = {}) {
    const url = assertAllowedSourceUrl(value);
    const policy = await this.robotsPolicy(url);
    const decision = policy.assumedAllowed
      ? { allowed: true, matchedRule: null }
      : evaluateRobotsTxt(policy.text, url.pathname, this.userAgent);
    if (!decision.allowed) {
      throw new Error(
        `robots.txt disallows ${url.pathname}: ${decision.matchedRule?.path || 'unknown rule'}`
      );
    }
    const retryStatuses = new Set([429, 502, 503, 504]);
    let response;
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      response = await this.rawFetch(url, options);
      if (!retryStatuses.has(response.status) || attempt === this.maxRetries) {
        return response;
      }
      this.retryCount += 1;
      const retryAfter = response.headers.get('retry-after');
      const retrySeconds = Number(retryAfter);
      const retryDate = retryAfter && !Number.isFinite(retrySeconds)
        ? Date.parse(retryAfter)
        : NaN;
      const retryDelay = Number.isFinite(retrySeconds)
        ? Math.max(0, retrySeconds * 1000)
        : Number.isFinite(retryDate)
          ? Math.max(0, retryDate - Date.now())
          : this.retryBaseMs * (2 ** attempt);
      await response.body?.cancel().catch(() => {});
      await sleep(Math.max(
        this.minimumIntervalMs,
        Math.min(this.maximumRetryAfterMs, retryDelay)
      ));
    }
    return response;
  }

  report() {
    return {
      userAgent: this.userAgent,
      minimumIntervalMs: this.minimumIntervalMs,
      retries: this.retryCount,
      maximumRetryAfterMs: this.maximumRetryAfterMs,
      requests: [...this.audit],
      robots: [...this.robotsCache.entries()].map(([origin, policy]) => ({
        origin,
        status: policy.status,
        assumedAllowed: policy.assumedAllowed
      })),
      securityWarnings: runtimeSecurityWarnings(process.env)
    };
  }
}

module.exports = {
  DEFAULT_USER_AGENT,
  PoliteHttpClient,
  assertAllowedSourceUrl,
  evaluateRobotsTxt,
  parseRobotsTxt,
  runtimeSecurityWarnings
};
