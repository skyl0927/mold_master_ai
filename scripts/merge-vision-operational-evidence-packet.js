const fs = require('node:fs');
const path = require('node:path');
const {
  buildVisionOperationalEvidencePacket,
  mergeVisionOperationalEvidencePacketIntoReleaseConfig,
  normalizeVisionOperationalEvidencePacket
} = require('./lib/vision-operational-evidence-packet');

const args = process.argv.slice(2);
const valueAfter = flag => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};
const requiredPath = flag => {
  const value = valueAfter(flag);
  if (!value) throw new Error(`${flag} is required`);
  return path.resolve(value);
};
const readJson = filePath => JSON.parse(
  fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '')
);
const writeJson = (filePath, value) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};

const packetFromArgs = () => {
  const packetPath = valueAfter('--packet');
  if (packetPath) {
    return normalizeVisionOperationalEvidencePacket(readJson(path.resolve(packetPath)));
  }
  return buildVisionOperationalEvidencePacket({
    generatedAt: valueAfter('--generated-at'),
    commonAgentExportUri: valueAfter('--common-agent-export-uri'),
    commonAgentRecordCount: valueAfter('--common-agent-record-count'),
    commonAgentReviewPacketUri: valueAfter('--common-agent-review-packet-uri'),
    graphSnapshotUri: valueAfter('--graph-snapshot-uri'),
    graphVersion: valueAfter('--graph-version'),
    graphNodeCount: valueAfter('--graph-node-count'),
    graphEdgeCount: valueAfter('--graph-edge-count'),
    graphReleaseEvidenceUri: valueAfter('--graph-release-evidence-uri')
  });
};

const run = () => {
  const configPath = requiredPath('--config');
  const outputPath = path.resolve(
    valueAfter('--output')
      || path.join(process.cwd(), 'artifacts', 'vision-operational-release-config.with-evidence.json')
  );
  const packetOutputPath = valueAfter('--packet-output')
    ? path.resolve(valueAfter('--packet-output'))
    : undefined;
  const config = readJson(configPath);
  const packet = packetFromArgs();
  const merged = mergeVisionOperationalEvidencePacketIntoReleaseConfig(config, packet);

  writeJson(outputPath, merged);
  if (packetOutputPath) writeJson(packetOutputPath, packet);

  console.log('Vision operational evidence packet merged.');
  console.log(`Common Agent export: ${packet.commonAgentDatasetExport.uri}`);
  console.log(`Graph snapshot: ${packet.graphSnapshot.uri}`);
  console.log(`Graph version: ${packet.graphSnapshot.graphVersion}`);
  console.log(`Config: ${outputPath}`);
  if (packetOutputPath) console.log(`Packet: ${packetOutputPath}`);
};

try {
  run();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
