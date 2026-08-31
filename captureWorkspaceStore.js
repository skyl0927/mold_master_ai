const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const MANIFEST_VERSION = 1;
const SUPPORTED_IMAGE_TYPES = new Map([
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/jpg', 'jpg'],
  ['image/webp', 'webp']
]);

const parseImageDataUrl = value => {
  const match = /^data:(image\/(?:png|jpe?g|webp));base64,([a-z0-9+/=\r\n]+)$/i.exec(
    String(value || '')
  );
  if (!match || !SUPPORTED_IMAGE_TYPES.has(match[1].toLocaleLowerCase())) {
    throw new Error('capture workspace requires a valid image data URL');
  }
  return {
    mimeType: match[1].toLocaleLowerCase() === 'image/jpg'
      ? 'image/jpeg'
      : match[1].toLocaleLowerCase(),
    bytes: Buffer.from(match[2].replace(/\s+/g, ''), 'base64')
  };
};

const unique = values => Array.from(new Set((values || []).filter(Boolean)));

const summarizePersistedRecaptureWorkOrders = images => {
  const byWorkOrder = new Map();
  for (const image of images || []) {
    const source = image?.recaptureSource;
    const workOrderId = source?.workOrderId || source?.reviewDecisionId;
    if (!workOrderId) continue;
    const current = byWorkOrder.get(workOrderId) || {
      workOrderId,
      reviewDecisionId: source?.reviewDecisionId || null,
      captureSessionIds: [],
      requiredViews: [],
      availableViews: [],
      imageIds: []
    };
    current.captureSessionIds.push(image.captureSessionId);
    current.requiredViews.push(...(source.requiredViewTags || []));
    current.availableViews.push(image.captureViewTag);
    current.imageIds.push(image.id);
    byWorkOrder.set(workOrderId, current);
  }

  return [...byWorkOrder.values()].map(item => {
    const requiredViews = unique(item.requiredViews);
    const availableViews = unique(item.availableViews);
    const missingViews = requiredViews.filter(view => !availableViews.includes(view));
    return {
      workOrderId: item.workOrderId,
      reviewDecisionId: item.reviewDecisionId,
      captureSessionIds: unique(item.captureSessionIds),
      requiredViews,
      availableViews,
      missingViews,
      imageIds: unique(item.imageIds),
      imageCount: unique(item.imageIds).length,
      ready: requiredViews.length > 0 && missingViews.length === 0
    };
  });
};

const createCaptureWorkspaceStore = ({ rootDir, now = () => new Date().toISOString() }) => {
  if (!rootDir) throw new Error('capture workspace rootDir is required');
  const resolvedRoot = path.resolve(rootDir);
  const manifestPath = path.join(resolvedRoot, 'manifest.json');

  const ensureRoot = () => fs.mkdirSync(resolvedRoot, { recursive: true });

  const resolveOwnedFile = fileName => {
    const safeName = path.basename(String(fileName || ''));
    if (!safeName || safeName !== fileName) {
      throw new Error('capture workspace file name is invalid');
    }
    const resolved = path.resolve(resolvedRoot, safeName);
    if (path.dirname(resolved) !== resolvedRoot) {
      throw new Error('capture workspace file escaped the configured root');
    }
    return resolved;
  };

  const readManifest = () => {
    try {
      const value = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      if (value?.version !== MANIFEST_VERSION || !Array.isArray(value.images)) {
        return { version: MANIFEST_VERSION, images: [] };
      }
      return value;
    } catch {
      return { version: MANIFEST_VERSION, images: [] };
    }
  };

  const atomicWrite = (targetPath, contents) => {
    ensureRoot();
    const temporaryPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(temporaryPath, contents);
    try {
      fs.renameSync(temporaryPath, targetPath);
    } catch (error) {
      if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
      fs.renameSync(temporaryPath, targetPath);
      if (!fs.existsSync(targetPath)) throw error;
    }
  };

  const writeManifest = manifest => atomicWrite(
    manifestPath,
    `${JSON.stringify(manifest, null, 2)}\n`
  );

  const removeOwnedFiles = fileNames => {
    for (const fileName of unique(fileNames)) {
      const filePath = resolveOwnedFile(fileName);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
  };

  const encodeFile = ({ id, role, parsed }) => {
    const key = crypto.createHash('sha256').update(id).digest('hex').slice(0, 16);
    const contentKey = crypto.createHash('sha256').update(parsed.bytes).digest('hex').slice(0, 16);
    const extension = SUPPORTED_IMAGE_TYPES.get(parsed.mimeType) || 'png';
    return `${key}.${role}.${contentKey}.${extension}`;
  };

  const saveImage = image => {
    const id = String(image?.id || '').trim();
    if (!id) throw new Error('capture workspace image id is required');
    const base = parseImageDataUrl(image.baseImageUrl || image.dataUrl);
    const rendered = parseImageDataUrl(image.dataUrl || image.baseImageUrl);
    const identical = base.mimeType === rendered.mimeType && base.bytes.equals(rendered.bytes);
    const baseFile = encodeFile({ id, role: 'base', parsed: base });
    const renderedFile = identical
      ? baseFile
      : encodeFile({ id, role: 'rendered', parsed: rendered });
    const manifest = readManifest();
    const existing = manifest.images.find(item => item.id === id);
    const {
      dataUrl: _dataUrl,
      baseImageUrl: _baseImageUrl,
      id: _id,
      ...metadata
    } = image;
    const persistedAt = now();
    const record = {
      id,
      baseFile,
      baseMimeType: base.mimeType,
      renderedFile,
      renderedMimeType: rendered.mimeType,
      metadata: JSON.parse(JSON.stringify(metadata)),
      persistedAt
    };

    const basePath = resolveOwnedFile(baseFile);
    const renderedPath = resolveOwnedFile(renderedFile);
    atomicWrite(basePath, base.bytes);
    if (!identical) atomicWrite(renderedPath, rendered.bytes);

    const images = manifest.images.filter(item => item.id !== id);
    images.push(record);
    writeManifest({
      version: MANIFEST_VERSION,
      updatedAt: persistedAt,
      images
    });

    if (existing) {
      const staleFiles = [existing.baseFile, existing.renderedFile]
        .filter(fileName => fileName !== baseFile && fileName !== renderedFile);
      removeOwnedFiles(staleFiles);
    }
    return { id, persistedAt };
  };

  const listImages = () => readManifest().images.flatMap(record => {
    try {
      const baseBytes = fs.readFileSync(resolveOwnedFile(record.baseFile));
      const renderedBytes = record.renderedFile === record.baseFile
        ? baseBytes
        : fs.readFileSync(resolveOwnedFile(record.renderedFile));
      return [{
        ...(record.metadata || {}),
        id: record.id,
        baseImageUrl: `data:${record.baseMimeType};base64,${baseBytes.toString('base64')}`,
        dataUrl: `data:${record.renderedMimeType};base64,${renderedBytes.toString('base64')}`
      }];
    } catch {
      return [];
    }
  });

  const deleteImage = id => {
    const manifest = readManifest();
    const existing = manifest.images.find(item => item.id === id);
    if (!existing) return false;
    const images = manifest.images.filter(item => item.id !== id);
    writeManifest({
      version: MANIFEST_VERSION,
      updatedAt: now(),
      images
    });
    removeOwnedFiles([existing.baseFile, existing.renderedFile]);
    return true;
  };

  return {
    deleteImage,
    getManifestPath: () => manifestPath,
    listImages,
    saveImage,
    summarizeWorkOrders: () => summarizePersistedRecaptureWorkOrders(listImages())
  };
};

module.exports = {
  createCaptureWorkspaceStore,
  summarizePersistedRecaptureWorkOrders
};
