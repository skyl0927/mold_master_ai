const { _electron: electron } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const { createCaptureWorkspaceStore } = require('../captureWorkspaceStore');

const launchApp = (root, profilePath) => electron.launch({
  args: ['.', `--user-data-dir=${profilePath}`],
  cwd: root
});

(async () => {
  const root = process.cwd();
  const profilePath = path.join(
    root,
    'artifacts',
    `capture-workspace-restart-profile-${Date.now()}`
  );
  const fixturePath = path.join(root, 'assets', 'icon.png');
  const fixtureDataUrl = `data:image/png;base64,${fs.readFileSync(fixturePath).toString('base64')}`;
  const screenshotPath = path.join(
    root,
    'artifacts',
    'electron-capture-workspace-restart.png'
  );
  const recaptureSource = {
    workOrderId: 'restart-smoke-work-order',
    reviewDecisionId: 'restart-smoke-review',
    safetyGateReasons: ['governed_capture_work_order'],
    requiredViewTags: ['full_part_context', 'defect_closeup']
  };

  fs.mkdirSync(profilePath, { recursive: true });
  fs.writeFileSync(path.join(profilePath, 'apiConfig.json'), JSON.stringify({
    provider: 'openai',
    aiOrchestrationMode: 'common_agent_primary',
    agentServerUrl: 'http://127.0.0.1:8000',
    visionQaServerUrl: 'http://127.0.0.1:8103',
    shortcut: 'CommandOrControl+Shift+C'
  }, null, 2));

  const store = createCaptureWorkspaceStore({
    rootDir: path.join(profilePath, 'MoldMasterDB', 'capture_workspace')
  });
  store.saveImage({
    id: 'restart-smoke-full-view',
    baseImageUrl: fixtureDataUrl,
    dataUrl: fixtureDataUrl,
    annotations: [],
    shapes: [],
    captureSessionId: 'restart-smoke-session',
    captureViewTag: 'full_part_context',
    captureImageKind: 'physical_product',
    captureSource: 'file',
    recaptureSource
  });

  let firstApp;
  let secondApp;
  const workspaceConsoleErrors = [];
  try {
    firstApp = await launchApp(root, profilePath);
    const firstPage = await firstApp.firstWindow();
    firstPage.on('console', message => {
      if (message.type() === 'error' && /capture workspace/i.test(message.text())) {
        workspaceConsoleErrors.push(message.text());
      }
    });

    await firstPage.getByText('Sample #1', { exact: true }).waitFor({ timeout: 30000 });
    await firstPage.getByText(/재촬영 작업지시 복원:/).waitFor({ timeout: 10000 });
    const beforeUpload = await firstPage.evaluate(() => window.electronAPI.getCaptureWorkspaceStatus());

    await firstPage.locator('input[type="file"][accept="image/*"]').setInputFiles(fixturePath);
    await firstPage.waitForFunction(async () => {
      const status = await window.electronAPI.getCaptureWorkspaceStatus();
      return status.imageCount === 2 && status.workOrders.some(item => item.ready);
    }, undefined, { timeout: 30000 });
    const afterUpload = await firstPage.evaluate(() => window.electronAPI.getCaptureWorkspaceStatus());
    await firstApp.close();
    firstApp = null;

    secondApp = await launchApp(root, profilePath);
    const secondPage = await secondApp.firstWindow();
    secondPage.on('console', message => {
      if (message.type() === 'error' && /capture workspace/i.test(message.text())) {
        workspaceConsoleErrors.push(message.text());
      }
    });
    await secondPage.getByText('Sample #2', { exact: true }).waitFor({ timeout: 30000 });
    await secondPage.waitForTimeout(1000);
    const afterRestart = await secondPage.evaluate(() => window.electronAPI.getCaptureWorkspaceStatus());
    const reopenedCompletedWorkOrder = await secondPage.getByText(/재촬영 작업지시 복원:/).count();
    await secondPage.screenshot({ path: screenshotPath, fullPage: true });

    const output = {
      profilePath,
      screenshotPath,
      beforeUpload,
      afterUpload,
      afterRestart,
      reopenedCompletedWorkOrder,
      workspaceConsoleErrors
    };
    console.log(JSON.stringify(output, null, 2));

    if (
      beforeUpload.imageCount !== 1
      || beforeUpload.workOrders[0]?.ready !== false
      || afterUpload.imageCount !== 2
      || afterUpload.workOrders[0]?.ready !== true
      || afterRestart.imageCount !== 2
      || afterRestart.workOrders[0]?.ready !== true
      || reopenedCompletedWorkOrder !== 0
      || workspaceConsoleErrors.length > 0
    ) {
      process.exitCode = 1;
    }
  } finally {
    if (firstApp) await firstApp.close();
    if (secondApp) await secondApp.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
