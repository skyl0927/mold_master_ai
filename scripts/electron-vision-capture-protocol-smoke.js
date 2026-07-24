const { _electron: electron } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

(async () => {
  const profilePath = path.join(
    process.cwd(),
    'artifacts',
    `capture-protocol-ui-profile-${Date.now()}`
  );
  const agentServerUrl = process.env.COMMON_AGENT_URL || 'http://127.0.0.1:8000';
  const visionQaServerUrl = process.env.COMMON_AGENT_QA_URL || 'http://127.0.0.1:8103';
  fs.mkdirSync(profilePath, { recursive: true });
  fs.writeFileSync(path.join(profilePath, 'apiConfig.json'), JSON.stringify({
    provider: 'openai',
    aiOrchestrationMode: 'dual_validation',
    agentServerUrl,
    visionQaServerUrl,
    ragServerUrl: 'http://127.0.0.1:5001',
    shortcut: 'CommandOrControl+Shift+C'
  }, null, 2));

  let app;
  try {
    app = await electron.launch({
      args: ['.', `--user-data-dir=${profilePath}`],
      cwd: process.cwd()
    });
    const page = await app.firstWindow();
    const consoleErrors = [];
    page.on('console', message => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });

    await page.getByText('DATABASE TREE').click();
    const details = page.getByText('촬영 메타데이터').first();
    await details.waitFor({ timeout: 120000 });
    await details.click();

    const imageKind = page.locator('select[aria-label$=" image kind"]').first();
    const fullPartTag = page.getByRole('button', { name: '제품 전체 위치' }).first();
    const saveButton = page.getByRole('button', { name: '촬영 정보 저장' }).first();
    await imageKind.waitFor();
    await fullPartTag.waitFor();
    await saveButton.waitFor();

    const screenshot = path.join(
      process.cwd(),
      'artifacts',
      'electron-vision-capture-protocol.png'
    );
    await page.screenshot({ path: screenshot, fullPage: true });
    const output = {
      imageKindValue: await imageKind.inputValue(),
      fullPartTagVisible: await fullPartTag.isVisible(),
      saveButtonVisible: await saveButton.isVisible(),
      screenshot,
      consoleErrors
    };
    console.log(JSON.stringify(output, null, 2));
    if (
      !output.fullPartTagVisible
      || !output.saveButtonVisible
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
