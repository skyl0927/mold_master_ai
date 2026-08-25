const { _electron: electron } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

(async () => {
  const artifactsDir = path.join(process.cwd(), 'artifacts');
  const runId = Date.now();
  const fixtureRoot = path.join(artifactsDir, `operational-status-autoload-fixture-${runId}`);
  const profilePath = path.join(artifactsDir, `operational-status-autoload-profile-${runId}`);
  const generatedAt = '2099-08-25T01:02:03.000Z';
  const bundle = {
    contractVersion: 'operational-status-bundle/v1',
    generatedAt,
    status: 'awaiting_human_hitl',
    statusLabelKo: '사람 HITL 판정 입력 대기',
    serviceWritesPerformed: false,
    policy: {
      requiresHumanReview: true,
      artifactOnly: true,
      automaticServiceWritesAllowed: false,
      autoApplyAllowed: false,
      allowGraphPromotion: false,
      allowReferenceLearning: false,
      allowModelTraining: false
    },
    summary: {
      currentPhaseKo: '자동 복원 E2E 단계',
      currentPipelineStageKo: '자동 복원 검증 대기',
      softwareScaffoldPercent: 100,
      operationalProgressPercent: 25,
      visionBlockers: 2,
      hitlDecisionInputsMissing: 3,
      pendingRows: 3,
      highRiskRows: 1,
      webHitlApprovalsMissing: 2,
      visionTop1Accuracy: 75,
      visionTop3Accuracy: 92
    },
    progressFeedbackKo: ['최신 로컬 운영 상태를 자동 복원했습니다.'],
    nextOperatorActions: [],
    sessionPointers: [],
    sourceArtifactSnapshots: [
      {
        key: 'developmentProgress',
        contractVersion: 'mold-master-development-progress-report/v1',
        sourcePath: 'fixture://development-progress',
        embeddedAt: generatedAt,
        payload: {
          contractVersion: 'mold-master-development-progress-report/v1',
          generatedAt,
          status: 'action_required',
          currentPhase: {
            code: 'autoload_e2e',
            titleKo: '자동 복원 E2E 단계'
          },
          serviceWritesPerformed: false,
          summary: {},
          progress: {
            software: { percent: 100 },
            operational: { percent: 25 }
          },
          nextActions: [],
          progressFeedbackKo: ['자동 복원된 개발 진행률입니다.']
        }
      }
    ],
    recommendedAction: '사람 판정을 계속 진행하세요.'
  };

  fs.mkdirSync(fixtureRoot, { recursive: true });
  fs.writeFileSync(
    path.join(fixtureRoot, 'operational-status-bundle-autoload-e2e.json'),
    JSON.stringify(bundle, null, 2),
    'utf8'
  );

  let app;
  try {
    app = await electron.launch({
      args: ['.', `--user-data-dir=${profilePath}`],
      cwd: process.cwd(),
      env: {
        ...process.env,
        MOLD_MASTER_OPERATIONAL_ARTIFACT_ROOT: fixtureRoot
      }
    });
    const page = await app.firstWindow();
    const consoleErrors = [];
    page.on('console', message => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });

    await page.getByRole('button', { name: '앱 설정 열기' }).click();
    const autoloadStatus = page.getByTestId('operational-status-autoload');
    await autoloadStatus.waitFor({ state: 'visible', timeout: 15000 });
    await page.getByText('자동 복원 E2E 단계', { exact: true }).first().waitFor();

    const retryButton = page.getByRole('button', { name: '최신 상태 불러오기' });
    await retryButton.waitFor({ state: 'visible' });
    const initialStatus = await autoloadStatus.innerText();
    await retryButton.click();
    await autoloadStatus.getByText(/최신|자동 복원/).waitFor();
    const retryStatus = await autoloadStatus.innerText();

    const screenshot = path.join(artifactsDir, 'electron-operational-status-autoload.png');
    await page.screenshot({ path: screenshot, fullPage: true });
    const result = {
      automaticallyRestored: initialStatus.includes('자동 복원'),
      showsLatestPhase: await page.getByText('자동 복원 E2E 단계', { exact: true }).first().isVisible(),
      retryAvailable: await retryButton.isVisible(),
      retryStatus,
      sourceBundle: path.join(fixtureRoot, 'operational-status-bundle-autoload-e2e.json'),
      screenshot,
      consoleErrors
    };
    console.log(JSON.stringify(result, null, 2));

    if (
      !result.automaticallyRestored
      || !result.showsLatestPhase
      || !result.retryAvailable
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
