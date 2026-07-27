const trimEndpoint = value => String(value || '').trim().replace(/\/+$/, '');

const hasEndpoint = value => trimEndpoint(value).length > 0;

const withRuntimeEndpointDefaults = (config, env = process.env) => {
  const baseConfig = config ? { ...config } : {};
  const agentServerUrl = hasEndpoint(baseConfig.agentServerUrl)
    ? trimEndpoint(baseConfig.agentServerUrl)
    : trimEndpoint(env.COMMON_AGENT_URL);
  const visionQaServerUrl = hasEndpoint(baseConfig.visionQaServerUrl)
    ? trimEndpoint(baseConfig.visionQaServerUrl)
    : trimEndpoint(env.COMMON_AGENT_QA_URL);

  if (agentServerUrl) baseConfig.agentServerUrl = agentServerUrl;
  if (visionQaServerUrl) baseConfig.visionQaServerUrl = visionQaServerUrl;
  if (!config && Object.keys(baseConfig).length === 0) return null;
  return baseConfig;
};

module.exports = {
  withRuntimeEndpointDefaults
};
