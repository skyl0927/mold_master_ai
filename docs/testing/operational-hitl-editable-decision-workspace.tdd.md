# Operational HITL Editable Decision Workspace TDD Evidence

## Source Plan

User goal continuation: keep progressing the operational HITL/data gate so verified human decisions can later be imported into Common Agent/Graph flows safely.

## User Journeys

- As a HITL reviewer, I want editable copies of decision templates in a dedicated workspace, so that I do not accidentally modify source templates.
- As an operator, I want the workspace manifest to preserve source paths, copy hashes, queue order, and verification commands, so that handoff and audit remain traceable.
- As a safety owner, I want workspace creation to fail closed when source templates are missing, so that partial or misleading decision files are not created.

## Task Report

| # | What is guaranteed | Test file or command | Test type | Result | Evidence |
|---|--------------------|----------------------|-----------|--------|----------|
| 1 | Valid input review packets produce three editable decision copies plus README and manifest artifacts. | `tests/operationalHitlEditableDecisionWorkspace.test.js` | unit | PASS | `npm run test:operational-hitl-editable-workspace` |
| 2 | Source templates are preserved and verification commands are rewritten to point to editable workspace copies. | `tests/operationalHitlEditableDecisionWorkspace.test.js` | unit | PASS | `npm run test:operational-hitl-editable-workspace` |
| 3 | Missing input packet or missing source templates fail closed without writing any file. | `tests/operationalHitlEditableDecisionWorkspace.test.js` | unit | PASS | `npm run test:operational-hitl-editable-workspace` |
| 4 | The CLI creates a real workspace from current artifacts. | `npm run operational:hitl:editable-workspace` | CLI smoke | PASS | output `ready_for_human_edit`, `workspaceFileCount=3`, `copiedSourceFileCount=3`, `totalDecisionInputsMissing=56` |

## RED/GREEN Evidence

- RED: `node --test tests\operationalHitlEditableDecisionWorkspace.test.js` failed with `MODULE_NOT_FOUND` for `../operationalHitlEditableDecisionWorkspace`.
- GREEN: `npm run test:operational-hitl-editable-workspace` passed 3/3 tests after implementing the workspace builder and CLI.

## Coverage And Gaps

Focused tests cover workspace manifest structure, source preservation, command rewriting, and fail-closed behavior. The generated editable files still require human decisions before `verify-decisions` can pass and before any manual import/Graph promotion gate can be considered.
