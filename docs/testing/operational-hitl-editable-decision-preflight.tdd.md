# Operational HITL Editable Decision Preflight TDD Evidence

## Source Plan

User goal continuation: continue implementing the current operational HITL plan until human decisions can be safely verified and handed off to Common Agent/Graph gates.

## User Journeys

- As a HITL reviewer, I want to know which editable decision files still contain `pending` actions, so that I do not run noisy verification too early.
- As an operator, I want invalid actions and missing required fields detected before `verify-decisions`, so that human input errors are corrected in the workspace first.
- As a safety owner, I want this check to be no-write and no-auto-verify, so that it cannot promote data or alter Common Agent/Graph state.

## Task Report

| # | What is guaranteed | Test file or command | Test type | Result | Evidence |
|---|--------------------|----------------------|-----------|--------|----------|
| 1 | Preflight summarizes pending, invalid action, and missing required field counts without running verification. | `tests/operationalHitlEditableDecisionPreflight.test.js` | unit | PASS | `npm run test:operational-hitl-editable-preflight` |
| 2 | Valid completed editable files expose their verification commands only through `verificationCommandsReady`. | `tests/operationalHitlEditableDecisionPreflight.test.js` | unit | PASS | `npm run test:operational-hitl-editable-preflight` |
| 3 | Missing workspace manifest evidence fails closed and points back to editable workspace generation. | `tests/operationalHitlEditableDecisionPreflight.test.js` | unit | PASS | `npm run test:operational-hitl-editable-preflight` |
| 4 | The CLI checks the latest real workspace and reports current pending state. | `npm run operational:hitl:editable-preflight` | CLI smoke | PASS | output `needs_human_input`, `totalDecisionItems=59`, `pendingDecisionCount=59`, `readyForVerificationFileCount=0` |

## RED/GREEN Evidence

- RED: `node --test tests\operationalHitlEditableDecisionPreflight.test.js` failed with `MODULE_NOT_FOUND` for `../operationalHitlEditableDecisionPreflight`.
- GREEN: `npm run test:operational-hitl-editable-preflight` passed 3/3 tests after implementing the preflight builder and CLI.

## Coverage And Gaps

Focused tests cover no-write policy, invalid action detection, required field checks, ready command exposure, and missing evidence behavior. This does not close the operational gate because current real editable files still contain 59 pending decisions and require human review.
