export const REQUIRED_DEFECT_CLASSES: readonly string[];
export const DEFECT_CLASS_ALIASES: ReadonlyArray<readonly [string, readonly string[]]>;
export const DEFECT_CLASS_LABELS: Readonly<Record<string, string>>;
export function canonicalDefectClass(value?: unknown): string;
export function isClassifiableDefectLabel(value?: unknown): boolean;
export function normalizeDefectValue(value?: unknown): string;
