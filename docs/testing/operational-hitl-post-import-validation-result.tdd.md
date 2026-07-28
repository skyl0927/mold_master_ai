# Operational HITL Post-Import Validation Result TDD Evidence

## Source Plan

User goal continuation: after HITL-approved data is packaged for Common Agent,
Mold Master AI must validate the imported knowledge by checking actual
Graph/RAG, Vision label, and label conflict responses before any release or
learning promotion.

## User Journeys

- As an operator, I want post-import validation results to fail closed when
  evidence is missing, so that missing Common Agent or Mold Master responses are
  never treated as approved.
- As a graph quality owner, I want Graph/RAG answers to prove approved graph
  grounding with citations or reasoning paths, so that generic LLM-only answers
  cannot pass.
- As a release owner, I want pipeline status to show awaiting, failed, and
  passed post-import validation states, so that the next operational action is
  visible without reading raw artifacts.

## Task Report

| # | What is guaranteed | Test file or command | Test type | Result | Evidence |
|---|--------------------|----------------------|-----------|--------|----------|
| 1 | Post-import validation only passes when all planned cases have approved evidence. | `tests/operationalHitlPostImportValidationResult.test.js` | unit | PASS | `npm run test:operational-hitl-post-import-validation-result` |
| 2 | Graph/RAG validation fails when graph-approved policy, citations/reasoning paths, or expected keywords are missing. | `tests/operationalHitlPostImportValidationResult.test.js` | unit | PASS | failed checks include `approved_graph_policy_missing`, `graph_citation_or_reasoning_path_missing`, `expected_keyword_missing` |
| 3 | Missing validation evidence stays in `awaiting_validation_evidence` and marks every case missing. | `tests/operationalHitlPostImportValidationResult.test.js` | unit | PASS | `missingEvidenceCases=3`, `readyForOperationalReleaseValidation=false` |
| 4 | Unsafe validation evidence with service writes is blocked and cannot promote Graph, Reference, or model learning. | `tests/operationalHitlPostImportValidationResult.test.js` | unit | PASS | `unsafe_validation_evidence`, `automaticServiceWritesAllowed=false` |
| 5 | Pipeline status surfaces post-import result states and routes failed/passed results to the correct next stage. | `tests/operationalHitlPipelineStatus.test.js` | unit | PASS | `execute_post_import_validation`, `fix_post_import_validation`, `operator_release_validation` |

## RED/GREEN Evidence

- RED: `node --test tests\operationalHitlPostImportValidationResult.test.js`
  failed with `MODULE_NOT_FOUND` for
  `../operationalHitlPostImportValidationResult`.
- GREEN: `npm run test:operational-hitl-post-import-validation-result` passed
  4/4 tests after adding the result builder and CLI.
- GREEN integration: `npm run test:operational-hitl-pipeline-status` passed
  12/12 tests after wiring the result artifact into pipeline status.

## Coverage And Gaps

Focused tests cover the artifact-only result gate, graph grounding checks,
vision label roundtrip checks, label conflict checks, missing evidence,
unsafe evidence, and pipeline routing. This still does not call the live Common
Agent or live Mold Master inference API. The remaining operational gap is to
generate a real `operational-hitl-post-import-validation-evidence/v1` artifact
from live Common Agent/Mold Master responses after manual HITL import.
