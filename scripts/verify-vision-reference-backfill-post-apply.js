const fs = require('node:fs');
const path = require('node:path');
const {
  buildVisionReferenceBackfillPostApplyReport
} = require('../visionReferenceBackfillPostApplyVerification');

const root = path.resolve(__dirname, '..');
const artifactRoot = path.join(root, 'artifacts');

const argumentValue = name => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

const hasFlag = name => process.argv.includes(name);

const normalizeBaseUrl = value =>
  String(value || 'http://127.0.0.1:8000').replace(/\/+$/, '');

const latestArtifact = prefix => {
  if (!fs.existsSync(artifactRoot)) return '';
  const candidates = fs.readdirSync(artifactRoot, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.startsWith(prefix) && entry.name.endsWith('.json'))
    .map(entry => {
      const filePath = path.join(artifactRoot, entry.name);
      return {
        filePath,
        mtimeMs: fs.statSync(filePath).mtimeMs
      };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  return candidates[0]?.filePath || '';
};

const readJson = filePath => JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));

const fetchLearningReadyExport = async agentUrl => {
  const params = new URLSearchParams({
    review_status: 'approved',
    learning_ready_only: 'true',
    limit: '500',
    include_raw: 'false'
  });
  const url = `${normalizeBaseUrl(agentUrl)}/v1/datasets/images/export?${params.toString()}`;
  const response = await fetch(url);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Common Agent learning-ready export failed: ${response.status} ${JSON.stringify(payload)}`);
  }
  return {
    url,
    payload
  };
};

const run = async () => {
  const applyReportPath = path.resolve(
    argumentValue('--apply-report')
    || process.env.VISION_REFERENCE_BACKFILL_APPLY_REPORT
    || latestArtifact('vision-reference-backfill-apply-')
    || ''
  );
  if (!applyReportPath || !fs.existsSync(applyReportPath)) {
    throw new Error(
      'Vision reference backfill verification requires an apply report. '
      + 'Pass --apply-report <apply-report.json> or run npm run vision:reference:backfill-apply -- --apply first.'
    );
  }

  const exportPath = argumentValue('--export')
    || process.env.VISION_REFERENCE_LEARNING_READY_EXPORT
    || '';
  const learningReadySource = exportPath
    ? {
        source: path.resolve(exportPath),
        payload: readJson(path.resolve(exportPath))
      }
    : {
        source: 'Common Agent live export',
        ...(await fetchLearningReadyExport(process.env.COMMON_AGENT_URL || 'http://127.0.0.1:8000'))
      };

  const report = buildVisionReferenceBackfillPostApplyReport({
    applyReport: readJson(applyReportPath),
    learningReadyExport: learningReadySource.payload
  });

  const defaultName = `vision-reference-backfill-post-apply-verification-${
    new Date().toISOString().replace(/[-:.]/g, '').replace('Z', '')
  }.json`;
  const outputPath = path.resolve(
    argumentValue('--output')
    || process.env.VISION_REFERENCE_BACKFILL_VERIFY_OUTPUT
    || path.join(artifactRoot, defaultName)
  );
  if (fs.existsSync(outputPath)) {
    throw new Error(`Verification report already exists and will not be overwritten: ${outputPath}`);
  }
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify({
    ...report,
    applyReportPath,
    learningReadyExportSource: learningReadySource.url || learningReadySource.source
  }, null, 2)}\n`, 'utf8');

  console.log(JSON.stringify({
    outputPath,
    status: report.status,
    readyForReferenceRefresh: report.readyForReferenceRefresh,
    summary: report.summary,
    blockers: report.blockers,
    recommendedAction: report.recommendedAction
  }, null, 2));

  if (hasFlag('--require-ready') && !report.readyForReferenceRefresh) {
    process.exitCode = 1;
  }
};

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
