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
  diagnosisGroupId?: string;
  status: 'ready' | 'needs_views' | 'needs_metadata' | 'needs_group' | 'not_visually_verifiable';
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

export interface ResumableRecaptureSession {
  sessionId: string;
  recaptureSource: RecaptureSource;
  summary: CaptureSessionSummary;
}

export interface CaptureEvidenceMergePlan {
  protocolVersion: 'capture-evidence-merge/v1';
  canMerge: boolean;
  targetSessionId: string;
  targetDiagnosisGroupId: string;
  selectedCount: number;
  physicalImageCount: number;
  availableViews: CaptureViewTag[];
  requiredViews: CaptureViewTag[];
  missingViews: CaptureViewTag[];
  missingViewLabels: string[];
  readyAfterMerge: boolean;
  changedImageIds: string[];
  sourceSessionIds: string[];
  workOrderIds: string[];
  workOrderConflict: boolean;
  message: string;
}

export interface CaptureMetadata {
  capture_session_id?: string;
  diagnosis_group_id?: string;
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
  recapture_work_order_id?: string;
  recapture_safety_gate_reasons?: string[];
  recapture_required_additional_views?: string[];
  recapture_required_view_tags?: CaptureViewTag[];
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
  requiredViewTags: CaptureViewTag[];
  message: string;
}

export interface CaptureWorkOrderInput {
  workItemId?: string;
  queueId?: string;
  defectType?: string;
  defectClass?: string;
  actionType?: string;
  priority?: number;
  missingApprovedSamples?: number;
  recaptureSampleIds?: string[];
  requiredViews?: string[];
  captureInstructions?: Array<{
    view?: string;
    label?: string;
    instruction?: string;
  }>;
  reviewComment?: string;
}

export interface CaptureLearningEligibility {
  eligible: boolean;
  reason:
    | 'approved_capture_ready'
    | 'hitl_not_approved'
    | 'capture_protocol_not_ready'
    | 'recapture_guidance_view_mismatch'
    | 'recapture_guidance_missing_view_tag'
    | 'recapture_guidance_not_fulfilled'
    | `recapture_guidance_${string}`;
}

export const CAPTURE_VIEW_OPTIONS: CaptureViewOption[];
export const VALID_CAPTURE_SOURCES: Set<CaptureSource>;
export const VALID_IMAGE_KINDS: Set<CaptureImageKind>;

export function createCaptureSessionId(
  source?: string,
  now?: number,
  random?: () => number
): string;

export function createDiagnosisGroupId(
  source?: string,
  now?: number,
  random?: () => number
): string;

export function summarizeCaptureSession(
  images: Array<Partial<CapturedImage>>,
  sessionId?: string,
  recaptureSource?: Partial<RecaptureSource>,
  diagnosisGroupId?: string
): CaptureSessionSummary;

export function findResumableRecaptureSession(
  images: Array<Partial<CapturedImage>>
): ResumableRecaptureSession | null;

export function assessCaptureImageForDiagnosis(
  image: Partial<CapturedImage>,
  images: Array<Partial<CapturedImage>>
): CaptureSessionSummary;

export function buildCaptureEvidenceMergePlan(options?: {
  images?: Array<Partial<CapturedImage>>;
  selectedIds?: Iterable<string> | string[];
  targetSessionId?: string;
  targetDiagnosisGroupId?: string;
  fallbackSessionId?: string;
  recaptureSource?: Partial<RecaptureSource>;
}): CaptureEvidenceMergePlan;

export function buildCaptureMetadata(
  image: Partial<CapturedImage>,
  images: Array<Partial<CapturedImage>>
): CaptureMetadata;

export function buildRecaptureSourceFromReview(options?: {
  image?: Partial<CapturedImage>;
  analysis?: Partial<DefectAnalysis>;
  reviewDecisionId?: string;
  workOrderId?: string;
  requiredViewTags?: CaptureViewTag[];
}): RecaptureSource;

export function buildRecaptureSourceFromWorkOrder(
  workOrder?: CaptureWorkOrderInput
): RecaptureSource;

export function buildRecaptureCaptureGuidance(
  source?: Partial<RecaptureSource>
): RecaptureCaptureGuidance;

export function inferRecaptureViewTags(
  source?: Partial<RecaptureSource>
): CaptureViewTag[];

export function resolveCaptureLearningEligibility(
  reviewDecision: string,
  captureMetadata?: Partial<CaptureMetadata>
): CaptureLearningEligibility;

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
