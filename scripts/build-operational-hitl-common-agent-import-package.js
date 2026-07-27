const fs = require('node:fs');
const path = require('node:path');
const {
  buildOperationalHitlCommonAgentImportPackage
} = require('../operationalHitlCommonAgentImportPackage');

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

const labelConflictPath = resolveOptionalPath(
  valueAfter('--label-conflict-verification'),
  process.env.OPERATIONAL_HITL_LABEL_CONFLICT_VERIFICATION,
  latestArtifact('vision-approved-label-conflict-decision-verification-report-')
);

const visionHitlPath = resolveOptionalPath(
  valueAfter('--vision-hitl-verification'),
  process.env.OPERATIONAL_HITL_VISION_VERIFICATION,
  latestArtifact('vision-pending-hitl-decision-verification-report-')
);

const webKnowledgePath = resolveOptionalPath(
  valueAfter('--web-knowledge-verification'),
  process.env.OPERATIONAL_HITL_WEB_KNOWLEDGE_VERIFICATION,
  latestArtifact('web-knowledge-hitl-decision-verification-report-')
);

const outputPath = path.resolve(
  valueAfter('--output')
  || process.env.OPERATIONAL_HITL_COMMON_AGENT_IMPORT_PACKAGE_OUTPUT
  || path.join(artifactRoot, `operational-hitl-common-agent-import-package-${timestamp()}.json`)
);

const run = () => {
  const packet = buildOperationalHitlCommonAgentImportPackage({
    labelConflictVerification: readOptionalJson(labelConflictPath),
    visionHitlVerification: readOptionalJson(visionHitlPath),
    webKnowledgeVerification: readOptionalJson(webKnowledgePath),
    sourceArtifacts: {
      labelConflictVerification: labelConflictPath,
      visionHitlVerification: visionHitlPath,
      webKnowledgeVerification: webKnowledgePath
    }
  });

  writeJson(outputPath, packet);
  console.log(JSON.stringify({
    outputPath,
    status: packet.status,
    manualImportAllowed: packet.manualImportAllowed,
    serviceWritesPerformed: packet.serviceWritesPerformed,
    sourceReportsReady: packet.summary.sourceReportsReady,
    blockingReports: packet.summary.blockingReports,
    labelConflictResolutions: packet.summary.labelConflictResolutions,
    visionApprovalCandidates: packet.summary.visionApprovalCandidates,
    webKnowledgeLedgerUpdates: packet.summary.webKnowledgeLedgerUpdates,
    graphKnowledgeCandidates: packet.summary.graphKnowledgeCandidates,
    recommendedAction: packet.recommendedAction
  }, null, 2));
};

try {
  run();
} catch (error) {
  const packet = buildOperationalHitlCommonAgentImportPackage({
    sourceArtifacts: {
      labelConflictVerification: labelConflictPath,
      visionHitlVerification: visionHitlPath,
      webKnowledgeVerification: webKnowledgePath
    }
  });
  packet.summary.error = error instanceof Error ? error.message : String(error);
  writeJson(outputPath, packet);
  console.error(error);
  process.exitCode = 1;
}
