const fs = require('fs');
const path = require('path');
const {
    buildVisionHumanReviewPacket,
    REQUIRED_DEFECT_CLASSES
} = require('../visionHumanReviewPacket');

const root = path.resolve(__dirname, '..');
const readJson = filePath => JSON.parse(fs.readFileSync(filePath, 'utf8'));
const timestamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
const outputRoot = path.resolve(
    process.env.VISION_REVIEW_PACKET_OUTPUT
    || path.join(root, 'artifacts', `vision-human-review-packet-${timestamp}`)
);

const knowledgeCardRoot = path.join(
    root,
    'artifacts',
    'knowledge-card-vision-candidates',
    'pre-draft-5c350a0fe9f5'
);
const productReviewRoot = path.join(root, 'artifacts', 'product-review-vision-candidates');
const missingClassRoot = path.join(root, 'artifacts', 'missing-class-discovery');
const approvedManifestPath = path.join(root, 'eval', 'vision-approved', 'manifest.json');
const approvedManifest = readJson(approvedManifestPath);

const approvedClassCounts = Object.fromEntries(REQUIRED_DEFECT_CLASSES.map(value => [value, 0]));
for (const item of approvedManifest.cases || []) {
    if (item.status !== 'active') continue;
    const fixture = readJson(path.join(path.dirname(approvedManifestPath), item.file));
    const defectClass = fixture.expected?.defectClass;
    if (defectClass in approvedClassCounts) approvedClassCounts[defectClass] += 1;
}

const result = buildVisionHumanReviewPacket({
    outputRoot,
    sources: [
        {
            kind: 'knowledge-card',
            rootPath: knowledgeCardRoot,
            manifest: readJson(path.join(knowledgeCardRoot, 'vision-candidates.json'))
        },
        {
            kind: 'product-review',
            rootPath: productReviewRoot,
            manifest: readJson(path.join(productReviewRoot, 'vision-candidates.json'))
        },
        {
            kind: 'missing-class',
            rootPath: missingClassRoot,
            manifest: readJson(path.join(missingClassRoot, 'discovery-manifest.json'))
        }
    ],
    approvedClassCounts,
    minimumSamples: approvedManifest.minimumSamples || 20,
    minimumSamplesPerClass: approvedManifest.evaluationGate?.minimumSamplesPerClass || 2
});

console.log(JSON.stringify({
    outputRoot: result.outputRoot,
    manifestPath: result.manifestPath,
    summary: result.manifest.summary,
    persistence: result.manifest.policy.persistence,
    graphPromotion: result.manifest.policy.graphPromotion
}, null, 2));
