const fs = require('node:fs');
const path = require('node:path');
const {
  buildVisionPendingHitlReviewGuide
} = require('../visionPendingHitlReviewGuide');

const root = path.resolve(__dirname, '..');
const artifactRoot = path.join(root, 'artifacts');
const args = process.argv.slice(2);

const valueAfter = flag => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};

const timestamp = () => new Date().toISOString().replace(/[:.]/g, '-');

const latestArtifact = prefix => {
  if (!fs.existsSync(artifactRoot)) return null;
  const matches = fs.readdirSync(artifactRoot)
    .filter(name => name.startsWith(prefix) && name.endsWith('.json'))
    .map(name => path.join(artifactRoot, name))
    .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs);
  return matches[0] || null;
};

const resolveOptionalPath = (...candidates) => {
  const candidate = candidates.find(Boolean);
  return candidate ? path.resolve(candidate) : null;
};

const readOptionalJson = filePath => {
  if (!filePath || !fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
};

const writeJson = (filePath, payload) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
};

const decisionTemplatePath = resolveOptionalPath(
  valueAfter('--decision-template'),
  process.env.VISION_PENDING_HITL_DECISION_TEMPLATE,
  latestArtifact('common-agent-hitl-review-decisions-template-'),
  path.join(artifactRoot, 'common-agent-hitl-review-decisions-template.json')
);

const outputPath = path.resolve(
  valueAfter('--output')
  || process.env.VISION_PENDING_HITL_REVIEW_GUIDE_OUTPUT
  || path.join(artifactRoot, `vision-pending-hitl-review-guide-${timestamp()}.json`)
);

const run = () => {
  const guide = buildVisionPendingHitlReviewGuide({
    decisionTemplate: readOptionalJson(decisionTemplatePath),
    sourceArtifacts: {
      decisionTemplate: decisionTemplatePath
    }
  });

  writeJson(outputPath, guide);
  console.log(JSON.stringify({
    outputPath,
    status: guide.status,
    queueItems: guide.summary.queueItems,
    sourceVisionAgreements: guide.summary.sourceVisionAgreements,
    confidenceReviewRequired: guide.summary.confidenceReviewRequired,
    labelMismatches: guide.summary.labelMismatches,
    averageVisionConfidence: guide.summary.averageVisionConfidence,
    serviceWritesPerformed: guide.serviceWritesPerformed,
    firstQueueId: guide.items[0]?.queueId || null,
    firstRiskFlags: guide.items[0]?.riskFlags || [],
    recommendedAction: guide.recommendedAction
  }, null, 2));
};

try {
  run();
} catch (error) {
  const guide = buildVisionPendingHitlReviewGuide({
    decisionTemplate: null,
    sourceArtifacts: {
      decisionTemplate: decisionTemplatePath
    }
  });
  guide.status = 'missing_decision_template';
  guide.error = error instanceof Error ? error.message : String(error);
  writeJson(outputPath, guide);
  console.error(error);
  process.exitCode = 1;
}
