const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  buildWebKnowledgeHitlDecisionTemplate
} = require('../webKnowledgeHitlDecisionTemplate');
const {
  createWebKnowledgeCardReviewLedger
} = require('../webKnowledgeCardReviewLedger');
const {
  findLatestWebKnowledgeCollection,
  loadWebKnowledgeCollection
} = require('../webKnowledgeReviewStore');

const root = path.resolve(__dirname, '..');
const artifactRoot = path.join(root, 'artifacts');
const args = process.argv.slice(2);

const valueAfter = flag => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};

const timestamp = () => new Date().toISOString().replace(/[:.]/g, '-');

const defaultUserDataPath = fileName => {
  const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  return path.join(appData, 'capture-annotate-pro', fileName);
};

const writeJson = (filePath, payload) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
};

const collectionRoot = findLatestWebKnowledgeCollection({
  configuredRoot: valueAfter('--collection')
    || process.env.MOLD_MASTER_WEB_CASE_ROOT,
  artifactsRoot: artifactRoot
});
const collection = loadWebKnowledgeCollection(collectionRoot);
const reviewLedgerPath = path.resolve(
  valueAfter('--review-ledger')
  || process.env.MOLD_MASTER_WEB_KNOWLEDGE_REVIEW_LEDGER
  || defaultUserDataPath('web-knowledge-review-decisions.json')
);
const outputPath = path.resolve(
  valueAfter('--output')
  || process.env.MOLD_MASTER_WEB_HITL_DECISION_TEMPLATE_OUTPUT
  || path.join(artifactRoot, `common-agent-web-knowledge-hitl-decisions-template-${timestamp()}.json`)
);
const targetCardCount = Number(valueAfter('--target') || process.env.MOLD_MASTER_WEB_KNOWLEDGE_TARGET || 40);
const ledger = createWebKnowledgeCardReviewLedger({ filePath: reviewLedgerPath });
const template = buildWebKnowledgeHitlDecisionTemplate({
  reviewQueue: ledger.queue(collection.cards),
  targetCardCount,
  sourceArtifacts: {
    collectionRoot,
    reviewLedger: fs.existsSync(reviewLedgerPath) ? reviewLedgerPath : null
  }
});

writeJson(outputPath, template);
console.log(JSON.stringify({
  outputPath,
  status: template.status,
  totalCards: template.summary.totalCards,
  currentApprovedCards: template.summary.currentApprovedCards,
  currentApprovalsMissing: template.summary.currentApprovalsMissing,
  decisionsPrepared: template.summary.decisionsPrepared,
  serviceWritesPerformed: template.serviceWritesPerformed,
  recommendedAction: template.recommendedAction
}, null, 2));
