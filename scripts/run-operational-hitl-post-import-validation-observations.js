const fs = require('node:fs');
const path = require('node:path');
const {
  collectOperationalHitlPostImportValidationObservations
} = require('../operationalHitlPostImportValidationObservations');

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

const commonAgentUrl = valueAfter('--common-agent-url')
  || process.env.COMMON_AGENT_URL
  || 'http://127.0.0.1:8000';

const baseOutput = valueAfter('--output-base')
  || process.env.OPERATIONAL_HITL_POST_IMPORT_VALIDATION_OBSERVATIONS_OUTPUT_BASE
  || path.join(artifactRoot, `operational-hitl-post-import-validation-observations-${timestamp()}`);

const jsonOutputPath = path.resolve(`${baseOutput}.json`);
const markdownOutputPath = path.resolve(`${baseOutput}.md`);

const run = async () => {
  const observations = await collectOperationalHitlPostImportValidationObservations({
    validationPlan: readOptionalJson(validationPlanPath),
    commonAgentUrl,
    sourceArtifacts: {
      validationPlan: validationPlanPath
    }
  });

  if (observations.markdown) writeText(markdownOutputPath, observations.markdown);
  writeJson(jsonOutputPath, {
    ...observations,
    markdown: undefined,
    markdownPath: observations.markdown ? markdownOutputPath : null
  });

  console.log(JSON.stringify({
    outputPath: jsonOutputPath,
    markdownPath: observations.markdown ? markdownOutputPath : null,
    status: observations.status,
    commonAgentUrl: observations.commonAgentUrl,
    serviceWritesPerformed: observations.serviceWritesPerformed,
    totalPlannedCases: observations.summary.totalPlannedCases,
    graphExecutableCases: observations.summary.graphExecutableCases,
    graphCapturedCases: observations.summary.graphCapturedCases,
    graphFailedCases: observations.summary.graphFailedCases,
    manualObservationRequiredCases: observations.summary.manualObservationRequiredCases,
    recommendedAction: observations.recommendedAction
  }, null, 2));

  if (observations.status === 'graph_observations_collected_with_failures') {
    process.exitCode = 1;
  }
};

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
