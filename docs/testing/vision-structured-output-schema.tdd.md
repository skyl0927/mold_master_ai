# Vision Structured Output Schema TDD Evidence

## Source Plan

Derived from the Vision AI hardening plan: the model should behave as a visual observer, not a free-form diagnostician. The API request must therefore constrain the Vision response to the approved `vision-observation/v2` contract.

## User Journey

As a quality engineer, I want the OpenAI Vision response to be generated under a strict JSON schema, so that missing fields, invalid enum values, and malformed candidate evidence do not leak into GraphRAG diagnosis.

## Task Report

| # | What is guaranteed | Test file or command | Test type | Result | Evidence |
|---|--------------------|----------------------|-----------|--------|----------|
| 1 | OpenAI Vision requests use `response_format: json_schema` with `strict: true` | `tests/visionStructuredOutputSchema.test.js` | Unit | PASS | `npm run test:vision-structured-output` |
| 2 | The schema requires all v2 contract fields | `tests/visionStructuredOutputSchema.test.js` | Unit | PASS | required contract fields asserted |
| 3 | Observations and candidates are bounded and candidates require supporting/contradicting observation IDs | `tests/visionStructuredOutputSchema.test.js` | Unit | PASS | maxItems and required candidate evidence asserted |
| 4 | Gemini Vision requests receive an equivalent `responseSchema` observer contract | `tests/visionStructuredOutputSchema.test.js` | Unit | PASS | Gemini `OBJECT/ARRAY/STRING/NUMBER` schema asserted |
| 5 | Contract suite includes the structured output schema regression | `scripts/run-contract-tests.js` | Contract | PASS | `npm run test:contracts` |

## RED/GREEN Evidence

RED:

```text
node --test tests\visionStructuredOutputSchema.test.js
Error: Cannot find module '../visionStructuredOutputSchema'
```

GREEN:

```text
npm run test:vision-structured-output
pass 4
fail 0
```

## Implementation Notes

The OpenAI SDK installed in this workspace exposes `response_format` support for `json_schema`; the implementation replaces Vision-only `json_object` mode with a strict schema. Gemini receives an equivalent `responseSchema` built from the same v2 observer contract. The report-generation JSON call remains unchanged because this TDD task only covers blind Vision observation.

Official references checked:

- [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [OpenAI Images and Vision](https://developers.openai.com/api/docs/guides/images-vision)

## Known Gaps

This tightens both OpenAI and Gemini Vision response contracts. It does not validate live provider adherence without API keys; live validation remains part of the operational Vision benchmark.
