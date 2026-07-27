const VISION_OBSERVATION_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'contract_version',
    'image_kind',
    'normality_status',
    'observations',
    'candidates',
    'required_additional_views',
    'quality_concerns',
    'abstention_reason'
  ],
  properties: {
    contract_version: {
      type: 'string',
      enum: ['vision-observation/v2']
    },
    image_kind: {
      type: 'string',
      enum: ['physical_product', 'document_or_diagram', 'unknown']
    },
    normality_status: {
      type: 'string',
      enum: ['defect_visible', 'no_defect_visible', 'uncertain']
    },
    observations: {
      type: 'array',
      maxItems: 16,
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'observation_id',
          'category',
          'description',
          'region',
          'region_bbox',
          'confidence'
        ],
        properties: {
          observation_id: {
            type: 'string',
            minLength: 1
          },
          category: {
            type: 'string',
            enum: [
              'color',
              'boundary',
              'geometry',
              'surface',
              'location',
              'repetition',
              'orientation',
              'contrast',
              'other'
            ]
          },
          description: {
            type: 'string'
          },
          region: {
            type: 'string'
          },
          region_bbox: {
            type: 'object',
            additionalProperties: false,
            required: [
              'coordinate_system',
              'x',
              'y',
              'width',
              'height',
              'confidence'
            ],
            properties: {
              coordinate_system: {
                type: 'string',
                enum: ['normalized_xywh']
              },
              x: {
                type: 'number',
                minimum: 0,
                maximum: 1
              },
              y: {
                type: 'number',
                minimum: 0,
                maximum: 1
              },
              width: {
                type: 'number',
                minimum: 0.001,
                maximum: 1
              },
              height: {
                type: 'number',
                minimum: 0.001,
                maximum: 1
              },
              confidence: {
                type: 'number',
                minimum: 0,
                maximum: 1
              }
            }
          },
          confidence: {
            type: 'number',
            minimum: 0,
            maximum: 1
          }
        }
      }
    },
    candidates: {
      type: 'array',
      maxItems: 3,
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'defect_type',
          'confidence',
          'supporting_observation_ids',
          'contradicting_observation_ids'
        ],
        properties: {
          defect_type: {
            type: 'string'
          },
          confidence: {
            type: 'number',
            minimum: 0,
            maximum: 1
          },
          supporting_observation_ids: {
            type: 'array',
            maxItems: 16,
            items: {
              type: 'string'
            }
          },
          contradicting_observation_ids: {
            type: 'array',
            maxItems: 16,
            items: {
              type: 'string'
            }
          }
        }
      }
    },
    required_additional_views: {
      type: 'array',
      maxItems: 8,
      items: {
        type: 'string'
      }
    },
    quality_concerns: {
      type: 'array',
      maxItems: 8,
      items: {
        type: 'string'
      }
    },
    abstention_reason: {
      type: 'string'
    }
  }
};

const buildOpenAiVisionObservationResponseFormat = () => ({
  type: 'json_schema',
  json_schema: {
    name: 'mold_master_vision_observation_v2',
    strict: true,
    schema: VISION_OBSERVATION_JSON_SCHEMA
  }
});

const toGeminiType = type => ({
  object: 'OBJECT',
  array: 'ARRAY',
  string: 'STRING',
  number: 'NUMBER',
  integer: 'INTEGER',
  boolean: 'BOOLEAN'
})[type] || String(type || '').toUpperCase();

const toGeminiSchema = schema => {
  const result = {
    type: toGeminiType(schema.type)
  };
  if (schema.enum) result.enum = [...schema.enum];
  if (schema.required) result.required = [...schema.required];
  if (schema.minimum !== undefined) result.minimum = schema.minimum;
  if (schema.maximum !== undefined) result.maximum = schema.maximum;
  if (schema.minLength !== undefined) result.minLength = String(schema.minLength);
  if (schema.maxItems !== undefined) result.maxItems = String(schema.maxItems);
  if (schema.items) result.items = toGeminiSchema(schema.items);
  if (schema.properties) {
    result.properties = Object.fromEntries(
      Object.entries(schema.properties).map(([key, value]) => [key, toGeminiSchema(value)])
    );
  }
  if (schema.type === 'object') {
    result.propertyOrdering = schema.required
      ? [...schema.required]
      : Object.keys(schema.properties || {});
  }
  return result;
};

const buildGeminiVisionObservationResponseSchema = () =>
  toGeminiSchema(VISION_OBSERVATION_JSON_SCHEMA);

module.exports = {
  VISION_OBSERVATION_JSON_SCHEMA,
  buildGeminiVisionObservationResponseSchema,
  buildOpenAiVisionObservationResponseFormat
};
