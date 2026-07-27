# Operational HITL Dry-run Roundtrip TDD Evidence

## Source Plan

Derived from the active Mold Master AI development goal: collected Vision/Web
knowledge HITL rows must be reviewed by a human before Common Agent import,
Graph promotion, reference learning, or model training. While the human CSV
decisions are still pending, the software path after those decisions should be
pre-validated without mutating editable decision JSON.

## User Journeys

- As a quality HITL operator, I want recommendation-based simulated CSV rows to
  be validated against the same import contract, so that missing fields are
  found before I spend time filling the real CSV.
- As a system owner, I want the simulated CSV to be clearly marked as
  non-applicable evidence, so that dry-run validation cannot be mistaken for a
  real human approval.
- As a Common Agent integrator, I want missing evidence to fail closed, so that
  no Graph/RAG learning path proceeds from incomplete artifacts.

## RED/GREEN Report

- RED: `node --test tests\operationalHitlDryRunRoundtrip.test.js` failed with
  `Cannot find module '../operationalHitlDryRunRoundtrip'`.
- GREEN: `node --test tests\operationalHitlDryRunRoundtrip.test.js` passed
  after adding the simulation-only builder.

## Test Specification

| # | What is guaranteed | Test file or command | Test type | Result | Evidence |
|---|--------------------|----------------------|-----------|--------|----------|
| 1 | Suggested HITL actions can be converted to a simulation-only CSV and validated by the real worktable import dry-run without writes | `tests/operationalHitlDryRunRoundtrip.test.js` | Unit/contract | PASS | `node --test tests\operationalHitlDryRunRoundtrip.test.js` |
| 2 | Unsupported or under-filled recommended paths surface missing fields instead of being accepted | `tests/operationalHitlDryRunRoundtrip.test.js` | Unit/contract | PASS | `simulated_roundtrip_invalid` assertion |
| 3 | Missing workspace, worktable export, or suggestion evidence fails closed with no simulated CSV | `tests/operationalHitlDryRunRoundtrip.test.js` | Unit/contract | PASS | `missing_evidence` assertion |

## Safety Notes

- The generated CSV is named `*.simulation-only.csv` by the CLI.
- Policy sets `humanDecisionSubstitutionAllowed=false` and
  `allowGeneratedCsvApply=false`.
- The builder calls `buildOperationalHitlDecisionWorktableImport()` with
  `apply=false`, so editable decision JSON files are never written.
- This feature verifies recommendation/import compatibility only. It does not
  close HITL, approve Web cases, import into Common Agent, promote Graph nodes,
  refresh Vision references, or train a model.
