const fs = require('node:fs');
const path = require('node:path');

const {
  buildVisionPendingHitlNonApprovalWorklist
} = require('../visionPendingHitlNonApprovalWorklist');

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

const resolvePath = value => value ? path.resolve(value) : null;

const readOptionalJson = filePath => {
  if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
};

const writeJson = (filePath, payload) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
};

const decisionVerificationPath = resolvePath(
  valueAfter('--decision-verification')
  || process.env.VISION_PENDING_HITL_DECISION_VERIFICATION_REPORT
  || latestArtifact('vision-pending-hitl-decision-verification-report-')
);
const outputPath = path.resolve(
  valueAfter('--output')
  || process.env.VISION_PENDING_HITL_NON_APPROVAL_WORKLIST_OUTPUT
  || path.join(artifactRoot, `vision-pending-hitl-non-approval-worklist-${timestamp()}.json`)
);

const run = () => {
  const worklist = buildVisionPendingHitlNonApprovalWorklist({
    decisionVerificationReport: readOptionalJson(decisionVerificationPath),
    sourceArtifacts: {
      decisionVerificationReport: decisionVerificationPath
    }
  });

  writeJson(outputPath, worklist);
  console.log(JSON.stringify({
    outputPath,
    status: worklist.status,
    totalItems: worklist.summary.totalItems,
    needsReviewItems: worklist.summary.needsReviewItems,
    rejectedCandidates: worklist.summary.rejectedCandidates,
    recaptureRequests: worklist.summary.recaptureRequests,
    approvalCandidatesExcluded: worklist.summary.approvalCandidatesExcluded,
    serviceWritesPerformed: worklist.serviceWritesPerformed,
    recommendedAction: worklist.recommendedAction
  }, null, 2));
};

try {
  run();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
