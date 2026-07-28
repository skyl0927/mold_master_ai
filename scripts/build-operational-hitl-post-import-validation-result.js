const fs = require('node:fs');
const path = require('node:path');
const {
  buildOperationalHitlPostImportValidationResult
} = require('../operationalHitlPostImportValidationResult');

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
  return fs.readdirSync(artifactRoot)
    .filter(name => name.startsWith(prefix) && name.endsWith('.json'))
    .map(name => path.join(artifactRoot, name))
    .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs)
    .at(0) || null;
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

const validationPlanPath = resolveOptionalPath(
  valueAfter('--validation-plan'),
  process.env.OPERATIONAL_HITL_POST_IMPORT_VALIDATION_PLAN,
  latestArtifact('operational-hitl-post-import-validation-plan-')
);

const validationEvidencePath = resolveOptionalPath(
  valueAfter('--validation-evidence'),
  process.env.OPERATIONAL_HITL_POST_IMPORT_VALIDATION_EVIDENCE,
  latestArtifact('operational-hitl-post-import-validation-evidence-')
);

const baseOutput = valueAfter('--output-base')
  || process.env.OPERATIONAL_HITL_POST_IMPORT_VALIDATION_RESULT_OUTPUT_BASE
  || path.join(artifactRoot, `operational-hitl-post-import-validation-result-${timestamp()}`);

const jsonOutputPath = path.resolve(`${baseOutput}.json`);
const markdownOutputPath = path.resolve(`${baseOutput}.md`);

const run = () => {
  const result = buildOperationalHitlPostImportValidationResult({
    validationPlan: readOptionalJson(validationPlanPath),
    validationEvidence: readOptionalJson(validationEvidencePath),
    sourceArtifacts: {
      validationPlan: validationPlanPath,
      validationEvidence: validationEvidencePath
    }
  });

  if (result.markdown) writeText(markdownOutputPath, result.markdown);
  writeJson(jsonOutputPath, {
    ...result,
    markdown: undefined,
    markdownPath: result.markdown ? markdownOutputPath : null
  });

  console.log(JSON.stringify({
    outputPath: jsonOutputPath,
    markdownPath: result.markdown ? markdownOutputPath : null,
    status: result.status,
    readyForOperationalReleaseValidation: result.readyForOperationalReleaseValidation,
    serviceWritesPerformed: result.serviceWritesPerformed,
    totalCases: result.summary.totalCases,
    passedCases: result.summary.passedCases,
    failedCases: result.summary.failedCases,
    missingEvidenceCases: result.summary.missingEvidenceCases,
    passRate: result.summary.passRate,
    minimumPassRate: result.summary.minimumPassRate,
    recommendedAction: result.recommendedAction
  }, null, 2));

  if (result.status === 'validation_failed' || result.status === 'unsafe_validation_evidence') {
    process.exitCode = 1;
  }
};

try {
  run();
} catch (error) {
  const result = buildOperationalHitlPostImportValidationResult({
    sourceArtifacts: {
      validationPlan: validationPlanPath,
      validationEvidence: validationEvidencePath
    }
  });
  result.summary.error = error instanceof Error ? error.message : String(error);
  writeJson(jsonOutputPath, result);
  console.error(error);
  process.exitCode = 1;
}
