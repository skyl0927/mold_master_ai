import type { Shape, TextAnnotation } from './types';
import type { DimensionCalibration, DimensionReviewStatus, DimensionUnit, Size } from './dimensionMeasurement';

export interface DimensionEditorDocument {
  shapes: Shape[];
  annotations: TextAnnotation[];
  dimensionCalibrations: DimensionCalibration[];
  activeDimensionCalibrationId?: string;
  coordinateSpaceVersion: 'image/v1';
}

export interface DimensionEditorHistory {
  past: DimensionEditorDocument[];
  present: DimensionEditorDocument;
  future: DimensionEditorDocument[];
}

export function initializeDimensionDocument(input: {
  shapes?: Shape[];
  annotations?: TextAnnotation[];
  dimensionCalibrations?: DimensionCalibration[];
  activeDimensionCalibrationId?: string;
  coordinateSpaceVersion?: 'image/v1';
  legacyCanvasSize?: Size;
  imageSize?: Size;
}): DimensionEditorDocument;
export function upsertCalibration(
  document: DimensionEditorDocument,
  calibration: {
    id?: string;
    start: { x: number; y: number };
    end: { x: number; y: number };
    knownLength: number;
    unit: DimensionUnit;
  },
  options?: { precision?: number; applyToAllDimensions?: boolean; preserveManualOverrides?: boolean }
): DimensionEditorDocument;
export function setActiveCalibration(document: DimensionEditorDocument, calibrationId: string): DimensionEditorDocument;
export function addMeasuredDimension(
  document: DimensionEditorDocument,
  shape: Shape,
  options?: { precision?: number }
): DimensionEditorDocument;
export function updateDimensionManualDisplay(
  document: DimensionEditorDocument,
  dimensionId: string,
  input: string
): DimensionEditorDocument;
export function setDimensionReviewStatus(
  document: DimensionEditorDocument,
  dimensionId: string,
  reviewStatus: DimensionReviewStatus
): DimensionEditorDocument;
export function createEditorHistory(initialDocument: DimensionEditorDocument): DimensionEditorHistory;
export function commitEditorHistory(history: DimensionEditorHistory, nextDocument: DimensionEditorDocument): DimensionEditorHistory;
export function undoEditorHistory(history: DimensionEditorHistory): DimensionEditorHistory;
export function redoEditorHistory(history: DimensionEditorHistory): DimensionEditorHistory;
