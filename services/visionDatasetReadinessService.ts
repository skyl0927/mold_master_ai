import {
    REQUIRED_DEFECT_CLASSES,
    canonicalDefectClass
} from '../shared/defect-taxonomy';

export interface VisionDatasetItem {
    image_id: string;
    file_name?: string;
    defect_type?: string;
    observation?: {
        summary?: string;
        visible_features?: string[];
        possible_causes?: string[];
        recommended_checks?: string[];
    };
    question?: string;
    answer?: string;
    process_area?: string;
    severity?: string;
    labels?: string[];
    review_status?: string;
    metadata?: Record<string, any>;
    created_at?: string;
}

export interface VisionDatasetConflict {
    contentSha256: string;
    imageIds: string[];
    labels: string[];
}

export interface VisionDatasetReadiness {
    total: number;
    approved: number;
    needsReview: number;
    candidate: number;
    rejected: number;
    cleanApproved: number;
    missingHashApproved: number;
    missingLabelApproved: number;
    conflictGroups: VisionDatasetConflict[];
    conflictedRecords: number;
    duplicateRecords: number;
    additionalCleanImagesRequired: number;
    sampleGateReady: boolean;
    classCoverageReady: boolean;
    retirementDataReady: boolean;
    observedDefectClasses: number;
    coveredDefectClasses: number;
    unmappedCleanApproved: number;
    defectClassCoverage: Array<{
        defectClass: string;
        count: number;
        required: number;
        missing: number;
        covered: boolean;
    }>;
    defectTypeCounts: Array<{ defectType: string; count: number }>;
}

const normalizeLabel = (value?: string): string =>
    (value || '').toLocaleLowerCase().replace(/[\s()[\]{}_\-.,:;/'"]/g, '');

const getContentHash = (item: VisionDatasetItem): string =>
    String(item.metadata?.content_sha256 || '').trim().toLocaleLowerCase();

export const calculateVisionDatasetReadiness = (
    items: VisionDatasetItem[],
    minimumSamples = 20,
    minimumSamplesPerClass = 2
): VisionDatasetReadiness => {
    const approvedItems = items.filter(item => item.review_status === 'approved');
    const hashGroups = new Map<string, VisionDatasetItem[]>();

    approvedItems.forEach(item => {
        const hash = getContentHash(item);
        if (!hash) return;
        const group = hashGroups.get(hash) || [];
        group.push(item);
        hashGroups.set(hash, group);
    });

    const conflictGroups = Array.from(hashGroups.entries())
        .map(([contentSha256, group]) => {
            const labels = Array.from(new Set(
                group.map(item => item.defect_type || '').filter(Boolean)
            ));
            const normalizedLabels = new Set(labels.map(normalizeLabel).filter(Boolean));
            if (normalizedLabels.size <= 1) return null;
            return {
                contentSha256,
                imageIds: group.map(item => item.image_id),
                labels
            };
        })
        .filter((group): group is VisionDatasetConflict => Boolean(group));

    const conflictedIds = new Set(conflictGroups.flatMap(group => group.imageIds));
    const cleanByHash = new Map<string, VisionDatasetItem>();
    let duplicateRecords = 0;
    approvedItems.forEach(item => {
        const hash = getContentHash(item);
        if (
            !hash
            || !normalizeLabel(item.defect_type)
            || conflictedIds.has(item.image_id)
        ) {
            return;
        }
        if (cleanByHash.has(hash)) {
            duplicateRecords += 1;
            return;
        }
        cleanByHash.set(hash, item);
    });
    const cleanItems = Array.from(cleanByHash.values());
    const defectCounts = new Map<string, number>();
    cleanItems.forEach(item => {
        const label = item.defect_type || '';
        defectCounts.set(label, (defectCounts.get(label) || 0) + 1);
    });

    const classCounts = new Map<string, number>();
    cleanItems.forEach(item => {
        const defectClass = canonicalDefectClass(item.defect_type);
        if (!REQUIRED_DEFECT_CLASSES.includes(defectClass)) return;
        classCounts.set(defectClass, (classCounts.get(defectClass) || 0) + 1);
    });
    const defectClassCoverage = REQUIRED_DEFECT_CLASSES.map(defectClass => {
        const count = classCounts.get(defectClass) || 0;
        return {
            defectClass,
            count,
            required: minimumSamplesPerClass,
            missing: Math.max(0, minimumSamplesPerClass - count),
            covered: count >= minimumSamplesPerClass
        };
    });
    const cleanApproved = cleanItems.length;
    const sampleGateReady = cleanApproved >= minimumSamples && conflictGroups.length === 0;
    const classCoverageReady = defectClassCoverage.every(item => item.covered);
    return {
        total: items.length,
        approved: approvedItems.length,
        needsReview: items.filter(item => item.review_status === 'needs_review').length,
        candidate: items.filter(item => item.review_status === 'candidate').length,
        rejected: items.filter(item => item.review_status === 'rejected').length,
        cleanApproved,
        missingHashApproved: approvedItems.filter(item => !getContentHash(item)).length,
        missingLabelApproved: approvedItems.filter(item => !normalizeLabel(item.defect_type)).length,
        conflictGroups,
        conflictedRecords: conflictedIds.size,
        duplicateRecords,
        additionalCleanImagesRequired: Math.max(0, minimumSamples - cleanApproved),
        sampleGateReady,
        classCoverageReady,
        retirementDataReady: sampleGateReady && classCoverageReady,
        observedDefectClasses: defectClassCoverage.filter(item => item.count > 0).length,
        coveredDefectClasses: defectClassCoverage.filter(item => item.covered).length,
        unmappedCleanApproved: cleanItems.filter(item =>
            !REQUIRED_DEFECT_CLASSES.includes(canonicalDefectClass(item.defect_type))
        ).length,
        defectClassCoverage,
        defectTypeCounts: Array.from(defectCounts.entries())
            .map(([defectType, count]) => ({ defectType, count }))
            .sort((left, right) => right.count - left.count || left.defectType.localeCompare(right.defectType))
    };
};
