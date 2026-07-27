const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  buildWebKnowledgeOperationalReadiness
} = require('../webKnowledgeOperationalReadiness');
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

const readIngestions = filePath => {
  const payload = readOptionalJson(filePath);
  return Array.isArray(payload) ? payload : Array.isArray(payload?.ingestions) ? payload.ingestions : [];
};

const collectionRoot = findLatestWebKnowledgeCollection({
  configuredRoot: valueAfter('--collection')
    || process.env.MOLD_MASTER_WEB_CASE_ROOT,
  artifactsRoot: artifactRoot
});
const collection = loadWebKnowledgeCollection(collectionRoot);

const qualityAuditPath = path.resolve(
  valueAfter('--quality-audit')
  || process.env.MOLD_MASTER_WEB_KNOWLEDGE_QUALITY_AUDIT
  || path.join(artifactRoot, 'web-knowledge-quality-audit.json')
);
const commonAgentValidationPath = path.resolve(
  valueAfter('--common-agent-validation')
  || process.env.MOLD_MASTER_WEB_KNOWLEDGE_COMMON_AGENT_VALIDATION
  || path.join(artifactRoot, 'web-knowledge-common-agent-validation.json')
);
const reviewLedgerPath = path.resolve(
  valueAfter('--review-ledger')
  || process.env.MOLD_MASTER_WEB_KNOWLEDGE_REVIEW_LEDGER
  || defaultUserDataPath('web-knowledge-review-decisions.json')
);
const ingestionLedgerPath = path.resolve(
  valueAfter('--ingestion-ledger')
  || process.env.MOLD_MASTER_WEB_KNOWLEDGE_INGESTION_LEDGER
  || defaultUserDataPath('web-knowledge-central-ingestions.json')
);
const outputPath = path.resolve(
  valueAfter('--output')
  || process.env.MOLD_MASTER_WEB_KNOWLEDGE_READINESS_OUTPUT
  || path.join(artifactRoot, `web-knowledge-operational-readiness-${timestamp()}.json`)
);
const targetCardCount = Number(valueAfter('--target') || process.env.MOLD_MASTER_WEB_KNOWLEDGE_TARGET || 40);

const ledger = createWebKnowledgeCardReviewLedger({ filePath: reviewLedgerPath });
const readiness = buildWebKnowledgeOperationalReadiness({
  collection,
  qualityAudit: readOptionalJson(qualityAuditPath),
  commonAgentValidation: readOptionalJson(commonAgentValidationPath),
  reviewQueue: ledger.queue(collection.cards),
  ingestions: readIngestions(ingestionLedgerPath),
  targetCardCount,
  sourceArtifacts: {
    qualityAudit: fs.existsSync(qualityAuditPath) ? qualityAuditPath : null,
    commonAgentValidation: fs.existsSync(commonAgentValidationPath) ? commonAgentValidationPath : null,
    reviewLedger: fs.existsSync(reviewLedgerPath) ? reviewLedgerPath : null,
    ingestionLedger: fs.existsSync(ingestionLedgerPath) ? ingestionLedgerPath : null
  }
});

writeJson(outputPath, readiness);
console.log(JSON.stringify({
  outputPath,
  status: readiness.status,
  cardCount: readiness.summary.cardCount,
  targetCardCount: readiness.summary.targetCardCount,
  commonAgentValidationPassed: readiness.summary.commonAgentValidationPassed,
  approvedHitlCards: readiness.summary.approvedHitlCards,
  hitlApprovalsMissing: readiness.summary.hitlApprovalsMissing,
  centralApprovedDocuments: readiness.summary.centralApprovedDocuments,
  centralApprovalsMissing: readiness.summary.centralApprovalsMissing,
  serviceWritesPerformed: readiness.serviceWritesPerformed,
  recommendedAction: readiness.recommendedAction
}, null, 2));

if (readiness.status === 'action_required') process.exitCode = 1;
