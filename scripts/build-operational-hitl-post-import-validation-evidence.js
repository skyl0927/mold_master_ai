const fs = require('node:fs');
const path = require('node:path');
const {
  buildOperationalHitlPostImportValidationEvidence
} = require('../operationalHitlPostImportValidationEvidence');

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

const observationsPath = resolveOptionalPath(
  valueAfter('--observations'),
  process.env.OPERATIONAL_HITL_POST_IMPORT_VALIDATION_OBSERVATIONS,
  latestArtifact('operational-hitl-post-import-validation-observations-')
);

const baseOutput = valueAfter('--output-base')
  || process.env.OPERATIONAL_HITL_POST_IMPORT_VALIDATION_EVIDENCE_OUTPUT_BASE
  || path.join(artifactRoot, `operational-hitl-post-import-validation-evidence-${timestamp()}`);

const jsonOutputPath = path.resolve(`${baseOutput}.json`);
const markdownOutputPath = path.resolve(`${baseOutput}.md`);

const run = () => {
  const evidence = buildOperationalHitlPostImportValidationEvidence({
    validationPlan: readOptionalJson(validationPlanPath),
    observations: readOptionalJson(observationsPath),
    sourceArtifacts: {
      validationPlan: validationPlanPath,
      observations: observationsPath
    }
  });

  if (evidence.markdown) writeText(markdownOutputPath, evidence.markdown);
  writeJson(jsonOutputPath, {
    ...evidence,
    markdown: undefined,
    markdownPath: evidence.markdown ? markdownOutputPath : null
  });

  console.log(JSON.stringify({
    outputPath: jsonOutputPath,
    markdownPath: evidence.markdown ? markdownOutputPath : null,
    status: evidence.status,
    serviceWritesPerformed: evidence.serviceWritesPerformed,
    totalPlannedCases: evidence.summary.totalPlannedCases,
    observedCases: evidence.summary.observedCases,
    missingCases: evidence.summary.missingCases,
    ignoredObservationCases: evidence.summary.ignoredObservationCases,
    recommendedAction: evidence.recommendedAction
  }, null, 2));

  if ([
    'unsafe_observations',
    'invalid_observations'
  ].includes(evidence.status)) {
    process.exitCode = 1;
  }
};

try {
  run();
} catch (error) {
  const evidence = buildOperationalHitlPostImportValidationEvidence({
    sourceArtifacts: {
      validationPlan: validationPlanPath,
      observations: observationsPath
    }
  });
  evidence.summary.error = error instanceof Error ? error.message : String(error);
  writeJson(jsonOutputPath, evidence);
  console.error(error);
  process.exitCode = 1;
}
