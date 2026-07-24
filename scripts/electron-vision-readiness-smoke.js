const { _electron: electron } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

(async () => {
  const profilePath = path.join(
    process.cwd(),
    'artifacts',
    `vision-readiness-profile-${Date.now()}`
  );
  let app;
  try {
    app = await electron.launch({
      args: ['.', `--user-data-dir=${profilePath}`],
      cwd: process.cwd()
    });
    const page = await app.firstWindow();
    const errors = [];
    page.on('console', message => {
      if (message.type() === 'error') errors.push(message.text());
    });

    await page.evaluate(async () => {
      await window.electronAPI.setApiConfig({
        provider: 'openai',
        aiOrchestrationMode: 'dual_validation',
        agentServerUrl: 'http://agent.test',
        shortcut: 'CommandOrControl+Shift+C'
      });
    });

    const sharedImage = Buffer.from('same-approved-image');
    await page.route('http://agent.test/**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'ok' })
      });
    });
    await page.route('http://agent.test/v1/datasets/images?**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total: 4,
          items: [
            {
              image_id: 'clean-approved',
              defect_type: '밀핀 자국',
              review_status: 'approved',
              metadata: { content_sha256: 'clean-hash' }
            },
            {
              image_id: 'conflict-surface',
              defect_type: '표면 결함',
              review_status: 'approved',
              metadata: {}
            },
            {
              image_id: 'conflict-flash',
              defect_type: '플래시',
              review_status: 'approved',
              metadata: {}
            },
            {
              image_id: 'candidate-whitening',
              defect_type: '백화',
              review_status: 'candidate',
              metadata: {}
            }
          ]
        })
      });
    });
    await page.route('http://agent.test/v1/datasets/images/*/file', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: sharedImage
      });
    });

    await page.getByRole('button', { name: '앱 설정 열기' }).click();
    await page.getByText('유효 승인 1/20건 · 19건 추가 필요').waitFor({ timeout: 15000 });
    await page.getByText('동일 이미지 2건: 표면 결함 / 플래시').waitFor();

    const screenshot = path.join(process.cwd(), 'artifacts', 'electron-vision-readiness.png');
    await page.screenshot({ path: screenshot, fullPage: true });
    const bodyText = await page.locator('body').innerText();
    const result = {
      showsCleanApprovedCount: bodyText.includes('유효 승인 1/20건'),
      showsConflictGroup: bodyText.includes('라벨 충돌 1그룹'),
      showsConflictLabels: bodyText.includes('동일 이미지 2건: 표면 결함 / 플래시'),
      showsReviewQueue: bodyText.includes('검토 필요 1건'),
      showsFreeCoverage: bodyText.includes('API 비용 없는 결함군 수집 현황'),
      showsEjectionTarget: bodyText.includes('취출/이형 1/2')
        && bodyText.includes('부족 1'),
      screenshot,
      isolatedProfile: profilePath,
      consoleErrors: errors
    };
    console.log(JSON.stringify(result, null, 2));

    if (
      !result.showsCleanApprovedCount
      || !result.showsConflictGroup
      || !result.showsConflictLabels
      || !result.showsReviewQueue
      || !result.showsFreeCoverage
      || !result.showsEjectionTarget
      || errors.length > 0
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
