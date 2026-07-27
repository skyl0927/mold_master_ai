const { _electron: electron } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

(async () => {
  let app;
  try {
    const artifactsDir = path.join(process.cwd(), 'artifacts');
    fs.mkdirSync(artifactsDir, { recursive: true });
    const samplePath = path.join(process.cwd(), 'assets', 'icon.png');
    const profilePath = path.join(artifactsDir, `vision-recapture-policy-profile-${Date.now()}`);
    fs.mkdirSync(profilePath, { recursive: true });
    fs.writeFileSync(path.join(profilePath, 'apiConfig.json'), JSON.stringify({
      provider: 'openai',
      aiOrchestrationMode: 'common_agent_primary',
      agentServerUrl: 'http://127.0.0.1:8000',
      visionQaServerUrl: 'http://127.0.0.1:8103',
      ragServerUrl: 'http://127.0.0.1:5001',
      shortcut: 'CommandOrControl+Shift+C'
    }, null, 2));

    app = await electron.launch({
      args: ['.', `--user-data-dir=${profilePath}`],
      cwd: process.cwd(),
      artifactsDir
    });
    const page = await app.firstWindow();
    const consoleErrors = [];

    page.on('console', message => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });

    await page.getByTitle('관리자 모드 전환').click();
    await page.getByPlaceholder('비밀번호 입력').fill('admin1234');
    await page.getByRole('button', { name: '로그인' }).click();
    await page.getByText('관리자 모드 활성화').waitFor();

    await page.route('**/v1/vision/diagnose', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          image_id: 'image-recapture-policy-smoke',
          file_name: 'recapture-policy-smoke.png',
          mime_type: 'image/png',
          source_system: 'mold-master-ai',
          observation: {
            contract_version: 'vision-observation/v2',
            image_kind: 'physical_product',
            normality_status: 'defect_visible',
            observations: [
              {
                observation_id: 'obs-blurry-color',
                category: 'color',
                description: '리브 주변에 유백색으로 보이는 흐린 영역',
                region: '리브 기부',
                confidence: 0.91
              },
              {
                observation_id: 'obs-crop-risk',
                category: 'location',
                description: '의심 영역이 ROI 하단에 일부만 포함됨',
                region: 'ROI 하단',
                confidence: 0.86
              }
            ],
            candidates: [
              {
                defect_type: '백화',
                confidence: 0.93,
                supporting_observation_ids: ['obs-blurry-color', 'obs-crop-risk'],
                contradicting_observation_ids: []
              },
              {
                defect_type: '싱크',
                confidence: 0.12,
                supporting_observation_ids: ['obs-crop-risk'],
                contradicting_observation_ids: ['obs-blurry-color']
              }
            ],
            required_additional_views: ['초점 보정 후 리브 기부 근접 촬영'],
            quality_concerns: [
              'motion blur hides the defect edge',
              'ROI too small for surface diagnosis'
            ],
            abstention_reason: '',
            possible_causes: ['비전이 생성한 미검증 원인'],
            recommended_checks: ['비전이 생성한 미검증 대책']
          },
          answer: '품질 문제로 재촬영이 필요합니다.',
          confidence: 0.91,
          evidence: [],
          metadata: {
            llm_supplement_used: false
          },
          reasoning_trace: ['vision_observation', 'image_quality_rejected']
        })
      });
    });

    const imageInput = page.locator('input[type="file"][accept="image/*"]');
    await imageInput.setInputFiles(samplePath);
    await page.getByLabel('Sample 1 이미지 종류').selectOption('physical_product');
    await page.getByLabel('Sample 1 촬영 시점').selectOption('full_part_context');
    await imageInput.setInputFiles(samplePath);
    await page.getByLabel('Sample 2 이미지 종류').selectOption('physical_product');
    await page.getByLabel('Sample 2 촬영 시점').selectOption('defect_closeup');
    await page.getByText('촬영 프로토콜 충족').first().waitFor();
    await page.getByLabel('Sample 1 현상 설명').fill('리브 주변 백화 의심. 사진은 흐리고 결함 영역이 작게 캡처됨');
    await page.getByRole('button', { name: 'AI 진단' }).first().click();
    await page.getByText('판정 보류').first().waitFor({ timeout: 15000 });
    await page.getByText('Vision 판정 사용 정책').waitFor({ timeout: 10000 });

    const screenshotPath = path.join(artifactsDir, 'electron-vision-recapture-policy.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    const bodyText = await page.locator('body').innerText();
    const approvedGraphButtonVisible = await page
      .getByRole('button', { name: '승인·Graph 승격' })
      .isVisible()
      .catch(() => false);
    const result = {
      blockedPolicyRendered: bodyText.includes('Graph 사용 금지: 재촬영/HITL 전용'),
      recaptureReasonRendered: bodyText.includes('재촬영/검토 사유')
        && bodyText.includes('motion blur hides the defect edge')
        && bodyText.includes('ROI too small for surface diagnosis')
        && bodyText.includes('초점 보정 후 리브 기부 근접 촬영'),
      evidenceAreaRendered: bodyText.includes('AI가 본 근거 영역')
        && bodyText.includes('영역: 리브 기부'),
      causeActionBlockedRendered: bodyText.includes('원인/대책 생성 차단')
        && bodyText.includes('Vision 후보를 Graph에 사용할 수 없어 재촬영 또는 HITL 확정 전까지 원인/대책을 작성하지 않습니다.'),
      graphPromotionBlockedActionRendered: bodyText.includes('Graph 승격 차단')
        && !approvedGraphButtonVisible,
      unverifiedVisionContentSuppressed: !bodyText.includes('비전이 생성한 미검증 원인')
        && !bodyText.includes('비전이 생성한 미검증 대책'),
      screenshot: screenshotPath,
      consoleErrors
    };
    console.log(JSON.stringify(result, null, 2));

    if (
      !result.blockedPolicyRendered
      || !result.recaptureReasonRendered
      || !result.evidenceAreaRendered
      || !result.causeActionBlockedRendered
      || !result.graphPromotionBlockedActionRendered
      || !result.unverifiedVisionContentSuppressed
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
