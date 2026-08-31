import type { CapturedImage } from './types';

export function isCaptureWorkspaceHydrated(
  restoredImageIds: string[],
  currentImages: Array<Partial<CapturedImage>>
): boolean;
