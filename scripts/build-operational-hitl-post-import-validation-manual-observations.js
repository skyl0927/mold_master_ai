const fs = require('node:fs');
const path = require('node:path');
const {
  buildOperationalHitlPostImportManualObservationTemplate
} = require('../operationalHitlPostImportValidationManualObservations');

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
  || process.env.OPERATIONAL_HITL_POST_IMPORT_MANUAL_OBSERVATIONS_OUTPUT_BASE
  || path.join(artifactRoot, `operational-hitl-post-import-validation-manual-observations-template-${timestamp()}`);

const jsonOutputPath = path.resolve(`${baseOutput}.json`);
const csvOutputPath = path.resolve(`${baseOutput}.csv`);
const markdownOutputPath = path.resolve(`${baseOutput}.md`);

const run = () => {
  const template = buildOperationalHitlPostImportManualObservationTemplate({
    validationPlan: readOptionalJson(validationPlanPath),
    observations: readOptionalJson(observationsPath),
    sourceArtifacts: {
      validationPlan: validationPlanPath,
      observations: observationsPath
    }
  });

  writeText(csvOutputPath, template.csv);
  if (template.markdown) writeText(markdownOutputPath, template.markdown);
  writeJson(jsonOutputPath, {
    ...template,
    csv: undefined,
    markdown: undefined,
    csvPath: csvOutputPath,
    markdownPath: template.markdown ? markdownOutputPath : null
  });

  console.log(JSON.stringify({
    outputPath: jsonOutputPath,
    csvPath: csvOutputPath,
    markdownPath: template.markdown ? markdownOutputPath : null,
    status: template.status,
    serviceWritesPerformed: template.serviceWritesPerformed,
    manualRows: template.summary.manualRows,
    visionRows: template.summary.visionRows,
    labelConflictRows: template.summary.labelConflictRows,
    recommendedAction: template.recommendedAction
  }, null, 2));
};

try {
  run();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
