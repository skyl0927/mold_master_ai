const { _electron: electron } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

(async () => {
  let electronApp;
  try {
    const artifactsDir = path.join(process.cwd(), 'artifacts');
    fs.mkdirSync(artifactsDir, { recursive: true });
    electronApp = await electron.launch({ args: ['.'], cwd: process.cwd(), artifactsDir });

    const window = await electronApp.firstWindow();
    const consoleErrors = [];
    window.on('console', message => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });

    await window.getByRole('button', { name: '앱 설정 열기' }).click();
    if (process.env.MIGRATION_VERIFY_UI_ONLY === '1') {
      await window.getByRole('button', { name: '지식 이전' }).waitFor({ state: 'visible' });
      await window.waitForTimeout(500);
      console.log('Migration UI: PASS');
      console.log('Renderer console errors:', consoleErrors.length);
      for (const error of consoleErrors.slice(0, 10)) console.log(`  - ${error}`);
      if (consoleErrors.length > 0) process.exitCode = 1;
      return;
    }

    await window.getByRole('button', { name: '지식 이전' }).click();
    const status = window.getByText(/\d+건 이전 완료/);
    await status.waitFor({ state: 'visible', timeout: 180000 });
    const statusText = await status.innerText();

    const screenshotPath = path.join(artifactsDir, 'electron-process-knowledge-migration.png');
    await window.screenshot({ path: screenshotPath, fullPage: true });
    console.log('Migration status:', statusText);
    console.log('Renderer console errors:', consoleErrors.length);
    for (const error of consoleErrors.slice(0, 10)) console.log(`  - ${error}`);
    console.log('Screenshot:', screenshotPath);

    if (!/SQL 완료/.test(statusText) || !/Graph 완료/.test(statusText) || consoleErrors.length > 0) {
      process.exitCode = 1;
    }
  } finally {
    if (electronApp) await electronApp.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
