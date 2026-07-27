import type { DefectAnalysis, LearningScope, VisionObservationSummary } from '../types';

export type VisionHitlDecision =
    | 'approved'
    | 'corrected'
    | 'rejected'
    | 'recapture'
    | 'pending';

export interface VisionHitlDecisionResolution {
    apiDecision: 'approve' | 'edit' | 'reject' | 'recapture' | 'needs_review';
    localStatus: 'approved' | 'pending' | 'rejected';
    promoteToGraph: boolean;
    localLearningVerified: boolean;
    knowledgeScope: LearningScope;
    successMessage: string;
}

const RESOLUTIONS: Record<VisionHitlDecision, VisionHitlDecisionResolution> = {
    approved: {
        apiDecision: 'approve',
        localStatus: 'approved',
        promoteToGraph: true,
        localLearningVerified: true,
        knowledgeScope: 'diagnostic',
        successMessage: 'Common Agent 검토 승인 및 Graph 등록 완료!'
    },
    corrected: {
        apiDecision: 'edit',
        localStatus: 'pending',
        promoteToGraph: false,
        localLearningVerified: false,
        knowledgeScope: 'review_event',
        successMessage: '교정본을 새 버전으로 저장하고 재평가 대기열에 등록했습니다.'
    },
    rejected: {
        apiDecision: 'reject',
        localStatus: 'rejected',
        promoteToGraph: false,
        localLearningVerified: false,
        knowledgeScope: 'review_event',
        successMessage: '진단을 반려하고 학습 대상에서 제외했습니다.'
    },
    recapture: {
        apiDecision: 'recapture',
        localStatus: 'pending',
        promoteToGraph: false,
        localLearningVerified: false,
        knowledgeScope: 'review_event',
        successMessage: '재촬영 요청을 저장하고 기존 이미지를 학습 차단했습니다.'
    },
    pending: {
        apiDecision: 'needs_review',
        localStatus: 'pending',
        promoteToGraph: false,
        localLearningVerified: false,
        knowledgeScope: 'review_event',
        successMessage: 'Common Agent 검토 요청 완료!'
    }
};

export const resolveVisionHitlDecision = (
    decision: VisionHitlDecision
): VisionHitlDecisionResolution => ({ ...RESOLUTIONS[decision] });

export interface VisionGraphPromotionGuard {
    allowed: boolean;
    message: string;
}

export type VisionHitlReviewNextAction =
    | 'promote_to_graph'
    | 'queue_re_evaluation'
    | 'request_recapture'
    | 'exclude_from_learning'
    | 'await_human_review';

export type VisionHitlReviewQueue =
    | 'none'
    | 'vision_candidate_recheck'
    | 'vision_recapture_required'
    | 'vision_rejected_archive'
    | 'vision_human_review_pending';

export interface VisionHitlReviewMetadata {
    vision_review_protocol_version: 'vision-hitl-review/v1';
    vision_review_decision: VisionHitlDecision;
    vision_review_api_decision: VisionHitlDecisionResolution['apiDecision'];
    vision_review_next_action: VisionHitlReviewNextAction;
    vision_review_re_evaluation_queue: VisionHitlReviewQueue;
    vision_review_requires_re_evaluation: boolean;
    vision_review_re_evaluation_reason: string;
    vision_graph_promotion_allowed: boolean;
    vision_graph_promotion_blocked: boolean;
    vision_graph_promotion_block_reason: string;
    vision_learning_candidate_eligible: boolean;
    vision_local_learning_verified: boolean;
    vision_knowledge_scope: LearningScope;
    vision_safety_gate_status: string;
    vision_candidate_use_policy: string;
    vision_decision_status: string;
    vision_decision_reason: string;
    vision_quality_status: string;
    vision_quality_concerns: string[];
    vision_required_additional_views: string[];
    vision_safety_gate_reasons: string[];
    vision_bbox_grounding_profile_id: string;
    vision_bbox_grounding_thresholds: {
        minConfidence: number;
        maxArea: number;
    } | null;
    vision_bbox_low_confidence_count: number;
    vision_bbox_overbroad_count: number;
    vision_bbox_weak_grounding_count: number;
}

const compact = (value: unknown): string => String(value || '').replace(/\s+/g, ' ').trim();

const stringList = (value: unknown): string[] => (Array.isArray(value) ? value : [])
    .map(compact)
    .filter(Boolean);

export const isVisionGraphPromotionBlocked = (summary?: VisionObservationSummary): boolean =>
    Boolean(
        summary?.safetyGate
        && (
            summary.safetyGate.status === 'blocked'
            || summary.safetyGate.candidateUsePolicy === 'do_not_use_vision_candidate'
            || summary.decisionStatus === 'unclassifiable'
        )
    );

const getVisionReviewRouting = (
    decision: VisionHitlDecision,
    graphPromotionAllowed: boolean
): {
    nextAction: VisionHitlReviewNextAction;
    queue: VisionHitlReviewQueue;
    requiresReEvaluation: boolean;
    reason: string;
} => {
    if (decision === 'approved' && graphPromotionAllowed) {
        return {
            nextAction: 'promote_to_graph',
            queue: 'none',
            requiresReEvaluation: false,
            reason: 'human_approved_graph_promotion'
        };
    }
    if (decision === 'corrected') {
        return {
            nextAction: 'queue_re_evaluation',
            queue: 'vision_candidate_recheck',
            requiresReEvaluation: true,
            reason: 'human_correction_pending_re_evaluation'
        };
    }
    if (decision === 'recapture') {
        return {
            nextAction: 'request_recapture',
            queue: 'vision_recapture_required',
            requiresReEvaluation: true,
            reason: 'human_recapture_requested'
        };
    }
    if (decision === 'rejected') {
        return {
            nextAction: 'exclude_from_learning',
            queue: 'vision_rejected_archive',
            requiresReEvaluation: false,
            reason: 'human_rejected'
        };
    }
    return {
        nextAction: 'await_human_review',
        queue: 'vision_human_review_pending',
        requiresReEvaluation: true,
        reason: graphPromotionAllowed
            ? 'human_review_requested'
            : 'vision_graph_promotion_blocked_pending_review'
    };
};

export const canPromoteVisionAnalysisToGraph = (
    analysis?: Partial<DefectAnalysis>
): VisionGraphPromotionGuard => {
    if (!isVisionGraphPromotionBlocked(analysis?.visionSummary)) {
        return {
            allowed: true,
            message: 'Graph 승격 가능'
        };
    }
    return {
        allowed: false,
        message: 'Vision 후보가 품질 반려 또는 판정 보류 상태입니다. 재촬영 또는 HITL 교정 확정 전에는 Graph 승격할 수 없습니다.'
    };
};

export const buildVisionHitlReviewMetadata = (
    analysis: Partial<DefectAnalysis> | undefined,
    decision: VisionHitlDecision
): VisionHitlReviewMetadata => {
    const resolution = resolveVisionHitlDecision(decision);
    const promotionGuard = canPromoteVisionAnalysisToGraph(analysis);
    const routing = getVisionReviewRouting(decision, promotionGuard.allowed);
    const summary = analysis?.visionSummary;
    const safetyGate = summary?.safetyGate;

    return {
        vision_review_protocol_version: 'vision-hitl-review/v1',
        vision_review_decision: decision,
        vision_review_api_decision: resolution.apiDecision,
        vision_review_next_action: routing.nextAction,
        vision_review_re_evaluation_queue: routing.queue,
        vision_review_requires_re_evaluation: routing.requiresReEvaluation,
        vision_review_re_evaluation_reason: routing.reason,
        vision_graph_promotion_allowed: promotionGuard.allowed,
        vision_graph_promotion_blocked: !promotionGuard.allowed,
        vision_graph_promotion_block_reason: promotionGuard.allowed ? '' : promotionGuard.message,
        vision_learning_candidate_eligible: resolution.promoteToGraph && promotionGuard.allowed,
        vision_local_learning_verified: resolution.localLearningVerified && promotionGuard.allowed,
        vision_knowledge_scope: resolution.knowledgeScope,
        vision_safety_gate_status: compact(safetyGate?.status),
        vision_candidate_use_policy: compact(safetyGate?.candidateUsePolicy),
        vision_decision_status: compact(summary?.decisionStatus),
        vision_decision_reason: compact(summary?.decisionReason),
        vision_quality_status: compact(summary?.qualityStatus),
        vision_quality_concerns: stringList(summary?.qualityConcerns),
        vision_required_additional_views: stringList(summary?.requiredAdditionalViews),
        vision_safety_gate_reasons: stringList(safetyGate?.reasons),
        vision_bbox_grounding_profile_id: compact(safetyGate?.bboxGroundingProfileId),
        vision_bbox_grounding_thresholds: safetyGate?.bboxGroundingThresholds
            ? {
                minConfidence: safetyGate.bboxGroundingThresholds.minConfidence,
                maxArea: safetyGate.bboxGroundingThresholds.maxArea
            }
            : null,
        vision_bbox_low_confidence_count: Number(safetyGate?.lowRegionBboxConfidenceCount) || 0,
        vision_bbox_overbroad_count: Number(safetyGate?.overbroadRegionBboxCount) || 0,
        vision_bbox_weak_grounding_count: Number(safetyGate?.weakPixelGroundingCount) || 0
    };
};
