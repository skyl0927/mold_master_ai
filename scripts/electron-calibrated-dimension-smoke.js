const { _electron: electron } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

(async () => {
  const root = process.cwd();
  const profilePath = path.join(root, 'artifacts', `dimension-ui-profile-${Date.now()}`);
  const fixturePath = path.join(root, 'assets', 'icon.png');
  const screenshot = path.join(root, 'artifacts', 'electron-calibrated-dimension.png');

  fs.mkdirSync(profilePath, { recursive: true });
  fs.writeFileSync(path.join(profilePath, 'apiConfig.json'), JSON.stringify({
    provider: 'openai',
    aiOrchestrationMode: 'common_agent_primary',
    agentServerUrl: 'http://127.0.0.1:8000',
    shortcut: 'CommandOrControl+Shift+C'
  }, null, 2));

  let app;
  try {
    app = await electron.launch({
      args: ['.', `--user-data-dir=${profilePath}`],
      cwd: root
    });
    const page = await app.firstWindow();
    const consoleErrors = [];
    page.on('console', message => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });

    await page.locator('input[type="file"][accept="image/*"]').setInputFiles(fixturePath);
    await page.getByTitle('편집').click();

    await page.getByLabel('기준 실제 길이').fill('10');
    await page.getByLabel('치수 단위').selectOption('mm');
    await page.getByRole('button', { name: '기준 치수' }).click();

    const canvas = page.locator('canvas');
    await canvas.waitFor();
    const box = await canvas.boundingBox();
    if (!box) throw new Error('annotation canvas has no bounding box');
    const y = box.y + box.height * 0.35;
    await page.mouse.move(box.x + box.width * 0.2, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.6, y);
    await page.mouse.up();

    const calibrationStatus = page.getByTestId('dimension-calibration-status');
    await calibrationStatus.getByText('축척 활성').waitFor();

    await page.getByTitle('치수').click();
    const dimensionY = box.y + box.height * 0.6;
    await page.mouse.move(box.x + box.width * 0.2, dimensionY);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.4, dimensionY);
    await page.mouse.up();

    const measurementSummary = page.getByTestId('dimension-measurement-summary');
    await measurementSummary.getByText('5.00 mm').waitFor();
    await page.getByRole('button', { name: '치수 승인' }).click();
    await measurementSummary.getByText('승인됨').waitFor();

    await page.getByRole('button', { name: '저장' }).click();
    await page.getByTitle('편집').click();
    await page.getByTestId('dimension-calibration-status').getByText('축척 활성').waitFor();
    const reopenedSummary = page.getByTestId('dimension-measurement-summary');
    await reopenedSummary.getByText('5.00 mm').waitFor();
    await reopenedSummary.getByText('승인됨').waitFor();

    await page.screenshot({ path: screenshot, fullPage: true });
    const output = {
      calibrationStatus: await page.getByTestId('dimension-calibration-status').innerText(),
      measurementSummary: await reopenedSummary.innerText(),
      screenshot,
      consoleErrors
    };
    console.log(JSON.stringify(output, null, 2));

    if (consoleErrors.length > 0) process.exitCode = 1;
  } finally {
    if (app) await app.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
