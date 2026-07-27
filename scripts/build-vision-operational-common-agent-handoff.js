const fs = require('node:fs');
const path = require('node:path');
const {
  buildVisionOperationalBlockerWorklist
} = require('../visionOperationalBlockerWorklist');
const {
  buildVisionOperationalCommonAgentHandoff
} = require('../visionOperationalCommonAgentHandoff');

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

const readinessPath = resolveOptionalPath(
  valueAfter('--readiness'),
  process.env.VISION_OPERATIONAL_READINESS_AUDIT,
  latestArtifact('vision-operational-readiness-audit-'),
  path.join(artifactRoot, 'vision-operational-readiness-audit.json')
);

const worklistPath = resolveOptionalPath(
  valueAfter('--worklist'),
  process.env.VISION_OPERATIONAL_BLOCKER_WORKLIST,
  latestArtifact('vision-operational-blocker-worklist-'),
  path.join(artifactRoot, 'vision-operational-blocker-worklist.json')
);

const outputPath = path.resolve(
  valueAfter('--output')
  || process.env.VISION_OPERATIONAL_COMMON_AGENT_HANDOFF_OUTPUT
  || path.join(artifactRoot, `vision-operational-common-agent-handoff-${timestamp()}.json`)
);

const run = () => {
  const readinessAudit = readOptionalJson(readinessPath);
  const storedWorklist = readOptionalJson(worklistPath);
  const worklist = storedWorklist || buildVisionOperationalBlockerWorklist({
    readinessAudit
  });
  const packet = buildVisionOperationalCommonAgentHandoff({
    readinessAudit,
    worklist,
    sourceArtifacts: {
      readinessAudit: readinessPath,
      blockerWorklist: storedWorklist ? worklistPath : null
    }
  });

  writeJson(outputPath, packet);
  console.log(JSON.stringify({
    outputPath,
    status: packet.status,
    manualImportAllowed: packet.manualImportAllowed,
    totalTasks: packet.summary.totalTasks,
    primaryTask: packet.summary.primaryTaskCode,
    serviceWritesPerformed: packet.serviceWritesPerformed,
    recommendedAction: packet.recommendedAction
  }, null, 2));
};

try {
  run();
} catch (error) {
  const packet = buildVisionOperationalCommonAgentHandoff({
    readinessAudit: null,
    worklist: null,
    sourceArtifacts: {
      readinessAudit: readinessPath,
      blockerWorklist: worklistPath
    }
  });
  packet.summary.error = error instanceof Error ? error.message : String(error);
  writeJson(outputPath, packet);
  console.error(error);
  process.exitCode = 1;
}
