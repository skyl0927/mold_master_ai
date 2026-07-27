const fs = require('node:fs');
const path = require('node:path');
const {
  buildVisionPendingHitlDecisionVerificationReport
} = require('../visionPendingHitlDecisionVerification');

const root = path.resolve(__dirname, '..');
const artifactRoot = path.join(root, 'artifacts');
const args = process.argv.slice(2);

const valueAfter = flag => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};

const timestamp = () => new Date().toISOString().replace(/[:.]/g, '-');

const readOptionalJson = filePath => {
  if (!filePath || !fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
};

const writeJson = (filePath, payload) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
};

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

const queuePacketPath = resolveOptionalPath(
  valueAfter('--queue-packet'),
  process.env.VISION_PENDING_HITL_REVIEW_QUEUE_PACKET,
  latestArtifact('vision-pending-hitl-review-queue-packet-'),
  path.join(root, '.tmp-tests', 'vision-pending-hitl-review-queue-packet.json')
);

const decisionPacketPath = resolveOptionalPath(
  valueAfter('--decisions'),
  process.env.VISION_PENDING_HITL_DECISION_PACKET
);

const outputPath = path.resolve(
  valueAfter('--output')
  || process.env.VISION_PENDING_HITL_DECISION_REPORT_OUTPUT
  || path.join(artifactRoot, `vision-pending-hitl-decision-verification-report-${timestamp()}.json`)
);

const run = () => {
  const report = buildVisionPendingHitlDecisionVerificationReport({
    queuePacket: readOptionalJson(queuePacketPath),
    decisionPacket: readOptionalJson(decisionPacketPath),
    sourceArtifacts: {
      queuePacket: queuePacketPath,
      decisionPacket: decisionPacketPath
    }
  });

  writeJson(outputPath, report);
  console.log(JSON.stringify({
    outputPath,
    status: report.status,
    queueItems: report.summary.queueItems,
    decisionsReceived: report.summary.decisionsReceived,
    acceptedDecisions: report.summary.acceptedDecisions,
    invalidDecisions: report.summary.invalidDecisions,
    pendingQueueItems: report.summary.pendingQueueItems,
    approvalCandidates: report.summary.approvalCandidates,
    recaptureRequests: report.summary.recaptureRequests,
    serviceWritesPerformed: report.serviceWritesPerformed,
    recommendedAction: report.recommendedAction
  }, null, 2));
};

try {
  run();
} catch (error) {
  const report = buildVisionPendingHitlDecisionVerificationReport({
    queuePacket: null,
    decisionPacket: null,
    sourceArtifacts: {
      queuePacket: queuePacketPath,
      decisionPacket: decisionPacketPath
    }
  });
  report.status = 'missing_queue_packet';
  report.error = error instanceof Error ? error.message : String(error);
  writeJson(outputPath, report);
  console.error(error);
  process.exitCode = 1;
}
