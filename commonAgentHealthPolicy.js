const COMMON_AGENT_HEALTH_PATHS = Object.freeze([
  '/v1/vision/status',
  '/healthz',
  '/health'
]);

const COMMON_AGENT_PRIMARY_HEALTH_PATH = COMMON_AGENT_HEALTH_PATHS[0];

module.exports = {
  COMMON_AGENT_HEALTH_PATHS,
  COMMON_AGENT_PRIMARY_HEALTH_PATH
};
