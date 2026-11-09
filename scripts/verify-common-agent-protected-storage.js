// Native crypto probe only: no BrowserWindow, operating dataset or API requests.
const { app, safeStorage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createCredentialVault } = require('../commonAgentSecureGateway');

const root = process.env.MOLD_MASTER_AUTH_PROBE_ROOT;
if (!root || !path.isAbsolute(root) || !root.endsWith('native-os-probe')) throw new Error('Explicit owned probe directory required');
fs.mkdirSync(root, { recursive: true });
app.setPath('userData', root);
app.whenReady().then(() => {
  const filePath = path.join(root, 'test-only-credential.enc');
  const token = `ca_service_v1.${'a'.repeat(32)}.${'b'.repeat(64)}`;
  const vault = createCredentialVault({ filePath, safeStorage });
  const grant = { base_url: 'http://127.0.0.1:1', token,
    actor_id: `service-${'c'.repeat(32)}`, workspace_id: 'test-only', project_id: 'test-only',
    status: 'active', scopes: ['vision:read'], expires_at: new Date(Date.now() + 600000).toISOString() };
  const view = vault.install(grant);
  assert.equal(view.configured, true);
  assert.equal(fs.readFileSync(filePath).includes(Buffer.from(token)), false);
  assert.equal(vault.read().token, token);
  assert.equal(JSON.stringify(view).includes(token), false);
  fs.unlinkSync(filePath);
  console.log(JSON.stringify({ status: 'pass', platform: process.platform, protected_storage_available: true,
    raw_key_returned: false, credential_file_removed: true, api_requests: 0, eligible_for_learning: false }));
  app.exit(0);
}).catch(() => {
  console.error('Native protected storage probe failed; no plaintext fallback used.');
  app.exit(1);
});
