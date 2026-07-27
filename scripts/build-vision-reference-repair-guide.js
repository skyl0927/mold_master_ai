const fs = require('node:fs');
const path = require('node:path');
const {
  buildVisionReferenceRepairGuide
} = require('../visionReferenceRepairGuide');

const root = path.resolve(__dirname, '..');
const artifactRoot = path.join(root, 'artifacts');
const args = process.argv.slice(2);

const valueAfter = flag => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};

const timestamp = () => new Date().toISOString().replace(/[:.]/g, '-');

const latestTimestampedArtifact = prefix => {
  if (!fs.existsSync(artifactRoot)) return null;
  const matches = fs.readdirSync(artifactRoot)
    .filter(name =>
      name.startsWith(prefix)
      && name.endsWith('.json')
      && /^\d{4}-\d{2}-\d{2}T/.test(name.slice(prefix.length))
    )
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
  latestTimestampedArtifact('vision-operational-readiness-audit-'),
  path.join(artifactRoot, 'vision-operational-readiness-audit.json')
);

const referenceGatePath = resolveOptionalPath(
  valueAfter('--reference-gate'),
  process.env.VISION_REFERENCE_GATE_REPORT,
  latestTimestampedArtifact('vision-reference-operational-gate-'),
  path.join(artifactRoot, 'vision-reference-operational-gate.json')
);

const backfillPlanPath = resolveOptionalPath(
  valueAfter('--backfill-plan'),
  process.env.VISION_REFERENCE_BACKFILL_PLAN,
  latestTimestampedArtifact('vision-reference-backfill-plan-'),
  path.join(artifactRoot, 'vision-reference-backfill-plan.json')
);

const outputPath = path.resolve(
  valueAfter('--output')
  || process.env.VISION_REFERENCE_REPAIR_GUIDE_OUTPUT
  || path.join(artifactRoot, `vision-reference-repair-guide-${timestamp()}.json`)
);

const run = () => {
  const guide = buildVisionReferenceRepairGuide({
    readinessAudit: readOptionalJson(readinessPath),
    referenceGateReport: readOptionalJson(referenceGatePath),
    backfillPlan: readOptionalJson(backfillPlanPath)
  });
  const artifact = {
    ...guide,
    sources: {
      readinessAudit: readinessPath,
      referenceGateReport: referenceGatePath,
      backfillPlan: backfillPlanPath
    }
  };

  writeJson(outputPath, artifact);
  console.log(JSON.stringify({
    outputPath,
    status: artifact.status,
    serviceWritesPerformed: artifact.serviceWritesPerformed,
    refreshAllowedNow: artifact.summary.refreshAllowedNow,
    referenceBlockers: artifact.summary.referenceBlockers,
    labelConflicts: artifact.summary.labelConflicts,
    pendingHitlReviews: artifact.summary.pendingHitlReviews,
    approvedSampleMissing: artifact.summary.approvedSampleMissing,
    needsHitlBackfill: artifact.summary.needsHitlBackfill,
    firstStep: artifact.repairSteps[0]?.code || null,
    nextCommand: artifact.nextCommand,
    recommendedAction: artifact.recommendedAction
  }, null, 2));

  if (!['passed', 'ready_for_refresh'].includes(artifact.status)) {
    process.exitCode = 1;
  }
};

try {
  run();
} catch (error) {
  const artifact = buildVisionReferenceRepairGuide({});
  artifact.error = error instanceof Error ? error.message : String(error);
  artifact.sources = {
    readinessAudit: readinessPath,
    referenceGateReport: referenceGatePath,
    backfillPlan: backfillPlanPath
  };
  writeJson(outputPath, artifact);
  console.error(error);
  process.exitCode = 1;
}
