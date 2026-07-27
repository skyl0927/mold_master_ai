const fs = require('node:fs');
const path = require('node:path');
const {
  buildOperationalHitlDecisionWorktableImport
} = require('../operationalHitlDecisionWorktableImport');

const root = path.resolve(__dirname, '..');
const artifactRoot = path.join(root, 'artifacts');
const args = process.argv.slice(2);

const valueAfter = flag => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};

const hasFlag = flag => args.includes(flag);

const timestamp = () => new Date().toISOString().replace(/[:.]/g, '-');

const latestWorkspaceManifest = () => {
  if (!fs.existsSync(artifactRoot)) return null;
  return fs.readdirSync(artifactRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && entry.name.startsWith('operational-hitl-editable-decision-workspace-'))
    .map(entry => path.join(artifactRoot, entry.name, 'manifest.json'))
    .filter(filePath => fs.existsSync(filePath))
    .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs)
    .at(0) || null;
};

const latestCsv = () => {
  if (!fs.existsSync(artifactRoot)) return null;
  return fs.readdirSync(artifactRoot)
    .filter(name => name.startsWith('operational-hitl-decision-worktable-export-') && name.endsWith('.csv'))
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

const worktableCsvPath = resolveOptionalPath(
  valueAfter('--csv'),
  process.env.OPERATIONAL_HITL_DECISION_WORKTABLE_CSV,
  latestCsv()
);

const outputPath = path.resolve(
  valueAfter('--output')
  || process.env.OPERATIONAL_HITL_DECISION_WORKTABLE_IMPORT_OUTPUT
  || path.join(artifactRoot, `operational-hitl-decision-worktable-import-${timestamp()}.json`)
);

const run = () => {
  const report = buildOperationalHitlDecisionWorktableImport({
    workspaceManifest: readOptionalJson(workspaceManifestPath),
    worktableCsv: readFileText(worktableCsvPath),
    apply: hasFlag('--apply'),
    sourceArtifacts: {
      workspaceManifest: workspaceManifestPath,
      worktableCsv: worktableCsvPath
    },
    readFileText,
    writeFileText: writeText
  });

  writeJson(outputPath, report);
  console.log(JSON.stringify({
    outputPath,
    status: report.status,
    applyRequested: report.applyRequested,
    serviceWritesPerformed: report.serviceWritesPerformed,
    localEditableWritesPerformed: report.localEditableWritesPerformed,
    totalRows: report.summary.totalRows,
    plannedUpdates: report.summary.plannedUpdates,
    appliedUpdates: report.summary.appliedUpdates,
    invalidRows: report.summary.invalidRows,
    missingRequiredFieldRows: report.summary.missingRequiredFieldRows,
    filesToUpdate: report.summary.filesToUpdate,
    recommendedAction: report.recommendedAction
  }, null, 2));

  if (report.status === 'missing_evidence' || report.status === 'invalid_worktable') {
    process.exitCode = 1;
  }
};

try {
  run();
} catch (error) {
  const report = buildOperationalHitlDecisionWorktableImport({
    sourceArtifacts: {
      workspaceManifest: workspaceManifestPath,
      worktableCsv: worktableCsvPath
    }
  });
  report.summary.error = error instanceof Error ? error.message : String(error);
  writeJson(outputPath, report);
  console.error(error);
  process.exitCode = 1;
}
