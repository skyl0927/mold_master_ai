const fs = require('node:fs');
const path = require('node:path');
const {
  buildWebKnowledgeHitlReviewGuide
} = require('../webKnowledgeHitlReviewGuide');

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

const writeJson = (filePath, payload) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
};

const writeText = (filePath, payload) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, payload, 'utf8');
};

const decisionTemplatePath = resolveOptionalPath(
  valueAfter('--decision-template'),
  process.env.MOLD_MASTER_WEB_HITL_DECISION_TEMPLATE,
  latestArtifact('common-agent-web-knowledge-hitl-decisions-template-'),
  path.join(artifactRoot, 'common-agent-web-knowledge-hitl-decisions-template.json')
);

const outputPath = path.resolve(
  valueAfter('--output')
  || process.env.MOLD_MASTER_WEB_HITL_REVIEW_GUIDE_OUTPUT
  || path.join(artifactRoot, `web-knowledge-hitl-review-guide-${timestamp()}.json`)
);

const outputBasePath = outputPath.replace(/\.json$/i, '');
const markdownWorksheetPath = path.resolve(
  valueAfter('--markdown-output')
  || process.env.MOLD_MASTER_WEB_HITL_REVIEW_GUIDE_MARKDOWN_OUTPUT
  || `${outputBasePath}.md`
);
const csvWorksheetPath = path.resolve(
  valueAfter('--csv-output')
  || process.env.MOLD_MASTER_WEB_HITL_REVIEW_GUIDE_CSV_OUTPUT
  || `${outputBasePath}.csv`
);

const run = () => {
  const guide = buildWebKnowledgeHitlReviewGuide({
    decisionTemplate: readOptionalJson(decisionTemplatePath),
    sourceArtifacts: {
      decisionTemplate: decisionTemplatePath
    }
  });

  guide.outputs = {
    markdownWorksheetPath,
    csvWorksheetPath
  };
  writeText(markdownWorksheetPath, guide.reviewWorksheet.markdown);
  writeText(csvWorksheetPath, guide.reviewWorksheet.csvText);
  writeJson(outputPath, guide);
  console.log(JSON.stringify({
    outputPath,
    markdownWorksheetPath,
    csvWorksheetPath,
    status: guide.status,
    decisionsPrepared: guide.summary.decisionsPrepared,
    approvalReadyCandidates: guide.summary.approvalReadyCandidates,
    needsEvidenceRepair: guide.summary.needsEvidenceRepair,
    citationOnlySources: guide.summary.citationOnlySources,
    staleCards: guide.summary.staleCards,
    serviceWritesPerformed: guide.serviceWritesPerformed,
    firstCaseId: guide.items[0]?.caseId || null,
    firstQualityFlags: guide.items[0]?.qualityFlags || [],
    recommendedAction: guide.recommendedAction
  }, null, 2));
};

try {
  run();
} catch (error) {
  const guide = buildWebKnowledgeHitlReviewGuide({
    decisionTemplate: null,
    sourceArtifacts: {
      decisionTemplate: decisionTemplatePath
    }
  });
  guide.status = 'missing_decision_template';
  guide.error = error instanceof Error ? error.message : String(error);
  guide.outputs = {
    markdownWorksheetPath,
    csvWorksheetPath
  };
  writeText(markdownWorksheetPath, guide.reviewWorksheet.markdown);
  writeText(csvWorksheetPath, guide.reviewWorksheet.csvText);
  writeJson(outputPath, guide);
  console.error(error);
  process.exitCode = 1;
}
