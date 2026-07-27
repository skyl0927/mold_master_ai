const fs = require('node:fs');
const path = require('node:path');
const {
  buildOperationalHitlDecisionIntakeStatus
} = require('../operationalHitlDecisionIntakeStatus');

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

const categoryForName = name => {
  if (/vision-approved-label-conflict-decision/i.test(name)) return 'vision_label_conflicts';
  if (/vision-pending-hitl-decision/i.test(name)) return 'vision_pending_hitl';
  if (/web-knowledge-hitl-decision/i.test(name)) return 'web_knowledge_hitl';
  return 'unknown';
};

const summarizeDecisionArtifact = filePath => {
  const payload = readOptionalJson(filePath) || {};
  const name = path.basename(filePath);
  return {
    name,
    path: filePath,
    category: categoryForName(name),
    contractVersion: payload.contractVersion || null,
    status: payload.status || null,
    acceptedDecisions: payload.acceptedDecisions,
    invalidDecisions: payload.invalidDecisions,
    pendingConflicts: payload.pendingConflicts,
    pendingQueueItems: payload.pendingQueueItems,
    pendingCards: payload.pendingCards,
    plannedUpdates: payload.plannedUpdates,
    appliedUpdates: payload.appliedUpdates
      ?? payload.appliedCaseUpdates
      ?? payload.appliedCardUpdates
  };
};

const collectDecisionArtifacts = () => {
  if (!fs.existsSync(artifactRoot)) return [];
  const patterns = [
    'vision-approved-label-conflict-decision',
    'vision-pending-hitl-decision',
    'web-knowledge-hitl-decision'
  ];
  return fs.readdirSync(artifactRoot)
    .filter(name =>
      name.endsWith('.json')
      && patterns.some(prefix => name.startsWith(prefix))
    )
    .map(name => path.join(artifactRoot, name))
    .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs)
    .slice(0, 30)
    .map(summarizeDecisionArtifact);
};

const readinessPath = resolveOptionalPath(
  valueAfter('--readiness'),
  process.env.VISION_OPERATIONAL_READINESS_AUDIT,
  latestArtifact('vision-operational-readiness-audit-'),
  path.join(artifactRoot, 'vision-operational-readiness-audit.json')
);

const webKnowledgeReadinessPath = resolveOptionalPath(
  valueAfter('--web-knowledge-readiness'),
  process.env.WEB_KNOWLEDGE_OPERATIONAL_READINESS,
  latestArtifact('web-knowledge-operational-readiness-'),
  path.join(artifactRoot, 'web-knowledge-operational-readiness.json')
);

const outputPath = path.resolve(
  valueAfter('--output')
  || process.env.OPERATIONAL_HITL_DECISION_INTAKE_STATUS_OUTPUT
  || path.join(artifactRoot, `operational-hitl-decision-intake-status-${timestamp()}.json`)
);

const run = () => {
  const decisionArtifacts = collectDecisionArtifacts();
  const report = buildOperationalHitlDecisionIntakeStatus({
    readinessAudit: readOptionalJson(readinessPath),
    webKnowledgeReadiness: readOptionalJson(webKnowledgeReadinessPath),
    decisionArtifacts
  });
  const artifact = {
    ...report,
    observedDecisionArtifacts: decisionArtifacts,
    sources: {
      readinessAudit: readinessPath,
      webKnowledgeReadiness: webKnowledgeReadinessPath
    }
  };

  writeJson(outputPath, artifact);
  console.log(JSON.stringify({
    outputPath,
    status: artifact.status,
    serviceWritesPerformed: artifact.serviceWritesPerformed,
    totalDecisionInputsMissing: artifact.summary.totalDecisionInputsMissing,
    firstQueueCode: artifact.summary.firstQueueCode,
    labelConflictPending: artifact.summary.labelConflictPending,
    visionHitlPending: artifact.summary.visionHitlPending,
    webHitlMissing: artifact.summary.webHitlMissing,
    staleDecisionEvidenceCount: artifact.summary.staleDecisionEvidenceCount,
    recommendedAction: artifact.recommendedAction
  }, null, 2));

  if (artifact.status !== 'clear') process.exitCode = 1;
};

try {
  run();
} catch (error) {
  const artifact = buildOperationalHitlDecisionIntakeStatus({});
  artifact.error = error instanceof Error ? error.message : String(error);
  artifact.sources = {
    readinessAudit: readinessPath,
    webKnowledgeReadiness: webKnowledgeReadinessPath
  };
  writeJson(outputPath, artifact);
  console.error(error);
  process.exitCode = 1;
}
