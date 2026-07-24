const fs = require('node:fs');
const path = require('node:path');
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
  const { evaluateVisionOperationalRelease } = loadGate();
  const report = evaluateVisionOperationalRelease(built.gateInput);
  const artifact = {
    ...report,
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
  console.log(`Blocking reasons: ${report.blockingReasons.join(', ') || 'none'}`);
  console.log(`Report: ${outputPath}`);
  if (!report.releaseAllowed) process.exitCode = 1;
};

try {
  run();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
