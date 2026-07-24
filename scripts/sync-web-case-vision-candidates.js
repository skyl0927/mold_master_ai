const fs = require('node:fs');
const path = require('node:path');

const {
  findLatestWebKnowledgeCollection,
  loadWebKnowledgeCollection
} = require('../webKnowledgeReviewStore');
const {
  REQUIRED_DEFECT_CLASSES
} = require('../shared/defect-taxonomy');
const {
  buildWebCaseVisionCandidateManifest
} = require('../webCaseVisionCandidate');

const args = process.argv.slice(2);
const option = name => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

const root = path.resolve(__dirname, '..');
const collectionRoot = findLatestWebKnowledgeCollection({
  configuredRoot: option('--collection')
    || process.env.MOLD_MASTER_WEB_CASE_ROOT
    || undefined,
  artifactsRoot: path.join(root, 'artifacts')
});
const outputRoot = path.resolve(
  option('--output')
  || path.join(root, 'artifacts', 'web-case-vision-candidates')
);
const approvedManifestPath = path.resolve(
  option('--approved-manifest')
  || path.join(root, 'eval', 'vision-approved', 'manifest.json')
);

const readJson = filePath => JSON.parse(fs.readFileSync(filePath, 'utf8'));

const approvedClassCounts = () => {
  const counts = Object.fromEntries(REQUIRED_DEFECT_CLASSES.map(value => [value, 0]));
  const manifest = readJson(approvedManifestPath);
  for (const item of manifest.cases || []) {
    if (item.status !== 'active') continue;
    const fixture = readJson(path.join(path.dirname(approvedManifestPath), item.file));
    const defectClass = fixture.expected?.defectClass;
    if (defectClass in counts) counts[defectClass] += 1;
  }
  return {
    counts,
    minimumSamplesPerClass: manifest.evaluationGate?.minimumSamplesPerClass || 2,
    currentApprovedSamples: (manifest.cases || []).filter(
      item => item.status === 'active'
    ).length,
    minimumTotalSamples: manifest.minimumSamples || 20
  };
};

const main = () => {
  const collection = loadWebKnowledgeCollection(collectionRoot);
  const approved = approvedClassCounts();
  const manifest = buildWebCaseVisionCandidateManifest({
    collection,
    approvedClassCounts: approved.counts,
    minimumSamplesPerClass: approved.minimumSamplesPerClass,
    currentApprovedSamples: approved.currentApprovedSamples,
    minimumTotalSamples: approved.minimumTotalSamples,
    missingOnly: !args.includes('--all')
  });
  fs.mkdirSync(outputRoot, { recursive: true });
  const manifestPath = path.join(outputRoot, 'vision-candidates.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  console.log(JSON.stringify({
    collectionRoot,
    outputRoot,
    manifestPath,
    policy: manifest.policy,
    summary: manifest.summary,
    serverWrites: 0
  }, null, 2));
};

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
