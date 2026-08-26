const PNG_DATA_URL_PREFIX = 'data:image/png;base64,';

function parseClipboardPngDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string') throw new TypeError('clipboard image data URL is required');
  if (!dataUrl.startsWith(PNG_DATA_URL_PREFIX)) {
    throw new TypeError('clipboard image must be a PNG data URL');
  }

  const payload = dataUrl.slice(PNG_DATA_URL_PREFIX.length);
  if (!payload) throw new RangeError('clipboard PNG payload is empty');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(payload)) {
    throw new TypeError('clipboard PNG payload must be valid base64');
  }

  const payloadByteLength = Buffer.from(payload, 'base64').length;
  if (payloadByteLength === 0) throw new RangeError('clipboard PNG payload is empty');
  return {
    dataUrl,
    mimeType: 'image/png',
    payloadByteLength
  };
}

module.exports = {
  parseClipboardPngDataUrl
};
