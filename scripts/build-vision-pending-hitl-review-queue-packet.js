const fs = require('node:fs');
const path = require('node:path');
const {
  buildVisionPendingHitlReviewQueuePacket
} = require('../visionPendingHitlReviewQueuePacket');

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

const resolveOptionalPath = (...candidates) => {
  const candidate = candidates.find(Boolean);
  return candidate ? path.resolve(candidate) : null;
};

const latestReviewPacketPath = () => {
  if (!fs.existsSync(artifactRoot)) return null;
  const matches = fs.readdirSync(artifactRoot)
    .filter(name => name.startsWith('vision-human-review-packet-'))
    .map(name => path.join(artifactRoot, name, 'vision-candidates.json'))
    .filter(candidatePath => fs.existsSync(candidatePath))
    .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs);
  return matches[0] || null;
};

const reviewPacketPathFromGateStatus = () => {
  const gatePath = path.join(artifactRoot, 'post-hitl-preflight-gate-status.json');
  const gateStatus = readOptionalJson(gatePath);
  const source = gateStatus?.sources?.reviewPacket;
  if (!source) return null;
  const resolved = path.resolve(source);
  if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) return resolved;
  const candidatePath = path.join(resolved, 'vision-candidates.json');
  return fs.existsSync(candidatePath) ? candidatePath : null;
};

const enrichApprovedManifest = (approvedManifest, manifestPath) => {
  if (!approvedManifest || !manifestPath) return approvedManifest;
  const manifestDir = path.dirname(manifestPath);
  return {
    ...approvedManifest,
    cases: (approvedManifest.cases || []).map(record => {
      if (!record?.file) return record;
      const casePath = path.resolve(manifestDir, record.file);
      const caseJson = readOptionalJson(casePath);
      if (!caseJson) return record;
      return {
        ...record,
        contentHash: record.contentHash || caseJson.contentHash,
        contentSha256: record.contentSha256 || caseJson.contentSha256 || caseJson.contentHash,
        defectType: record.defectType || caseJson.expected?.defectType,
        defectClass: record.defectClass || caseJson.expected?.defectClass
      };
    })
  };
};

const reviewPacketPath = resolveOptionalPath(
  valueAfter('--review-packet'),
  process.env.VISION_HUMAN_REVIEW_PACKET,
  reviewPacketPathFromGateStatus(),
  latestReviewPacketPath()
);

const approvedManifestPath = resolveOptionalPath(
  valueAfter('--approved-manifest'),
  process.env.VISION_APPROVED_MANIFEST,
  path.join(root, 'eval', 'vision-approved', 'manifest.json')
);

const postHitlPath = resolveOptionalPath(
  valueAfter('--post-hitl'),
  process.env.POST_HITL_VERIFICATION_REPORT,
  path.join(artifactRoot, 'post-hitl-verification-report.json')
);

const outputPath = path.resolve(
  valueAfter('--output')
  || process.env.VISION_PENDING_HITL_REVIEW_QUEUE_PACKET_OUTPUT
  || path.join(artifactRoot, `vision-pending-hitl-review-queue-packet-${timestamp()}.json`)
);

const run = () => {
  const approvedManifest = enrichApprovedManifest(
    readOptionalJson(approvedManifestPath),
    approvedManifestPath
  );
  const packet = buildVisionPendingHitlReviewQueuePacket({
    reviewPacket: readOptionalJson(reviewPacketPath),
    approvedManifest,
    postHitlVerificationReport: readOptionalJson(postHitlPath),
    sourceArtifacts: {
      reviewPacket: reviewPacketPath,
      approvedManifest: approvedManifestPath,
      postHitlVerificationReport: postHitlPath
    }
  });

  writeJson(outputPath, packet);
  console.log(JSON.stringify({
    outputPath,
    status: packet.status,
    pendingHighConfidence: packet.summary.pendingHighConfidence,
    resolvedHighConfidence: packet.summary.resolvedHighConfidence,
    skippedNonHighConfidence: packet.summary.skippedNonHighConfidence,
    matchesPostHitlReport: packet.summary.matchesPostHitlReport,
    serviceWritesPerformed: packet.serviceWritesPerformed,
    firstQueueId: packet.items[0]?.queueId || null,
    firstDefectClass: packet.items[0]?.defectClass || null,
    recommendedAction: packet.recommendedAction
  }, null, 2));
};

try {
  run();
} catch (error) {
  const packet = buildVisionPendingHitlReviewQueuePacket({
    reviewPacket: null,
    approvedManifest: null,
    sourceArtifacts: {
      reviewPacket: reviewPacketPath,
      approvedManifest: approvedManifestPath,
      postHitlVerificationReport: postHitlPath
    }
  });
  packet.status = 'missing_review_packet';
  packet.error = error instanceof Error ? error.message : String(error);
  writeJson(outputPath, packet);
  console.error(error);
  process.exitCode = 1;
}
