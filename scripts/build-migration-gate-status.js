const fs = require('node:fs');
const path = require('node:path');
const { buildMigrationGateStatus } = require('../migrationGateStatus');

const root = path.resolve(__dirname, '..');
const artifactRoot = path.join(root, 'artifacts');
const agentUrl = String(process.env.COMMON_AGENT_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '');
const qaUrl = String(process.env.COMMON_AGENT_QA_URL || 'http://127.0.0.1:8103').replace(/\/+$/, '');
const outputPath = path.resolve(
    process.env.MIGRATION_GATE_STATUS_OUTPUT
    || path.join(artifactRoot, 'migration-gate-status.json')
);

const readJson = filePath => JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));

const latestArtifactFile = prefix => {
    if (!fs.existsSync(artifactRoot)) return '';
    return fs.readdirSync(artifactRoot, { withFileTypes: true })
        .filter(entry => entry.isFile() && entry.name.startsWith(prefix) && entry.name.endsWith('.json'))
        .map(entry => {
            const filePath = path.join(artifactRoot, entry.name);
            return {
                filePath,
                mtimeMs: fs.statSync(filePath).mtimeMs
            };
        })
        .sort((left, right) => right.mtimeMs - left.mtimeMs)[0]?.filePath || '';
};

const latestReviewPacket = () => fs.readdirSync(artifactRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && entry.name.startsWith('vision-human-review-packet-'))
    .map(entry => path.join(artifactRoot, entry.name))
    .filter(directory => fs.existsSync(path.join(directory, 'vision-candidates.json')))
    .sort()
    .at(-1);

const fetchJson = async (url, timeoutMs = 15000) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, { signal: controller.signal });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(`${response.status} ${JSON.stringify(payload)}`);
        return payload;
    } finally {
        clearTimeout(timeout);
    }
};

const probeHealth = async (baseUrl, pathName) => {
    try {
        const detail = await fetchJson(`${baseUrl}${pathName}`, 8000);
        return { online: true, url: baseUrl, detail };
    } catch (error) {
        return {
            online: false,
            url: baseUrl,
            error: error instanceof Error ? error.message : String(error)
        };
    }
};

(async () => {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    const packetRoot = latestReviewPacket();
    const approvedManifestPath = path.join(root, 'eval', 'vision-approved', 'manifest.json');
    const benchmarkPath = path.join(artifactRoot, 'multimodal-vision-benchmark-report.json');
    const visionReferenceGatePath = path.join(
        artifactRoot,
        'vision-reference-operational-gate.json'
    );
    const visionReferenceBackfillPath = path.join(
        artifactRoot,
        'vision-reference-backfill-plan.json'
    );
    const visionReferenceBackfillPostApplyPath = latestArtifactFile(
        'vision-reference-backfill-post-apply-verification-'
    );

    const [agentHealth, qaHealth, dataset] = await Promise.all([
        probeHealth(agentUrl, '/healthz'),
        probeHealth(qaUrl, '/healthz'),
        fetchJson(`${agentUrl}/v1/datasets/images?include_hidden=true&limit=500`).catch(error => ({
            total: 0,
            items: [],
            error: error instanceof Error ? error.message : String(error)
        }))
    ]);

    const status = buildMigrationGateStatus({
        generatedAt: new Date().toISOString(),
        agentHealth,
        qaHealth,
        dataset,
        approvedManifest: readJson(approvedManifestPath),
        reviewManifest: packetRoot
            ? readJson(path.join(packetRoot, 'vision-candidates.json'))
            : {},
        benchmarkReport: fs.existsSync(benchmarkPath) ? readJson(benchmarkPath) : {},
        visionReferenceReport: fs.existsSync(visionReferenceGatePath)
            ? readJson(visionReferenceGatePath)
            : {
                status: 'blocked',
                readyForGraphRetrieval: false,
                referenceStore: { referenceCount: 0 },
                benchmark: { evaluatedCount: 0, failedGateChecks: [] },
                blockers: [{ code: 'vision_reference_gate_missing' }]
            },
        visionReferenceBackfillPlan: fs.existsSync(visionReferenceBackfillPath)
            ? readJson(visionReferenceBackfillPath)
            : null,
        visionReferenceBackfillPostApplyVerification: visionReferenceBackfillPostApplyPath
            ? readJson(visionReferenceBackfillPostApplyPath)
            : null
    });
    const report = {
        ...status,
        sources: {
            approvedManifest: approvedManifestPath,
            reviewPacket: packetRoot || null,
            benchmarkReport: fs.existsSync(benchmarkPath) ? benchmarkPath : null,
            visionReferenceGate: fs.existsSync(visionReferenceGatePath)
                ? visionReferenceGatePath
                : null,
            visionReferenceBackfill: fs.existsSync(visionReferenceBackfillPath)
                ? visionReferenceBackfillPath
                : null,
            visionReferenceBackfillPostApply: visionReferenceBackfillPostApplyPath || null
        }
    };
    fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

    console.log(JSON.stringify({
        outputPath,
        services: report.services,
        dataset: report.dataset,
        approved: report.approved,
        hitl: report.hitl,
        visionReference: report.visionReference,
        visionReferenceBackfill: report.visionReferenceBackfill,
        visionReferenceBackfillPostApply: report.visionReferenceBackfillPostApply,
        gate: report.gate,
        recommendedAction: report.recommendedAction,
        writesPerformed: report.writesPerformed
    }, null, 2));
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
