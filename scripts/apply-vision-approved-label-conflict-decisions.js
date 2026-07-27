const fs = require('node:fs');
const path = require('node:path');
const {
  applyVisionApprovedLabelConflictDecisionVerificationReport
} = require('../visionApprovedLabelConflictDecisionApply');

const root = path.resolve(__dirname, '..');
const artifactRoot = path.join(root, 'artifacts');
const args = process.argv.slice(2);

const valueAfter = flag => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};

const hasFlag = flag => args.includes(flag);

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

const verificationReportPath = resolveOptionalPath(
  valueAfter('--verification'),
  valueAfter('--decision-verification'),
  process.env.VISION_APPROVED_LABEL_CONFLICT_DECISION_VERIFICATION_REPORT,
  latestArtifact('vision-approved-label-conflict-decision-verification-report-')
);

const fixtureRoot = path.resolve(
  valueAfter('--fixture-root')
  || process.env.VISION_APPROVED_FIXTURE_ROOT
  || path.join(root, 'eval', 'vision-approved')
);

const outputPath = path.resolve(
  valueAfter('--output')
  || process.env.VISION_APPROVED_LABEL_CONFLICT_APPLY_REPORT_OUTPUT
  || path.join(artifactRoot, `vision-approved-label-conflict-decision-apply-report-${timestamp()}.json`)
);

const run = () => {
  const report = applyVisionApprovedLabelConflictDecisionVerificationReport({
    verificationReport: readOptionalJson(verificationReportPath),
    fixtureRoot,
    apply: hasFlag('--apply'),
    sourceArtifacts: {
      verificationReport: verificationReportPath,
      approvedFixtureRoot: fixtureRoot
    }
  });

  writeJson(outputPath, report);
  console.log(JSON.stringify({
    outputPath,
    status: report.status,
    applyRequested: report.applyRequested,
    plannedCaseUpdates: report.summary.plannedCaseUpdates,
    appliedCaseUpdates: report.summary.appliedCaseUpdates,
    resolvedQualityIssues: report.summary.resolvedQualityIssues,
    invalidTargets: report.summary.invalidTargets,
    localFixtureWritesPerformed: report.localFixtureWritesPerformed,
    serviceWritesPerformed: report.serviceWritesPerformed,
    recommendedAction: report.recommendedAction
  }, null, 2));

  if (['invalid_verification_report', 'invalid_fixture_root', 'apply_target_mismatch'].includes(report.status)) {
    process.exitCode = 1;
  }
};

try {
  run();
} catch (error) {
  const report = applyVisionApprovedLabelConflictDecisionVerificationReport({
    verificationReport: null,
    fixtureRoot,
    apply: hasFlag('--apply'),
    sourceArtifacts: {
      verificationReport: verificationReportPath,
      approvedFixtureRoot: fixtureRoot
    }
  });
  report.status = 'invalid_verification_report';
  report.error = error instanceof Error ? error.message : String(error);
  writeJson(outputPath, report);
  console.error(error);
  process.exitCode = 1;
}
