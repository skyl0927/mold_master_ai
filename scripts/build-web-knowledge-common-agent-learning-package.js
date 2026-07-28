const fs = require('node:fs');
const path = require('node:path');

const {
  buildWebKnowledgeCommonAgentLearningPackage
} = require('../webKnowledgeCommonAgentLearningPackage');

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

const readinessPath = resolveOptionalPath(
  valueAfter('--readiness'),
  process.env.WEB_KNOWLEDGE_OPERATIONAL_READINESS,
  latestArtifact('web-knowledge-operational-readiness-')
);

const verificationPath = resolveOptionalPath(
  valueAfter('--verification-report'),
  process.env.WEB_KNOWLEDGE_HITL_VERIFICATION_REPORT,
  latestArtifact('web-knowledge-hitl-decision-verification-report-')
);

const outputPath = path.resolve(
  valueAfter('--output')
  || process.env.WEB_KNOWLEDGE_COMMON_AGENT_LEARNING_PACKAGE_OUTPUT
  || path.join(artifactRoot, `web-knowledge-common-agent-learning-package-${timestamp()}.json`)
);

const buildPacket = () => buildWebKnowledgeCommonAgentLearningPackage({
  readiness: readOptionalJson(readinessPath),
  verificationReport: readOptionalJson(verificationPath),
  sourceArtifacts: {
    readiness: readinessPath,
    verificationReport: verificationPath
  }
});

try {
  const packet = buildPacket();
  writeJson(outputPath, packet);
  console.log(JSON.stringify({
    outputPath,
    status: packet.status,
    manualImportAllowed: packet.manualImportAllowed,
    readyForGraphRoundtripValidation: packet.readyForGraphRoundtripValidation,
    approvedSourceRows: packet.summary.approvedSourceRows,
    nonApprovedRows: packet.summary.nonApprovedRows,
    packagedKnowledgeItems: packet.summary.packagedKnowledgeItems,
    graphRoundtripCases: packet.summary.graphRoundtripCases,
    serviceWritesPerformed: packet.serviceWritesPerformed,
    recommendedAction: packet.recommendedAction
  }, null, 2));
} catch (error) {
  const packet = buildWebKnowledgeCommonAgentLearningPackage({
    sourceArtifacts: {
      readiness: readinessPath,
      verificationReport: verificationPath
    }
  });
  packet.summary.error = error instanceof Error ? error.message : String(error);
  writeJson(outputPath, packet);
  console.error(error);
  process.exitCode = 1;
}
