const fs = require('node:fs');
const path = require('node:path');
const {
  buildOperationalHitlReviewSessionPacket
} = require('../operationalHitlReviewSessionPacket');

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

const writeText = (filePath, payload) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, payload, 'utf8');
};

const writeJson = (filePath, payload) => {
  writeText(filePath, `${JSON.stringify(payload, null, 2)}\n`);
};

const reviewSessionPlanPath = resolveOptionalPath(
  valueAfter('--review-session-plan'),
  process.env.OPERATIONAL_HITL_REVIEW_SESSION_PLAN,
  latestArtifact('operational-hitl-review-session-plan-')
);

const baseOutput = valueAfter('--output-base')
  || process.env.OPERATIONAL_HITL_REVIEW_SESSION_PACKET_OUTPUT_BASE
  || path.join(artifactRoot, `operational-hitl-review-session-packet-${timestamp()}`);

const jsonOutputPath = path.resolve(`${baseOutput}.json`);
const packetDir = path.resolve(`${baseOutput}-files`);

const writePacketFiles = report => {
  const packets = report.packets.map(packet => {
    const csvPath = path.join(packetDir, packet.csvFileName);
    const markdownPath = path.join(packetDir, packet.markdownFileName);
    if (packet.csv) writeText(csvPath, packet.csv);
    if (packet.markdown) writeText(markdownPath, packet.markdown);
    return {
      ...packet,
      csv: undefined,
      markdown: undefined,
      csvPath: packet.csv ? csvPath : null,
      markdownPath: packet.markdown ? markdownPath : null
    };
  });

  return {
    ...report,
    packetDir: packets.length > 0 ? packetDir : null,
    packets
  };
};

const fileCountFor = report => report.packets.reduce(
  (total, packet) => total + (packet.csvPath ? 1 : 0) + (packet.markdownPath ? 1 : 0),
  0
);

const run = () => {
  const report = buildOperationalHitlReviewSessionPacket({
    reviewSessionPlan: readOptionalJson(reviewSessionPlanPath),
    sourceArtifacts: {
      reviewSessionPlan: reviewSessionPlanPath
    }
  });
  const manifest = writePacketFiles(report);
  writeJson(jsonOutputPath, manifest);

  console.log(JSON.stringify({
    outputPath: jsonOutputPath,
    packetDir: manifest.packetDir,
    status: manifest.status,
    serviceWritesPerformed: manifest.serviceWritesPerformed,
    totalRows: manifest.summary.totalRows,
    sessionPacketCount: manifest.summary.sessionPacketCount,
    highRiskRows: manifest.summary.highRiskRows,
    filesWritten: fileCountFor(manifest),
    recommendedAction: manifest.recommendedAction
  }, null, 2));
};

try {
  run();
} catch (error) {
  const report = buildOperationalHitlReviewSessionPacket({
    sourceArtifacts: {
      reviewSessionPlan: reviewSessionPlanPath
    }
  });
  report.summary.error = error instanceof Error ? error.message : String(error);
  writeJson(jsonOutputPath, report);
  console.error(error);
  process.exitCode = 1;
}
