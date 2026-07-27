const fs = require('node:fs');
const path = require('node:path');
const {
  buildOperationalHitlSimulatedPreflight
} = require('../operationalHitlSimulatedPreflight');

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

const latestWorkspaceManifest = () => {
  if (!fs.existsSync(artifactRoot)) return null;
  return fs.readdirSync(artifactRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && entry.name.startsWith('operational-hitl-editable-decision-workspace-'))
    .map(entry => path.join(artifactRoot, entry.name, 'manifest.json'))
    .filter(filePath => fs.existsSync(filePath))
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

const readFileText = filePath => {
  if (!filePath || !fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, 'utf8');
};

const writeText = (filePath, payload) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, payload, 'utf8');
};

const writeJson = (filePath, payload) => {
  writeText(filePath, `${JSON.stringify(payload, null, 2)}\n`);
};

const workspaceManifestPath = resolveOptionalPath(
  valueAfter('--workspace-manifest'),
  process.env.OPERATIONAL_HITL_EDITABLE_DECISION_WORKSPACE_MANIFEST,
  latestWorkspaceManifest()
);

const worktableExportPath = resolveOptionalPath(
  valueAfter('--worktable-export'),
  process.env.OPERATIONAL_HITL_DECISION_WORKTABLE_EXPORT,
  latestArtifact('operational-hitl-decision-worktable-export-')
);

const worktableSuggestionPath = resolveOptionalPath(
  valueAfter('--worktable-suggestion'),
  process.env.OPERATIONAL_HITL_DECISION_WORKTABLE_SUGGESTION,
  latestArtifact('operational-hitl-decision-worktable-suggestion-')
);

const baseOutput = valueAfter('--output-base')
  || process.env.OPERATIONAL_HITL_SIMULATED_PREFLIGHT_OUTPUT_BASE
  || path.join(artifactRoot, `operational-hitl-simulated-preflight-${timestamp()}`);

const jsonOutputPath = path.resolve(`${baseOutput}.json`);
const markdownOutputPath = path.resolve(`${baseOutput}.md`);

const run = () => {
  const report = buildOperationalHitlSimulatedPreflight({
    workspaceManifest: readOptionalJson(workspaceManifestPath),
    worktableExport: readOptionalJson(worktableExportPath),
    worktableSuggestion: readOptionalJson(worktableSuggestionPath),
    sourceArtifacts: {
      workspaceManifest: workspaceManifestPath,
      worktableExport: worktableExportPath,
      worktableSuggestion: worktableSuggestionPath
    },
    readFileText
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
    localEditableWritesPerformed: report.localEditableWritesPerformed,
    totalRows: report.summary.totalRows,
    importPlannedUpdates: report.summary.importPlannedUpdates,
    roundtripInvalidRows: report.summary.roundtripInvalidRows,
    simulatedFilesUpdated: report.summary.simulatedFilesUpdated,
    preflightPendingDecisions: report.summary.preflightPendingDecisions,
    preflightMissingRequiredFields: report.summary.preflightMissingRequiredFields,
    readyForVerificationFileCount: report.summary.readyForVerificationFileCount,
    verificationCommandCount: report.summary.verificationCommandCount,
    recommendedAction: report.recommendedAction
  }, null, 2));

  if (report.status !== 'simulated_preflight_ready' && report.status !== 'clear') {
    process.exitCode = 1;
  }
};

try {
  run();
} catch (error) {
  const report = buildOperationalHitlSimulatedPreflight({
    sourceArtifacts: {
      workspaceManifest: workspaceManifestPath,
      worktableExport: worktableExportPath,
      worktableSuggestion: worktableSuggestionPath
    }
  });
  report.summary.error = error instanceof Error ? error.message : String(error);
  writeJson(jsonOutputPath, report);
  console.error(error);
  process.exitCode = 1;
}
