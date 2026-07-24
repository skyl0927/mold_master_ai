const { _electron: electron } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

(async () => {
  let app;
  let originalConfig;
  let originalComparisonRecords;
  try {
    const artifactsDir = path.join(process.cwd(), 'artifacts');
    fs.mkdirSync(artifactsDir, { recursive: true });
    const samplePath = path.join(process.cwd(), 'assets', 'icon.png');

    app = await electron.launch({ args: ['.'], cwd: process.cwd(), artifactsDir });
    const page = await app.firstWindow();
    const consoleErrors = [];

    page.on('console', message => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    await page.route('**/v1/vision/diagnose', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          image_id: 'image-multimodal-smoke',
          file_name: 'multimodal-smoke-sample.png',
          mime_type: 'image/png',
          source_system: 'mold-master-ai',
          question: 'captured',
          observation: {
            contract_version: 'vision-observation/v2',
            image_kind: 'physical_product',
            normality_status: 'defect_visible',
            observations: [
              {
                observation_id: 'obs-color-1',
                category: 'color',
                description: '리브 기부에 유백색 영역이 보임',
                region: '리브 기부',
                confidence: 0.92
              },
              {
                observation_id: 'obs-boundary-1',
                category: 'boundary',
                description: '유백색 영역의 경계가 리브 방향으로 이어짐',
                region: '리브 주변',
                confidence: 0.78
              }
            ],
            defect_type: '비전 단계에서 신뢰하면 안 되는 라벨',
            candidates: [
              {
                defect_type: '백화',
                confidence: 0.76,
                supporting_observation_ids: ['obs-color-1'],
                contradicting_observation_ids: []
              },
              {
                defect_type: '스크래치',
                confidence: 0.31,
                supporting_observation_ids: ['obs-boundary-1'],
                contradicting_observation_ids: ['obs-color-1']
              }
            ],
            possible_causes: ['비전이 생성한 미검증 원인'],
            recommended_checks: ['비전이 생성한 미검증 대책']
          },
          answer: '승인된 Graph 근거를 우선 확인하세요.',
          confidence: 0.86,
          evidence: [{
            node_id: 'cause-whitening-1',
            text: '리브 주변 취출 저항은 백화를 유발할 수 있음',
            score: 0.91,
            source_type: 'knowledge_path',
            source_ref: 'graph:whitening-ejection'
          }],
          reasoning_trace: ['vision_observation', 'approved_graph_retrieval']
        })
      });
    });

    originalConfig = await page.evaluate(() => window.electronAPI.getApiConfig());
    originalComparisonRecords = await page.evaluate(() =>
      localStorage.getItem('mold-master-ai:diagnosis-comparisons:v1')
    );
    await page.evaluate(() => {
      window.__capturedVisionForm = {};
      const originalFetch = window.fetch.bind(window);
      window.fetch = async (input, init) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        if (url.includes('/v1/vision/diagnose') && init?.body instanceof FormData) {
          const captured = {};
          for (const [key, value] of init.body.entries()) {
            captured[key] = typeof value === 'string' ? value : `[File:${value.name}]`;
          }
          window.__capturedVisionForm = captured;
        }
        return originalFetch(input, init);
      };
    });
    await page.evaluate(config => window.electronAPI.setApiConfig({
      ...config,
      aiOrchestrationMode: 'common_agent_primary'
    }), originalConfig || {});

    const imageInput = page.locator('input[type="file"][accept="image/*"]');
    await imageInput.setInputFiles(samplePath);
    await page.getByLabel('Sample 1 이미지 종류').selectOption('physical_product');
    await page.getByLabel('Sample 1 촬영 시점').selectOption('full_part_context');
    await imageInput.setInputFiles(samplePath);
    await page.getByLabel('Sample 2 이미지 종류').selectOption('physical_product');
    await page.getByLabel('Sample 2 촬영 시점').selectOption('defect_closeup');
    await page.getByText('촬영 프로토콜 충족').first().waitFor();
    const fieldContext = '리브 주변 백화, 취출 시 딱 소리와 함께 제품이 튕김';
    await page.getByLabel('Sample 1 현상 설명').fill(fieldContext);
    await page.getByRole('button', { name: 'AI 진단' }).first().click();
    await page.getByText('진단 완료').waitFor({ timeout: 15000 });
    await page.getByText('구조화 Vision 관찰 및 Top-3').waitFor({ timeout: 10000 });

    const screenshotPath = path.join(artifactsDir, 'electron-multimodal-diagnosis.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    const bodyText = await page.locator('body').innerText();
    const capturedForm = await page.evaluate(() => window.__capturedVisionForm);
    const capturedMetadata = JSON.parse(capturedForm.metadata_json || '{}');
    const result = {
      questionContainsFieldContext: capturedForm.question.includes(fieldContext),
      metadataContainsContextFlag: capturedMetadata.context_provided === true,
      resultRendered: bodyText.includes('백화') && bodyText.includes('진단 완료'),
      groundedObservationRendered: bodyText.includes('vision-observation/v2')
        && bodyText.includes('obs-color-1')
        && bodyText.includes('리브 기부에 유백색 영역이 보임'),
      visionInferenceRejected: !bodyText.includes('비전이 생성한 미검증 원인')
        && !bodyText.includes('비전이 생성한 미검증 대책')
        && !bodyText.includes('비전 단계에서 신뢰하면 안 되는 라벨'),
      screenshot: screenshotPath,
      consoleErrors
    };
    console.log(JSON.stringify(result, null, 2));

    if (
      !result.questionContainsFieldContext
      || !result.metadataContainsContextFlag
      || !result.resultRendered
      || !result.groundedObservationRendered
      || !result.visionInferenceRejected
      || consoleErrors.length > 0
    ) {
      process.exitCode = 1;
    }
  } finally {
    if (app && originalConfig) {
      const page = app.windows()[0];
      if (page) await page.evaluate(config => window.electronAPI.setApiConfig(config), originalConfig);
    }
    if (app && originalComparisonRecords !== undefined) {
      const page = app.windows()[0];
      if (page) {
        await page.evaluate(records => {
          const key = 'mold-master-ai:diagnosis-comparisons:v1';
          if (records === null) localStorage.removeItem(key);
          else localStorage.setItem(key, records);
        }, originalComparisonRecords);
      }
    }
    if (app) await app.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
