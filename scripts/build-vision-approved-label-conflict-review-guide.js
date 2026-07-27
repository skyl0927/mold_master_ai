const fs = require('node:fs');
const path = require('node:path');
const {
  buildVisionApprovedLabelConflictReviewGuide
} = require('../visionApprovedLabelConflictReviewGuide');

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
  process.env.VISION_APPROVED_LABEL_CONFLICT_DECISION_TEMPLATE,
  latestArtifact('vision-approved-label-conflict-decisions-template-'),
  path.join(artifactRoot, 'vision-approved-label-conflict-decisions-template.json')
);

const outputPath = path.resolve(
  valueAfter('--output')
  || process.env.VISION_APPROVED_LABEL_CONFLICT_REVIEW_GUIDE_OUTPUT
  || path.join(artifactRoot, `vision-approved-label-conflict-review-guide-${timestamp()}.json`)
);

const run = () => {
  const guide = buildVisionApprovedLabelConflictReviewGuide({
    decisionTemplate: readOptionalJson(decisionTemplatePath),
    sourceArtifacts: {
      decisionTemplate: decisionTemplatePath
    }
  });

  writeJson(outputPath, guide);
  console.log(JSON.stringify({
    outputPath,
    status: guide.status,
    conflicts: guide.summary.conflicts,
    evidenceCases: guide.summary.evidenceCases,
    manifestUnlistedCases: guide.summary.manifestUnlistedCases,
    captureProtocolRiskCases: guide.summary.captureProtocolRiskCases,
    serviceWritesPerformed: guide.serviceWritesPerformed,
    firstConflict: guide.items[0]?.conflictId || null,
    firstRiskFlags: guide.items[0]?.riskFlags || [],
    recommendedAction: guide.recommendedAction
  }, null, 2));
};

try {
  run();
} catch (error) {
  const guide = buildVisionApprovedLabelConflictReviewGuide({
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
