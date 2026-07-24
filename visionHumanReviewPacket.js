const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {
    canonicalDefectClass,
    isClassifiableDefectLabel
} = require('./shared/defect-taxonomy');

const REQUIRED_DEFECT_CLASSES = Object.freeze([
    'whitening',
    'short_shot',
    'burn',
    'flash',
    'sink',
    'weld_line',
    'ejection'
]);

const DEFECT_LABELS = Object.freeze({
    whitening: '백화',
    short_shot: '미성형',
    burn: '가스 탐/번 마크',
    flash: '플래시',
    sink: '싱크 마크',
    weld_line: '웰드라인',
    ejection: '이형/취출 손상'
});

const normalizeHash = value => String(value || '').trim().toLowerCase();

const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

const normalizeRelativePath = value =>
    String(value || '').replace(/\\/g, '/').replace(/^\/+/, '');

const sourceReviewNeedsConfirmation = candidate => {
    const status = String(
        candidate.sourceLineage?.sourceReviewStatus
        || candidate.sourceReviewStatus
        || candidate.reviewDecision
        || ''
    ).trim().toLowerCase();
    return Boolean(status) && !['approved', 'reviewed', 'confirmed'].includes(status);
};

const normalizeCandidate = (kind, candidate) => {
    const defectClass = String(candidate.defectClass || candidate.suggestedClass || '').trim();
    const sourcePath = normalizeRelativePath(candidate.relativePath || candidate.file);
    if (!REQUIRED_DEFECT_CLASSES.includes(defectClass) || !sourcePath) return null;
    const contentSha256 = normalizeHash(candidate.contentSha256);
    if (!/^[a-f0-9]{64}$/.test(contentSha256)) return null;

    const sourceLineage = candidate.sourceLineage || {
        reviewSessionId: candidate.sessionId,
        sourceDocumentId: candidate.sourceDocumentId,
        documentTitle: candidate.documentTitle,
        knowledgeId: candidate.knowledgeId,
        slideNumber: candidate.slideNumber,
        figureId: candidate.figureId,
        assetUri: candidate.assetUri,
        sourceContentHash: candidate.contentSha256,
        sourceReviewStatus: candidate.sourceReviewStatus
    };
    const requiresLabelReconciliation = Boolean(
        candidate.requiresLabelReconciliation
        || candidate.labelEvidence?.conflict
        || sourceReviewNeedsConfirmation(candidate)
    );

    return {
        sourceKind: kind,
        sourceRelativePath: sourcePath,
        relativePath: `${kind}/${path.basename(sourcePath)}`,
        defectType: String(candidate.defectType || DEFECT_LABELS[defectClass]).trim(),
        defectClass,
        labelProvenance: String(
            candidate.labelProvenance
            || (kind === 'missing-class'
                ? 'heuristic_suggested_class'
                : 'source_document_label')
        ),
        fieldContext: String(
            candidate.fieldContext
            || [
                candidate.title,
                candidate.caption,
                candidate.documentTitle && `Source document: ${candidate.documentTitle}`
            ].filter(Boolean).join('\n')
        ).trim(),
        contentSha256,
        sourceLineage,
        labelEvidence: candidate.labelEvidence || null,
        requiresLabelReconciliation,
        reviewDecision: 'unreviewed'
    };
};

const applyVisionAuditObservation = (
    candidate,
    observation,
    auditedAt = new Date().toISOString()
) => {
    const visionSuggestedLabel = String(observation?.defect_type || '').trim();
    const classifiable = isClassifiableDefectLabel(visionSuggestedLabel);
    const suggestedDefectClass = classifiable
        ? canonicalDefectClass(visionSuggestedLabel)
        : 'unclassified';
    const sourceDefectClass = String(
        candidate.defectClass || canonicalDefectClass(candidate.defectType)
    );
    const modelConfidence = Math.max(0, Math.min(1, Number(observation?.confidence) || 0));
    const conflict = !classifiable || suggestedDefectClass !== sourceDefectClass;

    return {
        ...candidate,
        requiresLabelReconciliation: true,
        labelEvidence: {
            ...(candidate.labelEvidence || {}),
            sourceLabel: candidate.labelEvidence?.sourceLabel || candidate.defectType,
            visionSuggestedLabel,
            visionConfidence: classifiable ? modelConfidence : 0,
            visionModelConfidence: modelConfidence,
            visionSummary: String(observation?.summary || '').trim(),
            conflict,
            auditedAt,
            nonPersisting: true
        },
        audit: {
            classifiable,
            sourceDefectClass,
            suggestedDefectClass,
            confidence: classifiable ? modelConfidence : 0,
            modelConfidence,
            possibleCauses: Array.isArray(observation?.possible_causes)
                ? observation.possible_causes.map(String).filter(Boolean)
                : [],
            recommendedChecks: Array.isArray(observation?.recommended_checks)
                ? observation.recommended_checks.map(String).filter(Boolean)
                : [],
            nonPersisting: true
        }
    };
};

const summarizeVisionAuditCandidates = candidates => {
    const auditedItems = candidates
        .filter(candidate => Boolean(candidate.labelEvidence?.auditedAt))
        .map(candidate => {
            const evidence = candidate.labelEvidence;
            const classifiable = isClassifiableDefectLabel(evidence.visionSuggestedLabel);
            return {
                candidate,
                classifiable,
                sourceClass: candidate.defectClass,
                suggestedClass: classifiable
                    ? canonicalDefectClass(evidence.visionSuggestedLabel)
                    : 'unclassified',
                conflict: evidence.conflict !== false
            };
        });
    const countBy = (items, selector) => Object.fromEntries(
        [...new Set(items.map(selector))].sort().map(key => [
            key,
            items.filter(item => selector(item) === key).length
        ])
    );
    const sourceItems = candidates.map(candidate => ({
        sourceClass: candidate.defectClass
    }));
    return {
        total: candidates.length,
        audited: auditedItems.length,
        pending: Math.max(0, candidates.length - auditedItems.length),
        classifiable: auditedItems.filter(item => item.classifiable).length,
        unclassifiable: auditedItems.filter(item => !item.classifiable).length,
        agreements: auditedItems.filter(item => item.classifiable && !item.conflict).length,
        conflicts: auditedItems.filter(item => item.conflict).length,
        sourceClassCounts: countBy(sourceItems, item => item.sourceClass),
        suggestedClassCounts: countBy(auditedItems, item => item.suggestedClass)
    };
};

const rankVisionReviewCandidate = candidate => {
    const evidence = candidate.labelEvidence || {};
    const audited = Boolean(evidence.auditedAt);
    if (!audited) {
        return {
            reviewPriority: 6,
            reviewBucket: 'pending_audit',
            reviewReasons: ['Vision suggestion has not been generated.']
        };
    }
    const classifiable = isClassifiableDefectLabel(evidence.visionSuggestedLabel);
    const suggestedClass = classifiable
        ? canonicalDefectClass(evidence.visionSuggestedLabel)
        : 'unclassified';
    const sourceClass = candidate.defectClass;
    const confidence = Math.max(0, Math.min(1, Number(evidence.visionConfidence) || 0));
    const agrees = classifiable
        && suggestedClass === sourceClass
        && evidence.conflict === false;
    const heuristicLabel = candidate.labelProvenance === 'heuristic_suggested_class'
        || candidate.sourceLineage?.packetSourceKind === 'missing-class';

    if (agrees && heuristicLabel) {
        return {
            reviewPriority: 3,
            reviewBucket: 'heuristic_agreement',
            reviewReasons: [
                `Heuristic and Vision both suggest ${sourceClass}.`,
                'The source document did not provide a confirmed defect label.'
            ]
        };
    }
    if (agrees && confidence >= 0.6) {
        return {
            reviewPriority: 1,
            reviewBucket: 'agreement_high_confidence',
            reviewReasons: [
                `Source and Vision agree on ${sourceClass}.`,
                `Vision confidence is ${Math.round(confidence * 100)}%.`
            ]
        };
    }
    if (agrees) {
        return {
            reviewPriority: 2,
            reviewBucket: 'agreement_low_confidence',
            reviewReasons: [
                `Source and Vision agree on ${sourceClass}.`,
                `Vision confidence is below 60% (${Math.round(confidence * 100)}%).`
            ]
        };
    }
    if (classifiable) {
        return {
            reviewPriority: 4,
            reviewBucket: 'class_conflict',
            reviewReasons: [
                `Source class is ${sourceClass}; Vision suggests ${suggestedClass}.`,
                'A reviewer must resolve the label conflict.'
            ]
        };
    }
    return {
        reviewPriority: 5,
        reviewBucket: 'unclassifiable',
        reviewReasons: [
            'Vision did not identify a classifiable manufacturing defect.',
            'Reject or relabel only after reviewing the source image and document context.'
        ]
    };
};

const collectReviewCandidates = ({
    knowledgeCard = {},
    productReview = {},
    missingClass = {},
    webCase = {}
} = {}) => {
    const sourceGroups = [
        ['knowledge-card', knowledgeCard.candidates || []],
        ['product-review', productReview.candidates || []],
        ['missing-class', missingClass.items || []],
        ['web-case', webCase.candidates || []]
    ];
    const candidates = [];
    const seenHashes = new Set();
    let duplicatesSkipped = 0;
    let invalidSkipped = 0;

    for (const [kind, entries] of sourceGroups) {
        for (const entry of entries) {
            const candidate = normalizeCandidate(kind, entry);
            if (!candidate) {
                invalidSkipped += 1;
                continue;
            }
            if (seenHashes.has(candidate.contentSha256)) {
                duplicatesSkipped += 1;
                continue;
            }
            seenHashes.add(candidate.contentSha256);
            candidates.push(candidate);
        }
    }

    const classCounts = Object.fromEntries(
        REQUIRED_DEFECT_CLASSES
            .map(defectClass => [
                defectClass,
                candidates.filter(candidate => candidate.defectClass === defectClass).length
            ])
            .filter(([, count]) => count > 0)
    );

    return { candidates, classCounts, duplicatesSkipped, invalidSkipped };
};

const buildVisionHumanReviewPacket = ({
    outputRoot,
    sources = [],
    approvedClassCounts = {},
    minimumSamples = 20,
    minimumSamplesPerClass = 2
}) => {
    if (!outputRoot) throw new Error('outputRoot is required');
    if (fs.existsSync(outputRoot) && fs.readdirSync(outputRoot).length > 0) {
        throw new Error(`output directory must be empty: ${outputRoot}`);
    }

    const grouped = {
        knowledgeCard: {},
        productReview: {},
        missingClass: {},
        webCase: {}
    };
    const roots = new Map();
    for (const source of sources) {
        if (source.kind === 'knowledge-card') grouped.knowledgeCard = source.manifest || {};
        if (source.kind === 'product-review') grouped.productReview = source.manifest || {};
        if (source.kind === 'missing-class') grouped.missingClass = source.manifest || {};
        if (source.kind === 'web-case') grouped.webCase = source.manifest || {};
        roots.set(source.kind, path.resolve(source.rootPath));
    }

    const collected = collectReviewCandidates(grouped);
    const copied = [];
    fs.mkdirSync(outputRoot, { recursive: true });
    try {
        for (const candidate of collected.candidates) {
            const sourceRoot = roots.get(candidate.sourceKind);
            if (!sourceRoot) throw new Error(`missing source root: ${candidate.sourceKind}`);
            const sourcePath = path.resolve(sourceRoot, candidate.sourceRelativePath);
            const relativeFromRoot = path.relative(sourceRoot, sourcePath);
            if (relativeFromRoot.startsWith('..') || path.isAbsolute(relativeFromRoot)) {
                throw new Error(`source path escapes root: ${candidate.sourceRelativePath}`);
            }
            const bytes = fs.readFileSync(sourcePath);
            const actualHash = sha256(bytes);
            if (actualHash !== candidate.contentSha256) {
                throw new Error(
                    `hash mismatch for ${candidate.sourceRelativePath}: `
                    + `${candidate.contentSha256} != ${actualHash}`
                );
            }
            const destination = path.join(outputRoot, candidate.relativePath);
            fs.mkdirSync(path.dirname(destination), { recursive: true });
            fs.copyFileSync(sourcePath, destination);
            copied.push(destination);
        }

        const cleanCounts = Object.fromEntries(
            REQUIRED_DEFECT_CLASSES.map(defectClass => [
                defectClass,
                Math.max(0, Number(approvedClassCounts[defectClass]) || 0)
            ])
        );
        const currentCleanApproved = Object.values(cleanCounts).reduce((sum, count) => sum + count, 0);
        const sourceCounts = Object.fromEntries(
            [...new Set(collected.candidates.map(candidate => candidate.sourceKind))]
                .sort()
                .map(sourceKind => [
                    sourceKind,
                    collected.candidates.filter(candidate => candidate.sourceKind === sourceKind).length
                ])
        );
        const minimumClassApprovalsRequired = Object.fromEntries(
            REQUIRED_DEFECT_CLASSES.map(defectClass => [
                defectClass,
                Math.max(0, minimumSamplesPerClass - cleanCounts[defectClass])
            ])
        );
        const manifest = {
            schemaVersion: 1,
            generatedAt: new Date().toISOString(),
            policy: {
                persistence: 'none',
                approval: 'human_required',
                graphPromotion: 'disabled_until_common_agent_approval',
                hashVerification: 'sha256'
            },
            gate: {
                requiredDefectClasses: REQUIRED_DEFECT_CLASSES,
                minimumSamples,
                minimumSamplesPerClass
            },
            summary: {
                candidates: collected.candidates.length,
                copied: copied.length,
                duplicatesSkipped: collected.duplicatesSkipped,
                invalidSkipped: collected.invalidSkipped,
                classCounts: collected.classCounts,
                sourceCounts,
                currentCleanApproved,
                additionalCleanApprovalsRequired: Math.max(0, minimumSamples - currentCleanApproved),
                minimumClassApprovalsRequired
            },
            candidates: collected.candidates.map(({
                sourceRelativePath,
                sourceKind,
                ...candidate
            }) => ({
                ...candidate,
                sourceLineage: {
                    ...candidate.sourceLineage,
                    packetSourceKind: sourceKind,
                    packetSourceRelativePath: sourceRelativePath
                }
            }))
        };
        const manifestPath = path.join(outputRoot, 'vision-candidates.json');
        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
        return { outputRoot: path.resolve(outputRoot), manifestPath, manifest };
    } catch (error) {
        for (const destination of copied.reverse()) {
            try {
                fs.rmSync(destination, { force: true });
            } catch {
                // Preserve the original error; partially copied files are non-authoritative.
            }
        }
        throw error;
    }
};

module.exports = {
    DEFECT_LABELS,
    REQUIRED_DEFECT_CLASSES,
    applyVisionAuditObservation,
    buildVisionHumanReviewPacket,
    collectReviewCandidates,
    rankVisionReviewCandidate,
    summarizeVisionAuditCandidates
};
