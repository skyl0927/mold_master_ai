const compact = value => String(value || '').replace(/\s+/g, ' ').trim();

const DEFAULT_REFRESH_COMMANDS = [
  'npm run operational:hitl:worktable-import',
  'npm run operational:hitl:session-progress',
  'npm run operational:hitl:pipeline-status',
  'npm run vision:capture:work-orders:status',
  'npm run operational:progress',
  'npm run operational:hitl:human-brief',
  'npm run operational:hitl:decision-review-packet',
  'npm run operational:hitl:reviewer-worksheet',
  'npm run operational:status-bundle'
];

const ALLOWED_REFRESH_SCRIPTS = new Set(DEFAULT_REFRESH_COMMANDS.map(command =>
  command.replace(/^npm run /, '')
));

const policy = () => ({
  requiresHumanReview: true,
  explicitExecuteRequired: true,
  statusRefreshOnly: true,
  automaticServiceWritesAllowed: false,
  serviceWritesAllowed: false,
  localArtifactsWritten: true,
  localEditableWritesAllowed: false,
  allowApplyCommands: false,
  allowVerifyExecute: false,
  allowGraphPromotion: false,
  allowReferenceLearning: false,
  allowModelTraining: false
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

const parseRefreshCommand = (command, index) => {
  const tokens = splitCommand(command);
  if (tokens[0] !== 'npm' || tokens[1] !== 'run' || !tokens[2]) {
    return {
      originalCommand: compact(command),
      index,
      code: 'malformed_command',
      message: 'Allowed format is npm run <safe-refresh-script>.'
    };
  }

  const script = tokens[2];
  if (!ALLOWED_REFRESH_SCRIPTS.has(script)) {
    return {
      originalCommand: compact(command),
      index,
      script,
      code: 'unsupported_refresh_script',
      message: 'This refresh runner only allows no-apply, no-verify status artifact scripts.'
    };
  }

  if (tokens.length > 3) {
    return {
      originalCommand: compact(command),
      index,
      script,
      code: 'arguments_not_allowed',
      message: 'Arguments are blocked so --apply, --execute, and shell chaining cannot enter the refresh path.'
    };
  }

  return {
    index,
    originalCommand: compact(command),
    command: 'npm',
    script,
    args: [],
    safeToExecute: true
  };
};

const statusFor = ({ invalidCommands, executionResults, execute }) => {
  if (invalidCommands.length > 0) return 'invalid_refresh_commands';
  if (!execute) return 'plan_ready';
  return executionResults.some(result => result.exitCode !== 0)
    ? 'refresh_failed'
    : 'executed';
};

const recommendedActionFor = status => ({
  invalid_refresh_commands: 'Remove unsupported refresh commands. Apply, verify --execute, and arbitrary shell commands are intentionally blocked.',
  plan_ready: 'Review the refresh plan, then run npm run operational:refresh-status -- --execute after the human HITL CSV has been edited.',
  refresh_failed: 'At least one failed command needs inspection. Check executionResults stdout/stderr, fix the artifact gap, then rerun the refresh.',
  executed: 'Refresh completed. Open the latest operational-status-bundle artifact or register it in Settings to review the next HITL gate.'
}[status] || 'Review the operational status refresh report.');

const buildOperationalStatusRefreshRun = ({
  generatedAt = new Date().toISOString(),
  execute = false,
  commands = DEFAULT_REFRESH_COMMANDS,
  executeCommand = () => ({ exitCode: 0, stdout: '', stderr: '' })
} = {}) => {
  const parsed = commands.map(parseRefreshCommand);
  const validCommands = parsed.filter(command => command.safeToExecute);
  const invalidCommands = parsed.filter(command => !command.safeToExecute);
  const shouldExecute = execute === true && invalidCommands.length === 0;
  const executionResults = shouldExecute
    ? validCommands.map(command => ({
      script: command.script,
      command: command.originalCommand,
      ...executeCommand(command)
    }))
    : [];
  const status = statusFor({
    invalidCommands,
    executionResults,
    execute
  });

  return {
    schemaVersion: 1,
    contractVersion: 'operational-status-refresh-run/v1',
    generatedAt,
    sourceSystem: 'mold-master-ai',
    targetSystem: 'operator_common_agent',
    deliveryMode: 'local_status_refresh_only',
    status,
    executeRequested: execute === true,
    serviceWritesPerformed: false,
    localArtifactsWritten: true,
    policy: policy(),
    summary: {
      commandsPlanned: validCommands.length,
      commandsExecuted: executionResults.length,
      failedCommands: executionResults.filter(result => result.exitCode !== 0).length,
      invalidCommands: invalidCommands.length
    },
    commands: validCommands,
    invalidCommands,
    executionResults,
    recommendedAction: recommendedActionFor(status)
  };
};

module.exports = {
  DEFAULT_REFRESH_COMMANDS,
  ALLOWED_REFRESH_SCRIPTS,
  buildOperationalStatusRefreshRun,
  parseRefreshCommand
};
