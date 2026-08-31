const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  createCaptureWorkspaceStore,
  summarizePersistedRecaptureWorkOrders
} = require('../captureWorkspaceStore');

const PNG_A = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB';
const PNG_B = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAAC';
const JPEG_A = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD';

const createImage = (overrides = {}) => ({
  id: 'capture-full',
  baseImageUrl: PNG_A,
  dataUrl: PNG_A,
  annotations: [],
  shapes: [],
  captureSessionId: 'recapture-session-flash',
  captureViewTag: 'full_part_context',
  captureImageKind: 'physical_product',
  captureSource: 'camera',
  recaptureSource: {
    workOrderId: 'pending-hitl-007',
    reviewDecisionId: 'pending-hitl-007',
    requiredViewTags: ['full_part_context', 'defect_closeup']
  },
  ...overrides
});

const withStore = async callback => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mold-master-capture-workspace-'));
  try {
    const store = createCaptureWorkspaceStore({
      rootDir: root,
      now: () => '2026-08-31T00:00:00.000Z'
    });
    await callback({ root, store });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
};

test('persists original pixels, rendered pixels, and recapture lineage across reload', async () => {
  await withStore(async ({ root, store }) => {
    store.saveImage(createImage({
      dataUrl: JPEG_A,
      annotations: [{ id: 'note-1', text: '결함 위치' }]
    }));

    const reloaded = createCaptureWorkspaceStore({ rootDir: root }).listImages();
    assert.equal(reloaded.length, 1);
    assert.equal(reloaded[0].id, 'capture-full');
    assert.equal(reloaded[0].baseImageUrl, PNG_A);
    assert.equal(reloaded[0].dataUrl, JPEG_A);
    assert.equal(reloaded[0].captureViewTag, 'full_part_context');
    assert.equal(reloaded[0].recaptureSource.workOrderId, 'pending-hitl-007');
    assert.deepEqual(reloaded[0].annotations, [{ id: 'note-1', text: '결함 위치' }]);

    const files = fs.readdirSync(root).sort();
    assert.ok(files.includes('manifest.json'));
    assert.equal(files.filter(file => /\.(?:png|jpg)$/.test(file)).length, 2);
  });
});

test('updates one capture atomically without duplicating stale image files', async () => {
  await withStore(async ({ root, store }) => {
    store.saveImage(createImage());
    store.saveImage(createImage({
      baseImageUrl: PNG_B,
      dataUrl: JPEG_A,
      captureViewTag: 'defect_closeup'
    }));

    const images = store.listImages();
    assert.equal(images.length, 1);
    assert.equal(images[0].baseImageUrl, PNG_B);
    assert.equal(images[0].dataUrl, JPEG_A);
    assert.equal(images[0].captureViewTag, 'defect_closeup');
    assert.equal(fs.readdirSync(root).filter(file => /\.(?:png|jpg)$/.test(file)).length, 2);
  });
});

test('summarizes persisted work-order completeness by required capture view', async () => {
  await withStore(async ({ store }) => {
    store.saveImage(createImage());
    let summary = summarizePersistedRecaptureWorkOrders(store.listImages());
    assert.equal(summary.length, 1);
    assert.equal(summary[0].workOrderId, 'pending-hitl-007');
    assert.equal(summary[0].ready, false);
    assert.deepEqual(summary[0].availableViews, ['full_part_context']);
    assert.deepEqual(summary[0].missingViews, ['defect_closeup']);

    store.saveImage(createImage({
      id: 'capture-close',
      captureViewTag: 'defect_closeup',
      dataUrl: PNG_B,
      baseImageUrl: PNG_B
    }));
    summary = summarizePersistedRecaptureWorkOrders(store.listImages());
    assert.equal(summary[0].ready, true);
    assert.deepEqual(summary[0].missingViews, []);
    assert.equal(summary[0].imageCount, 2);
  });
});

test('deletes only the requested capture and its persisted image files', async () => {
  await withStore(async ({ root, store }) => {
    store.saveImage(createImage());
    store.saveImage(createImage({ id: 'capture-close', captureViewTag: 'defect_closeup' }));

    assert.equal(store.deleteImage('capture-full'), true);
    assert.deepEqual(store.listImages().map(image => image.id), ['capture-close']);
    assert.equal(store.deleteImage('capture-missing'), false);
    assert.equal(fs.readdirSync(root).filter(file => /\.(?:png|jpg)$/.test(file)).length, 1);
  });
});

test('rejects malformed image payloads without writing a manifest record', async () => {
  await withStore(async ({ store }) => {
    assert.throws(
      () => store.saveImage(createImage({ dataUrl: 'not-a-data-url' })),
      /valid image data URL/
    );
    assert.deepEqual(store.listImages(), []);
  });
});
