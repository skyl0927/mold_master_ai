const fs = require('node:fs');
const path = require('node:path');
const {
  createOperationalHitlEditableDecisionWorkspace
} = require('../operationalHitlEditableDecisionWorkspace');

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

const readFileText = filePath => {
  if (!filePath || !fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, 'utf8');
};

const writeFileText = (filePath, content) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
};

const inputReviewPacketPath = resolveOptionalPath(
  valueAfter('--input-review-packet'),
  process.env.OPERATIONAL_HITL_DECISION_INPUT_REVIEW_PACKET,
  latestArtifact('operational-hitl-decision-input-review-packet-')
);

const workspaceRoot = path.resolve(
  valueAfter('--workspace')
  || process.env.OPERATIONAL_HITL_EDITABLE_DECISION_WORKSPACE
  || path.join(artifactRoot, `operational-hitl-editable-decision-workspace-${timestamp()}`)
);

const run = () => {
  const manifest = createOperationalHitlEditableDecisionWorkspace({
    inputReviewPacket: readOptionalJson(inputReviewPacketPath),
    workspaceRoot,
    sourceArtifacts: {
      inputReviewPacket: inputReviewPacketPath
    },
    readFileText,
    writeFileText
  });

  console.log(JSON.stringify({
    outputPath: manifest.manifestPath,
    workspaceRoot: manifest.workspaceRoot,
    status: manifest.status,
    serviceWritesPerformed: manifest.serviceWritesPerformed,
    totalDecisionInputsMissing: manifest.summary.totalDecisionInputsMissing,
    workspaceFileCount: manifest.summary.workspaceFileCount,
    copiedSourceFileCount: manifest.summary.copiedSourceFileCount,
    missingSourceTemplateCount: manifest.summary.missingSourceTemplateCount,
    firstEditableQueueCode: manifest.summary.firstEditableQueueCode,
    editableFiles: manifest.editableFiles.map(item => item.editablePath),
    recommendedAction: manifest.recommendedAction
  }, null, 2));

  if (!['ready_for_human_edit', 'ready_for_verification'].includes(manifest.status)) {
    process.exitCode = 1;
  }
};

try {
  run();
} catch (error) {
  const manifest = createOperationalHitlEditableDecisionWorkspace({
    workspaceRoot,
    sourceArtifacts: {
      inputReviewPacket: inputReviewPacketPath
    }
  });
  writeFileText(path.join(workspaceRoot, 'manifest-error.json'), JSON.stringify({
    ...manifest,
    error: error instanceof Error ? error.message : String(error)
  }, null, 2) + '\n');
  console.error(error);
  process.exitCode = 1;
}
