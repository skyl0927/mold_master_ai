import type { Point, Shape } from './types';

export const ANGLE_UNIT: 'deg';
export function measureAngleDegrees(firstEnd: Point, vertex: Point, secondEnd: Point): number;
export function formatAngleMeasurement(value: number, precision?: number): string;
export function parseAngleDisplayInput(input: string): { value: number } | null;
export function createAngleMeasurement(shape: Shape, options?: { precision?: number }): Shape;
export function updateAngleManualDisplay(shape: Shape, input: string): Shape;
export function moveAngleMeasurement(shape: Shape, delta: Point, part?: 'body' | 'label'): Shape;
export function getAngleLabelPoint(shape: Shape): Point;
