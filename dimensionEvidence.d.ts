import type { Shape } from './types';
import type { DimensionReviewStatus, DimensionUnit, MeasurementConfidence } from './dimensionMeasurement';

export interface DimensionEvidenceMeasurement {
  id: string;
  label: string;
  measuredValue: number;
  displayValue: number;
  unit: DimensionUnit;
  calibrationId: string;
  manualOverride: boolean;
  confidence: MeasurementConfidence;
  reviewStatus: DimensionReviewStatus;
  source: string;
  graphPromotionAllowed: boolean;
}

export interface DimensionEvidence {
  status: 'success' | 'warning';
  summary: string;
  next_actions: string[];
  artifacts: string[];
  measurementCount: number;
  approvedCount: number;
  rejectedCount: number;
  graphPromotionAllowed: boolean;
  measurements: DimensionEvidenceMeasurement[];
}

export function buildDimensionEvidence(shapes?: Shape[]): DimensionEvidence;
export function formatDimensionEvidenceForPrompt(evidence: DimensionEvidence): string;
export function formatDimensionEvidenceForReport(evidence: DimensionEvidence): string;
