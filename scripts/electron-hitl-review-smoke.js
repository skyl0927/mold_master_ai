const { _electron: electron } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

(async () => {
  let app;
  try {
    const artifactsDir = path.join(process.cwd(), 'artifacts');
    fs.mkdirSync(artifactsDir, { recursive: true });
    const samplePath = path.join(process.cwd(), 'assets', 'icon.png');
    const profilePath = path.join(artifactsDir, `hitl-e2e-profile-${Date.now()}`);

    app = await electron.launch({
      args: ['.', `--user-data-dir=${profilePath}`],
      cwd: process.cwd(),
      artifactsDir
    });
    const page = await app.firstWindow();
    const consoleErrors = [];
    let reviewPayload;
    let conflictQuerySeen = false;

    page.on('console', message => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    const initialConfig = await page.evaluate(() => window.electronAPI.getApiConfig());
    await page.evaluate(config => window.electronAPI.setApiConfig({
      ...config,
      aiOrchestrationMode: 'common_agent_primary'
    }), initialConfig || {});
    await page.route('**/v1/vision/diagnose', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        image_id: 'image-hitl-smoke',
        file_name: 'hitl-review-smoke.png',
        mime_type: 'image/png',
        source_system: 'mold-master-ai',
        observation: {
          defect_type: '밀핀 자국',
          severity: 'Medium',
          summary: '밀핀 위치의 원형 압흔',
          possible_causes: ['밀핀 돌출'],
          recommended_checks: ['밀핀 높이 확인']
        },
        answer: '밀핀 높이와 작동 밸런스를 확인하세요.',
        confidence: 0.9,
        evidence: [{
          text: '승인된 밀핀 자국 원인과 대책',
          review_status: 'approved',
          source_type: 'knowledge_entity',
          source_ref: 'entity-ejector-mark'
        }]
      })
    }));
    await page.route('**/v1/datasets/images?*', route => {
      conflictQuerySeen = true;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [], total: 0 })
      });
    });
    await page.route('**/v1/datasets/images/*/review', async route => {
      reviewPayload = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'reviewed',
          next_action: 'promoted_to_graph:doc-hitl-smoke',
          item: {
            image_id: 'image-hitl-smoke',
            defect_type: reviewPayload.defect_type,
            review_status: 'approved'
          },
          promotion: {
            image_id: 'image-hitl-smoke',
            document_id: 'doc-hitl-smoke',
            review_status: 'approved',
            entities: 3,
            relations: 2,
            persisted_to_graph: true
          }
        })
      });
    });

    await page.getByTitle('관리자 모드 전환').click();
    await page.getByPlaceholder('비밀번호 입력').fill('admin1234');
    await page.getByRole('button', { name: '로그인' }).click();
    await page.getByText('관리자 모드 활성화').waitFor();

    const imageInput = page.locator('input[type="file"][accept="image/*"]');
    await imageInput.setInputFiles(samplePath);
    await page.locator('select[aria-label^="Sample 1"]').nth(0).selectOption('physical_product');
    await page.locator('select[aria-label^="Sample 1"]').nth(1).selectOption('full_part_context');
    await imageInput.setInputFiles(samplePath);
    await page.locator('select[aria-label^="Sample 2"]').nth(0).selectOption('physical_product');
    await page.locator('select[aria-label^="Sample 2"]').nth(1).selectOption('defect_closeup');
    await page.getByLabel('Sample 1 현상 설명').fill('원형 밀핀 위치에 압흔이 발생함');
    await page.getByRole('button', { name: 'AI 진단' }).first().click();
    await page.getByText('밀핀 자국', { exact: true }).first().waitFor();
    await page.getByRole('button', { name: '승인·Graph 승격' }).click();
    await page.getByText('Common Agent 검토 승인 및 Graph 등록 완료!').waitFor({ timeout: 15000 });

    const screenshotPath = path.join(artifactsDir, 'electron-hitl-review.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    const result = {
      conflictQuerySeen,
      reviewEndpointCalled: Boolean(reviewPayload),
      correctedDefectType: reviewPayload?.defect_type,
      approved: reviewPayload?.decision === 'approve',
      promotesToGraph: reviewPayload?.promote_to_graph === true,
      reviewProtocolAttached: reviewPayload?.metadata?.vision_review_protocol_version === 'vision-hitl-review/v1',
      reviewNextAction: reviewPayload?.metadata?.vision_review_next_action,
      reviewQueue: reviewPayload?.metadata?.vision_review_re_evaluation_queue,
      graphPromotionAllowed: reviewPayload?.metadata?.vision_graph_promotion_allowed,
      learningCandidateEligible: reviewPayload?.metadata?.vision_learning_candidate_eligible,
      hasContentHash: /^[a-f0-9]{64}$/.test(reviewPayload?.metadata?.content_sha256 || ''),
      screenshot: screenshotPath,
      isolatedProfile: profilePath,
      consoleErrors
    };
    console.log(JSON.stringify(result, null, 2));
    if (
      !result.conflictQuerySeen
      || !result.reviewEndpointCalled
      || result.correctedDefectType !== '밀핀 자국'
      || !result.approved
      || !result.promotesToGraph
      || !result.reviewProtocolAttached
      || result.reviewNextAction !== 'promote_to_graph'
      || result.reviewQueue !== 'none'
      || result.graphPromotionAllowed !== true
      || result.learningCandidateEligible !== true
      || !result.hasContentHash
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
