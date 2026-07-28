const fs = require('node:fs');
const path = require('node:path');
const {
  buildVisionCaptureWorkOrderPlan
} = require('../visionCaptureWorkOrderPlan');

const root = path.resolve(__dirname, '..');
const artifactRoot = path.join(root, 'artifacts');
const args = process.argv.slice(2);
const statusRefresh = args.includes('--status-refresh') || args.includes('--no-fail');

const valueAfter = flag => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};

const timestamp = () => new Date().toISOString().replace(/[:.]/g, '-');

const resolveOptionalPath = (...candidates) => {
  const candidate = candidates.find(Boolean);
  return candidate ? path.resolve(candidate) : null;
};

const readOptionalJson = filePath => {
  if (!filePath || !fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
};

const writeText = (filePath, payload) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, payload, 'utf8');
};

const writeJson = (filePath, payload) => {
  writeText(filePath, `${JSON.stringify(payload, null, 2)}\n`);
};

const markdownFor = artifact => {
  const lines = [
    '# Vision Capture Work Orders',
    '',
    `- status: ${artifact.status}`,
    `- top1Accuracy: ${artifact.summary.top1Accuracy}%`,
    `- top3Accuracy: ${artifact.summary.top3Accuracy}%`,
    `- captureProtocolReadyRate: ${artifact.summary.captureProtocolReadyRate}%`,
    `- totalWorkOrders: ${artifact.summary.totalWorkOrders}`,
    `- totalMissingApprovedSamples: ${artifact.summary.totalMissingApprovedSamples}`,
    `- totalRecaptureSamples: ${artifact.summary.totalRecaptureSamples}`,
    ''
  ];

  if (artifact.workOrders.length === 0) {
    lines.push('No capture work orders are required.');
  } else {
    lines.push('| Priority | Defect Class | Action | Missing Samples | Recapture IDs | Required Views |');
    lines.push('|---:|---|---|---:|---|---|');
    for (const order of artifact.workOrders) {
      lines.push([
        order.priority,
        order.defectClass,
        order.actionType,
        order.missingApprovedSamples,
        order.recaptureSampleIds.join(', ') || '-',
        order.requiredViews.join(', ')
      ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
    }
  }

  lines.push('', `Recommended action: ${artifact.recommendedActionKo}`);
  return `${lines.join('\n')}\n`;
};

const benchmarkPath = resolveOptionalPath(
  valueAfter('--benchmark'),
  process.env.VISION_BENCHMARK_REPORT,
  path.join(artifactRoot, 'multimodal-vision-benchmark-report.json')
);

const outputPath = path.resolve(
  valueAfter('--output')
  || process.env.VISION_CAPTURE_WORK_ORDER_PLAN_OUTPUT
  || path.join(artifactRoot, `vision-capture-work-order-plan-${timestamp()}.json`)
);

const markdownPath = path.resolve(
  valueAfter('--markdown')
  || outputPath.replace(/\.json$/i, '.md')
);

const run = () => {
  const plan = buildVisionCaptureWorkOrderPlan({
    benchmarkReport: readOptionalJson(benchmarkPath)
  });
  const artifact = {
    ...plan,
    sources: {
      benchmarkReport: benchmarkPath
    }
  };

  writeJson(outputPath, artifact);
  writeText(markdownPath, markdownFor(artifact));

  console.log(JSON.stringify({
    outputPath,
    markdownPath,
    status: artifact.status,
    serviceWritesPerformed: artifact.serviceWritesPerformed,
    totalWorkOrders: artifact.summary.totalWorkOrders,
    totalMissingApprovedSamples: artifact.summary.totalMissingApprovedSamples,
    totalRecaptureSamples: artifact.summary.totalRecaptureSamples,
    topPriorityDefectClass: artifact.summary.topPriorityDefectClass,
    recommendedActionKo: artifact.recommendedActionKo
  }, null, 2));

  if (!statusRefresh && artifact.status !== 'ready_for_shadow_validation') {
    process.exitCode = 1;
  }
};

try {
  run();
} catch (error) {
  const artifact = buildVisionCaptureWorkOrderPlan({});
  artifact.error = error instanceof Error ? error.message : String(error);
  artifact.sources = {
    benchmarkReport: benchmarkPath
  };
  writeJson(outputPath, artifact);
  writeText(markdownPath, markdownFor(artifact));
  console.error(error);
  process.exitCode = 1;
}
