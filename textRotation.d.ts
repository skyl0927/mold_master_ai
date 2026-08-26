import type { Point, Shape, TextAnnotation } from './types';

export function normalizeTextRotationDegrees(value: number): number;
export function textRotationRadiansFromDegrees(degrees: number): number;
export function textRotationDegreesFromRadians(radians: number): number;
export function applyTextRotation<T extends Shape | TextAnnotation>(item: T, degrees: number): T;
export function rotatePointAround(point: Point, center: Point, radians: number): Point;
