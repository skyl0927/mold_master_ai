const { _electron: electron } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

(async () => {
  const root = process.cwd();
  const profilePath = path.join(root, 'artifacts', `diagnosis-group-profile-${Date.now()}`);
  const fixturePath = path.join(root, 'assets', 'icon.png');
  const screenshot = path.join(root, 'artifacts', 'electron-defect-evidence-group.png');

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
      fixturePath
    ]);

    const cards = page.getByTestId('inspection-image-card');
    await cards.nth(1).waitFor();
    for (let index = 0; index < 2; index += 1) {
      const card = cards.nth(index);
      const sample = `Sample ${index + 1}`;
      await card.getByRole('tab', { name: `${sample} 촬영 정보 탭` }).click();
      await card.getByLabel(`${sample} 이미지 종류`).selectOption('physical_product');
      await card.getByLabel(`${sample} 촬영 시점`).selectOption(
        index === 0 ? 'full_part_context' : 'defect_closeup'
      );
      await card.getByRole('tab', { name: `${sample} 촬영 정보 탭` }).click();
      await card.getByLabel(`${sample} 선택`).check();
    }

    const mergeButton = page.getByRole('button', { name: '동일 결함 사진 묶기' });
    await mergeButton.click();
    await page.getByText('진단 그룹 준비', { exact: true }).waitFor();

    const groupLabels = [];
    for (let index = 0; index < 2; index += 1) {
      const card = cards.nth(index);
      const sample = `Sample ${index + 1}`;
      await card.getByRole('tab', { name: `${sample} 촬영 정보 탭` }).click();
      const panelText = await card.getByTestId('inspection-card-panel').innerText();
      const groupLine = panelText.split('\n').find(line => line.includes('결함 그룹')) || '';
      if (!groupLine || groupLine.includes('미지정')) {
        throw new Error(`${sample} did not receive an explicit diagnosis group`);
      }
      groupLabels.push(groupLine);
      await card.getByRole('tab', { name: `${sample} 촬영 정보 탭` }).click();
    }

    const firstCard = cards.first();
    await firstCard.getByRole('tab', { name: 'Sample 1 분석 탭' }).click();
    const diagnoseButton = firstCard.getByRole('button', { name: 'AI 진단' });
    if (!await diagnoseButton.isEnabled()) {
      throw new Error('diagnosis remained disabled after explicit evidence grouping');
    }

    await page.screenshot({ path: screenshot, fullPage: true });
    console.log(JSON.stringify({
      cardCount: await cards.count(),
      groupLabels,
      diagnoseEnabled: await diagnoseButton.isEnabled(),
      activeSessionReady: await page.getByText('진단 그룹 준비', { exact: true }).isVisible(),
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
