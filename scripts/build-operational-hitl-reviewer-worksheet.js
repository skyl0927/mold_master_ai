const fs = require('node:fs');
const path = require('node:path');
const {
  buildOperationalHitlReviewerWorksheet
} = require('../operationalHitlReviewerWorksheet');

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

const inputReviewPacketPath = resolveOptionalPath(
  valueAfter('--input-review-packet'),
  process.env.OPERATIONAL_HITL_DECISION_INPUT_REVIEW_PACKET,
  latestArtifact('operational-hitl-decision-input-review-packet-')
);

const baseOutput = valueAfter('--output-base')
  || process.env.OPERATIONAL_HITL_REVIEWER_WORKSHEET_OUTPUT_BASE
  || path.join(artifactRoot, `operational-hitl-reviewer-worksheet-${timestamp()}`);

const markdownOutputPath = path.resolve(`${baseOutput}.md`);
const manifestOutputPath = path.resolve(`${baseOutput}.json`);

const run = () => {
  const worksheet = buildOperationalHitlReviewerWorksheet({
    inputReviewPacket: readOptionalJson(inputReviewPacketPath),
    sourceArtifacts: {
      inputReviewPacket: inputReviewPacketPath
    },
    markdownPath: markdownOutputPath
  });

  if (worksheet.markdown) writeText(markdownOutputPath, worksheet.markdown);
  writeJson(manifestOutputPath, {
    ...worksheet,
    markdown: undefined
  });

  console.log(JSON.stringify({
    outputPath: manifestOutputPath,
    markdownPath: worksheet.markdown ? markdownOutputPath : null,
    status: worksheet.status,
    serviceWritesPerformed: worksheet.serviceWritesPerformed,
    targetDecisionInputsMissing: worksheet.summary.targetDecisionInputsMissing,
    firstQueueCode: worksheet.summary.firstQueueCode,
    markdownLineCount: worksheet.summary.markdownLineCount,
    recommendedAction: worksheet.recommendedAction
  }, null, 2));

  if (worksheet.status === 'missing_evidence') process.exitCode = 1;
};

try {
  run();
} catch (error) {
  const worksheet = buildOperationalHitlReviewerWorksheet({
    sourceArtifacts: {
      inputReviewPacket: inputReviewPacketPath
    },
    markdownPath: markdownOutputPath
  });
  worksheet.error = error instanceof Error ? error.message : String(error);
  writeJson(manifestOutputPath, worksheet);
  console.error(error);
  process.exitCode = 1;
}
