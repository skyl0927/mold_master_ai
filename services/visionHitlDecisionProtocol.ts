import type { LearningScope } from '../types';

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
