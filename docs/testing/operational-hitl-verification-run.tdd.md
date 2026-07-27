# Operational HITL Verification Run TDD Evidence

## Source Plan

User goal continuation: after CSV worktable import, close the next operational
gap by safely planning and optionally executing the HITL `verify-decisions`
commands only when editable preflight proves every decision file is complete.

## User Journeys

- As an operator, I want a dry-run verification plan, so that I can review the
  exact HITL verification commands before generating report artifacts.
- As a safety owner, I want execution blocked until `editable-preflight` is
  `ready_for_verification`, so that incomplete human decisions cannot be treated
  as validated data.
- As a system integrator, I want only allowlisted local `verify-decisions`
  scripts to run without a shell, so that `apply`, `approve`, Graph promotion,
  and arbitrary commands stay blocked.

## Task Report

| # | What is guaranteed | Test file or command | Test type | Result | Evidence |
|---|--------------------|----------------------|-----------|--------|----------|
| 1 | Ready preflight reports produce a dry-run plan for allowed verification commands without execution. | `tests/operationalHitlVerificationRun.test.js` | unit | PASS | `plan_ready`, `commandsPlanned=3`, `commandsExecuted=0` |
| 2 | Explicit execution calls only parsed allowed npm scripts with `--decisions` paths. | `tests/operationalHitlVerificationRun.test.js` | unit | PASS | `execute=true`, script `vision:hitl:verify-decisions` |
| 3 | Non-ready preflight blocks execution. | `tests/operationalHitlVerificationRun.test.js` | unit | PASS | `blocked_preflight_not_ready`, executor not called |
| 4 | Unsupported npm scripts and malformed commands fail closed. | `tests/operationalHitlVerificationRun.test.js` | unit | PASS | `invalid_verification_commands`, executor not called |
| 5 | Missing preflight evidence fails closed. | `tests/operationalHitlVerificationRun.test.js` | unit | PASS | `missing_evidence`, no commands |

## RED/GREEN Evidence

- RED: `node --test tests\operationalHitlVerificationRun.test.js` failed with
  `MODULE_NOT_FOUND` for `../operationalHitlVerificationRun`.
- GREEN: `npm run test:operational-hitl-verification-run` passed 5/5 tests after
  adding the verification run builder and CLI.

## Coverage And Gaps

Focused tests cover dry-run planning, explicit execution, fail-closed preflight
status, command allowlisting, malformed command blocking, and missing evidence.
Live execution is intentionally gated by `--execute`; current real artifacts are
not ready because the HITL decision files still contain pending rows.
