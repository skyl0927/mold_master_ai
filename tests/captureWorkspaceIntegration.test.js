const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('main process owns capture workspace persistence IPC', () => {
  const source = read('main.js');
  assert.match(source, /createCaptureWorkspaceStore/);
  assert.match(source, /ipcMain\.handle\('SAVE_CAPTURE_WORKSPACE_IMAGE'/);
  assert.match(source, /ipcMain\.handle\('LIST_CAPTURE_WORKSPACE_IMAGES'/);
  assert.match(source, /ipcMain\.handle\('DELETE_CAPTURE_WORKSPACE_IMAGE'/);
  assert.match(source, /ipcMain\.handle\('GET_CAPTURE_WORKSPACE_STATUS'/);
});

test('preload, renderer type contract, and web fallback expose the same workspace API', () => {
  const preload = read('preload.js');
  const types = read('types.ts');
  const webFallback = read('index.tsx');
  for (const method of [
    'saveCaptureWorkspaceImage',
    'listCaptureWorkspaceImages',
    'deleteCaptureWorkspaceImage',
    'getCaptureWorkspaceStatus'
  ]) {
    assert.match(preload, new RegExp(`${method}:`));
    assert.match(types, new RegExp(`${method}:`));
    assert.match(webFallback, new RegExp(`${method}:`));
  }
});

test('renderer restores, updates, and deletes durable captures', () => {
  const source = read('App.tsx');
  assert.match(source, /listCaptureWorkspaceImages\(/);
  assert.match(source, /saveCaptureWorkspaceImage\(/);
  assert.match(source, /deleteCaptureWorkspaceImage\(/);
  assert.match(source, /findResumableRecaptureSession/);
});

test('packaged Electron runtime includes the capture workspace store', () => {
  const packageJson = require('../package.json');
  assert.ok(
    packageJson.build.files.includes('captureWorkspaceStore.js'),
    'captureWorkspaceStore.js must be included in the packaged runtime'
  );
});
