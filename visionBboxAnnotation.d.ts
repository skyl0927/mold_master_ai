import { CapturedImage } from './types';
import { CommonAgentAnnotationRequest } from './services/commonAgentApiService';

export function buildVisionBboxAnnotationPayloads(options: {
  image?: Partial<CapturedImage>;
  existingAnnotations?: Array<{ metadata?: Record<string, any> }>;
}): CommonAgentAnnotationRequest[];
