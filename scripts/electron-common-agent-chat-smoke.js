const { _electron: electron } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

(async () => {
  let electronApp;
  try {
    const artifactsDir = path.join(process.cwd(), 'artifacts');
    fs.mkdirSync(artifactsDir, { recursive: true });

    electronApp = await electron.launch({
      args: ['.'],
      cwd: process.cwd(),
      artifactsDir
    });

    const window = await electronApp.firstWindow();
    const consoleErrors = [];
    window.on('console', message => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });

    await window.waitForLoadState('domcontentloaded');
    await window.getByRole('button', { name: 'AI 어시스턴트 열기' }).click();
    await window.getByText('지식 검색 사용', { exact: true }).click();
    if (!await window.locator('#rag-toggle').isChecked()) {
      throw new Error('Knowledge retrieval toggle did not activate.');
    }
    await window.getByRole('button', { name: 'Graph Only' }).click();

    const input = window.getByPlaceholder('그래프 경로 기반으로 질문하기...');
    await input.fill('그릴 금형의 리브 주변 백화가 발생하고 취출 시 딱 소리와 함께 제품이 튕겼습니다. 원인과 대책을 근거와 함께 알려줘.');
    await input.press('Enter');

    const response = window.getByText(/\[COMMON AGENT \| Confidence/).last();
    await response.waitFor({ state: 'visible', timeout: 120000 });
    const responseText = await response.innerText();
    const evidenceMatch = responseText.match(/\| Evidence (\d+)\]/);
    const evidenceCount = evidenceMatch ? Number(evidenceMatch[1]) : 0;

    const screenshotPath = path.join(artifactsDir, 'electron-common-agent-graph-chat.png');
    await window.screenshot({ path: screenshotPath, fullPage: true });

    console.log('Common Agent response marker: PASS');
    console.log('Approved graph evidence count:', evidenceCount);
    console.log('Graph trace present:', /Graph \/ Retrieval Trace/.test(responseText));
    console.log('Evidence section present:', /\n근거\n/.test(responseText));
    console.log('Renderer console errors:', consoleErrors.length);
    for (const error of consoleErrors.slice(0, 10)) console.log(`  - ${error}`);
    console.log('Screenshot:', screenshotPath);

    if (evidenceCount < 1 || consoleErrors.length > 0) process.exitCode = 1;
  } finally {
    if (electronApp) await electronApp.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
