const { _electron: electron } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

(async () => {
  const root = process.cwd();
  const profilePath = path.join(root, 'artifacts', `annotated-clipboard-profile-${Date.now()}`);
  const fixturePath = path.join(root, 'assets', 'icon.png');
  const screenshot = path.join(root, 'artifacts', 'electron-annotated-clipboard.png');

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

    const canvas = page.locator('canvas');
    await canvas.waitFor();
    const box = await canvas.boundingBox();
    if (!box) throw new Error('annotation canvas has no bounding box');

    await page.getByRole('tab', { name: '주석' }).click();
    await page.getByTitle('텍스트').click();
    await page.mouse.click(box.x + box.width * 0.62, box.y + box.height * 0.28);
    const annotationEditor = page.getByLabel('주석 텍스트 편집');
    await annotationEditor.fill('CLIPBOARD TEST');
    await annotationEditor.press('Enter');

    await page.getByRole('tab', { name: '측정' }).click();
    await page.getByRole('button', { name: '치수', exact: true }).click();
    const dimensionY = box.y + box.height * 0.72;
    await page.mouse.move(box.x + box.width * 0.2, dimensionY);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.5, dimensionY);
    await page.mouse.up();

    const canvasSize = await canvas.evaluate(element => ({
      width: element.width,
      height: element.height
    }));
    await page.getByRole('button', { name: '클립보드 저장하기' }).click();
    const clipboardStatus = page.getByTestId('clipboard-write-status');
    await clipboardStatus.getByText('클립보드 저장 완료').waitFor();

    const clipboardImage = await app.evaluate(({ clipboard }) => {
      const image = clipboard.readImage();
      const size = image.getSize();
      return {
        empty: image.isEmpty(),
        width: size.width,
        height: size.height,
        pngByteLength: image.toPNG().length
      };
    });
    if (clipboardImage.empty || clipboardImage.pngByteLength <= 0) {
      throw new Error('system clipboard does not contain a PNG image');
    }
    if (clipboardImage.width !== canvasSize.width || clipboardImage.height !== canvasSize.height) {
      throw new Error(`clipboard image size mismatch: ${clipboardImage.width}x${clipboardImage.height} vs ${canvasSize.width}x${canvasSize.height}`);
    }

    await page.screenshot({ path: screenshot, fullPage: true });
    console.log(JSON.stringify({
      canvasSize,
      clipboardImage,
      status: await clipboardStatus.innerText(),
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
