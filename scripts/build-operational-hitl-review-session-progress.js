const fs = require('node:fs');
const path = require('node:path');
const {
  buildOperationalHitlReviewSessionProgress
} = require('../operationalHitlReviewSessionProgress');

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
  return fs.readdirSync(artifactRoot)
    .filter(name => name.startsWith(prefix) && name.endsWith('.json'))
    .map(name => path.join(artifactRoot, name))
    .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs)
    .at(0) || null;
};

const resolveOptionalPath = (...candidates) => {
  const candidate = candidates.find(Boolean);
  return candidate ? path.resolve(candidate) : null;
};

const readOptionalJson = filePath => {
  if (!filePath || !fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
};

const writeText = (filePath, payload) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, payload, 'utf8');
};

const writeJson = (filePath, payload) => {
  writeText(filePath, `${JSON.stringify(payload, null, 2)}\n`);
};

const reviewSessionPlanPath = resolveOptionalPath(
  valueAfter('--review-session-plan'),
  process.env.OPERATIONAL_HITL_REVIEW_SESSION_PLAN,
  latestArtifact('operational-hitl-review-session-plan-')
);

const reviewSessionPacketPath = resolveOptionalPath(
  valueAfter('--review-session-packet'),
  process.env.OPERATIONAL_HITL_REVIEW_SESSION_PACKET,
  latestArtifact('operational-hitl-review-session-packet-')
);

const worktableImportPath = resolveOptionalPath(
  valueAfter('--worktable-import'),
  process.env.OPERATIONAL_HITL_DECISION_WORKTABLE_IMPORT,
  latestArtifact('operational-hitl-decision-worktable-import-')
);

const baseOutput = valueAfter('--output-base')
  || process.env.OPERATIONAL_HITL_REVIEW_SESSION_PROGRESS_OUTPUT_BASE
  || path.join(artifactRoot, `operational-hitl-review-session-progress-${timestamp()}`);

const jsonOutputPath = path.resolve(`${baseOutput}.json`);
const markdownOutputPath = path.resolve(`${baseOutput}.md`);

const run = () => {
  const report = buildOperationalHitlReviewSessionProgress({
    reviewSessionPlan: readOptionalJson(reviewSessionPlanPath),
    reviewSessionPacket: readOptionalJson(reviewSessionPacketPath),
    worktableImport: readOptionalJson(worktableImportPath),
    sourceArtifacts: {
      reviewSessionPlan: reviewSessionPlanPath,
      reviewSessionPacket: reviewSessionPacketPath,
      worktableImport: worktableImportPath
    }
  });

  if (report.markdown) writeText(markdownOutputPath, report.markdown);
  writeJson(jsonOutputPath, {
    ...report,
    markdown: undefined,
    markdownPath: report.markdown ? markdownOutputPath : null
  });

  console.log(JSON.stringify({
    outputPath: jsonOutputPath,
    markdownPath: report.markdown ? markdownOutputPath : null,
    status: report.status,
    serviceWritesPerformed: report.serviceWritesPerformed,
    totalRows: report.summary.totalRows,
    completedRows: report.summary.completedRows,
    pendingRows: report.summary.pendingRows,
    invalidRows: report.summary.invalidRows,
    ignoredSimulationOnlyRows: report.summary.ignoredSimulationOnlyRows,
    sessionCount: report.summary.sessionCount,
    completeSessionCount: report.summary.completeSessionCount,
    blockedSessionCount: report.summary.blockedSessionCount,
    recommendedAction: report.recommendedAction
  }, null, 2));
};

try {
  run();
} catch (error) {
  const report = buildOperationalHitlReviewSessionProgress({
    sourceArtifacts: {
      reviewSessionPlan: reviewSessionPlanPath,
      reviewSessionPacket: reviewSessionPacketPath,
      worktableImport: worktableImportPath
    }
  });
  report.summary.error = error instanceof Error ? error.message : String(error);
  writeJson(jsonOutputPath, report);
  console.error(error);
  process.exitCode = 1;
}
