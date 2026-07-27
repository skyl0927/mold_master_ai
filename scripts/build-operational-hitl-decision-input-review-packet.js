const fs = require('node:fs');
const path = require('node:path');
const {
  buildOperationalHitlDecisionInputReviewPacket
} = require('../operationalHitlDecisionInputReviewPacket');

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

const writeJson = (filePath, payload) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
};

const labelConflictPath = resolveOptionalPath(
  valueAfter('--label-conflict'),
  process.env.OPERATIONAL_HITL_LABEL_CONFLICT_DECISION_TEMPLATE,
  latestArtifact('vision-approved-label-conflict-decisions-template-')
);

const visionPendingHitlPath = resolveOptionalPath(
  valueAfter('--vision-hitl'),
  process.env.OPERATIONAL_HITL_VISION_PENDING_DECISION_TEMPLATE,
  latestArtifact('common-agent-hitl-review-decisions-template-')
);

const webKnowledgeHitlPath = resolveOptionalPath(
  valueAfter('--web-knowledge-hitl'),
  process.env.OPERATIONAL_HITL_WEB_KNOWLEDGE_DECISION_TEMPLATE,
  latestArtifact('common-agent-web-knowledge-hitl-decisions-template-')
);

const outputPath = path.resolve(
  valueAfter('--output')
  || process.env.OPERATIONAL_HITL_DECISION_INPUT_REVIEW_PACKET_OUTPUT
  || path.join(artifactRoot, `operational-hitl-decision-input-review-packet-${timestamp()}.json`)
);

const run = () => {
  const packet = buildOperationalHitlDecisionInputReviewPacket({
    decisionTemplates: {
      labelConflict: readOptionalJson(labelConflictPath),
      visionPendingHitl: readOptionalJson(visionPendingHitlPath),
      webKnowledgeHitl: readOptionalJson(webKnowledgeHitlPath)
    },
    sourceArtifacts: {
      labelConflict: labelConflictPath,
      visionPendingHitl: visionPendingHitlPath,
      webKnowledgeHitl: webKnowledgeHitlPath
    }
  });

  writeJson(outputPath, packet);
  console.log(JSON.stringify({
    outputPath,
    status: packet.status,
    serviceWritesPerformed: packet.serviceWritesPerformed,
    totalTemplateItems: packet.summary.totalTemplateItems,
    totalPendingActions: packet.summary.totalPendingActions,
    targetDecisionInputsMissing: packet.summary.targetDecisionInputsMissing,
    firstQueueCode: packet.summary.firstQueueCode,
    humanGatedCommands: packet.humanGatedCommands,
    recommendedAction: packet.recommendedAction
  }, null, 2));

  if (packet.status === 'missing_evidence') process.exitCode = 1;
};

try {
  run();
} catch (error) {
  const packet = buildOperationalHitlDecisionInputReviewPacket({
    sourceArtifacts: {
      labelConflict: labelConflictPath,
      visionPendingHitl: visionPendingHitlPath,
      webKnowledgeHitl: webKnowledgeHitlPath
    }
  });
  packet.error = error instanceof Error ? error.message : String(error);
  writeJson(outputPath, packet);
  console.error(error);
  process.exitCode = 1;
}
