const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { buildSync } = require('esbuild');
const {
  buildShadowReleaseInput
} = require('./lib/vision-operational-release-input');

const root = process.cwd();
const args = process.argv.slice(2);
const valueAfter = flag => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};
const requiredPath = flag => {
  const value = valueAfter(flag);
  if (!value) throw new Error(`${flag} is required`);
  return path.resolve(value);
};
const readJson = filePath => JSON.parse(
  fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '')
);
const sha256File = filePath =>
  crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
const fileEvidence = (kind, filePath, label) => ({
  kind,
  uri: pathToFileURL(filePath).href,
  sha256: sha256File(filePath),
  label
});
const evidenceItemsFromConfig = config => {
  const bundleItems = Array.isArray(config?.evidenceBundle?.items)
    ? config.evidenceBundle.items
    : [];
  const commonAgentUris = [
    config?.commonAgentEvidenceUri,
    ...(Array.isArray(config?.commonAgentEvidenceUris) ? config.commonAgentEvidenceUris : [])
  ].filter(Boolean).map(uri => ({
    kind: 'common_agent_dataset_export',
    uri
  }));
  const graphUris = [
    config?.graphEvidenceUri,
    ...(Array.isArray(config?.graphEvidenceUris) ? config.graphEvidenceUris : [])
  ].filter(Boolean).map(uri => ({
    kind: 'graph_snapshot',
    uri
  }));
  return [
    ...bundleItems,
    ...commonAgentUris,
    ...graphUris
  ];
};

const loadGate = () => {
  const outputDirectory = path.join(root, '.tmp-tools');
  const outputPath = path.join(outputDirectory, 'vision-operational-release-gate.cjs');
  fs.mkdirSync(outputDirectory, { recursive: true });
  buildSync({
    entryPoints: [path.join(root, 'services', 'visionOperationalReleaseGate.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile: outputPath
  });
  delete require.cache[require.resolve(outputPath)];
  return require(outputPath);
};

const run = () => {
  const baselinePath = requiredPath('--baseline');
  const candidatePath = requiredPath('--candidate');
  const configPath = requiredPath('--config');
  const outputPath = path.resolve(
    valueAfter('--output')
      || path.join(root, 'artifacts', 'vision-operational-release-report.json')
  );
  const baselineReport = readJson(baselinePath);
  const candidateReport = readJson(candidatePath);
  const config = readJson(configPath);
  const built = buildShadowReleaseInput(baselineReport, candidateReport, config);
  const {
    auditVisionOperationalEvidenceAlignment,
    evaluateVisionOperationalRelease
  } = loadGate();
  built.gateInput.evidenceBundle = {
    contractVersion: 'vision-operational-evidence-bundle/v1',
    items: [
      fileEvidence('baseline_benchmark', baselinePath, 'baseline benchmark report'),
      fileEvidence('candidate_benchmark', candidatePath, 'candidate benchmark report'),
      fileEvidence('release_config', configPath, 'release gate config'),
      {
        kind: 'release_report',
        uri: pathToFileURL(outputPath).href,
        label: 'generated release report'
      },
      ...evidenceItemsFromConfig(config)
    ],
    complete: false,
    missingEvidence: []
  };
  const report = evaluateVisionOperationalRelease(built.gateInput);
  const evidenceAlignment = auditVisionOperationalEvidenceAlignment(report);
  const artifact = {
    ...report,
    evidenceAlignment,
    inputDiagnostics: built.diagnostics,
    sourceArtifacts: {
      baseline: baselinePath,
      candidate: candidatePath,
      config: configPath
    }
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  console.log(`Vision operational release decision: ${report.decision}`);
  console.log(`Vision operational release card: ${report.decisionCard.title}`);
  console.log(`Vision operational release action: ${report.decisionCard.primaryAction}`);
  console.log(`Blocking reasons: ${report.blockingReasons.join(', ') || 'none'}`);
  console.log(`Evidence alignment: ${evidenceAlignment.passed ? 'passed' : 'failed'}`);
  if (!evidenceAlignment.passed) {
    console.log(`Evidence issues: ${evidenceAlignment.issues.map(issue => issue.check).join(', ')}`);
  }
  console.log(`Report: ${outputPath}`);
  if (!report.releaseAllowed || !evidenceAlignment.passed) process.exitCode = 1;
};

try {
  run();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
