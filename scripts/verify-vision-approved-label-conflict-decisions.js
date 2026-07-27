const fs = require('node:fs');
const path = require('node:path');
const {
  buildVisionApprovedLabelConflictDecisionVerificationReport
} = require('../visionApprovedLabelConflictDecisionVerification');

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

const decisionPacketPath = resolveOptionalPath(
  valueAfter('--decisions'),
  process.env.VISION_APPROVED_LABEL_CONFLICT_DECISION_PACKET
);

const outputPath = path.resolve(
  valueAfter('--output')
  || process.env.VISION_APPROVED_LABEL_CONFLICT_DECISION_REPORT_OUTPUT
  || path.join(artifactRoot, `vision-approved-label-conflict-decision-verification-report-${timestamp()}.json`)
);

const run = () => {
  const report = buildVisionApprovedLabelConflictDecisionVerificationReport({
    conflictPacket: readOptionalJson(conflictPacketPath),
    decisionPacket: readOptionalJson(decisionPacketPath),
    sourceArtifacts: {
      conflictPacket: conflictPacketPath,
      decisionPacket: decisionPacketPath
    }
  });

  writeJson(outputPath, report);
  console.log(JSON.stringify({
    outputPath,
    status: report.status,
    conflicts: report.summary.conflicts,
    decisionsReceived: report.summary.decisionsReceived,
    acceptedDecisions: report.summary.acceptedDecisions,
    invalidDecisions: report.summary.invalidDecisions,
    pendingConflicts: report.summary.pendingConflicts,
    resolvedLabelConflicts: report.summary.resolvedLabelConflicts,
    recaptureRequests: report.summary.recaptureRequests,
    serviceWritesPerformed: report.serviceWritesPerformed,
    recommendedAction: report.recommendedAction
  }, null, 2));
};

try {
  run();
} catch (error) {
  const report = buildVisionApprovedLabelConflictDecisionVerificationReport({
    conflictPacket: null,
    decisionPacket: null,
    sourceArtifacts: {
      conflictPacket: conflictPacketPath,
      decisionPacket: decisionPacketPath
    }
  });
  report.status = 'missing_conflict_packet';
  report.error = error instanceof Error ? error.message : String(error);
  writeJson(outputPath, report);
  console.error(error);
  process.exitCode = 1;
}
