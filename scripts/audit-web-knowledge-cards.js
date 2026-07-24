const fs = require('node:fs');
const path = require('node:path');

const {
  findLatestWebKnowledgeCollection,
  loadWebKnowledgeCollection
} = require('../webKnowledgeReviewStore');
const {
  suggestCauseLabels,
  suggestCheckItems
} = require('../webKnowledgeCardReviewLedger');

const outputPath = path.resolve(
  process.argv[2]
  || path.join(process.cwd(), 'artifacts', 'web-knowledge-quality-audit.json')
);
const targetCardCount = 40;
const headingPattern =
  /\b(?:PROCESSING CHANGES|(?:MOLD|MACHINE|MATERIAL)-RELATED SOLUTIONS)\b/i;
const normalized = value => String(value || '').toLocaleLowerCase().replace(/\s+/g, ' ').trim();

const rootPath = findLatestWebKnowledgeCollection({
  configuredRoot: process.env.MOLD_MASTER_WEB_CASE_ROOT,
  artifactsRoot: path.join(process.cwd(), 'artifacts')
});
const collection = loadWebKnowledgeCollection(rootPath);
const classDistribution = {};
const findings = [];

for (const card of collection.cards) {
  classDistribution[card.defectClass] = (classDistribution[card.defectClass] || 0) + 1;
  const actions = card.actions || [];
  const uniqueActionCount = new Set(actions.map(normalized)).size;
  if (uniqueActionCount !== actions.length) {
    findings.push({
      severity: 'error',
      code: 'DUPLICATE_ACTIONS',
      caseId: card.caseId,
      count: actions.length - uniqueActionCount
    });
  }
  const noisyActions = actions.filter(action => headingPattern.test(action));
  if (noisyActions.length > 0) {
    findings.push({
      severity: 'error',
      code: 'SECTION_HEADING_IN_ACTION',
      caseId: card.caseId,
      values: noisyActions
    });
  }
  if (String(card.defectClass || '').startsWith('other:')
    || card.defectClass === 'unclassified') {
    findings.push({
      severity: 'error',
      code: 'UNSTABLE_DEFECT_CLASS',
      caseId: card.caseId,
      defectClass: card.defectClass
    });
  }
  if (suggestCauseLabels(card).length === 0) {
    findings.push({
      severity: 'error',
      code: 'CAUSE_LABEL_SUGGESTION_MISSING',
      caseId: card.caseId
    });
  }
  if (suggestCheckItems(card).length === 0) {
    findings.push({
      severity: 'error',
      code: 'CHECK_ITEM_SUGGESTION_MISSING',
      caseId: card.caseId
    });
  }
  if (card.review?.status !== 'candidate'
    || card.review?.autoApprovalAllowed !== false
    || card.review?.graphPromoted === true) {
    findings.push({
      severity: 'error',
      code: 'UNSAFE_REVIEW_STATE',
      caseId: card.caseId,
      review: card.review
    });
  }
}

if (collection.cards.length !== targetCardCount) {
  findings.push({
    severity: 'error',
    code: 'CARD_COUNT_MISMATCH',
    expected: targetCardCount,
    actual: collection.cards.length
  });
}

const report = {
  generatedAt: new Date().toISOString(),
  collectionRoot: rootPath,
  targetCardCount,
  cardCount: collection.cards.length,
  classCount: Object.keys(classDistribution).length,
  classDistribution,
  verifiedImages: collection.integrity.verifiedImages,
  candidateCount: collection.cards.filter(card => card.review?.status === 'candidate').length,
  autoApprovedCount: collection.cards.filter(card => card.review?.autoApprovalAllowed === true).length,
  graphPromotedCount: collection.cards.filter(card => card.review?.graphPromoted === true).length,
  findingCount: findings.length,
  passed: findings.length === 0,
  findings
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify({
  outputPath,
  passed: report.passed,
  cardCount: report.cardCount,
  classCount: report.classCount,
  verifiedImages: report.verifiedImages,
  findingCount: report.findingCount,
  autoApprovedCount: report.autoApprovedCount,
  graphPromotedCount: report.graphPromotedCount
}, null, 2));
if (!report.passed) process.exitCode = 1;
