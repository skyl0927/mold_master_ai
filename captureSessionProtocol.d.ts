import type {
  CaptureImageKind,
  CaptureSource,
  CaptureViewTag,
  CapturedImage
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
