const { _electron: electron } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

const candidateRoot = path.resolve(
  process.env.MOLD_MASTER_CARD_CANDIDATE_ROOT
    || path.join(
      'artifacts',
      'knowledge-card-vision-candidates',
      'pre-draft-5c350a0fe9f5'
    )
);

const manifestPath = path.join(candidateRoot, 'vision-candidates.json');
if (!fs.existsSync(manifestPath)) {
  throw new Error(`Candidate manifest not found: ${manifestPath}`);
}
const candidateManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const expectedCandidates = Array.isArray(candidateManifest.candidates)
  ? candidateManifest.candidates
  : [];
if (expectedCandidates.length === 0) {
  throw new Error(`Candidate manifest has no candidates: ${manifestPath}`);
}

(async () => {
  const profilePath = path.join(
    process.cwd(),
    'artifacts',
    `knowledge-card-candidate-profile-${Date.now()}`
  );
  const executablePath = process.env.ELECTRON_EXECUTABLE_PATH;
  let app;
  try {
    app = await electron.launch(executablePath
      ? {
          executablePath: path.resolve(executablePath),
          args: [`--user-data-dir=${profilePath}`],
          env: {
            ...process.env,
            MOLD_MASTER_TEST_LOCAL_VISION_ROOT: candidateRoot
          }
        }
      : {
          args: ['.', `--user-data-dir=${profilePath}`],
          cwd: process.cwd(),
          env: {
            ...process.env,
            MOLD_MASTER_TEST_LOCAL_VISION_ROOT: candidateRoot
          }
        });

    const page = await app.firstWindow();
    const consoleErrors = [];
    const networkWrites = [];
    page.on('console', message => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('request', request => {
      if (request.method() !== 'GET') {
        networkWrites.push(`${request.method()} ${request.url()}`);
      }
    });
    await page.route('http://agent.test/**', async route => {
      const request = route.request();
      const requestUrl = new URL(request.url());
      if (request.method() === 'GET' && requestUrl.pathname === '/v1/datasets/images') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ total: 0, items: [] })
        });
        return;
      }
      if (request.method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'ok' })
        });
        return;
      }
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'A read-only scan must not write.' })
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

    await page.getByText('DATABASE TREE').click();
    await page.getByText('Common Agent Vision (0)').waitFor({ timeout: 15000 });
    await page.getByRole('button', { name: '로컬 후보 폴더 선택' }).click();
    await page.getByText(`로컬 후보 ${expectedCandidates.length}건`).waitFor({ timeout: 30000 });
    await page.getByText(`원문 연결 ${expectedCandidates.length}`).waitFor({ timeout: 30000 });

    const rows = [];
    for (const candidate of expectedCandidates) {
      const fileName = candidate.relativePath;
      const expectedLabel = candidate.defectType;
      const card = page.locator('article').filter({ hasText: fileName });
      await card.waitFor({ timeout: 30000 });
      const label = await card
        .locator('input[aria-label$="local defect label"]')
        .inputValue();
      const sourceBadgeLabel = candidate.sourceLineage?.knowledgeId
        ? '원문 카드 연결'
        : '원문 문서 연결';
      const sourceBadge = await card.getByText(sourceBadgeLabel).isVisible();
      const conflictBadge = candidate.requiresLabelReconciliation
        ? await card.getByText('원문/AI 라벨 충돌').isVisible()
        : true;
      const registrationBlocked = candidate.requiresLabelReconciliation
        ? await card.getByRole('button', { name: '검토 후보 등록' }).isDisabled()
        : true;
      rows.push({
        fileName,
        expectedLabel,
        label,
        sourceBadge,
        conflictBadge,
        registrationBlocked
      });
    }

    const result = {
      candidateRoot,
      candidateCount: rows.length,
      allLabelsPrefilled: rows.every(row => row.label === row.expectedLabel),
      allSourceBadgesVisible: rows.every(row => row.sourceBadge),
      allConflictGatesVisible: rows.every(row => row.conflictBadge),
      allConflictsBlocked: rows.every(row => row.registrationBlocked),
      networkWrites,
      consoleErrors,
      rows
    };
    console.log(JSON.stringify(result, null, 2));

    if (
      result.candidateCount !== expectedCandidates.length
      || !result.allLabelsPrefilled
      || !result.allSourceBadgesVisible
      || !result.allConflictGatesVisible
      || !result.allConflictsBlocked
      || result.networkWrites.length > 0
      || result.consoleErrors.length > 0
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
