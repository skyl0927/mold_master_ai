const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const aiServicePath = path.join(__dirname, '..', 'services', 'aiService.ts');
const aiServiceSource = fs.readFileSync(aiServicePath, 'utf8');
const translateFunction = aiServiceSource.slice(
  aiServiceSource.indexOf('export const translateText'),
  aiServiceSource.indexOf('\n};', aiServiceSource.indexOf('export const translateText')) + 3
);

test('OpenAI translation request does not send unsupported temperature overrides', () => {
  assert.match(translateFunction, /OPENAI_EFFICIENT_MODEL/);
  assert.doesNotMatch(translateFunction, /temperature\s*:/);
});

test('translation errors retain provider details for UI diagnostics', () => {
  assert.match(translateFunction, /throw handleApiError\(error\)/);
});

test('OpenAI analysis requests use the completion token parameter supported by current models', () => {
  assert.doesNotMatch(aiServiceSource, /\bmax_tokens\s*:/);
  assert.match(aiServiceSource, /max_completion_tokens:\s*OPENAI_VISION_MAX_COMPLETION_TOKENS/);
});
