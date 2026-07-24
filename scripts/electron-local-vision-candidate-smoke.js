const { _electron: electron } = require('playwright');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const sendJson = (response, status, payload) => {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*'
  });
  response.end(JSON.stringify(payload));
};

const readBody = request => new Promise((resolve, reject) => {
  const chunks = [];
  request.on('data', chunk => chunks.push(chunk));
  request.on('end', () => resolve(Buffer.concat(chunks)));
  request.on('error', reject);
});

const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');

(async () => {
  const candidateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mold-master-candidate-e2e-'));
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64'
  );
  const product = Buffer.concat([png, Buffer.from('product')]);
  const screenshot = Buffer.concat([png, Buffer.from('screenshot')]);
  const existing = Buffer.concat([png, Buffer.from('existing')]);
  fs.mkdirSync(path.join(candidateRoot, 'nested'));
  fs.writeFileSync(path.join(candidateRoot, 'rib-whitening-product.png'), product);
  fs.writeFileSync(path.join(candidateRoot, 'nested', 'rib-whitening-copy.jpg'), product);
  fs.writeFileSync(path.join(candidateRoot, 'error-screenshot.png'), screenshot);
  fs.writeFileSync(path.join(candidateRoot, 'already-approved.png'), existing);
  fs.writeFileSync(
    path.join(candidateRoot, 'vision-candidates.json'),
    JSON.stringify({
      schemaVersion: 1,
      policy: {
        persistence: 'none',
        autoApproval: false,
        graphPromotion: false,
        requiresHumanReview: true
      },
      candidates: [{
        relativePath: 'rib-whitening-product.png',
        defectType: '백화',
        defectClass: 'whitening',
        fieldContext: '원문 카드: 밀핀 백화. 취출 시 국부 응력 집중 여부를 확인한다.',
        contentSha256: sha256(product),
        requiresLabelReconciliation: true,
        labelEvidence: {
          sourceLabel: '웰드 라인',
          visionSuggestedLabel: '백화',
          visionConfidence: 0.91,
          visionSummary: '원문 라벨과 Vision 제안이 달라 사람 확인이 필요합니다.',
          conflict: true,
          nonPersisting: true
        },
        sourceLineage: {
          reviewSessionId: 'review-session-e2e',
          sourceDocumentId: 'doc-kcard-e2e',
          documentVersionId: 'dver-e2e',
          documentTitle: '현장 암묵지 검토 자료.pptx',
          knowledgeId: 'STD-KNOW-E2E-S003',
          cardVersion: 'v001',
          slideNumber: 3,
          figureId: 'FIG-S003-001',
          evidenceId: 'ev-e2e',
          assetUri: '/v1/assets/e2e',
          sourceContentHash: sha256(product),
          sourceReviewStatus: 'review_needed'
        }
      }]
    }, null, 2),
    'utf8'
  );

  const qaCalls = [];
  const diagnoseCalls = [];
  const server = http.createServer(async (request, response) => {
    const requestUrl = new URL(request.url, 'http://127.0.0.1');
    if (request.method === 'OPTIONS') {
      response.writeHead(204, {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET,POST,OPTIONS',
        'access-control-allow-headers': 'content-type'
      });
      response.end();
      return;
    }
    if (request.method === 'GET' && requestUrl.pathname === '/healthz') {
      sendJson(response, 200, { status: 'ok' });
      return;
    }
    if (request.method === 'GET' && requestUrl.pathname === '/v1/datasets/images') {
      sendJson(response, 200, {
        total: 1,
        items: [{
          image_id: 'existing-approved',
          file_name: 'already-approved.png',
          mime_type: 'image/png',
          defect_type: '밀핀 자국',
          question: '기존 승인 이미지',
          review_status: 'approved',
          observation: { summary: '기존 승인 이미지' },
          metadata: { content_sha256: sha256(existing) }
        }]
      });
      return;
    }
    if (
      request.method === 'GET'
      && requestUrl.pathname === '/v1/datasets/images/existing-approved/file'
    ) {
      response.writeHead(200, {
        'content-type': 'image/png',
        'content-length': String(existing.length),
        'access-control-allow-origin': '*'
      });
      response.end(existing);
      return;
    }
    if (request.method === 'POST' && requestUrl.pathname === '/internal/vision/describe') {
      const payload = JSON.parse((await readBody(request)).toString('utf8'));
      qaCalls.push(payload);
      sendJson(response, 200, {
        summary: '리브 주변의 응력성 백화가 관찰됩니다.',
        defect_type: '백화',
        process_area: 'injection-molding',
        severity: '보통',
        visible_features: ['리브 주변 밝은 변색'],
        possible_causes: ['취출 저항'],
        recommended_checks: ['리브 구배 확인'],
        labels: ['백화'],
        confidence: 0.91
      });
      return;
    }
    if (request.method === 'POST' && requestUrl.pathname === '/v1/vision/diagnose') {
      const body = await readBody(request);
      diagnoseCalls.push({
        contentType: String(request.headers['content-type'] || ''),
        body
      });
      sendJson(response, 200, {
        image_id: 'image-local-import',
        observation: {
          summary: '리브 주변 백화',
          defect_type: '백화',
          confidence: 0.91
        },
        answer: 'Graph 근거 기반 후보 분석',
        confidence: 0.8,
        evidence: [],
        review_status: 'candidate',
        metadata: {
          persisted_to_dataset: true
        },
        reasoning_trace: ['image_dataset_persisted=true']
      });
      return;
    }
    sendJson(response, 404, { detail: 'Not Found' });
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const profilePath = path.join(
    process.cwd(),
    'artifacts',
    `local-candidate-profile-${Date.now()}`
  );
  const executablePath = process.env.ELECTRON_EXECUTABLE_PATH;
  let app;
  try {
    const env = {
      ...process.env,
      MOLD_MASTER_TEST_LOCAL_VISION_ROOT: candidateRoot
    };
    app = await electron.launch(executablePath
      ? {
          executablePath: path.resolve(executablePath),
          args: [`--user-data-dir=${profilePath}`],
          env
        }
      : {
          args: ['.', `--user-data-dir=${profilePath}`],
          cwd: process.cwd(),
          env
        });
    const page = await app.firstWindow();
    const consoleErrors = [];
    page.on('console', message => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    await page.evaluate(async config => {
      await window.electronAPI.setApiConfig(config);
    }, {
      provider: 'openai',
      aiOrchestrationMode: 'common_agent_primary',
      agentServerUrl: baseUrl,
      visionQaServerUrl: baseUrl,
      shortcut: 'CommandOrControl+Shift+C'
    });

    await page.getByText('DATABASE TREE').click();
    await page.getByText('Common Agent Vision (1)').waitFor({ timeout: 15000 });
    await page.getByRole('button', { name: '로컬 후보 폴더 선택' }).click();
    await page.getByText(/로컬 후보 3건/).waitFor({ timeout: 15000 });
    const diagnoseCallsAfterScan = diagnoseCalls.length;

    const productCard = page.locator('article').filter({ hasText: 'rib-whitening-product.png' });
    await productCard.waitFor();
    const existingCard = page.locator('article').filter({ hasText: 'already-approved.png' });
    const warningCard = page.locator('article').filter({ hasText: 'error-screenshot.png' });
    await existingCard.getByText('이미 등록됨').waitFor();
    await warningCard.getByText('스크린샷/차트 가능성').waitFor();
    await productCard.getByText('원문 카드 연결').waitFor();
    await productCard.getByText('원문/AI 라벨 충돌').waitFor();
    await productCard.getByText(/현장 암묵지 검토 자료\.pptx · slide 3/).waitFor();
    const productLabelInput = productCard.locator('input[aria-label$="local defect label"]');
    const prefilledLabel = await productLabelInput.inputValue();
    const productCandidateId = String(await productLabelInput.getAttribute('aria-label') || '')
      .replace(' local defect label', '');
    const reconciliationBackendError = await page.evaluate(async id => {
      try {
        await window.electronAPI.importLocalVisionCandidate(id, {
          defectType: '백화',
          question: 'backend reconciliation guard'
        });
        return '';
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    }, productCandidateId);

    const warningAriaLabel = await warningCard
      .locator('input[aria-label$="local defect label"]')
      .getAttribute('aria-label');
    const warningCandidateId = String(warningAriaLabel || '').replace(' local defect label', '');
    fs.appendFileSync(path.join(candidateRoot, 'error-screenshot.png'), Buffer.from('changed'));
    const changedFileError = await page.evaluate(async id => {
      try {
        await window.electronAPI.suggestLocalVisionLabel(id);
        return '';
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    }, warningCandidateId);

    await productCard.getByRole('button', { name: 'AI 라벨 제안' }).click();
    await productCard.getByText(/비영속 AI 제안/).waitFor({ timeout: 30000 });
    const candidateId = await productCard.locator('input[aria-label$="local defect label"]').getAttribute('aria-label');
    const label = await productCard.locator('input[aria-label$="local defect label"]').inputValue();
    const diagnoseCallsAfterSuggestion = diagnoseCalls.length;
    const importButton = productCard.getByRole('button', { name: '검토 후보 등록' });
    const reconciliationButtonBlocked = await importButton.isDisabled();
    await productCard
      .locator(`input[aria-label="${productCandidateId} label reconciliation"]`)
      .check();
    await importButton.click();
    await page.getByText(/image-local-import 후보 등록 완료/).waitFor({ timeout: 30000 });

    const multipartText = diagnoseCalls[0]?.body.toString('utf8') || '';
    const screenshotPath = path.join(
      process.cwd(),
      'artifacts',
      'electron-local-vision-candidate.png'
    );
    await page.screenshot({ path: screenshotPath, fullPage: true });
    const result = {
      uniqueCandidates: 3,
      duplicateCollapsed: await page.getByText('파일 중복 제외 1').isVisible(),
      existingMarked: await existingCard.getByText('이미 등록됨').isVisible(),
      warningMarked: await warningCard.getByText('스크린샷/차트 가능성').isVisible(),
      manifestMatched: await page.getByText('원문 연결 1').isVisible(),
      sourceBadgeVisible: await productCard.getByText('원문 카드 연결').isVisible(),
      reconciliationGateVisible: await productCard.getByText('원문/AI 라벨 충돌').isVisible(),
      reconciliationBackendBlocked: reconciliationBackendError.includes('원문 라벨과 Vision 제안의 차이'),
      reconciliationButtonBlocked,
      prefilledLabel,
      changedFileBlocked: changedFileError.includes('원본 이미지가 변경'),
      diagnoseCallsAfterScan,
      diagnoseCallsAfterSuggestion,
      diagnoseCallCount: diagnoseCalls.length,
      qaCallCount: qaCalls.length,
      qaNonPersisting: qaCalls[0]?.context?.non_persisting === true,
      qaSourceSystem: qaCalls[0]?.context?.source_system,
      label,
      candidateId,
      persistAlways: /name="persist_mode"\r\n\r\nalways/.test(multipartText),
      sourceSystem: /name="source_system"\r\n\r\nmold-master-ai-local-candidate/.test(multipartText),
      proposedLabelIncluded: multipartText.includes('proposed_defect_type'),
      sourceLineageIncluded: multipartText.includes('doc-kcard-e2e')
        && multipartText.includes('source_slide_number'),
      sourceContextIncluded: multipartText.includes('원문 카드: 밀핀 백화'),
      labelReconciliationIncluded: multipartText.includes('label_reconciled')
        && multipartText.includes('source_proposed_defect_type')
        && multipartText.includes('vision_suggested_defect_type'),
      reviewCalls: 0,
      consoleErrors,
      screenshot: screenshotPath
    };
    console.log(JSON.stringify(result, null, 2));
    if (
      !result.duplicateCollapsed
      || !result.existingMarked
      || !result.warningMarked
      || !result.manifestMatched
      || !result.sourceBadgeVisible
      || !result.reconciliationGateVisible
      || !result.reconciliationBackendBlocked
      || !result.reconciliationButtonBlocked
      || result.prefilledLabel !== '백화'
      || !result.changedFileBlocked
      || result.diagnoseCallsAfterScan !== 0
      || result.diagnoseCallsAfterSuggestion !== 0
      || result.diagnoseCallCount !== 1
      || result.qaCallCount !== 1
      || !result.qaNonPersisting
      || result.qaSourceSystem !== 'mold-master-ai-local-candidate-suggestion'
      || result.label !== '백화'
      || !result.persistAlways
      || !result.sourceSystem
      || !result.proposedLabelIncluded
      || !result.sourceLineageIncluded
      || !result.sourceContextIncluded
      || !result.labelReconciliationIncluded
      || consoleErrors.length > 0
    ) {
      process.exitCode = 1;
    }
  } finally {
    if (app) await app.close();
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(candidateRoot, { recursive: true, force: true });
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
