import type { DimensionCalibration, DimensionUnit, Point } from './types';

export type OrderedQuad = [Point, Point, Point, Point];

export function solveHomography(sourceQuad: OrderedQuad, targetQuad: OrderedQuad): number[];
export function applyPerspectiveTransform(point: Point, homography: number[]): Point;
export function createPerspectiveCalibration(options: {
  id?: string;
  sourceQuad: OrderedQuad;
  knownWidth: number;
  knownHeight: number;
  unit?: DimensionUnit;
  planeLabel?: string;
  createdAt?: string;
}): DimensionCalibration;
export function measurePerspectiveDistance(start: Point, end: Point, calibration: DimensionCalibration): number;
export function translatePerspectiveCalibration(calibration: DimensionCalibration, delta: Point): DimensionCalibration;
