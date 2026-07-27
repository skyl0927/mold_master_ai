const fs = require('node:fs');
const path = require('node:path');
const {
  buildMoldMasterDevelopmentProgressReport
} = require('../moldMasterDevelopmentProgressReport');

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

const visionReadinessPath = resolveOptionalPath(
  valueAfter('--vision-readiness'),
  process.env.VISION_OPERATIONAL_READINESS_AUDIT,
  latestArtifact('vision-operational-readiness-audit-'),
  path.join(artifactRoot, 'vision-operational-readiness-audit.json')
);

const visionWorklistPath = resolveOptionalPath(
  valueAfter('--vision-worklist'),
  process.env.VISION_OPERATIONAL_BLOCKER_WORKLIST,
  latestArtifact('vision-operational-blocker-worklist-'),
  path.join(artifactRoot, 'vision-operational-blocker-worklist.json')
);

const commonAgentHandoffPath = resolveOptionalPath(
  valueAfter('--handoff'),
  process.env.VISION_OPERATIONAL_COMMON_AGENT_HANDOFF,
  latestArtifact('vision-operational-common-agent-handoff-'),
  path.join(artifactRoot, 'vision-operational-common-agent-handoff.json')
);

const webKnowledgeReadinessPath = resolveOptionalPath(
  valueAfter('--web-knowledge-readiness'),
  process.env.WEB_KNOWLEDGE_OPERATIONAL_READINESS,
  latestArtifact('web-knowledge-operational-readiness-'),
  path.join(artifactRoot, 'web-knowledge-operational-readiness.json')
);

const outputPath = path.resolve(
  valueAfter('--output')
  || process.env.MOLD_MASTER_DEVELOPMENT_PROGRESS_REPORT_OUTPUT
  || path.join(artifactRoot, `mold-master-development-progress-report-${timestamp()}.json`)
);

const run = () => {
  const report = buildMoldMasterDevelopmentProgressReport({
    visionReadiness: readOptionalJson(visionReadinessPath),
    visionWorklist: readOptionalJson(visionWorklistPath),
    commonAgentHandoff: readOptionalJson(commonAgentHandoffPath),
    webKnowledgeReadiness: readOptionalJson(webKnowledgeReadinessPath),
    sourceArtifacts: {
      visionReadiness: visionReadinessPath,
      visionWorklist: visionWorklistPath,
      commonAgentHandoff: commonAgentHandoffPath,
      webKnowledgeReadiness: webKnowledgeReadinessPath
    }
  });

  writeJson(outputPath, report);
  console.log(JSON.stringify({
    outputPath,
    status: report.status,
    currentPhase: report.currentPhase.titleKo,
    softwareScaffoldPercent: report.progress.software.percent,
    operationalProgressPercent: report.progress.operational.percent,
    topPriorityTaskCode: report.summary.topPriorityTaskCode,
    nextAction: report.nextActions[0]?.titleKo || null,
    serviceWritesPerformed: report.serviceWritesPerformed,
    progressFeedbackKo: report.progressFeedbackKo
  }, null, 2));
};

try {
  run();
} catch (error) {
  const report = buildMoldMasterDevelopmentProgressReport({
    sourceArtifacts: {
      visionReadiness: visionReadinessPath,
      visionWorklist: visionWorklistPath,
      commonAgentHandoff: commonAgentHandoffPath,
      webKnowledgeReadiness: webKnowledgeReadinessPath
    }
  });
  report.status = 'missing_evidence';
  report.error = error instanceof Error ? error.message : String(error);
  writeJson(outputPath, report);
  console.error(error);
  process.exitCode = 1;
}
