const fs = require('node:fs');
const path = require('node:path');
const {
  buildVisionApprovedLabelConflictDecisionTemplate
} = require('../visionApprovedLabelConflictDecisionTemplate');

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

const conflictPacketPath = resolveOptionalPath(
  valueAfter('--conflict-packet'),
  process.env.VISION_APPROVED_LABEL_CONFLICT_PACKET,
  latestArtifact('vision-approved-label-conflict-review-packet-'),
  path.join(artifactRoot, 'vision-approved-label-conflict-review-packet.json')
);

const outputPath = path.resolve(
  valueAfter('--output')
  || process.env.VISION_APPROVED_LABEL_CONFLICT_DECISION_TEMPLATE_OUTPUT
  || path.join(artifactRoot, `vision-approved-label-conflict-decisions-template-${timestamp()}.json`)
);

const run = () => {
  const template = buildVisionApprovedLabelConflictDecisionTemplate({
    conflictPacket: readOptionalJson(conflictPacketPath),
    sourceArtifacts: {
      conflictPacket: conflictPacketPath
    }
  });

  writeJson(outputPath, template);
  console.log(JSON.stringify({
    outputPath,
    status: template.status,
    conflicts: template.summary.conflicts,
    decisionsPrepared: template.summary.decisionsPrepared,
    serviceWritesPerformed: template.serviceWritesPerformed,
    verificationCommand: template.verification.command,
    recommendedAction: template.recommendedAction
  }, null, 2));
};

try {
  run();
} catch (error) {
  const template = buildVisionApprovedLabelConflictDecisionTemplate({
    conflictPacket: null,
    sourceArtifacts: {
      conflictPacket: conflictPacketPath
    }
  });
  template.status = 'missing_conflict_packet';
  template.error = error instanceof Error ? error.message : String(error);
  writeJson(outputPath, template);
  console.error(error);
  process.exitCode = 1;
}
