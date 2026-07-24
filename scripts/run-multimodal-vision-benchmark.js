const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
  evaluateVisionResult,
  summarizeVisionBenchmark,
  validateVisionCases
} = require('./lib/multimodal-benchmark');
const { normalizeVisionObservation } = require('../visionObservation');

const root = process.cwd();
const args = process.argv.slice(2);
const valueAfter = flag => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};
const validateOnly = args.includes('--validate-only');
const manifestPath = path.resolve(
  valueAfter('--manifest') || path.join(root, 'eval', 'fixtures', 'manifest.json')
);
const artifactPath = path.resolve(
  valueAfter('--output') || path.join(root, 'artifacts', 'multimodal-vision-benchmark-report.json')
);
const baseUrl = (process.env.COMMON_AGENT_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '');
const qaUrl = (process.env.COMMON_AGENT_QA_URL || 'http://127.0.0.1:8103').replace(/\/+$/, '');
const concurrency = Math.max(1, Math.min(4, Number(valueAfter('--concurrency') || 2)));
const defectTaxonomy = [
  '백화', '플래시(버/바리)', '미성형(Short Shot)', '흑점/탄화', '싱크마크',
  '웰드라인', '은줄', '기포', '변형/휨', '박리', '흐름 자국', '제팅',
  '게이트 자국', '밀핀 자국', '스크래치/패임', '크랙', '이형 불량', '치수 불량'
];
const visualDiscriminationGuide = [
  '밀핀 자국: 밀핀 위치와 일치하는 원형 또는 원호형 경계, 원형 압흔·돌출·백화',
  '스크래치/패임: 금형 기능 형상과 무관한 선형·불규칙 마찰 흔적 또는 재료 손실',
  '플래시(버/바리): 파팅라인·인서트 경계 밖으로 이어지는 얇은 잉여 수지',
  '백화: 리브·코너·취출부 주변의 응력성 유백색 또는 흐린 변색'
].join('; ');

const mimeTypeFor = imagePath => ({
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif'
}[path.extname(imagePath).toLocaleLowerCase()] || 'image/png');

const loadCases = () => {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const manifestDir = path.dirname(manifestPath);
  const cases = (manifest.cases || [])
    .filter(item => item.status === 'active' || !item.status)
    .map(item => {
      if (!item.file) return item;
      const casePath = path.resolve(manifestDir, item.file);
      return { ...JSON.parse(fs.readFileSync(casePath, 'utf8')), fixturePath: casePath };
    });
  return {
    manifest,
    cases,
    validation: validateVisionCases(cases, {
      resolveImagePath: (imagePath, testCase) =>
        path.resolve(path.dirname(testCase.fixturePath || manifestPath), imagePath)
    })
  };
};

const buildQuestion = testCase => [
  '사출성형 품질 문제를 멀티모달로 진단해 주세요.',
  '이미지를 1차 관찰 근거로 사용하고 현장 설명은 보조 근거로 교차 검증하세요.',
  '판정 순서: 1) 반복 배경 텍스처 제외, 2) 가장 큰 독립 경계의 기하형상 식별, 3) 밀핀·게이트 등 금형 기능부 대응 여부 확인, 4) 지배 불량 분류.',
  `현장 현상 설명:\n${testCase.inputNotes || '추가 현장 설명 없음'}`,
  testCase.roiNormalized
    ? '검토자가 지정한 ROI로 잘라낸 영역만 우선 관찰하세요.'
    : '사용자 지정 ROI가 없으므로 전체 화면을 관찰하세요.',
  `불량명은 다음 표준 taxonomy에서 선택하세요: ${defectTaxonomy.join(', ')}.`,
  `혼동하기 쉬운 형상은 다음 기준으로 구분하세요: ${visualDiscriminationGuide}.`,
  'ROI 안에 여러 흔적이 있으면 금형 기능 형상과 직접 연관된 지배 결함을 우선 분류하세요.',
  '영상 근거로 구분할 수 없으면 "판정 불가"로 답하고 추가 촬영 조건을 제시하세요.',
  '단일 결함명만 단정하지 말고 candidates 배열에 최대 3개 후보를 신뢰도 순으로 반환하세요.',
  '각 후보는 defect_type, confidence(0~1), supporting_features, contradicting_features를 포함해야 합니다.',
  '관찰 결과에는 visible_features, required_additional_views, quality_concerns, abstention_reason도 포함하세요.',
  '관찰 사실과 추론을 구분하고 불량명, 원인 후보, 확인 항목을 제시하세요.',
  '원인과 대책은 승인된 Graph DB 근거를 우선 사용하고 부족한 부분만 LLM 지식으로 보조하세요.'
].join('\n\n');

const cropToFixtureRoi = (image, testCase) => {
  const roi = testCase.roiNormalized;
  if (!roi) return image;

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mold-master-vision-'));
  const inputPath = path.join(tempDir, 'input.image');
  const outputPath = path.join(tempDir, 'roi.png');
  try {
    fs.writeFileSync(inputPath, image.bytes);
    const launcher = process.platform === 'win32' ? 'py' : (process.env.PYTHON || 'python3');
    const launcherArgs = process.platform === 'win32' ? ['-3.11'] : [];
    const result = spawnSync(launcher, [
      ...launcherArgs,
      path.join(root, 'scripts', 'crop-benchmark-roi.py'),
      '--input', inputPath,
      '--output', outputPath,
      '--x', String(roi.x),
      '--y', String(roi.y),
      '--width', String(roi.width),
      '--height', String(roi.height)
    ], { encoding: 'utf8' });
    if (result.status !== 0) {
      throw new Error(`ROI crop failed: ${result.stderr || result.stdout}`);
    }
    return {
      bytes: fs.readFileSync(outputPath),
      mimeType: 'image/png',
      fileName: `${testCase.id}-roi.png`
    };
  } finally {
    if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    if (fs.existsSync(tempDir)) fs.rmdirSync(tempDir);
  }
};

const loadImage = async testCase => {
  if (testCase.commonAgentImageId) {
    const response = await fetch(
      `${baseUrl}/v1/datasets/images/${encodeURIComponent(testCase.commonAgentImageId)}/file`
    );
    if (!response.ok) {
      throw new Error(`Common Agent image download failed: ${response.status} ${response.statusText}`);
    }
    return {
      bytes: Buffer.from(await response.arrayBuffer()),
      mimeType: response.headers.get('content-type') || testCase.mimeType || 'image/png',
      fileName: testCase.fileName || `${testCase.commonAgentImageId}.image`
    };
  }
  return {
    bytes: fs.readFileSync(testCase.resolvedImagePath),
    mimeType: mimeTypeFor(testCase.resolvedImagePath),
    fileName: path.basename(testCase.resolvedImagePath)
  };
};

const executeCase = async testCase => {
  const startedAt = Date.now();
  try {
    const image = cropToFixtureRoi(await loadImage(testCase), testCase);
    const question = buildQuestion(testCase);
    const visionResponse = await fetch(`${qaUrl}/internal/vision/describe`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        image_base64: image.bytes.toString('base64'),
        mime_type: image.mimeType,
        question,
        context: {
          source_system: 'mold-master-ai-benchmark',
          process_area: 'injection-molding',
          benchmark_case_id: testCase.id,
          source_image_id: testCase.commonAgentImageId
        }
      })
    });
    const observation = await visionResponse.json().catch(() => ({}));
    if (!visionResponse.ok) {
      throw new Error(`QA Vision failed: ${visionResponse.status} ${JSON.stringify(observation)}`);
    }
    const visionSummary = normalizeVisionObservation(observation);
    const candidateLines = visionSummary.candidates.map((candidate, index) => [
      `${index + 1}. ${candidate.defectType} (${Math.round(candidate.confidence * 100)}%)`,
      candidate.supportingFeatures.length > 0
        ? `일치 근거: ${candidate.supportingFeatures.join(', ')}`
        : '',
      candidate.contradictingFeatures.length > 0
        ? `불일치 근거: ${candidate.contradictingFeatures.join(', ')}`
        : ''
    ].filter(Boolean).join(' | '));

    const retrievalQuestion = [
      question,
      `Vision decision status: ${visionSummary.decisionStatus}`,
      `Vision candidates:\n${candidateLines.join('\n') || 'unclassified'}`,
      `Visible features: ${visionSummary.visibleFeatures.join(', ')}`,
      `Vision summary: ${observation.summary || ''}`,
      `Possible causes: ${(observation.possible_causes || []).join(', ')}`
    ].join('\n');
    const askResponse = await fetch(`${baseUrl}/v1/ask`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        question: retrievalQuestion,
        top_k: 6,
        session_id: `mold-master-vision-benchmark-${testCase.id}`,
        filters: {
          include_rag: true,
          include_reasoning_paths: true,
          include_knowledge_graph: true,
          include_knowledge_relations: true,
          evidence_policy: 'graph_approved_only',
          source_app: 'mold-master-ai-benchmark'
        }
      })
    });
    const askPayload = await askResponse.json().catch(() => ({}));
    const trace = askPayload.reasoning_trace || [];
    const payload = {
      observation,
      answer: askPayload.answer,
      evidence: askPayload.evidence || [],
      confidence: visionSummary.primaryCandidate?.confidence || observation.confidence || 0,
      visionConfidence: visionSummary.primaryCandidate?.confidence || observation.confidence || 0,
      visionDecisionStatus: visionSummary.decisionStatus,
      qualityStatus: observation.quality_status
        || (visionSummary.qualityConcerns.length > 0 ? 'warn' : 'pass'),
      retrievalConfidence: askPayload.confidence || 0,
      reasoning_trace: trace,
      graph_policy_applied: trace.some(item =>
        String(item).includes('evidence_policy=graph_approved_only')
      )
    };
    return evaluateVisionResult(testCase, {
      httpOk: visionResponse.ok && askResponse.ok,
      latencyMs: Date.now() - startedAt,
      response: payload,
      error: askResponse.ok
        ? undefined
        : `Common Agent ask failed: ${askResponse.status} ${JSON.stringify(askPayload)}`
    });
  } catch (error) {
    return evaluateVisionResult(testCase, {
      httpOk: false,
      latencyMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error)
    });
  }
};

const writeReport = report => {
  fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
  fs.writeFileSync(artifactPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
};

const run = async () => {
  const { manifest, validation } = loadCases();
  if (validateOnly) {
    const report = {
      generatedAt: new Date().toISOString(),
      mode: 'validate-only',
      manifestPath,
      minimumSamples: manifest.minimumSamples || 20,
      configuredCases: validation.valid.length + validation.invalid.length,
      validCases: validation.valid.length,
      invalidCases: validation.invalid
    };
    writeReport(report);
    console.log(`Vision fixture validation: ${report.validCases}/${report.configuredCases} runnable`);
    for (const item of validation.invalid) console.log(`MISSING ${item.id}: ${item.reason}`);
    console.log(`Report: ${artifactPath}`);
    return;
  }

  const results = [];
  for (let index = 0; index < validation.valid.length; index += concurrency) {
    const batch = validation.valid.slice(index, index + concurrency);
    results.push(...await Promise.all(batch.map(executeCase)));
  }
  const summary = summarizeVisionBenchmark(
    results,
    manifest.minimumSamples || 20,
    manifest.evaluationGate || {}
  );
  const report = {
    generatedAt: new Date().toISOString(),
    mode: 'live',
    commonAgentUrl: baseUrl,
    qaAgentUrl: qaUrl,
    manifestPath,
    summary,
    invalidCases: validation.invalid,
    results
  };
  writeReport(report);
  console.log(`Multimodal Vision benchmark: ${summary.passed}/${summary.total} (${summary.passRate}%)`);
  console.log(
    `HTTP=${summary.httpSuccessRate}% classifiable=${summary.classifiableRate}% `
    + `defect=${summary.defectAccuracy}% graph=${summary.graphGroundedRate}%`
  );
  console.log(
    `Top-1=${summary.top1Accuracy}% Top-3=${summary.top3Accuracy}% `
    + `selective=${summary.selectiveAccuracy}%@${summary.selectiveCoverage}% coverage `
    + `unsafe=${summary.unsafeErrorRate}% ECE=${summary.expectedCalibrationError}% `
    + `contract=${summary.visionContractComplianceRate}% `
    + `capture-protocol=${summary.captureProtocolReadyRate}%`
  );
  console.log(
    `Classes observed=${summary.observedDefectClasses}/${summary.requiredDefectClasses.length} `
    + `validated=${summary.coveredDefectClasses}/${summary.requiredDefectClasses.length} `
    + `vision-confidence=${summary.confidentRate}%`
  );
  if (summary.failedGateChecks.length > 0) {
    console.log(`Failed gates: ${summary.failedGateChecks.join(', ')}`);
  }
  console.log(`Ready to disable legacy fallback: ${summary.readyToDisableLegacyFallback}`);
  console.log(`Report: ${artifactPath}`);
  if (!summary.readyToDisableLegacyFallback) process.exitCode = 1;
};

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
