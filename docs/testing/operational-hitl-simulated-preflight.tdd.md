# Operational HITL Simulated Preflight TDD Evidence

## Source Plan

Derived from the active Mold Master AI operational plan: HITL decisions must be
entered by a human, but the software path after those decisions should be
pre-validated before the operator spends time filling the CSV.

## User Journeys

- As a quality HITL operator, I want recommended decisions to be applied only in
  memory and checked by the same editable preflight contract, so that I can see
  whether the next gate is likely to open after real CSV entry.
- As a system owner, I want the simulation to fail closed when recommendation
  roundtrip evidence is invalid, so that incomplete generated values cannot
  masquerade as human approval.
- As a Common Agent integrator, I want the report to expose verification
  commands only when the simulated editable files are preflight-ready.

## RED/GREEN Report

- RED: `node --test tests\operationalHitlSimulatedPreflight.test.js` failed
  with `Cannot find module '../operationalHitlSimulatedPreflight'`.
- GREEN: `node --test tests\operationalHitlSimulatedPreflight.test.js` passed
  after adding the in-memory simulated preflight builder.

## Test Specification

| # | What is guaranteed | Test file or command | Test type | Result | Evidence |
|---|--------------------|----------------------|-----------|--------|----------|
| 1 | Recommended HITL rows can be applied in memory and checked by editable preflight without filesystem writes | `tests/operationalHitlSimulatedPreflight.test.js` | Unit/contract | PASS | `node --test tests\operationalHitlSimulatedPreflight.test.js` |
| 2 | Roundtrip-invalid recommendations block simulated preflight and preserve missing field evidence | `tests/operationalHitlSimulatedPreflight.test.js` | Unit/contract | PASS | `blocked_roundtrip_invalid` assertion |
| 3 | Missing workspace/export/suggestion evidence fails closed with no files and no commands | `tests/operationalHitlSimulatedPreflight.test.js` | Unit/contract | PASS | `missing_evidence` assertion |

## Safety Notes

- The builder reuses `buildOperationalHitlDecisionWorktableImport()` with
  `apply=false`.
- Planned updates are copied into an in-memory JSON map only.
- The real editable workspace files are read but never written.
- The report sets `humanDecisionSubstitutionAllowed=false` and
  `inMemoryEditableApplyOnly=true`.
- This feature does not execute verification commands, import to Common Agent,
  promote Graph nodes, refresh Vision references, or train a model.
