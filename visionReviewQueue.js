const {
    DEFECT_CLASS_LABELS,
    canonicalDefectClass
} = require('./shared/defect-taxonomy');
const { matchingDatasetItems } = require('./localVisionApproval');

const REVIEW_BUCKET_RANK = Object.freeze({
    agreement_high_confidence: 0,
    agreement_low_confidence: 1,
    heuristic_agreement: 2,
    class_conflict: 3,
    unclassifiable: 4,
    pending_audit: 5
});

const buildVisionReviewQueue = ({
    candidates = [],
    labelsByCandidateId = {},
    datasetItems = [],
    defectClassCoverage = [],
    onlyNeedsCoverage = false
}) => {
    const coverageByClass = new Map(
        defectClassCoverage.map(item => [item.defectClass, item])
    );
    const decorated = candidates.map(candidate => {
        const defectType = String(
            labelsByCandidateId[candidate.candidateId]
            || candidate.proposedDefectType
            || ''
        ).trim();
        const defectClass = canonicalDefectClass(defectType);
        const coverage = coverageByClass.get(defectClass);
        const matchingItems = matchingDatasetItems(datasetItems, candidate.contentSha256);
        const approvedMatch = matchingItems.find(item =>
            item.review_status === 'approved'
            && canonicalDefectClass(item.defect_type) === defectClass
        );
        const existingItem = approvedMatch || matchingItems.find(item =>
            item.review_status !== 'rejected'
        ) || matchingItems[0];
        const isAlreadyApproved = Boolean(approvedMatch);
        const isRegistered = Boolean(candidate.alreadyRegistered || existingItem);
        const coverageMissing = Number(coverage?.missing || 0);
        const needsCoverage = Boolean(
            DEFECT_CLASS_LABELS[defectClass]
            && coverageMissing > 0
            && !isAlreadyApproved
        );
        const decisionRank = candidate.reviewDecision?.decision === 'excluded'
            ? 2
            : candidate.reviewDecision?.decision === 'deferred'
                ? 1
                : 0;

        return {
            candidate,
            defectType,
            defectClass,
            defectClassLabel: DEFECT_CLASS_LABELS[defectClass] || '',
            coverageMissing,
            needsCoverage,
            isRegistered,
            isAlreadyApproved,
            existingReviewStatus: existingItem?.review_status || '',
            decisionRank,
            bucketRank: REVIEW_BUCKET_RANK[candidate.reviewBucket] ?? 6
        };
    });

    return decorated
        .filter(item => !onlyNeedsCoverage || item.needsCoverage)
        .sort((left, right) => {
            const decisionOrder = left.decisionRank - right.decisionRank;
            if (decisionOrder !== 0) return decisionOrder;
            const coverageOrder = Number(right.needsCoverage) - Number(left.needsCoverage);
            if (coverageOrder !== 0) return coverageOrder;
            const approvedOrder = Number(left.isAlreadyApproved) - Number(right.isAlreadyApproved);
            if (approvedOrder !== 0) return approvedOrder;
            const warningOrder = Number(left.candidate.likelyNonManufacturing)
                - Number(right.candidate.likelyNonManufacturing);
            if (warningOrder !== 0) return warningOrder;
            const bucketOrder = left.bucketRank - right.bucketRank;
            if (bucketOrder !== 0) return bucketOrder;
            const registrationOrder = Number(right.isRegistered) - Number(left.isRegistered);
            if (registrationOrder !== 0) return registrationOrder;
            const priorityOrder = (left.candidate.reviewPriority || 99)
                - (right.candidate.reviewPriority || 99);
            if (priorityOrder !== 0) return priorityOrder;
            const missingOrder = right.coverageMissing - left.coverageMissing;
            if (missingOrder !== 0) return missingOrder;
            return String(right.candidate.modifiedAt || '').localeCompare(
                String(left.candidate.modifiedAt || '')
            );
        });
};

module.exports = {
    REVIEW_BUCKET_RANK,
    buildVisionReviewQueue
};
