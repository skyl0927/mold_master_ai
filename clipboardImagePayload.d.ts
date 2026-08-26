export interface ClipboardPngPayload {
  dataUrl: string;
  mimeType: 'image/png';
  payloadByteLength: number;
}

export function parseClipboardPngDataUrl(dataUrl: string): ClipboardPngPayload;
