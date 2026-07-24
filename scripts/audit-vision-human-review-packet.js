const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {
    applyVisionAuditObservation,
    rankVisionReviewCandidate,
    summarizeVisionAuditCandidates
} = require('../visionHumanReviewPacket');
const {
    loadReusableVisionAuditItems
} = require('../visionAuditCache');

const args = process.argv.slice(2);
const valueAfter = flag => {
    const index = args.indexOf(flag);
    return index >= 0 ? args[index + 1] : undefined;
};
const refresh = args.includes('--refresh');
const maxItems = Math.max(1, Number(valueAfter('--max-items')) || Number.MAX_SAFE_INTEGER);
const qaUrl = String(
    process.env.VISION_QA_URL || process.env.COMMON_AGENT_QA_URL || 'http://127.0.0.1:8103'
).replace(/\/+$/, '');
const artifactRoot = path.join(process.cwd(), 'artifacts');
const requestedPacket = valueAfter('--packet');
const packetRoot = requestedPacket
    ? path.resolve(requestedPacket)
    : fs.readdirSync(artifactRoot, { withFileTypes: true })
        .filter(entry => entry.isDirectory() && entry.name.startsWith('vision-human-review-packet-'))
        .map(entry => path.join(artifactRoot, entry.name))
        .filter(directory => fs.existsSync(path.join(directory, 'vision-candidates.json')))
        .sort()
        .at(-1);

if (!packetRoot) throw new Error('No generated Vision human-review packet was found.');

const manifestPath = path.join(packetRoot, 'vision-candidates.json');
const auditPath = path.join(packetRoot, 'vision-audit.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const priorAudit = fs.existsSync(auditPath)
    ? JSON.parse(fs.readFileSync(auditPath, 'utf8'))
    : { schemaVersion: 1, items: [] };
const auditByHash = loadReusableVisionAuditItems({
    artifactRoot,
    excludePacketRoot: packetRoot
});
for (const item of priorAudit.items || []) {
    auditByHash.set(item.contentSha256, item);
}

const mimeTypeFor = fileName => ({
    '.bmp': 'image/bmp',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp'
})[path.extname(fileName).toLowerCase()] || 'application/octet-stream';

const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

const requestObservation = async (candidate, bytes) => {
    const response = await fetch(`${qaUrl}/internal/vision/describe`, {
        method: 'POST',
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
            image_base64: bytes.toString('base64'),
            mime_type: mimeTypeFor(candidate.relativePath),
            question: [
                '사출 성형 결함 이미지의 사람 검토를 위한 비영속 라벨 제안을 수행하세요.',
                '정상 형상과 실제 외관 이상을 먼저 구분하고 지배적인 결함 하나를 제안하세요.',
                '결과는 자동 승인이나 학습에 사용되지 않습니다.',
                `원문 후보 라벨: ${candidate.defectType}`,
                candidate.fieldContext ? `원문 문맥: ${candidate.fieldContext}` : ''
            ].filter(Boolean).join('\n'),
            context: {
                source_system: 'mold-master-ai-human-review-packet-audit',
                source_image_hash: candidate.contentSha256,
                source_defect_class: candidate.defectClass,
                non_persisting: true
            }
        })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        const error = new Error(`Vision audit failed: ${response.status} ${JSON.stringify(payload)}`);
        error.status = response.status;
        throw error;
    }
    return payload;
};

const requestWithRetry = async (candidate, bytes) => {
    let lastError;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
            return await requestObservation(candidate, bytes);
        } catch (error) {
            lastError = error;
            if (![429, 500, 502, 503, 504].includes(Number(error.status)) || attempt === 3) {
                throw error;
            }
            await sleep(attempt * 1500);
        }
    }
    throw lastError;
};

const writeProgress = items => {
    const payload = {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        packetRoot,
        policy: {
            persistence: 'none',
            autoApproval: false,
            graphPromotion: false,
            endpoint: '/internal/vision/describe'
        },
        items
    };
    fs.writeFileSync(auditPath, JSON.stringify(payload, null, 2), 'utf8');
};

(async () => {
    const candidates = manifest.candidates || [];
    let requested = 0;
    const output = [];

    for (const candidate of candidates) {
        const existing = auditByHash.get(candidate.contentSha256);
        if (!refresh && existing?.status === 'completed') {
            output.push({
                ...existing,
                contentSha256: candidate.contentSha256,
                relativePath: candidate.relativePath,
                reused: true,
                candidate: existing.observation
                    ? applyVisionAuditObservation(
                        candidate,
                        existing.observation,
                        existing.auditedAt || candidate.labelEvidence?.auditedAt
                    )
                    : existing.candidate || candidate
            });
            continue;
        }
        if (!refresh && candidate.labelEvidence?.auditedAt) {
            output.push({
                contentSha256: candidate.contentSha256,
                relativePath: candidate.relativePath,
                status: 'completed',
                reused: true,
                candidate
            });
            continue;
        }
        if (requested >= maxItems) {
            output.push({
                contentSha256: candidate.contentSha256,
                relativePath: candidate.relativePath,
                status: 'pending'
            });
            continue;
        }

        const imagePath = path.resolve(packetRoot, candidate.relativePath);
        const relativeFromPacket = path.relative(packetRoot, imagePath);
        if (relativeFromPacket.startsWith('..') || path.isAbsolute(relativeFromPacket)) {
            throw new Error(`candidate path escapes packet: ${candidate.relativePath}`);
        }
        const bytes = fs.readFileSync(imagePath);
        const currentHash = sha256(bytes);
        if (currentHash !== candidate.contentSha256) {
            throw new Error(`hash mismatch before Vision audit: ${candidate.relativePath}`);
        }

        requested += 1;
        try {
            const observation = await requestWithRetry(candidate, bytes);
            const auditedAt = new Date().toISOString();
            const auditedCandidate = applyVisionAuditObservation(candidate, observation, auditedAt);
            const item = {
                contentSha256: candidate.contentSha256,
                relativePath: candidate.relativePath,
                status: 'completed',
                reused: false,
                auditedAt,
                observation,
                candidate: auditedCandidate
            };
            auditByHash.set(candidate.contentSha256, item);
            output.push(item);
            console.log(
                `[${requested}] ${candidate.relativePath}: `
                + `${observation.defect_type} (${Math.round((Number(observation.confidence) || 0) * 100)}%)`
            );
        } catch (error) {
            const item = {
                contentSha256: candidate.contentSha256,
                relativePath: candidate.relativePath,
                status: 'failed',
                error: error instanceof Error ? error.message : String(error)
            };
            auditByHash.set(candidate.contentSha256, item);
            output.push(item);
            console.error(`[${requested}] ${candidate.relativePath}: ${item.error}`);
        }
        writeProgress(output);
    }

    const auditedCandidates = candidates.map(candidate => {
        const item = output.find(entry => entry.contentSha256 === candidate.contentSha256);
        return item?.candidate || candidate;
    });
    const rankedCandidates = auditedCandidates.map(candidate => ({
        ...candidate,
        ...rankVisionReviewCandidate(candidate)
    }));
    const summary = summarizeVisionAuditCandidates(rankedCandidates);
    const reviewBucketCounts = Object.fromEntries(
        [...new Set(rankedCandidates.map(candidate => candidate.reviewBucket))]
            .sort((left, right) => {
                const leftPriority = rankedCandidates.find(item => item.reviewBucket === left)?.reviewPriority || 99;
                const rightPriority = rankedCandidates.find(item => item.reviewBucket === right)?.reviewPriority || 99;
                return leftPriority - rightPriority;
            })
            .map(bucket => [
                bucket,
                rankedCandidates.filter(candidate => candidate.reviewBucket === bucket).length
            ])
    );
    writeProgress(output);

    if (!output.some(item => item.status === 'failed' || item.status === 'pending')) {
        const updatedManifest = {
            ...manifest,
            auditSummary: {
                ...summary,
                reviewBucketCounts,
                requestedThisRun: requested,
                nonPersisting: true,
                autoApproval: false,
                graphPromotion: false
            },
            candidates: rankedCandidates
        };
        const temporaryPath = `${manifestPath}.audit-tmp`;
        fs.writeFileSync(temporaryPath, JSON.stringify(updatedManifest, null, 2), 'utf8');
        fs.copyFileSync(temporaryPath, manifestPath);
        fs.rmSync(temporaryPath, { force: true });
    }

    console.log(JSON.stringify({
        packetRoot,
        auditPath,
        requestedThisRun: requested,
        ...summary,
        reviewBucketCounts,
        failed: output.filter(item => item.status === 'failed').length,
        pending: output.filter(item => item.status === 'pending').length,
        persistence: 'none',
        graphPromotion: false
    }, null, 2));

    if (output.some(item => item.status === 'failed')) process.exitCode = 1;
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
