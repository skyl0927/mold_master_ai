const fs = require('node:fs');
const path = require('node:path');
const {
  buildOperationalHitlHumanDecisionBrief
} = require('../operationalHitlHumanDecisionBrief');

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

const pipelineStatusPath = resolveOptionalPath(
  valueAfter('--pipeline-status'),
  process.env.OPERATIONAL_HITL_PIPELINE_STATUS,
  latestArtifact('operational-hitl-pipeline-status-')
);

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

const reviewSessionProgressPath = resolveOptionalPath(
  valueAfter('--review-session-progress'),
  process.env.OPERATIONAL_HITL_REVIEW_SESSION_PROGRESS,
  latestArtifact('operational-hitl-review-session-progress-')
);

const baseOutput = valueAfter('--output-base')
  || process.env.OPERATIONAL_HITL_HUMAN_DECISION_BRIEF_OUTPUT_BASE
  || path.join(artifactRoot, `operational-hitl-human-decision-brief-${timestamp()}`);

const jsonOutputPath = path.resolve(`${baseOutput}.json`);
const markdownOutputPath = path.resolve(`${baseOutput}.md`);

const run = () => {
  const report = buildOperationalHitlHumanDecisionBrief({
    pipelineStatus: readOptionalJson(pipelineStatusPath),
    reviewSessionPlan: readOptionalJson(reviewSessionPlanPath),
    reviewSessionPacket: readOptionalJson(reviewSessionPacketPath),
    reviewSessionProgress: readOptionalJson(reviewSessionProgressPath),
    markdownPath: markdownOutputPath,
    sourceArtifacts: {
      pipelineStatus: pipelineStatusPath,
      reviewSessionPlan: reviewSessionPlanPath,
      reviewSessionPacket: reviewSessionPacketPath,
      reviewSessionProgress: reviewSessionProgressPath
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
    currentStage: report.pipelineStageCode,
    worktableCsvPath: report.worktableCsvPath,
    totalRows: report.summary.totalRows,
    completedRows: report.summary.completedRows,
    pendingRows: report.summary.pendingRows,
    invalidRows: report.summary.invalidRows,
    highRiskRows: report.summary.highRiskRows,
    decisionEntryQueueRows: report.summary.decisionEntryQueueRows,
    nextSessionCode: report.summary.nextSessionCode,
    nextDecisionId: report.summary.nextDecisionId,
    nextEntryCopyableFields: report.decisionEntryQueue?.[0]?.copyableFields || [],
    nextEntryManualConfirmationFields: report.decisionEntryQueue?.[0]?.manualConfirmationFields || [],
    nextEntrySessionPath: report.decisionEntryQueue?.[0]?.sessionMarkdownPath
      || report.decisionEntryQueue?.[0]?.sessionCsvPath
      || null,
    recommendedAction: report.recommendedAction
  }, null, 2));
};

try {
  run();
} catch (error) {
  const report = buildOperationalHitlHumanDecisionBrief({
    sourceArtifacts: {
      pipelineStatus: pipelineStatusPath,
      reviewSessionPlan: reviewSessionPlanPath,
      reviewSessionPacket: reviewSessionPacketPath,
      reviewSessionProgress: reviewSessionProgressPath
    }
  });
  report.summary.error = error instanceof Error ? error.message : String(error);
  writeJson(jsonOutputPath, report);
  console.error(error);
  process.exitCode = 1;
}
