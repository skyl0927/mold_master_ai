const fs = require('node:fs');
const path = require('node:path');
const {
  buildVisionPendingHitlAuthorizationBridge
} = require('../visionPendingHitlAuthorizationBridge');

const root = path.resolve(__dirname, '..');
const artifactRoot = path.join(root, 'artifacts');
const args = process.argv.slice(2);

const valueAfter = flag => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};

const timestamp = () => new Date().toISOString().replace(/[:.]/g, '-');

const readJson = filePath => JSON.parse(
  fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '')
);

const writeJson = (filePath, payload) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
};

const latestArtifact = prefix => {
  if (!fs.existsSync(artifactRoot)) return null;
  return fs.readdirSync(artifactRoot)
    .filter(name => name.startsWith(prefix) && name.endsWith('.json'))
    .map(name => path.join(artifactRoot, name))
    .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs)
    .at(0) || null;
};

const latestReviewPacket = () => {
  if (!fs.existsSync(artifactRoot)) return null;
  return fs.readdirSync(artifactRoot, { withFileTypes: true })
    .filter(entry =>
      entry.isDirectory()
      && entry.name.startsWith('vision-human-review-packet-')
      && fs.existsSync(path.join(artifactRoot, entry.name, 'vision-candidates.json'))
    )
    .map(entry => path.join(artifactRoot, entry.name))
    .sort()
    .at(-1) || null;
};

const resolvePath = value => value ? path.resolve(value) : null;

const decisionVerificationPath = resolvePath(
  valueAfter('--decision-verification')
  || process.env.VISION_PENDING_HITL_DECISION_VERIFICATION_REPORT
  || latestArtifact('vision-pending-hitl-decision-verification-report-')
);
const packetRoot = resolvePath(
  valueAfter('--packet-root')
  || process.env.MOLD_MASTER_VISION_REVIEW_PACKET_ROOT
  || latestReviewPacket()
);
const reviewManifestPath = resolvePath(
  valueAfter('--manifest')
  || process.env.MOLD_MASTER_VISION_REVIEW_MANIFEST
  || (packetRoot ? path.join(packetRoot, 'vision-candidates.json') : null)
);
const outputPath = path.resolve(
  valueAfter('--output')
  || process.env.VISION_PENDING_HITL_AUTHORIZATION_BRIDGE_OUTPUT
  || path.join(artifactRoot, `vision-pending-hitl-authorization-bridge-${timestamp()}.json`)
);
const authorizationOutputPath = path.resolve(
  valueAfter('--authorization-output')
  || process.env.VISION_PENDING_HITL_AUTHORIZATION_OUTPUT
  || path.join(artifactRoot, `vision-hitl-authorization-from-decisions-${timestamp()}.json`)
);

const run = () => {
  const report = buildVisionPendingHitlAuthorizationBridge({
    decisionVerificationReport: decisionVerificationPath && fs.existsSync(decisionVerificationPath)
      ? readJson(decisionVerificationPath)
      : null,
    reviewManifest: reviewManifestPath && fs.existsSync(reviewManifestPath)
      ? readJson(reviewManifestPath)
      : null,
    packetRoot,
    sourceArtifacts: {
      decisionVerificationReport: decisionVerificationPath,
      reviewManifest: reviewManifestPath
    }
  });

  writeJson(outputPath, report);
  let writtenAuthorizationPath = null;
  if (report.authorization) {
    writeJson(authorizationOutputPath, report.authorization);
    writtenAuthorizationPath = authorizationOutputPath;
  }

  console.log(JSON.stringify({
    outputPath,
    authorizationOutputPath: writtenAuthorizationPath,
    status: report.status,
    approvalTargets: report.summary.approvalTargets,
    needsReviewItems: report.summary.needsReviewItems,
    rejectedCandidates: report.summary.rejectedCandidates,
    recaptureRequests: report.summary.recaptureRequests,
    invalidTargets: report.summary.invalidTargets,
    serviceWritesPerformed: report.serviceWritesPerformed,
    recommendedAction: report.recommendedAction
  }, null, 2));
};

try {
  run();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
