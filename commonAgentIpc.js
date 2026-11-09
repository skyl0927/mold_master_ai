const fs = require('node:fs');
const { normalizeCommonAgentBaseUrl } = require('./commonAgentTransport');
const { isTrustedCommonAgentSender } = require('./commonAgentSecureGateway');

function registerCommonAgentIpc({ ipcMain, getOwner, getWindow, expectedUrl, getBaseUrl, vault, gateway, dialog }) {
  const pending = new Map();
  let importing = false;
  function trusted(event) {
    if (!isTrustedCommonAgentSender(event, getOwner(), expectedUrl)) throw new Error('Untrusted Common Agent request frame');
  }
  ipcMain.handle('GET_COMMON_AGENT_CREDENTIAL_STATUS', event => { trusted(event); return vault.status(); });
  ipcMain.handle('IMPORT_COMMON_AGENT_CREDENTIAL', async event => {
    trusted(event);
    if (importing) throw new Error('Program credential import already in progress');
    importing = true;
    try {
      const base = normalizeCommonAgentBaseUrl(getBaseUrl());
      const selection = await dialog.showOpenDialog(getWindow(), {
        title: '관리자가 발급한 Common Agent 프로그램 인증 JSON 선택',
        properties: ['openFile'], filters: [{ name: 'Issued program credential', extensions: ['json'] }]
      });
      if (selection.canceled || selection.filePaths.length !== 1) return vault.status();
      const filePath = selection.filePaths[0];
      if (!fs.statSync(filePath).isFile() || fs.statSync(filePath).size > 16384) throw new Error('Invalid credential file');
      const grant = JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
      const confirmation = await dialog.showMessageBox(getWindow(), { type: 'warning',
        message: '이 프로그램 인증을 등록하시겠습니까?',
        detail: `신뢰할 서버: ${base}\n키는 보호 저장소에만 저장합니다. 원래 발급 파일은 자동 삭제하지 않습니다.`,
        buttons: ['등록', '취소'], defaultId: 1, cancelId: 1 });
      trusted(event);
      if (confirmation.response !== 0) return vault.status();
      if (base !== normalizeCommonAgentBaseUrl(getBaseUrl())) throw new Error('Server address changed during import');
      return vault.install({ ...grant, base_url: base });
    } catch {
      throw new Error('Program credential import failed. Check the issued file, expiry and OS protected storage.');
    } finally { importing = false; }
  });
  ipcMain.handle('COMMON_AGENT_REQUEST', async (event, input = {}) => {
    trusted(event);
    const base = new URL(normalizeCommonAgentBaseUrl(getBaseUrl()));
    normalizeCommonAgentBaseUrl(input.url);
    const target = new URL(String(input.url).trim());
    const prefix = base.pathname.replace(/\/$/, '');
    if (target.origin !== base.origin || !(target.pathname === prefix || target.pathname.startsWith(`${prefix}/`))) {
      throw new Error('Common Agent request does not match the trusted configured server');
    }
    if (typeof input.requestId !== 'string' || !/^[a-zA-Z0-9.-]{8,100}$/.test(input.requestId)) throw new Error('Invalid request identifier');
    if (pending.has(input.requestId)) throw new Error('Common Agent request identifier is already pending');
    if (input.body != null && (!(input.body instanceof Uint8Array) || input.body.byteLength > 128 * 1024 * 1024)) {
      throw new Error('Invalid Common Agent request payload');
    }
    const controller = new AbortController();
    pending.set(input.requestId, controller);
    try {
      const response = await gateway.fetch(target.toString(), { method: input.method || 'GET',
        headers: input.headers, body: input.body, signal: controller.signal }, input.timeoutMs);
      return { status: response.status, headers: Object.fromEntries(response.headers), body: new Uint8Array(await response.arrayBuffer()) };
    } finally { pending.delete(input.requestId); }
  });
  ipcMain.handle('CANCEL_COMMON_AGENT_REQUEST', (event, requestId) => {
    trusted(event);
    const controller = pending.get(requestId);
    if (!controller) return false;
    controller.abort();
    return true;
  });
}

module.exports = { registerCommonAgentIpc };
