const busboy = require('busboy');
const CLAIM_FIELDS = new Set(['persist_mode', 'user_id', 'workspace_id', 'project_id', 'role',
  'metadata_json', 'metadata', 'workspace', 'filters']);
const MAX_BODY_BYTES = 128 * 1024 * 1024;

// Inspect scalar claims without decoding, buffering or rewriting image files.
function readMultipartFields(body, headers) {
  return new Promise((resolve, reject) => {
    const invalid = () => new Error('Invalid, ambiguous or excessive Common Agent multipart body');
    if (!(body instanceof Uint8Array) || body.byteLength > MAX_BODY_BYTES) return reject(invalid());
    let parser;
    try {
      parser = busboy({ headers: { 'content-type': headers.get('content-type') || '' },
        defParamCharset: 'utf8', limits: { fieldNameSize: 100, fieldSize: 65536,
          fields: 64, files: 128, parts: 193, fileSize: MAX_BODY_BYTES, headerPairs: 200 } });
    } catch { return reject(invalid()); }
    const fields = new Map();
    const fileNames = new Set();
    let problem;
    const fail = () => { problem = invalid(); };
    parser.on('field', (name, value, info) => {
      if (info.nameTruncated || info.valueTruncated || Buffer.byteLength(name) > 100
          || fields.has(name) || fileNames.has(name)) return fail();
      fields.set(name, value);
    });
    parser.on('file', (name, stream, info) => {
      if (CLAIM_FIELDS.has(name) || fields.has(name) || Buffer.byteLength(name) > 100
          || !['7bit', '8bit', 'binary'].includes(info.encoding)) fail();
      fileNames.add(name);
      stream.on('limit', fail);
      stream.on('error', fail);
      stream.resume();
    });
    for (const event of ['fieldsLimit', 'filesLimit', 'partsLimit']) parser.on(event, fail);
    parser.once('error', () => reject(invalid()));
    parser.once('close', () => problem ? reject(problem) : resolve(fields));
    parser.end(Buffer.from(body.buffer, body.byteOffset, body.byteLength));
  });
}

module.exports = { readMultipartFields };
