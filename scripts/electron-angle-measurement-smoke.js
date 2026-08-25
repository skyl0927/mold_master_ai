const { _electron: electron } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

const readPixel = async (page, xFraction, yFraction) => page.locator('canvas').evaluate(
  (canvas, point) => {
    const context = canvas.getContext('2d');
    return Array.from(context.getImageData(
      Math.round(canvas.width * point.x),
      Math.round(canvas.height * point.y),
      1,
      1
    ).data);
  },
  { x: xFraction, y: yFraction }
);

(async () => {
  const root = process.cwd();
  const profilePath = path.join(root, 'artifacts', `angle-ui-profile-${Date.now()}`);
  const fixturePath = path.join(root, 'assets', 'icon.png');
  const screenshot = path.join(root, 'artifacts', 'electron-angle-measurement.png');

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
    await page.getByRole('tab', { name: '측정' }).click();

    const canvas = page.locator('canvas');
    await canvas.waitFor();
    const box = await canvas.boundingBox();
    if (!box) throw new Error('annotation canvas has no bounding box');
    const referencePixelBefore = await readPixel(page, 0.4, 0.35);

    await page.getByLabel('기준 실제 길이').fill('10');
    await page.getByRole('button', { name: '기준 치수' }).click();
    const referenceY = box.y + box.height * 0.35;
    await page.mouse.move(box.x + box.width * 0.2, referenceY);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.6, referenceY);
    await page.mouse.up();
    await page.getByTestId('dimension-calibration-status').getByText('축척 활성').waitFor();
    const referencePixelAfter = await readPixel(page, 0.4, 0.35);

    await page.getByRole('button', { name: '각도', exact: true }).click();
    await page.mouse.click(box.x + box.width * 0.35, box.y + box.height * 0.65);
    await page.mouse.click(box.x + box.width * 0.55, box.y + box.height * 0.65);
    await page.mouse.click(box.x + box.width * 0.55, box.y + box.height * 0.45);

    const summary = page.getByTestId('angle-measurement-summary');
    await summary.getByText('90.0°').waitFor();
    await page.getByRole('button', { name: '각도 값 편집' }).click();
    const editor = page.locator('textarea[aria-label="측정값 편집"]');
    await editor.fill('92.5°');
    await editor.press('Enter');
    await summary.getByText('92.5°').waitFor();
    await summary.getByText('수동 보정').waitFor();

    await page.getByRole('button', { name: '저장' }).click();
    await page.getByTitle('편집').click();
    await page.getByRole('tab', { name: '측정' }).click();
    const reopenedSummary = page.getByTestId('angle-measurement-summary');
    await reopenedSummary.getByText('92.5°').waitFor();

    await page.screenshot({ path: screenshot, fullPage: true });
    const output = {
      officeRibbonTabs: await page.getByRole('tab').allTextContents(),
      referenceGuideHidden: JSON.stringify(referencePixelBefore) === JSON.stringify(referencePixelAfter),
      angleSummary: await reopenedSummary.innerText(),
      screenshot,
      consoleErrors
    };
    console.log(JSON.stringify(output, null, 2));
    if (!output.referenceGuideHidden || consoleErrors.length > 0) process.exitCode = 1;
  } finally {
    if (app) await app.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
