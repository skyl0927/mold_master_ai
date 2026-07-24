const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
  evaluateVisionResult,
  summarizeVisionBenchmark,
  validateVisionCases
} = require('./lib/multimodal-benchmark');
const {
  applyVisionRuntimeGate,
  assessVisionRuntimeStatus,
  buildBlindVisionQuestion,
  buildGraphRetrievalQuestion
} = require('./lib/vision-benchmark-harness');
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

const loadVisionRuntimeAttestation = async () => {
  const endpoint = `${qaUrl}/internal/vision/status`;
  try {
    const response = await fetch(endpoint);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        endpoint,
        ...assessVisionRuntimeStatus(payload, `HTTP ${response.status}`)
      };
    }
    return { endpoint, ...assessVisionRuntimeStatus(payload) };
  } catch (error) {
    return {
      endpoint,
      ...assessVisionRuntimeStatus(
        {},
        error instanceof Error ? error.message : String(error)
      )
    };
  }
};

const executeCase = async testCase => {
  const startedAt = Date.now();
  try {
    const image = cropToFixtureRoi(await loadImage(testCase), testCase);
    const question = buildBlindVisionQuestion(testCase);
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
    const retrievalQuestion = buildGraphRetrievalQuestion({
      testCase,
      visionSummary,
      observation
    });
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

  const visionRuntimeAttestation = await loadVisionRuntimeAttestation();
  const results = [];
  for (let index = 0; index < validation.valid.length; index += concurrency) {
    const batch = validation.valid.slice(index, index + concurrency);
    results.push(...await Promise.all(batch.map(executeCase)));
  }
  const summary = applyVisionRuntimeGate(
    summarizeVisionBenchmark(
      results,
      manifest.minimumSamples || 20,
      manifest.evaluationGate || {}
    ),
    visionRuntimeAttestation
  );
  const report = {
    generatedAt: new Date().toISOString(),
    mode: 'live',
    commonAgentUrl: baseUrl,
    qaAgentUrl: qaUrl,
    manifestPath,
    visionRuntimeAttestation,
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
  console.log(
    `Runtime attestation=${summary.runtimeAttestationReady} `
    + `model=${visionRuntimeAttestation.modelVersion || 'unknown'} `
    + `prompt=${visionRuntimeAttestation.promptVersion || 'unknown'} `
    + `detail=${visionRuntimeAttestation.imageDetail || 'unknown'}`
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
