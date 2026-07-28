const fs = require('node:fs');
const path = require('node:path');
const {
  importOperationalHitlPostImportManualObservations
} = require('../operationalHitlPostImportValidationManualObservations');

const root = path.resolve(__dirname, '..');
const artifactRoot = path.join(root, 'artifacts');
const args = process.argv.slice(2);

const valueAfter = flag => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};

const timestamp = () => new Date().toISOString().replace(/[:.]/g, '-');

const latestFile = (prefix, extension) => {
  if (!fs.existsSync(artifactRoot)) return null;
  return fs.readdirSync(artifactRoot)
    .filter(name => name.startsWith(prefix) && name.endsWith(extension))
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

const readOptionalText = filePath =>
  filePath && fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '') : '';

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
  latestFile('operational-hitl-post-import-validation-plan-', '.json')
);

const observationsPath = resolveOptionalPath(
  valueAfter('--observations'),
  process.env.OPERATIONAL_HITL_POST_IMPORT_VALIDATION_OBSERVATIONS,
  latestFile('operational-hitl-post-import-validation-observations-', '.json')
);

const manualObservationCsvPath = resolveOptionalPath(
  valueAfter('--manual-observations-csv'),
  process.env.OPERATIONAL_HITL_POST_IMPORT_MANUAL_OBSERVATIONS_CSV,
  latestFile('operational-hitl-post-import-validation-manual-observations-template-', '.csv')
);

const baseOutput = valueAfter('--output-base')
  || process.env.OPERATIONAL_HITL_POST_IMPORT_MANUAL_OBSERVATIONS_IMPORT_OUTPUT_BASE
  || path.join(artifactRoot, `operational-hitl-post-import-validation-observations-manual-import-${timestamp()}`);

const jsonOutputPath = path.resolve(`${baseOutput}.json`);
const markdownOutputPath = path.resolve(`${baseOutput}.md`);

const run = () => {
  const report = importOperationalHitlPostImportManualObservations({
    validationPlan: readOptionalJson(validationPlanPath),
    observations: readOptionalJson(observationsPath),
    manualObservationCsv: readOptionalText(manualObservationCsvPath),
    sourceArtifacts: {
      validationPlan: validationPlanPath,
      observations: observationsPath,
      manualObservationCsv: manualObservationCsvPath
    }
  });

  if (report.markdown) writeText(markdownOutputPath, report.markdown);
  writeJson(jsonOutputPath, {
    ...report,
    markdown: undefined,
    markdownPath: report.markdown ? markdownOutputPath : null
  });

  console.log(JSON.stringify({
    outputPath: jsonOutputPath,
    markdownPath: report.markdown ? markdownOutputPath : null,
    status: report.status,
    serviceWritesPerformed: report.serviceWritesPerformed,
    existingObservationCases: report.summary.existingObservationCases,
    manualImportedRows: report.summary.manualImportedRows,
    invalidRows: report.summary.invalidRows,
    missingCases: report.summary.missingCases,
    recommendedAction: report.recommendedAction
  }, null, 2));

  if (report.status === 'invalid_manual_observations') {
    process.exitCode = 1;
  }
};

try {
  run();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
