const fs = require('node:fs');
const path = require('node:path');
const {
  shouldAdoptOperationalStatusBundle
} = require('./operationalStatusBundle');

const CONTRACT_VERSION = 'operational-status-bundle/v1';
const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;
const FILE_PATTERN = /^operational-status-bundle-.*\.json$/i;

const timestampFor = bundle => {
  if (!bundle || bundle.contractVersion !== CONTRACT_VERSION) return null;
  const timestamp = Date.parse(String(bundle.generatedAt || ''));
  return Number.isFinite(timestamp) ? timestamp : null;
};

const candidatePathsFor = roots => {
  const paths = [];
  const uniqueRoots = [...new Set((roots || []).map(root => path.resolve(String(root || ''))))];
  uniqueRoots.forEach(root => {
    if (!root || !fs.existsSync(root)) return;
    let entries;
    try {
      entries = fs.readdirSync(root, { withFileTypes: true });
    } catch {
      return;
    }
    entries
      .filter(entry => entry.isFile() && FILE_PATTERN.test(entry.name))
      .forEach(entry => paths.push(path.join(root, entry.name)));
  });
  return paths;
};

const readCandidate = (filePath, maxBytes) => {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size <= 0 || stat.size > maxBytes) return null;
    const bundle = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const timestamp = timestampFor(bundle);
    if (timestamp === null || bundle.serviceWritesPerformed === true) return null;
    return { filePath, bundle, timestamp };
  } catch {
    return null;
  }
};

const loadLatestOperationalStatusBundle = ({
  roots = [],
  maxBytes = DEFAULT_MAX_BYTES
} = {}) => {
  const sizeLimit = Number.isFinite(maxBytes) && maxBytes > 0
    ? maxBytes
    : DEFAULT_MAX_BYTES;
  const candidatePaths = candidatePathsFor(roots);
  const validCandidates = candidatePaths
    .map(filePath => readCandidate(filePath, sizeLimit))
    .filter(Boolean)
    .sort((left, right) => right.timestamp - left.timestamp
      || right.filePath.localeCompare(left.filePath));
  const latest = validCandidates[0] || null;

  if (!latest) {
    return {
      status: 'warning',
      summary: '유효한 최신 운영 상태 번들 없음',
      next_actions: ['Settings에서 Status Bundle JSON을 직접 등록'],
      artifacts: [],
      bundle: null,
      sourcePath: null,
      readOnly: true,
      rejectedCandidates: candidatePaths.length
    };
  }

  return {
    status: 'success',
    summary: `최신 운영 상태 번들 ${latest.bundle.generatedAt}`,
    next_actions: [],
    artifacts: [latest.filePath],
    bundle: latest.bundle,
    sourcePath: latest.filePath,
    readOnly: true,
    rejectedCandidates: candidatePaths.length - validCandidates.length
  };
};

module.exports = {
  CONTRACT_VERSION,
  DEFAULT_MAX_BYTES,
  loadLatestOperationalStatusBundle,
  shouldAdoptOperationalStatusBundle
};
