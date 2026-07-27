const { _electron: electron } = require('playwright');
const path = require('node:path');

(async () => {
  const profilePath = path.join(process.cwd(), 'artifacts', `dataset-manager-profile-${Date.now()}`);
  let app;
  try {
    app = await electron.launch({
      args: ['.', `--user-data-dir=${profilePath}`],
      cwd: process.cwd()
    });
    const page = await app.firstWindow();
    await app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      window.setSize(1244, 574);
      window.center();
    });
    const consoleErrors = [];
    const failedRequests = [];
    const reviewCalls = [];
    let rejectedImageId = '';
    page.on('console', message => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('requestfailed', request => {
      failedRequests.push({
        url: request.url(),
        failure: request.failure()?.errorText || ''
      });
    });

    await page.route('http://agent.test/healthz', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'ok' })
    }));
    await page.route('http://agent.test/health', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'ok' })
    }));

    await page.evaluate(async () => {
      await window.electronAPI.setApiConfig({
        provider: 'openai',
        aiOrchestrationMode: 'dual_validation',
        agentServerUrl: 'http://agent.test',
        shortcut: 'CommandOrControl+Shift+C'
      });
    });

    const imageBytes = Buffer.from('duplicate-image-content');
    const getItems = () => [
      {
        image_id: 'clean-ejector',
        file_name: 'clean.png',
        defect_type: '밀핀 자국',
        review_status: 'approved',
        observation: { summary: '원형 밀핀 흔적' },
        metadata: { content_sha256: 'clean-hash' }
      },
      {
        image_id: 'duplicate-surface',
        file_name: 'duplicate-a.png',
        defect_type: '표면 결함',
        review_status: rejectedImageId === 'duplicate-surface' ? 'rejected' : 'approved',
        observation: { summary: '동일 이미지 첫 번째 라벨' },
        metadata: {}
      },
      {
        image_id: 'duplicate-flash',
        file_name: 'duplicate-b.png',
        defect_type: '플래시',
        review_status: 'approved',
        observation: { summary: '동일 이미지 두 번째 라벨' },
        metadata: {}
      }
    ];

    await page.route('http://agent.test/**', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'ok' })
    }));
    await page.route('http://agent.test/v1/vision/classifier/references/current', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ready: true,
        status: 'ready',
        store_dir: '/app/data/vision-reference-store',
        manifest_id: 'dinov2-base-ready',
        manifest_path: '/app/data/vision-reference-store/manifests/dinov2-base-ready.json',
        embedding_model_version: 'dinov2:facebook/dinov2-base',
        embedding_provider: 'dinov2',
        embedding_model_name: 'facebook/dinov2-base',
        embedding_dimensions: 768,
        embedding_device: 'cpu',
        embedding_runtime: 'transformers',
        embedding_production_ready: true,
        reference_count: 42,
        source_item_count: 44,
        source_learning_ready_only: true,
        generated_at: '2026-07-27T00:00:00Z',
        updated_at: '2026-07-27T00:01:00Z',
        warnings: []
      })
    }));
    await page.route('http://agent.test/v1/vision/classifier/references/refresh', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'promoted',
        manifest_id: 'dinov2-base-ready',
        reference_count: 42,
        store_dir: '/app/data/vision-reference-store',
        embedding_model_version: 'dinov2:facebook/dinov2-base',
        warnings: []
      })
    }));
    await page.route('http://agent.test/v1/datasets/images?**', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: getItems(), total: 3 })
    }));
    await page.route('http://agent.test/v1/datasets/images/*/file', route => route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: imageBytes
    }));
    await page.route('http://agent.test/v1/datasets/images/*/review', async route => {
      const request = route.request();
      const imageId = decodeURIComponent(request.url().split('/').at(-2));
      const payload = request.postDataJSON();
      reviewCalls.push({ imageId, payload });
      if (payload.decision === 'reject') rejectedImageId = imageId;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'reviewed',
          next_action: 'none',
          item: {
            image_id: imageId,
            defect_type: payload.defect_type,
            review_status: payload.decision === 'reject' ? 'rejected' : 'approved'
          }
        })
      });
    });

    await page.getByText('DATABASE TREE').click();
    await page.getByText(/유효 승인 1\/20 .* 충돌 1그룹/).waitFor({ timeout: 15000 });
    await page.getByTestId('vision-reference-store-status').getByText(/42 refs/).waitFor({ timeout: 15000 });
    const referenceStoreText = await page.getByTestId('vision-reference-store-status').textContent();
    const layout = await page.evaluate(() => {
      const modal = document.querySelector('[data-testid="dataset-manager-modal"]');
      const tabs = document.querySelector('[data-testid="dataset-manager-tabs"]');
      const scroll = document.querySelector('[data-testid="dataset-manager-scroll"]');
      const tabButtons = tabs ? Array.from(tabs.querySelectorAll('button')) : [];
      const modalRect = modal?.getBoundingClientRect();
      const tabsRect = tabs?.getBoundingClientRect();
      const scrollRect = scroll?.getBoundingClientRect();
      const scrollStyle = scroll ? getComputedStyle(scroll) : null;
      const scrollbarStyle = scroll ? getComputedStyle(scroll, '::-webkit-scrollbar') : null;
      const scrollbarThumbStyle = scroll ? getComputedStyle(scroll, '::-webkit-scrollbar-thumb') : null;
      return {
        viewport: { width: innerWidth, height: innerHeight },
        modal: modalRect ? { width: modalRect.width, height: modalRect.height } : null,
        tabs: tabsRect ? { width: tabsRect.width, height: tabsRect.height } : null,
        scroll: scrollRect ? { width: scrollRect.width, height: scrollRect.height } : null,
        tabButtons: tabButtons.map(button => {
          const rect = button.getBoundingClientRect();
          return {
            text: button.textContent?.trim(),
            width: rect.width,
            height: rect.height,
            visible: rect.width > 0 && rect.height > 0
          };
        }),
        scrollbarColor: scrollStyle?.scrollbarColor || '',
        scrollbarGutter: scrollStyle?.scrollbarGutter || '',
        webkitScrollbarWidth: scrollbarStyle?.width || '',
        webkitScrollbarThumbBackground:
          scrollbarThumbStyle?.backgroundImage
          || scrollbarThumbStyle?.backgroundColor
          || ''
      };
    });
    const conflictingCard = page.locator('article').filter({ hasText: 'duplicate-surface' });
    const approveButton = conflictingCard.getByRole('button', { name: '승인 + Graph' });
    const approvalInitiallyDisabled = await approveButton.isDisabled();
    await conflictingCard.getByRole('button', { name: '오류 레코드 반려' }).click();
    await page.getByText(/유효 승인 2\/20 .* 충돌 0그룹/).waitFor({ timeout: 15000 });

    const remainingCard = page.locator('article').filter({ hasText: 'duplicate-flash' });
    const remainingApprovalEnabled = await remainingCard
      .getByRole('button', { name: '승인 + Graph' })
      .isEnabled();
    const screenshot = path.join(process.cwd(), 'artifacts', 'electron-dataset-manager.png');
    await page.screenshot({ path: screenshot });
    const result = {
      initialConflictBlockedApproval: approvalInitiallyDisabled,
      reviewEndpointCalled: reviewCalls.length === 1,
      rejectedImageId: reviewCalls[0]?.imageId,
      rejectionDecision: reviewCalls[0]?.payload?.decision,
      contentHashForwarded: Boolean(reviewCalls[0]?.payload?.metadata?.content_sha256),
      conflictResolved: rejectedImageId === 'duplicate-surface',
      remainingApprovalEnabled,
      referenceStatusVisible: /dinov2:facebook\/dinov2-base/.test(referenceStoreText || ''),
      layout,
      screenshot,
      isolatedProfile: profilePath,
      failedRequests,
      consoleErrors
    };
    console.log(JSON.stringify(result, null, 2));

    if (
      !result.initialConflictBlockedApproval
      || !result.reviewEndpointCalled
      || result.rejectedImageId !== 'duplicate-surface'
      || result.rejectionDecision !== 'reject'
      || !result.contentHashForwarded
      || !result.conflictResolved
      || !result.remainingApprovalEnabled
      || !result.referenceStatusVisible
      || !result.layout.modal
      || result.layout.modal.height < result.layout.viewport.height * 0.95
      || !result.layout.tabs
      || result.layout.tabs.height < 50
      || result.layout.tabButtons.length !== 4
      || result.layout.tabButtons.some(button => !button.visible || button.height < 34)
      || !result.layout.scroll
      || result.layout.scroll.height < 380
      || result.layout.webkitScrollbarWidth !== '16px'
      || !/linear-gradient|34,\s*211,\s*238/.test(
        result.layout.webkitScrollbarThumbBackground
      )
      || result.layout.scrollbarGutter !== 'stable'
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
