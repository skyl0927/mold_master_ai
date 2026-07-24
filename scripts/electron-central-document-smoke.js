const { _electron: electron } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

(async () => {
  const artifactsDir = path.join(process.cwd(), 'artifacts');
  fs.mkdirSync(artifactsDir, { recursive: true });
  const documentPath = path.join(artifactsDir, 'manual-central-smoke.txt');
  fs.writeFileSync(
    documentPath,
    'Whitening near a rib can be related to excessive ejection resistance.',
    'utf8'
  );
  const profilePath = path.join(
    artifactsDir,
    `central-document-profile-${Date.now()}`
  );
  const executablePath = process.env.ELECTRON_EXECUTABLE_PATH;
  let app;

  try {
    const launchOptions = {
      args: executablePath
        ? [`--user-data-dir=${profilePath}`]
        : ['.', `--user-data-dir=${profilePath}`],
      cwd: process.cwd(),
      env: {
        ...process.env,
        MOLD_MASTER_TEST_MANUAL_DOCUMENT_PATHS: documentPath
      }
    };
    if (executablePath) launchOptions.executablePath = path.resolve(executablePath);
    app = await electron.launch(launchOptions);

    const page = await app.firstWindow();
    const consoleErrors = [];
    const centralWrites = [];
    page.on('console', message => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    await page.route('http://agent.test/**', async route => {
      const request = route.request();
      const requestUrl = new URL(request.url());
      if (request.method() === 'POST' && requestUrl.pathname === '/v1/workflows/ingest-file') {
        centralWrites.push(`${request.method()} ${requestUrl.pathname}`);
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            document_id: 'doc-manual-smoke',
            version_id: 'ver-manual-smoke',
            persisted_to_sql: true,
            persisted_to_graph: false,
            review_status: 'candidate'
          })
        });
        return;
      }
      if (request.method() === 'DELETE' && requestUrl.pathname === '/v1/documents/doc-manual-smoke') {
        centralWrites.push(`${request.method()} ${requestUrl.pathname}`);
        await route.fulfill({ status: 204, body: '' });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'ok', items: [], evidence: [] })
      });
    });

    await page.evaluate(async config => {
      await window.electronAPI.setApiConfig(config);
    }, {
      provider: 'openai',
      aiOrchestrationMode: 'common_agent_primary',
      agentServerUrl: 'http://agent.test',
      visionQaServerUrl: 'http://agent.test',
      shortcut: 'CommandOrControl+Shift+C'
    });

    const vectorsBefore = await page.evaluate(async () =>
      (await window.electronAPI.getVectorStore()).length
    );
    await page.getByRole('button', { name: 'AI 어시스턴트 열기' }).click();
    await page.getByRole('button', { name: '문서 업로드' }).click();
    await page.getByText(
      'manual-central-smoke.txt 문서를 Common Agent에 추가했습니다.'
    ).waitFor({ timeout: 30000 });
    await page.getByText('Agent Docs 1', { exact: true }).waitFor({
      timeout: 30000
    });

    const centralBadgeVisible = await page.getByText('AGENT', { exact: true }).isVisible();
    const localBadgeCount = await page.getByText('LOCAL', { exact: true }).count();
    const registryAfterUpload = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('mold-master-ai:manual-documents:v1') || '{}')
    );
    const vectorsAfterUpload = await page.evaluate(async () =>
      (await window.electronAPI.getVectorStore()).length
    );

    const documentRow = page.getByTitle('manual-central-smoke.txt').locator('..');
    await documentRow.locator('button').click();
    await page.getByTitle('manual-central-smoke.txt').waitFor({
      state: 'detached',
      timeout: 30000
    });
    await page.getByText('Agent Docs 0', { exact: true }).waitFor({
      timeout: 30000
    });
    const registryAfterDelete = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('mold-master-ai:manual-documents:v1') || '{}')
    );
    const vectorsAfterDelete = await page.evaluate(async () =>
      (await window.electronAPI.getVectorStore()).length
    );

    const result = {
      centralBadgeVisible,
      headerRegistrySynchronized: true,
      localBadgeCount,
      registryAfterUpload,
      registryAfterDelete,
      vectorsBefore,
      vectorsAfterUpload,
      vectorsAfterDelete,
      centralWrites,
      consoleErrors
    };
    console.log(JSON.stringify(result, null, 2));

    const uploadRegistered =
      registryAfterUpload['manual-central-smoke.txt'] === 'doc-manual-smoke';
    const deleteRegistered = Object.keys(registryAfterDelete).length === 0;
    const vectorStoreUnchanged =
      vectorsBefore === vectorsAfterUpload
      && vectorsAfterUpload === vectorsAfterDelete;
    if (
      !centralBadgeVisible
      || !result.headerRegistrySynchronized
      || localBadgeCount !== 0
      || !uploadRegistered
      || !deleteRegistered
      || !vectorStoreUnchanged
      || centralWrites.join('|') !==
        'POST /v1/workflows/ingest-file|DELETE /v1/documents/doc-manual-smoke'
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
