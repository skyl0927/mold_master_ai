const fs = require('node:fs');
const path = require('node:path');
const {
  buildOperationalHitlEditableDecisionPreflight
} = require('../operationalHitlEditableDecisionPreflight');

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
  const matches = fs.readdirSync(artifactRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && entry.name.startsWith('operational-hitl-editable-decision-workspace-'))
    .map(entry => path.join(artifactRoot, entry.name, 'manifest.json'))
    .filter(filePath => fs.existsSync(filePath))
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

const readFileText = filePath => {
  if (!filePath || !fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, 'utf8');
};

const writeJson = (filePath, payload) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
};

const workspaceManifestPath = resolveOptionalPath(
  valueAfter('--workspace-manifest'),
  process.env.OPERATIONAL_HITL_EDITABLE_DECISION_WORKSPACE_MANIFEST,
  latestWorkspaceManifest()
);

const outputPath = path.resolve(
  valueAfter('--output')
  || process.env.OPERATIONAL_HITL_EDITABLE_DECISION_PREFLIGHT_OUTPUT
  || path.join(artifactRoot, `operational-hitl-editable-decision-preflight-${timestamp()}.json`)
);

const run = () => {
  const report = buildOperationalHitlEditableDecisionPreflight({
    workspaceManifest: readOptionalJson(workspaceManifestPath),
    sourceArtifacts: {
      workspaceManifest: workspaceManifestPath
    },
    readFileText
  });

  writeJson(outputPath, report);
  console.log(JSON.stringify({
    outputPath,
    status: report.status,
    serviceWritesPerformed: report.serviceWritesPerformed,
    workspaceFileCount: report.summary.workspaceFileCount,
    totalDecisionItems: report.summary.totalDecisionItems,
    pendingDecisionCount: report.summary.pendingDecisionCount,
    invalidActionCount: report.summary.invalidActionCount,
    missingRequiredFieldCount: report.summary.missingRequiredFieldCount,
    readyForVerificationFileCount: report.summary.readyForVerificationFileCount,
    firstBlockedQueueCode: report.summary.firstBlockedQueueCode,
    verificationCommandsReady: report.verificationCommandsReady,
    recommendedAction: report.recommendedAction
  }, null, 2));

  if (report.status === 'missing_evidence' || report.status === 'invalid_workspace') {
    process.exitCode = 1;
  }
};

try {
  run();
} catch (error) {
  const report = buildOperationalHitlEditableDecisionPreflight({
    sourceArtifacts: {
      workspaceManifest: workspaceManifestPath
    }
  });
  report.error = error instanceof Error ? error.message : String(error);
  writeJson(outputPath, report);
  console.error(error);
  process.exitCode = 1;
}
