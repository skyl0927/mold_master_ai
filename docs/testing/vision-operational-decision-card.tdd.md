# Vision Operational Decision Card TDD Evidence

Date: 2026-07-27

## Scope

This phase standardizes the Vision operational release result into a shared
decision card for the release gate service, Settings UI, CLI artifact output,
and imported legacy reports.

The card does not auto-promote or auto-rollback a model. It translates the
existing `promote_candidate`, `hold_shadow`, and `rollback_required` decisions
into an operator-facing action, target version snapshot, safety severity, and
human approval checklist.

## RED Evidence

- Commit `6e3cb4d` added failing contract tests for the missing card.
- `npm run test:contracts` failed with 5 targeted failures because
  `decisionCard` was undefined and imported malformed cards were not rejected.

## GREEN Evidence

- `evaluateVisionOperationalRelease()` now always emits a canonical
  `vision-operational-decision-card/v1` card.
- `parseVisionOperationalReleaseReport()` enriches legacy reports that do not
  have a card, but rejects cards whose status, action, target version, severity,
  or blocking reasons contradict the report.
- `SettingsModal` displays the same card title, summary, primary action,
  target snapshot, and operator steps used by the saved artifact.
- `build-vision-operational-release-report.js` prints the same card title and
  action as the generated JSON.

## Verification

- `npm run test:contracts`: 67 passed.
- `npx --no-install tsc --noEmit --pretty false`: passed.
- `npm run build`: passed. The command reported stale Browserslist/Baseline
  data warnings, but generated the CSS and browser bundles successfully.

## Operational Boundary

The card makes release decisions easier to review and harder to misapply, but
it is still a governance layer. Production promotion remains blocked until the
underlying Vision benchmark data, HITL approvals, Graph snapshot, calibration,
and latency evidence meet the release gate thresholds.
