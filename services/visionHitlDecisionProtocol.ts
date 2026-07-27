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

export const isVisionGraphPromotionBlocked = (summary?: VisionObservationSummary): boolean =>
    Boolean(
        summary?.safetyGate
        && (
            summary.safetyGate.status === 'blocked'
            || summary.safetyGate.candidateUsePolicy === 'do_not_use_vision_candidate'
            || summary.decisionStatus === 'unclassifiable'
        )
    );

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
