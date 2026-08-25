export interface LatestOperationalStatusBundleResult {
  status: 'success' | 'warning';
  summary: string;
  next_actions: string[];
  artifacts: string[];
  bundle: Record<string, any> | null;
  sourcePath: string | null;
  readOnly: true;
  rejectedCandidates: number;
}

export function loadLatestOperationalStatusBundle(options?: {
  roots?: string[];
  maxBytes?: number;
}): LatestOperationalStatusBundleResult;

export function shouldAdoptOperationalStatusBundle(
  current: Record<string, any> | null | undefined,
  candidate: Record<string, any> | null | undefined
): boolean;
