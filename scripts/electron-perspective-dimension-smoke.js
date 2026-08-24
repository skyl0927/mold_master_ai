const { _electron: electron } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

(async () => {
  const root = process.cwd();
  const profilePath = path.join(root, 'artifacts', `perspective-dimension-profile-${Date.now()}`);
  const fixturePath = path.join(root, 'assets', 'icon.png');
  const screenshot = path.join(root, 'artifacts', 'electron-perspective-dimension.png');

  fs.mkdirSync(profilePath, { recursive: true });
  fs.writeFileSync(path.join(profilePath, 'apiConfig.json'), JSON.stringify({
    provider: 'openai',
    aiOrchestrationMode: 'common_agent_primary',
    agentServerUrl: 'http://127.0.0.1:8000',
    shortcut: 'CommandOrControl+Shift+C'
  }, null, 2));

  let app;
  try {
    app = await electron.launch({ args: ['.', `--user-data-dir=${profilePath}`], cwd: root });
    const page = await app.firstWindow();
    const consoleErrors = [];
    page.on('console', message => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });

    await page.locator('input[type="file"][accept="image/*"]').setInputFiles(fixturePath);
    await page.getByTitle('편집').click();
    await page.getByLabel('평면 기준 폭').fill('10');
    await page.getByLabel('평면 기준 높이').fill('20');
    await page.getByLabel('치수 단위').selectOption('mm');
    await page.getByRole('button', { name: '원근 4점' }).click();

    const canvas = page.locator('canvas');
    await canvas.waitFor();
    const box = await canvas.boundingBox();
    if (!box) throw new Error('annotation canvas has no bounding box');
    const corners = [
      [0.20, 0.20],
      [0.80, 0.20],
      [0.70, 0.80],
      [0.30, 0.80]
    ];
    for (const [x, y] of corners) {
      await page.mouse.click(box.x + box.width * x, box.y + box.height * y);
    }

    const status = page.getByTestId('dimension-calibration-status');
    await status.getByText('원근 보정 활성').waitFor();
    await page.getByRole('button', { name: '치수', exact: true }).click();
    const bottomY = box.y + box.height * 0.80;
    await page.mouse.move(box.x + box.width * 0.30, bottomY);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.70, bottomY);
    await page.mouse.up();

    const summary = page.getByTestId('dimension-measurement-summary');
    await summary.waitFor();
    const summaryText = await summary.innerText();
    if (!/10\.0{2}\s*mm/.test(summaryText) || !summaryText.includes('원근 보정')) {
      throw new Error(`expected 10.00 mm perspective measurement, received: ${summaryText}`);
    }
    await page.getByRole('button', { name: '치수 승인' }).click();
    await summary.getByText('승인됨').waitFor();

    await page.getByRole('button', { name: '저장' }).click();
    await page.getByTitle('편집').click();
    await page.getByTestId('dimension-calibration-status').getByText('원근 보정 활성').waitFor();
    await page.getByTestId('dimension-measurement-summary').getByText('10.00 mm').waitFor();
    await page.screenshot({ path: screenshot, fullPage: true });

    console.log(JSON.stringify({
      calibrationStatus: await page.getByTestId('dimension-calibration-status').innerText(),
      measurementSummary: await page.getByTestId('dimension-measurement-summary').innerText(),
      screenshot,
      consoleErrors
    }, null, 2));
    if (consoleErrors.length > 0) process.exitCode = 1;
  } finally {
    if (app) await app.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
