const fs = require('node:fs');
const path = require('node:path');
const {
  buildOperationalHitlDecisionWorktableSuggestion
} = require('../operationalHitlDecisionWorktableSuggestion');

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

const worktableExportPath = resolveOptionalPath(
  valueAfter('--worktable-export'),
  process.env.OPERATIONAL_HITL_DECISION_WORKTABLE_EXPORT,
  latestArtifact('operational-hitl-decision-worktable-export-')
);

const baseOutput = valueAfter('--output-base')
  || process.env.OPERATIONAL_HITL_WORKTABLE_SUGGESTION_OUTPUT_BASE
  || path.join(artifactRoot, `operational-hitl-decision-worktable-suggestion-${timestamp()}`);

const jsonOutputPath = path.resolve(`${baseOutput}.json`);
const csvOutputPath = path.resolve(`${baseOutput}.csv`);
const markdownOutputPath = path.resolve(`${baseOutput}.md`);

const run = () => {
  const report = buildOperationalHitlDecisionWorktableSuggestion({
    worktableExport: readOptionalJson(worktableExportPath),
    sourceArtifacts: {
      worktableExport: worktableExportPath
    }
  });

  if (report.csv) writeText(csvOutputPath, report.csv);
  if (report.markdown) writeText(markdownOutputPath, report.markdown);
  writeJson(jsonOutputPath, {
    ...report,
    csv: undefined,
    markdown: undefined,
    csvPath: report.csv ? csvOutputPath : null,
    markdownPath: report.markdown ? markdownOutputPath : null
  });

  console.log(JSON.stringify({
    outputPath: jsonOutputPath,
    csvPath: report.csv ? csvOutputPath : null,
    markdownPath: report.markdown ? markdownOutputPath : null,
    status: report.status,
    serviceWritesPerformed: report.serviceWritesPerformed,
    totalRows: report.summary.totalRows,
    pendingRows: report.summary.pendingRows,
    suggestionRows: report.summary.suggestionRows,
    recaptureSuggestions: report.summary.recaptureSuggestions,
    approveCandidateSuggestions: report.summary.approveCandidateSuggestions,
    approveCardSuggestions: report.summary.approveCardSuggestions,
    needsReviewSuggestions: report.summary.needsReviewSuggestions,
    needsChangesSuggestions: report.summary.needsChangesSuggestions,
    recommendedAction: report.recommendedAction
  }, null, 2));
};

try {
  run();
} catch (error) {
  const report = buildOperationalHitlDecisionWorktableSuggestion({
    sourceArtifacts: {
      worktableExport: worktableExportPath
    }
  });
  report.summary.error = error instanceof Error ? error.message : String(error);
  writeJson(jsonOutputPath, report);
  console.error(error);
  process.exitCode = 1;
}
