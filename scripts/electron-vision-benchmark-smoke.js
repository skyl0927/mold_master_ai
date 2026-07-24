const { _electron: electron } = require('playwright');
const path = require('node:path');

(async () => {
  const profilePath = path.join(process.cwd(), 'artifacts', `benchmark-ui-profile-${Date.now()}`);
  const agentServerUrl = process.env.COMMON_AGENT_URL || 'http://127.0.0.1:8000';
  const visionQaServerUrl = process.env.COMMON_AGENT_QA_URL || 'http://127.0.0.1:8103';
  const executablePath = process.env.ELECTRON_EXECUTABLE_PATH;
  let app;
  try {
    const launchOptions = {
      args: executablePath
        ? [`--user-data-dir=${profilePath}`]
        : ['.', `--user-data-dir=${profilePath}`],
      cwd: process.cwd()
    };
    app = await electron.launch(executablePath
      ? { ...launchOptions, executablePath: path.resolve(executablePath) }
      : launchOptions);
    const page = await app.firstWindow();
    const consoleErrors = [];
    page.on('console', message => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });

    await page.evaluate(async config => {
      await window.electronAPI.setApiConfig(config);
    }, {
      provider: 'openai',
      aiOrchestrationMode: 'dual_validation',
      agentServerUrl,
      visionQaServerUrl,
      shortcut: 'CommandOrControl+Shift+C'
    });

    await page.getByText('DATABASE TREE').click();
    const benchmarkButton = page.getByRole('button', { name: /Vision/ }).nth(1);
    await benchmarkButton.waitFor({ timeout: 120000 });
    await page.waitForFunction(() => Array.from(document.querySelectorAll('button')).some(button =>
      button.textContent?.includes('Vision')
      && button.textContent?.includes('\uC2E4\uD589')
      && !button.disabled
    ), null, { timeout: 120000 });
    await benchmarkButton.click();
    await page.waitForFunction(
      () => document.body.innerText.includes('FALLBACK')
        && document.body.innerText.includes('통합 마이그레이션 게이트'),
      null,
      { timeout: 360000 }
    );

    const result = await page.evaluate(() => {
      const text = document.body.innerText;
      return {
        fallbackKept: text.includes('FALLBACK \uC720\uC9C0'),
        sample: (text.match(/\uD45C\uBCF8\s+\d+/) || [])[0],
        http: (text.match(/HTTP\s+\d+(?:\.\d+)?%/) || [])[0],
        accuracy: (text.match(/\uACB0\uD568 \uC815\uD655\uB3C4\s+\d+(?:\.\d+)?%/) || [])[0],
        graph: (text.match(/Graph \uADFC\uAC70\s+\d+(?:\.\d+)?%/) || [])[0],
        coverage: (text.match(/\uACB0\uD568\uAD70\s+\d+\/\d+/) || [])[0],
        confidence: (text.match(/Vision \uC2E0\uB8B0\s+\d+(?:\.\d+)?%/) || [])[0],
        ejectionTarget: (text.match(/\uCDE8\uCD9C\/\uC774\uD615\s+\d+\/\d+/) || [])[0],
        readOnlyGate: text.includes('조회 전용 · 자동 승인 없음'),
        unresolvedHitl: (text.match(/미해소 HITL\s+\d+/) || [])[0],
        integratedGateVisible: text.includes('통합 마이그레이션 게이트')
      };
    });
    const reportPath = await page.locator('p.font-mono')
      .filter({ hasText: 'latest-report.json' })
      .innerText();
    const gateStatusPath = await page.locator('p.font-mono')
      .filter({ hasText: 'latest-gate-status.json' })
      .innerText();
    await page.locator('div.flex-grow.overflow-y-auto').evaluate(element => {
      element.scrollTop = 0;
    });
    const screenshot = path.join(process.cwd(), 'artifacts', 'electron-vision-benchmark-live.png');
    await page.screenshot({ path: screenshot, fullPage: true });

    const output = {
      ...result,
      reportPath,
      gateStatusPath,
      screenshot,
      isolatedProfile: profilePath,
      consoleErrors
    };
    console.log(JSON.stringify(output, null, 2));
    if (
      !result.sample
      || !result.http
      || !result.accuracy
      || !result.graph
      || !result.coverage
      || !result.confidence
      || !result.ejectionTarget
      || !result.readOnlyGate
      || !result.unresolvedHitl
      || !result.integratedGateVisible
      || !reportPath.includes('latest-report.json')
      || !gateStatusPath.includes('latest-gate-status.json')
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
