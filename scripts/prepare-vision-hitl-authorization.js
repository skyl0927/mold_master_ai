const fs = require('node:fs');
const path = require('node:path');
const {
  buildVisionHitlAuthorizationTemplate
} = require('../visionHitlAuthorization');

const root = path.resolve(__dirname, '..');
const artifactRoot = path.join(root, 'artifacts');
const agentUrl = String(
  process.env.COMMON_AGENT_URL || 'http://127.0.0.1:8000'
).replace(/\/+$/, '');

const argumentValue = name => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

const latestReviewPacket = () => fs.readdirSync(artifactRoot, { withFileTypes: true })
  .filter(entry =>
    entry.isDirectory()
    && entry.name.startsWith('vision-human-review-packet-')
  )
  .map(entry => path.join(artifactRoot, entry.name))
  .filter(directory => fs.existsSync(path.join(directory, 'vision-candidates.json')))
  .sort()
  .at(-1);

const fetchDataset = async () => {
  const response = await fetch(
    `${agentUrl}/v1/datasets/images?include_hidden=true&limit=500`
  );
  if (!response.ok) {
    throw new Error(`Common Agent dataset query failed: ${response.status}`);
  }
  return response.json();
};

const run = async () => {
  const packetRoot = path.resolve(
    argumentValue('--packet')
    || process.env.MOLD_MASTER_VISION_REVIEW_PACKET_ROOT
    || latestReviewPacket()
    || ''
  );
  const manifestPath = path.join(packetRoot, 'vision-candidates.json');
  if (!packetRoot || !fs.existsSync(manifestPath)) {
    throw new Error('No prepared Vision human-review packet was found.');
  }
  const dataset = await fetchDataset();
  const generatedAt = new Date().toISOString();
  const authorization = buildVisionHitlAuthorizationTemplate({
    manifest: JSON.parse(fs.readFileSync(manifestPath, 'utf8')),
    packetRoot,
    datasetItems: dataset.items || [],
    generatedAt
  });
  const defaultName = `vision-hitl-authorization-${
    generatedAt.replace(/[-:.]/g, '').replace('Z', '')
  }.json`;
  const outputPath = path.resolve(
    argumentValue('--output')
    || path.join(artifactRoot, defaultName)
  );
  if (fs.existsSync(outputPath)) {
    throw new Error(`Authorization file already exists and will not be overwritten: ${outputPath}`);
  }
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(authorization, null, 2)}\n`, 'utf8');

  console.log(JSON.stringify({
    outputPath,
    packetRoot,
    packetDigest: authorization.packetDigest,
    totalTargets: authorization.summary.totalTargets,
    targetsByClass: authorization.summary.targetsByClass,
    authorizationStatement: authorization.authorizationStatement,
    writesPerformed: false
  }, null, 2));
};

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
