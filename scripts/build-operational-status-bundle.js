const fs = require('node:fs');
const path = require('node:path');
const {
  buildOperationalStatusBundle
} = require('../operationalStatusBundle');

const root = path.resolve(__dirname, '..');
const artifactRoot = path.join(root, 'artifacts');
const args = process.argv.slice(2);

const valueAfter = flag => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};

const timestamp = () => new Date().toISOString().replace(/[:.]/g, '-');

const latestFile = (prefix, extension) => {
  if (!fs.existsSync(artifactRoot)) return null;
  return fs.readdirSync(artifactRoot)
    .filter(name => name.startsWith(prefix) && name.endsWith(extension))
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

const developmentProgressPath = resolveOptionalPath(
  valueAfter('--development-progress'),
  process.env.MOLD_MASTER_DEVELOPMENT_PROGRESS_REPORT,
  latestFile('mold-master-development-progress-report-', '.json')
);

const pipelineStatusPath = resolveOptionalPath(
  valueAfter('--pipeline-status'),
  process.env.OPERATIONAL_HITL_PIPELINE_STATUS,
  latestFile('operational-hitl-pipeline-status-', '.json')
);

const humanDecisionBriefPath = resolveOptionalPath(
  valueAfter('--human-decision-brief'),
  process.env.OPERATIONAL_HITL_HUMAN_DECISION_BRIEF,
  latestFile('operational-hitl-human-decision-brief-', '.json')
);

const humanDecisionBriefMarkdownPath = resolveOptionalPath(
  valueAfter('--human-decision-brief-md'),
  process.env.OPERATIONAL_HITL_HUMAN_DECISION_BRIEF_MARKDOWN,
  latestFile('operational-hitl-human-decision-brief-', '.md')
);

const reviewSessionPacketPath = resolveOptionalPath(
  valueAfter('--review-session-packet'),
  process.env.OPERATIONAL_HITL_REVIEW_SESSION_PACKET,
  latestFile('operational-hitl-review-session-packet-', '.json')
);

const worktableSuggestionPath = resolveOptionalPath(
  valueAfter('--worktable-suggestion'),
  process.env.OPERATIONAL_HITL_DECISION_WORKTABLE_SUGGESTION,
  latestFile('operational-hitl-decision-worktable-suggestion-', '.json')
);

const baseOutput = valueAfter('--output-base')
  || process.env.OPERATIONAL_STATUS_BUNDLE_OUTPUT_BASE
  || path.join(artifactRoot, `operational-status-bundle-${timestamp()}`);

const jsonOutputPath = path.resolve(`${baseOutput}.json`);
const markdownOutputPath = path.resolve(`${baseOutput}.md`);

const run = () => {
  const developmentProgress = readOptionalJson(developmentProgressPath);
  const pipelineStatus = readOptionalJson(pipelineStatusPath);
  const humanDecisionBrief = readOptionalJson(humanDecisionBriefPath);
  const reviewSessionPacket = readOptionalJson(reviewSessionPacketPath);
  const worktableSuggestion = readOptionalJson(worktableSuggestionPath);
  const bundle = buildOperationalStatusBundle({
    developmentProgress,
    pipelineStatus,
    humanDecisionBrief,
    markdownPath: markdownOutputPath,
    sourceArtifacts: {
      developmentProgress: developmentProgressPath,
      pipelineStatus: pipelineStatusPath,
      humanDecisionBrief: humanDecisionBriefPath,
      humanDecisionBriefMarkdown: humanDecisionBriefMarkdownPath,
      reviewSessionPacket: reviewSessionPacketPath,
      worktableSuggestion: worktableSuggestionPath
    },
    sourceArtifactPayloads: {
      reviewSessionPacket,
      worktableSuggestion
    }
  });

  if (bundle.markdown) writeText(markdownOutputPath, bundle.markdown);
  writeJson(jsonOutputPath, {
    ...bundle,
    markdown: undefined,
    markdownPath: bundle.markdown ? markdownOutputPath : null
  });

  console.log(JSON.stringify({
    outputPath: jsonOutputPath,
    markdownPath: bundle.markdown ? markdownOutputPath : null,
    status: bundle.status,
    statusLabelKo: bundle.statusLabelKo,
    serviceWritesPerformed: bundle.serviceWritesPerformed,
    softwareScaffoldPercent: bundle.summary.softwareScaffoldPercent ?? null,
    operationalProgressPercent: bundle.summary.operationalProgressPercent ?? null,
    hitlDecisionInputsMissing: bundle.summary.hitlDecisionInputsMissing ?? null,
    pendingRows: bundle.summary.pendingRows ?? null,
    highRiskRows: bundle.summary.highRiskRows ?? null,
    nextSessionCode: bundle.summary.nextSessionCode ?? null,
    nextDecisionId: bundle.summary.nextDecisionId ?? null,
    embeddedSnapshotCount: bundle.summary.embeddedSnapshotCount ?? 0,
    settingsImportButtons: bundle.settingsImportChecklist.map(item => item.buttonLabelKo),
    recommendedAction: bundle.recommendedAction
  }, null, 2));
};

try {
  run();
} catch (error) {
  const bundle = buildOperationalStatusBundle({
    sourceArtifacts: {
      developmentProgress: developmentProgressPath,
      pipelineStatus: pipelineStatusPath,
      humanDecisionBrief: humanDecisionBriefPath,
      humanDecisionBriefMarkdown: humanDecisionBriefMarkdownPath,
      reviewSessionPacket: reviewSessionPacketPath,
      worktableSuggestion: worktableSuggestionPath
    }
  });
  bundle.summary.error = error instanceof Error ? error.message : String(error);
  writeJson(jsonOutputPath, bundle);
  console.error(error);
  process.exitCode = 1;
}
