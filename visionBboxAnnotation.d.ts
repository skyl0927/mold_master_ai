import { CapturedImage } from './types';
import { CommonAgentAnnotationRequest, NormalizedBbox } from './services/commonAgentApiService';

export function buildVisionBboxAnnotationPayloads(options: {
  image?: Partial<CapturedImage>;
  existingAnnotations?: Array<{ metadata?: Record<string, any> }>;
}): CommonAgentAnnotationRequest[];

export interface VisionBboxReviewPacket {
  protocolVersion: 'vision-bbox-hitl-review/v1';
  schema_version: 'vision-bbox-hitl-review/v1';
  sourceApp: 'mold-master-ai';
  reviewAction: string;
  reviewStatus: 'rejected' | 'needs_review';
  localImageId: string;
  commonAgentImageId: string;
  observationId: string;
  label: string;
  originalBbox: NormalizedBbox & { coordinate_system: 'normalized_xywh' };
  correctedBbox?: NormalizedBbox & { coordinate_system: 'normalized_xywh' };
  annotationRequest: CommonAgentAnnotationRequest;
  graphPromotionAllowed: false;
  learningSyncAllowed: false;
  requiresHumanReview: true;
}

export function buildVisionBboxReviewPacket(options: {
  image?: Partial<CapturedImage>;
  observationId?: string;
  reviewAction?: 'needs_review' | 'corrected_bbox' | 'rejected_bbox' | 'reject_bbox' | string;
  correctedBbox?: Partial<NormalizedBbox & {
    coordinateSystem?: 'normalized_xywh';
    coordinate_system?: 'normalized_xywh';
    confidence?: number;
  }>;
  reviewerNote?: string;
}): VisionBboxReviewPacket | null;
