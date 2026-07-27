const { _electron: electron } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

(async () => {
  let app;
  try {
    const executablePath = process.env.ELECTRON_EXECUTABLE_PATH;
    app = await electron.launch(executablePath
      ? { executablePath, args: [], cwd: path.dirname(executablePath) }
      : { args: ['.'], cwd: process.cwd() });
    const page = await app.firstWindow();
    const errors = [];
    page.on('console', message => {
      if (message.type() === 'error') errors.push(message.text());
    });

    await page.evaluate(records => {
      localStorage.setItem('mold-master-ai:diagnosis-comparisons:v1', JSON.stringify(records));
      localStorage.setItem('mold-master-ai:vision-operational-release:v1', JSON.stringify({
        schemaVersion: 'vision-operational-release/v1',
        generatedAt: '2026-07-24T02:00:00.000Z',
        decision: 'rollback_required',
        releaseAllowed: false,
        baselineVersion: {
          modelVersion: 'vision-model-2026.06',
          promptVersion: 'vision-prompt-v5',
          graphVersion: 'approved-graph-42'
        },
        candidateVersion: {
          modelVersion: 'vision-model-2026.07',
          promptVersion: 'vision-prompt-v6',
          graphVersion: 'approved-graph-43'
        },
        rollbackTarget: {
          modelVersion: 'vision-model-2026.06',
          promptVersion: 'vision-prompt-v5',
          graphVersion: 'approved-graph-42'
        },
        baseline: {
          samples: 30,
          top1Accuracy: 0.9,
          top3Accuracy: 1,
          selectiveAccuracy: 0.9,
          selectiveCoverage: 1,
          unsafeFalsePositiveRate: 0.1,
          expectedCalibrationError: 0.05,
          p95LatencyMs: 480,
          minimumClassReproduction: 0.9
        },
        candidate: {
          samples: 30,
          top1Accuracy: 0.7,
          top3Accuracy: 0.9,
          selectiveAccuracy: 0.7,
          selectiveCoverage: 1,
          unsafeFalsePositiveRate: 0.3,
          expectedCalibrationError: 0.2,
          p95LatencyMs: 1800,
          minimumClassReproduction: 0.7
        },
        splitAudit: { passed: true, sampleCount: 60, issues: [] },
        cohorts: [],
        checks: { top1Accuracy: false },
        blockingReasons: ['top1Accuracy', 'unsafeFalsePositive', 'calibration', 'latency']
      }));
    }, [
      {
        id: 'smoke-1',
        imageId: 'image-1',
        createdAt: '2026-07-24T01:00:00.000Z',
        strategy: 'dual_validation',
        selectedSource: 'common_agent',
        fallbackUsed: false,
        commonAgentSuccess: true,
        legacySuccess: true,
        commonAgentDurationMs: 120,
        legacyDurationMs: 410,
        defectTypeAgreement: true,
        commonAgentClassifiable: true,
        legacyClassifiable: true,
        commonAgentDefectType: '백화',
        legacyDefectType: '백화',
        retrievalMode: 'graph_only',
        evidenceCount: 4,
        graphGrounded: true,
        llmSupplemented: false,
        visionClassifierStatus: 'agreed',
        visionClassifierAgreementWithVisionTop1: true,
        visionClassifierTopCandidate: '백화',
        visionClassifierReferenceCount: 5,
        visionClassifierMinimumReferenceSupport: 3,
        contextProvided: true,
        roiCount: 1,
        ocrProvided: false
      },
      {
        id: 'smoke-2',
        imageId: 'image-2',
        createdAt: '2026-07-24T01:01:00.000Z',
        strategy: 'common_agent_primary',
        selectedSource: 'legacy',
        fallbackUsed: true,
        commonAgentSuccess: false,
        legacySuccess: true,
        legacyDurationMs: 520,
        legacyClassifiable: true,
        legacyDefectType: '미성형',
        retrievalMode: 'hybrid',
        evidenceCount: 0,
        graphGrounded: false,
        llmSupplemented: true,
        visionClassifierStatus: 'disagreed',
        visionClassifierAgreementWithVisionTop1: false,
        visionClassifierTopCandidate: '웰드라인',
        visionClassifierReferenceCount: 3,
        visionClassifierMinimumReferenceSupport: 3,
        contextProvided: false,
        roiCount: 0,
        ocrProvided: true,
        commonAgentError: 'connect ECONNREFUSED'
      }
    ]);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: '\uC571 \uC124\uC815 \uC5F4\uAE30' }).click();
    const bodyText = await page.locator('body').innerText();
    const screenshotPath = path.join(process.cwd(), 'artifacts', 'diagnosis-observability.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    await page.evaluate(() => {
      window.__capturedTransitionReport = null;
      window.__capturedTransitionFileName = '';
      const originalCreateObjectUrl = URL.createObjectURL.bind(URL);
      URL.createObjectURL = blob => {
        void blob.text().then(text => {
          window.__capturedTransitionReport = JSON.parse(text);
        });
        return originalCreateObjectUrl(blob);
      };
      HTMLAnchorElement.prototype.click = function captureDownload() {
        window.__capturedTransitionFileName = this.download;
      };
    });
    await page.getByRole('button', { name: 'JSON \uB0B4\uBCF4\uB0B4\uAE30' }).click();
    await page.waitForFunction(() => window.__capturedTransitionReport !== null);
    const captured = await page.evaluate(() => ({
      report: window.__capturedTransitionReport,
      fileName: window.__capturedTransitionFileName
    }));
    const savePath = path.join(process.cwd(), 'artifacts', 'dual-validation-latest.json');
    fs.writeFileSync(savePath, `${JSON.stringify(captured.report, null, 2)}\n`, 'utf8');

    const result = {
      zeroComparable: bodyText.includes('\uBE44\uAD50 \uAC00\uB2A5 0\uAC74'),
      hasClassifiableMetric: bodyText.includes('\uD310\uC815 \uAC00\uB2A5'),
      reportTotal: captured.report.readiness.total,
      reportComparable: captured.report.readiness.comparableCount,
      reportClassifiable: captured.report.readiness.classifiableCount,
      reportClassifiableRate: captured.report.readiness.classifiableRate,
      hasObservabilityPanel: bodyText.includes('진단 운영 관측성'),
      hasLatencyMetric: bodyText.includes('Agent P50/P95'),
      hasClassifierMetric: bodyText.includes('Classifier 합의'),
      hasReleaseGatePanel: bodyText.includes('\uBE44\uC804 \uB9B4\uB9AC\uC2A4 \uAC8C\uC774\uD2B8'),
      hasRollbackDecision: bodyText.includes('\uC9C1\uC804 \uBC84\uC804 \uB864\uBC31 \uD544\uC694'),
      releaseDecision: captured.report.operationalRelease?.decision,
      reportGraphGroundedRate: captured.report.observability.graphGroundedRate,
      reportClassifierAgreementRate: captured.report.observability.visionClassifierAgreementRate,
      reportClassifierDisagreementRate: captured.report.observability.visionClassifierDisagreementRate,
      reportClassifierAverageReferenceCount: captured.report.observability.averageClassifierReferenceCount,
      reportAgentP50: captured.report.observability.commonAgentLatencyMs.p50,
      reportAgentFailures: captured.report.observability.commonAgentFailures,
      reportRetrievalModes: captured.report.observability.retrievalModes,
      download: captured.fileName,
      savedReport: savePath,
      screenshot: screenshotPath,
      consoleErrors: errors
    };
    console.log(JSON.stringify(result, null, 2));
    if (
      !result.hasClassifiableMetric
      || !result.hasObservabilityPanel
      || !result.hasLatencyMetric
      || !result.hasClassifierMetric
      || !result.hasReleaseGatePanel
      || !result.hasRollbackDecision
      || result.releaseDecision !== 'rollback_required'
      || result.reportGraphGroundedRate !== 50
      || result.reportClassifierAgreementRate !== 50
      || result.reportClassifierDisagreementRate !== 50
      || result.reportClassifierAverageReferenceCount !== 4
      || result.reportAgentP50 !== 120
      || result.reportAgentFailures !== 1
      || result.reportRetrievalModes.graph_only !== 1
      || result.reportRetrievalModes.hybrid !== 1
      || errors.length > 0
    ) process.exitCode = 1;
  } finally {
    if (app) await app.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
