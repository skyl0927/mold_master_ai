# Vision Operational Operator Decision TDD Evidence

Date: 2026-07-27

## Scope

This phase adds a human operator decision record to the Vision operational
release report. The record captures the action taken from the decision card,
the exact target version snapshot, operator, comment, timestamp, and the fact
that the action was not auto-applied.

The feature is a HITL audit layer. It does not activate, promote, or roll back
any Vision model by itself.

## RED Evidence

- Commit `afdf5c5` added the operator decision contract tests first.
- `npm run test:contracts` failed at compile time because
  `attachVisionOperationalOperatorDecision` did not exist.

## GREEN Evidence

- `attachVisionOperationalOperatorDecision()` now rejects missing confirmation,
  empty operator/comment, mismatched actions, and mismatched target snapshots.
- `parseVisionOperationalReleaseReport()` preserves valid operator decisions
  but rejects stale records when the report decision, card status, target
  snapshot, report timestamp, or blocking reasons no longer match.
- `SettingsModal` now lets the operator record the card's exact action with a
  required operator/comment and stores the result back into the same report.
- The transition smoke test opens Settings, confirms the rollback action, and
  verifies that exported JSON contains `operatorDecision`.

## Verification

- `npm run test:contracts`: 70 passed.
- `npx --no-install tsc --noEmit --pretty false`: passed.
- `npm run test:electron:transition`: passed with `operatorDecision.action` as
  `restore_baseline_snapshot`, target `vision-model-2026.06`, `autoApplied` as
  `false`, and zero console errors. The command reported stale
  Browserslist/Baseline data warnings during build.

## Operational Boundary

This closes the local HITL release-decision audit path. The remaining
production gate is still data-dependent: real approved benchmark artifacts and
Common Agent/Graph release evidence must be attached before an operating
organization can use the card as a final promotion decision.
