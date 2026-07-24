const { _electron: electron } = require('playwright');
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

(async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mold-master-web-hitl-'));
  const profilePath = path.join(tempRoot, 'profile');
  const collectionRoot = path.join(
    process.cwd(),
    'artifacts',
    'web-injection-defect-cases-20260724T045605'
  );
  const requests = [];
  const server = http.createServer((request, response) => {
    let body = '';
    request.on('data', chunk => { body += chunk.toString(); });
    request.on('end', () => {
      requests.push({
        method: request.method,
        url: request.url,
        body: body ? JSON.parse(body) : null
      });
      if (request.method === 'GET' && request.url === '/healthz') {
        sendJson(response, 200, { status: 'ok' });
        return;
      }
      if (request.method === 'GET' && request.url?.startsWith('/v1/datasets/images')) {
        sendJson(response, 200, { total: 0, items: [] });
        return;
      }
      if (request.method === 'GET' && request.url?.startsWith('/v1/documents/')) {
        sendJson(response, 200, {
          document_id: decodeURIComponent(request.url.split('/').at(-1)),
          file_name: 'web-hitl-smoke.json',
          review_status: 'approved',
          blocks: [],
          clusters: []
        });
        return;
      }
      if (request.method === 'POST' && request.url === '/v1/ingestions/template/validate') {
        sendJson(response, 200, {
          ready_to_ingest: true,
          quality_score: 92,
          item_count: 1,
          image_count: 0,
          error_count: 0,
          warning_count: 1,
          info_count: 0,
          issues: []
        });
        return;
      }
      if (request.method === 'POST' && request.url === '/v1/workflows/ingest-template') {
        sendJson(response, 200, {
          status: 'candidate',
          document_id: JSON.parse(body).document_id,
          graph_promoted: false
        });
        return;
      }
      if (request.method === 'POST' && request.url === '/v1/feedback') {
        sendJson(response, 200, {
          status: 'accepted',
          target_id: JSON.parse(body).target_id,
          document_id: JSON.parse(body).target_id,
          review_status: 'approved'
        });
        return;
      }
      if (request.method === 'POST' && request.url === '/v1/ask') {
        sendJson(response, 200, {
          query_id: 'query-web-hitl-smoke',
          answer: '웰드라인은 유동 선단이 만나는 위치에서 발생하며 사출 속도, 수지 온도와 배기를 확인한다.',
          confidence: 0.91,
          evidence: [{
            node_id: 'node-web-hitl-smoke',
            text: '웰드라인 원인과 대책',
            score: 0.93,
            source_type: 'knowledge_graph',
            source_ref: requests.find(item => item.url === '/v1/workflows/ingest-template')?.body?.document_id,
            review_status: 'approved',
            metadata: {}
          }],
          reasoning_trace: [
            'evidence_policy=graph_approved_only',
            'source_counts=knowledge_graph:1'
          ]
        });
        return;
      }
      sendJson(response, 404, { detail: 'Not Found' });
    });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  let app;
  try {
    app = await electron.launch({
      args: ['.', `--user-data-dir=${profilePath}`],
      cwd: process.cwd(),
      env: {
        ...process.env,
        MOLD_MASTER_WEB_CASE_ROOT: collectionRoot
      }
    });
    const page = await app.firstWindow();
    await app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      window.setSize(1244, 574);
      window.center();
    });
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
    await page.getByRole('button', { name: 'Web Case HITL (40)' }).click();
    await page.getByText('카드 40건 · 이미지 해시 16건 검증 완료').waitFor({ timeout: 20000 });
    const compactLayout = await page.evaluate(() => {
      const modal = document.querySelector('[data-testid="dataset-manager-modal"]');
      const tabs = document.querySelector('[data-testid="dataset-manager-tabs"]');
      const scroll = document.querySelector('[data-testid="dataset-manager-scroll"]');
      const modalRect = modal?.getBoundingClientRect();
      const tabsRect = tabs?.getBoundingClientRect();
      const scrollRect = scroll?.getBoundingClientRect();
      return {
        viewportHeight: innerHeight,
        modalHeight: modalRect?.height || 0,
        tabsHeight: tabsRect?.height || 0,
        scrollHeight: scrollRect?.height || 0,
        tabButtonCount: tabs?.querySelectorAll('button').length || 0
      };
    });

    const validateButton = page.getByRole('button', { name: 'Common Agent 비저장 검증' });
    const ingestButton = page.getByRole('button', { name: '후보 적재' });
    const blockedBeforeReview = await validateButton.isDisabled() && await ingestButton.isDisabled();
    const translationButtonVisible = await page
      .getByRole('button', { name: '한글 번역 후 삽입' })
      .isVisible();

    const reviewedProblem = '사출 성형품에 웰드라인이 발생한다.';
    const reviewedPhenomenon = '충전 중 두 유동 선단이 만나는 위치에 선형 자국이 나타난다.';
    const reviewedCause = '온도가 낮은 두 유동 선단이 만나 충분히 융착되지 않는다.';
    const reviewedCheck = '벤트 채널 오염과 유동 선단 온도를 확인한다.';
    const reviewedAction = '수지 온도와 사출 속도를 검증 범위에서 조정하고 벤트를 청소한다.';
    await page.getByLabel('검토 문제 정의').fill(reviewedProblem);
    await page.getByLabel('검토 현상 설명').fill(reviewedPhenomenon);
    await page.getByLabel('상세 원인 후보 (원인별 줄바꿈)').fill(reviewedCause);
    await page.locator('label').filter({ hasText: /확인 항목/ }).locator('textarea').fill(reviewedCheck);
    await page.locator('label').filter({ hasText: /대책/ }).locator('textarea').fill(reviewedAction);
    await page.getByPlaceholder('이름 또는 사번').fill('smoke-reviewer');
    await page.getByPlaceholder('근거 확인 내용 또는 수정/반려 사유').fill('격리 테스트 프로필에서 원문 근거를 확인함.');
    await page.locator('input[type="checkbox"]').last().check();
    await page.getByRole('button', { name: 'HITL 승인' }).click();
    try {
      await page.getByText(/로컬 HITL 승인을 저장했습니다/).waitFor({ timeout: 15000 });
    } catch (error) {
      console.error('HITL status snapshot:', await page.locator('body').innerText());
      throw error;
    }
    await page.locator('main h3').getByText('박리', { exact: true }).waitFor({ timeout: 15000 });
    const reviewerRetainedForNextCard = await page.getByPlaceholder('이름 또는 사번').inputValue()
      === 'smoke-reviewer';
    await page.getByRole('combobox', { name: 'HITL 상태 필터' }).selectOption('approved');
    await page.locator('aside button').filter({ hasText: '웰드라인' }).first().click();

    await validateButton.click();
    await page.getByText(/Common Agent 비저장 검증: 통과/).waitFor({ timeout: 15000 });
    await ingestButton.click();
    await page.getByText(/Common Agent 후보 적재 완료/).waitFor({ timeout: 15000 });
    const centralApproveButton = page.getByRole('button', { name: '중앙 승인 + Graph 활성화' });
    const centralBlockedWithoutSecondConfirmation = await centralApproveButton.isDisabled();
    await page.locator('input[type="checkbox"]').last().check();
    await centralApproveButton.click();
    await page.getByText(/Common Agent 문서 승인과 Graph review 상태 동기화를 완료했습니다/).waitFor({ timeout: 15000 });
    await page.getByRole('button', { name: 'Graph 왕복 검증' }).click();
    await page.getByText(/Graph 승인 근거 왕복 검증 통과/).waitFor({ timeout: 15000 });
    await page.getByText(/승인 Graph 왕복 결과 · PASS/).waitFor({ timeout: 15000 });

    const screenshot = path.join(process.cwd(), 'artifacts', 'electron-web-knowledge-hitl.png');
    await page.locator('[data-testid="dataset-manager-scroll"] main')
      .evaluate(element => { element.scrollTop = 0; });
    await page.screenshot({ path: screenshot });
    const decisionLedger = JSON.parse(fs.readFileSync(
      path.join(profilePath, 'web-knowledge-review-decisions.json'),
      'utf8'
    ));
    const ingestionLedger = JSON.parse(fs.readFileSync(
      path.join(profilePath, 'web-knowledge-central-ingestions.json'),
      'utf8'
    ));
    const validationRequests = requests.filter(item =>
      item.method === 'POST' && item.url === '/v1/ingestions/template/validate'
    );
    const ingestionRequests = requests.filter(item =>
      item.method === 'POST' && item.url === '/v1/workflows/ingest-template'
    );
    const approvalRequests = requests.filter(item =>
      item.method === 'POST' && item.url === '/v1/feedback'
    );
    const askRequests = requests.filter(item =>
      item.method === 'POST' && item.url === '/v1/ask'
    );
    const documentChecks = requests.filter(item =>
      item.method === 'GET' && item.url.startsWith('/v1/documents/')
    );
    const result = {
      integrityDisplayed: true,
      compactLayout,
      blockedBeforeReview,
      translationButtonVisible,
      persistedDecision: decisionLedger.decisions?.[0]?.decision,
      persistedKoreanReview:
        decisionLedger.decisions?.[0]?.problem === reviewedProblem
        && decisionLedger.decisions?.[0]?.phenomenon === reviewedPhenomenon
        && decisionLedger.decisions?.[0]?.causeCandidates?.[0] === reviewedCause,
      autoAdvancedToNextPending: true,
      reviewerRetainedForNextCard,
      templateItemCount: ingestionRequests[0]?.body?.items?.length,
      remoteReviewStatus: ingestionRequests[0]?.body?.metadata?.review_status,
      graphPromotionBlocked:
        ingestionRequests[0]?.body?.metadata?.graph_promotion_allowed_before_review === false,
      koreanTemplateInserted:
        ingestionRequests[0]?.body?.items?.[0]?.problem === reviewedProblem
        && ingestionRequests[0]?.body?.items?.[0]?.phenomenon === reviewedPhenomenon
        && ingestionRequests[0]?.body?.items?.[0]?.cause_candidates?.[0] === reviewedCause
        && ingestionRequests[0]?.body?.items?.[0]?.check_items?.[0] === reviewedCheck
        && ingestionRequests[0]?.body?.items?.[0]?.actions?.[0] === reviewedAction,
      validationRequestCount: validationRequests.length,
      ingestionRequestCount: ingestionRequests.length,
      approvalRequestCount: approvalRequests.length,
      askRequestCount: askRequests.length,
      documentApprovalCheckCount: documentChecks.length,
      approvalTargetType: approvalRequests[0]?.body?.target_type,
      approvalDecision: approvalRequests[0]?.body?.decision,
      roundtripPolicy: askRequests[0]?.body?.filters?.evidence_policy,
      centralBlockedWithoutSecondConfirmation,
      ingestionLedgerCount: ingestionLedger.ingestions?.length,
      centralReviewStatus: ingestionLedger.ingestions?.[0]?.centralReviewStatus,
      screenshot,
      consoleErrors
    };
    console.log(JSON.stringify(result, null, 2));
    if (
      !result.blockedBeforeReview
      || !result.translationButtonVisible
      || !result.persistedKoreanReview
      || result.compactLayout.modalHeight < result.compactLayout.viewportHeight * 0.95
      || result.compactLayout.tabsHeight < 50
      || result.compactLayout.scrollHeight < 380
      || result.compactLayout.tabButtonCount !== 4
      || result.persistedDecision !== 'approved'
      || !result.autoAdvancedToNextPending
      || !result.reviewerRetainedForNextCard
      || result.templateItemCount !== 1
      || result.remoteReviewStatus !== 'candidate'
      || !result.graphPromotionBlocked
      || !result.koreanTemplateInserted
      || result.validationRequestCount !== 2
      || result.ingestionRequestCount !== 1
      || result.approvalRequestCount !== 1
      || result.askRequestCount !== 1
      || result.documentApprovalCheckCount !== 2
      || result.approvalTargetType !== 'document'
      || result.approvalDecision !== 'approve'
      || result.roundtripPolicy !== 'graph_approved_only'
      || !result.centralBlockedWithoutSecondConfirmation
      || result.ingestionLedgerCount !== 1
      || result.centralReviewStatus !== 'approved'
      || result.consoleErrors.length > 0
    ) {
      process.exitCode = 1;
    }
  } finally {
    if (app) await app.close();
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
