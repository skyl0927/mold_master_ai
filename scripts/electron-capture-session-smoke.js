const { _electron: electron } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

(async () => {
  const root = process.cwd();
  const profilePath = path.join(
    root,
    'artifacts',
    `capture-session-ui-profile-${Date.now()}`
  );
  const fixturePath = path.join(root, 'assets', 'icon.png');
  const screenshot = path.join(
    root,
    'artifacts',
    'electron-capture-session-gate.png'
  );
  const cameraScreenshot = path.join(
    root,
    'artifacts',
    'electron-multiview-camera.png'
  );

  fs.mkdirSync(profilePath, { recursive: true });
  fs.writeFileSync(path.join(profilePath, 'apiConfig.json'), JSON.stringify({
    provider: 'openai',
    aiOrchestrationMode: 'common_agent_primary',
    agentServerUrl: 'http://127.0.0.1:8000',
    visionQaServerUrl: 'http://127.0.0.1:8103',
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

    const fileInput = page.locator('input[type="file"][accept="image/*"]');
    await fileInput.setInputFiles(fixturePath);

    const firstKind = page.getByLabel('Sample 1 이미지 종류');
    const firstView = page.getByLabel('Sample 1 촬영 시점');
    await firstKind.waitFor();
    await firstKind.selectOption('physical_product');
    await firstView.selectOption('full_part_context');

    const firstDiagnosis = page.getByRole('button', { name: 'AI 진단' }).first();
    const blockedAfterOneView = await firstDiagnosis.isDisabled();

    await fileInput.setInputFiles(fixturePath);
    const secondKind = page.getByLabel('Sample 2 이미지 종류');
    const secondView = page.getByLabel('Sample 2 촬영 시점');
    await secondKind.waitFor();
    await secondKind.selectOption('physical_product');
    await secondView.selectOption('defect_closeup');

    await page.getByText('촬영 프로토콜 충족').first().waitFor();
    const diagnosisButtons = page.getByRole('button', { name: 'AI 진단' });
    const diagnosisButtonCount = await diagnosisButtons.count();
    const enabledStates = [];
    for (let index = 0; index < diagnosisButtonCount; index++) {
      enabledStates.push(await diagnosisButtons.nth(index).isEnabled());
    }

    await page.screenshot({ path: screenshot, fullPage: true });
    await page.getByRole('button', { name: '외부 카메라' }).click();
    await page.getByText('다중 시점 촬영').waitFor();
    const cameraViewSelector = page.getByLabel('카메라 촬영 시점');
    const cameraKeepsOpenMessage = page.getByText('촬영 후 카메라는 계속 유지됩니다.');
    await cameraViewSelector.waitFor();
    await cameraKeepsOpenMessage.waitFor();
    await page.screenshot({ path: cameraScreenshot, fullPage: true });

    const output = {
      blockedAfterOneView,
      diagnosisButtonCount,
      enabledStates,
      readyCards: await page.getByText('촬영 프로토콜 충족').count(),
      screenshot,
      cameraScreenshot,
      cameraViewSelectorVisible: await cameraViewSelector.isVisible(),
      cameraKeepsOpenMessageVisible: await cameraKeepsOpenMessage.isVisible(),
      consoleErrors
    };
    console.log(JSON.stringify(output, null, 2));

    if (
      !blockedAfterOneView
      || diagnosisButtonCount !== 2
      || enabledStates.some(enabled => !enabled)
      || output.readyCards !== 2
      || !output.cameraViewSelectorVisible
      || !output.cameraKeepsOpenMessageVisible
      || consoleErrors.length > 0
    ) {
      process.exitCode = 1;
    }
  } finally {
    if (app) await app.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
