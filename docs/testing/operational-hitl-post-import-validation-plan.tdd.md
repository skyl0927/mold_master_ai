# Operational HITL Post-Import Validation Plan TDD Evidence

## Source Plan

User goal continuation: after Common Agent HITL import packaging, prepare the
post-import validation stage that proves Mold Master AI answers are grounded in
approved Graph/Common Agent evidence instead of unreviewed LLM-only guesses.

## User Journeys

- As an operator, I want a validation packet after Common Agent import, so that
  I know exactly which Mold Master AI Graph/RAG and Vision roundtrip checks must
  pass.
- As a safety owner, I want the validation packet to remain empty while the
  import package is blocked, so that unapproved data cannot become test or
  learning input by accident.
- As a Common Agent reviewer, I want each validation case to include expected
  keywords, request templates, acceptance criteria, and provenance, so that
  failures can be traced back to the approved HITL source artifact.

## Task Report

| # | What is guaranteed | Test file or command | Test type | Result | Evidence |
|---|--------------------|----------------------|-----------|--------|----------|
| 1 | Ready import packages generate Graph RAG, Vision label roundtrip, and label conflict validation cases. | `tests/operationalHitlPostImportValidationPlan.test.js` | unit | PASS | `npm run test:operational-hitl-post-import-validation-plan` |
| 2 | Graph RAG cases require `graph_approved_only` evidence policy and reasoning paths. | `tests/operationalHitlPostImportValidationPlan.test.js` | unit | PASS | expected filter `evidence_policy=graph_approved_only` |
| 3 | Blocked import packages produce no test cases and preserve fail-closed state. | `tests/operationalHitlPostImportValidationPlan.test.js` | unit | PASS | `blocked_import_package_not_ready`, `totalTestCases=0` |
| 4 | Missing import packages fail closed without service writes. | `tests/operationalHitlPostImportValidationPlan.test.js` | unit | PASS | `missing_import_package`, `automaticServiceWritesAllowed=false` |
| 5 | Current real artifacts remain blocked because HITL decisions are not verified yet. | `npm run operational:hitl:post-import-validation-plan` | CLI smoke | PASS | output `blocked_import_package_not_ready`, `totalTestCases=0` |

## RED/GREEN Evidence

- RED: `node --test tests\operationalHitlPostImportValidationPlan.test.js` failed
  with `MODULE_NOT_FOUND` for `../operationalHitlPostImportValidationPlan`.
- GREEN: `npm run test:operational-hitl-post-import-validation-plan` passed 3/3
  tests after adding the validation plan builder and CLI.

## Coverage And Gaps

Focused tests cover ready case generation, approved Graph evidence filters,
Vision label roundtrip metadata, label conflict resolution checks, blocked
import packages, and missing evidence. This does not execute live Common Agent
API calls; it prepares the post-import validation packet that should be used
after human HITL decisions are verified and manually imported.
