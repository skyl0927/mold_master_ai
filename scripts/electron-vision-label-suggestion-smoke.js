const { _electron: electron } = require('playwright');
const http = require('node:http');
const path = require('node:path');

const readJsonBody = request => new Promise((resolve, reject) => {
  const chunks = [];
  request.on('data', chunk => chunks.push(chunk));
  request.on('end', () => {
    try {
      resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
    } catch (error) {
      reject(error);
    }
  });
  request.on('error', reject);
});

const sendJson = (response, status, payload) => {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*'
  });
  response.end(JSON.stringify(payload));
};

(async () => {
  const qaCalls = [];
  const reviewCalls = [];
  const imageBytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64'
  );
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
        total: 2,
        items: [
          {
            image_id: 'candidate-whitening',
            file_name: 'candidate-whitening.png',
            mime_type: 'image/png',
            defect_type: reviewCalls.at(-1)?.defect_type || '표면 이상',
            question: '리브 주변이 하얗게 변했습니다.',
            review_status: reviewCalls.length > 0 ? 'approved' : 'candidate',
            observation: { summary: '리브 주변 밝은 변색' },
            metadata: {}
          },
          {
            image_id: 'candidate-invalid',
            file_name: 'candidate-invalid.png',
            mime_type: 'image/png',
            defect_type: null,
            question: '검토할 제품 사진입니다.',
            review_status: 'candidate',
            observation: { summary: '제품 형상 확인 필요' },
            metadata: {}
          }
        ]
      });
      return;
    }
    if (
      request.method === 'GET'
      && /^\/v1\/datasets\/images\/candidate-(?:whitening|invalid)\/file$/.test(requestUrl.pathname)
    ) {
      response.writeHead(200, {
        'content-type': 'image/png',
        'content-length': String(imageBytes.length),
        'access-control-allow-origin': '*'
      });
      response.end(imageBytes);
      return;
    }
    if (request.method === 'POST' && requestUrl.pathname === '/internal/vision/describe') {
      const payload = await readJsonBody(request);
      qaCalls.push(payload);
      if (payload.context?.source_image_id === 'candidate-invalid') {
        sendJson(response, 200, {
          summary: '사출 성형품 이미지가 아니어서 결함을 판정할 수 없습니다.',
          defect_type: '판정 불가(성형 이미지 미제공)',
          possible_causes: ['오류 화면이 업로드됨'],
          recommended_checks: ['실제 제품 사진 재등록'],
          confidence: 0.99
        });
        return;
      }
      sendJson(response, 200, {
        summary: '리브 주변에 응력성 백화가 관찰됩니다.',
        defect_type: '백화',
        process_area: 'injection-molding',
        severity: '보통',
        visible_features: ['리브 주변 밝은 변색'],
        possible_causes: ['취출 저항', '구배 부족'],
        recommended_checks: ['리브 구배 확인', '취출 균형 확인'],
        labels: ['백화'],
        confidence: 0.91
      });
      return;
    }
    if (
      request.method === 'POST'
      && requestUrl.pathname === '/v1/datasets/images/candidate-whitening/review'
    ) {
      const payload = await readJsonBody(request);
      reviewCalls.push(payload);
      sendJson(response, 200, {
        status: 'reviewed',
        next_action: 'none',
        item: {
          image_id: 'candidate-whitening',
          defect_type: payload.defect_type,
          review_status: 'approved'
        },
        promotion: {
          image_id: 'candidate-whitening',
          document_id: 'doc-candidate-whitening',
          review_status: 'approved',
          entities: 4,
          relations: 3
        }
      });
      return;
    }
    sendJson(response, 404, { detail: 'Not Found' });
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const profilePath = path.join(
    process.cwd(),
    'artifacts',
    `vision-suggestion-profile-${Date.now()}`
  );
  const executablePath = process.env.ELECTRON_EXECUTABLE_PATH;
  let app;
  try {
    app = await electron.launch(executablePath
      ? {
          executablePath: path.resolve(executablePath),
          args: [`--user-data-dir=${profilePath}`]
        }
      : {
          args: ['.', `--user-data-dir=${profilePath}`],
          cwd: process.cwd()
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
      aiOrchestrationMode: 'dual_validation',
      agentServerUrl: baseUrl,
      visionQaServerUrl: baseUrl,
      shortcut: 'CommandOrControl+Shift+C'
    });

    await page.getByText('DATABASE TREE').click();
    const invalidCard = page.locator('article').filter({ hasText: 'candidate-invalid' });
    await invalidCard.waitFor({ timeout: 15000 });
    const invalidInput = invalidCard.getByLabel('candidate-invalid defect label');
    const invalidOriginalLabel = await invalidInput.inputValue();
    await invalidCard.getByRole('button', { name: 'AI 라벨 제안' }).click();
    await invalidCard.getByText('비영속 AI 판정 불가').waitFor({ timeout: 30000 });
    const invalidLabelAfterSuggestion = await invalidInput.inputValue();
    const invalidReviewCalls = reviewCalls.length;

    const card = page.locator('article').filter({ hasText: 'candidate-whitening' });
    await card.waitFor({ timeout: 15000 });
    await card.getByRole('button', { name: 'AI 라벨 제안' }).click();
    const labelInput = card.getByLabel('candidate-whitening defect label');
    await page.waitForFunction(() => (
      document.querySelector('[aria-label="candidate-whitening defect label"]')?.value === '백화'
    ), null, { timeout: 30000 });
    await card.getByText('비영속 AI 제안').waitFor();
    const suggestedLabel = await labelInput.inputValue();
    const reviewCallsBeforeApproval = reviewCalls.length;
    await card.getByRole('button', { name: '승인 + Graph' }).click();
    await page.getByText(/Common Agent 승인 및 Graph 승격 완료/).waitFor({ timeout: 15000 });

    const screenshot = path.join(
      process.cwd(),
      'artifacts',
      'electron-vision-label-suggestion.png'
    );
    await page.screenshot({ path: screenshot, fullPage: true });
    const result = {
      suggestedLabel,
      qaCallCount: qaCalls.length,
      nonPersistingContext: qaCalls.every(call => call.context?.non_persisting === true),
      sourceSystem: qaCalls.every(call =>
        call.context?.source_system === 'mold-master-ai-hitl-suggestion'
      ),
      invalidOriginalLabel,
      invalidLabelAfterSuggestion,
      invalidReviewCalls,
      reviewCallsBeforeApproval,
      reviewCallCount: reviewCalls.length,
      reviewedLabel: reviewCalls[0]?.defect_type,
      promoteToGraph: reviewCalls[0]?.promote_to_graph,
      executablePath: executablePath ? path.resolve(executablePath) : 'development-electron',
      screenshot,
      isolatedProfile: profilePath,
      consoleErrors
    };
    console.log(JSON.stringify(result, null, 2));
    if (
      result.suggestedLabel !== '백화'
      || result.qaCallCount !== 2
      || !result.nonPersistingContext
      || !result.sourceSystem
      || result.invalidOriginalLabel !== ''
      || result.invalidLabelAfterSuggestion !== ''
      || result.invalidReviewCalls !== 0
      || result.reviewCallsBeforeApproval !== 0
      || result.reviewCallCount !== 1
      || result.reviewedLabel !== '백화'
      || result.promoteToGraph !== true
      || consoleErrors.length > 0
    ) {
      process.exitCode = 1;
    }
  } finally {
    if (app) await app.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
