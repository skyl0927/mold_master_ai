const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const { validateKnowledgeCard } = require('./webKnowledgeCard');

const COLLECTION_PREFIX = 'web-injection-defect-cases-';

const sha256File = filePath => {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
};

const assertCollectionFile = rootPath => {
  const cardsPath = path.join(rootPath, 'cards.json');
  if (!fs.existsSync(cardsPath)) {
    throw new Error(`Web knowledge collection has no cards.json: ${rootPath}`);
  }
  return cardsPath;
};

const findLatestWebKnowledgeCollection = ({
  configuredRoot,
  artifactsRoot = path.join(__dirname, 'artifacts')
} = {}) => {
  if (configuredRoot) {
    const resolved = path.resolve(configuredRoot);
    assertCollectionFile(resolved);
    return resolved;
  }
  if (!fs.existsSync(artifactsRoot)) {
    throw new Error(`Web knowledge artifacts root does not exist: ${artifactsRoot}`);
  }
  const candidates = fs.readdirSync(artifactsRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && entry.name.startsWith(COLLECTION_PREFIX))
    .map(entry => path.resolve(artifactsRoot, entry.name))
    .filter(rootPath => fs.existsSync(path.join(rootPath, 'cards.json')))
    .sort((left, right) => path.basename(right).localeCompare(path.basename(left)));
  if (candidates.length === 0) {
    throw new Error('No complete web injection defect collection was found.');
  }
  return candidates[0];
};

const resolveCollectionFile = (rootPath, relativeFile) => {
  const resolvedRoot = path.resolve(rootPath);
  const resolvedFile = path.resolve(resolvedRoot, String(relativeFile || ''));
  const relative = path.relative(resolvedRoot, resolvedFile);
  if (!relative || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    if (!relative) return resolvedFile;
    throw new Error(`Evidence file resolves outside collection root: ${relativeFile}`);
  }
  return resolvedFile;
};

const loadWebKnowledgeCollection = rootPath => {
  const resolvedRoot = path.resolve(rootPath);
  const cardsPath = assertCollectionFile(resolvedRoot);
  const cards = JSON.parse(fs.readFileSync(cardsPath, 'utf8'));
  if (!Array.isArray(cards) || cards.length === 0) {
    throw new Error('Web knowledge collection must contain at least one card.');
  }

  const validationErrors = [];
  let verifiedImages = 0;
  for (const card of cards) {
    const validation = validateKnowledgeCard(card);
    if (!validation.valid) {
      validationErrors.push(`${card?.caseId || 'unknown'}: ${validation.errors.join(', ')}`);
    }
    for (const evidence of card?.evidence || []) {
      if (!evidence?.localFile) continue;
      const localPath = resolveCollectionFile(resolvedRoot, evidence.localFile);
      if (!fs.existsSync(localPath)) {
        throw new Error(`Evidence file is missing: ${evidence.localFile}`);
      }
      const actualHash = sha256File(localPath);
      if (actualHash !== String(evidence.contentSha256 || '').toLowerCase()) {
        throw new Error(`Evidence image hash mismatch: ${evidence.localFile}`);
      }
      verifiedImages += 1;
    }
  }
  if (validationErrors.length > 0) {
    throw new Error(`Invalid web knowledge cards: ${validationErrors.join('; ')}`);
  }

  const reportPath = path.join(resolvedRoot, 'collection-report.json');
  const report = fs.existsSync(reportPath)
    ? JSON.parse(fs.readFileSync(reportPath, 'utf8'))
    : null;
  return {
    rootPath: resolvedRoot,
    cardsPath,
    cards,
    report,
    integrity: {
      valid: true,
      cardCount: cards.length,
      verifiedImages
    }
  };
};

module.exports = {
  COLLECTION_PREFIX,
  findLatestWebKnowledgeCollection,
  loadWebKnowledgeCollection,
  resolveCollectionFile
};
