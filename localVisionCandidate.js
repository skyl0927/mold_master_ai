const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const IMAGE_MIME_TYPES = Object.freeze({
    '.bmp': 'image/bmp',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp'
});

const SKIPPED_DIRECTORY_NAMES = new Set([
    '.git',
    'artifacts',
    'backups',
    'build',
    'dist',
    'node_modules'
]);

const NON_MANUFACTURING_MARKERS = [
    'screenshot',
    'screen shot',
    '화면 캡처',
    '스크린샷',
    'error',
    '오류',
    'logo',
    'icon',
    'plot',
    'chart',
    '그래프',
    'qr',
    'thumbnail'
];

const normalizeHash = value => String(value || '').trim().toLowerCase();

const loadCandidateManifest = rootPath => {
    const manifestPath = path.join(rootPath, 'vision-candidates.json');
    if (!fs.existsSync(manifestPath)) return new Map();
    let payload;
    try {
        payload = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch {
        return new Map();
    }
    const entries = Array.isArray(payload?.candidates) ? payload.candidates : [];
    return new Map(entries
        .filter(entry => entry && typeof entry.relativePath === 'string')
        .map(entry => [
            entry.relativePath.replace(/\\/g, '/').toLowerCase(),
            entry
        ]));
};

const isLikelyNonManufacturingImage = filePath => {
    const normalized = String(filePath || '').replace(/\\/g, '/').toLowerCase();
    return NON_MANUFACTURING_MARKERS.some(marker => normalized.includes(marker));
};

const collectImagePaths = (rootPath, maxFiles = 5000) => {
    const pending = [path.resolve(rootPath)];
    const imagePaths = [];
    let truncated = false;

    while (pending.length > 0) {
        const current = pending.pop();
        let entries;
        try {
            entries = fs.readdirSync(current, { withFileTypes: true });
        } catch {
            continue;
        }

        for (const entry of entries) {
            if (entry.isSymbolicLink()) continue;
            const fullPath = path.join(current, entry.name);
            if (entry.isDirectory()) {
                if (!SKIPPED_DIRECTORY_NAMES.has(entry.name.toLowerCase())) {
                    pending.push(fullPath);
                }
                continue;
            }
            if (!entry.isFile() || !IMAGE_MIME_TYPES[path.extname(entry.name).toLowerCase()]) continue;
            imagePaths.push(fullPath);
            if (imagePaths.length >= maxFiles) {
                truncated = true;
                return { imagePaths, truncated };
            }
        }
    }

    return { imagePaths, truncated };
};

const scanLocalVisionCandidates = ({
    rootPath,
    existingHashes = [],
    inspectImage,
    maxFiles = 5000,
    maxCandidates = 300,
    maxBytes = 20 * 1024 * 1024
}) => {
    let rootStat;
    try {
        rootStat = rootPath ? fs.statSync(rootPath) : null;
    } catch {
        rootStat = null;
    }
    if (!rootStat?.isDirectory()) {
        throw new Error('유효한 이미지 후보 폴더가 아닙니다.');
    }

    const knownHashes = new Set(existingHashes.map(normalizeHash).filter(Boolean));
    const manifestEntries = loadCandidateManifest(path.resolve(rootPath));
    const seenHashes = new Set();
    const { imagePaths, truncated: fileLimitReached } = collectImagePaths(rootPath, maxFiles);
    const candidates = [];
    let duplicatesSkipped = 0;
    let oversizeSkipped = 0;
    let invalidSkipped = 0;
    let existingMatches = 0;
    let manifestMatched = 0;
    let manifestHashMismatches = 0;

    for (const filePath of imagePaths) {
        let stat;
        let content;
        try {
            stat = fs.statSync(filePath);
            if (stat.size <= 0 || stat.size > maxBytes) {
                oversizeSkipped += 1;
                continue;
            }
            content = fs.readFileSync(filePath);
        } catch {
            invalidSkipped += 1;
            continue;
        }

        const contentSha256 = crypto.createHash('sha256').update(content).digest('hex');
        if (seenHashes.has(contentSha256)) {
            duplicatesSkipped += 1;
            continue;
        }
        seenHashes.add(contentSha256);

        let inspection;
        try {
            inspection = inspectImage(filePath, content);
        } catch {
            inspection = null;
        }
        if (!inspection || !inspection.width || !inspection.height || !inspection.previewDataUrl) {
            invalidSkipped += 1;
            continue;
        }

        const alreadyRegistered = knownHashes.has(contentSha256);
        if (alreadyRegistered) existingMatches += 1;
        const relativePath = path.relative(rootPath, filePath).replace(/\\/g, '/');
        const manifestEntry = manifestEntries.get(relativePath.toLowerCase());
        const manifestHash = normalizeHash(manifestEntry?.contentSha256);
        const trustedManifestEntry = manifestEntry && manifestHash === contentSha256
            ? manifestEntry
            : null;
        const reviewPriority = Number(trustedManifestEntry?.reviewPriority);
        if (trustedManifestEntry) manifestMatched += 1;
        if (manifestEntry && !trustedManifestEntry) manifestHashMismatches += 1;
        candidates.push({
            candidateId: `local-${contentSha256.slice(0, 20)}`,
            fileName: path.basename(filePath),
            filePath,
            mimeType: IMAGE_MIME_TYPES[path.extname(filePath).toLowerCase()],
            sizeBytes: stat.size,
            width: inspection.width,
            height: inspection.height,
            modifiedAt: stat.mtime.toISOString(),
            contentSha256,
            previewDataUrl: inspection.previewDataUrl,
            likelyNonManufacturing: isLikelyNonManufacturingImage(filePath),
            alreadyRegistered,
            proposedDefectType: String(trustedManifestEntry?.defectType || '').trim(),
            labelProvenance: String(trustedManifestEntry?.labelProvenance || '').trim(),
            fieldContext: String(trustedManifestEntry?.fieldContext || '').trim(),
            sourceLineage: trustedManifestEntry?.sourceLineage || null,
            labelEvidence: trustedManifestEntry?.labelEvidence || null,
            reviewPriority: Number.isFinite(reviewPriority) && reviewPriority > 0
                ? Math.floor(reviewPriority)
                : null,
            reviewBucket: String(trustedManifestEntry?.reviewBucket || '').trim(),
            reviewReasons: Array.isArray(trustedManifestEntry?.reviewReasons)
                ? trustedManifestEntry.reviewReasons.map(value => String(value)).filter(Boolean)
                : [],
            requiresLabelReconciliation: Boolean(
                trustedManifestEntry?.requiresLabelReconciliation
                || trustedManifestEntry?.labelEvidence?.conflict
            )
        });

        if (candidates.length >= maxCandidates) break;
    }

    candidates.sort((left, right) => {
        const registrationOrder = Number(left.alreadyRegistered) - Number(right.alreadyRegistered);
        if (registrationOrder !== 0) return registrationOrder;
        const warningOrder = Number(left.likelyNonManufacturing) - Number(right.likelyNonManufacturing);
        if (warningOrder !== 0) return warningOrder;
        const reviewOrder = (left.reviewPriority || 99) - (right.reviewPriority || 99);
        if (reviewOrder !== 0) return reviewOrder;
        return right.modifiedAt.localeCompare(left.modifiedAt);
    });

    return {
        rootPath: path.resolve(rootPath),
        candidates,
        summary: {
            discoveredImageFiles: imagePaths.length,
            uniqueCandidates: candidates.length,
            duplicatesSkipped,
            oversizeSkipped,
            invalidSkipped,
            existingMatches,
            likelyNonManufacturing: candidates.filter(item => item.likelyNonManufacturing).length,
            manifestMatched,
            manifestHashMismatches,
            truncated: fileLimitReached || candidates.length >= maxCandidates
        }
    };
};

module.exports = {
    IMAGE_MIME_TYPES,
    collectImagePaths,
    isLikelyNonManufacturingImage,
    scanLocalVisionCandidates
};
