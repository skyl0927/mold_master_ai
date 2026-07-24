const { canonicalDefectClass } = require('./shared/defect-taxonomy');

const normalizeHash = value => String(value || '').trim().toLowerCase();

const matchingDatasetItems = (datasetItems, contentSha256) => {
    const expectedHash = normalizeHash(contentSha256);
    if (!expectedHash) return [];
    return (Array.isArray(datasetItems) ? datasetItems : []).filter(item =>
        normalizeHash(item?.metadata?.content_sha256) === expectedHash
    );
};

const resolveLocalCandidateApproval = ({
    candidate,
    datasetItems,
    defectType
}) => {
    const matches = matchingDatasetItems(datasetItems, candidate?.contentSha256);
    const requestedClass = canonicalDefectClass(defectType);
    const approvedMatches = matches.filter(item => item?.review_status === 'approved');
    const conflictingApproved = approvedMatches.find(item =>
        canonicalDefectClass(item?.defect_type) !== requestedClass
    );
    if (conflictingApproved) {
        throw new Error(
            `Conflicting approved label for identical image bytes: `
            + `${conflictingApproved.defect_type || 'unknown'}`
        );
    }

    const alreadyApproved = approvedMatches.find(item =>
        canonicalDefectClass(item?.defect_type) === requestedClass
    );
    if (alreadyApproved) {
        return {
            mode: 'already_approved',
            imageId: String(alreadyApproved.image_id),
            datasetItem: alreadyApproved
        };
    }

    const reviewable = matches.find(item =>
        item?.review_status !== 'rejected'
    ) || matches[0];
    if (reviewable) {
        return {
            mode: 'review_existing',
            imageId: String(reviewable.image_id),
            datasetItem: reviewable
        };
    }

    return {
        mode: 'register_then_review',
        imageId: undefined,
        datasetItem: undefined
    };
};

const compactObject = value => Object.fromEntries(
    Object.entries(value).filter(([, entry]) =>
        entry !== undefined && entry !== null && entry !== ''
    )
);

const buildLocalCandidateReviewRequest = ({
    candidate,
    datasetItem,
    defectType,
    fieldContext
}) => {
    const observation = datasetItem?.observation || {};
    const lineage = candidate?.sourceLineage || {};
    const evidence = candidate?.labelEvidence || {};
    const labels = Array.from(new Set([
        defectType,
        ...(Array.isArray(datasetItem?.labels) ? datasetItem.labels : [])
    ].map(value => String(value || '').trim()).filter(Boolean)));

    return {
        decision: 'approve',
        defectType,
        observationSummary: String(
            observation.summary
            || fieldContext
            || datasetItem?.question
            || defectType
        ).trim(),
        visibleFeatures: Array.isArray(observation.visible_features)
            ? observation.visible_features
            : [],
        possibleCauses: Array.isArray(observation.possible_causes)
            ? observation.possible_causes
            : [],
        recommendedChecks: Array.isArray(observation.recommended_checks)
            ? observation.recommended_checks
            : [],
        labels,
        processArea: datasetItem?.process_area || 'injection-molding',
        severity: datasetItem?.severity,
        question: datasetItem?.question || fieldContext,
        answer: datasetItem?.answer,
        comment: 'Mold Master AI local candidate human approval',
        promoteToGraph: true,
        metadata: compactObject({
            ...(datasetItem?.metadata || {}),
            content_sha256: normalizeHash(candidate?.contentSha256),
            reviewed_from: 'mold-master-ai-local-hitl',
            human_label_confirmed: true,
            source_candidate_id: candidate?.candidateId,
            source_file_name: candidate?.fileName,
            source_document_id: lineage.sourceDocumentId,
            source_document_title: lineage.documentTitle,
            source_knowledge_id: lineage.knowledgeId,
            source_review_session_id: lineage.reviewSessionId,
            source_proposed_defect_type: evidence.sourceLabel,
            vision_suggested_defect_type: evidence.visionSuggestedLabel,
            vision_suggestion_confidence: evidence.visionConfidence,
            vision_suggestion_non_persisting: evidence.nonPersisting !== false
        })
    };
};

module.exports = {
    buildLocalCandidateReviewRequest,
    matchingDatasetItems,
    resolveLocalCandidateApproval
};
