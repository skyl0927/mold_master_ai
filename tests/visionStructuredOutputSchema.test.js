const assert = require('node:assert/strict');
const test = require('node:test');
const {
  VISION_OBSERVATION_JSON_SCHEMA,
  buildGeminiVisionObservationResponseSchema,
  buildOpenAiVisionObservationResponseFormat
} = require('../visionStructuredOutputSchema');

test('OpenAI Vision observation response format uses strict JSON schema', () => {
  const responseFormat = buildOpenAiVisionObservationResponseFormat();

  assert.equal(responseFormat.type, 'json_schema');
  assert.equal(responseFormat.json_schema.name, 'mold_master_vision_observation_v2');
  assert.equal(responseFormat.json_schema.strict, true);
  assert.equal(responseFormat.json_schema.schema, VISION_OBSERVATION_JSON_SCHEMA);
});

test('Vision observation schema requires every contract field', () => {
  assert.deepEqual(VISION_OBSERVATION_JSON_SCHEMA.required, [
    'contract_version',
    'image_kind',
    'normality_status',
    'observations',
    'candidates',
    'required_additional_views',
    'quality_concerns',
    'abstention_reason'
  ]);
  assert.equal(VISION_OBSERVATION_JSON_SCHEMA.additionalProperties, false);
  assert.deepEqual(
    VISION_OBSERVATION_JSON_SCHEMA.properties.contract_version.enum,
    ['vision-observation/v2']
  );
});

test('Vision observation schema constrains observations and Top-3 candidates', () => {
  const observationSchema = VISION_OBSERVATION_JSON_SCHEMA.properties.observations.items;
  const candidateSchema = VISION_OBSERVATION_JSON_SCHEMA.properties.candidates.items;

  assert.equal(VISION_OBSERVATION_JSON_SCHEMA.properties.observations.maxItems, 16);
  assert.equal(VISION_OBSERVATION_JSON_SCHEMA.properties.candidates.maxItems, 3);
  assert.deepEqual(observationSchema.required, [
    'observation_id',
    'category',
    'description',
    'region',
    'region_bbox',
    'confidence'
  ]);
  assert.deepEqual(observationSchema.properties.region_bbox.required, [
    'coordinate_system',
    'x',
    'y',
    'width',
    'height',
    'confidence'
  ]);
  assert.deepEqual(
    observationSchema.properties.region_bbox.properties.coordinate_system.enum,
    ['normalized_xywh']
  );
  assert.equal(observationSchema.properties.region_bbox.properties.x.minimum, 0);
  assert.equal(observationSchema.properties.region_bbox.properties.width.minimum, 0.001);
  assert.deepEqual(candidateSchema.required, [
    'defect_type',
    'confidence',
    'supporting_observation_ids',
    'contradicting_observation_ids'
  ]);
  assert.equal(candidateSchema.additionalProperties, false);
  assert.deepEqual(candidateSchema.properties.supporting_observation_ids.items.type, 'string');
});

test('Gemini Vision observation schema mirrors the v2 observer contract', () => {
  const schema = buildGeminiVisionObservationResponseSchema();

  assert.equal(schema.type, 'OBJECT');
  assert.deepEqual(schema.required, VISION_OBSERVATION_JSON_SCHEMA.required);
  assert.deepEqual(schema.propertyOrdering, VISION_OBSERVATION_JSON_SCHEMA.required);
  assert.deepEqual(schema.properties.contract_version.enum, ['vision-observation/v2']);
  assert.deepEqual(schema.properties.image_kind.enum, [
    'physical_product',
    'document_or_diagram',
    'unknown'
  ]);
  assert.equal(schema.properties.observations.type, 'ARRAY');
  assert.equal(schema.properties.observations.maxItems, '16');
  assert.equal(schema.properties.observations.items.properties.confidence.type, 'NUMBER');
  assert.equal(schema.properties.observations.items.properties.region_bbox.type, 'OBJECT');
  assert.deepEqual(
    schema.properties.observations.items.properties.region_bbox.properties.coordinate_system.enum,
    ['normalized_xywh']
  );
  assert.equal(schema.properties.candidates.type, 'ARRAY');
  assert.equal(schema.properties.candidates.maxItems, '3');
  assert.deepEqual(schema.properties.candidates.items.required, [
    'defect_type',
    'confidence',
    'supporting_observation_ids',
    'contradicting_observation_ids'
  ]);
});
