const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  buildWebKnowledgeHitlDecisionVerificationReport
} = require('../webKnowledgeHitlDecisionVerification');
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

const readOptionalJson = filePath => {
  if (!filePath || !fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
};

const writeJson = (filePath, payload) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
};

const latestArtifact = prefix => {
  if (!fs.existsSync(artifactRoot)) return null;
  return fs.readdirSync(artifactRoot)
    .filter(name => name.startsWith(prefix) && name.endsWith('.json'))
    .map(name => path.join(artifactRoot, name))
    .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs)
    .at(0) || null;
};

const resolveOptionalPath = value => value ? path.resolve(value) : null;

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
const decisionPacketPath = resolveOptionalPath(
  valueAfter('--decisions')
  || process.env.MOLD_MASTER_WEB_HITL_DECISION_PACKET
  || latestArtifact('common-agent-web-knowledge-hitl-decisions-template-')
);
const outputPath = path.resolve(
  valueAfter('--output')
  || process.env.MOLD_MASTER_WEB_HITL_DECISION_VERIFICATION_OUTPUT
  || path.join(artifactRoot, `web-knowledge-hitl-decision-verification-report-${timestamp()}.json`)
);
const ledger = createWebKnowledgeCardReviewLedger({ filePath: reviewLedgerPath });
const report = buildWebKnowledgeHitlDecisionVerificationReport({
  reviewQueue: ledger.queue(collection.cards),
  decisionPacket: readOptionalJson(decisionPacketPath),
  sourceArtifacts: {
    decisionPacket: decisionPacketPath && fs.existsSync(decisionPacketPath) ? decisionPacketPath : null,
    collectionRoot,
    reviewLedger: fs.existsSync(reviewLedgerPath) ? reviewLedgerPath : null
  }
});

writeJson(outputPath, report);
console.log(JSON.stringify({
  outputPath,
  status: report.status,
  queueItems: report.summary.queueItems,
  decisionsReceived: report.summary.decisionsReceived,
  acceptedDecisions: report.summary.acceptedDecisions,
  invalidDecisions: report.summary.invalidDecisions,
  pendingQueueItems: report.summary.pendingQueueItems,
  approvedCards: report.summary.approvedCards,
  needsChangesCards: report.summary.needsChangesCards,
  rejectedCards: report.summary.rejectedCards,
  serviceWritesPerformed: report.serviceWritesPerformed,
  recommendedAction: report.recommendedAction
}, null, 2));

if (report.status === 'invalid_decisions') process.exitCode = 1;
