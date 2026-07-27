import type {
  CaptureImageKind,
  CaptureSource,
  CaptureViewTag,
  CapturedImage,
  DefectAnalysis
} from './types';

export interface CaptureViewOption {
  value: CaptureViewTag;
  label: string;
  instruction: string;
}

export interface CaptureSessionSummary {
  sessionId?: string;
  status: 'ready' | 'needs_views' | 'needs_metadata' | 'not_visually_verifiable';
  ready: boolean;
  imageCount: number;
  physicalImageCount: number;
  uniqueViewCount: number;
  availableViews: CaptureViewTag[];
  requiredViews: CaptureViewTag[];
  missingViews: CaptureViewTag[];
  missingViewLabels: string[];
  message: string;
}

export interface CaptureMetadata {
  capture_session_id?: string;
  capture_view_tags: CaptureViewTag[];
  vision_image_kind: CaptureImageKind;
  capture_source: CaptureSource;
  capture_protocol_ready: boolean;
  capture_available_views: CaptureViewTag[];
  capture_missing_views: CaptureViewTag[];
  recapture_lineage_protocol_version?: 'vision-recapture-lineage/v1';
  recapture_source_local_image_id?: string;
  recapture_source_common_agent_image_id?: string;
  recapture_review_decision_id?: string;
  recapture_safety_gate_reasons?: string[];
  recapture_required_additional_views?: string[];
  recapture_bbox_grounding_profile_id?: string;
  recapture_guidance_protocol_version?: 'vision-recapture-capture-guidance/v1';
  recapture_recommended_view_tag?: CaptureViewTag;
  recapture_guidance_message?: string;
  recapture_guidance_reason_codes?: string[];
  recapture_guidance_instructions?: string[];
  recapture_actual_view_tags?: CaptureViewTag[];
  recapture_guidance_fulfilled?: boolean;
  recapture_guidance_fulfillment_status?: 'fulfilled' | 'view_mismatch' | 'missing_view_tag';
  recapture_missing_recommended_view_tag?: CaptureViewTag;
}

export type RecaptureSource = NonNullable<CapturedImage['recaptureSource']>;

export interface RecaptureCaptureGuidance {
  protocolVersion: 'vision-recapture-capture-guidance/v1';
  active: boolean;
  recommendedViewTag: CaptureViewTag;
  reasonCodes: string[];
  instructions: string[];
  message: string;
}

export const CAPTURE_VIEW_OPTIONS: CaptureViewOption[];
export const VALID_CAPTURE_SOURCES: Set<CaptureSource>;
export const VALID_IMAGE_KINDS: Set<CaptureImageKind>;

export function createCaptureSessionId(
  source?: string,
  now?: number,
  random?: () => number
): string;

export function summarizeCaptureSession(
  images: Array<Partial<CapturedImage>>,
  sessionId?: string
): CaptureSessionSummary;

export function assessCaptureImageForDiagnosis(
  image: Partial<CapturedImage>,
  images: Array<Partial<CapturedImage>>
): CaptureSessionSummary;

export function buildCaptureMetadata(
  image: Partial<CapturedImage>,
  images: Array<Partial<CapturedImage>>
): CaptureMetadata;

export function buildRecaptureSourceFromReview(options?: {
  image?: Partial<CapturedImage>;
  analysis?: Partial<DefectAnalysis>;
  reviewDecisionId?: string;
}): RecaptureSource;

export function buildRecaptureCaptureGuidance(
  source?: Partial<RecaptureSource>
): RecaptureCaptureGuidance;

export function collectSessionDiagnosisImages<T extends Partial<CapturedImage>>(
  selectedImage: T,
  images: T[],
  maxViews?: number
): T[];

export function selectDiagnosisTargetIds(
  images: Array<Partial<CapturedImage>>,
  selectedIds: string[],
  busyIds?: string[]
): string[];
