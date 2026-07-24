const { _electron: electron } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

(async () => {
  let electronApp;
  try {
    const artifactsDir = path.join(process.cwd(), 'artifacts');
    fs.mkdirSync(artifactsDir, { recursive: true });

    electronApp = await electron.launch({
      args: ['.'],
      cwd: process.cwd(),
      artifactsDir
    });

    const window = await electronApp.firstWindow();
    const consoleErrors = [];
    window.on('console', message => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });

    console.log('Window title:', await window.title());
    console.log('Current URL:', window.url());

    await window.waitForTimeout(5000);
    const pageText = await window.locator('body').innerText();
    const connectionBadges = pageText
      .split(/\r?\n/)
      .filter(line => /Knowledge (Online|Offline)|RAG (Online|Offline)|Agent (Online|Offline)/.test(line));

    const screenshotPath = path.join(artifactsDir, 'electron-home.png');
    await window.screenshot({ path: screenshotPath, fullPage: true });

    console.log('Screenshot:', screenshotPath);
    console.log('Connection badges:', connectionBadges.join(' | ') || 'not found');
    console.log('Renderer console errors:', consoleErrors.length);
    for (const error of consoleErrors.slice(0, 10)) {
      console.log(`  - ${error}`);
    }
  } finally {
    if (electronApp) await electronApp.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
