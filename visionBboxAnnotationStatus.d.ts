import { VisionObservationSummary } from './types';

export interface VisionBboxAnnotationStatusSummary {
  contractVersion: 'vision-bbox-annotation-status/v1';
  status: 'none' | 'not_synced' | 'partially_synced' | 'pending_review' | 'approved' | 'rejected';
  totalVisionBboxes: number;
  synced: number;
  missing: number;
  candidate: number;
  approved: number;
  rejected: number;
  needsReview: number;
  reviewComplete: boolean;
  learningReadyCandidate: boolean;
  graphPromotionAllowed: false;
  pendingObservationIds: string[];
  approvedObservationIds: string[];
  rejectedObservationIds: string[];
  needsReviewObservationIds: string[];
  missingObservationIds: string[];
}

export function summarizeVisionBboxAnnotationStatus(options: {
  visionSummary?: Partial<VisionObservationSummary>;
  annotations?: Array<{ review_status?: string; metadata?: Record<string, any> }>;
}): VisionBboxAnnotationStatusSummary;
