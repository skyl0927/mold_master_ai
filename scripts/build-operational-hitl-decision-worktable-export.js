const fs = require('node:fs');
const path = require('node:path');
const {
  buildOperationalHitlDecisionWorktableExport
} = require('../operationalHitlDecisionWorktableExport');

const root = path.resolve(__dirname, '..');
const artifactRoot = path.join(root, 'artifacts');
const args = process.argv.slice(2);

const valueAfter = flag => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};

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

const baseOutput = valueAfter('--output-base')
  || process.env.OPERATIONAL_HITL_DECISION_WORKTABLE_OUTPUT_BASE
  || path.join(artifactRoot, `operational-hitl-decision-worktable-export-${timestamp()}`);

const csvOutputPath = path.resolve(`${baseOutput}.csv`);
const markdownOutputPath = path.resolve(`${baseOutput}.md`);
const manifestOutputPath = path.resolve(`${baseOutput}.json`);

const run = () => {
  const exportPacket = buildOperationalHitlDecisionWorktableExport({
    workspaceManifest: readOptionalJson(workspaceManifestPath),
    sourceArtifacts: {
      workspaceManifest: workspaceManifestPath
    },
    readFileText
  });

  if (exportPacket.csv) writeText(csvOutputPath, exportPacket.csv);
  if (exportPacket.markdown) writeText(markdownOutputPath, exportPacket.markdown);
  writeJson(manifestOutputPath, {
    ...exportPacket,
    csv: undefined,
    markdown: undefined,
    csvPath: exportPacket.csv ? csvOutputPath : null,
    markdownPath: exportPacket.markdown ? markdownOutputPath : null
  });

  console.log(JSON.stringify({
    outputPath: manifestOutputPath,
    csvPath: exportPacket.csv ? csvOutputPath : null,
    markdownPath: exportPacket.markdown ? markdownOutputPath : null,
    status: exportPacket.status,
    serviceWritesPerformed: exportPacket.serviceWritesPerformed,
    workspaceFileCount: exportPacket.summary.workspaceFileCount,
    decisionRowCount: exportPacket.summary.decisionRowCount,
    pendingRowCount: exportPacket.summary.pendingRowCount,
    actionableRowCount: exportPacket.summary.actionableRowCount,
    queueCount: exportPacket.summary.queueCount,
    recommendedAction: exportPacket.recommendedAction
  }, null, 2));

  if (exportPacket.status === 'missing_evidence' || exportPacket.status.startsWith('blocked_')) {
    process.exitCode = 1;
  }
};

try {
  run();
} catch (error) {
  const exportPacket = buildOperationalHitlDecisionWorktableExport({
    sourceArtifacts: {
      workspaceManifest: workspaceManifestPath
    }
  });
  exportPacket.error = error instanceof Error ? error.message : String(error);
  writeJson(manifestOutputPath, exportPacket);
  console.error(error);
  process.exitCode = 1;
}
