const { _electron: electron } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

const SAMPLE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=',
  'base64'
);

(async () => {
  let app;
  let originalConfig;
  let originalComparisonRecords;
  try {
    const artifactsDir = path.join(process.cwd(), 'artifacts');
    fs.mkdirSync(artifactsDir, { recursive: true });
    const samplePath = path.join(artifactsDir, 'multimodal-smoke-sample.png');
    fs.writeFileSync(samplePath, SAMPLE_PNG);

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
            defect_type: '백화',
            severity: 'Medium',
            summary: '리브 주변에 백화가 관찰됨',
            possible_causes: ['취출 저항'],
            recommended_checks: ['구배와 이젝터 밸런스 확인']
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

    await page.locator('input[type="file"][accept="image/*"]').setInputFiles(samplePath);
    const fieldContext = '리브 주변 백화, 취출 시 딱 소리와 함께 제품이 튕김';
    await page.getByLabel('Sample 1 현상 설명').fill(fieldContext);
    await page.getByRole('button', { name: 'AI 진단' }).click();
    await page.getByText('진단 완료').waitFor({ timeout: 15000 });

    const screenshotPath = path.join(artifactsDir, 'electron-multimodal-diagnosis.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    const bodyText = await page.locator('body').innerText();
    const capturedForm = await page.evaluate(() => window.__capturedVisionForm);
    const capturedMetadata = JSON.parse(capturedForm.metadata_json || '{}');
    const result = {
      questionContainsFieldContext: capturedForm.question.includes(fieldContext),
      metadataContainsContextFlag: capturedMetadata.context_provided === true,
      resultRendered: bodyText.includes('백화') && bodyText.includes('진단 완료'),
      screenshot: screenshotPath,
      consoleErrors
    };
    console.log(JSON.stringify(result, null, 2));

    if (
      !result.questionContainsFieldContext
      || !result.metadataContainsContextFlag
      || !result.resultRendered
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
