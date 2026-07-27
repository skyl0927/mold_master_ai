const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  applyWebKnowledgeHitlDecisionVerificationReport
} = require('../webKnowledgeHitlDecisionApply');
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

const hasFlag = flag => args.includes(flag);
const timestamp = () => new Date().toISOString().replace(/[:.]/g, '-');

const defaultUserDataPath = fileName => {
  const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  return path.join(appData, 'capture-annotate-pro', fileName);
};

const readJson = filePath =>
  JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));

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
const verificationReportInput = valueAfter('--verification-report')
  || process.env.MOLD_MASTER_WEB_HITL_DECISION_VERIFICATION_REPORT
  || latestArtifact('web-knowledge-hitl-decision-verification-report-');
const verificationReportPath = verificationReportInput
  ? path.resolve(verificationReportInput)
  : null;
const outputPath = path.resolve(
  valueAfter('--output')
  || process.env.MOLD_MASTER_WEB_HITL_DECISION_APPLY_OUTPUT
  || path.join(artifactRoot, `web-knowledge-hitl-decision-apply-report-${timestamp()}.json`)
);

if (
  !verificationReportPath
  || !fs.existsSync(verificationReportPath)
  || !fs.statSync(verificationReportPath).isFile()
) {
  throw new Error('Web Knowledge HITL decision verification report is required.');
}

const ledger = createWebKnowledgeCardReviewLedger({ filePath: reviewLedgerPath });
const report = applyWebKnowledgeHitlDecisionVerificationReport({
  verificationReport: readJson(verificationReportPath),
  collection,
  ledger,
  apply: hasFlag('--apply'),
  sourceArtifacts: {
    verificationReport: verificationReportPath,
    collectionRoot,
    reviewLedger: reviewLedgerPath
  }
});

writeJson(outputPath, report);
console.log(JSON.stringify({
  outputPath,
  status: report.status,
  applyRequested: report.applyRequested,
  plannedUpdates: report.summary.plannedUpdates,
  appliedUpdates: report.summary.appliedUpdates,
  invalidTargets: report.summary.invalidTargets,
  approvedCards: report.summary.approvedCards,
  needsChangesCards: report.summary.needsChangesCards,
  rejectedCards: report.summary.rejectedCards,
  serviceWritesPerformed: report.serviceWritesPerformed,
  localLedgerWritesPerformed: report.localLedgerWritesPerformed,
  recommendedAction: report.recommendedAction
}, null, 2));

if (['apply_target_mismatch', 'invalid_verification_report'].includes(report.status)) {
  process.exitCode = 1;
}
