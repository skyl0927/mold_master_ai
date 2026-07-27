const fs = require('node:fs');
const path = require('node:path');
const {
  buildVisionApprovedLabelConflictReviewPacket
} = require('../visionApprovedLabelConflictReviewPacket');

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
  process.env.VISION_OPERATIONAL_READINESS_AUDIT,
  latestArtifact('vision-operational-readiness-audit-'),
  path.join(artifactRoot, 'vision-operational-readiness-audit.json')
);

const postHitlPath = resolveOptionalPath(
  valueAfter('--post-hitl'),
  process.env.POST_HITL_VERIFICATION_REPORT,
  path.join(artifactRoot, 'post-hitl-verification-report.json')
);

const outputPath = path.resolve(
  valueAfter('--output')
  || process.env.VISION_APPROVED_LABEL_CONFLICT_PACKET_OUTPUT
  || path.join(artifactRoot, `vision-approved-label-conflict-review-packet-${timestamp()}.json`)
);

const run = () => {
  const packet = buildVisionApprovedLabelConflictReviewPacket({
    readinessAudit: readOptionalJson(readinessPath),
    postHitlVerificationReport: readOptionalJson(postHitlPath),
    sourceArtifacts: {
      readinessAudit: readinessPath,
      postHitlVerificationReport: postHitlPath
    }
  });

  writeJson(outputPath, packet);
  console.log(JSON.stringify({
    outputPath,
    status: packet.status,
    totalConflicts: packet.totalConflicts,
    serviceWritesPerformed: packet.serviceWritesPerformed,
    firstConflict: packet.conflicts[0]?.conflictId || null,
    firstLabels: packet.conflicts[0]?.candidateLabels || [],
    recommendedAction: packet.recommendedAction
  }, null, 2));
};

try {
  run();
} catch (error) {
  const packet = buildVisionApprovedLabelConflictReviewPacket({
    readinessAudit: null,
    postHitlVerificationReport: null,
    sourceArtifacts: {
      readinessAudit: readinessPath,
      postHitlVerificationReport: postHitlPath
    }
  });
  packet.status = 'action_required';
  packet.error = error instanceof Error ? error.message : String(error);
  writeJson(outputPath, packet);
  console.error(error);
  process.exitCode = 1;
}
