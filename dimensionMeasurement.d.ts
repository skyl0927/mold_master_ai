import type {
  DimensionCalibration,
  DimensionReviewStatus,
  DimensionUnit,
  MeasurementConfidence,
  Point,
  Shape,
  TextAnnotation
} from './types';

export type { DimensionCalibration, DimensionReviewStatus, DimensionUnit, MeasurementConfidence } from './types';

export interface Size {
  width: number;
  height: number;
}

export const IMAGE_COORDINATE_SPACE: 'image/v1';
export const SUPPORTED_UNITS: readonly DimensionUnit[];
export function distanceBetween(start: Point, end: Point): number;
export function createCalibration(options: {
  id?: string;
  start: Point;
  end: Point;
  knownLength: number;
  unit?: DimensionUnit;
  planeLabel?: string;
  createdAt?: string;
}): DimensionCalibration;
export function convertMeasurement(value: number, fromUnit: DimensionUnit, toUnit: DimensionUnit): number;
export function formatMeasurement(value: number, unit: DimensionUnit | 'px', precision?: number): string;
export function applyCalibrationToDimension(
  shape: Shape,
  calibration: DimensionCalibration,
  options?: { precision?: number }
): Shape;
export function snapPointToAxes(start: Point, end: Point, toleranceDegrees?: number): {
  point: Point;
  snapped: boolean;
  axis: 'horizontal' | 'vertical' | null;
};
export function canvasPointToImage(point: Point, canvasSize: Size, imageSize: Size): Point;
export function imagePointToCanvas(point: Point, canvasSize: Size, imageSize: Size): Point;
export function migrateLegacyShape(shape: Shape, options: {
  legacyCanvasSize: Size;
  imageSize: Size;
}): Shape;
export function migrateLegacyAnnotation(annotation: TextAnnotation, options: {
  legacyCanvasSize: Size;
  imageSize: Size;
}): TextAnnotation;
export function moveDimension(shape: Shape, delta: Point, part?: 'body' | 'label'): Shape;
export function parseDimensionDisplayInput(input: string, defaultUnit?: DimensionUnit): {
  value: number;
  unit: DimensionUnit;
} | null;
export function recalculateDimensions(
  shapes: Shape[],
  calibration: DimensionCalibration,
  options?: { precision?: number; preserveManualOverrides?: boolean }
): Shape[];
