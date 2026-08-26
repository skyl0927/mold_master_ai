const { _electron: electron } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

(async () => {
  const root = process.cwd();
  const profilePath = path.join(root, 'artifacts', `inspection-card-profile-${Date.now()}`);
  const fixturePath = path.join(root, 'assets', 'icon.png');
  const screenshot = path.join(root, 'artifacts', 'electron-inspection-card-compact.png');

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

    await page.locator('input[type="file"][accept="image/*"]').setInputFiles([
      fixturePath,
      fixturePath,
      fixturePath,
      fixturePath
    ]);

    const cards = page.getByTestId('inspection-image-card');
    await cards.nth(3).waitFor();
    if (await cards.count() !== 4) throw new Error(`expected 4 compact cards, received ${await cards.count()}`);

    const firstCard = cards.first();
    const firstPreview = firstCard.getByTestId('inspection-image-preview');
    const previewBox = await firstPreview.boundingBox();
    const cardBox = await firstCard.boundingBox();
    if (!previewBox || previewBox.height > 145) {
      throw new Error(`compact preview height exceeded 145px: ${previewBox?.height}`);
    }
    if (!cardBox || cardBox.height > 260) {
      throw new Error(`collapsed inspection card exceeded 260px: ${cardBox?.height}`);
    }

    await firstCard.getByRole('button', { name: 'Sample 1 편집' }).waitFor();
    await firstCard.getByRole('button', { name: 'Sample 1 삭제' }).waitFor();
    if (await firstCard.getByTestId('inspection-card-panel').count() !== 0) {
      throw new Error('inspection detail panel must start collapsed');
    }

    const captureTab = firstCard.getByRole('tab', { name: 'Sample 1 촬영 정보 탭' });
    await captureTab.click();
    await firstCard.getByTestId('inspection-card-panel').getByLabel('Sample 1 이미지 종류').waitFor();
    await captureTab.click();
    if (await firstCard.getByTestId('inspection-card-panel').count() !== 0) {
      throw new Error('active inspection tab did not collapse on second click');
    }

    await firstCard.getByRole('tab', { name: 'Sample 1 현상 설명 탭' }).click();
    await firstCard.getByRole('textbox', { name: 'Sample 1 현상 설명', exact: true }).fill('리브 주변 백화');
    await firstCard.getByRole('tab', { name: 'Sample 1 분석 탭' }).click();
    const analysisPanel = firstCard.getByTestId('inspection-card-panel');
    await analysisPanel.getByRole('button', { name: 'AI 진단' }).waitFor();
    await analysisPanel.getByRole('button', { name: 'Graph' }).waitFor();
    await analysisPanel.getByRole('button', { name: 'Agent' }).waitFor();

    await page.screenshot({ path: screenshot, fullPage: true });
    console.log(JSON.stringify({
      cardCount: await cards.count(),
      collapsedCardHeight: cardBox.height,
      previewHeight: previewBox.height,
      activePanel: 'analysis',
      persistentActions: ['edit', 'delete'],
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
