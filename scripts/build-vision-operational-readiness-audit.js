const fs = require('node:fs');
const path = require('node:path');
const {
  buildVisionOperationalReadinessAudit
} = require('../visionOperationalReadinessAudit');

const root = path.resolve(__dirname, '..');
const artifactRoot = path.join(root, 'artifacts');
const args = process.argv.slice(2);

const valueAfter = flag => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};

const timestamp = () => new Date().toISOString().replace(/[:.]/g, '-');

const outputPath = path.resolve(
  valueAfter('--output')
  || process.env.VISION_OPERATIONAL_READINESS_AUDIT_OUTPUT
  || path.join(artifactRoot, `vision-operational-readiness-audit-${timestamp()}.json`)
);

const sourcePath = (flag, envName, fallback) => path.resolve(
  valueAfter(flag)
  || process.env[envName]
  || fallback
);

const latestArtifact = prefix => {
  if (!fs.existsSync(artifactRoot)) return null;
  const matches = fs.readdirSync(artifactRoot)
    .filter(name => name.startsWith(prefix) && name.endsWith('.json'))
    .map(name => path.join(artifactRoot, name))
    .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs);
  return matches[0] || null;
};

const optionalSourcePath = (flag, envName, fallback) => {
  const candidate = valueAfter(flag) || process.env[envName] || fallback;
  return candidate ? path.resolve(candidate) : null;
};

const paths = {
  referenceGate: sourcePath(
    '--reference-gate',
    'VISION_REFERENCE_GATE_REPORT',
    path.join(artifactRoot, 'vision-reference-operational-gate.json')
  ),
  postHitlVerification: sourcePath(
    '--post-hitl',
    'POST_HITL_VERIFICATION_REPORT',
    path.join(artifactRoot, 'post-hitl-verification-report.json')
  ),
  releaseReport: sourcePath(
    '--release',
    'VISION_OPERATIONAL_RELEASE_REPORT',
    path.join(artifactRoot, 'vision-operational-release-report.json')
  ),
  releaseEvidenceAlignment: valueAfter('--release-evidence-alignment') || process.env.VISION_OPERATIONAL_RELEASE_EVIDENCE_ALIGNMENT,
  hitlQueuePacket: optionalSourcePath(
    '--hitl-queue',
    'VISION_PENDING_HITL_REVIEW_QUEUE_PACKET',
    latestArtifact('vision-pending-hitl-review-queue-packet-')
  ),
  hitlDecisionTemplate: optionalSourcePath(
    '--hitl-decision-template',
    'VISION_PENDING_HITL_DECISION_TEMPLATE',
    latestArtifact('common-agent-hitl-review-decisions-template-')
  ),
  hitlDecisionVerification: optionalSourcePath(
    '--hitl-decision-verification',
    'VISION_PENDING_HITL_DECISION_VERIFICATION_REPORT',
    latestArtifact('vision-pending-hitl-decision-verification-report-')
  )
};

const readOptionalJson = filePath => {
  if (!filePath) return null;
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) return null;
  return JSON.parse(fs.readFileSync(resolved, 'utf8').replace(/^\uFEFF/, ''));
};

const writeJson = (filePath, payload) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
};

const run = () => {
  const audit = buildVisionOperationalReadinessAudit({
    referenceGateReport: readOptionalJson(paths.referenceGate),
    postHitlVerificationReport: readOptionalJson(paths.postHitlVerification),
    releaseReport: readOptionalJson(paths.releaseReport),
    releaseEvidenceAlignment: readOptionalJson(paths.releaseEvidenceAlignment),
    hitlQueuePacket: readOptionalJson(paths.hitlQueuePacket),
    hitlDecisionTemplate: readOptionalJson(paths.hitlDecisionTemplate),
    hitlDecisionVerificationReport: readOptionalJson(paths.hitlDecisionVerification)
  });
  const artifact = {
    ...audit,
    sources: paths
  };

  writeJson(outputPath, artifact);
  console.log(JSON.stringify({
    outputPath,
    status: artifact.status,
    readyForCandidateActivation: artifact.readyForCandidateActivation,
    autoActivationAllowed: artifact.autoActivationAllowed,
    blockers: artifact.blockers,
    pendingActions: artifact.pendingActions,
    recommendedAction: artifact.recommendedAction
  }, null, 2));

  if (artifact.status !== 'approved_for_manual_activation') {
    process.exitCode = 1;
  }
};

try {
  run();
} catch (error) {
  const artifact = {
    schemaVersion: 1,
    contractVersion: 'vision-operational-readiness-audit/v1',
    generatedAt: new Date().toISOString(),
    status: 'action_required',
    readyForCandidateActivation: false,
    autoActivationAllowed: false,
    serviceWritesPerformed: false,
    localArtifactsWritten: true,
    blockers: [{
      source: 'audit_runner',
      code: 'operational_readiness_audit_failed',
      detail: error instanceof Error ? error.message : String(error)
    }],
    pendingActions: [],
    recommendedAction: 'Fix the audit input artifacts, then rerun the Vision operational readiness audit.',
    sources: paths
  };
  writeJson(outputPath, artifact);
  console.error(error);
  process.exitCode = 1;
}
