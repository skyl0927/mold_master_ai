const asArray = value => Array.isArray(value) ? value : [];

const compact = value => String(value || '').replace(/\s+/g, ' ').trim();

const unique = values => [...new Set(values.map(compact).filter(Boolean))];

const numberFrom = (...values) => {
  const value = values.find(item => Number.isFinite(Number(item)));
  return value === undefined ? 0 : Number(value);
};

const isContract = (artifact, contractVersion) =>
  artifact?.contractVersion === contractVersion;

const ALLOWED_PREPARATION_SCRIPTS = new Map([
  ['npm run vision:label-conflicts:decision-template', {
    script: 'vision:label-conflicts:decision-template',
    nodeScript: 'scripts/build-vision-approved-label-conflict-decision-template.js'
  }],
  ['npm run vision:label-conflicts:review-guide', {
    script: 'vision:label-conflicts:review-guide',
    nodeScript: 'scripts/build-vision-approved-label-conflict-review-guide.js'
  }],
  ['npm run vision:hitl:decision-template', {
    script: 'vision:hitl:decision-template',
    nodeScript: 'scripts/build-vision-pending-hitl-decision-template.js'
  }],
  ['npm run vision:hitl:review-guide', {
    script: 'vision:hitl:review-guide',
    nodeScript: 'scripts/build-vision-pending-hitl-review-guide.js'
  }],
  ['npm run knowledge:web:hitl:decision-template', {
    script: 'knowledge:web:hitl:decision-template',
    nodeScript: 'scripts/build-web-knowledge-hitl-decision-template.js'
  }],
  ['npm run knowledge:web:hitl:review-guide', {
    script: 'knowledge:web:hitl:review-guide',
    nodeScript: 'scripts/build-web-knowledge-hitl-review-guide.js'
  }]
]);

const policy = () => ({
  requiresHumanReview: true,
  autoApplyAllowed: false,
  automaticServiceWritesAllowed: false,
  allowGraphPromotion: false,
  allowReferenceLearning: false,
  allowModelTraining: false
});

const commandSpecFor = command => {
  const normalized = compact(command);
  const allowed = ALLOWED_PREPARATION_SCRIPTS.get(normalized);
  if (!allowed) return null;
  return {
    command: normalized,
    executable: process.execPath,
    args: [allowed.nodeScript],
    script: allowed.script,
    nodeScript: allowed.nodeScript,
    shell: false
  };
};

const parseCliJson = stdout => {
  const text = String(stdout || '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return {};
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return {};
  }
};

const excerpt = value =>
  compact(String(value || '').slice(0, 1000));

const companionOutputPathsFor = payload => [
  payload.markdownWorksheetPath,
  payload.csvWorksheetPath,
  payload.markdownPath,
  payload.csvPath
].map(compact).filter(Boolean);

const executedCommandFor = ({ commandSpec, result }) => {
  const payload = parseCliJson(result.stdout);
  const exitCode = Number(result.exitCode ?? result.status ?? 1);
  const companionOutputPaths = companionOutputPathsFor(payload);
  return {
    command: commandSpec.command,
    script: commandSpec.script,
    exitCode,
    status: exitCode === 0 ? 'completed' : 'failed',
    shellUsed: commandSpec.shell === true,
    outputPath: compact(payload.outputPath) || null,
    companionOutputPaths,
    reportedStatus: compact(payload.status) || null,
    reportedServiceWritesPerformed: payload.serviceWritesPerformed === true,
    stdoutExcerpt: excerpt(result.stdout),
    stderrExcerpt: excerpt(result.stderr)
  };
};

const missingEvidenceRun = (generatedAt, sourceArtifacts) => ({
  schemaVersion: 1,
  contractVersion: 'operational-hitl-preparation-run/v1',
  generatedAt,
  sourceSystem: 'mold-master-ai',
  targetSystem: 'operator_common_agent',
  status: 'missing_evidence',
  serviceWritesPerformed: false,
  localArtifactsWritten: true,
  policy: policy(),
  summary: {
    missingArtifacts: 1,
    missingArtifactNames: ['preparationPlan'],
    preparationCommandsRequested: 0,
    executedCommands: 0,
    failedCommands: 0,
    skippedHumanGatedCommands: 0,
    unsafeCommandCount: 0,
    generatedArtifactCount: 0,
    firstFailedCommand: null
  },
  executedCommands: [],
  skippedCommands: [],
  unsafeCommands: [],
  generatedArtifacts: [],
  sources: {
    preparationPlan: sourceArtifacts.preparationPlan || null
  },
  recommendedAction: '먼저 npm run operational:hitl:prepare-plan으로 준비 플랜을 생성하세요.'
});

const unsafeCommandRun = ({ generatedAt, preparationPlan, sourceArtifacts, unsafeCommands }) => ({
  schemaVersion: 1,
  contractVersion: 'operational-hitl-preparation-run/v1',
  generatedAt,
  sourceSystem: 'mold-master-ai',
  targetSystem: 'operator_common_agent',
  status: 'blocked_unsafe_command',
  serviceWritesPerformed: false,
  localArtifactsWritten: true,
  policy: policy(),
  summary: {
    totalDecisionInputsMissing: numberFrom(preparationPlan.summary?.totalDecisionInputsMissing),
    firstQueueCode: compact(preparationPlan.summary?.firstQueueCode) || null,
    preparationCommandsRequested: asArray(preparationPlan.preparationCommands).length,
    executedCommands: 0,
    failedCommands: 0,
    skippedHumanGatedCommands: asArray(preparationPlan.humanGatedCommands).length,
    unsafeCommandCount: unsafeCommands.length,
    generatedArtifactCount: 0,
    firstFailedCommand: null
  },
  executedCommands: [],
  skippedCommands: asArray(preparationPlan.humanGatedCommands).map(command => ({
    command: compact(command),
    reason: 'human_decision_required'
  })),
  unsafeCommands: unsafeCommands.map(command => ({
    command,
    reason: 'not_allowlisted_preparation_command'
  })),
  generatedArtifacts: [],
  sources: {
    preparationPlan: sourceArtifacts.preparationPlan || null
  },
  recommendedAction: '허용되지 않은 준비 명령이 포함되어 실행을 중단했습니다. preparation plan을 재생성하고 명령 allowlist를 확인하세요.'
});

const runOperationalHitlPreparation = ({
  generatedAt = new Date().toISOString(),
  preparationPlan = null,
  sourceArtifacts = {},
  executeCommand = () => ({ exitCode: 1, stdout: '', stderr: 'executeCommand not provided' })
} = {}) => {
  if (!isContract(preparationPlan, 'operational-hitl-preparation-plan/v1')) {
    return missingEvidenceRun(generatedAt, sourceArtifacts);
  }

  const preparationCommands = unique(asArray(preparationPlan.preparationCommands));
  const commandSpecs = preparationCommands.map(command => ({
    command,
    spec: commandSpecFor(command)
  }));
  const unsafeCommands = commandSpecs
    .filter(item => !item.spec)
    .map(item => item.command);
  if (unsafeCommands.length > 0) {
    return unsafeCommandRun({
      generatedAt,
      preparationPlan,
      sourceArtifacts,
      unsafeCommands
    });
  }

  const executedCommands = [];
  for (const { spec } of commandSpecs) {
    const result = executeCommand(spec);
    const executed = executedCommandFor({ commandSpec: spec, result });
    executedCommands.push(executed);
    if (executed.status === 'failed') break;
  }

  const failed = executedCommands.filter(item => item.status === 'failed');
  const generatedArtifacts = unique(executedCommands
    .filter(item => item.status === 'completed')
    .flatMap(item => [
      item.outputPath,
      ...asArray(item.companionOutputPaths)
    ]));
  const skippedCommands = asArray(preparationPlan.humanGatedCommands).map(command => ({
    command: compact(command),
    reason: 'human_decision_required'
  }));
  const status = preparationPlan.status === 'clear'
    ? 'nothing_to_prepare'
    : failed.length > 0
      ? 'partial_failure'
      : 'completed';
  const firstHumanGated = compact(preparationPlan.summary?.firstHumanGatedCommand)
    || skippedCommands[0]?.command
    || null;

  return {
    schemaVersion: 1,
    contractVersion: 'operational-hitl-preparation-run/v1',
    generatedAt,
    sourceSystem: 'mold-master-ai',
    targetSystem: 'operator_common_agent',
    status,
    serviceWritesPerformed: false,
    localArtifactsWritten: true,
    policy: policy(),
    summary: {
      totalDecisionInputsMissing: numberFrom(preparationPlan.summary?.totalDecisionInputsMissing),
      firstQueueCode: compact(preparationPlan.summary?.firstQueueCode) || null,
      preparationCommandsRequested: preparationCommands.length,
      executedCommands: executedCommands.length,
      failedCommands: failed.length,
      skippedHumanGatedCommands: skippedCommands.length,
      unsafeCommandCount: 0,
      generatedArtifactCount: generatedArtifacts.length,
      firstFailedCommand: failed[0]?.command || null
    },
    executedCommands,
    skippedCommands,
    unsafeCommands: [],
    generatedArtifacts,
    sources: {
      preparationPlan: sourceArtifacts.preparationPlan || null
    },
    recommendedAction: failed.length > 0
      ? `${failed[0].command} 실패를 먼저 수정한 뒤 준비 실행을 다시 수행하세요.`
      : firstHumanGated
        ? `준비 artifact 생성이 끝났습니다. 사람이 decision file을 채운 뒤 ${firstHumanGated} 명령으로 검증하세요.`
        : 'HITL 준비 명령이 남아 있지 않습니다. npm run operational:progress로 다음 운영 게이트를 확인하세요.'
  };
};

module.exports = {
  ALLOWED_PREPARATION_SCRIPTS,
  commandSpecFor,
  runOperationalHitlPreparation
};
