const asArray = value => Array.isArray(value) ? value : [];

const compact = value => String(value || '').replace(/\s+/g, ' ').trim();

const ALLOWED_VERIFY_SCRIPTS = new Set([
  'vision:label-conflicts:verify-decisions',
  'vision:hitl:verify-decisions',
  'knowledge:web:hitl:verify-decisions'
]);

const policy = () => ({
  requiresHumanReview: true,
  explicitExecuteRequired: true,
  validationOnly: true,
  automaticServiceWritesAllowed: false,
  serviceWritesAllowed: false,
  localVerificationWritesAllowed: true,
  allowGraphPromotion: false,
  allowReferenceLearning: false,
  allowModelTraining: false,
  allowApplyCommands: false
});

const missingEvidenceReport = (generatedAt, sourceArtifacts) => ({
  schemaVersion: 1,
  contractVersion: 'operational-hitl-verification-run/v1',
  generatedAt,
  sourceSystem: 'mold-master-ai',
  targetSystem: 'operator_common_agent',
  deliveryMode: 'local_verification_only',
  status: 'missing_evidence',
  executeRequested: false,
  serviceWritesPerformed: false,
  localArtifactsWritten: true,
  localVerificationWritesAllowed: true,
  policy: policy(),
  summary: {
    missingArtifacts: 1,
    missingArtifactNames: ['preflightReport'],
    commandsPlanned: 0,
    commandsExecuted: 0,
    failedCommands: 0,
    invalidCommands: 0,
    readyForVerificationFileCount: 0
  },
  commands: [],
  invalidCommands: [],
  executionResults: [],
  sources: {
    preflightReport: sourceArtifacts.preflightReport || null
  },
  recommendedAction: '먼저 npm run operational:hitl:editable-preflight를 실행해 ready_for_verification 상태를 만드세요.'
});

const splitCommand = command => {
  const tokens = [];
  let token = '';
  let quote = null;
  for (let index = 0; index < String(command || '').length; index += 1) {
    const char = command[index];
    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        token += char;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (token) {
        tokens.push(token);
        token = '';
      }
      continue;
    }
    token += char;
  }
  if (token) tokens.push(token);
  return tokens;
};

const parseVerificationCommand = (command, index) => {
  const tokens = splitCommand(command);
  if (tokens[0] !== 'npm' || tokens[1] !== 'run' || !tokens[2]) {
    return {
      originalCommand: compact(command),
      index,
      code: 'malformed_command',
      message: '허용 형식은 npm run <verify-script> -- --decisions <file> 입니다.'
    };
  }

  const script = tokens[2];
  if (!ALLOWED_VERIFY_SCRIPTS.has(script)) {
    return {
      originalCommand: compact(command),
      index,
      script,
      code: 'unsupported_npm_script',
      message: '허용되지 않은 npm script입니다. apply/approve 계열 명령은 실행할 수 없습니다.'
    };
  }

  const decisionsIndex = tokens.indexOf('--decisions');
  const decisionsPath = decisionsIndex >= 0 ? tokens[decisionsIndex + 1] : '';
  if (!decisionsPath) {
    return {
      originalCommand: compact(command),
      index,
      script,
      code: 'missing_decisions_argument',
      message: '--decisions 파일 경로가 필요합니다.'
    };
  }

  return {
    index,
    originalCommand: compact(command),
    command: 'npm',
    script,
    args: ['--', '--decisions', decisionsPath],
    decisionsPath,
    safeToExecute: true
  };
};

const isReadyPreflight = preflightReport =>
  preflightReport?.contractVersion === 'operational-hitl-editable-decision-preflight/v1'
  && preflightReport?.status === 'ready_for_verification'
  && preflightReport?.serviceWritesPerformed !== true;

const summarize = ({
  preflightReport,
  commands,
  invalidCommands,
  executionResults
}) => ({
  missingArtifacts: 0,
  missingArtifactNames: [],
  commandsPlanned: commands.length,
  commandsExecuted: executionResults.length,
  failedCommands: executionResults.filter(result => result.exitCode !== 0).length,
  invalidCommands: invalidCommands.length,
  readyForVerificationFileCount: Number(preflightReport?.summary?.readyForVerificationFileCount) || 0
});

const statusFor = ({ preflightReport, commands, invalidCommands, executionResults, execute }) => {
  if (!preflightReport || preflightReport.contractVersion !== 'operational-hitl-editable-decision-preflight/v1') {
    return 'missing_evidence';
  }
  if (!isReadyPreflight(preflightReport)) return 'blocked_preflight_not_ready';
  if (invalidCommands.length > 0) return 'invalid_verification_commands';
  if (commands.length === 0) return 'no_verification_commands';
  if (!execute) return 'plan_ready';
  return executionResults.some(result => result.exitCode !== 0)
    ? 'verification_failed'
    : 'executed';
};

const recommendedActionFor = status => ({
  missing_evidence: '먼저 npm run operational:hitl:editable-preflight를 실행해 preflight report를 생성하세요.',
  blocked_preflight_not_ready: 'editable decision 입력을 완료한 뒤 npm run operational:hitl:editable-preflight를 다시 실행하세요.',
  invalid_verification_commands: '허용되지 않은 verify 명령을 제거하고 preflight를 다시 생성하세요.',
  no_verification_commands: 'preflight report에 실행 가능한 verificationCommandsReady가 없습니다.',
  plan_ready: '검증 명령 계획이 유효합니다. 사람이 확인한 뒤 같은 명령에 --execute를 붙여 로컬 검증 리포트를 생성하세요.',
  verification_failed: '하나 이상의 HITL verify 명령이 실패했습니다. executionResults의 stderr/stdout을 확인하세요.',
  executed: 'HITL verify 명령 실행이 완료됐습니다. 생성된 verification report를 확인한 뒤 operational:hitl:common-agent-import-package를 실행하세요.'
}[status] || 'HITL verification run 상태를 확인하세요.');

const buildOperationalHitlVerificationRun = ({
  generatedAt = new Date().toISOString(),
  preflightReport = null,
  execute = false,
  sourceArtifacts = {},
  executeCommand = () => ({ exitCode: 0, stdout: '', stderr: '' })
} = {}) => {
  if (!preflightReport || preflightReport.contractVersion !== 'operational-hitl-editable-decision-preflight/v1') {
    return missingEvidenceReport(generatedAt, sourceArtifacts);
  }

  const parsed = isReadyPreflight(preflightReport)
    ? asArray(preflightReport.verificationCommandsReady).map(parseVerificationCommand)
    : [];
  const commands = parsed.filter(command => command.safeToExecute);
  const invalidCommands = parsed.filter(command => !command.safeToExecute);
  const shouldExecute = execute === true
    && isReadyPreflight(preflightReport)
    && invalidCommands.length === 0;
  const executionResults = shouldExecute
    ? commands.map(command => ({
      script: command.script,
      decisionsPath: command.decisionsPath,
      ...executeCommand(command)
    }))
    : [];
  const status = statusFor({
    preflightReport,
    commands,
    invalidCommands,
    executionResults,
    execute
  });

  return {
    schemaVersion: 1,
    contractVersion: 'operational-hitl-verification-run/v1',
    generatedAt,
    sourceSystem: 'mold-master-ai',
    targetSystem: 'operator_common_agent',
    deliveryMode: 'local_verification_only',
    status,
    executeRequested: execute === true,
    serviceWritesPerformed: false,
    localArtifactsWritten: true,
    localVerificationWritesAllowed: true,
    policy: policy(),
    summary: summarize({
      preflightReport,
      commands,
      invalidCommands,
      executionResults
    }),
    commands,
    invalidCommands,
    executionResults,
    sources: {
      preflightReport: sourceArtifacts.preflightReport || null,
      workspaceManifest: preflightReport.sources?.workspaceManifest || null
    },
    recommendedAction: recommendedActionFor(status)
  };
};

module.exports = {
  ALLOWED_VERIFY_SCRIPTS,
  buildOperationalHitlVerificationRun,
  parseVerificationCommand
};
