export function loadImageUrls(
  items: Array<{ image_id: string }>,
  getUrl: (imageId: string) => Promise<string>
): Promise<{ urls: Record<string, string>; failures: string[] }>;

export function releaseImageUrls(
  urls: Record<string, string>,
  revoke?: (url: string) => void
): void;
