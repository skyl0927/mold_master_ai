const fs = require('node:fs');
const path = require('node:path');
const {
  buildOperationalHitlPostImportValidationPlan
} = require('../operationalHitlPostImportValidationPlan');

const root = path.resolve(__dirname, '..');
const artifactRoot = path.join(root, 'artifacts');
const args = process.argv.slice(2);

const valueAfter = flag => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};

const timestamp = () => new Date().toISOString().replace(/[:.]/g, '-');

const latestArtifact = prefix => {
  if (!fs.existsSync(artifactRoot)) return null;
  const matches = fs.readdirSync(artifactRoot)
    .filter(name => name.startsWith(prefix) && name.endsWith('.json'))
    .map(name => path.join(artifactRoot, name))
    .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs);
  return matches[0] || null;
};

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

const importPackagePath = resolveOptionalPath(
  valueAfter('--import-package'),
  process.env.OPERATIONAL_HITL_COMMON_AGENT_IMPORT_PACKAGE,
  latestArtifact('operational-hitl-common-agent-import-package-')
);

const baseOutput = valueAfter('--output-base')
  || process.env.OPERATIONAL_HITL_POST_IMPORT_VALIDATION_OUTPUT_BASE
  || path.join(artifactRoot, `operational-hitl-post-import-validation-plan-${timestamp()}`);

const jsonOutputPath = path.resolve(`${baseOutput}.json`);
const markdownOutputPath = path.resolve(`${baseOutput}.md`);

const run = () => {
  const plan = buildOperationalHitlPostImportValidationPlan({
    importPackage: readOptionalJson(importPackagePath),
    sourceArtifacts: {
      importPackage: importPackagePath
    }
  });

  if (plan.markdown) writeText(markdownOutputPath, plan.markdown);
  writeJson(jsonOutputPath, {
    ...plan,
    markdown: undefined,
    markdownPath: plan.markdown ? markdownOutputPath : null
  });

  console.log(JSON.stringify({
    outputPath: jsonOutputPath,
    markdownPath: plan.markdown ? markdownOutputPath : null,
    status: plan.status,
    serviceWritesPerformed: plan.serviceWritesPerformed,
    totalTestCases: plan.summary.totalTestCases,
    graphRagCases: plan.summary.graphRagCases,
    visionRoundtripCases: plan.summary.visionRoundtripCases,
    labelConflictCases: plan.summary.labelConflictCases,
    blockingImportPackageStatus: plan.blockingImportPackageStatus,
    recommendedAction: plan.recommendedAction
  }, null, 2));
};

try {
  run();
} catch (error) {
  const plan = buildOperationalHitlPostImportValidationPlan({
    sourceArtifacts: {
      importPackage: importPackagePath
    }
  });
  plan.summary.error = error instanceof Error ? error.message : String(error);
  writeJson(jsonOutputPath, plan);
  console.error(error);
  process.exitCode = 1;
}
