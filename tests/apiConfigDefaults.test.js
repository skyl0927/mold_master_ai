const assert = require('node:assert/strict');
const test = require('node:test');

const {
  withRuntimeEndpointDefaults
} = require('../apiConfigDefaults');

test('runtime endpoint defaults use Common Agent environment variables when config is empty', () => {
  const config = withRuntimeEndpointDefaults(null, {
    COMMON_AGENT_URL: 'http://127.0.0.1:8011/',
    COMMON_AGENT_QA_URL: 'http://127.0.0.1:8103/'
  });

  assert.equal(config.agentServerUrl, 'http://127.0.0.1:8011');
  assert.equal(config.visionQaServerUrl, 'http://127.0.0.1:8103');
});

test('saved endpoint config takes precedence over Common Agent environment variables', () => {
  const config = withRuntimeEndpointDefaults({
    provider: 'openai',
    agentServerUrl: 'http://saved-agent.test',
    visionQaServerUrl: 'http://saved-qa.test'
  }, {
    COMMON_AGENT_URL: 'http://env-agent.test',
    COMMON_AGENT_QA_URL: 'http://env-qa.test'
  });

  assert.equal(config.provider, 'openai');
  assert.equal(config.agentServerUrl, 'http://saved-agent.test');
  assert.equal(config.visionQaServerUrl, 'http://saved-qa.test');
});

test('blank saved endpoint fields are filled from environment defaults', () => {
  const config = withRuntimeEndpointDefaults({
    provider: 'gemini',
    agentServerUrl: '   ',
    visionQaServerUrl: ''
  }, {
    COMMON_AGENT_URL: 'http://127.0.0.1:8011'
  });

  assert.equal(config.provider, 'gemini');
  assert.equal(config.agentServerUrl, 'http://127.0.0.1:8011');
  assert.equal(config.visionQaServerUrl, '');
});
